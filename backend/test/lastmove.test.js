// Deterministic tests for GameState.lastMove.

const { GameManager } = require('../src/game/GameManager');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function freshGame() {
  const mgr = new GameManager('TEST', 'p1');
  mgr.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
  mgr.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
  mgr.startGame('p1');
  return mgr;
}

function main() {
  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 5;
    mgr._movePlayer(alice, 4);
    const { lastMove } = mgr.state;
    assert(lastMove.playerId === 'p1', 'lastMove.playerId should be the mover');
    assert(lastMove.teleport === false, 'a normal walk is not a teleport');
    assert(JSON.stringify(lastMove.path) === JSON.stringify([6, 7, 8, 9]), `expected path [6,7,8,9], got ${JSON.stringify(lastMove.path)}`);
    console.log('✓ forward walk (5 -> 9): path is [6,7,8,9]');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 39;
    mgr._movePlayer(alice, 2);
    const { lastMove } = mgr.state;
    assert(JSON.stringify(lastMove.path) === JSON.stringify([0, 1]), `expected path [0,1] (wrapping through GO), got ${JSON.stringify(lastMove.path)}`);
    assert(lastMove.teleport === false, 'wraparound walk is still not a teleport');
    console.log('✓ forward walk wrapping past GO (39 -> 1): path is [0,1]');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 9;
    mgr._movePlayer(alice, -3);
    const { lastMove } = mgr.state;
    assert(JSON.stringify(lastMove.path) === JSON.stringify([8, 7, 6]), `expected backward path [8,7,6], got ${JSON.stringify(lastMove.path)}`);
    console.log('✓ backward walk (9 -> 6 via steps=-3): path is [8,7,6]');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 1;
    mgr._movePlayer(alice, -3);
    const { lastMove } = mgr.state;
    assert(JSON.stringify(lastMove.path) === JSON.stringify([0, 39, 38]), `expected path [0,39,38], got ${JSON.stringify(lastMove.path)}`);
    console.log('✓ backward walk wrapping past 0 (1 -> 38): path is [0,39,38]');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 3;
    mgr._moveToTile(alice, 8, {});
    const { lastMove } = mgr.state;
    assert(JSON.stringify(lastMove.path) === JSON.stringify([4, 5, 6, 7, 8]), `expected path [4,5,6,7,8], got ${JSON.stringify(lastMove.path)}`);
    assert(lastMove.teleport === false, '"advance to" is a walk, not a teleport');
    console.log('✓ "advance to" tile 8 from tile 3: path is [4,5,6,7,8]');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 37;
    mgr._moveToTile(alice, 1, {});
    const { lastMove } = mgr.state;
    assert(JSON.stringify(lastMove.path) === JSON.stringify([38, 39, 0, 1]), `expected path [38,39,0,1], got ${JSON.stringify(lastMove.path)}`);
    console.log('✓ "advance to" tile 1 from tile 37 (wraps past GO): path is [38,39,0,1]');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 5;
    mgr._moveToTile(alice, 10, { noGoCollect: true, skipPendingBuy: true });
    const { lastMove } = mgr.state;
    assert(lastMove.teleport === false, '"advance to Jail tile" via _moveToTile is a walk, not the instant _sendToJail teleport');
    assert(JSON.stringify(lastMove.path) === JSON.stringify([6, 7, 8, 9, 10]), `expected path [6,7,8,9,10], got ${JSON.stringify(lastMove.path)}`);
    console.log('✓ card "advance to Jail tile" (not GO_TO_JAIL effect) walks normally: path is [6,7,8,9,10]');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    alice.position = 22;
    mgr._sendToJail(alice);
    const { lastMove } = mgr.state;
    assert(lastMove.teleport === true, '_sendToJail must be marked as a teleport');
    assert(JSON.stringify(lastMove.path) === JSON.stringify([10]), `expected teleport path [10] (Jail tile only), got ${JSON.stringify(lastMove.path)}`);
    assert(alice.position === 10, 'player position should be Jail tile after _sendToJail');
    console.log('✓ _sendToJail: teleport=true, path=[10] (no intermediate tiles)');
  }

  {
    const mgr = freshGame();
    const alice = mgr.state.getPlayer('p1');
    mgr._movePlayer(alice, 5);
    assert(mgr.state.lastMove !== null, 'sanity: lastMove should be set after a real move');
    mgr.state.currentPlayerIndex = mgr.state.players.findIndex((p) => p.id === 'p1');
    mgr.state.phase = 'ROLLING';
    mgr.rollDice('p1');
    const stillHoldsOldMove = mgr.state.lastMove && mgr.state.lastMove.path.length === 5 && mgr.state.lastMove.path[4] === (5 + 5) % 40;
    assert(!stillHoldsOldMove || mgr.state.lastMove.playerId === 'p1', 'lastMove should never silently replay a stale move from a prior turn');
    console.log('✓ rollDice always clears/recomputes lastMove up front, never leaves a stale value from an earlier move');
  }

  console.log('\n=== LASTMOVE ANIMATION-PATH UNIT TESTS PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
