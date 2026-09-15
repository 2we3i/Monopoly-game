// GameState.js
// Pure data container for one game room.

const { CardDeck, CHANCE_TEMPLATE, CHEST_TEMPLATE } = require('./cards');
const { TILE_TYPES } = require('./boardLayouts/tileTypes');
const { getLayout, DEFAULT_LAYOUT_ID } = require('./boardLayouts');

const STARTING_MONEY = 1500;
const GO_SALARY = 200;
const MAX_JAIL_TURNS = 3;
const JAIL_FINE = 50;

// A mortgaged deed goes back on the market after this many FULL rounds
// of the table (the round it was mortgaged in does not count).
const MORTGAGE_ROUNDS = 10;
// Auctions run on the server's clock; tests shorten them through the
// environment instead of waiting half a minute.
const AUCTION_DURATION_MS = Number(process.env.MONOPOLY_AUCTION_MS) || 30000;
// A bid in the closing seconds keeps the auction open at least this long,
// so an auction cannot be won by bidding in the last instant.
const AUCTION_EXTEND_MS = Math.min(10000, AUCTION_DURATION_MS);
// After a server restart nobody is connected yet: an auction that was
// running gets at least this long for the players to come back.
const AUCTION_RESUME_MS = Math.min(15000, AUCTION_DURATION_MS);
const AUCTION_MIN_BID = 10;
const AUCTION_MIN_STEP = 10;

const PLAYER_COLORS = [
  '#e63946', '#2a9d8f', '#f4a261', '#457b9d',
  '#a663cc', '#ffb703', '#06d6a0', '#ef476f',
  '#118ab2', '#d4622a',
];

