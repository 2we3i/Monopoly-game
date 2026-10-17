// citadelsHandler.js
// Real-time layer for Citadels.
//
// Like Mafia, every player is sent their own payload (hands, draft pool
// and secret targets are per-player), and the server's clock moves the
// game along when a pick or a turn runs out of time. Clients send only
// intentions - "take gold", "build card c17" - and the engine decides.

const roomManager = require('../game/RoomManager');
const { CitadelsError, PHASES, MAX_PLAYERS } = require('../citadels/CitadelsGame');
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
const MODE_ID = 'citadels.classic';
const timers = new Map();
let ioRef = null;

function sendError(socket, message) {
  socket.emit('citadels:error', { message });
}

// A player's cosmetics are looks only: attached to the payload after the
// engine has built it, so they can never influence the game itself.
function clientState(game, viewerId) {
  const state = game.toClientJSON(viewerId);
  state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
  return liveRoom.decorate(state, game.roomCode);
}

// Watchers see the table as a player with no hand does: every city, the
// crown and the log, but nobody's cards and nobody's chosen role.
function spectatorState(game) {
  const state = clientState(game, null);
  state.spectating = true;
  return state;
}

function broadcast(io, roomCode) {
  const game = roomManager.getCitadelsRoom(roomCode);
  if (!game) return;
  roomManager.persistCitadels(roomCode);
  game.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('citadels:state', clientState(game, p.id));
  });
  liveRoom.sendToSpectators(io, roomCode, 'citadels:state', () => spectatorState(game));
  registry.observe('citadels', game);
}

function clearTimer(roomCode) {
  const t = timers.get(roomCode);
  if (t) {
    clearTimeout(t);
    timers.delete(roomCode);
  }
}

