// bans.js
// Players the admin removed from a room may not simply rejoin it with the
// same code. Kept in memory: a kick is a moderation action on a live room,
// and the room itself does not outlive the process anyway.

const banned = new Map(); // roomCode -> Set(playerId)

function ban(roomCode, playerId) {
  if (!banned.has(roomCode)) banned.set(roomCode, new Set());
  banned.get(roomCode).add(playerId);
}

function isBanned(roomCode, playerId) {
  return !!banned.get(roomCode)?.has(playerId);
}

function forget(roomCode) {
  banned.delete(roomCode);
}

module.exports = { ban, isBanned, forget };