function makePlayer({ id, socketId, nickname, colorIndex, avatarUrl = null, accountId = null }) {
  return {
    id,
    socketId,
    nickname,
    avatarUrl,
    accountId,
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
  constructor(roomCode, modeId = DEFAULT_LAYOUT_ID) {
    this.roomCode = roomCode;
    this.modeId = modeId;
    this.layout = getLayout(modeId);
    this.players = [];
    this.properties = {};
    this.currentPlayerIndex = 0;
    this.phase = 'LOBBY';
    this.lastRoll = null;
    this.log = [];
    this.freeParkingPot = 0;
    this.pendingAction = null;
    this.winnerId = null;
    this.turnStartedAt = Date.now();
    this.chanceDeck = new CardDeck(CHANCE_TEMPLATE);
    this.chestDeck = new CardDeck(CHEST_TEMPLATE);
    this.createdAt = Date.now();
    this.lastMove = null;
    // Trades are independent of turn order - unlike dice rolls or
    // property purchases, which only the current player can do, any two
    // players can propose/accept a trade with each other at any time
    // during ACTION or ROLLING phase (not while a buy/card decision is
    // still pending, since that's a single player's immediate decision
    // point). Kept as a flat array rather than nested under a player so
    // every client's single game:state broadcast already contains
    // whatever trades are relevant to them, with no separate fetch.
    this.trades = [];
    this._nextTradeId = 1;
    // Full rounds of the table: a round ends when turn order wraps back to
    // the start. Mortgage timers are measured in these.
    this.round = 1;
    // At most one auction runs at a time; squares that come up for sale
    // while one is running wait in the queue, in order.
    this.auction = null;
    this.auctionQueue = [];
    this.lastAuctionResult = null;
    this._nextAuctionId = 1;

    this.layout.board.forEach((tile) => {
      if (tile.type === TILE_TYPES.PROPERTY || tile.type === TILE_TYPES.RAILROAD || tile.type === TILE_TYPES.UTILITY) {
        // customPrices lets an owner set a specific rent amount for a
        // specific other player ("For the Family" pricing) - keyed by
        // the PAYING player's id, so different visitors can be charged
        // different amounts on the same property. Empty by default;
        // absence of an entry for a given player means "use the normal
        // computed rent", never a silent $0.
        // priceChanges keeps the latest change of each custom price (from,
        // to, delta, percent) so both the owner and the visitor can see how
        // far it moved. mortgagedRound / mortgageExpiresRound are the
        // mortgage timer, in rounds.
        this.properties[tile.id] = {
          ownerId: null,
          houses: 0,
          mortgaged: false,
          customPrices: {},
          priceChanges: {},
          mortgagedRound: null,
          mortgageExpiresRound: null,
        };
      }
    });
  }

  generateTradeId() {
    const id = `trade-${this._nextTradeId}`;
    this._nextTradeId += 1;
    return id;
  }

  generateAuctionId() {
    const id = `auction-${this._nextAuctionId}`;
    this._nextAuctionId += 1;
    return id;
  }

  addLog(message, type = null, params = null) {
    this.log.push({ message, type, params, ts: Date.now() });
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

  toJSON() {
    return {
      // Persisted rows are dispatched on this when the server restarts;
      // rows written before Mafia existed have no gameType and are
      // treated as Monopoly, which is what they are.
      gameType: 'monopoly',
      roomCode: this.roomCode,
      modeId: this.modeId,
      board: this.layout.board,
      sideLength: this.layout.sideLength,
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
      lastMove: this.lastMove,
      trades: this.trades,
      _nextTradeId: this._nextTradeId,
      round: this.round,
      auction: this.auction,
      auctionQueue: this.auctionQueue,
      lastAuctionResult: this.lastAuctionResult,
      _nextAuctionId: this._nextAuctionId,
    };
  }

  static fromJSON(data) {
    const gs = new GameState(data.roomCode, data.modeId || DEFAULT_LAYOUT_ID);
    gs.players = data.players;
    gs.properties = data.properties;
    gs.round = Number.isInteger(data.round) && data.round > 0 ? data.round : 1;
    // Defensive migration: a room persisted before customPrices existed
    // would restore property objects missing that field entirely. Rather
    // than have every downstream read of propState.customPrices need its
    // own null-check, backfill it once here so the invariant "every
    // property object always has a customPrices object" holds for the
    // rest of the codebase, whether the room is brand new or was loaded
    // from disk after a server restart. The same goes for the price
    // history and the mortgage timer: a deed mortgaged before timers
    // existed starts its ten rounds from the moment the room comes back.
    Object.values(gs.properties).forEach((p) => {
      if (!p.customPrices) p.customPrices = {};
      if (!p.priceChanges) p.priceChanges = {};
      if (p.mortgaged && !Number.isInteger(p.mortgageExpiresRound)) {
        p.mortgagedRound = gs.round;
        p.mortgageExpiresRound = gs.round + MORTGAGE_ROUNDS + 1;
      }
      if (!p.mortgaged) {
        p.mortgagedRound = null;
        p.mortgageExpiresRound = null;
      }
    });
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
    gs.players.forEach((p) => { p.connected = false; p.socketId = null; });
    // Trades persisted before a server restart are pending decisions that
    // were never resolved - restoring them lets the two parties still
    // see and act on them after the room comes back, rather than silently
    // losing an in-flight proposal. _nextTradeId is restored too so a
    // fresh id after restart never collides with an already-used one.
    gs.trades = data.trades || [];
    gs._nextTradeId = data._nextTradeId || (gs.trades.length + 1);
    gs.auction = data.auction || null;
    if (gs.auction) {
      gs.auction.endsAt = Math.max(gs.auction.endsAt || 0, Date.now() + AUCTION_RESUME_MS);
    }
    gs.auctionQueue = Array.isArray(data.auctionQueue) ? data.auctionQueue : [];
    gs.lastAuctionResult = data.lastAuctionResult || null;
    gs._nextAuctionId = data._nextAuctionId || 1;
    return gs;
  }
}

module.exports = {
  GameState,
  STARTING_MONEY,
  GO_SALARY,
  MAX_JAIL_TURNS,
  JAIL_FINE,
  PLAYER_COLORS,
  MORTGAGE_ROUNDS,
  AUCTION_DURATION_MS,
  AUCTION_EXTEND_MS,
  AUCTION_RESUME_MS,
  AUCTION_MIN_BID,
  AUCTION_MIN_STEP,
  makePlayer,
};
