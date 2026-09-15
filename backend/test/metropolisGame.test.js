// Verifies GameManager plays a complete, correct game on a NON-default
// board layout (Metropolis).

const { GameManager } = require('../src/game/GameManager');
const { getLayout } = require('../src/game/boardLayouts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function main() {
  const metro = getLayout('metropolis');
  console.log(`Testing on metropolis: ${metro.board.length} tiles, sideLength=${metro.sideLength}`);

  const mgr = new GameManager('METRO1', 'p1', 'metropolis');
  assert(mgr.state.modeId === 'metropolis', `expected modeId metropolis, got ${mgr.state.modeId}`);
  assert(mgr.state.layout.board.length === 84, `expected 84 tiles, got ${mgr.state.layout.board.length}`);
  assert(Object.keys(mgr.state.properties).length === 66, `expected 66 ownable tiles, got ${Object.keys(mgr.state.properties).length}`);
  console.log('✓ GameManager constructed with the metropolis layout, property map sized correctly');

  mgr.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Alice' });
  mgr.addPlayer({ playerId: 'p2', socketId: 's2', nickname: 'Bob' });
  mgr.startGame('p1');
  assert(mgr.state.phase === 'ROLLING', 'game should be ROLLING after start');
  console.log('✓ game started on metropolis');

  let boughtSomething = false;
  let sawCard = false;
  let sawRent = false;
  let sawJailInteraction = false;
  let maxPositionSeen = 0;
  let minPositionSeen = 999;
  let wrapObserved = false;
  const lastPositions = { p1: 0, p2: 0 };

  // A passed square (or an expired mortgage) now goes to auction; this
  // simulation drops out of every auction so the game keeps moving.
  const settleAuction = () => {
    while (mgr.state.auction) {
      const { auction } = mgr.state;
      const quitter = auction.participants.find((id) => !auction.withdrawn.includes(id)
        && id !== auction.highestBidderId && !mgr.state.getPlayer(id).bankrupt);
      if (!quitter) break;
      mgr.withdrawFromAuction(quitter, auction.id);
    }
  };

  for (let turn = 0; turn < 300 && mgr.state.phase !== 'GAME_OVER'; turn++) {
    settleAuction();
    const actor = mgr.state.currentPlayer;
    if (!actor || actor.bankrupt) break;

    if (actor.inJail && mgr.state.phase === 'ROLLING') {
      if (actor.money >= 50 && turn % 2 === 0) {
        mgr.payJailFine(actor.id);
        sawJailInteraction = true;
      }
    }

    if (mgr.state.phase === 'ROLLING') {
      sawJailInteraction = sawJailInteraction || actor.inJail;
      mgr.rollDice(actor.id);
    }

    const pos = actor.position;
    maxPositionSeen = Math.max(maxPositionSeen, pos);
    minPositionSeen = Math.min(minPositionSeen, pos);
    assert(pos >= 0 && pos < 84, `player position ${pos} is out of bounds for an 84-tile board`);
    if (lastPositions[actor.id] > pos && mgr.state.lastRoll && !actor.inJail) {
      wrapObserved = true;
    }
    lastPositions[actor.id] = pos;

    if (mgr.state.pendingAction?.type === 'BUY_DECISION' && mgr.state.pendingAction.playerId === actor.id) {
      const tile = mgr.state.layout.board[mgr.state.pendingAction.tileId];
      if (actor.money >= tile.price) {
        mgr.buyProperty(actor.id, mgr.state.pendingAction.tileId);
        boughtSomething = true;
      } else {
        mgr.declinePurchase(actor.id, mgr.state.pendingAction.tileId);
        settleAuction();
      }
    }

    if (mgr.state.pendingAction?.type === 'CARD_REVEAL' && mgr.state.pendingAction.playerId === actor.id) {
      sawCard = true;
      mgr.acknowledgeCard(actor.id);
    }

    if (mgr.state.log.some((l) => l.type === 'PAID_RENT')) sawRent = true;

    if (!mgr.state.pendingAction && mgr.state.phase === 'ACTION') {
      const current = mgr.state.getPlayer(actor.id);
      if (current.money < 0) {
        const owned = Object.entries(mgr.state.properties).filter(([, p]) => p.ownerId === actor.id && !p.mortgaged);
        for (const [tileIdStr] of owned) {
          if (mgr.state.getPlayer(actor.id).money >= 0) break;
          try {
            const tileId = Number(tileIdStr);
            if (mgr.state.properties[tileId].houses > 0) mgr.sellHouse(actor.id, tileId);
            else mgr.mortgageProperty(actor.id, tileId);
          } catch (e) { /* skip if not sellable for some reason */ }
        }
        if (mgr.state.getPlayer(actor.id).money < 0) {
          mgr.declareBankruptcy(actor.id);
          continue;
        }
      }
    }

    if (!mgr.state.pendingAction && mgr.state.phase === 'ACTION') {
      mgr.endTurn(actor.id);
    }
  }

  console.log(`✓ played up to 300 turns on metropolis; boughtSomething=${boughtSomething} sawCard=${sawCard} sawRent=${sawRent} sawJailInteraction=${sawJailInteraction}`);
  console.log(`  position range observed: ${minPositionSeen}-${maxPositionSeen} (board has 84 tiles, ids 0-83)`);
  console.log(`  wraparound past tile 83 back to 0 observed: ${wrapObserved}`);
  console.log(`  final money: ${mgr.state.players.map((p) => `${p.nickname}:$${p.money}`).join(', ')}`);

  assert(boughtSomething, 'expected at least one property purchase on metropolis in 300 turns');
  assert(sawCard, 'expected at least one Chance/Chest card draw on metropolis in 300 turns');
  assert(maxPositionSeen > 40, `expected to see positions beyond tile 40 on metropolis - only reached ${maxPositionSeen}`);
  assert(wrapObserved, 'expected to observe at least one full-board wraparound in 300 turns on an 84-tile board');

  console.log('\n=== METROPOLIS FULL-GAME TEST PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
