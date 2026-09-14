// roomSockets.js
// Small helpers every game's socket handler shares.

const { AccessError } = require('../platform/access');

function socketById(io, socketId) {
  if (!socketId) return null;
  return io.sockets.sockets.get(socketId) || null;
}

// Tells one player's socket that it no longer belongs to a room (the room
// was closed, or the player was removed) and detaches it from that room,
// so it stops receiving the room's broadcasts and cannot act in it.
function notifyRemoved(io, socketId, { gameType, roomCode, reason, dataKeys = [] }) {
  const socket = socketById(io, socketId);
  if (!socket) return;
  socket.emit('room:removed', { gameType, roomCode, reason });
  socket.leave(roomCode);
  dataKeys.forEach((key) => { socket.data[key] = null; });
}

// The message a client may see for a failed action. Rule violations and
// permission refusals are explained; anything else is a server bug and is
// logged instead of leaking internals.
function clientMessage(err, ruleErrorClasses = []) {
  if (err instanceof AccessError || ruleErrorClasses.some((C) => err instanceof C)) return err.message;
  // eslint-disable-next-line no-console
  console.error('Unexpected socket handler error:', err);
  return 'Something went wrong processing that action.';
}

function errorPayload(err, ruleErrorClasses = []) {
  return { ok: false, error: clientMessage(err, ruleErrorClasses), code: err.code || null };
}

// Only plain short strings from the client reach the engines as ids.
function idString(value, max = 100) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

module.exports = { socketById, notifyRemoved, clientMessage, errorPayload, idString };
