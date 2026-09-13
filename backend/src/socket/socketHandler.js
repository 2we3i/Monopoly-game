// socketHandler.js
// All real-time communication lives here.

const roomManager = require('../game/RoomManager');
const { GameError } = require('../game/GameManager');
const { LAYOUT_OPTIONS } = require('../game/boardLayouts');
const accountsDb = require('../db/accounts');
const sessionToken = require('../auth/sessionToken');

const DISCONNECT_GRACE_MS = 1000 * 60 * 10;
const disconnectTimers = new Map();

function resolveAccountFromToken(token) {
  if (!token) return null;
  const accountId = sessionToken.verify(token);
  if (!accountId) return null;
  const row = accountsDb.findById(accountId);
  if (!row) return null;
  return accountsDb.toPublicAccount(row);
}

function roomStatePayload(mgr) {
  return mgr.state.toJSON();
}

function broadcastState(io, roomCode) {
  const mgr = roomManager.getRoom(roomCode);
  if (!mgr) return;
  roomManager.persist(roomCode);
  io.to(roomCode).emit('game:state', roomStatePayload(mgr));
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

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;

    socket.on('room:create', ({ nickname, playerId, modeId, token }, cb) => {
      try {
        const account = resolveAccountFromToken(token);
        const effectivePlayerId = account ? account.id : playerId;
        const effectiveNickname = account ? account.nickname : nickname;
        const effectiveAvatarUrl = account ? account.avatarPath : null;

        if (!effectiveNickname || typeof effectiveNickname !== 'string' || !effectiveNickname.trim()) {
          throw new GameError('Nickname is required.');
        }
        if (modeId && !LAYOUT_OPTIONS.some((opt) => opt.id === modeId)) {
          throw new GameError(`Unknown game mode "${modeId}".`);
        }
        const mgr = roomManager.createRoom(effectivePlayerId, modeId);
        const player = mgr.addPlayer({
          playerId: effectivePlayerId,
          socketId: socket.id,
          nickname: effectiveNickname.trim(),
          avatarUrl: effectiveAvatarUrl,
          accountId: account ? account.id : null,
        });
        socket.join(mgr.state.roomCode);
        socket.data.roomCode = mgr.state.roomCode;
        socket.data.playerId = player.id;
        roomManager.persist(mgr.state.roomCode);
        cb?.({ ok: true, roomCode: mgr.state.roomCode, playerId: player.id, state: roomStatePayload(mgr) });
        io.to(mgr.state.roomCode).emit('game:state', roomStatePayload(mgr));
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('room:join', ({ roomCode, nickname, playerId, token }, cb) => {
      try {
        const mgr = roomManager.getRoom(roomCode);
        if (!mgr) throw new GameError('Room not found. Check the code and try again.');

        const account = resolveAccountFromToken(token);
        const effectivePlayerId = account ? account.id : playerId;
        const effectiveNickname = account ? account.nickname : nickname;
        const effectiveAvatarUrl = account ? account.avatarPath : null;

        const existing = mgr.state.getPlayer(effectivePlayerId);
        let player;
        if (existing) {
          clearDisconnectTimer(mgr.state.roomCode, effectivePlayerId);
          player = mgr.reconnectPlayer(effectivePlayerId, socket.id);
          if (account) {
            player = mgr.addPlayer({
              playerId: effectivePlayerId,
              socketId: socket.id,
              nickname: effectiveNickname.trim(),
              avatarUrl: effectiveAvatarUrl,
              accountId: account.id,
            });
          }
        } else {
          if (!effectiveNickname || !effectiveNickname.trim()) throw new GameError('Nickname is required.');
          player = mgr.addPlayer({
            playerId: effectivePlayerId,
            socketId: socket.id,
            nickname: effectiveNickname.trim(),
            avatarUrl: effectiveAvatarUrl,
            accountId: account ? account.id : null,
          });
        }

        socket.join(mgr.state.roomCode);
        socket.data.roomCode = mgr.state.roomCode;
        socket.data.playerId = player.id;
        roomManager.persist(mgr.state.roomCode);
        cb?.({ ok: true, roomCode: mgr.state.roomCode, playerId: player.id, state: roomStatePayload(mgr) });
        io.to(mgr.state.roomCode).emit('game:state', roomStatePayload(mgr));
        io.to(mgr.state.roomCode).emit('chat:system', { message: `${player.nickname} joined.`, type: 'PLAYER_JOINED_CHAT', params: { name: player.nickname } });
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('room:rejoinCheck', ({ roomCode, playerId }, cb) => {
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
    });

    socket.on('room:start', () => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return sendError(socket, 'Room not found.');
      try {
        mgr.startGame(socket.data.playerId);
        broadcastState(io, mgr.state.roomCode);
      } catch (err) {
        sendError(socket, err.message);
      }
    });

    const withGame = (handler) => (payload) => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return sendError(socket, 'You are not in an active room.');
      try {
        handler(mgr, payload || {});
        broadcastState(io, mgr.state.roomCode);
      } catch (err) {
        if (err instanceof GameError) sendError(socket, err.message);
        else {
          // eslint-disable-next-line no-console
          console.error('Unexpected game error:', err);
          sendError(socket, 'Something went wrong processing that action.');
        }
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

    socket.on('chat:message', ({ text }) => {
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
