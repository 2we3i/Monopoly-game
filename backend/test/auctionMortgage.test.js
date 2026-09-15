// Deterministic tests of auctions, mortgage timers, selling to the bank to
// afford a purchase, and restoring all of it from a saved room.

const { GameManager, GameError, bankBuybackValue } = require('../src/game/GameManager');
const {
  GameState, MORTGAGE_ROUNDS, AUCTION_MIN_BID, AUCTION_MIN_STEP, AUCTION_DURATION_MS, AUCTION_EXTEND_MS,
} = require('../src/game/GameState');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertThrows(fn, pattern, msg) {
  let threw = false;
  let errMsg = '';
  try {
    fn();
  } catch (e) {
    threw = e instanceof GameError;
    errMsg = e.message;
  }
  assert(threw, `${msg} (expected a GameError, none was thrown${errMsg ? `; got "${errMsg}"` : ''})`);
  if (pattern) assert(pattern.test(errMsg), `${msg} (error "${errMsg}" did not match ${pattern})`);
}

function freshGame(names = ['Alice', 'Bob', 'Carol']) {
  const mgr = new GameManager('AUCT1', 'p1');
  names.forEach((nickname, i) => mgr.addPlayer({ playerId: `p${i + 1}`, socketId: `s${i + 1}`, nickname }));
  mgr.startGame('p1');
  let now = 1000000;
  mgr.clock = () => now;
  const advance = (ms) => {
    now += ms;
    return now;
  };
  return { mgr, state: mgr.state, advance };
}

const properties = (state) => state.layout.board.filter((t) => t.type === 'PROPERTY');

// Puts the current player on an unowned square with the buy decision open.
function landOn(mgr, tileId) {
  const { state } = mgr;
  const player = state.currentPlayer;
  player.position = tileId;
  state.phase = 'ACTION';
  state.lastRoll = { d1: 1, d2: 2, isDouble: false, playerId: player.id };
  state.pendingAction = { type: 'BUY_DECISION', tileId, playerId: player.id };
  return player;
}

// Every player still in the game ends one turn: exactly one full round.
function playRound(mgr) {
  const { state } = mgr;
  const count = state.activePlayers().length;
  for (let i = 0; i < count; i += 1) {
    const cp = state.currentPlayer;
    state.phase = 'ACTION';
    state.pendingAction = null;
    state.lastRoll = null;
    mgr.endTurn(cp.id);
  }
}

