// RoomManager.js
// Keeps one GameManager instance per active room in memory, persists to
// SQLite on every mutation.

const { GameManager } = require('./GameManager');
const db = require('../db/database');

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._loadFromDisk();
    setInterval(() => db.pruneStaleRooms(ROOM_MAX_AGE_MS), 1000 * 60 * 60).unref();
  }

  _loadFromDisk() {
    const rows = db.loadAllRooms();
    rows.forEach(({ roomCode, hostId, state }) => {
      try {
        const mgr = GameManager.fromPersisted(state, hostId);
        this.rooms.set(roomCode, mgr);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to restore room ${roomCode}:`, err.message);
      }
    });
    // eslint-disable-next-line no-console
    console.log(`Restored ${this.rooms.size} room(s) from disk.`);
  }

  generateRoomCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostId, modeId) {
    const code = this.generateRoomCode();
    const mgr = new GameManager(code, hostId, modeId);
    this.rooms.set(code, mgr);
    this.persist(code);
    return mgr;
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(roomCode.toUpperCase()) || null;
  }

  persist(roomCode) {
    const mgr = this.rooms.get(roomCode);
    if (!mgr) return;
    db.saveRoom(roomCode, mgr.hostId, mgr.state.toJSON());
  }

  deleteRoom(roomCode) {
    this.rooms.delete(roomCode);
    db.deleteRoom(roomCode);
  }

  cleanupEmptyRoom(roomCode) {
    const mgr = this.rooms.get(roomCode);
    if (!mgr) return;
    const anyoneLeft = mgr.state.players.length > 0;
    if (!anyoneLeft) {
      this.deleteRoom(roomCode);
    }
  }
}

module.exports = new RoomManager();
