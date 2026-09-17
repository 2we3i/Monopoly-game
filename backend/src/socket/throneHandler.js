// throneHandler.js
// Real-time layer for the Iron Throne.
//
// Every player is sent their own payload (tactic cards are secret, the dice
// seed and the decks never leave the server). Clients send one intention at
// a time - throne:act with an engine action - and the room's single timer
// plays the computer houses step by step, ends the turn of a lord whose
// clock ran out and turns down an alliance offer nobody answered.

const roomManager = require('../game/RoomManager');
const {
  ThroneError, PHASES, MAX_PLAYERS, HOUSE_IDS,
} = require('../throne/ThroneGame');
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
const MODE_ID = 'throne.classic';
const timers = new Map();
let ioRef = null;

function sendError(socket, message) {
  socket.emit('throne:error', { message });
}

// Cosmetics are looks only: attached after the room has built the payload.
function clientState(game, viewerId) {
  const state = game.toClientJSON(viewerId);
  state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
  return liveRoom.decorate(state, game.roomCode);
}

// Watchers see the war as a lord with no house does: the whole map, every
// banner and the chronicle, but nobody's tactic cards and no dice seed.
function spectatorState(game) {
  const state = clientState(game, null);
  state.spectating = true;
  return state;
}

function broadcast(io, roomCode) {
  const game = roomManager.getThroneRoom(roomCode);
  if (!game) return;
  roomManager.persistThrone(roomCode);
  game.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('throne:state', clientState(game, p.id));
  });
  liveRoom.sendToSpectators(io, roomCode, 'throne:state', () => spectatorState(game));
  registry.observe('throne', game);
}

function clearTimer(roomCode) {
  const t = timers.get(roomCode);
  if (t) {
    clearTimeout(t);
    timers.delete(roomCode);
  }
}

