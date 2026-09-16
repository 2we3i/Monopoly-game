// chpokHandler.js
// Real-time layer for online ЧПОК: one big screen, a phone per player.
//
// Two things shape it. First, like Mafia, nothing is broadcast to the
// room as a whole while a round is live - each player gets their own
// payload, because an answer must not reach another phone before voting
// opens and authorship must not reach anyone before the votes are in.
// Second, the room runs on a clock: the server, never a phone, is what
// closes the answers, opens the vote, counts it and starts the next round
// - and it does so the moment there is nobody left to wait for, rather
// than making everyone sit out the rest of the timer.
//
// A phone can say exactly two things per round, once each.

const roomManager = require('../game/RoomManager');
const {
  ChpokError, PHASES, MAX_PLAYERS, MIN_PLAYERS,
} = require('../chpok/ChpokGame');
const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload, idString,
} = require('./roomSockets');
const roomChat = require('../social/roomChat');
const liveRoom = require('./liveRoom');

const { AccessError } = access;
const MODE_ID = 'chpok.party';
const timers = new Map();
let ioRef = null;

function sendError(socket, message) {
  socket.emit('chpok:error', { message });
}

function clientState(game, viewerId) {
  const state = game.toClientJSON(viewerId);
  state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
  return liveRoom.decorate(state, game.roomCode);
}

// A watcher sees the room as the big screen does minus a seat: the theme,
// who has answered, the cards during the vote and the full result after
// it - but never which card is theirs, because none of them is.
function spectatorState(game) {
  const state = clientState(game, null);
  state.spectating = true;
  return state;
}

function broadcast(io, roomCode) {
  const game = roomManager.getChpokRoom(roomCode);
  if (!game) return;
  roomManager.persistChpok(roomCode);
  game.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('chpok:state', clientState(game, p.id));
  });
  liveRoom.sendToSpectators(io, roomCode, 'chpok:state', () => spectatorState(game));
  registry.observe('chpok', game);
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
  const game = roomManager.getChpokRoom(roomCode);
  if (!game || !game.phaseEndsAt || game.phase === PHASES.LOBBY || game.phase === PHASES.GAME_OVER) return;
  const timer = setTimeout(() => {
    timers.delete(roomCode);
    const current = roomManager.getChpokRoom(roomCode);
    if (!current) return;
    try {
      current.advance();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`ЧПОК phase advance failed in ${roomCode}:`, err.message);
    }
    broadcast(io, roomCode);
    schedule(io, roomCode);
  }, Math.max(200, game.phaseEndsAt - Date.now()));
  timers.set(roomCode, timer);
}

// Nobody left to wait for: end the phase now instead of burning the clock.
// Loops, because closing the answers can open a vote that is already
// settled (one card, or a table of one).
function advanceIfSettled(io, roomCode) {
  for (let guard = 0; guard < 4; guard += 1) {
    const game = roomManager.getChpokRoom(roomCode);
    if (!game) return;
    const settled = (game.phase === PHASES.ANSWER && game.everyoneAnswered())
      || (game.phase === PHASES.VOTE && game.everyoneVoted());
    if (!settled) break;
    game.advance();
  }
  broadcast(io, roomCode);
  schedule(io, roomCode);
}

function stageOf(phase) {
  if (phase === PHASES.LOBBY) return 'lobby';
  if (phase === PHASES.GAME_OVER) return 'finished';
  return 'active';
}

const DATA_KEYS = ['chpokRoom', 'chpokPlayerId', 'chpokAccountId'];

// One seat stops being a seat: the player gave up, walked out, or their
// twenty seconds of grace ran out.
function dropPlayer(io, roomCode, playerId, reason) {
  const game = roomManager.getChpokRoom(roomCode);
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
    roomManager.deleteChpokRoom(roomCode, 'empty');
    liveRoom.closeSpectators(io, roomCode, 'chpok', 'empty');
    return;
  }
  io.to(roomCode).emit('chpok:system', {
    type: reason === 'surrender' ? 'PLAYER_SURRENDERED' : 'PLAYER_DROPPED',
    params: { name: nickname },
  });
  // The round may have been waiting only on the player who just left.
  advanceIfSettled(io, roomCode);
  broadcast(io, roomCode);
  schedule(io, roomCode);
}

