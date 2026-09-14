// RoomManager.js
// Keeps one engine instance per active room in memory, persists to
// SQLite on every mutation, and tells the platform history when a room is
// created or goes away.

const { GameManager } = require('./GameManager');
const { MafiaGame } = require('../mafia/MafiaGame');
const { CitadelsGame } = require('../citadels/CitadelsGame');
const db = require('../db/database');
const platformDb = require('../db/platform');
const recorder = require('../platform/recorder');
const bans = require('../platform/bans');

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;

class RoomManager {
  constructor() {
    this.rooms = new Map();
    // Each game keeps its own map: the engines have different shapes, and
    // keeping them apart means nothing in one game's path has to learn
    // what another game's room is. Room codes are still drawn from a
    // single namespace, so a code identifies a room regardless of game.
    this.mafiaRooms = new Map();
    this.citadelsRooms = new Map();
    this._loadFromDisk();
    setInterval(() => db.pruneStaleRooms(ROOM_MAX_AGE_MS), 1000 * 60 * 60).unref();
  }

  _loadFromDisk() {
    const rows = db.loadAllRooms();
    rows.forEach(({ roomCode, hostId, state }) => {
      try {
        if (state && state.gameType === 'mafia') {
          this.mafiaRooms.set(roomCode, MafiaGame.fromJSON(state));
        } else if (state && state.gameType === 'citadels') {
          this.citadelsRooms.set(roomCode, CitadelsGame.fromJSON(state));
        } else {
          this.rooms.set(roomCode, GameManager.fromPersisted(state, hostId));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to restore room ${roomCode}:`, err.message);
      }
    });
    // eslint-disable-next-line no-console
    console.log(`Restored ${this.rooms.size + this.mafiaRooms.size + this.citadelsRooms.size} room(s) from disk.`);
  }

  generateRoomCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code) || this.mafiaRooms.has(code) || this.citadelsRooms.has(code));
    return code;
  }

  _logCreated(roomCode, gameType, modeId, meta) {
    platformDb.logRoomCreated({
      roomCode,
      gameType,
      modeId,
      hostAccountId: meta?.accountId || null,
      hostNickname: meta?.nickname || null,
    });
  }

  _gone(roomCode, reason) {
    bans.forget(roomCode);
    recorder.roomGone(roomCode, reason);
  }

  // --- Mafia rooms ---------------------------------------------------

  createMafiaRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new MafiaGame(code, hostId, settings);
    this.mafiaRooms.set(code, game);
    this.persistMafia(code);
    this._logCreated(code, 'mafia', 'mafia.classic', meta);
    return game;
  }

  getMafiaRoom(roomCode) {
    if (!roomCode) return null;
    return this.mafiaRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistMafia(roomCode) {
    const game = this.mafiaRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteMafiaRoom(roomCode, reason = 'empty') {
    if (!this.mafiaRooms.has(roomCode)) return;
    this.mafiaRooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  // --- Citadels rooms ------------------------------------------------

  createCitadelsRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new CitadelsGame(code, hostId, settings);
    this.citadelsRooms.set(code, game);
    this.persistCitadels(code);
    this._logCreated(code, 'citadels', 'citadels.classic', meta);
    return game;
  }

  getCitadelsRoom(roomCode) {
    if (!roomCode) return null;
    return this.citadelsRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistCitadels(roomCode) {
    const game = this.citadelsRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteCitadelsRoom(roomCode, reason = 'empty') {
    if (!this.citadelsRooms.has(roomCode)) return;
    this.citadelsRooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  // What kind of game a code refers to, for callers that only have the
  // code (a player rejoining from a saved link, for instance).
  roomKind(roomCode) {
    if (!roomCode) return null;
    const code = String(roomCode).toUpperCase();
    if (this.rooms.has(code)) return 'monopoly';
    if (this.mafiaRooms.has(code)) return 'mafia';
    if (this.citadelsRooms.has(code)) return 'citadels';
    return null;
  }

  // --- Monopoly rooms ------------------------------------------------

  createRoom(hostId, modeId, meta = null) {
    const code = this.generateRoomCode();
    const mgr = new GameManager(code, hostId, modeId);
    this.rooms.set(code, mgr);
    this.persist(code);
    this._logCreated(code, 'monopoly', `monopoly.${mgr.state.modeId}`, meta);
    return mgr;
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(String(roomCode).toUpperCase()) || null;
  }

  persist(roomCode) {
    const mgr = this.rooms.get(roomCode);
    if (!mgr) return;
    db.saveRoom(roomCode, mgr.hostId, mgr.state.toJSON());
  }

  deleteRoom(roomCode, reason = 'empty') {
    if (!this.rooms.has(roomCode)) return;
    this.rooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  cleanupEmptyRoom(roomCode) {
    const mgr = this.rooms.get(roomCode);
    if (!mgr) return;
    const anyoneLeft = mgr.state.players.length > 0;
    if (!anyoneLeft) {
      this.deleteRoom(roomCode, 'empty');
    }
  }
}

module.exports = new RoomManager();
