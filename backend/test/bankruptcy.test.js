// Deterministic tests of bankruptcy, mortgage, and win-condition logic.

const { GameManager, GameError } = require('../src/game/GameManager');

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
  const board = state.layout.board;

  const tile = board.find((t) => t.type === 'PROPERTY' && t.price === 400) || board.find((t) => t.type === 'PROPERTY' && t.price >= 300);
  assert(tile, 'expected to find an expensive property on the board');
  state.properties[tile.id].ownerId = 'p2';

  const cheapTile = board.find((t) => t.type === 'PROPERTY' && t.price <= 70);
  assert(cheapTile, 'expected to find a cheap property on the board');
  state.properties[cheapTile.id].ownerId = 'p1';

  alice.money = 100;
  alice.money -= 2000;

  assert(alice.money < 0, 'Alice should be in debt for this scenario');

  const beforeMortgage = alice.money;
  mgr.mortgageProperty('p1', cheapTile.id);
  assert(alice.money === beforeMortgage + Math.floor(cheapTile.price / 2), `mortgage should add $${Math.floor(cheapTile.price / 2)}, got new balance ${alice.money}`);
  assert(alice.money < 0, 'Alice should still be in debt after mortgaging one cheap property');
  console.log('✓ mortgaging raises balance correctly but insufficient debt remains, as expected');

  const turnBeforeBankruptcy = state.currentPlayerIndex;
  assert(state.players[turnBeforeBankruptcy].id === 'p1', "expected it to still be Alice's turn before bankruptcy");

  mgr.declareBankruptcy('p1');

  assert(alice.bankrupt === true, 'Alice should be marked bankrupt');
  assert(alice.money === 0, `bankrupt player's money should reset to 0, got ${alice.money}`);
  assert(state.properties[cheapTile.id].ownerId === null, "Alice's mortgaged property should return to the bank on bankruptcy");
  assert(state.properties[cheapTile.id].mortgaged === false, 'returned property should no longer be marked mortgaged');
  console.log('✓ bankruptcy correctly resets player state and releases properties to the bank');

  assert(state.phase === 'GAME_OVER', `expected GAME_OVER phase after last-player-standing, got ${state.phase}`);
  assert(state.winnerId === 'p2', `expected Bob (p2) to be declared winner, got winnerId=${state.winnerId}`);
  console.log('✓ win condition correctly triggers when only one non-bankrupt player remains');

  let threwCorrectly = false;
  try {
    mgr.rollDice('p1');
  } catch (e) {
    threwCorrectly = e instanceof GameError;
  }
  assert(threwCorrectly, 'bankrupt player attempting to roll dice should be rejected with a GameError');
  console.log('✓ bankrupt player is correctly blocked from further actions');

  const mgr2 = new GameManager('TEST2', 'p1');
  mgr2.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
  mgr2.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
  mgr2.startGame('p1');
  const tile2 = mgr2.state.layout.board.find((t) => t.type === 'PROPERTY' && t.price >= 150 && t.price <= 250);
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
  assert(alice2.money === startMoney + mortgageValue - unmortgageCost, `unmortgage should cost $${unmortgageCost}`);
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
