// database.js
// Lightweight SQLite persistence so game rooms survive a server restart.
// Uses better-sqlite3 for simple synchronous access (fine for this workload -
// writes are infrequent relative to a typical web request rate).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'monopoly.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
// synchronous=NORMAL is the recommended pairing with WAL: still durable
// across app/OS crashes (only a rare power-loss window is at risk), while
// avoiding the write-latency cost of the stricter FULL setting.
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    room_code TEXT PRIMARY KEY,
    host_id TEXT,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const upsertStmt = db.prepare(`
  INSERT INTO rooms (room_code, host_id, state_json, updated_at)
  VALUES (@roomCode, @hostId, @stateJson, @updatedAt)
  ON CONFLICT(room_code) DO UPDATE SET
    host_id = excluded.host_id,
    state_json = excluded.state_json,
    updated_at = excluded.updated_at
`);

const getStmt = db.prepare('SELECT * FROM rooms WHERE room_code = ?');
const getAllStmt = db.prepare('SELECT * FROM rooms');
const deleteStmt = db.prepare('DELETE FROM rooms WHERE room_code = ?');
const deleteOldStmt = db.prepare('DELETE FROM rooms WHERE updated_at < ?');

function saveRoom(roomCode, hostId, stateObj) {
  upsertStmt.run({
    roomCode,
    hostId,
    stateJson: JSON.stringify(stateObj),
    updatedAt: Date.now(),
  });
  checkpoint();
}

// Docker containers are frequently stopped with SIGKILL (e.g. `docker kill`,
// OOM, or a forced `docker compose down`) rather than a graceful SIGTERM, so
// we can't always rely on an orderly db.close() to happen. WAL mode is
// crash-safe by design (the WAL replays on next open), but to keep the
// window of "data only in the WAL, not yet in the main file" as small as
// possible, we checkpoint after every write. This is cheap for a
// low-frequency workload like game-state saves (at most a few per second
// even with 10 players actively playing).
function checkpoint() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('WAL checkpoint failed (non-fatal):', err.message);
  }
}

function close() {
  try {
    checkpoint();
    db.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error closing database:', err.message);
  }
}

function loadRoom(roomCode) {
  const row = getStmt.get(roomCode);
  if (!row) return null;
  return { hostId: row.host_id, state: JSON.parse(row.state_json), updatedAt: row.updated_at };
}

function loadAllRooms() {
  return getAllStmt.all().map((row) => ({
    roomCode: row.room_code,
    hostId: row.host_id,
    state: JSON.parse(row.state_json),
    updatedAt: row.updated_at,
  }));
}

function deleteRoom(roomCode) {
  deleteStmt.run(roomCode);
}

function pruneStaleRooms(maxAgeMs) {
  deleteOldStmt.run(Date.now() - maxAgeMs);
}

module.exports = { saveRoom, loadRoom, loadAllRooms, deleteRoom, pruneStaleRooms, close };
