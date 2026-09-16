// spectators.js
// Who is WATCHING a room rather than playing in it.
//
// A spectator has no seat: they are not in the engine's player list, they
// can never act, and nothing they do is persisted. All that exists is this
// in-memory registry, keyed by room code and then by socket - so a watcher
// who closes the tab simply disappears, and a server restart starts every
// room with an empty gallery.
//
// Every game's handler uses the same registry, which is what lets one
// player watch a Mafia room and an Iron Throne room at once without the
// two knowing about each other.

const MAX_SPECTATORS = 50;

// roomCode -> Map(socketId -> viewer)
const byRoom = new Map();
// socketId -> Set(roomCode), so a disconnect is one lookup instead of a
// walk over every room on the server.
const bySocket = new Map();

function seatsOf(roomCode) {
  return byRoom.get(roomCode) || null;
}

function count(roomCode) {
  return seatsOf(roomCode)?.size || 0;
}

// A spectator identity is deliberately thin: enough to render a name in
// the gallery and to recognise the same person coming back, nothing more.
function add(roomCode, socketId, {
  playerId, nickname, accountId = null, avatarUrl = null,
}) {
  if (!roomCode || !socketId) return null;
  let seats = byRoom.get(roomCode);
  if (!seats) {
    seats = new Map();
    byRoom.set(roomCode, seats);
  }
  if (!seats.has(socketId) && seats.size >= MAX_SPECTATORS) return null;
  const viewer = {
    id: playerId,
    socketId,
    nickname: String(nickname || 'Spectator').slice(0, 20),
    accountId: accountId || null,
    isGuest: !accountId,
    avatarUrl: avatarUrl || null,
    since: seats.get(socketId)?.since || Date.now(),
  };
  seats.set(socketId, viewer);
  let rooms = bySocket.get(socketId);
  if (!rooms) {
    rooms = new Set();
    bySocket.set(socketId, rooms);
  }
  rooms.add(roomCode);
  return viewer;
}

function remove(roomCode, socketId) {
  const seats = byRoom.get(roomCode);
  if (seats) {
    seats.delete(socketId);
    if (seats.size === 0) byRoom.delete(roomCode);
  }
  const rooms = bySocket.get(socketId);
  if (rooms) {
    rooms.delete(roomCode);
    if (rooms.size === 0) bySocket.delete(socketId);
  }
}

// Every room this socket was watching, so a disconnect can clean up and
// tell each of those rooms that their gallery changed.
function forgetSocket(socketId) {
  const rooms = [...(bySocket.get(socketId) || [])];
  rooms.forEach((roomCode) => remove(roomCode, socketId));
  return rooms;
}

function clearRoom(roomCode) {
  const seats = byRoom.get(roomCode);
  if (!seats) return [];
  const ids = [...seats.keys()];
  ids.forEach((socketId) => remove(roomCode, socketId));
  return ids;
}

function socketIds(roomCode) {
  return [...(seatsOf(roomCode)?.keys() || [])];
}

// The gallery as the clients see it: no socket ids, oldest watcher first.
function list(roomCode) {
  return [...(seatsOf(roomCode)?.values() || [])]
    .sort((a, b) => a.since - b.since)
    .map(({ socketId, ...rest }) => rest);
}

function isWatching(roomCode, socketId) {
  return !!seatsOf(roomCode)?.has(socketId);
}

module.exports = {
  MAX_SPECTATORS, add, remove, forgetSocket, clearRoom, socketIds, list, count, isWatching,
};