registry.register({
  type: 'chpok',
  rooms: () => roomManager.chpokRooms.values(),
  get: (code) => roomManager.getChpokRoom(code),
  summary(game) {
    const host = game.getPlayer(game.hostId);
    return {
      code: game.roomCode,
      gameType: 'chpok',
      modeId: MODE_ID,
      hostId: game.hostId,
      hostNickname: host?.nickname || null,
      hostAccountId: host?.accountId || null,
      createdAt: game.createdAt,
      phase: game.phase,
      stage: stageOf(game.phase),
      maxPlayers: MAX_PLAYERS,
      players: game.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        accountId: p.accountId || null,
        isGuest: !p.accountId,
        connected: !!p.connected,
        isHost: p.id === game.hostId,
        status: p.left ? 'left' : `${p.score} pts · ${p.device}`,
      })),
      details: { round: game.round, of: game.settings.rounds, box: game.settings.box },
    };
  },
  matchSummary(game) {
    const stage = stageOf(game.phase);
    const host = game.getPlayer(game.hostId);
    const standings = game.results?.standings || [];
    return {
      gameType: 'chpok',
      roomCode: game.roomCode,
      modeId: MODE_ID,
      hostAccountId: host?.accountId || null,
      stage,
      startedAt: game.startedAt,
      players: game.players.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: standings.find((r) => game.results.winnerIds.includes(r.playerId))?.nickname || null,
          players: game.players.map((p) => {
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
    const game = roomManager.getChpokRoom(code);
    if (!game) return false;
    clearTimer(code);
    game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
      gameType: 'chpok', roomCode: code, reason, dataKeys: DATA_KEYS,
    }));
    liveRoom.disarmRoom(code);
    liveRoom.closeSpectators(ioRef, code, 'chpok', reason);
    roomManager.deleteChpokRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const game = roomManager.getChpokRoom(code);
    const player = game?.getPlayer(playerId);
    if (!player) return false;
    notifyRemoved(ioRef, player.socketId, { gameType: 'chpok', roomCode: code, reason, dataKeys: DATA_KEYS });
    dropPlayer(ioRef, code, playerId, 'kicked');
    if (!roomManager.getChpokRoom(code)) return true;
    broadcast(ioRef, code);
    schedule(ioRef, code);
    return true;
  },
});

// A phone says so when it joins. A payload that says nothing leaves the
// seat's device alone, so a reconnect can never relabel a phone.
const deviceOf = (value) => {
  if (value === 'phone') return 'phone';
  if (value === 'screen') return 'screen';
  return null;
};

function registerChpokHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    const run = (fn) => (payload, cb) => {
      const roomCode = socket.data.chpokRoom;
      const playerId = socket.data.chpokPlayerId;
      try {
        const game = roomManager.getChpokRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new ChpokError('You are not in a ЧПОК room.');
        fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
        broadcast(io, roomCode);
        schedule(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [ChpokError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    };

    const seat = (game, player, identity) => {
      socket.join(game.roomCode);
      socket.data.chpokRoom = game.roomCode;
      socket.data.chpokPlayerId = player.id;
      socket.data.chpokAccountId = identity.accountId;
    };

    socket.on('chpok:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, token, guestKey, settings, device,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        modes.assertAvailable(MODE_ID);
        const game = roomManager.createChpokRoom(identity.playerId, settings, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = game.addPlayer({ ...identity, socketId: socket.id, device: deviceOf(device) });
        seat(game, player, identity);
        roomManager.persistChpok(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
      } catch (err) {
        cb?.(errorPayload(err, [ChpokError]));
      }
    });

    // The same event whether it came from a phone that scanned the QR code
    // or from a browser that typed the code in: what differs is `device`,
    // which only decides how the room is drawn.
    socket.on('chpok:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey, device,
        } = payload || {};
        const game = roomManager.getChpokRoom(roomCode);
        if (!game) throw new ChpokError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const existing = game.getPlayer(identity.playerId);
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
          // Out is out: a seat somebody gave up cannot be taken back, and
          // the client turns this refusal into a place in the gallery.
          liveRoom.assertSeatReclaimable(existing);
        } else if (!identity.nickname) {
          throw new ChpokError('Nickname is required.');
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
        io.to(game.roomCode).emit('chpok:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED', params: { name: player.nickname },
        });
      } catch (err) {
        cb?.(errorPayload(err, [ChpokError]));
      }
    });

    socket.on('chpok:settings', run((game, playerId, p) => game.updateSettings(playerId, p.settings || {})));
    socket.on('chpok:ready', run((game, playerId, p) => game.setReady(playerId, p.ready)));
    // A big screen can be the table rather than a player at it.
    socket.on('chpok:playing', run((game, playerId, p) => game.setPlaying(playerId, p.playing)));

    socket.on('chpok:start', run((game, playerId) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.chpokAccountId);
      modes.assertAvailable(MODE_ID);
      game.start(playerId);
    }));

    socket.on('chpok:restart', run((game, playerId, p) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.chpokAccountId);
      clearTimer(game.roomCode);
      game.restart(playerId);
      if (p.startNow) {
        modes.assertAvailable(MODE_ID);
        game.start(playerId);
      }
    }));

    // --- the two things a phone may say --------------------------------

    socket.on('chpok:answer', (payload, cb) => {
      const roomCode = socket.data.chpokRoom;
      const playerId = socket.data.chpokPlayerId;
      try {
        const game = roomManager.getChpokRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new ChpokError('You are not in a ЧПОК room.');
        game.submitAnswer(playerId, payload?.text);
        broadcast(io, roomCode);
        // The round may have been waiting only on this answer.
        advanceIfSettled(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [ChpokError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('chpok:vote', (payload, cb) => {
      const roomCode = socket.data.chpokRoom;
      const playerId = socket.data.chpokPlayerId;
      try {
        const game = roomManager.getChpokRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new ChpokError('You are not in a ЧПОК room.');
        game.castVote(playerId, idString(payload?.answerId, 40));
        broadcast(io, roomCode);
        advanceIfSettled(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [ChpokError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    // The host may cut a phase short rather than wait out the clock.
    socket.on('chpok:skip', run((game, playerId) => {
      game.assertHost(playerId);
      if (game.phase === PHASES.LOBBY || game.phase === PHASES.GAME_OVER) throw new ChpokError('Nothing to skip.');
      game.advance();
    }));

    socket.on('chpok:chat', ({ text, emote } = {}) => {
      const game = roomManager.getChpokRoom(socket.data.chpokRoom);
      const player = game?.getPlayer(socket.data.chpokPlayerId);
      if (!player) return;
      const message = roomChat.prepareRoomMessage({
        text, emote: idString(emote, 80), sender: player, players: game.players,
      });
      if (!message) return;
      io.to(game.roomCode).emit('chpok:chat', message);
      roomChat.notifyMentions(message, {
        players: game.players, context: { kind: 'room', gameType: 'chpok', roomCode: game.roomCode },
      });
    });

    // --- watching -------------------------------------------------------

    socket.on('chpok:spectate', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getChpokRoom(roomCode);
        if (!game) throw new ChpokError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const own = game.getPlayer(identity.playerId);
        if (own && !own.left) throw new ChpokError('You are playing in this room.');
        const viewer = liveRoom.watch(socket, game.roomCode, 'chpok', identity);
        if (!viewer) throw new ChpokError('This room has too many spectators already.');
        cb?.({ ok: true, roomCode: game.roomCode, spectator: true, state: spectatorState(game) });
        broadcast(io, game.roomCode);
      } catch (err) {
        cb?.(errorPayload(err, [ChpokError]));
      }
    });

    socket.on('chpok:unspectate', () => {
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
    });

    // --- giving up ------------------------------------------------------

    socket.on('chpok:surrender', (payload, cb) => {
      const roomCode = socket.data.chpokRoom;
      const playerId = socket.data.chpokPlayerId;
      try {
        const game = roomManager.getChpokRoom(roomCode);
        const player = game?.getPlayer(playerId);
        if (!game || !player) throw new ChpokError('You are not in a ЧПОК room.');
        if (player.exitReason) throw new ChpokError('You have already left this game.');
        const who = {
          playerId, nickname: player.nickname, accountId: player.accountId, avatarUrl: player.avatarUrl,
        };
        dropPlayer(io, roomCode, playerId, 'surrender');
        if (roomManager.getChpokRoom(roomCode)) {
          liveRoom.watch(socket, roomCode, 'chpok', who);
          broadcast(io, roomCode);
        }
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [ChpokError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('chpok:leave', () => {
      const roomCode = socket.data.chpokRoom;
      const playerId = socket.data.chpokPlayerId;
      DATA_KEYS.forEach((k) => { socket.data[k] = null; });
      liveRoom.unwatch(socket);
      const game = roomManager.getChpokRoom(roomCode);
      if (!game) return;
      socket.leave(roomCode);
      dropPlayer(io, roomCode, playerId, 'left');
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.chpokRoom;
      const playerId = socket.data.chpokPlayerId;
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
      const game = roomManager.getChpokRoom(roomCode);
      if (!game || !playerId) return;
      const player = game.getPlayer(playerId);
      if (!player || player.exitReason) return;
      // A socket that closed AFTER its owner had already reconnected is
      // stale: the seat now answers to a different socket, and treating
      // this close as a disconnect would knock a player who is sitting
      // right there offline - and start a countdown on them.
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

module.exports = {
  registerChpokHandlers, MIN_PLAYERS, MAX_PLAYERS, MODE_ID,
};
