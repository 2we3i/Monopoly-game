// bunkerHandler.js
// Real-time layer for the Bunker.
//
// Every player receives their own payload (other players' hidden cards are
// simply not in it), and the server's clock moves the game on when a reveal,
// a discussion or a vote runs out of time. Clients send only intentions -
// "reveal my health card", "vote for player 3" - and the engine decides.

const roomManager = require('../game/RoomManager');
const {
  BunkerError, PHASES,
} = require('../bunker/BunkerGame');
const { CATEGORY_KEYS } = require('../bunker/cards');
const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload, idString,
} = require('./roomSockets');
const roomChat = require('../social/roomChat');

const { AccessError } = access;
const MODE_ID = 'bunker.classic';
const timers = new Map();
let ioRef = null;

function sendError(socket, message) {
  socket.emit('bunker:error', { message });
}

// Cosmetics are looks only, added after the engine has built the
// (secret-respecting) payload for this viewer.
function clientState(game, viewerId) {
  const state = game.toClientJSON(viewerId);
  state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
  return state;
}

function broadcast(io, roomCode) {
  const game = roomManager.getBunkerRoom(roomCode);
  if (!game) return;
  roomManager.persistBunker(roomCode);
  game.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('bunker:state', clientState(game, p.id));
  });
  registry.observe('bunker', game);
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
  const game = roomManager.getBunkerRoom(roomCode);
  if (!game || !game.phaseEndsAt || game.phase === PHASES.LOBBY || game.phase === PHASES.GAME_OVER) return;
  const delay = Math.max(200, game.phaseEndsAt - Date.now());
  timers.set(roomCode, setTimeout(() => {
    timers.delete(roomCode);
    const current = roomManager.getBunkerRoom(roomCode);
    if (!current) return;
    try {
      current.onTimeout();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Bunker timeout handling failed in ${roomCode}:`, err.message);
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

const DATA_KEYS = ['bunkerRoom', 'bunkerPlayerId', 'bunkerAccountId'];

registry.register({
  type: 'bunker',
  rooms: () => roomManager.bunkerRooms.values(),
  get: (code) => roomManager.getBunkerRoom(code),
  summary(game) {
    const host = game.getPlayer(game.hostId);
    return {
      code: game.roomCode,
      gameType: 'bunker',
      modeId: MODE_ID,
      hostId: game.hostId,
      hostNickname: host?.nickname || null,
      hostAccountId: host?.accountId || null,
      createdAt: game.createdAt,
      phase: game.phase,
      stage: stageOf(game.phase),
      maxPlayers: game.settings.maxPlayers,
      players: game.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        accountId: p.accountId || null,
        isGuest: !p.accountId,
        connected: !!p.connected,
        isHost: p.id === game.hostId,
        status: p.left ? 'left' : `#${p.number} · ${p.status} · ${p.revealed.length}/${CATEGORY_KEYS.length}`,
      })),
      details: { round: game.round, seats: game.seats },
    };
  },
  // A team result: everyone who ends the game inside the bunker has won.
  matchSummary(game) {
    const stage = stageOf(game.phase);
    const host = game.getPlayer(game.hostId);
    const survivors = game.results?.survivorIds || [];
    return {
      gameType: 'bunker',
      roomCode: game.roomCode,
      modeId: MODE_ID,
      hostAccountId: host?.accountId || null,
      stage,
      startedAt: game.startedAt,
      players: game.players.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: survivors.map((id) => game.getPlayer(id)?.nickname).filter(Boolean).join(', ') || null,
          players: game.players.map((p) => ({
            playerId: p.id,
            result: survivors.includes(p.id) ? 'win' : 'loss',
            extra: { excludedRound: p.excludedRound },
          })),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const game = roomManager.getBunkerRoom(code);
    if (!game) return false;
    clearTimer(code);
    game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
      gameType: 'bunker', roomCode: code, reason, dataKeys: DATA_KEYS,
    }));
    roomManager.deleteBunkerRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const game = roomManager.getBunkerRoom(code);
    const player = game?.getPlayer(playerId);
    if (!player) return false;
    notifyRemoved(ioRef, player.socketId, { gameType: 'bunker', roomCode: code, reason, dataKeys: DATA_KEYS });
    game.removePlayer(playerId);
    if (game.players.length === 0 || game.players.every((p) => p.left)) {
      this.close(code, reason);
      return true;
    }
    broadcast(ioRef, code);
    schedule(ioRef, code);
    return true;
  },
});

function registerBunkerHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    // Runs one action for the caller's own seat, then syncs everyone.
    const act = (fn) => (payload, cb) => {
      const roomCode = socket.data.bunkerRoom;
      const playerId = socket.data.bunkerPlayerId;
      try {
        const game = roomManager.getBunkerRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new BunkerError('You are not in a Bunker room.');
        fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
        broadcast(io, roomCode);
        schedule(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [BunkerError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message, code: err.code || null });
      }
    };

    socket.on('bunker:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, token, guestKey, settings,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        modes.assertAvailable(MODE_ID);
        const game = roomManager.createBunkerRoom(identity.playerId, settings, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        socket.join(game.roomCode);
        socket.data.bunkerRoom = game.roomCode;
        socket.data.bunkerPlayerId = player.id;
        socket.data.bunkerAccountId = identity.accountId;
        roomManager.persistBunker(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
      } catch (err) {
        cb?.(errorPayload(err, [BunkerError]));
      }
    });

    socket.on('bunker:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getBunkerRoom(roomCode);
        if (!game) throw new BunkerError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const existing = game.getPlayer(identity.playerId);
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
          if (existing.left) throw new BunkerError('You left this game.');
        } else if (!identity.nickname) {
          throw new BunkerError('Nickname is required.');
        }
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        socket.join(game.roomCode);
        socket.data.bunkerRoom = game.roomCode;
        socket.data.bunkerPlayerId = player.id;
        socket.data.bunkerAccountId = identity.accountId;
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
        broadcast(io, game.roomCode);
        schedule(io, game.roomCode);
        io.to(game.roomCode).emit('bunker:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED', params: { name: player.nickname },
        });
      } catch (err) {
        cb?.(errorPayload(err, [BunkerError]));
      }
    });

    socket.on('bunker:settings', act((game, playerId, p) => game.updateSettings(playerId, p.settings || {})));
    socket.on('bunker:ready', act((game, playerId, p) => game.setReady(playerId, p.ready)));

    socket.on('bunker:start', act((game, playerId) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.bunkerAccountId);
      modes.assertAvailable(MODE_ID);
      game.start(playerId);
    }));

    socket.on('bunker:restart', act((game, playerId, p) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.bunkerAccountId);
      game.restart(playerId);
      if (p.startNow) {
        modes.assertAvailable(MODE_ID);
        game.start(playerId);
      }
    }));

    socket.on('bunker:reveal', act((game, playerId, p) => game.reveal(playerId, idString(p.key, 20))));
    socket.on('bunker:vote', act((game, playerId, p) => game.vote(playerId, idString(p.targetId))));
    socket.on('bunker:skip', act((game, playerId) => game.skipPhase(playerId)));

    socket.on('bunker:chat', ({ text, emote } = {}) => {
      const game = roomManager.getBunkerRoom(socket.data.bunkerRoom);
      const player = game?.getPlayer(socket.data.bunkerPlayerId);
      if (!player) return;
      const message = roomChat.prepareRoomMessage({
        text, emote: idString(emote, 80), sender: player, players: game.players,
      });
      if (!message) return;
      io.to(game.roomCode).emit('bunker:chat', { ...message, number: player.number, excluded: player.status === 'excluded' });
      roomChat.notifyMentions(message, { players: game.players, context: { kind: 'room', gameType: 'bunker', roomCode: game.roomCode } });
    });

    socket.on('bunker:leave', () => {
      const roomCode = socket.data.bunkerRoom;
      const playerId = socket.data.bunkerPlayerId;
      DATA_KEYS.forEach((k) => { socket.data[k] = null; });
      const game = roomManager.getBunkerRoom(roomCode);
      if (!game) return;
      socket.leave(roomCode);
      game.removePlayer(playerId);
      if (game.players.length === 0 || game.players.every((p) => p.left)) {
        clearTimer(roomCode);
        roomManager.deleteBunkerRoom(roomCode, 'empty');
        return;
      }
      broadcast(io, roomCode);
      schedule(io, roomCode);
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.bunkerRoom;
      const playerId = socket.data.bunkerPlayerId;
      const game = roomManager.getBunkerRoom(roomCode);
      if (!game || !playerId) return;
      game.setConnected(playerId, false);
      broadcast(io, roomCode);
      schedule(io, roomCode);
    });
  });
}

module.exports = { registerBunkerHandlers };