// One timer per room, re-armed after every change.
function schedule(io, roomCode) {
  clearTimer(roomCode);
  const game = roomManager.getThroneRoom(roomCode);
  if (!game || game.phase !== PHASES.PLAY) return;
  const at = game.wakeAt();
  if (!at) return;
  timers.set(roomCode, setTimeout(() => {
    timers.delete(roomCode);
    const current = roomManager.getThroneRoom(roomCode);
    if (!current) return;
    try {
      current.onTimeout();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Iron Throne timeout handling failed in ${roomCode}:`, err.message);
      current.armDeadline();
    }
    broadcast(io, roomCode);
    schedule(io, roomCode);
  }, Math.max(100, at - Date.now())));
}

function stageOf(phase) {
  if (phase === PHASES.LOBBY) return 'lobby';
  if (phase === PHASES.GAME_OVER) return 'finished';
  return 'active';
}

const DATA_KEYS = ['throneRoom', 'thronePlayerId', 'throneAccountId'];

// A lord stops being a lord: they gave up, walked out, or their twenty
// seconds of grace ran out. The house itself stays on the map - the
// computer takes it - so the war is never left with a hole in it.
function dropPlayer(io, roomCode, playerId, reason) {
  const game = roomManager.getThroneRoom(roomCode);
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
    roomManager.deleteThroneRoom(roomCode, 'empty');
    liveRoom.closeSpectators(io, roomCode, 'throne', 'empty');
    return;
  }
  io.to(roomCode).emit('throne:system', {
    type: reason === 'surrender' ? 'PLAYER_SURRENDERED' : 'PLAYER_DROPPED',
    params: { name: nickname },
  });
  broadcast(io, roomCode);
  schedule(io, roomCode);
}

registry.register({
  type: 'throne',
  rooms: () => roomManager.throneRooms.values(),
  get: (code) => roomManager.getThroneRoom(code),
  summary(game) {
    const host = game.getPlayer(game.hostId);
    const s = game.state;
    return {
      code: game.roomCode,
      gameType: 'throne',
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
        status: p.left ? 'left' : (p.house || '—'),
      })),
      details: { round: s?.round || 0, target: game.settings.target, aiHouses: game.aiHouses.length },
    };
  },
  matchSummary(game) {
    const stage = stageOf(game.phase);
    const host = game.getPlayer(game.hostId);
    const seated = game.players.filter((p) => p.house);
    const standings = game.results?.standings || [];
    return {
      gameType: 'throne',
      roomCode: game.roomCode,
      modeId: MODE_ID,
      hostAccountId: host?.accountId || null,
      stage,
      startedAt: game.startedAt,
      players: seated.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: standings.find((r) => r.winner)?.nickname || null,
          players: seated.map((p) => {
            const index = standings.findIndex((r) => r.playerId === p.id);
            const row = standings[index];
            return {
              playerId: p.id,
              place: index >= 0 ? index + 1 : null,
              result: game.results.winnerIds.includes(p.id) ? 'win' : 'loss',
              role: p.house,
              score: row?.vp ?? 0,
              buildings: row?.lands ?? 0,
              goldEarned: 0,
              extra: { house: p.house, strength: row?.strength ?? 0 },
            };
          }),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const game = roomManager.getThroneRoom(code);
    if (!game) return false;
    clearTimer(code);
    game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
      gameType: 'throne', roomCode: code, reason, dataKeys: DATA_KEYS,
    }));
    liveRoom.disarmRoom(code);
    liveRoom.closeSpectators(ioRef, code, 'throne', reason);
    roomManager.deleteThroneRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const game = roomManager.getThroneRoom(code);
    const player = game?.getPlayer(playerId);
    if (!player) return false;
    notifyRemoved(ioRef, player.socketId, { gameType: 'throne', roomCode: code, reason, dataKeys: DATA_KEYS });
    dropPlayer(ioRef, code, playerId, 'kicked');
    if (!roomManager.getThroneRoom(code)) return true;
    broadcast(ioRef, code);
    schedule(ioRef, code);
    return true;
  },
});

function houseId(value) {
  const id = idString(value, 20);
  return HOUSE_IDS.includes(id) ? id : null;
}

function registerThroneHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    // Runs one change for the caller's own seat, then syncs everyone.
    const run = (fn) => (payload, cb) => {
      const roomCode = socket.data.throneRoom;
      const playerId = socket.data.thronePlayerId;
      try {
        const game = roomManager.getThroneRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new ThroneError('You are not in an Iron Throne room.');
        fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
        broadcast(io, roomCode);
        schedule(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [ThroneError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    };

    const seat = (game, player, identity) => {
      socket.join(game.roomCode);
      socket.data.throneRoom = game.roomCode;
      socket.data.thronePlayerId = player.id;
      socket.data.throneAccountId = identity.accountId;
    };

    socket.on('throne:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, token, guestKey, settings,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        modes.assertAvailable(MODE_ID, identity.accountId);
        const game = roomManager.createThroneRoom(identity.playerId, settings, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        seat(game, player, identity);
        roomManager.persistThrone(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
      } catch (err) {
        cb?.(errorPayload(err, [ThroneError]));
      }
    });

    socket.on('throne:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getThroneRoom(roomCode);
        if (!game) throw new ThroneError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const existing = game.getPlayer(identity.playerId);
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
          // A lord who gave up or ran out of grace does not get the house
          // back; the gallery is still open to them.
          liveRoom.assertSeatReclaimable(existing);
        } else if (!identity.nickname) {
          throw new ThroneError('Nickname is required.');
        }
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        // Back inside the twenty seconds: nothing happened at all.
        liveRoom.disarmDrop(game.roomCode, player.id);
        liveRoom.unwatch(socket);
        seat(game, player, identity);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
        broadcast(io, game.roomCode);
        schedule(io, game.roomCode);
        io.to(game.roomCode).emit('throne:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED', params: { name: player.nickname },
        });
      } catch (err) {
        cb?.(errorPayload(err, [ThroneError]));
      }
    });

    socket.on('throne:settings', run((game, playerId, p) => game.updateSettings(playerId, p.settings || {})));
    socket.on('throne:ready', run((game, playerId, p) => game.setReady(playerId, p.ready)));
    socket.on('throne:house', run((game, playerId, p) => game.chooseHouse(playerId, houseId(p.house))));
    socket.on('throne:ai', run((game, playerId, p) => game.setAiHouse(playerId, houseId(p.house), !!p.on)));

    socket.on('throne:start', run((game, playerId) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.throneAccountId);
      modes.assertAvailable(MODE_ID, socket.data.throneAccountId);
      game.start(playerId);
    }));

    socket.on('throne:restart', run((game, playerId, p) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.throneAccountId);
      game.restart(playerId);
      if (p.startNow) {
        modes.assertAvailable(MODE_ID, socket.data.throneAccountId);
        game.start(playerId);
      }
    }));

    socket.on('throne:act', run((game, playerId, p) => game.act(playerId, p.action)));

    socket.on('throne:chat', ({ text, emote } = {}) => {
      const game = roomManager.getThroneRoom(socket.data.throneRoom);
      const player = game?.getPlayer(socket.data.thronePlayerId);
      if (!player) return;
      const message = roomChat.prepareRoomMessage({
        text, emote: idString(emote, 80), sender: player, players: game.players,
      });
      if (!message) return;
      io.to(game.roomCode).emit('throne:chat', message);
      roomChat.notifyMentions(message, { players: game.players, context: { kind: 'room', gameType: 'throne', roomCode: game.roomCode } });
    });

    // --- watching -----------------------------------------------------

    // The war is a spectacle: anyone may watch a room at any point, before
    // or after it started, without taking a house.
    socket.on('throne:spectate', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getThroneRoom(roomCode);
        if (!game) throw new ThroneError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const own = game.getPlayer(identity.playerId);
        if (own && !own.left) throw new ThroneError('You lead a house in this room.');
        const viewer = liveRoom.watch(socket, game.roomCode, 'throne', identity);
        if (!viewer) throw new ThroneError('This room has too many spectators already.');
        cb?.({ ok: true, roomCode: game.roomCode, spectator: true, state: spectatorState(game) });
        broadcast(io, game.roomCode);
      } catch (err) {
        cb?.(errorPayload(err, [ThroneError]));
      }
    });

    socket.on('throne:unspectate', () => {
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
    });

    // --- giving up ----------------------------------------------------

    socket.on('throne:surrender', (payload, cb) => {
      const roomCode = socket.data.throneRoom;
      const playerId = socket.data.thronePlayerId;
      try {
        const game = roomManager.getThroneRoom(roomCode);
        const player = game?.getPlayer(playerId);
        if (!game || !player) throw new ThroneError('You are not in an Iron Throne room.');
        if (player.exitReason) throw new ThroneError('You have already left this game.');
        const seated = { playerId, nickname: player.nickname, accountId: player.accountId, avatarUrl: player.avatarUrl };
        dropPlayer(io, roomCode, playerId, 'surrender');
        if (roomManager.getThroneRoom(roomCode)) {
          liveRoom.watch(socket, roomCode, 'throne', seated);
          broadcast(io, roomCode);
        }
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [ThroneError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('throne:leave', () => {
      const roomCode = socket.data.throneRoom;
      const playerId = socket.data.thronePlayerId;
      DATA_KEYS.forEach((k) => { socket.data[k] = null; });
      liveRoom.unwatch(socket);
      const game = roomManager.getThroneRoom(roomCode);
      if (!game) return;
      socket.leave(roomCode);
      dropPlayer(io, roomCode, playerId, 'left');
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.throneRoom;
      const playerId = socket.data.thronePlayerId;
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
      const game = roomManager.getThroneRoom(roomCode);
      if (!game || !playerId) return;
      const player = game.getPlayer(playerId);
      if (!player || player.exitReason) return;
      // A socket that closed AFTER its owner had already reconnected is
      // stale: the seat now answers to a different socket, and treating
      // this close as a disconnect would knock a player who is sitting
      // right there offline - and start a countdown on them.
      if (player.socketId !== socket.id) return;
      game.setConnected(playerId, false);
      // Twenty seconds to come back before the house passes on.
      liveRoom.armDrop(roomCode, playerId, () => dropPlayer(io, roomCode, playerId, 'timeout'));
      broadcast(io, roomCode);
      schedule(io, roomCode);
    });
  });
}

module.exports = { registerThroneHandlers };
