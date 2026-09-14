// RoomManager.js
// Keeps one GameManager instance per active room in memory, persists to
// SQLite on every mutation.

const { GameManager } = require('./GameManager');
const { MafiaGame } = require('../mafia/MafiaGame');
const db = require('../db/database');

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;

class RoomManager {
  constructor() {
    this.rooms = new Map();
    // Mafia rooms live in their own map rather than sharing the Monopoly
    // one: the two engines have different shapes, and keeping them apart
    // means nothing in the Monopoly path has to learn what a Mafia room
    // is. Room codes are still drawn from a single namespace, so a code
    // identifies a room regardless of which game it belongs to.
    this.mafiaRooms = new Map();
    this._loadFromDisk();
    setInterval(() => db.pruneStaleRooms(ROOM_MAX_AGE_MS), 1000 * 60 * 60).unref();
  }

  _loadFromDisk() {
    const rows = db.loadAllRooms();
    rows.forEach(({ roomCode, hostId, state }) => {
      try {
        if (state && state.gameType === 'mafia') {
          this.mafiaRooms.set(roomCode, MafiaGame.fromJSON(state));
        } else {
          this.rooms.set(roomCode, GameManager.fromPersisted(state, hostId));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to restore room ${roomCode}:`, err.message);
      }
    });
    // eslint-disable-next-line no-console
    console.log(`Restored ${this.rooms.size + this.mafiaRooms.size} room(s) from disk.`);
  }

  generateRoomCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code) || this.mafiaRooms.has(code));
    return code;
  }

  // --- Mafia rooms ---------------------------------------------------

  createMafiaRoom(hostId, settings) {
    const code = this.generateRoomCode();
    const game = new MafiaGame(code, hostId, settings);
    this.mafiaRooms.set(code, game);
    this.persistMafia(code);
    return game;
  }

  getMafiaRoom(roomCode) {
    if (!roomCode) return null;
    return this.mafiaRooms.get(roomCode.toUpperCase()) || null;
  }

  persistMafia(roomCode) {
    const game = this.mafiaRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteMafiaRoom(roomCode) {
    this.mafiaRooms.delete(roomCode);
    db.deleteRoom(roomCode);
  }

  // What kind of game a code refers to, for callers that only have the
  // code (a player rejoining from a saved link, for instance).
  roomKind(roomCode) {
    if (!roomCode) return null;
    const code = roomCode.toUpperCase();
    if (this.rooms.has(code)) return 'monopoly';
    if (this.mafiaRooms.has(code)) return 'mafia';
    return null;
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
