// partyHandler.js
// The real-time layer every "big screen + phones" party game shares.
//
// A party game is a clocked room of seats: a host opens it, phones join by
// the code the QR carries, the server walks the phases forward, spectators
// watch, a dropped player gets twenty seconds, and anyone may give up. None
// of that differs between ЧПОК and Meme Hype, so it lives here once. A game
// hands this factory its engine store and the few things that ARE its own:
// the moves a phone may make and when a phase has nothing left to wait for.
//
// Nothing is ever broadcast to a room as a whole: every seat gets its own
// payload from the engine, because what one phone holds must not reach
// another.
//
//   createPartyHandler({
//     type, modeId, label, ErrorClass,
//     store: { rooms, get, create, persist, remove },
//     settled(game)            -> true when the current phase may end now
//     moves: { name: (game, playerId, payload) => void }  // phone moves
//     details(game)            -> admin view extras
//   }) -> { register(io) }

const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload, idString,
} = require('../socket/roomSockets');
const roomChat = require('../social/roomChat');
const liveRoom = require('../socket/liveRoom');

const { AccessError } = access;

// A phone says so when it joins. A payload that says nothing leaves the
// seat's device alone, so a reconnect can never relabel a phone.
const deviceOf = (value) => {
  if (value === 'phone') return 'phone';
  if (value === 'screen') return 'screen';
  return null;
};

