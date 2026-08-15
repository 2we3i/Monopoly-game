// socketHandler.js
// All real-time communication lives here. Design principles:
//  1. Clients send *intents* only (roll, buy, endTurn...) - never raw state.
//  2. Every intent is validated by GameManager; errors are sent back only
//     to the requesting socket via 'game:error'.
//  3. After every successful mutation we broadcast the *entire* authoritative
//     state to the room. This is simpler and safer than diffing/patching for
//     an MVP, and 40-tile Monopoly state is small (~few KB), so it's cheap.
//  4. Reconnection: each browser tab generates/stores a persistent playerId
//     in localStorage. Rejoining with the same playerId + roomCode restores
//     the player's seat instead of creating a new one.

const roomManager = require('../game/RoomManager');
const { GameError } = require('../game/GameManager');

const DISCONNECT_GRACE_MS = 1000 * 60 * 10; // 10 min grace period before auto-skip on disconnect
const disconnectTimers = new Map(); // `${roomCode}:${playerId}` -> Timeout

function roomStatePayload(mgr) {
  return mgr.state.toJSON();
}

function broadcastState(io, roomCode) {
  const mgr = roomManager.getRoom(roomCode);
  if (!mgr) return;
  roomManager.persist(roomCode);
  io.to(roomCode).emit('game:state', roomStatePayload(mgr));
  if (process.env.DEBUG_BROADCAST) {
    // eslint-disable-next-line no-console
    console.log(`[broadcast] room=${roomCode} phase=${mgr.state.phase} currentIdx=${mgr.state.currentPlayerIndex} pending=${mgr.state.pendingAction?.type || 'none'}`);
  }
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
      // Force-resolve: if mid-action with debt, just declare bankruptcy for them
      // (a disconnected player who never returns can't leave the game stuck).
      try {
        if (cp.money < 0) {
          mgr.declareBankruptcy(playerId);
        } else {
          mgr.state.pendingAction = null;
          mgr.state.phase = 'ACTION';
          mgr.endTurn(playerId);
        }
        mgr.state.addLog(`${cp.nickname} was auto-skipped after a long disconnect.`);
      } catch (err) {
        // best effort - if endTurn fails for some reason, just advance
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
    // socket.data will hold { roomCode, playerId } once joined
    socket.data.roomCode = null;
    socket.data.playerId = null;

    // ---------------- Room lifecycle ----------------

    socket.on('room:create', ({ nickname, playerId }, cb) => {
      try {
        if (!nickname || typeof nickname !== 'string' || !nickname.trim()) {
          throw new GameError('Nickname is required.');
        }
        const mgr = roomManager.createRoom(playerId);
        const player = mgr.addPlayer({ playerId, socketId: socket.id, nickname: nickname.trim() });
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

    socket.on('room:join', ({ roomCode, nickname, playerId }, cb) => {
      try {
        const mgr = roomManager.getRoom(roomCode);
        if (!mgr) throw new GameError('Room not found. Check the code and try again.');

        // Reconnect path: player already exists in this room
        const existing = mgr.state.getPlayer(playerId);
        let player;
        if (existing) {
          clearDisconnectTimer(mgr.state.roomCode, playerId);
          player = mgr.reconnectPlayer(playerId, socket.id);
        } else {
          if (!nickname || !nickname.trim()) throw new GameError('Nickname is required.');
          player = mgr.addPlayer({ playerId, socketId: socket.id, nickname: nickname.trim() });
        }

        socket.join(mgr.state.roomCode);
        socket.data.roomCode = mgr.state.roomCode;
        socket.data.playerId = player.id;
        roomManager.persist(mgr.state.roomCode);
        cb?.({ ok: true, roomCode: mgr.state.roomCode, playerId: player.id, state: roomStatePayload(mgr) });
        io.to(mgr.state.roomCode).emit('game:state', roomStatePayload(mgr));
        io.to(mgr.state.roomCode).emit('chat:system', { message: `${player.nickname} joined.` });
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('room:rejoinCheck', ({ roomCode, playerId }, cb) => {
      // Lets the client check (without fully joining/creating socket rooms)
      // whether a saved roomCode/playerId pair is still valid, e.g. on page load.
      const mgr = roomManager.getRoom(roomCode);
      if (!mgr) return cb?.({ ok: false });
      const player = mgr.state.getPlayer(playerId);
      if (!player) return cb?.({ ok: false });
      cb?.({ ok: true });
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

    // ---------------- Gameplay intents ----------------
    // Every handler follows the same shape: look up room, call the
    // corresponding validated GameManager method, broadcast on success,
    // send a private error on failure. No handler ever mutates state directly.

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

    // ---------------- Chat ----------------

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

    // ---------------- Disconnect handling ----------------

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const mgr = roomManager.getRoom(roomCode);
      if (!mgr) return;

      if (mgr.state.phase === 'LOBBY') {
        mgr.removePlayer(playerId);
        roomManager.persist(roomCode);
        io.to(roomCode).emit('game:state', roomStatePayload(mgr));
        roomManager.cleanupEmptyRoom(roomCode);
      } else {
        mgr.markDisconnected(playerId);
        roomManager.persist(roomCode);
        io.to(roomCode).emit('game:state', roomStatePayload(mgr));
        // If it's currently their turn, give them a grace period to come back
        // before auto-skipping so the game doesn't stall forever.
        const cp = mgr.state.currentPlayer;
        if (cp && cp.id === playerId) {
          scheduleAutoSkip(io, roomCode, playerId);
        }
      }
    });
  });
}

module.exports = { registerSocketHandlers };
