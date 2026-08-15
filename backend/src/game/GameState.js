// GameState.js
// Pure data container for one game room. No socket logic here -
// this makes it easy to serialize to the DB and to unit test.

const { BOARD, TILE_TYPES } = require('./Board');
const { CHANCE_TEMPLATE, CHEST_TEMPLATE, CardDeck } = require('./cards');

const STARTING_MONEY = 1500;
const GO_SALARY = 200;
const JAIL_TILE = 10;
const GO_TO_JAIL_TILE = 30;
const MAX_JAIL_TURNS = 3;
const JAIL_FINE = 50;

const PLAYER_COLORS = [
  '#e63946', '#2a9d8f', '#f4a261', '#457b9d',
  '#a663cc', '#ffb703', '#06d6a0', '#ef476f',
  '#118ab2', '#8d99ae',
];

function makePlayer({ id, socketId, nickname, colorIndex }) {
  return {
    id, // stable player id (persists across reconnects)
    socketId, // current socket id, null if disconnected
    nickname,
    color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
    money: STARTING_MONEY,
    position: 0,
    inJail: false,
    jailTurns: 0,
    getOutOfJailFreeCards: 0,
    bankrupt: false,
    connected: true,
    isHost: false,
    consecutiveDoubles: 0,
  };
}

class GameState {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = []; // ordered list, order = turn order
    this.properties = {}; // tileId -> { ownerId, houses, mortgaged }
    this.currentPlayerIndex = 0;
    this.phase = 'LOBBY'; // LOBBY | ROLLING | ACTION | AUCTION | GAME_OVER
    this.lastRoll = null;
    this.log = []; // recent event log, capped
    this.freeParkingPot = 0;
    this.pendingAction = null; // e.g. { type: 'BUY_DECISION', tileId } awaiting current player
    this.winnerId = null;
    this.turnStartedAt = Date.now();
    this.chanceDeck = new CardDeck(CHANCE_TEMPLATE);
    this.chestDeck = new CardDeck(CHEST_TEMPLATE);
    this.createdAt = Date.now();

    // Initialize property ownership map
    BOARD.forEach((tile) => {
      if (tile.type === TILE_TYPES.PROPERTY || tile.type === TILE_TYPES.RAILROAD || tile.type === TILE_TYPES.UTILITY) {
        this.properties[tile.id] = { ownerId: null, houses: 0, mortgaged: false };
      }
    });
  }

  addLog(message) {
    this.log.push({ message, ts: Date.now() });
    if (this.log.length > 60) this.log.shift();
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex] || null;
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  activePlayers() {
    return this.players.filter((p) => !p.bankrupt);
  }

  // ---- Serialization for persistence & sending to clients ----
  toJSON() {
    return {
      roomCode: this.roomCode,
      players: this.players,
      properties: this.properties,
      currentPlayerIndex: this.currentPlayerIndex,
      phase: this.phase,
      lastRoll: this.lastRoll,
      log: this.log,
      freeParkingPot: this.freeParkingPot,
      pendingAction: this.pendingAction,
      winnerId: this.winnerId,
      turnStartedAt: this.turnStartedAt,
      chanceDeck: this.chanceDeck.serialize(),
      chestDeck: this.chestDeck.serialize(),
      createdAt: this.createdAt,
    };
  }

  static fromJSON(data) {
    const gs = new GameState(data.roomCode);
    gs.players = data.players;
    gs.properties = data.properties;
    gs.currentPlayerIndex = data.currentPlayerIndex;
    gs.phase = data.phase;
    gs.lastRoll = data.lastRoll;
    gs.log = data.log || [];
    gs.freeParkingPot = data.freeParkingPot || 0;
    gs.pendingAction = data.pendingAction || null;
    gs.winnerId = data.winnerId || null;
    gs.turnStartedAt = data.turnStartedAt || Date.now();
    gs.createdAt = data.createdAt || Date.now();
    gs.chanceDeck.restore(data.chanceDeck, CHANCE_TEMPLATE);
    gs.chestDeck.restore(data.chestDeck, CHEST_TEMPLATE);
    // mark everyone disconnected until they actually rejoin via socket
    gs.players.forEach((p) => { p.connected = false; p.socketId = null; });
    return gs;
  }
}

module.exports = {
  GameState,
  STARTING_MONEY,
  GO_SALARY,
  JAIL_TILE,
  GO_TO_JAIL_TILE,
  MAX_JAIL_TURNS,
  JAIL_FINE,
  PLAYER_COLORS,
  makePlayer,
};
