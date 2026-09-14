// socketHandler.js
// Real-time layer for Monopoly.
//
// Every create/join goes through platform/access: only a registered
// account may create or start a room, a blocked account may do nothing,
// and a reconnect may only reclaim a seat that is provably the caller's.

const roomManager = require('../game/RoomManager');
const { GameError } = require('../game/GameManager');
const { LAYOUT_OPTIONS, DEFAULT_LAYOUT_ID } = require('../game/boardLayouts');
const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload,
} = require('./roomSockets');

const { AccessError } = access;
const DISCONNECT_GRACE_MS = 1000 * 60 * 10;
const disconnectTimers = new Map();
let ioRef = null;

// The state every client receives. The guest key hash is a server-side
// secret check and never leaves the server.
function roomStatePayload(mgr) {
  const state = mgr.state.toJSON();
  state.players = state.players.map(({ guestKeyHash, ...p }) => ({ ...p, isGuest: !p.accountId }));
  return state;
}

function broadcastState(io, roomCode) {
  const mgr = roomManager.getRoom(roomCode);
  if (!mgr) return;
  roomManager.persist(roomCode);
  io.to(roomCode).emit('game:state', roomStatePayload(mgr));
  registry.observe('monopoly', mgr);
}

function sendError(socket, message) {
  socket.emit('game:error', { message });
}

function clearDisconnectTimer(roomCode, playerId) {
  const key = `${roomCode}:${playerId}`;
  const t = disconnectTimers.get(key);
  if (t) {
    clearTimeout(t);
    disconnectTimers.delete(key);
  }
}

function scheduleAutoSkip(io, roomCode, playerId) {
  const key = `${roomCode}:${playerId}`;
  clearDisconnectTimer(roomCode, playerId);
  const timer = setTimeout(() => {
    const mgr = roomManager.getRoom(roomCode);
    if (!mgr) return;
    const cp = mgr.state.currentPlayer;
    if (cp && cp.id === playerId && !cp.connected && mgr.state.phase !== 'GAME_OVER' && mgr.state.phase !== 'LOBBY') {
      try {
        if (cp.money < 0) {
          mgr.declareBankruptcy(playerId);
        } else {
          mgr.state.pendingAction = null;
          mgr.state.phase = 'ACTION';
          mgr.endTurn(playerId);
        }
        mgr.state.addLog(`${cp.nickname} was auto-skipped after a long disconnect.`, 'AUTO_SKIPPED', { name: cp.nickname });
      } catch (err) {
        mgr.advanceTurn();
      }
      broadcastState(io, roomCode);
    }
    disconnectTimers.delete(key);
  }, DISCONNECT_GRACE_MS);
  disconnectTimers.set(key, timer);
}

function stageOf(phase) {
  if (phase === 'LOBBY') return 'lobby';
  if (phase === 'GAME_OVER') return 'finished';
  return 'active';
}

const DATA_KEYS = ['roomCode', 'playerId', 'accountId'];

registry.register({
  type: 'monopoly',
  rooms: () => roomManager.rooms.values(),
  get: (code) => roomManager.getRoom(code),
  summary(mgr) {
    const s = mgr.state;
    const host = s.players.find((p) => p.id === mgr.hostId) || s.players.find((p) => p.isHost);
    const winner = s.winnerId ? s.getPlayer(s.winnerId) : null;
    return {
      code: s.roomCode,
      gameType: 'monopoly',
      modeId: modes.monopolyModeId(s.modeId),
      hostId: mgr.hostId,
      hostNickname: host?.nickname || null,
      hostAccountId: host?.accountId || null,
      createdAt: s.createdAt,
      phase: s.phase,
      stage: stageOf(s.phase),
      maxPlayers: 10,
      players: s.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        accountId: p.accountId || null,
        isGuest: !p.accountId,
        connected: !!p.connected,
        isHost: p.id === mgr.hostId,
        status: p.bankrupt ? 'bankrupt' : 'playing',
      })),
      details: {
        currentPlayer: s.phase !== 'LOBBY' && s.phase !== 'GAME_OVER' ? s.currentPlayer?.nickname || null : null,
        winner: winner?.nickname || null,
        board: s.modeId,
      },
    };
  },
  matchSummary(mgr) {
    const s = mgr.state;
    const stage = stageOf(s.phase);
    const host = s.getPlayer(mgr.hostId);
    const winner = s.winnerId ? s.getPlayer(s.winnerId) : null;
    return {
      gameType: 'monopoly',
      roomCode: s.roomCode,
      modeId: modes.monopolyModeId(s.modeId),
      hostAccountId: host?.accountId || null,
      stage,
      players: s.players.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: winner?.nickname || null,
          players: s.players.map((p) => ({
            playerId: p.id, result: p.id === s.winnerId ? 'win' : 'loss', score: p.money,
          })),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const mgr = roomManager.getRoom(code);
    if (!mgr) return false;
    mgr.state.players.forEach((p) => {
      clearDisconnectTimer(code, p.id);
      notifyRemoved(ioRef, p.socketId, { gameType: 'monopoly', roomCode: code, reason, dataKeys: DATA_KEYS });
    });
    roomManager.deleteRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const mgr = roomManager.getRoom(code);
    const player = mgr?.state.getPlayer(playerId);
    if (!player) return false;
    clearDisconnectTimer(code, playerId);
    notifyRemoved(ioRef, player.socketId, { gameType: 'monopoly', roomCode: code, reason, dataKeys: DATA_KEYS });
    if (mgr.state.phase === 'LOBBY') {
      mgr.removePlayer(playerId);
    } else {
      if (!player.bankrupt && mgr.state.phase !== 'GAME_OVER') mgr.declareBankruptcy(playerId);
      mgr.markDisconnected(playerId);
    }
    if (mgr.state.players.length === 0) {
      roomManager.deleteRoom(code, reason);
    } else {
      broadcastState(ioRef, code);
    }
    return true;
  },
});

function registerSocketHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;
    socket.data.accountId = null;

    socket.on('room:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, modeId, token, guestKey,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        const layoutId = modeId || DEFAULT_LAYOUT_ID;
        if (!LAYOUT_OPTIONS.some((opt) => opt.id === layoutId)) {
          throw new GameError(`Unknown game mode "${modeId}".`);
        }
        modes.assertAvailable(modes.monopolyModeId(layoutId));

        const mgr = roomManager.createRoom(identity.playerId, layoutId, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = mgr.addPlayer({
          playerId: identity.playerId,
          socketId: socket.id,
          nickname: identity.nickname,
          avatarUrl: identity.avatarUrl,
          accountId: identity.accountId,
        });
        socket.join(mgr.state.roomCode);
        socket.data.roomCode = mgr.state.roomCode;
        socket.data.playerId = player.id;
        socket.data.accountId = identity.accountId;
        roomManager.persist(mgr.state.roomCode);
        cb?.({ ok: true, roomCode: mgr.state.roomCode, playerId: player.id, state: roomStatePayload(mgr) });
        io.to(mgr.state.roomCode).emit('game:state', roomStatePayload(mgr));
      } catch (err) {
        cb?.(errorPayload(err, [GameError]));
      }
    });

    socket.on('room:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const mgr = roomManager.getRoom(roomCode);
        if (!mgr) throw new GameError('Room not found. Check the code and try again.');

        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(mgr.state.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }

        const existing = mgr.state.getPlayer(identity.playerId);
        let player;
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
          clearDisconnectTimer(mgr.state.roomCode, identity.playerId);
          player = mgr.reconnectPlayer(identity.playerId, socket.id);
          if (!identity.isGuest) {
            player.nickname = identity.nickname;
            player.avatarUrl = identity.avatarUrl;
          }
        } else {
          if (!identity.nickname) throw new GameError('Nickname is required.');
          player = mgr.addPlayer({
            playerId: identity.playerId,
            socketId: socket.id,
            nickname: identity.nickname,
            avatarUrl: identity.avatarUrl,
            accountId: identity.accountId,
            guestKeyHash: identity.guestKeyHash,
          });
        }

        socket.join(mgr.state.roomCode);
        socket.data.roomCode = mgr.state.roomCode;
        socket.data.playerId = player.id;
        socket.data.accountId = identity.accountId;
        roomManager.persist(mgr.state.roomCode);
        cb?.({ ok: true, roomCode: mgr.state.roomCode, playerId: player.id, state: roomStatePayload(mgr) });
        io.to(mgr.state.roomCode).emit('game:state', roomStatePayload(mgr));
        io.to(mgr.state.roomCode).emit('chat:system', { message: `${player.nickname} joined.`, type: 'PLAYER_JOINED_CHAT', params: { name: player.nickname } });
      } catch (err) {
        cb?.(errorPayload(err, [GameError]));
      }
    });

    socket.on('room:rejoinCheck', ({ roomCode, playerId } = {}, cb) => {
      const mgr = roomManager.getRoom(roomCode);
      if (!mgr) return cb?.({ ok: false });
      const player = mgr.state.getPlayer(playerId);
      if (!player) return cb?.({ ok: false });
      cb?.({ ok: true });
    });

    // Explicit "I am leaving" - the only thing that permanently removes
    // a player from a LOBBY-phase room. Distinct from a raw disconnect,
    // which is ambiguous (reload vs. genuinely leaving).
    socket.on('room:leave', () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const mgr = roomManager.getRoom(roomCode);
      if (!mgr) return;
      clearDisconnectTimer(roomCode, playerId);
      if (mgr.state.phase === 'LOBBY') {
        mgr.removePlayer(playerId);
        roomManager.persist(roomCode);
        io.to(roomCode).emit('game:state', roomStatePayload(mgr));
        roomManager.cleanupEmptyRoom(roomCode);
      } else {
        mgr.markDisconnected(playerId);
        roomManager.persist(roomCode);
        io.to(roomCode).emit('game:state', roomStatePayload(mgr));
      }
      socket.leave(roomCode);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      socket.data.accountId = null;
    });

    socket.on('room:start', () => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return sendError(socket, 'Room not found.');
      try {
        if (socket.data.playerId !== mgr.hostId) throw new GameError('Only the host can start the game.');
        access.assertCanStart(socket.data.accountId);
        modes.assertAvailable(modes.monopolyModeId(mgr.state.modeId));
        mgr.startGame(socket.data.playerId);
        broadcastState(io, mgr.state.roomCode);
      } catch (err) {
        sendError(socket, clientMessage(err, [GameError]));
      }
    });

    const withGame = (handler) => (payload) => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return sendError(socket, 'You are not in an active room.');
      try {
        handler(mgr, payload && typeof payload === 'object' ? payload : {});
        broadcastState(io, mgr.state.roomCode);
      } catch (err) {
        sendError(socket, clientMessage(err, [GameError]));
      }
    };

    socket.on('game:rollDice', withGame((mgr) => mgr.rollDice(socket.data.playerId)));
    socket.on('game:payJailFine', withGame((mgr) => mgr.payJailFine(socket.data.playerId)));
    socket.on('game:useJailCard', withGame((mgr) => mgr.useGetOutOfJailCard(socket.data.playerId)));
    socket.on('game:buyProperty', withGame((mgr, { tileId }) => mgr.buyProperty(socket.data.playerId, tileId)));
    socket.on('game:declinePurchase', withGame((mgr, { tileId }) => mgr.declinePurchase(socket.data.playerId, tileId)));
    socket.on('game:acknowledgeCard', withGame((mgr) => mgr.acknowledgeCard(socket.data.playerId)));
    socket.on('game:buildHouse', withGame((mgr, { tileId }) => mgr.buildHouse(socket.data.playerId, tileId)));
    socket.on('game:sellHouse', withGame((mgr, { tileId }) => mgr.sellHouse(socket.data.playerId, tileId)));
    socket.on('game:mortgage', withGame((mgr, { tileId }) => mgr.mortgageProperty(socket.data.playerId, tileId)));
    socket.on('game:unmortgage', withGame((mgr, { tileId }) => mgr.unmortgageProperty(socket.data.playerId, tileId)));
    socket.on('game:endTurn', withGame((mgr) => mgr.endTurn(socket.data.playerId)));
    socket.on('game:declareBankruptcy', withGame((mgr) => mgr.declareBankruptcy(socket.data.playerId)));

    socket.on('game:proposeTrade', withGame((mgr, payload) => mgr.proposeTrade(socket.data.playerId, payload)));
    socket.on('game:acceptTrade', withGame((mgr, { tradeId }) => mgr.acceptTrade(socket.data.playerId, tradeId)));
    socket.on('game:declineTrade', withGame((mgr, { tradeId }) => mgr.declineTrade(socket.data.playerId, tradeId)));
    socket.on('game:cancelTrade', withGame((mgr, { tradeId }) => mgr.cancelTrade(socket.data.playerId, tradeId)));

    socket.on('game:setCustomPrice', withGame((mgr, { tileId, targetPlayerId, amount }) => mgr.setCustomPrice(socket.data.playerId, tileId, targetPlayerId, amount)));

    socket.on('chat:message', ({ text } = {}) => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return;
      const player = mgr.state.getPlayer(socket.data.playerId);
      if (!player) return;
      const clean = String(text || '').slice(0, 300).trim();
      if (!clean) return;
      io.to(mgr.state.roomCode).emit('chat:message', {
        playerId: player.id,
        nickname: player.nickname,
        color: player.color,
        text: clean,
        ts: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const mgr = roomManager.getRoom(roomCode);
      if (!mgr) return;

      mgr.markDisconnected(playerId);
      roomManager.persist(roomCode);
      io.to(roomCode).emit('game:state', roomStatePayload(mgr));
      if (mgr.state.phase !== 'LOBBY') {
        const cp = mgr.state.currentPlayer;
        if (cp && cp.id === playerId) {
          scheduleAutoSkip(io, roomCode, playerId);
        }
      }
    });
  });
}

module.exports = { registerSocketHandlers };
