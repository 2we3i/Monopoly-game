// GameManager.js
// The authoritative rules engine. Every state-changing action goes through
// here and is fully validated server-side.

const { TILE_TYPES } = require('./boardLayouts/tileTypes');
const {
  GameState, PLAYER_COLORS, makePlayer, AUCTION_MIN_BID, AUCTION_MIN_STEP,
} = require('./GameState');
const { DEFAULT_LAYOUT_ID } = require('./boardLayouts');

const MAX_PLAYERS = 10;
const MIN_PLAYERS = 2;
const OWNABLE_TYPES = [TILE_TYPES.PROPERTY, TILE_TYPES.RAILROAD, TILE_TYPES.UTILITY];

// "For the Family" prices move in steps: a single change may shift what a
// player is charged by at most a tenth of what they are charged now -
// never less than $1, or a cheap square could not move at all.
const PRICE_STEP_RATIO = 0.1;
function priceStepLimit(current) {
  return Math.max(1, Math.floor(Math.max(0, current) * PRICE_STEP_RATIO));
}

// What the bank pays for a deed sold back to it: its mortgage value.
function bankBuybackValue(tile) {
  return Math.floor((tile?.price || 0) / 2);
}

// A deed going back to the bank loses everything its last owner set up.
function releaseProperty(propState) {
  Object.assign(propState, {
    ownerId: null,
    houses: 0,
    mortgaged: false,
    mortgagedRound: null,
    mortgageExpiresRound: null,
    customPrices: {},
    priceChanges: {},
  });
}

class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

class GameManager {
  constructor(roomCode, hostId, modeId = DEFAULT_LAYOUT_ID, options = {}) {
    this.state = new GameState(roomCode, modeId, options);
    this.hostId = hostId;
    // Tests replace the clock; the server always uses real time.
    this.clock = null;
  }

  _now() {
    return this.clock ? this.clock() : Date.now();
  }

  static fromPersisted(data, hostId) {
    const mgr = new GameManager(data.roomCode, hostId, data.modeId);
    mgr.state = GameState.fromJSON(data);
    return mgr;
  }

