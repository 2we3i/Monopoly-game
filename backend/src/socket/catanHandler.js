// catanHandler.js
// Real-time layer for Catan.
//
// Like Citadels, every player is sent their own payload (hands and
// development cards are secret), and the server's clock plays a legal
// move for a player who runs out of time or walks away. Clients send
// only intentions - "build a road on edge 31" - and the engine decides.

const roomManager = require('../game/RoomManager');
const { CatanError, PHASES, MAX_PLAYERS } = require('../catan/CatanGame');
const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload, idString,
} = require('./roomSockets');
const roomChat = require('../social/roomChat');

const { AccessError } = access;
const MODE_ID = 'catan.classic';
const timers = new Map();
let ioRef = null;

function sendError(socket, message) {
  socket.emit('catan:error', { message });
}

// Only whole, in-range numbers from the client name a hex, corner or side.
function intId(value, max = 1000) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

// A player's cosmetics are looks only: attached to the payload after the
// engine has built it, so they can never influence the game itself.
function clientState(game, viewerId) {
  const state = game.toClientJSON(viewerId);
  state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
  return state;
}

function broadcast(io, roomCode) {
  const game = roomManager.getCatanRoom(roomCode);
  if (!game) return;
  roomManager.persistCatan(roomCode);
  game.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('catan:state', clientState(game, p.id));
  });
  registry.observe('catan', game);
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
  const game = roomManager.getCatanRoom(roomCode);
  if (!game || !game.phaseEndsAt || game.phase === PHASES.LOBBY || game.phase === PHASES.GAME_OVER) return;
  const delay = Math.max(200, game.phaseEndsAt - Date.now());
  timers.set(roomCode, setTimeout(() => {
    timers.delete(roomCode);
    const current = roomManager.getCatanRoom(roomCode);
    if (!current) return;
    try {
      current.onTimeout();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Catan timeout handling failed in ${roomCode}:`, err.message);
      // A move that could not be made must not leave the clock pointing
      // at the past, or the room would spin on the same failure.
      current.armDeadline();
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

const DATA_KEYS = ['catanRoom', 'catanPlayerId', 'catanAccountId'];

registry.register({
  type: 'catan',
  rooms: () => roomManager.catanRooms.values(),
  get: (code) => roomManager.getCatanRoom(code),
  summary(game) {
    const host = game.getPlayer(game.hostId);
    return {
      code: game.roomCode,
      gameType: 'catan',
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
        status: p.left ? 'left' : `${game.layout ? game.publicPoints(p.id) : 0} VP`,
      })),
      details: { turn: game.turnNumber, victoryPoints: game.settings.victoryPoints },
    };
  },
  matchSummary(game) {
    const stage = stageOf(game.phase);
    const host = game.getPlayer(game.hostId);
    const standings = game.results?.standings || [];
    return {
      gameType: 'catan',
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
              role: null,
              score: row?.total ?? 0,
              buildings: row ? row.settlements + row.cities : 0,
              goldEarned: 0,
              extra: { knights: p.knights, produced: p.stats.produced, trades: p.stats.trades },
            };
          }),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const game = roomManager.getCatanRoom(code);
    if (!game) return false;
    clearTimer(code);
    game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
      gameType: 'catan', roomCode: code, reason, dataKeys: DATA_KEYS,
    }));
    roomManager.deleteCatanRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const game = roomManager.getCatanRoom(code);
    const player = game?.getPlayer(playerId);
    if (!player) return false;
    notifyRemoved(ioRef, player.socketId, { gameType: 'catan', roomCode: code, reason, dataKeys: DATA_KEYS });
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

function registerCatanHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    // Runs one in-game action for the caller's own seat, then syncs.
    const act = (fn) => (payload, cb) => {
      const roomCode = socket.data.catanRoom;
      const playerId = socket.data.catanPlayerId;
      try {
        const game = roomManager.getCatanRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new CatanError('You are not in a Catan room.');
        fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
        broadcast(io, roomCode);
        schedule(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [CatanError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    };

    socket.on('catan:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, token, guestKey, settings,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        modes.assertAvailable(MODE_ID);
        const game = roomManager.createCatanRoom(identity.playerId, settings, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        socket.join(game.roomCode);
        socket.data.catanRoom = game.roomCode;
        socket.data.catanPlayerId = player.id;
        socket.data.catanAccountId = identity.accountId;
        roomManager.persistCatan(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
      } catch (err) {
        cb?.(errorPayload(err, [CatanError]));
      }
    });

    socket.on('catan:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getCatanRoom(roomCode);
        if (!game) throw new CatanError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const existing = game.getPlayer(identity.playerId);
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
        } else if (!identity.nickname) {
          throw new CatanError('Nickname is required.');
        }
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        socket.join(game.roomCode);
        socket.data.catanRoom = game.roomCode;
        socket.data.catanPlayerId = player.id;
        socket.data.catanAccountId = identity.accountId;
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
        broadcast(io, game.roomCode);
        schedule(io, game.roomCode);
        io.to(game.roomCode).emit('catan:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED', params: { name: player.nickname },
        });
      } catch (err) {
        cb?.(errorPayload(err, [CatanError]));
      }
    });

    socket.on('catan:settings', act((game, playerId, p) => game.updateSettings(playerId, p.settings || {})));
    socket.on('catan:ready', act((game, playerId, p) => game.setReady(playerId, p.ready)));

    socket.on('catan:start', act((game, playerId) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.catanAccountId);
      modes.assertAvailable(MODE_ID);
      game.start(playerId);
    }));

    socket.on('catan:restart', act((game, playerId, p) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.catanAccountId);
      game.restart(playerId);
      if (p.startNow) {
        modes.assertAvailable(MODE_ID);
        game.start(playerId);
      }
    }));

    socket.on('catan:roll', act((game, playerId) => game.rollDice(playerId)));
    socket.on('catan:buildRoad', act((game, playerId, p) => game.buildRoad(playerId, intId(p.edgeId))));
    socket.on('catan:buildSettlement', act((game, playerId, p) => game.buildSettlement(playerId, intId(p.vertexId))));
    socket.on('catan:buildCity', act((game, playerId, p) => game.buildCity(playerId, intId(p.vertexId))));
    socket.on('catan:buyDev', act((game, playerId) => game.buyDevCard(playerId)));
    socket.on('catan:playDev', act((game, playerId, p) => game.playDevCard(playerId, idString(p.card, 20), {
      resource: idString(p.resource, 10),
      resources: Array.isArray(p.resources) ? p.resources.slice(0, 2).map((r) => idString(r, 10)) : undefined,
    })));
    socket.on('catan:discard', act((game, playerId, p) => game.discard(playerId, p.resources)));
    socket.on('catan:moveRobber', act((game, playerId, p) => game.moveRobber(playerId, intId(p.hexId))));
    socket.on('catan:steal', act((game, playerId, p) => game.steal(playerId, idString(p.victimId))));
    socket.on('catan:bankTrade', act((game, playerId, p) => game.bankTrade(playerId, idString(p.give, 10), idString(p.get, 10), p.amount)));
    socket.on('catan:proposeTrade', act((game, playerId, p) => game.proposeTrade(playerId, {
      give: p.give,
      get: p.get,
      to: Array.isArray(p.to) ? p.to.slice(0, 10).map((id) => idString(id)).filter(Boolean) : null,
    })));
    socket.on('catan:respondTrade', act((game, playerId, p) => game.respondTrade(playerId, intId(p.tradeId, 1e9), !!p.accept)));
    socket.on('catan:confirmTrade', act((game, playerId, p) => game.confirmTrade(playerId, intId(p.tradeId, 1e9), idString(p.partnerId))));
    socket.on('catan:cancelTrade', act((game, playerId) => game.cancelTrade(playerId)));
    socket.on('catan:endTurn', act((game, playerId) => game.endTurn(playerId)));

    socket.on('catan:chat', ({ text, emote } = {}) => {
      const game = roomManager.getCatanRoom(socket.data.catanRoom);
      const player = game?.getPlayer(socket.data.catanPlayerId);
      if (!player) return;
      const message = roomChat.prepareRoomMessage({
        text, emote: idString(emote, 80), sender: player, players: game.players,
      });
      if (!message) return;
      io.to(game.roomCode).emit('catan:chat', message);
      roomChat.notifyMentions(message, { players: game.players, context: { kind: 'room', gameType: 'catan', roomCode: game.roomCode } });
    });

    socket.on('catan:leave', () => {
      const roomCode = socket.data.catanRoom;
      const playerId = socket.data.catanPlayerId;
      DATA_KEYS.forEach((k) => { socket.data[k] = null; });
      const game = roomManager.getCatanRoom(roomCode);
      if (!game) return;
      socket.leave(roomCode);
      game.removePlayer(playerId);
      if (game.players.length === 0 || game.players.every((p) => p.left)) {
        clearTimer(roomCode);
        roomManager.deleteCatanRoom(roomCode, 'empty');
        return;
      }
      broadcast(io, roomCode);
      schedule(io, roomCode);
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.catanRoom;
      const playerId = socket.data.catanPlayerId;
      const game = roomManager.getCatanRoom(roomCode);
      if (!game || !playerId) return;
      game.setConnected(playerId, false);
      broadcast(io, roomCode);
      schedule(io, roomCode);
    });
  });
}

module.exports = { registerCatanHandlers };