function main() {
  // --- Pass starts an auction -------------------------------------------
  {
    const { mgr, state } = freshGame();
    const tile = properties(state)[0];
    landOn(mgr, tile.id);
    mgr.declinePurchase('p1', tile.id);
    const auction = state.auction;
    assert(auction && auction.tileId === tile.id && auction.reason === 'DECLINED', 'passing on a square must put it up for auction');
    assert(auction.participants.length === 3, 'every player still in the game takes part, including the one who passed');
    assert(auction.endsAt - auction.startedAt === AUCTION_DURATION_MS, 'the auction runs for the configured time');
    assert(state.properties[tile.id].ownerId === null, 'nobody owns the square while it is being auctioned');
    assert(state.log.some((l) => l.type === 'AUCTION_STARTED'), 'the auction start is logged for everyone');
    assertThrows(() => mgr.endTurn('p1'), /auction/i, 'the turn cannot end while the auction runs');
    assertThrows(() => mgr.declinePurchase('p1', tile.id), /No pending/i, 'a second pass on the same square is refused');
    mgr._queueAuction(tile.id, 'DECLINED');
    assert(state.auctionQueue.length === 0 && state.auction.id === auction.id, 'the same square is never auctioned twice at once');

    const other = state.getPlayer('p2');
    other.position = tile.id;
    state.pendingAction = null;
    mgr._resolveTile(other);
    assert(state.pendingAction === null, 'landing on a square that is up for auction offers no purchase');
    console.log('✓ passing on a square starts one auction for every player and blocks the turn');
  }

  // --- Bidding rules ------------------------------------------------------
  {
    const { mgr, state, advance } = freshGame();
    const tile = properties(state)[1];
    landOn(mgr, tile.id);
    mgr.declinePurchase('p1', tile.id);
    const { id } = state.auction;

    assertThrows(() => mgr.placeBid('p2', id, AUCTION_MIN_BID - 1), /lowest bid/i, 'a first bid below the minimum is refused');
    mgr.placeBid('p2', id, AUCTION_MIN_BID);
    assert(state.auction.highestBidderId === 'p2' && state.auction.highestBid === AUCTION_MIN_BID, 'a valid bid leads');
    assertThrows(() => mgr.placeBid('p2', id, 100), /already hold/i, 'the leader cannot outbid themselves');
    assertThrows(() => mgr.placeBid('p3', id, AUCTION_MIN_BID + AUCTION_MIN_STEP - 1), /lowest bid/i, 'a raise below the minimum step is refused');
    assertThrows(() => mgr.placeBid('p3', id, state.getPlayer('p3').money + 1), /only have/i, 'a bid above the bidder\'s cash is refused');
    assertThrows(() => mgr.placeBid('p3', 'auction-999', 50), /no longer running/i, 'a bid for a finished auction is refused');
    assertThrows(() => mgr.placeBid('nobody', id, 50), /not taking part/i, 'a stranger cannot bid');
    assertThrows(() => mgr.withdrawFromAuction('p2', id), /cannot drop out/i, 'the leader cannot drop out');

    const now = advance(AUCTION_DURATION_MS - 1000);
    mgr.placeBid('p3', id, AUCTION_MIN_BID + AUCTION_MIN_STEP);
    assert(state.auction.endsAt === now + AUCTION_EXTEND_MS, 'a bid in the closing seconds extends the auction');

    advance(AUCTION_EXTEND_MS);
    assertThrows(() => mgr.placeBid('p1', id, 500), /closed/i, 'a bid after the deadline is refused even before the timer fires');
    console.log('✓ bids are validated (minimum, step, cash, leader, participants, deadline) and late bids extend the clock');
  }

  // --- Closing early when everyone else drops out ------------------------
  {
    const { mgr, state } = freshGame();
    const tile = properties(state)[2];
    landOn(mgr, tile.id);
    mgr.declinePurchase('p1', tile.id);
    const { id } = state.auction;
    const bob = state.getPlayer('p2');
    const before = bob.money;
    mgr.placeBid('p2', id, 60);
    mgr.withdrawFromAuction('p1', id);
    assert(state.auction, 'the auction goes on while someone can still outbid the leader');
    assertThrows(() => mgr.withdrawFromAuction('p1', id), /already dropped out/i, 'dropping out twice is refused');
    mgr.withdrawFromAuction('p3', id);
    assert(state.auction === null, 'the auction closes as soon as nobody is left to outbid the leader');
    assert(state.properties[tile.id].ownerId === 'p2' && bob.money === before - 60, 'the highest bidder pays and gets the square');
    assert(state.lastAuctionResult.winnerId === 'p2' && state.lastAuctionResult.amount === 60, 'the result is kept for the clients');
    assert(state.log.some((l) => l.type === 'AUCTION_WON'), 'the win is logged');
    mgr.endTurn('p1');
    console.log('✓ the auction closes early once the leader cannot be outbid, and the turn can then end');
  }

  // --- The clock closes an auction with no bids --------------------------
  {
    const { mgr, state, advance } = freshGame();
    const tile = properties(state)[3];
    landOn(mgr, tile.id);
    mgr.declinePurchase('p1', tile.id);
    assert(mgr.tickAuction() === false, 'a running auction is not closed before its time');
    advance(AUCTION_DURATION_MS);
    assert(mgr.tickAuction() === true, 'the auction closes when its time is up');
    assert(state.auction === null && state.properties[tile.id].ownerId === null, 'with no bids the square stays with the bank');
    assert(state.lastAuctionResult.winnerId === null, 'the result says nobody bought it');
    assert(state.log.some((l) => l.type === 'AUCTION_UNSOLD'), 'an unsold auction is logged');
    console.log('✓ an auction with no bids closes on time and the square stays unowned');
  }

  // --- A winner who can no longer pay ------------------------------------
  {
    const { mgr, state, advance } = freshGame();
    const tile = properties(state)[4];
    landOn(mgr, tile.id);
    mgr.declinePurchase('p1', tile.id);
    const { id } = state.auction;
    mgr.placeBid('p2', id, 10);
    mgr.placeBid('p3', id, 20);
    state.getPlayer('p3').money = 5;
    const bobBefore = state.getPlayer('p2').money;
    advance(AUCTION_DURATION_MS + AUCTION_EXTEND_MS);
    mgr.tickAuction();
    assert(state.properties[tile.id].ownerId === 'p2', 'the best bid that can still be paid wins');
    assert(state.getPlayer('p2').money === bobBefore - 10, 'the fallback winner pays their own bid');
    console.log('✓ if the top bidder spent their money, the next bid that can be paid wins');
  }

  // --- Bankruptcy in the middle of an auction ----------------------------
  {
    const { mgr, state } = freshGame();
    const tile = properties(state)[5];
    landOn(mgr, tile.id);
    mgr.declinePurchase('p1', tile.id);
    const { id } = state.auction;
    mgr.placeBid('p2', id, 10);
    mgr.placeBid('p3', id, 20);
    state.getPlayer('p3').money = -100;
    mgr.declareBankruptcy('p3');
    assert(state.auction && state.auction.highestBidderId === 'p2' && state.auction.highestBid === 10, 'a bankrupt leader\'s bid is dropped and the next bid leads');
    mgr.withdrawFromAuction('p1', id);
    assert(state.properties[tile.id].ownerId === 'p2', 'the auction then finishes normally');
    console.log('✓ a bidder going bankrupt mid-auction loses their bids without breaking the auction');
  }

  // --- Mortgage timer -----------------------------------------------------
  {
    const { mgr, state } = freshGame(['Alice', 'Bob']);
    const tile = properties(state)[0];
    const propState = state.properties[tile.id];
    propState.ownerId = 'p1';
    mgr.mortgageProperty('p1', tile.id);
    assert(propState.mortgagedRound === 1 && propState.mortgageExpiresRound === 1 + MORTGAGE_ROUNDS + 1, `the timer starts at mortgage time, got ${JSON.stringify(propState)}`);

    for (let r = 0; r < MORTGAGE_ROUNDS; r += 1) playRound(mgr);
    assert(state.round === 1 + MORTGAGE_ROUNDS, `after ${MORTGAGE_ROUNDS} rounds the table is in round ${1 + MORTGAGE_ROUNDS}, got ${state.round}`);
    assert(propState.mortgaged && propState.ownerId === 'p1', 'the round the deed was mortgaged in does not count - it is still mortgaged');
    assert(propState.mortgageExpiresRound - state.round - 1 === 0, 'no full rounds are left');

    playRound(mgr);
    assert(state.auction && state.auction.tileId === tile.id && state.auction.reason === 'MORTGAGE_EXPIRED', 'after 10 full rounds the deed goes to auction');
    assert(state.auction.previousOwnerId === 'p1', 'the auction remembers who lost the deed');
    assert(propState.ownerId === null && !propState.mortgaged && propState.mortgageExpiresRound === null, 'the owner loses the deed and the timer is gone');
    assert(state.log.some((l) => l.type === 'MORTGAGE_EXPIRED'), 'the foreclosure is logged');
    assertThrows(() => mgr.rollDice(state.currentPlayer.id), /auction/i, 'nobody rolls while the foreclosure auction runs');
    console.log(`✓ a mortgage left unpaid for ${MORTGAGE_ROUNDS} full rounds sends the deed to auction`);
  }

  {
    const { mgr, state } = freshGame(['Alice', 'Bob']);
    const tile = properties(state)[0];
    const propState = state.properties[tile.id];
    propState.ownerId = 'p1';
    mgr.mortgageProperty('p1', tile.id);
    playRound(mgr);
    mgr.unmortgageProperty('p1', tile.id);
    assert(propState.mortgageExpiresRound === null, 'paying off the mortgage stops the timer');
    for (let r = 0; r < MORTGAGE_ROUNDS + 2; r += 1) playRound(mgr);
    assert(state.auction === null && propState.ownerId === 'p1', 'a paid-off deed is never foreclosed');
    console.log('✓ paying off a mortgage cancels its timer');
  }

  {
    const { mgr, state, advance } = freshGame(['Alice', 'Bob']);
    const [a, b] = properties(state);
    state.properties[a.id].ownerId = 'p1';
    state.properties[b.id].ownerId = 'p1';
    mgr.mortgageProperty('p1', a.id);
    mgr.mortgageProperty('p1', b.id);
    for (let r = 0; r < MORTGAGE_ROUNDS + 1; r += 1) playRound(mgr);
    assert(state.auction && state.auction.tileId === a.id, 'the first expired deed is auctioned');
    assert(state.auctionQueue.length === 1 && state.auctionQueue[0].tileId === b.id, 'the second one waits in the queue');
    advance(AUCTION_DURATION_MS);
    mgr.tickAuction();
    assert(state.auction && state.auction.tileId === b.id, 'the queued auction starts when the first one ends');
    assert(state.auctionQueue.length === 0, 'and leaves the queue');
    console.log('✓ several deeds expiring together are auctioned one after another');
  }

  // --- Selling to the bank to afford a purchase --------------------------
  {
    const { mgr, state } = freshGame(['Alice', 'Bob']);
    const board = state.layout.board;
    const target = board.find((t) => t.type === 'PROPERTY' && t.price >= 300);
    const [railA, railB] = board.filter((t) => t.type === 'RAILROAD');
    const alice = state.getPlayer('p1');
    state.properties[railA.id].ownerId = 'p1';
    state.properties[railB.id].ownerId = 'p1';
    alice.money = target.price - 150;
    landOn(mgr, target.id);

    assertThrows(() => mgr.buyProperty('p1', target.id), /Not enough money/i, 'the purchase is refused while the money is short');
    assertThrows(() => mgr.sellPropertyToBank('p2', railA.id), /not your turn/i, 'only the player on turn sells to the bank');

    const before = alice.money;
    mgr.sellPropertyToBank('p1', railA.id);
    assert(alice.money === before + bankBuybackValue(railA), 'the bank pays the mortgage value');
    assert(state.properties[railA.id].ownerId === null, 'the sold square is free again');
    assert(state.pendingAction?.type === 'BUY_DECISION', 'raising money does not close the buy decision');
    assert(alice.money < target.price, 'sanity: still short');

    mgr.mortgageProperty('p1', railB.id);
    assert(alice.money >= target.price, 'mortgaging raised the rest');
    mgr.buyProperty('p1', target.id);
    assert(state.properties[target.id].ownerId === 'p1', 'the purchase goes through once the money is there');
    assertThrows(() => mgr.sellPropertyToBank('p1', railB.id), /mortgaged/i, 'a mortgaged deed cannot be sold to the bank');
    console.log('✓ a player short of money sells/mortgages what they choose and then buys the square');
  }

  {
    const { mgr, state } = freshGame(['Alice', 'Bob']);
    const tile = properties(state)[0];
    const groupIds = state.layout.GROUPS[tile.group];
    groupIds.forEach((id) => { state.properties[id].ownerId = 'p1'; });
    state.properties[groupIds[1]].houses = 1;
    assertThrows(() => mgr.sellPropertyToBank('p1', tile.id), /houses/i, 'a deed cannot be sold while its group has buildings');
    console.log('✓ selling to the bank requires the color group to be free of buildings');
  }

  // --- Saving and restoring ----------------------------------------------
  {
    const { mgr, state } = freshGame(['Alice', 'Bob']);
    const [a, b, c] = properties(state);
    state.properties[a.id].ownerId = 'p1';
    mgr.mortgageProperty('p1', a.id);
    playRound(mgr);
    landOn(mgr, b.id);
    mgr.declinePurchase(state.currentPlayer.id, b.id);
    mgr.placeBid('p2', state.auction.id, 30);
    mgr._queueAuction(c.id, 'DECLINED');

    const saved = JSON.parse(JSON.stringify(state.toJSON()));
    const restored = GameState.fromJSON(saved);
    assert(restored.round === state.round, 'the round counter survives a restart');
    assert(restored.auction.id === state.auction.id && restored.auction.highestBidderId === 'p2', 'the running auction survives a restart');
    assert(restored.auction.endsAt >= state.auction.endsAt, 'a restored auction never closes earlier than planned');
    assert(restored.auctionQueue.length === 1, 'the auction queue survives a restart');
    assert(restored.properties[a.id].mortgageExpiresRound === state.properties[a.id].mortgageExpiresRound, 'mortgage timers survive a restart');
    assert(restored._nextAuctionId === state._nextAuctionId && restored._nextTradeId === state._nextTradeId, 'id counters survive, so ids never repeat');

    delete saved.round;
    delete saved.auction;
    delete saved.auctionQueue;
    Object.values(saved.properties).forEach((p) => {
      delete p.priceChanges;
      delete p.mortgagedRound;
      delete p.mortgageExpiresRound;
    });
    const old = GameState.fromJSON(saved);
    assert(old.round === 1 && old.auction === null && Array.isArray(old.auctionQueue), 'a room saved before these features loads with defaults');
    assert(old.properties[a.id].mortgageExpiresRound === 1 + MORTGAGE_ROUNDS + 1, 'an old mortgage gets a fresh timer instead of none');
    assert(typeof old.properties[b.id].priceChanges === 'object', 'price history is backfilled');
    console.log('✓ rounds, auctions, the queue and mortgage timers are restored from a saved room (old saves get defaults)');
  }

  console.log('\n=== AUCTION & MORTGAGE TIMER TESTS PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
