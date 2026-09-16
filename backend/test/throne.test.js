// Unit tests for an online Iron Throne room (src/throne/ThroneGame.js):
// seats at the great houses, who may act, what each lord may see, the
// clocks, computer houses, players who drop out and come back, and a
// whole game played to its end by the computer.

const {
  ThroneGame, ThroneError, PHASES, cleanAction,
} = require('../src/throne/ThroneGame');
const engine = require('../src/throne/engine.mjs');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${name}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function throws(fn, pattern, msg) {
  try {
    fn();
  } catch (err) {
    assert(err instanceof ThroneError, `${msg}: expected a ThroneError, got ${err.name}: ${err.message}`);
    if (pattern) assert(pattern.test(err.message), `${msg}: unexpected message "${err.message}"`);
    return;
  }
  throw new Error(`ASSERTION FAILED: ${msg} (did not throw)`);
}

function room(n = 3, settings = {}) {
  const game = new ThroneGame('THRON', 'p1', { turnSec: 0, ...settings });
  for (let i = 1; i <= n; i += 1) {
    game.addPlayer({
      playerId: `p${i}`, socketId: `s${i}`, nickname: `Lord ${i}`, accountId: i === 1 ? 'acc1' : null,
    });
  }
  return game;
}

const lordOf = (game, house) => game.players.find((p) => p.house === house);
const current = (game) => engine.currentHouse(game.state);

// eslint-disable-next-line no-console
console.log('Iron Throne tests');

test('lobby: every player gets a different house, choices and AI seats are checked', () => {
  const game = room(3);
  const houses = game.players.map((p) => p.house);
  assert(new Set(houses).size === 3 && houses.every(Boolean), 'three different houses assigned on join');
  throws(() => game.chooseHouse('p2', houses[0]), /already leads/, 'a taken house cannot be chosen');
  game.chooseHouse('p2', 'martell');
  assert(game.getPlayer('p2').house === 'martell', 'a free house can be chosen');
  throws(() => game.setAiHouse('p2', 'tyrell', true), /host/, 'only the host seats the computer');
  throws(() => game.setAiHouse('p1', 'martell', true), /player already/, 'the computer cannot take a player\'s house');
  game.setAiHouse('p1', 'tyrell', true);
  assert(game.aiHouses.includes('tyrell'), 'the host gives a free house to the computer');
  game.chooseHouse('p3', 'tyrell');
  assert(!game.aiHouses.includes('tyrell'), 'a player choosing a computer house takes it over');
  throws(() => game.updateSettings('p2', { target: 6 }), /host/, 'only the host changes settings');
  game.updateSettings('p1', { target: 6, roundLimit: 999, turnSec: 90 });
  assert(game.settings.target === 6 && game.settings.roundLimit === 10 && game.settings.turnSec === 90, 'settings are sanitised');
});

test('start: needs two players, seats humans and computer houses', () => {
  const lonely = room(1);
  throws(() => lonely.start('p1'), /at least 2/, 'one player cannot start');
  const game = room(2);
  game.setAiHouse('p1', 'greyjoy', true);
  throws(() => game.start('p2'), /host/, 'only the host starts');
  game.start('p1');
  assert(game.phase === PHASES.PLAY && game.state.phase === 'play', 'the game is running');
  assert(game.state.order.length === 3, 'two players and one computer house take part');
  assert(game.state.houses.greyjoy.control === 'ai', 'the computer house is AI-controlled');
  game.players.forEach((p) => {
    assert(game.state.houses[p.house].control === 'human', 'player houses are human');
    assert(game.state.houses[p.house].name === p.nickname, 'the house carries its lord\'s nickname');
  });
  throws(() => game.addPlayer({ playerId: 'late', socketId: 'x', nickname: 'Late' }), /already started/, 'nobody joins mid-game');
});

test('actions: only the current lord acts, payloads are validated', () => {
  const game = room(2);
  game.start('p1');
  const lord = lordOf(game, current(game));
  const other = game.players.find((p) => p.id !== lord.id);
  throws(() => game.act(other.id, { type: 'endTurn' }), /not your turn/, 'acting out of turn is refused');
  throws(() => game.act(lord.id, { type: 'teleport' }), /Unknown action/, 'unknown actions are refused');
  throws(() => game.act(lord.id, { type: 'recruit', territory: '__proto__', unit: 'f' }), /Invalid/, 'odd ids are refused');
  throws(() => game.act(lord.id, { type: 'move', from: 'winterfell', to: 'moat_cailin', f: -1, k: 0 }), /Invalid/, 'negative troops are refused');
  throws(() => game.act(lord.id, { type: 'recruit', territory: 'sunspear', unit: 'f' }), /not possible/, 'the engine refuses an illegal move');
  const seat = engine.HOUSES[lord.house].seat;
  const goldBefore = game.state.houses[lord.house].gold;
  game.act(lord.id, { type: 'recruit', territory: seat, unit: 'f' });
  assert(game.state.houses[lord.house].gold === goldBefore - 2, 'a legal recruit is applied');
  game.act(lord.id, { type: 'endTurn' });
  assert(current(game) === other.house, 'the turn passes to the next lord');
  assert(cleanAction({ type: 'playCard', index: 0 }).index === 0, 'a card without a target is a valid action');
});