function createPartyHandler(spec) {
  const {
    type, modeId, label, ErrorClass, store, settled, moves = {}, details = () => ({}),
  } = spec;
  const ev = (name) => `${type}:${name}`;
  const KEYS = { room: `${type}Room`, player: `${type}PlayerId`, account: `${type}AccountId` };
  const DATA_KEYS = Object.values(KEYS);
  const timers = new Map();
  let ioRef = null;
  const fail = (message) => new ErrorClass(message);

  const clientState = (game, viewerId) => {
    const state = game.toClientJSON(viewerId);
    state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
    return liveRoom.decorate(state, game.roomCode);
  };

  // A watcher gets the payload built for nobody: every private thing a
  // seat holds is absent from it by construction.
  const spectatorState = (game) => ({ ...clientState(game, null), spectating: true });

  function broadcast(io, roomCode) {
    const game = store.get(roomCode);
    if (!game) return;
    store.persist(roomCode);
    game.players.forEach((p) => {
      if (p.socketId) io.to(p.socketId).emit(ev('state'), clientState(game, p.id));
    });
    liveRoom.sendToSpectators(io, roomCode, ev('state'), () => spectatorState(game));
    registry.observe(type, game);
  }

  function clearTimer(roomCode) {
    const t = timers.get(roomCode);
    if (t) {
      clearTimeout(t);
      timers.delete(roomCode);
    }
  }

  // One timer per room, re-armed after every change - a single chain, so a
  // phase can never end up with two timers or with none.
  function schedule(io, roomCode) {
    clearTimer(roomCode);
    const game = store.get(roomCode);
    if (!game || !game.phaseEndsAt || game.inLobby || game.isOver) return;
    const timer = setTimeout(() => {
      timers.delete(roomCode);
      const current = store.get(roomCode);
      if (!current) return;
      try {
        current.advance();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`${label} phase advance failed in ${roomCode}:`, err.message);
      }
      // A phase the clock just opened may already be settled (every card
      // was picked automatically, say).
      advanceIfSettled(io, roomCode); // eslint-disable-line no-use-before-define
    }, Math.max(200, game.phaseEndsAt - Date.now()));
    timer.unref?.();
    timers.set(roomCode, timer);
  }

  // Nobody left to wait for: end the phase now instead of burning the
  // clock. Loops, because closing one phase can open another that is
  // already settled.
  function advanceIfSettled(io, roomCode) {
    for (let guard = 0; guard < 4; guard += 1) {
      const game = store.get(roomCode);
      if (!game) return;
      if (game.inLobby || game.isOver || !settled(game)) break;
      game.advance();
    }
    broadcast(io, roomCode);
    schedule(io, roomCode);
  }

  const stageOf = (game) => {
    if (game.inLobby) return 'lobby';
    if (game.isOver) return 'finished';
    return 'active';
  };

  // One seat stops being a seat: the player gave up, walked out, or their
  // twenty seconds of grace ran out.
  function dropPlayer(io, roomCode, playerId, reason) {
    const game = store.get(roomCode);
    if (!game) return;
    const player = game.getPlayer(playerId);
    if (!player || player.exitReason) return;
    const { nickname } = player;
    liveRoom.disarmDrop(roomCode, playerId);
    liveRoom.markExit(game, playerId, reason);
    game.removePlayer(playerId);

    if (game.players.length === 0 || game.players.every((p) => p.left)) {
      clearTimer(roomCode);
      liveRoom.disarmRoom(roomCode);
      store.remove(roomCode, 'empty');
      liveRoom.closeSpectators(io, roomCode, type, 'empty');
      return;
    }
    io.to(roomCode).emit(ev('system'), {
      type: reason === 'surrender' ? 'PLAYER_SURRENDERED' : 'PLAYER_DROPPED',
      params: { name: nickname },
    });
    // The round may have been waiting only on the player who just left.
    advanceIfSettled(io, roomCode);
  }

  registry.register({
    type,
    rooms: store.rooms,
    get: (code) => store.get(code),
    summary(game) {
      const host = game.getPlayer(game.hostId);
      return {
        code: game.roomCode,
        gameType: type,
        modeId,
        hostId: game.hostId,
        hostNickname: host?.nickname || null,
        hostAccountId: host?.accountId || null,
        createdAt: game.createdAt,
        phase: game.phase,
        stage: stageOf(game),
        maxPlayers: game.maxSeats(),
        players: game.players.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          accountId: p.accountId || null,
          isGuest: !p.accountId,
          connected: !!p.connected,
          isHost: p.id === game.hostId,
          status: p.left ? 'left' : `${p.score} pts · ${p.device}`,
        })),
        details: { round: game.round, of: game.settings.rounds, ...details(game) },
      };
    },
    matchSummary(game) {
      const stage = stageOf(game);
      const host = game.getPlayer(game.hostId);
      const standings = game.results?.standings || [];
      return {
        gameType: type,
        roomCode: game.roomCode,
        modeId,
        hostAccountId: host?.accountId || null,
        stage,
        startedAt: game.startedAt,
        players: game.players.filter((p) => p.playing)
          .map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
        results: stage === 'finished'
          ? {
            winner: standings.find((r) => game.results.winnerIds.includes(r.playerId))?.nickname || null,
            players: game.players.filter((p) => p.playing).map((p) => {
              const index = standings.findIndex((r) => r.playerId === p.id);
              return {
                playerId: p.id,
                place: index >= 0 ? index + 1 : null,
                result: game.results.winnerIds.includes(p.id) ? 'win' : 'loss',
                score: p.score,
              };
            }),
          }
          : null,
      };
    },
    close(code, reason = 'closed') {
      const game = store.get(code);
      if (!game) return false;
      clearTimer(code);
      game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
        gameType: type, roomCode: code, reason, dataKeys: DATA_KEYS,
      }));
      liveRoom.disarmRoom(code);
      liveRoom.closeSpectators(ioRef, code, type, reason);
      store.remove(code, reason);
      return true;
    },
    kick(code, playerId, reason = 'kicked') {
      const game = store.get(code);
      const player = game?.getPlayer(playerId);
      if (!player) return false;
      notifyRemoved(ioRef, player.socketId, { gameType: type, roomCode: code, reason, dataKeys: DATA_KEYS });
      dropPlayer(ioRef, code, playerId, 'kicked');
      if (!store.get(code)) return true;
      broadcast(ioRef, code);
      schedule(ioRef, code);
      return true;
    },
  });

  function register(io) {
    ioRef = io;
    io.on('connection', (socket) => {
      const mine = () => {
        const roomCode = socket.data[KEYS.room];
        const playerId = socket.data[KEYS.player];
        const game = store.get(roomCode);
        if (!game || !game.getPlayer(playerId)) throw fail(`You are not in ${label}.`);
        return { game, roomCode, playerId };
      };

      const reply = (cb, err) => {
        const message = clientMessage(err, [ErrorClass]);
        socket.emit(ev('error'), { message });
        cb?.({ ok: false, error: message });
      };

      // A host or lobby action: apply it, then sync everyone.
      const run = (fn) => (payload, cb) => {
        try {
          const { game, roomCode, playerId } = mine();
          fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
          broadcast(io, roomCode);
          schedule(io, roomCode);
          cb?.({ ok: true });
        } catch (err) {
          reply(cb, err);
        }
      };

      // A phone move: apply it, then see whether the room can move on.
      const move = (fn) => (payload, cb) => {
        try {
          const { game, roomCode, playerId } = mine();
          fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
          advanceIfSettled(io, roomCode);
          cb?.({ ok: true });
        } catch (err) {
          reply(cb, err);
        }
      };

      const seat = (game, player, identity) => {
        socket.join(game.roomCode);
        socket.data[KEYS.room] = game.roomCode;
        socket.data[KEYS.player] = player.id;
        socket.data[KEYS.account] = identity.accountId;
      };

      socket.on(ev('create'), (payload, cb) => {
        try {
          const {
            nickname, playerId, token, guestKey, settings, device,
          } = payload || {};
          const identity = access.resolveIdentity({
            token, playerId, nickname, guestKey,
          });
          access.assertCanCreate(identity);
          modes.assertAvailable(modeId);
          const game = store.create(identity.playerId, settings, {
            accountId: identity.accountId, nickname: identity.nickname,
          });
          const player = game.addPlayer({ ...identity, socketId: socket.id, device: deviceOf(device) });
          seat(game, player, identity);
          store.persist(game.roomCode);
          cb?.({
            ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
          });
        } catch (err) {
          cb?.(errorPayload(err, [ErrorClass]));
        }
      });

      // The same event whether it came from a phone that scanned the QR
      // code or from a browser that typed the code in.
      socket.on(ev('join'), (payload, cb) => {
        try {
          const {
            roomCode, nickname, playerId, token, guestKey, device,
          } = payload || {};
          const game = store.get(roomCode);
          if (!game) throw fail('Room not found. Check the code and try again.');
          const identity = access.resolveIdentity({
            token, playerId, nickname, guestKey,
          });
          if (bans.isBanned(game.roomCode, identity.playerId)) {
            throw new AccessError('You were removed from this room.', 'BANNED');
          }
          const existing = game.getPlayer(identity.playerId);
          if (existing) {
            access.assertCanClaimSeat(existing, identity);
            // Out is out: the client turns this refusal into a place in
            // the gallery.
            liveRoom.assertSeatReclaimable(existing);
          } else if (!identity.nickname) {
            throw fail('Nickname is required.');
          }
          const player = game.addPlayer({ ...identity, socketId: socket.id, device: deviceOf(device) });
          // Back inside the twenty seconds: nothing happened at all.
          liveRoom.disarmDrop(game.roomCode, player.id);
          liveRoom.unwatch(socket);
          seat(game, player, identity);
          cb?.({
            ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
          });
          broadcast(io, game.roomCode);
          schedule(io, game.roomCode);
          io.to(game.roomCode).emit(ev('system'), {
            type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED', params: { name: player.nickname },
          });
        } catch (err) {
          cb?.(errorPayload(err, [ErrorClass]));
        }
      });

      socket.on(ev('settings'), run((game, playerId, p) => game.updateSettings(playerId, p.settings || {})));
      socket.on(ev('ready'), run((game, playerId, p) => game.setReady(playerId, p.ready)));
      // A big screen can be the table rather than a player at it.
      socket.on(ev('playing'), run((game, playerId, p) => game.setPlaying(playerId, p.playing)));

      socket.on(ev('start'), run((game, playerId) => {
        game.assertHost(playerId);
        access.assertCanStart(socket.data[KEYS.account]);
        modes.assertAvailable(modeId);
        game.start(playerId);
      }));

      socket.on(ev('restart'), run((game, playerId, p) => {
        game.assertHost(playerId);
        access.assertCanStart(socket.data[KEYS.account]);
        clearTimer(game.roomCode);
        game.restart(playerId);
        if (p.startNow) {
          modes.assertAvailable(modeId);
          game.start(playerId);
        }
      }));

      // The host may cut a phase short rather than wait out the clock.
      socket.on(ev('skip'), run((game, playerId) => {
        game.assertHost(playerId);
        if (game.inLobby || game.isOver) throw fail('Nothing to skip.');
        game.advance();
      }));

      Object.entries(moves).forEach(([name, fn]) => {
        socket.on(ev(name), move(fn));
      });

      socket.on(ev('chat'), ({ text, emote } = {}) => {
        const game = store.get(socket.data[KEYS.room]);
        const player = game?.getPlayer(socket.data[KEYS.player]);
        if (!player) return;
        const message = roomChat.prepareRoomMessage({
          text, emote: idString(emote, 80), sender: player, players: game.players,
        });
        if (!message) return;
        io.to(game.roomCode).emit(ev('chat'), message);
        roomChat.notifyMentions(message, {
          players: game.players, context: { kind: 'room', gameType: type, roomCode: game.roomCode },
        });
      });

      // --- watching -----------------------------------------------------

      socket.on(ev('spectate'), (payload, cb) => {
        try {
          const {
            roomCode, nickname, playerId, token, guestKey,
          } = payload || {};
          const game = store.get(roomCode);
          if (!game) throw fail('Room not found. Check the code and try again.');
          const identity = access.resolveIdentity({
            token, playerId, nickname, guestKey,
          });
          if (bans.isBanned(game.roomCode, identity.playerId)) {
            throw new AccessError('You were removed from this room.', 'BANNED');
          }
          const own = game.getPlayer(identity.playerId);
          if (own && !own.left) throw fail('You are playing in this room.');
          const viewer = liveRoom.watch(socket, game.roomCode, type, identity);
          if (!viewer) throw fail('This room has too many spectators already.');
          cb?.({
            ok: true, roomCode: game.roomCode, spectator: true, state: spectatorState(game),
          });
          broadcast(io, game.roomCode);
        } catch (err) {
          cb?.(errorPayload(err, [ErrorClass]));
        }
      });

      socket.on(ev('unspectate'), () => {
        const watched = liveRoom.unwatch(socket);
        if (watched) broadcast(io, watched);
      });

      // --- giving up ----------------------------------------------------

      socket.on(ev('surrender'), (payload, cb) => {
        try {
          const { game, roomCode, playerId } = mine();
          const player = game.getPlayer(playerId);
          if (player.exitReason) throw fail('You have already left this game.');
          const who = {
            playerId, nickname: player.nickname, accountId: player.accountId, avatarUrl: player.avatarUrl,
          };
          dropPlayer(io, roomCode, playerId, 'surrender');
          if (store.get(roomCode)) {
            liveRoom.watch(socket, roomCode, type, who);
            broadcast(io, roomCode);
          }
          cb?.({ ok: true });
        } catch (err) {
          reply(cb, err);
        }
      });

      socket.on(ev('leave'), () => {
        const roomCode = socket.data[KEYS.room];
        const playerId = socket.data[KEYS.player];
        DATA_KEYS.forEach((k) => { socket.data[k] = null; });
        liveRoom.unwatch(socket);
        if (!store.get(roomCode)) return;
        socket.leave(roomCode);
        dropPlayer(io, roomCode, playerId, 'left');
      });

      socket.on('disconnect', () => {
        const roomCode = socket.data[KEYS.room];
        const playerId = socket.data[KEYS.player];
        const watched = liveRoom.unwatch(socket);
        if (watched) broadcast(io, watched);
        const game = store.get(roomCode);
        if (!game || !playerId) return;
        const player = game.getPlayer(playerId);
        if (!player || player.exitReason) return;
        // A socket that closed AFTER its owner had already reconnected is
        // stale: the seat now answers to a different socket.
        if (player.socketId !== socket.id) return;
        game.setConnected(playerId, false);
        // A phone that dropped out of signal for a moment is not a player
        // leaving the party: twenty seconds, counted down on the big screen.
        liveRoom.armDrop(roomCode, playerId, () => dropPlayer(io, roomCode, playerId, 'timeout'));
        broadcast(io, roomCode);
        schedule(io, roomCode);
      });
    });
  }

  return { register, broadcast, schedule };
}

module.exports = { createPartyHandler, deviceOf };
