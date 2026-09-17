// testing.js
// Test matches: a Creator can open any mode - even one switched off for
// everybody - to try it out, and such a room never touches real data. It is
// not written to the room log, its match is never recorded, it pays no
// crowns and it does not count towards anybody's statistics.
//
// The Creator arms a test from the panel; the next room that Creator
// creates in that mode (within a few minutes) becomes the test room.

const creatorDb = require('../db/creator');

const ARM_MS = 10 * 60 * 1000;
const armed = new Map(); // accountId -> { modeId, gameId, expiresAt }
let rooms = null;

function testRooms() {
  if (!rooms) {
    try {
      rooms = new Set(creatorDb.testRoomCodes());
    } catch {
      rooms = new Set();
    }
  }
  return rooms;
}

function arm(accountId, modeId) {
  const entry = { modeId, gameId: String(modeId).split('.')[0], expiresAt: Date.now() + ARM_MS };
  armed.set(accountId, entry);
  return entry;
}

function disarm(accountId) {
  armed.delete(accountId);
}

function armedFor(accountId) {
  const entry = armed.get(accountId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    armed.delete(accountId);
    return null;
  }
  return entry;
}

// Called when a room is created. True when it is a test room.
function claim(roomCode, modeId, accountId) {
  if (!accountId) return false;
  const entry = armedFor(accountId);
  if (!entry) return false;
  const gameId = String(modeId).split('.')[0];
  if (entry.modeId !== modeId && !(entry.gameId === gameId && entry.modeId === gameId)) return false;
  armed.delete(accountId);
  testRooms().add(roomCode);
  try {
    creatorDb.addTestRoom(roomCode, modeId, accountId);
  } catch { /* still a test room for this run */ }
  return true;
}

function isTestRoom(roomCode) {
  return !!roomCode && testRooms().has(String(roomCode).toUpperCase());
}

function forget(roomCode) {
  if (!testRooms().delete(roomCode)) return;
  try {
    creatorDb.removeTestRoom(roomCode);
  } catch { /* nothing to clean */ }
}

// A mode that is off for everyone is still open to the Creator who armed a
// test of it.
function bypassesAvailability(accountId, modeId) {
  const entry = armedFor(accountId);
  if (!entry) return false;
  return entry.modeId === modeId || entry.modeId === String(modeId).split('.')[0];
}

module.exports = {
  arm, disarm, armedFor, claim, isTestRoom, forget, bypassesAvailability,
};
