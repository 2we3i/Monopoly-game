// Tests for per-player custom rent pricing ("For the Family").

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
  assert(threw, `${msg} (expected a GameError, none was thrown)`);
  if (pattern) assert(pattern.test(errMsg), `${msg} (error "${errMsg}" did not match ${pattern})`);
}

function freshGame() {
  const mgr = new GameManager('CUSTOM', 'p1');
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

    mgr.setCustomPrice('p1', tile.id, 'p2', 5);
    assert(state.properties[tile.id].customPrices.p2 === 5, 'custom price should be recorded');

    const bob = state.getPlayer('p2');
    const alice = state.getPlayer('p1');
    const bobBefore = bob.money;
    const aliceBefore = alice.money;
    bob.position = tile.id;
    mgr._resolveTile(bob);
    assert(bob.money === bobBefore - 5, `Bob should pay exactly the custom $5, got money=${bob.money} (was ${bobBefore})`);
    assert(alice.money === aliceBefore + 5, 'Alice should receive exactly $5');
    console.log('✓ custom price correctly overrides the computed rent when the target player lands on the tile');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p2', 5);

    const carol = state.getPlayer('p3');
    const carolBefore = carol.money;
    carol.position = tile.id;
    mgr._resolveTile(carol);
    const normalRent = tile.rent[0];
    assert(carol.money === carolBefore - normalRent, `Carol (no custom price set for her) should pay the normal computed rent of $${normalRent}, got money=${carol.money}`);
    console.log('✓ a player with NO custom price entry still pays the normal computed rent (per-player, not global)');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(
      () => mgr.setCustomPrice('p2', tile.id, 'p3', 5),
      /do not own/i,
      'a non-owner must not be able to set a custom price on a property',
    );
    console.log('✓ FRAUD PREVENTED: only the actual owner can set a custom price');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    assertThrows(
      () => mgr.setCustomPrice('p1', tile.id, 'p2', 5),
      /do not own/i,
      'setting a custom price on an unowned property must be rejected',
    );
    console.log('✓ FRAUD PREVENTED: cannot set a custom price on a property you do not own');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(
      () => mgr.setCustomPrice('p1', tile.id, 'p1', 5),
      /yourself/i,
      'an owner setting a custom price for themselves must be rejected',
    );
    console.log('✓ FRAUD PREVENTED: cannot set a custom price targeting yourself');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(
      () => mgr.setCustomPrice('p1', tile.id, 'p2', -10),
      /non-negative/i,
      'a negative custom price must be rejected',
    );
    console.log('✓ negative custom price amounts are rejected');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p2', 0);
    const bob = state.getPlayer('p2');
    const bobBefore = bob.money;
    bob.position = tile.id;
    mgr._resolveTile(bob);
    assert(bob.money === bobBefore, 'a custom price of exactly $0 should mean Bob pays nothing at all');
    console.log('✓ a custom price of $0 is honored exactly (free rent for family)');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p2', 5);
    assert('p2' in state.properties[tile.id].customPrices, 'sanity: custom price exists before clearing');
    mgr.setCustomPrice('p1', tile.id, 'p2', null);
    assert(!('p2' in state.properties[tile.id].customPrices), 'passing null should remove the custom price entry entirely');
    console.log('✓ passing null clears a custom price back to normal computed rent');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'RAILROAD');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p2', 30);
    const bob = state.getPlayer('p2');
    const bobBefore = bob.money;
    bob.position = tile.id;
    mgr._payRent(bob, tile, state.properties[tile.id], true);
    assert(bob.money === bobBefore - 30, `custom price should NOT be doubled by the doubleRent flag - expected Bob to pay exactly $30, got money=${bob.money} (was ${bobBefore})`);
    console.log('✓ custom price is charged exactly as set, NOT doubled by the Chance "double rent" railroad effect');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p3', 1);

    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 0 });
    mgr.acceptTrade('p2', trade.id);
    assert(state.properties[tile.id].ownerId === 'p2', 'sanity: property should now belong to Bob');
    assert(Object.keys(state.properties[tile.id].customPrices).length === 0, "Alice's custom pricing must NOT carry over to Bob as the new owner");
    console.log('✓ custom prices are correctly cleared when a property changes hands via trade');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p2', 1);
    state.getPlayer('p1').money = -500;
    mgr.declareBankruptcy('p1');
    assert(Object.keys(state.properties[tile.id].customPrices).length === 0, 'custom prices must be cleared when the owner goes bankrupt and the property returns to the bank');
    console.log('✓ custom prices are correctly cleared when the owner goes bankrupt');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(
      () => mgr.setCustomPrice('p1', tile.id, 'no-such-player', 5),
      /not found/i,
      'setting a custom price for a nonexistent player id must be rejected',
    );
    console.log('✓ setting a custom price for a nonexistent player is rejected');
  }

  console.log('\n=== CUSTOM PRICING ("FOR THE FAMILY") UNIT TESTS PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
