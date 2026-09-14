// Deterministic tests of the Citadels engine.
//
// Roles are dealt by a random draft, so the tests do what a referee would:
// set the draft pool up so every player can take the role the test needs,
// then drive the real engine methods. Everything after that - calling
// order, secrecy, the Assassin and the Thief, income, building, scoring -
// is the real code path.

const { CitadelsGame, CitadelsError, PHASES } = require('../src/citadels/CitadelsGame');
const { ROLE_ORDER } = require('../src/citadels/roles');
const { districtDef } = require('../src/citadels/districts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertThrows(fn, pattern, msg) {
  let threw = false;
  let text = '';
  try { fn(); } catch (e) { threw = e instanceof CitadelsError; text = e.message; }
  assert(threw, `${msg} (expected a CitadelsError)`);
  if (pattern) assert(pattern.test(text), `${msg} (message "${text}" did not match ${pattern})`);
}

function gameWith(count, settings) {
  const game = new CitadelsGame('TEST', 'p1', settings);
  for (let i = 1; i <= count; i += 1) {
    game.addPlayer({ playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}`, accountId: i === 1 ? 'acc1' : null });
  }
  return game;
}

// Starts the game with the crown on p1 and every role in the pool, then
// lets each player pick the role the mapping gives them.
function startWithRoles(game, mapping) {
  game.start('p1');
  game.crownId = 'p1';
  game.round = 0;
  game.beginRound();
  game.faceUp = [];
  game.faceDown = null;
  game.draft.pool = [...ROLE_ORDER];
  // beginRound logged its own random face-up roles; they are no longer
  // the ones in play, so drop them before the test reads any log.
  game.log = [];
  game.draft.order.forEach((id) => game.pickRole(id, mapping[id]));
}

function card(game, districtId) {
  return game.newCard(districtId);
}

// --- setup and draft --------------------------------------------------

(function startDealsAndDrafts() {
  const game = gameWith(4);
  game.start('p1');
  assert(game.phase === PHASES.DRAFT, 'the game opens with the role draft');
  assert(game.players.every((p) => p.gold === 2 && p.hand.length === 4), 'everyone starts with 2 gold and 4 cards');
  assert(game.faceUp.length === 2 && !game.faceUp.includes('KING'), 'four players see two face-up roles, never the King');
  assert(game.draft.order[0] === game.crownId, 'the crown holder picks first');
  console.log('✓ a new game deals gold and cards and opens the draft with the crown');
}());

(function draftIsSecret() {
  const game = gameWith(4);
  game.start('p1');
  const picker = game.currentPicker();
  const other = game.players.find((p) => p.id !== picker.id);
  assert(game.toClientJSON(picker.id).you.draftOptions.length > 0, 'the picker sees the roles to choose from');
  assert(game.toClientJSON(other.id).you.draftOptions === null, 'nobody else sees the pool');
  assertThrows(() => game.pickRole(other.id, game.availableRoles()[0]), /not your turn/i, 'only the current picker may pick');
  const role = game.availableRoles()[0];
  game.pickRole(picker.id, role);
  const otherView = game.toClientJSON(other.id);
  assert(otherView.players.find((p) => p.id === picker.id).role === null, 'a picked role stays hidden from others');
  assert(game.toClientJSON(picker.id).you.role === role, 'the picker sees their own role');
  assertThrows(() => game.pickRole(game.currentPicker().id, role), /not available/i, 'a taken role cannot be picked again');
  console.log('✓ the draft pool and picked roles stay secret, and only the picker may pick');
}());

// --- calling order and the Assassin -----------------------------------

(function assassinSkipsTheTargetSecretly() {
  const game = gameWith(3);
  startWithRoles(game, { p1: 'ASSASSIN', p2: 'MERCHANT', p3: 'KING' });
  assert(game.phase === PHASES.TURNS && game.turn.playerId === 'p1', 'the Assassin is called first');

  game.useAbility('p1', { targetRole: 'MERCHANT' });
  const kingView = game.toClientJSON('p3');
  assert(!JSON.stringify(kingView.log).includes('MERCHANT'), 'the target is not in anyone else\'s log');
  assert(kingView.roleTrack.find((r) => r.id === 'MERCHANT').state === 'pending', 'the role track does not show the kill yet');
  assert(!JSON.stringify(game.toClientJSON('p2').log).includes('ASSASSIN_TARGETED'), 'the victim is not told either');
  assert(game.toClientJSON('p1').you.secretTarget === 'MERCHANT', 'the Assassin sees their own target');

  const goldBefore = game.getPlayer('p2').gold;
  game.takeGold('p1');
  game.endTurn('p1');
  assert(game.turn.playerId === 'p3' && game.turn.roleId === 'KING', 'absent roles are skipped and the King is called');
  game.takeGold('p3');
  game.endTurn('p3');

  const reveal = game.toClientJSON('p3').log.find((e) => e.type === 'ROLE_KILLED');
  assert(reveal && reveal.params.role === 'MERCHANT' && reveal.params.name === 'P2', 'the kill is announced to everyone when the Merchant is called');
  assert(game.getPlayer('p2').gold === goldBefore, 'the killed player gets no turn and no gold');
  assert(game.phase === PHASES.DRAFT && game.round === 2, 'after the last role the next round begins');
  console.log('✓ the Assassin\'s target stays secret until called, then loses the turn');
}());

(function thiefStealsBeforeTheTargetActs() {
  const game = gameWith(3);
  startWithRoles(game, { p1: 'THIEF', p2: 'KING', p3: 'WARLORD' });
  game.getPlayer('p2').gold = 5;
  assertThrows(() => game.useAbility('p1', { targetRole: 'ASSASSIN' }), /cannot be targeted/i, 'the Thief cannot rob the Assassin');
  game.useAbility('p1', { targetRole: 'KING' });
  assert(!JSON.stringify(game.toClientJSON('p3').log).includes('KING'), 'the robbery target stays secret');
  assert(!JSON.stringify(game.toClientJSON('p2').log).includes('THIEF_TARGETED'), 'the victim is not told either');
  game.takeGold('p1');
  const thiefGold = game.getPlayer('p1').gold;
  game.endTurn('p1');

  assert(game.turn.playerId === 'p2', 'the King is called');
  assert(game.getPlayer('p2').gold === 0, 'the robbed King has nothing when the turn begins');
  assert(game.getPlayer('p1').gold === thiefGold + 5, 'the Thief receives the King\'s gold');
  assert(game.crownId === 'p2', 'the King takes the crown');
  console.log('✓ the Thief takes the target\'s gold before it can act, and the King takes the crown');
}());

(function kingPicksFirstNextRound() {
  const game = gameWith(3);
  startWithRoles(game, { p1: 'MAGICIAN', p2: 'BISHOP', p3: 'KING' });
  while (game.phase === PHASES.TURNS) {
    game.takeGold(game.turn.playerId);
    game.endTurn(game.turn.playerId);
  }
  assert(game.draft.order[0] === 'p3', 'the new crown holder picks first in the next round');
  console.log('✓ the King influences the next round\'s pick order');
}());

// --- economy and building ---------------------------------------------

(function merchantIncomeAndBuilding() {
  const game = gameWith(3);
  startWithRoles(game, { p1: 'MERCHANT', p2: 'KING', p3: 'ARCHITECT' });
  // p1 is called last among these; walk to the Merchant.
  while (game.turn.roleId !== 'MERCHANT') {
    game.takeGold(game.turn.playerId);
    game.endTurn(game.turn.playerId);
  }
  const merchant = game.getPlayer('p1');
  merchant.gold = 0;
  merchant.city = [
    { uid: card(game, 'TAVERN'), districtId: 'TAVERN' },
    { uid: card(game, 'MARKET'), districtId: 'MARKET' },
  ];
  const tavern2 = card(game, 'TAVERN');
  const harbor = card(game, 'HARBOR');
  merchant.hand = [tavern2, harbor];

  assertThrows(() => game.build('p1', harbor), /resources/i, 'building waits until resources are taken');
  game.takeGold('p1');
  assert(merchant.gold === 3, 'the Merchant takes 2 gold plus 1');
  assertThrows(() => game.takeGold('p1'), /already/i, 'resources can be taken only once');
  game.collectIncome('p1');
  assert(merchant.gold === 5, 'trade districts pay the Merchant income');
  assertThrows(() => game.collectIncome('p1'), /already/i, 'income is collected once');
  assertThrows(() => game.build('p1', tavern2), /already have/i, 'a duplicate district cannot be built');
  assertThrows(() => game.build('p2', harbor), /not your turn/i, 'nobody builds out of turn');
  game.build('p1', harbor);
  assert(merchant.gold === 1 && merchant.city.length === 3, 'building pays the cost and adds the district');
  const extra = card(game, 'TEMPLE');
  merchant.hand.push(extra);
  assertThrows(() => game.build('p1', extra), /per turn/i, 'one district per turn for a normal role');
  assertThrows(() => game.build('p1', 'c9999'), /not in your hand/i, 'a card that is not yours cannot be built');
  console.log('✓ the Merchant earns extra, income follows district types, and building is validated');
}());

(function architectDrawsAndBuildsThree() {
  const game = gameWith(2);
  startWithRoles(game, { p1: 'KING', p2: 'ARCHITECT' });
  game.takeGold('p1');
  game.endTurn('p1');
  const architect = game.getPlayer('p2');
  assert(architect.hand.length === 6, 'the Architect draws 2 extra cards when called');
  architect.gold = 20;
  architect.hand = ['TEMPLE', 'TAVERN', 'MANOR', 'PRISON'].map((d) => card(game, d));
  game.takeGold('p2');
  architect.hand.slice(0, 3).forEach((uid) => game.build('p2', uid));
  assert(architect.city.length === 3, 'the Architect builds three districts');
  assertThrows(() => game.build('p2', architect.hand[0]), /per turn/i, 'but not four');
  console.log('✓ the Architect draws two extra cards and builds up to three');
}());

(function warlordRespectsBishopAndKeep() {
  const game = gameWith(3);
  startWithRoles(game, { p1: 'BISHOP', p2: 'WARLORD', p3: 'MERCHANT' });
  const bishop = game.getPlayer('p1');
  const merchant = game.getPlayer('p3');
  bishop.city = [{ uid: card(game, 'CHURCH'), districtId: 'CHURCH' }];
  const keep = card(game, 'KEEP');
  const manor = card(game, 'MANOR');
  merchant.city = [{ uid: keep, districtId: 'KEEP' }, { uid: manor, districtId: 'MANOR' }];
  while (game.turn.roleId !== 'WARLORD') {
    game.takeGold(game.turn.playerId);
    game.endTurn(game.turn.playerId);
  }
  const warlord = game.getPlayer('p2');
  warlord.gold = 10;
  assertThrows(() => game.useAbility('p2', { targetPlayerId: 'p1', cardUid: bishop.city[0].uid }), /protected/i, 'the Bishop\'s city is protected');
  assertThrows(() => game.useAbility('p2', { targetPlayerId: 'p3', cardUid: keep }), /cannot be destroyed/i, 'the Keep cannot be destroyed');
  game.useAbility('p2', { targetPlayerId: 'p3', cardUid: manor });
  assert(warlord.gold === 8 && merchant.city.length === 1, 'destroying a 3-cost district costs 2');
  assertThrows(() => game.useAbility('p2', { targetPlayerId: 'p3', cardUid: keep }), /already used/i, 'the power is used once per turn');
  console.log('✓ the Warlord pays cost minus one and respects the Bishop and the Keep');
}());

(function magicianSwapsHands() {
  const game = gameWith(2);
  startWithRoles(game, { p1: 'MAGICIAN', p2: 'KING' });
  const mine = [...game.getPlayer('p1').hand];
  const theirs = [...game.getPlayer('p2').hand];
  game.useAbility('p1', { mode: 'SWAP', targetPlayerId: 'p2' });
  assert(JSON.stringify(game.getPlayer('p1').hand) === JSON.stringify(theirs), 'the Magician takes the other hand');
  assert(JSON.stringify(game.getPlayer('p2').hand) === JSON.stringify(mine), 'and gives theirs away');
  console.log('✓ the Magician swaps hands');
}());

// --- end of game ------------------------------------------------------

(function completingACityEndsTheRoundAndScores() {
  const game = gameWith(2, { citySize: 7 });
  startWithRoles(game, { p1: 'KING', p2: 'MERCHANT' });
  const king = game.getPlayer('p1');
  king.city = ['MANOR', 'TEMPLE', 'TAVERN', 'WATCHTOWER', 'CASTLE', 'CHURCH'].map((d) => ({ uid: card(game, d), districtId: d }));
  const gate = card(game, 'DRAGON_GATE');
  king.hand = [gate];
  king.gold = 10;
  game.takeGold('p1');
  game.build('p1', gate);
  assert(game.firstCompleterId === 'p1', 'the first player to reach seven districts is recorded');
  assert(game.phase === PHASES.TURNS, 'the round is still played to its end');
  game.endTurn('p1');
  game.takeGold('p2');
  game.endTurn('p2');
  assert(game.phase === PHASES.GAME_OVER, 'the game ends after the completing round');

  const top = game.results.standings[0];
  const expectedBase = [3, 1, 1, 1, 4, 2].reduce((a, b) => a + b, 0) + districtDef('DRAGON_GATE').cost + 2;
  assert(top.playerId === 'p1', 'the completed city wins');
  assert(top.base === expectedBase, `base score counts costs and bonuses (${top.base} vs ${expectedBase})`);
  assert(top.diversity === 3, 'all five types give 3 points');
  assert(top.completion === 4, 'finishing first gives 4 points');
  const view = game.toClientJSON('p2');
  assert(view.players.every((p) => p.role), 'every role is revealed at the end');
  console.log('✓ a completed city ends the round, and scoring counts costs, types and completion');
}());

// --- secrecy and tampering --------------------------------------------

(function payloadsKeepHandsPrivate() {
  const game = gameWith(3);
  game.start('p1');
  const view = game.toClientJSON('p2');
  assert(view.you.hand.length === 4, 'a player sees their own hand');
  assert(view.players.every((p) => p.hand === undefined && typeof p.handCount === 'number'), 'other hands are only counted, never listed');
  assert(view.deckCount > 0 && view.deck === undefined, 'the deck order is never sent');
  const theirCards = game.getPlayer('p3').hand;
  assert(theirCards.every((uid) => !JSON.stringify(view).includes(`"${uid}"`)), 'no card id from another hand leaks');
  console.log('✓ hands and the deck never appear in another player\'s payload');
}());

(function survivesPersistence() {
  const game = gameWith(4);
  game.start('p1');
  game.pickRole(game.currentPicker().id, game.availableRoles()[0]);
  const restored = CitadelsGame.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert(restored.phase === game.phase && restored.draft.index === 1, 'the draft survives a round trip');
  assert(JSON.stringify(restored.players.map((p) => p.hand)) === JSON.stringify(game.players.map((p) => p.hand)), 'hands survive');
  assert(restored.players.every((p) => !p.connected), 'restored players start disconnected');
  console.log('✓ a game in progress survives being persisted and restored');
}());

// --- a full game ------------------------------------------------------

(function randomGamesPlayToTheEnd() {
  for (let g = 0; g < 25; g += 1) {
    const count = 2 + (g % 6);
    const game = gameWith(count);
    game.start('p1');
    let steps = 0;
    while (game.phase !== PHASES.GAME_OVER && steps < 5000) {
      steps += 1;
      if (game.phase === PHASES.DRAFT) {
        const options = game.availableRoles();
        game.pickRole(game.currentPicker().id, options[Math.floor(Math.random() * options.length)]);
        continue;
      }
      const actor = game.getPlayer(game.turn.playerId);
      if (Math.random() < 0.5) game.takeGold(actor.id);
      else {
        try { game.drawForResources(actor.id); } catch { game.takeGold(actor.id); }
        if (game.turn.step === 'CHOOSE') game.keepCard(actor.id, game.turn.drawn[0]);
      }
      try { game.collectIncome(actor.id); } catch { /* role without income */ }
      const affordable = actor.hand.find((uid) => {
        const d = districtDef(game.cards[uid]);
        return d.cost <= actor.gold && !actor.city.some((c) => c.districtId === d.id);
      });
      if (affordable) game.build(actor.id, affordable);
      if (Math.random() < 0.2) {
        try { game.onTimeout(); continue; } catch { /* fall through */ }
      }
      game.endTurn(actor.id);
      assert(game.players.every((p) => p.gold >= 0), 'gold never goes negative');
    }
    assert(game.phase === PHASES.GAME_OVER, `a ${count}-player game reaches the end (stopped after ${steps} steps)`);
    const allCards = game.players.flatMap((p) => [...p.hand, ...p.city.map((c) => c.uid)]).concat(game.deck, game.discardPile);
    assert(new Set(allCards).size === allCards.length, 'no card is ever duplicated');
  }
  console.log('✓ 25 random games with 2-7 players play to a winner with no duplicated cards');
}());

console.log('\n=== CITADELS ENGINE TESTS PASSED ===');
