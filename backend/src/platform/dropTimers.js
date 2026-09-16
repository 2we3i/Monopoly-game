// dropTimers.js
// The twenty seconds a disconnected player has to come back.
//
// Losing a socket is not losing a game: a reload, a tunnel, a phone
// changing network - all of those drop a connection for a second or two.
// So a disconnect only ARMS a timer here. If the same player rejoins
// before it fires, the timer is disarmed and nothing happened at all; if
// it fires, the room is told to drop that player for good, which each
// game does in its own terms (a death in Mafia, a house handed to the
// computer in the Iron Throne, bankruptcy in Monopoly).
//
// The deadline itself is public: clients read it out of the room state and
// count down, so everyone at the table sees the same number.

const GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS) || 20000;

// roomCode -> Map(playerId -> { at, timer }). Nested rather than keyed by
// a joined string, because a player id is whatever a browser chose to call
// itself and must never be able to collide with another room's key.
const pending = new Map();

function roomTimers(roomCode) {
  return pending.get(roomCode) || null;
}

function disarm(roomCode, playerId) {
  const room = roomTimers(roomCode);
  const entry = room?.get(playerId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  room.delete(playerId);
  if (room.size === 0) pending.delete(roomCode);
  return true;
}

// Arming twice for the same player keeps the FIRST deadline: a player who
// flaps between online and offline must not be able to stretch their grace
// period indefinitely by reconnecting for a moment at a time.
function arm(roomCode, playerId, onExpire, graceMs = GRACE_MS) {
  if (!roomCode || !playerId) return null;
  let room = pending.get(roomCode);
  if (!room) {
    room = new Map();
    pending.set(roomCode, room);
  }
  const existing = room.get(playerId);
  const at = existing ? existing.at : Date.now() + graceMs;
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const current = pending.get(roomCode);
    if (current) {
      current.delete(playerId);
      if (current.size === 0) pending.delete(roomCode);
    }
    try {
      onExpire();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Drop timer for ${playerId} in ${roomCode} failed:`, err.message);
    }
  }, Math.max(0, at - Date.now()));
  timer.unref?.();
  room.set(playerId, { at, timer });
  return at;
}

function deadlineOf(roomCode, playerId) {
  return roomTimers(roomCode)?.get(playerId)?.at || null;
}

// Every armed deadline in one room, as { playerId: timestamp } - what a
// room payload carries so each client can render the countdown.
function deadlines(roomCode) {
  const out = {};
  roomTimers(roomCode)?.forEach((entry, playerId) => { out[playerId] = entry.at; });
  return out;
}

function disarmRoom(roomCode) {
  const room = roomTimers(roomCode);
  if (!room) return;
  room.forEach((entry) => clearTimeout(entry.timer));
  pending.delete(roomCode);
}

module.exports = {
  GRACE_MS, arm, disarm, disarmRoom, deadlineOf, deadlines,
};
