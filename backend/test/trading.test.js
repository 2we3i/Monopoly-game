// Deterministic tests of the trading system.

const { GameManager, GameError } = require('../src/game/GameManager');

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
  assert(threw, `${msg} (expected a GameError to be thrown, none was)`);
  if (pattern) {
    assert(pattern.test(errMsg), `${msg} (error message "${errMsg}" did not match ${pattern})`);
  }
}

function freshGame() {
  const mgr = new GameManager('TRADE', 'p1');
  mgr.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
  mgr.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
  mgr.addPlayer({ playerId: 'p3', socketId: 's3', nickname: 'Carol' });
  mgr.startGame('p1');
  return mgr;
}

function main() {
  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    const aliceBefore = state.getPlayer('p1').money;
    const bobBefore = state.getPlayer('p2').money;

    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], offerMoney: 0, requestTileIds: [], requestMoney: 100 });
    assert(trade.status === 'PENDING', 'new trade should be PENDING');
    assert(state.trades.length === 1, 'trade should be added to state.trades');

    mgr.acceptTrade('p2', trade.id);
    assert(state.properties[tile.id].ownerId === 'p2', 'property should transfer to the accepting player');
    assert(state.getPlayer('p1').money === aliceBefore + 100, 'proposer should receive the requested money');
    assert(state.getPlayer('p2').money === bobBefore - 100, 'accepter should pay the requested money');
    assert(state.trades.length === 0, 'resolved trade should be removed from state.trades');
    console.log('✓ basic property-for-money trade executes correctly and cleans up');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const props = state.layout.board.filter((t) => t.type === 'PROPERTY').slice(0, 2);
    state.properties[props[0].id].ownerId = 'p1';
    state.properties[props[1].id].ownerId = 'p2';

    const trade = mgr.proposeTrade('p1', {
      toPlayerId: 'p2', offerTileIds: [props[0].id], offerMoney: 50, requestTileIds: [props[1].id], requestMoney: 20,
    });
    mgr.acceptTrade('p2', trade.id);
    assert(state.properties[props[0].id].ownerId === 'p2', 'first property should go to p2');
    assert(state.properties[props[1].id].ownerId === 'p1', 'second property should go to p1');
    console.log('✓ combined deal (properties both ways + net money) executes correctly');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p2';
    assertThrows(
      () => mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 0 }),
      /does not own/i,
      'proposing a trade for an unowned property must be rejected',
    );
    console.log('✓ FRAUD PREVENTED: cannot propose a trade offering a property you do not own');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    assertThrows(
      () => mgr.proposeTrade('p1', { toPlayerId: 'p2', requestTileIds: [tile.id] }),
      /does not own/i,
      'requesting a property the target does not own must be rejected',
    );
    console.log('✓ FRAUD PREVENTED: cannot request a property the other party does not own');
  }

  {
    const mgr = freshGame();
    assertThrows(
      () => mgr.proposeTrade('p1', { toPlayerId: 'p2', offerMoney: 999999 }),
      /not enough to offer/i,
      'offering more money than you have must be rejected',
    );
    console.log('✓ FRAUD PREVENTED: cannot offer more money than you currently have');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 0 });

    mgr.mortgageProperty('p1', tile.id);
    assert(state.properties[tile.id].mortgaged === true, 'sanity: property should now be mortgaged');

    assertThrows(
      () => mgr.acceptTrade('p2', trade.id),
      null,
      'accepting a trade for a since-mortgaged property must be rejected at ACCEPT time, not just propose time',
    );
    assert(state.properties[tile.id].ownerId === 'p1', 'property must NOT have transferred');
    console.log('✓ FRAUD PREVENTED (core re-validation): trade correctly re-checks mortgage status at accept time, not just at proposal time');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';

    const tradeToBob = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 0 });
    const tradeToCarol = mgr.proposeTrade('p1', { toPlayerId: 'p3', offerTileIds: [tile.id], requestMoney: 0 });

    mgr.acceptTrade('p2', tradeToBob.id);
    assert(state.properties[tile.id].ownerId === 'p2', 'sanity: Bob should now own the property');

    assertThrows(
      () => mgr.acceptTrade('p3', tradeToCarol.id),
      /does not own/i,
      'accepting a second trade for a property already given away in a first trade must be rejected',
    );
    assert(state.properties[tile.id].ownerId === 'p2', 'property must remain with Bob, not double-transfer to Carol');
    console.log('✓ FRAUD PREVENTED: same property offered in two pending trades - second accept correctly fails, no double-transfer');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 100 });
    const bobMoneyBefore = state.getPlayer('p2').money;

    mgr.acceptTrade('p2', trade.id);
    assertThrows(
      () => mgr.acceptTrade('p2', trade.id),
      /no longer exists|already been resolved/i,
      'accepting the SAME trade a second time must be a no-op rejection, not a double-execution',
    );
    assert(state.getPlayer('p2').money === bobMoneyBefore - 100, `Bob should have paid exactly $100 once, but money is ${state.getPlayer('p2').money} (started at ${bobMoneyBefore})`);
    console.log('✓ FRAUD PREVENTED: duplicate accept on an already-resolved trade is rejected, no double-charge');
  }

  {
    const mgr = freshGame();
    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerMoney: 10 });
    assertThrows(
      () => mgr.acceptTrade('p3', trade.id),
      /only the recipient/i,
      'a third party must not be able to accept a trade addressed to someone else',
    );
    console.log('✓ FRAUD PREVENTED: only the actual named recipient can accept a trade');
  }

  {
    const mgr = freshGame();
    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerMoney: 10 });
    assertThrows(
      () => mgr.acceptTrade('p1', trade.id),
      /only the recipient/i,
      'the proposer must not be able to accept their own proposal',
    );
    console.log('✓ FRAUD PREVENTED: proposer cannot accept their own trade');
  }

  {
    const mgr = freshGame();
    assertThrows(
      () => mgr.proposeTrade('p1', { toPlayerId: 'p1', offerMoney: 10 }),
      /yourself/i,
      'proposing a trade with yourself must be rejected',
    );
    console.log('✓ FRAUD PREVENTED: cannot propose a trade with yourself');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(
      () => mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestTileIds: [tile.id] }),
      /both sides/i,
      'the same property on both sides of a trade must be rejected',
    );
    console.log('✓ FRAUD PREVENTED: same property cannot appear on both sides of one trade');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 50 });
    mgr.declineTrade('p2', trade.id);
    assert(state.trades.length === 0, 'declined trade should be removed');
    assert(state.properties[tile.id].ownerId === 'p1', 'declined trade must not move any property');
    console.log('✓ decline correctly removes the trade with zero side effects');
  }

  {
    const mgr = freshGame();
    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerMoney: 10 });
    assertThrows(
      () => mgr.cancelTrade('p2', trade.id),
      /only the player who proposed/i,
      'the recipient must not be able to cancel a trade - only decline',
    );
    mgr.cancelTrade('p1', trade.id);
    assert(mgr.state.trades.length === 0, 'cancelled trade should be removed');
    console.log('✓ only the proposer can cancel; cancel correctly removes the trade');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p2';
    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerMoney: 10, requestTileIds: [tile.id] });
    assert(state.trades.length === 1, 'sanity: trade exists before bankruptcy');

    state.getPlayer('p2').money = -500;
    mgr.declareBankruptcy('p2');
    assert(state.trades.length === 0, 'trade involving the now-bankrupt player should be cleaned up automatically');
    console.log('✓ bankruptcy automatically cleans up any pending trades involving that player');
  }

  {
    const mgr = new GameManager('LOBBYTEST', 'p1');
    mgr.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
    mgr.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
    assertThrows(
      () => mgr.proposeTrade('p1', { toPlayerId: 'p2', offerMoney: 10 }),
      /active game/i,
      'trading before the game has started must be rejected',
    );
    console.log('✓ trading is correctly blocked during the LOBBY phase');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    const groupIds = state.layout.GROUPS[tile.group];
    groupIds.forEach((id) => { state.properties[id].ownerId = 'p1'; });
    state.properties[tile.id].houses = 2;
    assertThrows(
      () => mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 0 }),
      /houses on it/i,
      'trading a property with houses on it must be rejected',
    );
    console.log('✓ properties with houses built cannot be traded until houses are sold');
  }

  console.log('\n=== TRADING SYSTEM UNIT TESTS PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
