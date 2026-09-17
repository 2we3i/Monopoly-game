// RoomManager.js
// Keeps one engine instance per active room in memory, persists to
// SQLite on every mutation, and tells the platform history when a room is
// created or goes away.

const { GameManager } = require('./GameManager');
const { MafiaGame } = require('../mafia/MafiaGame');
const { CitadelsGame } = require('../citadels/CitadelsGame');
const { BunkerGame } = require('../bunker/BunkerGame');
const { CatanGame } = require('../catan/CatanGame');
const { CosmicGame } = require('../cosmic/CosmicGame');
const { ThroneGame } = require('../throne/ThroneGame');
const { ChpokGame } = require('../chpok/ChpokGame');
const { MemeHypeGame } = require('../memehype/MemeHypeGame');
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
    this.bunkerRooms = new Map();
    this.catanRooms = new Map();
    this.cosmicRooms = new Map();
    this.throneRooms = new Map();
    this.chpokRooms = new Map();
    this.memeHypeRooms = new Map();
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
        } else if (state && state.gameType === 'bunker') {
          this.bunkerRooms.set(roomCode, BunkerGame.fromJSON(state));
        } else if (state && state.gameType === 'catan') {
          this.catanRooms.set(roomCode, CatanGame.fromJSON(state));
        } else if (state && state.gameType === 'cosmic') {
          this.cosmicRooms.set(roomCode, CosmicGame.fromJSON(state));
        } else if (state && state.gameType === 'throne') {
          this.throneRooms.set(roomCode, ThroneGame.fromJSON(state));
        } else if (state && state.gameType === 'chpok') {
          this.chpokRooms.set(roomCode, ChpokGame.fromJSON(state));
        } else if (state && state.gameType === 'memehype') {
          this.memeHypeRooms.set(roomCode, MemeHypeGame.fromJSON(state));
        } else {
          this.rooms.set(roomCode, GameManager.fromPersisted(state, hostId));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to restore room ${roomCode}:`, err.message);
      }
    });
    // eslint-disable-next-line no-console
    console.log(`Restored ${this.roomCount()} room(s) from disk.`);
  }

  roomCount() {
    return this.rooms.size + this.mafiaRooms.size + this.citadelsRooms.size + this.bunkerRooms.size
      + this.catanRooms.size + this.cosmicRooms.size + this.throneRooms.size + this.chpokRooms.size + this.memeHypeRooms.size;
  }

  generateRoomCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code) || this.mafiaRooms.has(code) || this.citadelsRooms.has(code)
      || this.bunkerRooms.has(code) || this.catanRooms.has(code) || this.cosmicRooms.has(code)
      || this.throneRooms.has(code) || this.chpokRooms.has(code) || this.memeHypeRooms.has(code));
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

  // --- Bunker rooms --------------------------------------------------

  createBunkerRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new BunkerGame(code, hostId, settings);
    this.bunkerRooms.set(code, game);
    this.persistBunker(code);
    this._logCreated(code, 'bunker', 'bunker.classic', meta);
    return game;
  }

  getBunkerRoom(roomCode) {
    if (!roomCode) return null;
    return this.bunkerRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistBunker(roomCode) {
    const game = this.bunkerRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteBunkerRoom(roomCode, reason = 'empty') {
    if (!this.bunkerRooms.has(roomCode)) return;
    this.bunkerRooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  // --- Catan rooms ---------------------------------------------------

  createCatanRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new CatanGame(code, hostId, settings);
    this.catanRooms.set(code, game);
    this.persistCatan(code);
    this._logCreated(code, 'catan', 'catan.classic', meta);
    return game;
  }

  getCatanRoom(roomCode) {
    if (!roomCode) return null;
    return this.catanRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistCatan(roomCode) {
    const game = this.catanRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteCatanRoom(roomCode, reason = 'empty') {
    if (!this.catanRooms.has(roomCode)) return;
    this.catanRooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  // --- Cosmic Encounter rooms ----------------------------------------

  createCosmicRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new CosmicGame(code, hostId, settings);
    this.cosmicRooms.set(code, game);
    this.persistCosmic(code);
    this._logCreated(code, 'cosmic', 'cosmic.classic', meta);
    return game;
  }

  getCosmicRoom(roomCode) {
    if (!roomCode) return null;
    return this.cosmicRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistCosmic(roomCode) {
    const game = this.cosmicRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteCosmicRoom(roomCode, reason = 'empty') {
    if (!this.cosmicRooms.has(roomCode)) return;
    this.cosmicRooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  // --- Iron Throne rooms ---------------------------------------------

  createThroneRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new ThroneGame(code, hostId, settings);
    this.throneRooms.set(code, game);
    this.persistThrone(code);
    this._logCreated(code, 'throne', 'throne.classic', meta);
    return game;
  }

  getThroneRoom(roomCode) {
    if (!roomCode) return null;
    return this.throneRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistThrone(roomCode) {
    const game = this.throneRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteThroneRoom(roomCode, reason = 'empty') {
    if (!this.throneRooms.has(roomCode)) return;
    this.throneRooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  // --- ЧПОК rooms ----------------------------------------------------

  createChpokRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new ChpokGame(code, hostId, settings);
    this.chpokRooms.set(code, game);
    this.persistChpok(code);
    this._logCreated(code, 'chpok', 'chpok.party', meta);
    return game;
  }

  getChpokRoom(roomCode) {
    if (!roomCode) return null;
    return this.chpokRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistChpok(roomCode) {
    const game = this.chpokRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteChpokRoom(roomCode, reason = 'empty') {
    if (!this.chpokRooms.has(roomCode)) return;
    this.chpokRooms.delete(roomCode);
    db.deleteRoom(roomCode);
    this._gone(roomCode, reason);
  }

  // --- Meme Hype rooms ----------------------------------------------

  createMemeHypeRoom(hostId, settings, meta = null) {
    const code = this.generateRoomCode();
    const game = new MemeHypeGame(code, hostId, settings);
    this.memeHypeRooms.set(code, game);
    this.persistMemeHype(code);
    this._logCreated(code, 'memehype', 'memehype.party', meta);
    return game;
  }

  getMemeHypeRoom(roomCode) {
    if (!roomCode) return null;
    return this.memeHypeRooms.get(String(roomCode).toUpperCase()) || null;
  }

  persistMemeHype(roomCode) {
    const game = this.memeHypeRooms.get(roomCode);
    if (!game) return;
    db.saveRoom(roomCode, game.hostId, game.toJSON());
  }

  deleteMemeHypeRoom(roomCode, reason = 'empty') {
    if (!this.memeHypeRooms.has(roomCode)) return;
    this.memeHypeRooms.delete(roomCode);
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
    if (this.bunkerRooms.has(code)) return 'bunker';
    if (this.catanRooms.has(code)) return 'catan';
    if (this.cosmicRooms.has(code)) return 'cosmic';
    if (this.throneRooms.has(code)) return 'throne';
    if (this.chpokRooms.has(code)) return 'chpok';
    if (this.memeHypeRooms.has(code)) return 'memehype';
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
