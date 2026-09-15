// registry.js
// One interface over every game's live rooms, so platform features (the
// admin panel, match recording, blocking a player everywhere) never need
// to know how Monopoly, Mafia or Citadels store a room.
//
// Each game's socket handler registers an adapter:
//
//   type                         'monopoly' | 'mafia' | 'citadels' | 'bunker' | 'catan'
//   rooms()                      iterable of live room objects
//   get(code)                    one live room or null
//   summary(room)                the admin's view of a room (see below)
//   matchSummary(room)           what the recorder needs to log a match
//   close(code, reason)          notify everyone, remove the room
//   kick(code, playerId, reason) remove one player, notify them
//
// summary(room) returns { code, gameType, modeId, hostId, hostNickname,
// hostAccountId, createdAt, phase, stage: 'lobby'|'active'|'finished',
// players: [{ id, nickname, accountId, isGuest, connected, isHost,
// status }], maxPlayers, details }.

const recorder = require('./recorder');

const adapters = new Map();

function register(adapter) {
  adapters.set(adapter.type, adapter);
}

function all() {
  return [...adapters.values()];
}

function listRooms() {
  const out = [];
  adapters.forEach((adapter) => {
    for (const room of adapter.rooms()) {
      try {
        out.push(adapter.summary(room));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Could not summarise a ${adapter.type} room:`, err.message);
      }
    }
  });
  return out;
}

function find(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  for (const adapter of adapters.values()) {
    const room = adapter.get(upper);
    if (room) return { adapter, room, code: upper };
  }
  return null;
}

// Called by every game's broadcast: records match starts and endings.
function observe(type, room) {
  const adapter = adapters.get(type);
  if (!adapter) return;
  try {
    recorder.observe(adapter.matchSummary(room));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Match recording failed for ${type}:`, err.message);
  }
}

function roomsWithAccount(accountId) {
  return listRooms().filter((r) => r.players.some((p) => p.accountId === accountId));
}

module.exports = { register, all, listRooms, find, observe, roomsWithAccount };
