// GameManager.js
// The authoritative rules engine. Every state-changing action goes through
// here and is fully validated server-side - clients only ever send *intents*
// ("I want to roll", "I want to buy tile 5"), never raw state changes.
// This is the core anti-cheat measure: the client cannot set its own money
// or position; it can only ask the server to perform a legal action.

const { BOARD, TILE_TYPES, GROUPS, RAILROAD_IDS, UTILITY_IDS } = require('./Board');
const {
  GameState, GO_SALARY, JAIL_TILE, GO_TO_JAIL_TILE,
  MAX_JAIL_TURNS, JAIL_FINE, PLAYER_COLORS, makePlayer,
} = require('./GameState');

const MAX_PLAYERS = 10;
const MIN_PLAYERS = 2;

class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

class GameManager {
  constructor(roomCode, hostId) {
    this.state = new GameState(roomCode);
    this.hostId = hostId;
  }

  static fromPersisted(data, hostId) {
    const mgr = new GameManager(data.roomCode, hostId);
    mgr.state = GameState.fromJSON(data);
    return mgr;
  }

  // ---------------- Lobby management ----------------

  addPlayer({ playerId, socketId, nickname }) {
    const { state } = this;
    const existing = state.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      return existing;
    }
    if (state.phase !== 'LOBBY') {
      throw new GameError('Game already in progress. Cannot join mid-game.');
    }
    if (state.players.length >= MAX_PLAYERS) {
      throw new GameError('Room is full (max 10 players).');
    }
    const player = makePlayer({
      id: playerId,
      socketId,
      nickname: nickname.slice(0, 20) || 'Player',
      colorIndex: state.players.length,
    });
    if (state.players.length === 0) {
      player.isHost = true;
      this.hostId = player.id;
    }
    state.players.push(player);
    state.addLog(`${player.nickname} joined the room.`, 'PLAYER_JOINED', { name: player.nickname });
    return player;
  }

  removePlayer(playerId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) return;
    if (state.phase === 'LOBBY') {
      state.players = state.players.filter((p) => p.id !== playerId);
      if (player.isHost && state.players.length > 0) {
        state.players[0].isHost = true;
        this.hostId = state.players[0].id;
      }
      state.addLog(`${player.nickname} left the room.`, 'PLAYER_LEFT', { name: player.nickname });
    } else {
      // mid-game: mark disconnected, don't remove (allows reconnect)
      player.connected = false;
      player.socketId = null;
      state.addLog(`${player.nickname} disconnected.`, 'PLAYER_DISCONNECTED', { name: player.nickname });
      // If it was their turn and they're the only one who can act, auto-skip after grace handled by caller
    }
  }

  markDisconnected(playerId) {
    const player = this.state.getPlayer(playerId);
    if (player) {
      player.connected = false;
      player.socketId = null;
      this.state.addLog(`${player.nickname} disconnected.`, 'PLAYER_DISCONNECTED', { name: player.nickname });
    }
  }

  reconnectPlayer(playerId, socketId) {
    const player = this.state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found in this game.');
    if (player.bankrupt) throw new GameError('You have already been eliminated from this game.');
    player.connected = true;
    player.socketId = socketId;
    this.state.addLog(`${player.nickname} reconnected.`, 'PLAYER_RECONNECTED', { name: player.nickname });
    return player;
  }

  startGame(requesterId) {
    const { state } = this;
    if (requesterId !== this.hostId) throw new GameError('Only the host can start the game.');
    if (state.phase !== 'LOBBY') throw new GameError('Game already started.');
    if (state.players.length < MIN_PLAYERS) {
      throw new GameError(`Need at least ${MIN_PLAYERS} players to start.`);
    }
    state.phase = 'ROLLING';
    state.currentPlayerIndex = 0;
    state.turnStartedAt = Date.now();
    state.addLog('The game has started! Good luck.', 'GAME_STARTED');
  }

  // ---------------- Turn helpers ----------------

  assertPlayersTurn(playerId) {
    const cp = this.state.currentPlayer;
    if (!cp || cp.id !== playerId) {
      throw new GameError('It is not your turn.');
    }
    if (cp.bankrupt) throw new GameError('You are bankrupt and cannot act.');
  }

  advanceTurn() {
    const { state } = this;
    const n = state.players.length;
    if (n === 0) return;
    let next = state.currentPlayerIndex;
    for (let i = 0; i < n; i++) {
      next = (next + 1) % n;
      if (!state.players[next].bankrupt) break;
    }
    state.currentPlayerIndex = next;
    state.phase = 'ROLLING';
    state.lastRoll = null;
    state.pendingAction = null;
    state.turnStartedAt = Date.now();
    const cp = state.currentPlayer;
    if (cp) state.addLog(`It's ${cp.nickname}'s turn.`, 'NEW_TURN', { name: cp.nickname });
    this.checkWinCondition();
  }

  checkWinCondition() {
    const { state } = this;
    const active = state.activePlayers();
    if (active.length === 1 && state.players.length > 1) {
      state.phase = 'GAME_OVER';
      state.winnerId = active[0].id;
      state.addLog(`${active[0].nickname} wins the game!`, 'WIN', { name: active[0].nickname });
    }
  }

  // ---------------- Dice / movement ----------------

  rollDice(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    if (state.phase !== 'ROLLING') throw new GameError('You cannot roll right now.');

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const isDouble = d1 === d2;
    const player = state.currentPlayer;

    state.lastRoll = { d1, d2, isDouble, playerId };

    if (player.inJail) {
      return this._handleJailRoll(player, d1, d2, isDouble);
    }

    if (isDouble) {
      player.consecutiveDoubles += 1;
      if (player.consecutiveDoubles >= 3) {
        player.consecutiveDoubles = 0;
        this._sendToJail(player);
        state.addLog(`${player.nickname} rolled doubles three times in a row and was sent to Jail!`, 'SPEEDING_TO_JAIL', { name: player.nickname });
        state.phase = 'ACTION';
        return { speeding: true };
      }
    } else {
      player.consecutiveDoubles = 0;
    }

    this._movePlayer(player, d1 + d2);
    state.phase = 'ACTION';
    return { moved: true, isDouble };
  }

  _handleJailRoll(player, d1, d2, isDouble) {
    const { state } = this;
    if (isDouble) {
      player.inJail = false;
      player.jailTurns = 0;
      state.addLog(`${player.nickname} rolled doubles and got out of Jail!`, 'JAIL_DOUBLES_OUT', { name: player.nickname });
      this._movePlayer(player, d1 + d2);
      state.phase = 'ACTION';
      return { movedFromJail: true };
    }
    player.jailTurns += 1;
    if (player.jailTurns >= MAX_JAIL_TURNS) {
      // must pay fine and move
      player.money -= JAIL_FINE;
      player.inJail = false;
      player.jailTurns = 0;
      state.addLog(`${player.nickname} paid $${JAIL_FINE} after 3 failed attempts and left Jail.`, 'PAID_JAIL_FINE', { name: player.nickname, amount: JAIL_FINE, reason: 'forced' });
      this._movePlayer(player, d1 + d2);
      state.phase = 'ACTION';
      return { paidFineAndMoved: true };
    }
    state.addLog(`${player.nickname} failed to roll doubles in Jail (attempt ${player.jailTurns}/${MAX_JAIL_TURNS}).`, 'JAIL_FAILED_ATTEMPT', { name: player.nickname, attempt: player.jailTurns, max: MAX_JAIL_TURNS });
    state.phase = 'ACTION';
    return { stillInJail: true };
  }

  payJailFine(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    const player = state.currentPlayer;
    if (!player.inJail) throw new GameError('You are not in jail.');
    if (state.phase !== 'ROLLING') throw new GameError('Cannot pay fine right now.');
    if (player.money < JAIL_FINE) throw new GameError('Not enough money to pay the fine.');
    player.money -= JAIL_FINE;
    player.inJail = false;
    player.jailTurns = 0;
    state.addLog(`${player.nickname} paid $${JAIL_FINE} to get out of Jail.`, 'PAID_JAIL_FINE', { name: player.nickname, amount: JAIL_FINE, reason: 'voluntary' });
  }

  useGetOutOfJailCard(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    const player = state.currentPlayer;
    if (!player.inJail) throw new GameError('You are not in jail.');
    if (player.getOutOfJailFreeCards < 1) throw new GameError('You have no Get Out of Jail Free cards.');
    player.getOutOfJailFreeCards -= 1;
    player.inJail = false;
    player.jailTurns = 0;
    state.addLog(`${player.nickname} used a Get Out of Jail Free card.`, 'USED_JAIL_CARD', { name: player.nickname });
  }

  _sendToJail(player) {
    player.inJail = true;
    player.jailTurns = 0;
    player.position = JAIL_TILE;
    player.consecutiveDoubles = 0;
  }

  _movePlayer(player, steps, opts = {}) {
    const { state } = this;
    const oldPos = player.position;
    let newPos = (oldPos + steps) % 40;
    if (newPos < 0) newPos += 40;
    const passedGo = !opts.noGoCollect && steps > 0 && newPos < oldPos;
    player.position = newPos;
    if (passedGo) {
      player.money += GO_SALARY;
      state.addLog(`${player.nickname} passed Start and collected $${GO_SALARY}.`, 'COLLECTED_GO', { name: player.nickname, amount: GO_SALARY });
    }
    this._resolveTile(player);
  }

  _moveToTile(player, tileId, opts = {}) {
    const { state } = this;
    const oldPos = player.position;
    const passedGo = !opts.noGoCollect && tileId < oldPos;
    player.position = tileId;
    if (passedGo) {
      player.money += GO_SALARY;
      state.addLog(`${player.nickname} passed Start and collected $${GO_SALARY}.`, 'COLLECTED_GO', { name: player.nickname, amount: GO_SALARY });
    }
    this._resolveTile(player, opts);
  }

  _resolveTile(player, opts = {}) {
    const { state } = this;
    const tile = BOARD[player.position];

    switch (tile.type) {
      case TILE_TYPES.GO:
        break;
      case TILE_TYPES.TAX:
        player.money -= tile.amount;
        state.freeParkingPot += tile.amount;
        state.addLog(`${player.nickname} paid $${tile.amount} in ${tile.name}.`, 'PAID_TAX', { name: player.nickname, amount: tile.amount, tileId: tile.id });
        break;
      case TILE_TYPES.GO_TO_JAIL:
        this._sendToJail(player);
        state.addLog(`${player.nickname} was sent to Jail!`, 'SENT_TO_JAIL', { name: player.nickname });
        break;
      case TILE_TYPES.CHANCE:
        this._drawCard(player, 'chance');
        break;
      case TILE_TYPES.CHEST:
        this._drawCard(player, 'chest');
        break;
      case TILE_TYPES.FREE_PARKING:
        if (state.freeParkingPot > 0) {
          player.money += state.freeParkingPot;
          state.addLog(`${player.nickname} landed on Free Parking and collected $${state.freeParkingPot}!`, 'FREE_PARKING_COLLECT', { name: player.nickname, amount: state.freeParkingPot });
          state.freeParkingPot = 0;
        }
        break;
      case TILE_TYPES.JAIL:
        // Just visiting, nothing happens
        break;
      case TILE_TYPES.PROPERTY:
      case TILE_TYPES.RAILROAD:
      case TILE_TYPES.UTILITY: {
        const propState = state.properties[tile.id];
        if (!propState.ownerId) {
          if (!opts.skipPendingBuy) {
            state.pendingAction = { type: 'BUY_DECISION', tileId: tile.id, playerId: player.id };
          }
        } else if (propState.ownerId !== player.id && !propState.mortgaged) {
          this._payRent(player, tile, propState);
        }
        break;
      }
      default:
        break;
    }

    this._checkBankruptcyAfterMove(player);
  }

  _computeRent(tile, propState, dice) {
    const { state } = this;
    if (tile.type === TILE_TYPES.PROPERTY) {
      const groupIds = GROUPS[tile.group];
      const ownerHasMonopoly = groupIds.every((id) => state.properties[id].ownerId === propState.ownerId);
      if (propState.houses === 0) {
        return ownerHasMonopoly ? tile.rent[0] * 2 : tile.rent[0];
      }
      return tile.rent[propState.houses];
    }
    if (tile.type === TILE_TYPES.RAILROAD) {
      const ownedCount = RAILROAD_IDS.filter((id) => state.properties[id].ownerId === propState.ownerId).length;
      return tile.rent[Math.min(ownedCount - 1, 3)];
    }
    if (tile.type === TILE_TYPES.UTILITY) {
      const ownedCount = UTILITY_IDS.filter((id) => state.properties[id].ownerId === propState.ownerId).length;
      const multiplier = ownedCount >= 2 ? 10 : 4;
      const rollTotal = dice ? dice.d1 + dice.d2 : (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6));
      return rollTotal * multiplier;
    }
    return 0;
  }

  _payRent(player, tile, propState, doubleRent = false) {
    const { state } = this;
    const owner = state.getPlayer(propState.ownerId);
    if (!owner || owner.bankrupt) return;
    let rent = this._computeRent(tile, propState, state.lastRoll);
    if (doubleRent) rent *= 2;
    player.money -= rent;
    owner.money += rent;
    state.addLog(`${player.nickname} paid $${rent} rent to ${owner.nickname} for ${tile.name}.`, 'PAID_RENT', { name: player.nickname, ownerName: owner.nickname, amount: rent, tileId: tile.id });
  }

  _drawCard(player, deckName) {
    const { state } = this;
    const deck = deckName === 'chance' ? state.chanceDeck : state.chestDeck;
    const card = deck.draw();
    state.addLog(`${player.nickname} drew: ${card.text.en}`, 'DREW_CARD', { name: player.nickname, cardText: card.text });
    state.pendingAction = { type: 'CARD_REVEAL', card, deckName, playerId: player.id };
    this._applyCard(player, card);
  }

  _applyCard(player, card) {
    const { state } = this;
    switch (card.type) {
      case 'MOVE_TO':
        this._moveToTile(player, card.tile, { noGoCollect: card.noGoCollect, skipPendingBuy: false });
        break;
      case 'MOVE_RELATIVE':
        this._movePlayer(player, card.steps, { noGoCollect: true });
        break;
      case 'COLLECT':
        player.money += card.amount;
        break;
      case 'PAY':
        player.money -= card.amount;
        break;
      case 'PAY_EACH_PLAYER':
        state.players.forEach((p) => {
          if (p.id !== player.id && !p.bankrupt) {
            player.money -= card.amount;
            p.money += card.amount;
          }
        });
        break;
      case 'COLLECT_EACH_PLAYER':
        state.players.forEach((p) => {
          if (p.id !== player.id && !p.bankrupt) {
            p.money -= card.amount;
            player.money += card.amount;
          }
        });
        break;
      case 'GO_TO_JAIL':
        this._sendToJail(player);
        break;
      case 'GET_OUT_OF_JAIL':
        player.getOutOfJailFreeCards += 1;
        break;
      case 'REPAIRS': {
        let total = 0;
        Object.values(state.properties).forEach((p) => {
          if (p.ownerId === player.id) {
            if (p.houses === 5) total += card.perHotel;
            else total += p.houses * card.perHouse;
          }
        });
        player.money -= total;
        break;
      }
      case 'MOVE_TO_NEAREST_RAILROAD': {
        const nearest = RAILROAD_IDS.find((id) => id > player.position) ?? RAILROAD_IDS[0];
        this._moveToTile(player, nearest, { skipPendingBuy: false });
        // double rent handled specially if owned
        const propState = state.properties[nearest];
        if (propState.ownerId && propState.ownerId !== player.id && !propState.mortgaged) {
          const tile = BOARD[nearest];
          this._payRent(player, tile, propState, true);
        }
        break;
      }
      case 'MOVE_TO_NEAREST_UTILITY': {
        const nearest = UTILITY_IDS.find((id) => id > player.position) ?? UTILITY_IDS[0];
        this._moveToTile(player, nearest, { skipPendingBuy: false });
        break;
      }
      default:
        break;
    }
  }

  // ---------------- Property actions ----------------

  buyProperty(playerId, tileId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    const player = state.currentPlayer;
    const tile = BOARD[tileId];
    if (!tile || ![TILE_TYPES.PROPERTY, TILE_TYPES.RAILROAD, TILE_TYPES.UTILITY].includes(tile.type)) {
      throw new GameError('That tile cannot be purchased.');
    }
    if (player.position !== tileId) throw new GameError('You can only buy the property you are standing on.');
    const propState = state.properties[tileId];
    if (propState.ownerId) throw new GameError('This property is already owned.');
    if (player.money < tile.price) throw new GameError('Not enough money to buy this property.');
    if (!state.pendingAction || state.pendingAction.type !== 'BUY_DECISION' || state.pendingAction.tileId !== tileId) {
      throw new GameError('No pending purchase decision for this tile.');
    }
    player.money -= tile.price;
    propState.ownerId = player.id;
    state.pendingAction = null;
    state.addLog(`${player.nickname} bought ${tile.name} for $${tile.price}.`, 'BOUGHT_PROPERTY', { name: player.nickname, amount: tile.price, tileId: tile.id });
  }

  declinePurchase(playerId, tileId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    if (!state.pendingAction || state.pendingAction.type !== 'BUY_DECISION' || state.pendingAction.tileId !== tileId) {
      throw new GameError('No pending purchase decision for this tile.');
    }
    const tile = BOARD[tileId];
    state.addLog(`${state.currentPlayer.nickname} declined to buy ${tile.name}.`, 'DECLINED_PURCHASE', { name: state.currentPlayer.nickname, tileId: tile.id });
    state.pendingAction = null;
    // Simple MVP rule: declined property just stays unowned (no live auction UI).
    // Could be extended into a full auction subsystem.
  }

  acknowledgeCard(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    if (!state.pendingAction || state.pendingAction.type !== 'CARD_REVEAL') {
      throw new GameError('No card to acknowledge.');
    }
    // If the card resolution triggered a property landing that needs a buy decision,
    // it will have overwritten pendingAction already inside _applyCard->_resolveTile.
    // Otherwise, clear it.
    if (state.pendingAction.type === 'CARD_REVEAL') {
      state.pendingAction = null;
    }
  }

  mortgageProperty(playerId, tileId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    const tile = BOARD[tileId];
    const propState = state.properties[tileId];
    if (!propState || propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (propState.mortgaged) throw new GameError('Already mortgaged.');
    if (propState.houses > 0) throw new GameError('Sell houses before mortgaging.');
    propState.mortgaged = true;
    player.money += Math.floor(tile.price / 2);
    state.addLog(`${player.nickname} mortgaged ${tile.name}.`, 'MORTGAGED', { name: player.nickname, tileId: tile.id });
  }

  unmortgageProperty(playerId, tileId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    const tile = BOARD[tileId];
    const propState = state.properties[tileId];
    if (!propState || propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (!propState.mortgaged) throw new GameError('This property is not mortgaged.');
    const cost = Math.ceil(tile.price / 2 * 1.1);
    if (player.money < cost) throw new GameError('Not enough money to unmortgage.');
    player.money -= cost;
    propState.mortgaged = false;
    state.addLog(`${player.nickname} paid off the mortgage on ${tile.name}.`, 'UNMORTGAGED', { name: player.nickname, tileId: tile.id });
  }

  buildHouse(playerId, tileId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    const tile = BOARD[tileId];
    if (!tile || tile.type !== TILE_TYPES.PROPERTY) throw new GameError('Houses can only be built on properties.');
    const propState = state.properties[tileId];
    if (propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (propState.mortgaged) throw new GameError('Cannot build on a mortgaged property.');

    const groupIds = GROUPS[tile.group];
    const hasMonopoly = groupIds.every((id) => state.properties[id].ownerId === playerId);
    if (!hasMonopoly) throw new GameError('You need to own the full color group to build houses.');
    if (propState.houses >= 5) throw new GameError('This property already has a hotel.');

    // Even building rule: cannot build a 2nd house on one property in the group
    // until all properties in the group have at least 1 house, etc.
    const minHouses = Math.min(...groupIds.map((id) => state.properties[id].houses));
    if (propState.houses > minHouses) {
      throw new GameError('You must build evenly across the color group.');
    }

    if (player.money < tile.houseCost) throw new GameError('Not enough money to build.');
    player.money -= tile.houseCost;
    propState.houses += 1;
    state.addLog(
      `${player.nickname} built ${propState.houses === 5 ? 'a hotel' : `house #${propState.houses}`} on ${tile.name}.`,
      propState.houses === 5 ? 'BUILT_HOTEL' : 'BUILT_HOUSE',
      { name: player.nickname, tileId: tile.id, houseNumber: propState.houses },
    );
  }

  sellHouse(playerId, tileId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    const tile = BOARD[tileId];
    if (!tile || tile.type !== TILE_TYPES.PROPERTY) throw new GameError('Invalid property.');
    const propState = state.properties[tileId];
    if (propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (propState.houses <= 0) throw new GameError('No houses to sell.');

    const groupIds = GROUPS[tile.group];
    const maxHouses = Math.max(...groupIds.map((id) => state.properties[id].houses));
    if (propState.houses < maxHouses) {
      throw new GameError('You must sell evenly across the color group.');
    }

    propState.houses -= 1;
    player.money += Math.floor(tile.houseCost / 2);
    state.addLog(`${player.nickname} sold a house on ${tile.name}.`, 'SOLD_HOUSE', { name: player.nickname, tileId: tile.id });
  }

  // ---------------- Turn resolution ----------------

  endTurn(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    if (state.pendingAction) {
      throw new GameError('Resolve the pending action before ending your turn.');
    }
    if (state.phase !== 'ACTION') throw new GameError('You cannot end your turn right now.');

    const player = state.currentPlayer;
    if (player.money < 0) {
      throw new GameError('You must resolve your debt (sell/mortgage assets or declare bankruptcy) before ending your turn.');
    }

    // Doubles grant another roll unless sent to jail
    if (state.lastRoll && state.lastRoll.isDouble && !player.inJail && player.consecutiveDoubles > 0) {
      state.phase = 'ROLLING';
      state.lastRoll = null;
      state.addLog(`${player.nickname} rolled doubles and goes again!`, 'DOUBLES_AGAIN', { name: player.nickname });
      return;
    }

    this.advanceTurn();
  }

  _checkBankruptcyAfterMove(player) {
    // We don't auto-bankrupt here; player must actively resolve negative
    // money (mortgage/sell/bankrupt) before ending turn. This keeps agency
    // with the player rather than force-selling assets automatically.
  }

  declareBankruptcy(playerId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    if (player.bankrupt) throw new GameError('Already bankrupt.');

    // Release all properties back to the bank (simple MVP rule - no
    // creditor transfer even if debt was to a specific player, for simplicity
    // we just free the properties; could be extended to transfer to creditor).
    Object.values(state.properties).forEach((p) => {
      if (p.ownerId === playerId) {
        p.ownerId = null;
        p.houses = 0;
        p.mortgaged = false;
      }
    });
    player.bankrupt = true;
    player.money = 0;
    state.addLog(`${player.nickname} declared bankruptcy and is out of the game.`, 'BANKRUPTCY', { name: player.nickname });

    if (state.pendingAction && state.pendingAction.playerId === playerId) {
      state.pendingAction = null;
    }

    this.checkWinCondition();
    if (state.phase !== 'GAME_OVER' && state.currentPlayer && state.currentPlayer.id === playerId) {
      this.advanceTurn();
    }
  }
}

module.exports = { GameManager, GameError, MAX_PLAYERS, MIN_PLAYERS };
