// Regression test for a real bug: a player's token visually "jumped
// backward" mid-hop whenever another broadcast arrived before the hop's
// animation had finished playing (most commonly triggered by tapping Buy
// or Skip, or by the next player's own turn starting).
//
// Root cause, in two parts:
//
// (1) GameManager.advanceTurn() never cleared state.lastMove once a turn
//     genuinely ended, so a stale move kept getting re-included in every
//     subsequent game:state broadcast for the rest of the game.
//
// (2) The frontend's animation code decided "is this a move I haven't
//     already played?" by comparing the incoming lastMove object by
//     REFERENCE. Every broadcast the client receives has gone through a
//     full JSON round-trip (the server serializes, Socket.io transmits,
//     the client JSON.parses), which never preserves object identity -
//     so even a byte-for-byte identical lastMove payload looks like a
//     brand new object on arrival, and the animation would restart from
//     its first tile every time, which is what visually looked like the
//     token snapping backward.
//
// Fix (1) is tested directly here, against the real GameManager. Fix (2)
// lives in frontend/src/components/Board.jsx's moveSignature() helper,
// which isn't reachable from a Node test - the second half of this file
// instead proves the underlying MECHANISM that made fix (2) necessary
// (that a JSON round-trip breaks reference equality on an otherwise
// identical object), which is the exact assumption moveSignature() is
// built to not depend on.

const { GameManager } = require('../src/game/GameManager');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function freshGame() {
  const mgr = new GameManager('TOKENJUMP', 'p1');
  mgr.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
  mgr.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
  mgr.startGame('p1');
  return mgr;
}

function main() {
  // --- Part 1: advanceTurn() must clear lastMove ---
  {
    const mgr = freshGame();
    const { state } = mgr;
    const alice = state.getPlayer('p1');
    alice.position = 5;
    mgr._movePlayer(alice, 4);
    assert(state.lastMove !== null, 'sanity: lastMove should be set right after a real move');
    assert(state.lastMove.playerId === 'p1', 'sanity: lastMove should belong to Alice');

    // Landing on tile 9 via _movePlayer may have set a pendingAction
    // (e.g. an unowned property's buy decision) exactly like a real
    // Buy/Decline prompt would - clear it the same way declinePurchase()
    // would, so endTurn() is exercised the same way a real click leaves
    // the game (this is deliberately NOT skipping real validation, since
    // endTurn() still independently checks phase/pendingAction itself).
    state.pendingAction = null;
    state.phase = 'ACTION';
    state.lastRoll = { d1: 1, d2: 3, isDouble: false, playerId: 'p1' };
    mgr.endTurn('p1');

    assert(state.currentPlayerIndex === 1, 'sanity: turn should have genuinely passed to Bob');
    assert(
      state.lastMove === null,
      'REGRESSION: advanceTurn() must clear lastMove once a turn ends - leaving it set means the server ' +
      're-broadcasts the same "last move" forever, which is what let the frontend animation replay it repeatedly',
    );
    console.log('✓ ending a turn via endTurn() correctly clears lastMove (was previously left stale)');
  }

  // --- Part 2: the SAME clearing must happen via the bankruptcy path too ---
  // (uses a THREE-player game deliberately: in a 2-player game, one side
  // going bankrupt ends the game immediately via checkWinCondition()
  // before advanceTurn() would even run, which isn't the scenario being
  // tested here - a 3rd player keeps the game genuinely ongoing so
  // advanceTurn() actually executes.)
  {
    const mgr = new GameManager('TOKENJUMP2', 'p1');
    mgr.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
    mgr.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
    mgr.addPlayer({ playerId: 'p3', socketId: 's3', nickname: 'Carol' });
    mgr.startGame('p1');
    const { state } = mgr;
    const alice = state.getPlayer('p1');
    alice.position = 5;
    mgr._movePlayer(alice, 4);
    assert(state.lastMove !== null, 'sanity: lastMove should be set after the move');

    alice.money = -500;
    mgr.declareBankruptcy('p1');

    assert(state.phase !== 'GAME_OVER', 'sanity: with 3 players, one bankruptcy should not end the game');
    assert(state.currentPlayerIndex === 1, 'sanity: turn should have genuinely passed to Bob after Alice went bankrupt');
    assert(state.lastMove === null, 'REGRESSION: declareBankruptcy() advancing the turn must also clear lastMove');
    console.log('✓ a turn advancing via bankruptcy also correctly clears lastMove');
  }

  // --- Part 3: a move made THIS turn must still be present until the turn actually ends ---
  {
    const mgr = freshGame();
    const { state } = mgr;
    const alice = state.getPlayer('p1');
    alice.position = 5;
    mgr._movePlayer(alice, 4);
    assert(state.lastMove !== null, 'lastMove must still be present immediately after a move, before the turn ends');
    assert(state.lastMove.playerId === 'p1' && JSON.stringify(state.lastMove.path) === JSON.stringify([6, 7, 8, 9]), 'lastMove content should be exactly this move, untouched');
    console.log('✓ lastMove is NOT cleared prematurely - it survives until the turn genuinely advances');
  }

  // --- Part 4: the doubles-go-again case must NOT clear lastMove ---
  {
    const mgr = freshGame();
    const { state } = mgr;
    const alice = state.getPlayer('p1');
    alice.position = 5;
    mgr._movePlayer(alice, 4);
    const moveBeforeDoubles = state.lastMove;

    state.pendingAction = null;
    state.phase = 'ACTION';
    state.lastRoll = { d1: 3, d2: 3, isDouble: true, playerId: 'p1' };
    alice.consecutiveDoubles = 1;
    mgr.endTurn('p1');

    assert(state.currentPlayerIndex === 0, 'rolling doubles should NOT advance the turn - it should still be p1');
    assert(state.phase === 'ROLLING', 'rolling doubles should return to ROLLING phase for the same player to go again');
    assert(state.lastMove === moveBeforeDoubles, 'lastMove must survive the doubles-go-again branch, since advanceTurn() is correctly never called here');
    console.log('✓ the doubles-go-again path (no turn advance) correctly leaves lastMove untouched');
  }

  // --- Part 5: prove the actual mechanism a reference-based comparison
  // was vulnerable to.
  {
    const mgr = freshGame();
    const { state } = mgr;
    const alice = state.getPlayer('p1');
    alice.position = 5;
    mgr._movePlayer(alice, 4);

    const originalMove = state.lastMove;
    const roundTripped = JSON.parse(JSON.stringify(originalMove));

    assert(roundTripped !== originalMove, 'sanity: JSON.parse(JSON.stringify(x)) must produce a NEW object reference, never the same one');
    assert(JSON.stringify(roundTripped) === JSON.stringify(originalMove), 'the round-tripped object must be byte-for-byte identical in content');

    const signature = (m) => (m ? `${m.playerId}|${m.teleport ? 'T' : 'W'}|${m.path.join(',')}` : null);
    assert(
      signature(originalMove) === signature(roundTripped),
      'REGRESSION MECHANISM: a content-based signature must treat the original and its round-tripped copy as ' +
      'the same move, even though they are different object references - this is precisely the comparison the ' +
      'frontend animation now uses instead of `moveDescriptor !== someRef`',
    );
    console.log('✓ CONFIRMED MECHANISM: a JSON round-trip breaks object identity but a content-based signature correctly still matches');
  }

  console.log('\n=== TOKEN-JUMPS-BACKWARD REGRESSION TESTS PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