test('payloads: no dice seed, no deck order, only your own tactic cards', () => {
  const game = room(2);
  game.start('p1');
  const [a, b] = game.players;
  const view = game.toClientJSON(a.id);
  assert(view.game && view.game.rng === undefined, 'the dice seed is never sent');
  assert(view.game.cardDeck.length === 0 && view.game.cardDeckCount > 0, 'the card deck arrives as a count');
  assert(view.game.eventDeck.length === 0 && view.game.eventDeckCount > 0, 'the event deck arrives as a count');
  assert(view.game.houses[a.house].hand.length === 1, 'your own hand is visible');
  assert(view.game.houses[b.house].hand.length === 0 && view.game.houses[b.house].handCount === 1, 'another hand arrives as a count');
  assert(game.state.houses[b.house].hand.length === 1, 'the server state itself is untouched');
  assert(view.you.house === a.house && view.players.find((p) => p.isYou).id === a.id, 'the viewer is marked');
});

test('diplomacy: an offer waits for the other lord, who alone may answer', () => {
  const game = room(3);
  game.start('p1');
  const lord = lordOf(game, current(game));
  const target = game.players.find((p) => p.id !== lord.id);
  const bystander = game.players.find((p) => p.id !== lord.id && p.id !== target.id);
  game.act(lord.id, { type: 'propose', to: target.house });
  assert(game.state.proposal && game.state.proposal.to === target.house, 'the offer is pending');
  throws(() => game.act(lord.id, { type: 'endTurn' }), /Wait for the answer/, 'the turn waits for the answer');
  throws(() => game.act(bystander.id, { type: 'respond', accept: true }), /No alliance/, 'a third lord cannot answer');
  game.act(target.id, { type: 'respond', accept: true });
  assert(engine.isAllied(game.state, lord.house, target.house), 'the alliance is made');
});

test('clocks: a turn clock ends the turn, an absent lord gets a short grace', () => {
  const game = room(2, { turnSec: 60 });
  game.start('p1');
  const first = current(game);
  assert(game.phaseEndsAt > Date.now() + 50000, 'the turn clock is armed');
  const lord = lordOf(game, first);
  game.setConnected(lord.id, false);
  assert(game.phaseEndsAt <= Date.now() + 20500, 'an absent lord only gets the grace period');
  game.phaseEndsAt = Date.now() - 1;
  game.onTimeout();
  assert(current(game) !== first, 'the turn moved on');
  assert(game.state.log.some((e) => e.key === 'autoEnd' && e.house === first), 'the chronicle notes the automatic end');

  const offer = room(2, { turnSec: 0 });
  offer.start('p1');
  const proposer = lordOf(offer, current(offer));
  const answerer = offer.players.find((p) => p.id !== proposer.id);
  offer.act(proposer.id, { type: 'propose', to: answerer.house });
  assert(offer.phaseEndsAt, 'an unanswered offer has a deadline even without a turn clock');
  offer.phaseEndsAt = Date.now() - 1;
  offer.onTimeout();
  assert(!offer.state.proposal && !engine.isAllied(offer.state, proposer.house, answerer.house), 'an unanswered offer is turned down');
});

test('leaving: the computer takes the house, the lord can take it back', () => {
  const game = room(3);
  game.start('p1');
  const leaver = game.players[2];
  game.removePlayer(leaver.id);
  assert(game.state.houses[leaver.house].control === 'ai', 'the computer rules a house whose lord left');
  assert(game.players.length === 3 && leaver.left, 'the seat stays');
  game.addPlayer({ playerId: leaver.id, socketId: 'back', nickname: leaver.nickname });
  assert(game.state.houses[leaver.house].control === 'human' && !leaver.left, 'a returning lord takes the house back');
});

test('serialization: a room survives a restart of the server', () => {
  const game = room(2);
  game.setAiHouse('p1', 'tyrell', true);
  game.start('p1');
  const lord = lordOf(game, current(game));
  game.act(lord.id, { type: 'endTurn' });
  const copy = ThroneGame.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert(copy.phase === PHASES.PLAY && copy.state.turnNo === game.state.turnNo, 'the game state is restored');
  assert(copy.players.every((p) => !p.connected && !p.socketId), 'restored players start disconnected');
  assert(copy.aiHouses.includes('tyrell') && copy.state.rng === game.state.rng, 'computer seats and the dice seed are restored');
});

test('a whole game: computer houses play it to the end, results are ranked', () => {
  const game = room(2, { roundLimit: 8 });
  game.setAiHouse('p1', 'tyrell', true);
  game.setAiHouse('p1', 'martell', true);
  game.start('p1');
  // Both lords walk away; the computer finishes the war.
  game.players.forEach((p) => game.removePlayer(p.id));
  let steps = 0;
  while (game.phase === PHASES.PLAY && steps < 20000) {
    game.aiAt = Date.now() - 1;
    game.phaseEndsAt = game.phaseEndsAt ? Date.now() - 1 : null;
    game.onTimeout();
    steps += 1;
  }
  assert(game.phase === PHASES.GAME_OVER, `the game ended (after ${steps} steps)`);
  const { standings, winners, reason } = game.results;
  assert(['throne', 'rounds', 'conquest'].includes(reason), 'the game ended for a known reason');
  assert(standings.length === 4 && winners.length >= 1, 'every house is ranked and someone won');
  assert(standings.filter((r) => r.playerId).length === 2, 'player seats are linked to their players');
  for (let i = 1; i < standings.length; i += 1) {
    const [x, y] = [standings[i - 1], standings[i]];
    assert(x.out <= y.out, 'fallen houses rank last');
  }
  game.players.forEach((p) => { p.left = false; });
  game.restart('p1');
  assert(game.phase === PHASES.LOBBY && game.state === null && game.results === null, 'the host sets up a new game');
});

// eslint-disable-next-line no-console
console.log(`Iron Throne tests: ${passed} passed`);
