// Deterministic test of bankruptcy, mortgage, and win-condition logic.
// Rather than relying on random dice rolls to eventually produce a
// bankruptcy (which the socket-level integration test showed is rare in a
// short random game), this drives GameManager directly and manipulates
// state to force the scenario, so the bankruptcy path is verified on every
// run rather than only occasionally.

const { GameManager, GameError } = require('../src/game/GameManager');
const { BOARD } = require('../src/game/Board');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function main() {
  const mgr = new GameManager('TEST1', 'p1');
  mgr.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
  mgr.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
  mgr.startGame('p1');

  const { state } = mgr;
  const alice = state.getPlayer('p1');
  const bob = state.getPlayer('p2');

  // --- Give Bob ownership of a property, then force Alice into debt she
  // cannot cover, to exercise mortgage-then-bankruptcy. ---
  const tile = BOARD.find((t) => t.type === 'PROPERTY' && t.price === 400); // Meridian Point
  assert(tile, 'expected to find the $400 property on the board');
  state.properties[tile.id].ownerId = 'p2';

  // Give Alice one cheap mortgageable property so we can verify mortgaging
  // raises her balance, but not enough to fully cover the coming debt.
  const cheapTile = BOARD.find((t) => t.type === 'PROPERTY' && t.price === 60);
  state.properties[cheapTile.id].ownerId = 'p1';

  // Force Alice deep into debt (simulating "landed on a huge rent tile")
  alice.money = 100;
  alice.money -= 2000; // now -1900, nowhere near recoverable via one mortgage

  assert(alice.money < 0, 'Alice should be in debt for this scenario');

  // Mortgaging should succeed and raise her balance, but not fully resolve
  // the debt (mortgage value of a $60 property is $30 - a drop in the
  // bucket against -1900).
  const beforeMortgage = alice.money;
  mgr.mortgageProperty('p1', cheapTile.id);
  assert(alice.money === beforeMortgage + Math.floor(cheapTile.price / 2), `mortgage should add $${Math.floor(cheapTile.price / 2)}, got new balance ${alice.money}`);
  assert(alice.money < 0, 'Alice should still be in debt after mortgaging one cheap property');
  console.log('✓ mortgaging raises balance correctly but insufficient debt remains, as expected');

  // Now declare bankruptcy and verify all invariants:
  //  - all her properties return to the bank (ownerId null, unmortgaged, no houses)
  //  - she's marked bankrupt with 0 money
  //  - turn advances away from her
  //  - Bob (the only other active player) is declared the winner
  const turnBeforeBankruptcy = state.currentPlayerIndex;
  assert(state.players[turnBeforeBankruptcy].id === 'p1', 'expected it to still be Alice\'s turn before bankruptcy');

  mgr.declareBankruptcy('p1');

  assert(alice.bankrupt === true, 'Alice should be marked bankrupt');
  assert(alice.money === 0, `bankrupt player's money should reset to 0, got ${alice.money}`);
  assert(state.properties[cheapTile.id].ownerId === null, 'Alice\'s mortgaged property should return to the bank on bankruptcy');
  assert(state.properties[cheapTile.id].mortgaged === false, 'returned property should no longer be marked mortgaged');
  console.log('✓ bankruptcy correctly resets player state and releases properties to the bank');

  assert(state.phase === 'GAME_OVER', `expected GAME_OVER phase after last-player-standing, got ${state.phase}`);
  assert(state.winnerId === 'p2', `expected Bob (p2) to be declared winner, got winnerId=${state.winnerId}`);
  console.log('✓ win condition correctly triggers when only one non-bankrupt player remains');

  // --- Verify a bankrupt player cannot act anymore ---
  let threwCorrectly = false;
  try {
    mgr.rollDice('p1');
  } catch (e) {
    threwCorrectly = e instanceof GameError;
  }
  assert(threwCorrectly, 'bankrupt player attempting to roll dice should be rejected with a GameError');
  console.log('✓ bankrupt player is correctly blocked from further actions');

  // --- Separate scenario: verify mortgage/unmortgage round-trip pricing ---
  const mgr2 = new GameManager('TEST2', 'p1');
  mgr2.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
  mgr2.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
  mgr2.startGame('p1');
  const tile2 = BOARD.find((t) => t.type === 'PROPERTY' && t.price === 200);
  mgr2.state.properties[tile2.id].ownerId = 'p1';
  const alice2 = mgr2.state.getPlayer('p1');
  const startMoney = alice2.money;

  mgr2.mortgageProperty('p1', tile2.id);
  const mortgageValue = Math.floor(tile2.price / 2);
  assert(alice2.money === startMoney + mortgageValue, 'mortgage should pay out half the property price');

  let threwOnDoubleM = false;
  try { mgr2.mortgageProperty('p1', tile2.id); } catch (e) { threwOnDoubleM = e instanceof GameError; }
  assert(threwOnDoubleM, 'mortgaging an already-mortgaged property should be rejected');

  const unmortgageCost = Math.ceil((tile2.price / 2) * 1.1);
  mgr2.unmortgageProperty('p1', tile2.id);
  assert(alice2.money === startMoney + mortgageValue - unmortgageCost, `unmortgage should cost $${unmortgageCost} (10% interest on top of the mortgage value)`);
  assert(mgr2.state.properties[tile2.id].mortgaged === false, 'property should be unmortgaged after paying it off');
  console.log('✓ mortgage/unmortgage round-trip pricing (50% value, 10% interest to reclaim) is correct');

  console.log('\n=== BANKRUPTCY & MORTGAGE UNIT TESTS PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