  addPlayer({ playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null }) {
    const { state } = this;
    const existing = state.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      if (accountId) {
        existing.nickname = nickname.slice(0, 20) || existing.nickname;
        existing.avatarUrl = avatarUrl;
      }
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
      avatarUrl,
      accountId,
      startingMoney: state.rules.startingMoney,
    });
    // Proof that a later reconnect to this guest seat comes from the same
    // browser; see platform/access.js. Stripped before state is broadcast.
    player.guestKeyHash = accountId ? null : guestKeyHash;
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
        // Only registered players may start a game, so the host's seat
        // goes to one of them when there is one.
        const heir = state.players.find((p) => p.accountId) || state.players[0];
        heir.isHost = true;
        this.hostId = heir.id;
      }
      state.addLog(`${player.nickname} left the room.`, 'PLAYER_LEFT', { name: player.nickname });
    } else {
      player.connected = false;
      player.socketId = null;
      state.addLog(`${player.nickname} disconnected.`, 'PLAYER_DISCONNECTED', { name: player.nickname });
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
    state.round = 1;
    state.addLog('The game has started! Good luck.', 'GAME_STARTED');
  }

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
    const previous = state.currentPlayerIndex;
    let next = previous;
    for (let i = 0; i < n; i++) {
      next = (next + 1) % n;
      if (!state.players[next].bankrupt) break;
    }
    state.currentPlayerIndex = next;
    // Turn order wrapping back past the start of the table closes a round.
    const roundEnded = next <= previous;
    state.phase = 'ROLLING';
    state.lastRoll = null;
    state.pendingAction = null;
    // lastMove records the PREVIOUS player's hop animation so the client
    // can play it once - it has no purpose once the turn has genuinely
    // moved on, and leaving it set was a real bug: every subsequent
    // broadcast (which happens on nearly every action, including the
    // next player's own turn) re-serializes the exact same move over the
    // wire, and since JSON round-tripping never preserves object
    // identity, the client's animation code - which used to compare
    // lastMove by reference to decide "is this a move I haven't played
    // yet" - saw what looked like a brand new move every time and
    // restarted the previous player's hop animation from the beginning,
    // visibly snapping their token backward on the board. Clearing it
    // here means a stale move can only ever be replayed for the single
    // broadcast right after it happened, not for the rest of the game.
    state.lastMove = null;
    state.turnStartedAt = Date.now();
    const cp = state.currentPlayer;
    if (cp) state.addLog(`It's ${cp.nickname}'s turn.`, 'NEW_TURN', { name: cp.nickname });
    if (roundEnded) {
      state.round += 1;
      this._forecloseExpiredMortgages();
    }
    this.checkWinCondition();
  }

  checkWinCondition() {
    const { state } = this;
    const active = state.activePlayers();
    if (active.length === 1 && state.players.length > 1) {
      state.phase = 'GAME_OVER';
      state.winnerId = active[0].id;
      state.auction = null;
      state.auctionQueue = [];
      state.addLog(`${active[0].nickname} wins the game!`, 'WIN', { name: active[0].nickname });
    }
  }

  rollDice(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    if (state.phase !== 'ROLLING') throw new GameError('You cannot roll right now.');
    if (state.auction) throw new GameError('Wait for the auction to finish before rolling.');

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const isDouble = d1 === d2;
    const player = state.currentPlayer;

    state.lastRoll = { d1, d2, isDouble, playerId };
    state.lastMove = null;

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
    const { jailFine, maxJailTurns } = state.rules;
    if (player.jailTurns >= maxJailTurns) {
      player.money -= jailFine;
      player.inJail = false;
      player.jailTurns = 0;
      state.addLog(`${player.nickname} paid $${jailFine} after ${maxJailTurns} failed attempts and left Jail.`, 'PAID_JAIL_FINE', { name: player.nickname, amount: jailFine, reason: 'forced' });
      this._movePlayer(player, d1 + d2);
      state.phase = 'ACTION';
      return { paidFineAndMoved: true };
    }
    state.addLog(`${player.nickname} failed to roll doubles in Jail (attempt ${player.jailTurns}/${maxJailTurns}).`, 'JAIL_FAILED_ATTEMPT', { name: player.nickname, attempt: player.jailTurns, max: maxJailTurns });
    state.phase = 'ACTION';
    return { stillInJail: true };
  }

  payJailFine(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    const player = state.currentPlayer;
    if (!player.inJail) throw new GameError('You are not in jail.');
    if (state.phase !== 'ROLLING') throw new GameError('Cannot pay fine right now.');
    const { jailFine } = state.rules;
    if (player.money < jailFine) throw new GameError('Not enough money to pay the fine.');
    player.money -= jailFine;
    player.inJail = false;
    player.jailTurns = 0;
    state.lastMove = null;
    state.addLog(`${player.nickname} paid $${jailFine} to get out of Jail.`, 'PAID_JAIL_FINE', { name: player.nickname, amount: jailFine, reason: 'voluntary' });
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
    state.lastMove = null;
    state.addLog(`${player.nickname} used a Get Out of Jail Free card.`, 'USED_JAIL_CARD', { name: player.nickname });
  }

  _sendToJail(player) {
    const { state } = this;
    const { JAIL_TILE } = state.layout;
    player.inJail = true;
    player.jailTurns = 0;
    player.position = JAIL_TILE;
    player.consecutiveDoubles = 0;
    state.lastMove = { playerId: player.id, path: [JAIL_TILE], teleport: true };
  }

  static _buildWalkPath(oldPos, newPos, direction, tileCount) {
    const path = [];
    let cursor = oldPos;
    for (let i = 0; i < tileCount && cursor !== newPos; i++) {
      cursor = direction > 0 ? (cursor + 1) % tileCount : (cursor - 1 + tileCount) % tileCount;
      path.push(cursor);
    }
    return path;
  }

  _movePlayer(player, steps, opts = {}) {
    const { state } = this;
    const tileCount = state.layout.board.length;
    const oldPos = player.position;
    let newPos = (oldPos + steps) % tileCount;
    if (newPos < 0) newPos += tileCount;
    const passedGo = !opts.noGoCollect && steps > 0 && newPos < oldPos;
    player.position = newPos;
    state.lastMove = {
      playerId: player.id,
      path: GameManager._buildWalkPath(oldPos, newPos, steps >= 0 ? 1 : -1, tileCount),
      teleport: false,
    };
    if (passedGo) {
      player.money += state.rules.goSalary;
      state.addLog(`${player.nickname} passed Start and collected $${state.rules.goSalary}.`, 'COLLECTED_GO', { name: player.nickname, amount: state.rules.goSalary });
    }
    this._resolveTile(player);
  }

  _moveToTile(player, tileId, opts = {}) {
    const { state } = this;
    const tileCount = state.layout.board.length;
    const oldPos = player.position;
    const passedGo = !opts.noGoCollect && tileId < oldPos;
    player.position = tileId;
    state.lastMove = {
      playerId: player.id,
      path: GameManager._buildWalkPath(oldPos, tileId, 1, tileCount),
      teleport: false,
    };
    if (passedGo) {
      player.money += state.rules.goSalary;
      state.addLog(`${player.nickname} passed Start and collected $${state.rules.goSalary}.`, 'COLLECTED_GO', { name: player.nickname, amount: state.rules.goSalary });
    }
    this._resolveTile(player, opts);
  }

  _resolveTile(player, opts = {}) {
    const { state } = this;
    const tile = state.layout.board[player.position];

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
        break;
      case TILE_TYPES.PROPERTY:
      case TILE_TYPES.RAILROAD:
      case TILE_TYPES.UTILITY: {
        const propState = state.properties[tile.id];
        if (!propState.ownerId) {
          if (!opts.skipPendingBuy && !this._isInAuction(tile.id)) {
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
  }

  _computeRent(tile, propState, dice) {
    const { state } = this;
    const { GROUPS, RAILROAD_IDS, UTILITY_IDS } = state.layout;
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
    // "For the Family" custom pricing: if the owner set a specific price
    // for THIS paying player on THIS property, that figure is charged
    // outright rather than the normal computed rent - it's meant to be
    // read as "here's exactly what you owe", not a multiplier or
    // discount applied on top of the standard formula. It intentionally
    // is NOT doubled by the Chance "advance to nearest railroad, pay
    // double rent" effect either: a custom price is a fixed, explicit
    // number the owner chose, and silently doubling it would violate
    // that explicitness for the sake of a rule interaction the owner
    // likely never considered when setting it.
    const customPrice = propState.customPrices[player.id];
    let rent = typeof customPrice === 'number' ? customPrice : this._computeRent(tile, propState, state.lastRoll);
    if (doubleRent && typeof customPrice !== 'number') rent *= 2;
    player.money -= rent;
    owner.money += rent;
    state.addLog(`${player.nickname} paid $${rent} rent to ${owner.nickname} for ${tile.name}.`, 'PAID_RENT', { name: player.nickname, ownerName: owner.nickname, amount: rent, tileId: tile.id });
  }

  setCustomPrice(ownerId, tileId, targetPlayerId, amount) {
    const { state } = this;
    const owner = state.getPlayer(ownerId);
    if (!owner) throw new GameError('Player not found.');
    const tile = state.layout.board[tileId];
    if (!tile || ![TILE_TYPES.PROPERTY, TILE_TYPES.RAILROAD, TILE_TYPES.UTILITY].includes(tile.type)) {
      throw new GameError('That tile cannot have a custom price.');
    }
    const propState = state.properties[tileId];
    if (propState.ownerId !== ownerId) throw new GameError('You do not own this property.');
    const targetPlayer = state.getPlayer(targetPlayerId);
    if (!targetPlayer) throw new GameError('That player was not found.');
    if (targetPlayerId === ownerId) throw new GameError('You cannot set a custom price for yourself.');

    // Every change is measured against what this player is charged right
    // now - their current custom price, or the normal rent if there is
    // none - and may move it by at most one step (10%) either way.
    // Removing a custom price is a change too: the rent jumps back to
    // normal, so it is only allowed once the two are within one step.
    const normal = this._pricingBaseRent(tile, propState);
    const hasCustom = typeof propState.customPrices[targetPlayerId] === 'number';
    const current = hasCustom ? propState.customPrices[targetPlayerId] : normal;
    let next;
    if (amount !== null) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new GameError('Custom price must be a non-negative number.');
      }
      next = Math.floor(amount);
      if (hasCustom && next === current) throw new GameError(`The special rent is already $${current}.`);
    } else {
      if (!hasCustom) throw new GameError('There is no special rent to remove for this player.');
      next = normal;
    }
    const maxStep = priceStepLimit(current);
    if (Math.abs(next - current) > maxStep) {
      throw new GameError(amount === null
        ? `Normal rent is $${normal} - more than 10% away from the current $${current}. Move the price closer in steps first.`
        : `A single change can move the rent by at most 10% ($${maxStep}): choose between $${Math.max(0, current - maxStep)} and $${current + maxStep}.`);
    }

    const change = {
      from: current,
      to: next,
      delta: next - current,
      percent: current > 0 ? Math.round(((next - current) / current) * 1000) / 10 : null,
      normal,
      at: this._now(),
    };
    const params = {
      name: owner.nickname, targetName: targetPlayer.nickname, amount: next, from: current, delta: change.delta, percent: change.percent, tileId: tile.id,
    };
    if (amount !== null) {
      propState.customPrices[targetPlayerId] = next;
      propState.priceChanges[targetPlayerId] = change;
      state.addLog(`${owner.nickname} changed the special rent for ${targetPlayer.nickname} on ${tile.name}: $${current} -> $${next}.`, 'CUSTOM_PRICE_SET', params);
    } else {
      delete propState.customPrices[targetPlayerId];
      propState.priceChanges[targetPlayerId] = { ...change, cleared: true };
      state.addLog(`${owner.nickname} removed the special rent for ${targetPlayer.nickname} on ${tile.name}.`, 'CUSTOM_PRICE_CLEARED', params);
    }
    return change;
  }

  // The rent a visitor pays today without a family price - what a custom
  // price is measured against. A utility's rent depends on the roll, so it
  // is measured against the average roll of 7.
  _pricingBaseRent(tile, propState) {
    const { state } = this;
    if (tile.type === TILE_TYPES.UTILITY) {
      const owned = state.layout.UTILITY_IDS.filter((id) => state.properties[id].ownerId === propState.ownerId).length;
      return (owned >= 2 ? 10 : 4) * 7;
    }
    return this._computeRent(tile, propState, null);
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
    const { RAILROAD_IDS, UTILITY_IDS, cardRoleTiles } = state.layout;
    switch (card.type) {
      case 'MOVE_TO': {
        const resolvedTileId = cardRoleTiles[card.roleTile];
        this._moveToTile(player, resolvedTileId, { noGoCollect: card.noGoCollect, skipPendingBuy: false });
        break;
      }
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
        const propState = state.properties[nearest];
        if (propState.ownerId && propState.ownerId !== player.id && !propState.mortgaged) {
          const tile = state.layout.board[nearest];
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

  buyProperty(playerId, tileId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    const player = state.currentPlayer;
    const tile = state.layout.board[tileId];
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
    const tile = state.layout.board[tileId];
    state.addLog(`${state.currentPlayer.nickname} declined to buy ${tile.name}.`, 'DECLINED_PURCHASE', { name: state.currentPlayer.nickname, tileId: tile.id });
    state.pendingAction = null;
    // A square nobody buys does not stay on the shelf: every player still
    // in the game gets to bid for it.
    this._queueAuction(tileId, 'DECLINED');
  }

  acknowledgeCard(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    if (!state.pendingAction || state.pendingAction.type !== 'CARD_REVEAL') {
      throw new GameError('No card to acknowledge.');
    }
    if (state.pendingAction.type === 'CARD_REVEAL') {
      state.pendingAction = null;
    }
  }

  mortgageProperty(playerId, tileId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    const tile = state.layout.board[tileId];
    const propState = state.properties[tileId];
    if (!propState || propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (propState.mortgaged) throw new GameError('Already mortgaged.');
    if (propState.houses > 0) throw new GameError('Sell houses before mortgaging.');
    propState.mortgaged = true;
    propState.mortgagedRound = state.round;
    propState.mortgageExpiresRound = state.round + state.rules.mortgageRounds + 1;
    player.money += Math.floor(tile.price / 2);
    state.addLog(`${player.nickname} mortgaged ${tile.name}.`, 'MORTGAGED', { name: player.nickname, tileId: tile.id });
  }

  unmortgageProperty(playerId, tileId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    const tile = state.layout.board[tileId];
    const propState = state.properties[tileId];
    if (!propState || propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (!propState.mortgaged) throw new GameError('This property is not mortgaged.');
    const cost = Math.ceil(tile.price / 2 * 1.1);
    if (player.money < cost) throw new GameError('Not enough money to unmortgage.');
    player.money -= cost;
    propState.mortgaged = false;
    propState.mortgagedRound = null;
    propState.mortgageExpiresRound = null;
    state.addLog(`${player.nickname} paid off the mortgage on ${tile.name}.`, 'UNMORTGAGED', { name: player.nickname, tileId: tile.id });
  }

  buildHouse(playerId, tileId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    const tile = state.layout.board[tileId];
    if (!tile || tile.type !== TILE_TYPES.PROPERTY) throw new GameError('Houses can only be built on properties.');
    const propState = state.properties[tileId];
    if (propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (propState.mortgaged) throw new GameError('Cannot build on a mortgaged property.');

    const groupIds = state.layout.GROUPS[tile.group];
    const hasMonopoly = groupIds.every((id) => state.properties[id].ownerId === playerId);
    if (!hasMonopoly) throw new GameError('You need to own the full color group to build houses.');
    if (propState.houses >= 5) throw new GameError('This property already has a hotel.');

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
    const tile = state.layout.board[tileId];
    if (!tile || tile.type !== TILE_TYPES.PROPERTY) throw new GameError('Invalid property.');
    const propState = state.properties[tileId];
    if (propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (propState.houses <= 0) throw new GameError('No houses to sell.');

    const groupIds = state.layout.GROUPS[tile.group];
    const maxHouses = Math.max(...groupIds.map((id) => state.properties[id].houses));
    if (propState.houses < maxHouses) {
      throw new GameError('You must sell evenly across the color group.');
    }

    propState.houses -= 1;
    player.money += Math.floor(tile.houseCost / 2);
    state.addLog(`${player.nickname} sold a house on ${tile.name}.`, 'SOLD_HOUSE', { name: player.nickname, tileId: tile.id });
  }

  endTurn(playerId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    if (state.pendingAction) {
      throw new GameError('Resolve the pending action before ending your turn.');
    }
    if (state.auction) throw new GameError('Wait for the auction to finish before ending your turn.');
    if (state.phase !== 'ACTION') throw new GameError('You cannot end your turn right now.');

    const player = state.currentPlayer;
    if (player.money < 0) {
      throw new GameError('You must resolve your debt (sell/mortgage assets or declare bankruptcy) before ending your turn.');
    }

    if (state.lastRoll && state.lastRoll.isDouble && !player.inJail && player.consecutiveDoubles > 0) {
      state.phase = 'ROLLING';
      state.lastRoll = null;
      state.addLog(`${player.nickname} rolled doubles and goes again!`, 'DOUBLES_AGAIN', { name: player.nickname });
      return;
    }

    this.advanceTurn();
  }

  declareBankruptcy(playerId) {
    const { state } = this;
    const player = state.getPlayer(playerId);
    if (!player) throw new GameError('Player not found.');
    if (player.bankrupt) throw new GameError('Already bankrupt.');

    Object.values(state.properties).forEach((p) => {
      if (p.ownerId === playerId) {
        // A bankrupt owner's "For the Family" prices were specific to
        // their own choices about who to favor - a property returning
        // to the bank (and eventually a new owner) shouldn't silently
        // carry forward pricing decisions that belonged to someone else
        // and that the new owner never agreed to. Mortgage timers go too.
        releaseProperty(p);
      }
    });
    player.bankrupt = true;
    // Only read by match history to rank the eliminated players.
    player.bankruptAt = Date.now();
    player.money = 0;
    state.addLog(`${player.nickname} declared bankruptcy and is out of the game.`, 'BANKRUPTCY', { name: player.nickname });

    if (state.pendingAction && state.pendingAction.playerId === playerId) {
      state.pendingAction = null;
    }

    // Any trade this now-bankrupt player was party to is no longer
    // meaningful (they may no longer own what they offered, and
    // certainly can't fulfil a money obligation) - remove it rather than
    // leaving a stale, unactionable trade sitting in state forever.
    state.trades = state.trades.filter((t) => t.fromPlayerId !== playerId && t.toPlayerId !== playerId);

    // A bankrupt bidder's bids can never be paid: drop them, and let the
    // best remaining bid lead the auction.
    if (state.auction) {
      const auction = state.auction;
      if (!auction.withdrawn.includes(playerId)) auction.withdrawn.push(playerId);
      auction.bids = auction.bids.filter((b) => b.playerId !== playerId);
      const top = auction.bids.reduce((best, b) => (!best || b.amount > best.amount ? b : best), null);
      auction.highestBid = top ? top.amount : 0;
      auction.highestBidderId = top ? top.playerId : null;
      this._closeAuctionIfDecided();
    }

    this.checkWinCondition();
    if (state.phase !== 'GAME_OVER' && state.currentPlayer && state.currentPlayer.id === playerId) {
      this.advanceTurn();
    }
  }

  // ---------------- Trading ----------------
  //
  // A trade is a proposal from one player to another: each side offers
  // some combination of properties (by tile id) and money. Nothing
  // actually changes hands until the recipient explicitly accepts -
  // proposing or even both parties merely seeing the trade has zero
  // effect on game state. This mirrors a real-world offer/acceptance
  // model rather than an immediate swap, which is what makes it safe for
  // either side to review before committing.
  //
  // The validation at proposal time and the validation at acceptance
  // time are two SEPARATE, equally strict checks over the same rules -
  // deliberately, since the board state can legitimately change in
  // between (the proposer could mortgage a listed property, spend the
  // offered money, trade the same property away in a different deal, or
  // even go bankrupt). Re-validating everything fresh at acceptance,
  // rather than trusting the snapshot taken at proposal time, is what
  // actually prevents a trade from letting someone receive a property
  // that changed hands out from under them, or pay out money that
  // no longer exists to give.

  _validateTradeSideOwnership(playerId, tileIds) {
    const { state } = this;
    tileIds.forEach((tileId) => {
      const tile = state.layout.board[tileId];
      if (!tile || ![TILE_TYPES.PROPERTY, TILE_TYPES.RAILROAD, TILE_TYPES.UTILITY].includes(tile.type)) {
        throw new GameError(`Tile ${tileId} is not a tradable property.`);
      }
      const propState = state.properties[tileId];
      if (propState.ownerId !== playerId) {
        throw new GameError(`${state.getPlayer(playerId)?.nickname || 'That player'} does not own ${tile.name}.`);
      }
      if (propState.houses > 0) {
        throw new GameError(`${tile.name} has houses on it - sell them before trading this property.`);
      }
      // Mortgaged properties CAN legitimately be traded in some rule
      // variants, but this implementation keeps it simple and consistent
      // with how mortgages are surfaced everywhere else: a mortgaged
      // property is disabled for player-facing actions until it's paid
      // off, and trading it away wouldn't transfer the mortgage
      // obligation cleanly (the recipient would suddenly owe a debt they
      // never agreed to as part of the deal). Requiring it to be paid
      // off first keeps every trade's "what changes hands" list fully
      // explicit in offerMoney/requestMoney, with no implicit liabilities
      // riding along on a property tile.
      if (propState.mortgaged) {
        throw new GameError(`${tile.name} is mortgaged - pay it off before trading this property.`);
      }
    });
  }

  proposeTrade(fromPlayerId, { toPlayerId, offerTileIds = [], offerMoney = 0, requestTileIds = [], requestMoney = 0 }) {
    const { state } = this;
    if (state.phase === 'LOBBY' || state.phase === 'GAME_OVER') {
      throw new GameError('Trading is only available during an active game.');
    }
    const fromPlayer = state.getPlayer(fromPlayerId);
    const toPlayer = state.getPlayer(toPlayerId);
    if (!fromPlayer) throw new GameError('Proposing player not found.');
    if (!toPlayer) throw new GameError('The player you are trying to trade with was not found.');
    if (fromPlayer.bankrupt) throw new GameError('You cannot trade after going bankrupt.');
    if (toPlayer.bankrupt) throw new GameError(`${toPlayer.nickname} is bankrupt and cannot trade.`);
    if (fromPlayerId === toPlayerId) throw new GameError('You cannot trade with yourself.');

    const offerIds = [...new Set(offerTileIds.map(Number))];
    const requestIds = [...new Set(requestTileIds.map(Number))];
    const overlap = offerIds.filter((id) => requestIds.includes(id));
    if (overlap.length > 0) {
      throw new GameError('The same property cannot be on both sides of a trade.');
    }
    if (offerIds.length === 0 && requestIds.length === 0 && offerMoney <= 0 && requestMoney <= 0) {
      throw new GameError('A trade must include at least one property or a nonzero amount of money.');
    }
    if (!Number.isFinite(offerMoney) || offerMoney < 0 || !Number.isFinite(requestMoney) || requestMoney < 0) {
      throw new GameError('Trade money amounts must be zero or positive numbers.');
    }

    this._validateTradeSideOwnership(fromPlayerId, offerIds);
    this._validateTradeSideOwnership(toPlayerId, requestIds);

    if (offerMoney > fromPlayer.money) {
      throw new GameError(`You only have $${fromPlayer.money}, not enough to offer $${offerMoney}.`);
    }
    if (requestMoney > toPlayer.money) {
      throw new GameError(`${toPlayer.nickname} only has $${toPlayer.money}, not enough to request $${requestMoney}.`);
    }

    const trade = {
      id: state.generateTradeId(),
      fromPlayerId,
      toPlayerId,
      offerTileIds: offerIds,
      offerMoney,
      requestTileIds: requestIds,
      requestMoney,
      status: 'PENDING',
      createdAt: Date.now(),
    };
    state.trades.push(trade);
    state.addLog(`${fromPlayer.nickname} proposed a trade to ${toPlayer.nickname}.`, 'TRADE_PROPOSED', { name: fromPlayer.nickname, otherName: toPlayer.nickname });
    return trade;
  }

  _getActionableTrade(tradeId, actingPlayerId, requiredRole) {
    const { state } = this;
    const trade = state.trades.find((t) => t.id === tradeId);
    if (!trade) throw new GameError('This trade no longer exists - it may have already been resolved or cancelled.');
    if (trade.status !== 'PENDING') throw new GameError('This trade has already been resolved.');
    if (requiredRole === 'recipient' && trade.toPlayerId !== actingPlayerId) {
      throw new GameError('Only the recipient of a trade can accept or decline it.');
    }
    if (requiredRole === 'either' && trade.fromPlayerId !== actingPlayerId && trade.toPlayerId !== actingPlayerId) {
      throw new GameError('You are not a party to this trade.');
    }
    return trade;
  }

  acceptTrade(actingPlayerId, tradeId) {
    const { state } = this;
    const trade = this._getActionableTrade(tradeId, actingPlayerId, 'recipient');

    // Marking the trade resolved FIRST, before doing any of the actual
    // re-validation or asset movement below, is what makes a duplicate
    // accept (a double-click, or two overlapping game:acceptTrade events
    // arriving close together) a no-op rather than a double-execution:
    // the moment this line runs, _getActionableTrade on any subsequent
    // call for the same tradeId will find status !== 'PENDING' and
    // refuse, even if that second call is already in flight.
    trade.status = 'ACCEPTED';

    const fromPlayer = state.getPlayer(trade.fromPlayerId);
    const toPlayer = state.getPlayer(trade.toPlayerId);
    if (!fromPlayer || !toPlayer || fromPlayer.bankrupt || toPlayer.bankrupt) {
      trade.status = 'CANCELLED';
      throw new GameError('One of the parties to this trade is no longer able to trade (they may have gone bankrupt).');
    }

    // Full re-validation against CURRENT state, not the snapshot taken
    // when the trade was proposed - see the class-level comment above
    // this section for why this second, independent check is the actual
    // safeguard here.
    try {
      this._validateTradeSideOwnership(trade.fromPlayerId, trade.offerTileIds);
      this._validateTradeSideOwnership(trade.toPlayerId, trade.requestTileIds);
      if (trade.offerMoney > fromPlayer.money) {
        throw new GameError(`${fromPlayer.nickname} no longer has enough money to complete this trade.`);
      }
      if (trade.requestMoney > toPlayer.money) {
        throw new GameError(`${toPlayer.nickname} no longer has enough money to complete this trade.`);
      }
    } catch (err) {
      trade.status = 'CANCELLED';
      throw err;
    }

    // Same reasoning as bankruptcy: a property changing hands via trade
    // should not carry forward the PREVIOUS owner's custom pricing to
    // the new owner - it's a decision specific to who set it and why.
    trade.offerTileIds.forEach((tileId) => {
      state.properties[tileId].ownerId = trade.toPlayerId;
      state.properties[tileId].customPrices = {};
      state.properties[tileId].priceChanges = {};
    });
    trade.requestTileIds.forEach((tileId) => {
      state.properties[tileId].ownerId = trade.fromPlayerId;
      state.properties[tileId].customPrices = {};
      state.properties[tileId].priceChanges = {};
    });
    fromPlayer.money += trade.requestMoney - trade.offerMoney;
    toPlayer.money += trade.offerMoney - trade.requestMoney;

    state.trades = state.trades.filter((t) => t.id !== tradeId);
    state.addLog(`${fromPlayer.nickname} and ${toPlayer.nickname} completed a trade.`, 'TRADE_ACCEPTED', { name: fromPlayer.nickname, otherName: toPlayer.nickname });
    return trade;
  }

  declineTrade(actingPlayerId, tradeId) {
    const { state } = this;
    const trade = this._getActionableTrade(tradeId, actingPlayerId, 'recipient');
    trade.status = 'DECLINED';
    state.trades = state.trades.filter((t) => t.id !== tradeId);
    const fromPlayer = state.getPlayer(trade.fromPlayerId);
    const toPlayer = state.getPlayer(trade.toPlayerId);
    state.addLog(`${toPlayer?.nickname || 'A player'} declined a trade from ${fromPlayer?.nickname || 'a player'}.`, 'TRADE_DECLINED', { name: toPlayer?.nickname, otherName: fromPlayer?.nickname });
    return trade;
  }

  cancelTrade(actingPlayerId, tradeId) {
    const { state } = this;
    // The PROPOSER cancelling their own still-pending offer - distinct
    // from declineTrade, which is the recipient's action. Either party
    // being allowed to cancel (rather than only the proposer) would let
    // a recipient dodge a trade without it showing as a decline, which
    // is a minor semantic point but one worth keeping honest in the log.
    const trade = state.trades.find((t) => t.id === tradeId);
    if (!trade) throw new GameError('This trade no longer exists.');
    if (trade.status !== 'PENDING') throw new GameError('This trade has already been resolved.');
    if (trade.fromPlayerId !== actingPlayerId) throw new GameError('Only the player who proposed a trade can cancel it.');
    trade.status = 'CANCELLED';
    state.trades = state.trades.filter((t) => t.id !== tradeId);
    const fromPlayer = state.getPlayer(trade.fromPlayerId);
    state.addLog(`${fromPlayer?.nickname || 'A player'} cancelled a trade offer.`, 'TRADE_CANCELLED', { name: fromPlayer?.nickname });
    return trade;
  }

  // ---------------- Selling to the bank ----------------
  //
  // The way to raise cash for a purchase besides houses and mortgages: the
  // bank buys a deed back for its mortgage value and the square becomes
  // free again. Only on the seller's own turn, like building and
  // mortgaging, and never with buildings still standing in the group.

  sellPropertyToBank(playerId, tileId) {
    this.assertPlayersTurn(playerId);
    const { state } = this;
    const id = Number(tileId);
    const tile = state.layout.board[id];
    if (!tile || !OWNABLE_TYPES.includes(tile.type)) throw new GameError('That tile cannot be sold.');
    const propState = state.properties[id];
    if (propState.ownerId !== playerId) throw new GameError('You do not own this property.');
    if (propState.mortgaged) throw new GameError('A mortgaged property cannot be sold - pay off the mortgage first.');
    if (tile.type === TILE_TYPES.PROPERTY && state.layout.GROUPS[tile.group].some((gid) => state.properties[gid].houses > 0)) {
      throw new GameError('Sell the houses in this color group first.');
    }
    const player = state.getPlayer(playerId);
    const amount = bankBuybackValue(tile);
    player.money += amount;
    releaseProperty(propState);
    state.addLog(`${player.nickname} sold ${tile.name} to the bank for $${amount}.`, 'SOLD_TO_BANK', { name: player.nickname, amount, tileId: tile.id });
    return amount;
  }

  // ---------------- Mortgage timers ----------------
  //
  // A mortgaged deed stays with its owner for MORTGAGE_ROUNDS full rounds.
  // If it is still mortgaged when the next round begins, the bank takes it
  // back and puts it up for auction; the owner keeps the mortgage money
  // they already received.

  _forecloseExpiredMortgages() {
    const { state } = this;
    Object.keys(state.properties).map(Number).sort((a, b) => a - b).forEach((tileId) => {
      const propState = state.properties[tileId];
      if (!propState.ownerId || !propState.mortgaged) return;
      if (!Number.isInteger(propState.mortgageExpiresRound) || state.round < propState.mortgageExpiresRound) return;
      const tile = state.layout.board[tileId];
      const owner = state.getPlayer(propState.ownerId);
      const previousOwnerId = propState.ownerId;
      releaseProperty(propState);
      state.addLog(`The mortgage on ${tile.name} ran out - it goes to auction.`, 'MORTGAGE_EXPIRED', { name: owner?.nickname || '', tileId });
      this._queueAuction(tileId, 'MORTGAGE_EXPIRED', previousOwnerId);
    });
  }

  // ---------------- Auctions ----------------
  //
  // Every player still in the game takes part. Bids are checked against
  // the bidder's cash when they are placed AND again when the auction
  // closes (money can be spent in between); the best bid that can still
  // be paid wins. The auction closes when its timer runs out or when
  // nobody is left to outbid the leader. The timer itself lives on the
  // server (see socketHandler), so every client counts down to the same
  // endsAt.

  _isInAuction(tileId) {
    const { state } = this;
    return state.auction?.tileId === tileId || state.auctionQueue.some((entry) => entry.tileId === tileId);
  }

  _queueAuction(tileId, reason, previousOwnerId = null) {
    const { state } = this;
    if (this._isInAuction(tileId)) return;
    const entry = { tileId, reason, previousOwnerId };
    if (state.auction) state.auctionQueue.push(entry);
    else this._startAuction(entry);
  }

  _startAuction({ tileId, reason, previousOwnerId = null }) {
    const { state } = this;
    if (state.phase === 'GAME_OVER') return;
    const participants = state.activePlayers().map((p) => p.id);
    if (participants.length === 0) return;
    const now = this._now();
    state.auction = {
      id: state.generateAuctionId(),
      tileId,
      reason,
      previousOwnerId,
      startedAt: now,
      endsAt: now + state.rules.auctionMs,
      duration: state.rules.auctionMs,
      minBid: AUCTION_MIN_BID,
      minStep: AUCTION_MIN_STEP,
      highestBid: 0,
      highestBidderId: null,
      bids: [],
      participants,
      withdrawn: [],
    };
    const tile = state.layout.board[tileId];
    state.addLog(`${tile.name} is up for auction.`, 'AUCTION_STARTED', { tileId, reason });
  }

  _activeBidders(auction) {
    return auction.participants.filter((id) => !auction.withdrawn.includes(id) && !this.state.getPlayer(id)?.bankrupt);
  }

  _getRunningAuction(playerId, auctionId) {
    const { state } = this;
    const auction = state.auction;
    if (!auction || (auctionId && auction.id !== auctionId)) throw new GameError('This auction is no longer running.');
    if (this._now() >= auction.endsAt) throw new GameError('The auction has already closed.');
    const player = state.getPlayer(playerId);
    if (!player || !auction.participants.includes(playerId)) throw new GameError('You are not taking part in this auction.');
    if (player.bankrupt) throw new GameError('You are bankrupt and cannot bid.');
    if (auction.withdrawn.includes(playerId)) throw new GameError('You have already dropped out of this auction.');
    return { auction, player };
  }

  placeBid(playerId, auctionId, amount) {
    const { auction, player } = this._getRunningAuction(playerId, auctionId);
    if (auction.highestBidderId === playerId) throw new GameError('You already hold the highest bid.');
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value)) throw new GameError('Enter a bid amount.');
    const min = auction.highestBidderId ? auction.highestBid + auction.minStep : auction.minBid;
    if (value < min) throw new GameError(`The lowest bid you can make now is $${min}.`);
    if (value > player.money) throw new GameError(`You only have $${player.money} - not enough for a $${value} bid.`);
    const now = this._now();
    auction.highestBid = value;
    auction.highestBidderId = playerId;
    auction.bids.push({ playerId, amount: value, at: now });
    const extendMs = Math.min(10000, this.state.rules.auctionMs);
    if (auction.endsAt - now < extendMs) auction.endsAt = now + extendMs;
    this._closeAuctionIfDecided();
    return value;
  }

  withdrawFromAuction(playerId, auctionId) {
    const { auction } = this._getRunningAuction(playerId, auctionId);
    if (auction.highestBidderId === playerId) throw new GameError('You hold the highest bid and cannot drop out.');
    auction.withdrawn.push(playerId);
    this._closeAuctionIfDecided();
  }

  // Called by the server's timer (and before every action, so a late bid
  // can never land on an auction that should already be over).
  tickAuction(now = this._now()) {
    const { auction } = this.state;
    if (!auction || now < auction.endsAt) return false;
    this._resolveAuction();
    return true;
  }

  _closeAuctionIfDecided() {
    const { auction } = this.state;
    if (!auction) return false;
    const active = this._activeBidders(auction);
    const decided = auction.highestBidderId
      ? active.every((id) => id === auction.highestBidderId)
      : active.length === 0;
    if (decided) this._resolveAuction();
    return decided;
  }

  _resolveAuction() {
    const { state } = this;
    const auction = state.auction;
    if (!auction) return;
    state.auction = null;
    const tile = state.layout.board[auction.tileId];
    const propState = state.properties[auction.tileId];
    const winning = [...auction.bids]
      .sort((a, b) => b.amount - a.amount || a.at - b.at)
      .find((bid) => {
        const bidder = state.getPlayer(bid.playerId);
        return bidder && !bidder.bankrupt && bidder.money >= bid.amount;
      });

    if (winning && !propState.ownerId) {
      const winner = state.getPlayer(winning.playerId);
      winner.money -= winning.amount;
      releaseProperty(propState);
      propState.ownerId = winner.id;
      state.lastAuctionResult = {
        auctionId: auction.id, tileId: auction.tileId, reason: auction.reason, winnerId: winner.id, amount: winning.amount, at: this._now(),
      };
      state.addLog(`${winner.nickname} won ${tile.name} at auction for $${winning.amount}.`, 'AUCTION_WON', { name: winner.nickname, amount: winning.amount, tileId: tile.id });
    } else {
      state.lastAuctionResult = {
        auctionId: auction.id, tileId: auction.tileId, reason: auction.reason, winnerId: null, amount: 0, at: this._now(),
      };
      state.addLog(`Nobody bought ${tile.name} at auction - it stays with the bank.`, 'AUCTION_UNSOLD', { tileId: tile.id });
    }

    while (!state.auction && state.auctionQueue.length > 0) {
      const next = state.auctionQueue.shift();
      if (!state.properties[next.tileId].ownerId) this._startAuction(next);
    }
  }
}

module.exports = {
  GameManager, GameError, MAX_PLAYERS, MIN_PLAYERS, priceStepLimit, bankBuybackValue,
};
