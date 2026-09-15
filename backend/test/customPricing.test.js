// Tests for per-player custom rent pricing ("For the Family"), including
// the rule that one change may move a price by at most 10%.

const { GameManager, GameError, priceStepLimit } = require('../src/game/GameManager');

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

// A square whose rent is big enough for a 10% step to be more than $1.
function pricyTile(state) {
  return state.layout.board.find((t) => t.type === 'PROPERTY' && t.rent[0] >= 20);
}

function main() {
  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    state.properties[tile.id].ownerId = 'p1';
    const normal = tile.rent[0];
    const step = priceStepLimit(normal);
    assert(step === Math.floor(normal * 0.1), `sanity: step on $${normal} should be 10%`);

    mgr.setCustomPrice('p1', tile.id, 'p2', normal - step);
    assert(state.properties[tile.id].customPrices.p2 === normal - step, 'custom price should be recorded');

    const bob = state.getPlayer('p2');
    const alice = state.getPlayer('p1');
    const bobBefore = bob.money;
    const aliceBefore = alice.money;
    bob.position = tile.id;
    mgr._resolveTile(bob);
    assert(bob.money === bobBefore - (normal - step), `Bob should pay exactly the custom price, got money=${bob.money} (was ${bobBefore})`);
    assert(alice.money === aliceBefore + (normal - step), 'Alice should receive exactly the custom price');
    console.log('✓ custom price correctly overrides the computed rent when the target player lands on the tile');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p2', tile.rent[0] - 1);

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
    const tile = pricyTile(state);
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(() => mgr.setCustomPrice('p2', tile.id, 'p3', 5), /do not own/i, 'a non-owner must not be able to set a custom price on a property');
    console.log('✓ FRAUD PREVENTED: only the actual owner can set a custom price');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', 5), /do not own/i, 'setting a custom price on an unowned property must be rejected');
    console.log('✓ FRAUD PREVENTED: cannot set a custom price on a property you do not own');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p1', 5), /yourself/i, 'an owner setting a custom price for themselves must be rejected');
    console.log('✓ FRAUD PREVENTED: cannot set a custom price targeting yourself');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', -10), /non-negative/i, 'a negative custom price must be rejected');
    console.log('✓ negative custom price amounts are rejected');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    state.properties[tile.id].ownerId = 'p1';
    const normal = tile.rent[0];
    const step = priceStepLimit(normal);
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', normal * 5), /at most 10%/i, 'jumping straight to a much higher price must be rejected');
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', normal + step + 1), /at most 10%/i, 'one dollar over the 10% step must be rejected');
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', 0), /at most 10%/i, 'dropping straight to $0 must be rejected too');
    assert(!('p2' in state.properties[tile.id].customPrices), 'a rejected change must leave no price behind');
    console.log('✓ a single change larger than 10% is rejected in both directions');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    const propState = state.properties[tile.id];
    propState.ownerId = 'p1';
    const normal = tile.rent[0];
    const step = priceStepLimit(normal);

    const up = mgr.setCustomPrice('p1', tile.id, 'p2', normal + step);
    let change = propState.priceChanges.p2;
    assert(change.from === normal && change.to === normal + step && change.delta === step, `the change should read $${normal} -> $${normal + step}, got ${JSON.stringify(change)}`);
    assert(change.percent > 0 && change.percent <= 10, `the percent of a raise within the step must be in (0, 10], got ${change.percent}`);
    assert(up.delta === step, 'setCustomPrice returns the change it recorded');

    // The next step is measured from the NEW price, not the normal rent.
    const nextStep = priceStepLimit(normal + step);
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', normal + step + nextStep + 1), /at most 10%/i, 'the second step is limited by the current price');
    mgr.setCustomPrice('p1', tile.id, 'p2', normal + step + nextStep);
    assert(propState.customPrices.p2 === normal + step + nextStep, 'two steps in a row reach a price no single step could');

    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', normal + step + nextStep), /already/i, 'setting the same price again is not a change');

    const current = normal + step + nextStep;
    mgr.setCustomPrice('p1', tile.id, 'p2', current - priceStepLimit(current));
    change = propState.priceChanges.p2;
    assert(change.delta < 0 && change.percent < 0 && change.percent >= -10, `a decrease is recorded with a negative delta and percent, got ${JSON.stringify(change)}`);
    console.log('✓ every change records from/to/delta/percent, and each step is measured from the current price');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY' && t.rent[0] < 10);
    state.properties[tile.id].ownerId = 'p1';
    const normal = tile.rent[0];
    mgr.setCustomPrice('p1', tile.id, 'p2', normal + 1);
    assert(state.properties[tile.id].customPrices.p2 === normal + 1, 'a cheap square can still move by the minimum step of $1');
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', normal + 3), /at most 10%/i, 'but not by more than $1');
    console.log('✓ cheap squares move by at least $1 per step');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    const propState = state.properties[tile.id];
    propState.ownerId = 'p1';
    const normal = tile.rent[0];
    mgr.setCustomPrice('p1', tile.id, 'p2', normal - 1);
    assert('p2' in propState.customPrices, 'sanity: custom price exists before clearing');
    mgr.setCustomPrice('p1', tile.id, 'p2', null);
    assert(!('p2' in propState.customPrices), 'passing null should remove the custom price entry entirely');
    assert(propState.priceChanges.p2.cleared === true && propState.priceChanges.p2.to === normal, 'clearing is recorded as a change back to normal rent');
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', null), /no special rent/i, 'clearing a price that does not exist is rejected');

    // Walk the price three steps down: normal rent is now too far to jump back to.
    let price = normal;
    for (let i = 0; i < 3; i += 1) {
      price -= priceStepLimit(price);
      mgr.setCustomPrice('p1', tile.id, 'p2', price);
    }
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'p2', null), /in steps/i, 'jumping back to a normal rent more than 10% away is rejected');
    console.log('✓ null clears a custom price, but only when normal rent is within one step');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'RAILROAD');
    state.properties[tile.id].ownerId = 'p1';
    const normal = tile.rent[0];
    const price = normal + priceStepLimit(normal);
    mgr.setCustomPrice('p1', tile.id, 'p2', price);
    const bob = state.getPlayer('p2');
    const bobBefore = bob.money;
    bob.position = tile.id;
    mgr._payRent(bob, tile, state.properties[tile.id], true);
    assert(bob.money === bobBefore - price, `custom price should NOT be doubled by the doubleRent flag - expected Bob to pay exactly $${price}, got money=${bob.money} (was ${bobBefore})`);
    console.log('✓ custom price is charged exactly as set, NOT doubled by the Chance "double rent" railroad effect');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p3', tile.rent[0] - 1);

    const trade = mgr.proposeTrade('p1', { toPlayerId: 'p2', offerTileIds: [tile.id], requestMoney: 0 });
    mgr.acceptTrade('p2', trade.id);
    assert(state.properties[tile.id].ownerId === 'p2', 'sanity: property should now belong to Bob');
    assert(Object.keys(state.properties[tile.id].customPrices).length === 0, "Alice's custom pricing must NOT carry over to Bob as the new owner");
    assert(Object.keys(state.properties[tile.id].priceChanges).length === 0, "Alice's price history must not carry over either");
    console.log('✓ custom prices are correctly cleared when a property changes hands via trade');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = state.layout.board.find((t) => t.type === 'PROPERTY');
    state.properties[tile.id].ownerId = 'p1';
    mgr.setCustomPrice('p1', tile.id, 'p2', tile.rent[0] - 1);
    state.getPlayer('p1').money = -500;
    mgr.declareBankruptcy('p1');
    assert(Object.keys(state.properties[tile.id].customPrices).length === 0, 'custom prices must be cleared when the owner goes bankrupt and the property returns to the bank');
    console.log('✓ custom prices are correctly cleared when the owner goes bankrupt');
  }

  {
    const mgr = freshGame();
    const { state } = mgr;
    const tile = pricyTile(state);
    state.properties[tile.id].ownerId = 'p1';
    assertThrows(() => mgr.setCustomPrice('p1', tile.id, 'no-such-player', 5), /not found/i, 'setting a custom price for a nonexistent player id must be rejected');
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