// One timer per room, re-armed after every change: the deadline moves
// whenever the pick or the turn passes to someone else.
function schedule(io, roomCode) {
  clearTimer(roomCode);
  const game = roomManager.getCitadelsRoom(roomCode);
  if (!game || !game.phaseEndsAt || game.phase === PHASES.LOBBY || game.phase === PHASES.GAME_OVER) return;
  const delay = Math.max(200, game.phaseEndsAt - Date.now());
  timers.set(roomCode, setTimeout(() => {
    timers.delete(roomCode);
    const current = roomManager.getCitadelsRoom(roomCode);
    if (!current) return;
    try {
      current.onTimeout();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Citadels timeout handling failed in ${roomCode}:`, err.message);
    }
    broadcast(io, roomCode);
    schedule(io, roomCode);
  }, delay));
}

function stageOf(phase) {
  if (phase === PHASES.LOBBY) return 'lobby';
  if (phase === PHASES.GAME_OVER) return 'finished';
  return 'active';
}

const DATA_KEYS = ['citadelsRoom', 'citadelsPlayerId', 'citadelsAccountId'];

// One seat stops being a seat: the player gave up, walked out, or their
// twenty seconds of grace ran out. The engine turns that into whatever it
// means at this table; the reason is kept, so everyone can be told which
// of the three it was.
function dropPlayer(io, roomCode, playerId, reason) {
  const game = roomManager.getCitadelsRoom(roomCode);
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
    roomManager.deleteCitadelsRoom(roomCode, 'empty');
    liveRoom.closeSpectators(io, roomCode, 'citadels', 'empty');
    return;
  }
  io.to(roomCode).emit('citadels:system', {
    type: reason === 'surrender' ? 'PLAYER_SURRENDERED' : 'PLAYER_DROPPED',
    params: { name: nickname },
  });
  broadcast(io, roomCode);
  schedule(io, roomCode);
}

registry.register({
  type: 'citadels',
  rooms: () => roomManager.citadelsRooms.values(),
  get: (code) => roomManager.getCitadelsRoom(code),
  summary(game) {
    const host = game.getPlayer(game.hostId);
    return {
      code: game.roomCode,
      gameType: 'citadels',
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
        status: p.left ? 'left' : `${p.city.length} districts · ${p.gold} gold`,
      })),
      details: { round: game.round, citySize: game.settings.citySize },
    };
  },
  matchSummary(game) {
    const stage = stageOf(game.phase);
    const host = game.getPlayer(game.hostId);
    const standings = game.results?.standings || [];
    return {
      gameType: 'citadels',
      roomCode: game.roomCode,
      modeId: MODE_ID,
      hostAccountId: host?.accountId || null,
      stage,
      startedAt: game.startedAt,
      players: game.players.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: standings[0]?.nickname || null,
          players: game.players.map((p) => {
            const row = standings.find((s) => s.playerId === p.id);
            const place = standings.findIndex((s) => s.playerId === p.id);
            return {
              playerId: p.id,
              place: place >= 0 ? place + 1 : null,
              result: p.id === game.results.winnerId ? 'win' : 'loss',
              role: p.role,
              score: row?.total ?? 0,
              buildings: p.city.length,
              goldEarned: p.stats.goldEarned,
              extra: { roles: p.stats.roles },
            };
          }),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const game = roomManager.getCitadelsRoom(code);
    if (!game) return false;
    clearTimer(code);
    game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
      gameType: 'citadels', roomCode: code, reason, dataKeys: DATA_KEYS,
    }));
    liveRoom.disarmRoom(code);
    liveRoom.closeSpectators(ioRef, code, 'citadels', reason);
    roomManager.deleteCitadelsRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const game = roomManager.getCitadelsRoom(code);
    const player = game?.getPlayer(playerId);
    if (!player) return false;
    notifyRemoved(ioRef, player.socketId, { gameType: 'citadels', roomCode: code, reason, dataKeys: DATA_KEYS });
    dropPlayer(ioRef, code, playerId, 'kicked');
    if (!roomManager.getCitadelsRoom(code)) return true;
    broadcast(ioRef, code);
    schedule(ioRef, code);
    return true;
  },
});

function registerCitadelsHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    // Runs one in-game action for the caller's own seat, then syncs.
    const act = (fn) => (payload, cb) => {
      const roomCode = socket.data.citadelsRoom;
      const playerId = socket.data.citadelsPlayerId;
      try {
        const game = roomManager.getCitadelsRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new CitadelsError('You are not in a Citadels room.');
        fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
        broadcast(io, roomCode);
        schedule(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [CitadelsError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    };

    socket.on('citadels:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, token, guestKey, settings,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        modes.assertAvailable(MODE_ID, identity.accountId);
        const game = roomManager.createCitadelsRoom(identity.playerId, settings, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        // Back inside the twenty seconds: nothing happened at all.
        liveRoom.disarmDrop(game.roomCode, player.id);
        liveRoom.unwatch(socket);
        socket.join(game.roomCode);
        socket.data.citadelsRoom = game.roomCode;
        socket.data.citadelsPlayerId = player.id;
        socket.data.citadelsAccountId = identity.accountId;
        roomManager.persistCitadels(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
      } catch (err) {
        cb?.(errorPayload(err, [CitadelsError]));
      }
    });

    socket.on('citadels:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getCitadelsRoom(roomCode);
        if (!game) throw new CitadelsError('Room not found. Check the code and try again.');
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
          throw new CitadelsError('Nickname is required.');
        }
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        // Back inside the grace period: nothing happened at all. A phone
        // that locked its screen or switched apps for a moment comes back
        // through here, and must not be dropped twenty seconds later.
        liveRoom.disarmDrop(game.roomCode, player.id);
        liveRoom.unwatch(socket);
        socket.join(game.roomCode);
        socket.data.citadelsRoom = game.roomCode;
        socket.data.citadelsPlayerId = player.id;
        socket.data.citadelsAccountId = identity.accountId;
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
        broadcast(io, game.roomCode);
        schedule(io, game.roomCode);
        io.to(game.roomCode).emit('citadels:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED', params: { name: player.nickname },
        });
      } catch (err) {
        cb?.(errorPayload(err, [CitadelsError]));
      }
    });

    socket.on('citadels:settings', act((game, playerId, p) => game.updateSettings(playerId, p.settings || {})));
    socket.on('citadels:ready', act((game, playerId, p) => game.setReady(playerId, p.ready)));

    socket.on('citadels:start', act((game, playerId) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.citadelsAccountId);
      modes.assertAvailable(MODE_ID, socket.data.citadelsAccountId);
      game.start(playerId);
    }));

    socket.on('citadels:restart', act((game, playerId, p) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.citadelsAccountId);
      game.restart(playerId);
      if (p.startNow) {
        modes.assertAvailable(MODE_ID, socket.data.citadelsAccountId);
        game.start(playerId);
      }
    }));

    socket.on('citadels:pick', act((game, playerId, p) => game.pickRole(playerId, idString(p.roleId, 30))));
    socket.on('citadels:gold', act((game, playerId) => game.takeGold(playerId)));
    socket.on('citadels:draw', act((game, playerId) => game.drawForResources(playerId)));
    socket.on('citadels:keep', act((game, playerId, p) => game.keepCard(playerId, idString(p.cardUid, 20))));
    socket.on('citadels:income', act((game, playerId) => game.collectIncome(playerId)));
    socket.on('citadels:build', act((game, playerId, p) => game.build(playerId, idString(p.cardUid, 20))));
    socket.on('citadels:endTurn', act((game, playerId) => game.endTurn(playerId)));

    socket.on('citadels:ability', act((game, playerId, p) => game.useAbility(playerId, {
      targetRole: idString(p.targetRole, 30),
      mode: idString(p.mode, 10),
      targetPlayerId: idString(p.targetPlayerId),
      cardUid: idString(p.cardUid, 20),
      cardUids: Array.isArray(p.cardUids) ? p.cardUids.slice(0, 20).map((u) => idString(u, 20)).filter(Boolean) : undefined,
    })));

    socket.on('citadels:useDistrict', act((game, playerId, p) => game.useDistrict(playerId, {
      districtId: idString(p.districtId, 30),
      cardUid: idString(p.cardUid, 20),
    })));

    socket.on('citadels:chat', ({ text, emote } = {}) => {
      const game = roomManager.getCitadelsRoom(socket.data.citadelsRoom);
      const player = game?.getPlayer(socket.data.citadelsPlayerId);
      if (!player) return;
      const message = roomChat.prepareRoomMessage({
        text, emote: idString(emote, 80), sender: player, players: game.players,
      });
      if (!message) return;
      io.to(game.roomCode).emit('citadels:chat', message);
      roomChat.notifyMentions(message, { players: game.players, context: { kind: 'room', gameType: 'citadels', roomCode: game.roomCode } });
    });

    // --- watching -----------------------------------------------------

    // Anyone may watch a room without taking a seat, before or after the
    // game started. A watcher is sent the payload built for no viewer at
    // all, so nothing private is in it, and has no events with which to
    // act on the game.
    socket.on('citadels:spectate', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getCitadelsRoom(roomCode);
        if (!game) throw new CitadelsError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const own = game.getPlayer(identity.playerId);
        if (own && !own.left) throw new CitadelsError('You are playing in this room.');
        const viewer = liveRoom.watch(socket, game.roomCode, 'citadels', identity);
        if (!viewer) throw new CitadelsError('This room has too many spectators already.');
        cb?.({ ok: true, roomCode: game.roomCode, spectator: true, state: spectatorState(game) });
        broadcast(io, game.roomCode);
      } catch (err) {
        cb?.(errorPayload(err, [CitadelsError]));
      }
    });

    socket.on('citadels:unspectate', () => {
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
    });

    // --- giving up ----------------------------------------------------

    // The client has already asked for a confirmation by the time this
    // arrives. Surrendering is final; the player stays on as a watcher.
    socket.on('citadels:surrender', (payload, cb) => {
      const roomCode = socket.data.citadelsRoom;
      const playerId = socket.data.citadelsPlayerId;
      try {
        const game = roomManager.getCitadelsRoom(roomCode);
        const player = game?.getPlayer(playerId);
        if (!game || !player) throw new CitadelsError('You are not in a Citadels room.');
        if (player.exitReason) throw new CitadelsError('You have already left this game.');
        const seat = {
          playerId, nickname: player.nickname, accountId: player.accountId, avatarUrl: player.avatarUrl,
        };
        dropPlayer(io, roomCode, playerId, 'surrender');
        if (roomManager.getCitadelsRoom(roomCode)) {
          liveRoom.watch(socket, roomCode, 'citadels', seat);
          broadcast(io, roomCode);
        }
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [CitadelsError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('citadels:leave', () => {
      const roomCode = socket.data.citadelsRoom;
      const playerId = socket.data.citadelsPlayerId;
      DATA_KEYS.forEach((k) => { socket.data[k] = null; });
      liveRoom.unwatch(socket);
      const game = roomManager.getCitadelsRoom(roomCode);
      if (!game) return;
      socket.leave(roomCode);
      dropPlayer(io, roomCode, playerId, 'left');
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.citadelsRoom;
      const playerId = socket.data.citadelsPlayerId;
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
      const game = roomManager.getCitadelsRoom(roomCode);
      if (!game || !playerId) return;
      const player = game.getPlayer(playerId);
      if (!player || player.exitReason) return;
      // A socket that closed AFTER its owner had already reconnected is
      // stale: the seat now answers to a different socket, and treating
      // this close as a disconnect would knock a player who is sitting
      // right there offline - and start a countdown on them.
      if (player.socketId !== socket.id) return;
      game.setConnected(playerId, false);
      // Not a departure yet: twenty seconds to come back, counted down on
      // every screen in the room.
      liveRoom.armDrop(roomCode, playerId, () => dropPlayer(io, roomCode, playerId, 'timeout'));
      broadcast(io, roomCode);
      schedule(io, roomCode);
    });
  });
}

module.exports = { registerCitadelsHandlers };
