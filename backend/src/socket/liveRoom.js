// liveRoom.js
// The parts of "being in a live room" that are the same in every game:
// watchers, the twenty-second grace after a disconnect, and giving up.
//
// Each game's handler still owns its own events and its own payload - the
// engines have nothing in common below the surface - but every one of them
// calls into here, so a spectator list, a reconnect countdown or a
// surrender behaves identically whether the room is playing Mafia or the
// Iron Throne. Anything a client is told about those three things comes
// from this file.

const spectators = require('../platform/spectators');
const drops = require('../platform/dropTimers');
const { AccessError } = require('../platform/access');
const { socketById } = require('./roomSockets');

// Why a seat is empty. 'left' and 'surrender' are choices the player made,
// 'timeout' is the grace period running out, 'kicked' is the admin.
const EXIT_REASONS = ['left', 'surrender', 'timeout', 'kicked'];

// --- room payload ----------------------------------------------------

// Adds the parts of a room state that live outside the engine. Called by
// every game's clientState() right before the payload goes out, so the
// two lists can never drift apart from what the server actually holds.
//
// `dropsAt` is the moment this player stops being a player if they do not
// come back - null for everyone who is connected, or already out.
function decorate(state, roomCode) {
  const deadlines = drops.deadlines(roomCode);
  state.spectators = spectators.list(roomCode);
  state.spectatorCount = state.spectators.length;
  state.graceMs = drops.GRACE_MS;
  state.serverTime = Date.now();
  if (Array.isArray(state.players)) {
    state.players = state.players.map((p) => ({ ...p, dropsAt: deadlines[p.id] || null }));
  }
  return state;
}

// --- watching --------------------------------------------------------

// A socket becomes a watcher of one room. Watching is exclusive per
// socket: asking to watch a second room leaves the first, which is what
// stops a client accumulating invisible subscriptions across reconnects.
function watch(socket, roomCode, gameType, viewer) {
  if (socket.data.spectateRoom && socket.data.spectateRoom !== roomCode) {
    unwatch(socket); // eslint-disable-line no-use-before-define
  }
  const seat = spectators.add(roomCode, socket.id, viewer);
  if (!seat) return null;
  socket.join(roomCode);
  socket.data.spectateRoom = roomCode;
  socket.data.spectateGame = gameType;
  return seat;
}

// Returns the room the socket was watching, or null if it was not.
function unwatch(socket) {
  const roomCode = socket.data.spectateRoom || null;
  if (!roomCode) return null;
  spectators.remove(roomCode, socket.id);
  socket.leave(roomCode);
  socket.data.spectateRoom = null;
  socket.data.spectateGame = null;
  return roomCode;
}

// Pushes the watchers' payload to every watcher of a room. Every watcher
// sees exactly the same thing - the one a player with no seat is allowed
// to see - so `build` runs once, and only when somebody is watching.
function sendToSpectators(io, roomCode, event, build) {
  const ids = spectators.socketIds(roomCode);
  if (ids.length === 0) return;
  const payload = build();
  ids.forEach((socketId) => {
    const socket = socketById(io, socketId);
    if (!socket) {
      spectators.remove(roomCode, socketId);
      return;
    }
    socket.emit(event, payload);
  });
}

// A room is gone: detach every watcher and tell them why.
function closeSpectators(io, roomCode, gameType, reason) {
  spectators.clearRoom(roomCode).forEach((socketId) => {
    const socket = socketById(io, socketId);
    if (!socket) return;
    socket.emit('room:removed', { gameType, roomCode, reason, spectator: true });
    socket.leave(roomCode);
    socket.data.spectateRoom = null;
    socket.data.spectateGame = null;
  });
}

// --- the twenty seconds ----------------------------------------------

// Arms the grace period for a player who has just lost their socket.
// `onExpire` is what the game does when nobody came back - it runs on the
// server's clock, never on a client's say-so.
function armDrop(roomCode, playerId, onExpire) {
  return drops.arm(roomCode, playerId, onExpire);
}

function disarmDrop(roomCode, playerId) {
  return drops.disarm(roomCode, playerId);
}

function disarmRoom(roomCode) {
  drops.disarmRoom(roomCode);
}

// --- leaving for good -------------------------------------------------

// Giving up, or running out of grace. Both end the same way - the engine's
// own removePlayer, which is what knows whether a seat becomes a corpse, a
// computer-run house or a bankruptcy - but the reason is kept on the seat
// so the table can be told which of the two it was.
//
// Marking happens BEFORE removePlayer, because an engine may end the game
// inside that call and the final payload has to carry the reason already.
function markExit(game, playerId, reason) {
  const player = game.getPlayer?.(playerId) || game.state?.getPlayer?.(playerId);
  if (!player) return null;
  if (player.exitReason) return player; // already out - never overwrite why
  player.exitReason = EXIT_REASONS.includes(reason) ? reason : 'left';
  player.exitAt = Date.now();
  if (reason === 'surrender') player.surrendered = true;
  return player;
}

// A seat somebody has definitively vacated is not a seat anybody can sit
// in again - not the player who gave it up, and not someone else borrowing
// their id. They are welcome back as a watcher, which is what the client
// does when it sees this code.
function assertSeatReclaimable(player) {
  if (!player || !player.exitReason) return;
  const message = player.exitReason === 'surrender'
    ? 'You gave up this game. You can still watch it.'
    : 'You are out of this game. You can still watch it.';
  throw new AccessError(message, 'SEAT_GONE');
}

module.exports = {
  GRACE_MS: drops.GRACE_MS,
  EXIT_REASONS,
  decorate,
  watch,
  unwatch,
  sendToSpectators,
  closeSpectators,
  armDrop,
  disarmDrop,
  disarmRoom,
  markExit,
  assertSeatReclaimable,
  spectators,
};
