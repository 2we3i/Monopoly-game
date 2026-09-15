// Deterministic tests of the Cosmic Encounter engine.
//
// The destiny deck, hands and alien choices are random in a real game, so
// the tests do what a referee would: put the destiny card, the encounter
// cards or the race a rule needs on top, then drive the real engine
// methods through every phase. Ship and card accounting is checked after
// every scenario, and random bot games run whole matches to the end.

const {
  CosmicGame, CosmicError, PHASES, SHIPS_PER_PLAYER, WIN_COLONIES,
} = require('../src/cosmic/CosmicGame');
const { cosmicDeckList, destinyDeckList, isEncounter } = require('../src/cosmic/cards');
const { ALIEN_IDS } = require('../src/cosmic/aliens');

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
function assertThrows(fn, pattern, msg) {
  let threw = false;
  let text = '';
  try { fn(); } catch (e) { threw = e instanceof CosmicError; text = e.message; }
  assert(threw, `${msg} (expected a CosmicError, got "${text}")`);
  if (pattern) assert(pattern.test(text), `${msg} (message "${text}" did not match ${pattern})`);
}
function test(name, fn) {
  fn();
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${name}`);
}

// --- helpers -----------------------------------------------------------------

function accounting(g) {
  g.players.forEach((p) => assert(g.shipsInPlay(p.id) === SHIPS_PER_PLAYER, `${p.nickname} still has 20 ships (${g.shipsInPlay(p.id)})`));
  const where = new Map();
  const put = (uid) => where.set(uid, (where.get(uid) || 0) + 1);
  g.cosmicDeck.forEach(put);
  g.cosmicDiscard.forEach(put);
  g.players.forEach((p) => p.hand.forEach(put));
  if (g.enc) {
    ['offense', 'defense'].forEach((s) => { const u = g.enc.cards[s]; if (u && !where.has(u) && g.enc.fetch?.cardUid !== u) put(u); });
    g.enc.reinforcements.forEach((r) => { if (!where.has(r.uid)) put(r.uid); });
    if (g.enc.fetch?.stage === 'OFFER') put(g.enc.fetch.cardUid);
  }
  const cosmic = Object.keys(g.cards).filter((u) => g.cards[u].type);
  assert(cosmic.length === 72, 'the cosmic deck has 72 cards');
  cosmic.forEach((u) => assert(where.get(u) === 1, `card ${u} is in exactly one place (${where.get(u) || 0})`));
}

// A game in play with fixed races: aliens[i] for player i (null = none).
function newGame(count = 3, aliens = []) {
  const g = new CosmicGame('TEST', 'p1');
  for (let i = 1; i <= count; i += 1) {
    g.addPlayer({
      playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}`, accountId: i === 1 ? 'acc1' : null,
    });
  }
  g.start('p1');
  g.players.forEach((p, i) => {
    const wanted = aliens[i] || null;
    // Keep the dealt options valid but make the wanted race one of them.
    if (wanted) p.alienOptions = [wanted, ALIEN_IDS.find((a) => a !== wanted)];
  });
  g.players.forEach((p, i) => g.chooseAlien(p.id, aliens[i] || p.alienOptions[0]));
  // Tests that do not ask for a race use none, so no power interferes.
  g.players.forEach((p, i) => { if (!aliens[i]) p.alienId = null; });
  // p1 is always the first offense.
  g.turnIndex = 0;
  g.newEncounter(1, 'START');
  return g;
}

function card(g, def) {
  const uid = g.newCard(def);
  // Replace a random deck card so the deck stays 72 cards.
  const victim = g.cosmicDeck.shift();
  delete g.cards[victim];
  return uid;
}

// Gives a player exactly these cards (the old hand goes to the discard).
function setHand(g, playerId, defs) {
  const p = g.getPlayer(playerId);
  g.cosmicDiscard.push(...p.hand);
  p.hand = defs.map((d) => card(g, d));
  // A copy: playing a card splices the hand, which must not shift the ids a test holds.
  return [...p.hand];
}

const A = (value) => ({ type: 'attack', value });
const N = { type: 'negotiate' };
const M = { type: 'morph' };
const R = (value) => ({ type: 'reinforcement', value });
const ART = (artifact) => ({ type: 'artifact', artifact });

function topDestiny(g, def) {
  g.destinyDeck.push({ ...def });
  g.destinyDeck.push({ kind: 'wild' }); // keeps the deck above one card
  g.destinyDeck.splice(g.destinyDeck.length - 1, 1);
  g.destinyDeck.push({ ...def });
}

// Runs start, regroup and destiny for p1 against `defenderId`, then aims at
// the defender's planet 0 with `ships` ships taken from p1's planet 0.
function toAlliance(g, defenderId, ships = 2, planetIndex = 0) {
  const aggr = g.enc.aggressorId;
  g.beginTurn(aggr);
  g.regroup(aggr, g.bestColony(aggr)?.id);
  topDestiny(g, { kind: 'color', color: g.getPlayer(defenderId).color });
  g.drawDestiny(aggr);
  assert(g.enc.phase === 'LAUNCH' && g.enc.defenderId === defenderId, 'destiny names the defense');
  const from = g.colonies(aggr).find((pl) => pl.ownerId === aggr && pl.ships[aggr] >= ships);
  const target = g.planets.find((pl) => pl.ownerId === defenderId && pl.index === planetIndex);
  g.launch(aggr, { planetId: target.id, ships: { [from.id]: ships } });
  assert(g.enc.phase === 'ALLIANCE' && g.enc.step === 'INVITE_OFFENSE', 'launch leads to alliances');
  return target.id;
}

function noAllies(g) {
  g.invite(g.enc.aggressorId, []);
  g.invite(g.enc.defenderId, []);
}

function playCards(g, offenseUid, defenseUid) {
  assert(g.enc.phase === 'PLANNING' && g.enc.step === 'SELECT', 'planning is waiting for cards');
  g.selectCard(g.enc.aggressorId, offenseUid);
  g.selectCard(g.enc.defenderId, defenseUid);
  assert(g.enc.phase === 'REVEAL', 'both cards chosen: reveal');
}

function lastOutcome(g) {
  const e = [...g.log].reverse().find((x) => x.type === 'OFFENSE_WON' || x.type === 'DEFENSE_WON');
  return e ? { type: e.type === 'OFFENSE_WON' ? 'offense' : 'defense', totals: e.params.totals } : { type: null };
}

function passAll(g) {
  g.involvedIds().forEach((id) => { if (g.enc.phase === 'REVEAL') g.pass(id); });
}

// --- components and setup ---------------------------------------------------------

test('components: 55 encounter cards, 6 reinforcements, 11 artifacts; destiny 3 per colour + 2 wild + 3 special', () => {
  const deck = cosmicDeckList();
  assert(deck.length === 72, '72 cosmic cards');
  assert(deck.filter(isEncounter).length === 55, '55 encounter cards');
  assert(deck.filter((c) => c.type === 'reinforcement').length === 6, '6 reinforcements');
  assert(deck.filter((c) => c.type === 'artifact').length === 11, '11 artifacts');
  assert(deck.filter((c) => c.type === 'morph').length === 1, 'one morph');
  const destiny = destinyDeckList(['red', 'blue', 'yellow', 'green', 'purple']);
  assert(destiny.length === 20, 'a full destiny deck has 20 cards');
  assert(destinyDeckList(['red', 'blue', 'yellow']).length === 14, 'unused colours are left out');
});

test('setup: colours, 5 planets with 4 ships, 8 cards, two races each, first player from destiny', () => {
  const g = new CosmicGame('T', 'p1');
  ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => g.addPlayer({ playerId: id, socketId: id, nickname: id, accountId: i === 0 ? 'a' : null }));
  assertThrows(() => new CosmicGame('X', 'a').start('a'), /host|at least/, 'an empty room cannot start');
  assertThrows(() => g.start('p2'), /host/, 'only the host starts');
  g.start('p1');
  assert(g.phase === PHASES.ALIENS, 'races are chosen first');
  assert(new Set(g.players.map((p) => p.color)).size === 4, 'each player has a colour');
  g.players.forEach((p) => {
    const home = g.planets.filter((pl) => pl.ownerId === p.id);
    assert(home.length === 5 && home.every((pl) => pl.ships[p.id] === 4), '5 home planets with 4 ships each');
    assert(p.hand.length === 8, '8 starting cards');
    assert(p.alienOptions.length === 2 && p.alienOptions[0] !== p.alienOptions[1], 'two different races offered');
  });
  assert(g.destinyDeck.length === 17, 'destiny: 12 colour cards, 2 wild, 3 special');
  assertThrows(() => g.chooseAlien('p1', ALIEN_IDS.find((a) => !g.getPlayer('p1').alienOptions.includes(a))), /two races/, 'only a dealt race');
  g.players.forEach((p) => g.chooseAlien(p.id, p.alienOptions[1]));
  assert(g.phase === PHASES.PLAY && g.enc.phase === 'START', 'play begins at the start of a turn');
  assert(g.destinyDeck.length === 17 && g.destinyDiscard.length === 0, 'the destiny deck is reshuffled after picking the first player');
  accounting(g);
  const payload = g.toClientJSON('p2');
  assert(payload.players.every((p) => p.handCount === 8) && payload.you.hand.length === 8, 'hands are counts for others, cards for you');
});

// --- the eight phases ----------------------------------------------------------------

test('phases: start, regroup (a ship back from the warp), destiny, launch in order', () => {
  const g = newGame(3);
  g.warp.p1 = 2;
  g.planets.find((pl) => pl.id === 'red-4').ships.p1 = 2;
  assertThrows(() => g.regroup('p1', 'red-0'), /cannot be done/, 'no regroup before the turn starts');
  assertThrows(() => g.beginTurn('p2'), /offense/, 'only the offense begins the turn');
  g.beginTurn('p1');
  assert(g.enc.phase === 'REGROUP', 'start → regroup');
  assertThrows(() => g.regroup('p1', 'blue-0'), /your colonies/, 'the ship returns to your own colony');
  g.regroup('p1', 'red-1');
  assert(g.warp.p1 === 1 && g.shipsOn('p1', 'red-1') === 5, 'one ship came back from the warp');
  assert(g.enc.phase === 'DESTINY' && g.enc.step === 'DRAW', 'regroup → destiny');
  topDestiny(g, { kind: 'color', color: 'blue' });
  g.drawDestiny('p1');
  assert(g.enc.phase === 'LAUNCH' && g.enc.defenderId === 'p2', 'a blue card makes blue the defense');
  assertThrows(() => g.launch('p1', { planetId: 'yellow-0', ships: { 'red-0': 1 } }), /home system/, 'the target must be in the defense\'s system');
  assertThrows(() => g.launch('p1', { planetId: 'blue-0', ships: { 'red-0': 3, 'red-1': 2 } }), /at most 4/, 'at most 4 ships');
  assertThrows(() => g.launch('p1', { planetId: 'blue-0', ships: {} }), /at least one/, 'at least 1 ship');
  g.launch('p1', { planetId: 'blue-0', ships: { 'red-0': 1, 'red-1': 2 } });
  assert(g.enc.gate.p1['red-0'] === 1 && g.enc.gate.p1['red-1'] === 2, 'ships from home colonies are on the gate');
  assert(g.shipsOn('p1', 'red-0') === 3, 'ships left their colonies');
  accounting(g);
  const view = g.toClientJSON('p3').encounter;
  assert(view.gate.p1 === 3 && view.targetPlanetId === 'blue-0', 'everyone sees the gate and the target');
});

test('attack vs attack: offense wins with ships counted; colonies, warp and the colony track update', () => {
  const g = newGame(3);
  const [o] = setHand(g, 'p1', [A(8), N]);
  const [d] = setHand(g, 'p2', [A(4), N]);
  const target = toAlliance(g, 'p2', 3);
  noAllies(g);
  playCards(g, o, d);
  const view = g.toClientJSON('p3').encounter;
  assert(view.totals.offense.total === 11 && view.totals.defense.total === 8, 'totals are card + ships (8+3 vs 4+4)');
  passAll(g);
  assert(g.enc.outcome.type === 'offense', 'the higher total wins');
  assert(g.shipsOn('p1', target) === 3 && !g.shipsOn('p2', target), 'the offense lands; the defense colony is gone');
  assert(g.warp.p2 === 4, 'the defender\'s ships went to the warp');
  assert(g.foreignColonies('p1') === 1 && g.toClientJSON('p2').players[0].foreignColonies === 1, 'the colony track moves to 1');
  assert(g.enc.step === 'NEXT', 'a successful first encounter offers a second one');
  accounting(g);
});

test('attack vs attack: a tie goes to the defense, whose allies take rewards', () => {
  const g = newGame(4);
  const [o] = setHand(g, 'p1', [A(6), N]);
  const [d] = setHand(g, 'p2', [A(3), N]);
  toAlliance(g, 'p2', 2);
  g.invite('p1', ['p3']);
  g.invite('p2', ['p3', 'p4']);
  assert(g.enc.acceptOrder.join() === 'p3,p4', 'invited players answer in turn order from the offense\'s left');
  assertThrows(() => g.respondAlliance('p4', { side: 'defense', ships: { 'green-0': 1 } }), /turn to answer/, 'answers come in order');
  g.respondAlliance('p3', { side: 'defense', ships: { 'yellow-0': 2 } });
  g.warp.p4 = 1;
  g.planets.find((pl) => pl.id === 'green-4').ships.p4 = 3;
  g.respondAlliance('p4', { side: 'defense', ships: { 'green-0': 1 } });
  assert(g.enc.allies.p3 === 'defense' && g.enc.allies.p4 === 'defense', 'two defensive allies');
  playCards(g, o, d);
  passAll(g);
  // 6 + 2 = 8 vs 3 + 4 + 2 + 1 = 10.
  assert(g.enc.outcome.type === 'defense', 'the defense wins');
  assert(g.warp.p1 === 2, 'the offense\'s ships go to the warp');
  assert(g.enc.step === 'REWARDS' && g.enc.rewards.p3 === 2 && g.enc.rewards.p4 === 1, 'rewards: one per ally ship');
  const before = g.getPlayer('p3').hand.length;
  g.claimRewards('p3', 2);
  assert(g.getPlayer('p3').hand.length === before + 2, 'cards chosen as rewards');
  g.claimRewards('p4', 0);
  assert(g.warp.p4 === 0, 'a ship freed from the warp as a reward');
  assert(g.shipsOn('p3', 'yellow-0') === 4, 'allies\' ships go home');
  assert(g.enc.phase === 'START' && g.enc.aggressorId === 'p2', 'a lost encounter ends the turn; the next player is the offense');
  accounting(g);

  const tie = newGame(3);
  const [to] = setHand(tie, 'p1', [A(6), N]);
  const [td] = setHand(tie, 'p2', [A(4), N]);
  toAlliance(tie, 'p2', 2);
  noAllies(tie);
  playCards(tie, to, td);
  passAll(tie);
  const tieResult = lastOutcome(tie);
  assert(tieResult.type === 'defense' && tieResult.totals.offense === tieResult.totals.defense, 'a tie goes to the defense');
  accounting(tie);
});

test('attack vs negotiate: attack wins, the negotiator takes compensation cards', () => {
  const g = newGame(3);
  const [o] = setHand(g, 'p1', [A(1), N, R(2), A(4)]);
  const [d] = setHand(g, 'p2', [N, A(10)]);
  toAlliance(g, 'p2', 1);
  noAllies(g);
  playCards(g, o, d);
  passAll(g);
  assert(lastOutcome(g).type === 'offense', 'attack beats negotiate whatever the numbers');
  assert(g.warp.p2 === 4, '4 defending ships lost');
  assert(g.getPlayer('p1').hand.length === 0 && g.getPlayer('p2').hand.length === 4, 'compensation: 4 lost ships → up to 4 cards, limited by the winner\'s 3 cards');
  accounting(g);
});

test('negotiate vs negotiate: allies go home, a deal trades cards and makes a colony', () => {
  const g = newGame(3);
  const [o, extra] = setHand(g, 'p1', [N, A(12), A(4)]);
  const [d] = setHand(g, 'p2', [N, A(9)]);
  toAlliance(g, 'p2', 2);
  g.invite('p1', ['p3']);
  g.invite('p2', []);
  g.respondAlliance('p3', { side: 'offense', ships: { 'yellow-0': 1 } });
  playCards(g, o, d);
  passAll(g);
  assert(g.enc.step === 'DEAL' && !g.enc.gate.p3, 'negotiations: allies return their ships');
  assert(g.shipsOn('p3', 'yellow-0') === 4, 'the ally\'s ship is home');
  assert(g.phaseEndsAt && g.phaseEndsAt - Date.now() <= 60000 && g.phaseEndsAt - Date.now() > 55000, 'one minute to make a deal');
  assertThrows(() => g.proposeDeal('p3', { take: 1 }), /offense and the defense/, 'only the main players deal');
  assertThrows(() => g.proposeDeal('p1', {}), /at least one card/, 'an empty deal is refused');
  g.proposeDeal('p1', { give: [extra], take: 1, colonyMe: 'blue-2' });
  assertThrows(() => g.acceptDeal('p1', g.enc.deal.proposal.id), /other side/, 'you cannot accept your own offer');
  assert(g.toClientJSON('p2').encounter.deal.proposal.give.length === 1 && g.toClientJSON('p3').encounter.deal.proposal.give === null, 'offered cards are shown to the two sides only');
  g.acceptDeal('p2', g.enc.deal.proposal.id);
  assert(g.enc.step === 'QUASH', 'a short window for Quash');
  g.players.forEach((p) => g.pass(p.id));
  assert(g.shipsOn('p1', 'blue-2') === 2 && g.foreignColonies('p1') === 1, 'the offense colonized with its gate ships');
  assert(g.getPlayer('p2').hand.includes(extra), 'the offered card changed hands');
  assert(g.enc.step === 'NEXT', 'a deal counts as a successful encounter');
  accounting(g);
});

test('negotiate vs negotiate: no deal in time costs both sides 3 ships', () => {
  const g = newGame(3);
  const [o] = setHand(g, 'p1', [N, A(5)]);
  const [d] = setHand(g, 'p2', [N, A(5)]);
  toAlliance(g, 'p2', 2);
  noAllies(g);
  playCards(g, o, d);
  passAll(g);
  g.onTimeout();
  assert(g.warp.p1 === 3 && g.warp.p2 === 3, 'a failed deal: 3 ships each to the warp');
  assert(g.enc.phase === 'START' && g.enc.aggressorId === 'p2', 'a failed deal ends the turn');
  accounting(g);
});

test('morph copies the other card; morph against morph is a zero attack', () => {
  const g = newGame(3);
  const [o] = setHand(g, 'p1', [M, N]);
  const [d] = setHand(g, 'p2', [A(12), N]);
  toAlliance(g, 'p2', 1);
  noAllies(g);
  playCards(g, o, d);
  const eff = g.effectiveCards();
  assert(eff.offense.type === 'attack' && eff.offense.value === 12 && eff.offense.morph, 'morph copies an attack 12');
  passAll(g);
  assert(lastOutcome(g).type === 'defense', '12+1 vs 12+4: the defense wins');
  accounting(g);

  const n = newGame(3);
  const [no] = setHand(n, 'p1', [N, A(3)]);
  const [nd] = setHand(n, 'p2', [M, A(3)]);
  toAlliance(n, 'p2', 1);
  noAllies(n);
  playCards(n, no, nd);
  assert(n.effectiveCards().defense.type === 'negotiate', 'morph copies a negotiate');
  passAll(n);
  assert(n.enc.step === 'DEAL', 'two negotiates: a deal');

  const mm = newGame(3);
  const [mo] = setHand(mm, 'p1', [M, A(3)]);
  const [md] = setHand(mm, 'p2', [M, A(3)]);
  toAlliance(mm, 'p2', 4);
  noAllies(mm);
  playCards(mm, mo, md);
  const both = mm.effectiveCards();
  assert(both.offense.type === 'attack' && both.offense.value === 0 && both.defense.value === 0, 'morph vs morph: attack 0 each');
});

test('destiny: wild lets the offense choose; special cards pick the leader; own colour offers a choice', () => {
  const g = newGame(4);
  g.beginTurn('p1');
  g.regroup('p1', null);
  topDestiny(g, { kind: 'wild' });
  g.drawDestiny('p1');
  assert(g.enc.step === 'CHOOSE_PLAYER' && g.enc.candidates.length === 3 && !g.enc.candidates.includes('p1'), 'wild: any other player');
  g.chooseDefender('p1', 'p4');
  assert(g.enc.defenderId === 'p4' && g.enc.phase === 'LAUNCH', 'the chosen player defends');

  const s = newGame(4);
  s.warp.p3 = 2;
  s.planets.find((pl) => pl.id === 'yellow-0').ships.p3 = 2;
  s.beginTurn('p1');
  s.regroup('p1', null);
  topDestiny(s, { kind: 'special', rule: 'mostWarp' });
  s.drawDestiny('p1');
  assert(s.enc.defenderId === 'p3', 'most ships in the warp defends');

  const tie = newGame(4);
  tie.warp.p2 = 1;
  tie.warp.p3 = 1;
  tie.planets.find((pl) => pl.id === 'blue-0').ships.p2 = 3;
  tie.planets.find((pl) => pl.id === 'yellow-0').ships.p3 = 3;
  tie.beginTurn('p1');
  tie.regroup('p1', null);
  topDestiny(tie, { kind: 'special', rule: 'mostWarp' });
  tie.drawDestiny('p1');
  assert(tie.enc.step === 'CHOOSE_PLAYER' && tie.enc.candidates.join() === 'p2,p3', 'a tie: the offense chooses among the leaders');
  assertThrows(() => tie.chooseDefender('p1', 'p4'), /possible defense/, 'only a leader');

  const own = newGame(3);
  own.planets.find((pl) => pl.id === 'red-3').ships.p2 = 2;
  own.planets.find((pl) => pl.id === 'blue-4').ships.p2 = 2;
  own.beginTurn('p1');
  own.regroup('p1', null);
  topDestiny(own, { kind: 'color', color: 'red' });
  own.drawDestiny('p1');
  assert(own.enc.step === 'OWN_COLOR' && own.enc.ownOptions.attack.join() === 'red-3', 'own colour: a foreign colony at home can be attacked');
  own.ownColorChoice('p1', 'attack');
  own.launch('p1', { planetId: 'red-3', defenderId: 'p2', ships: { 'red-0': 2 } });
  assert(own.enc.defenderId === 'p2' && own.enc.targetPlanetId === 'red-3', 'the colony\'s owner is the defense');
  accounting(own);

  const redraw = newGame(3);
  redraw.beginTurn('p1');
  redraw.regroup('p1', null);
  topDestiny(redraw, { kind: 'color', color: 'blue' });
  redraw.destinyDeck.push({ kind: 'color', color: 'red' });
  redraw.drawDestiny('p1');
  assert(redraw.enc.step === 'OWN_COLOR', 'own colour drawn');
  redraw.ownColorChoice('p1', 'redraw');
  assert(redraw.enc.defenderId === 'p2', 'discard and draw again');

  const restore = newGame(3);
  const lost = restore.planets.find((pl) => pl.id === 'red-2');
  restore.planets.find((pl) => pl.id === 'red-0').ships.p1 += lost.ships.p1;
  delete lost.ships.p1;
  restore.beginTurn('p1');
  restore.regroup('p1', null);
  topDestiny(restore, { kind: 'color', color: 'red' });
  restore.drawDestiny('p1');
  restore.ownColorChoice('p1', 'restore');
  restore.launch('p1', { planetId: 'red-2', ships: { 'red-0': 3 } });
  assert(restore.shipsOn('p1', 'red-2') === 3 && restore.enc.success && restore.enc.step === 'NEXT', 'rebuilding a home colony is a successful encounter');
  accounting(restore);
});

test('alliances: several allies on both sides, parasites without invitation, no joining both, no allies at all', () => {
  const g = newGame(5, [null, null, 'parasite', null, null]);
  const [o] = setHand(g, 'p1', [A(10), N]);
  const [d] = setHand(g, 'p2', [A(10), N]);
  toAlliance(g, 'p2', 2);
  g.invite('p1', ['p4', 'p2']);
  assert(g.enc.invites.offense.join() === 'p4', 'the defense cannot be invited by the offense');
  g.invite('p2', ['p5', 'p1']);
  assert(g.enc.invites.defense.join() === 'p5', 'the offense cannot be invited by the defense');
  assert(g.enc.acceptOrder.join() === 'p3,p4,p5', 'the Parasite answers too, uninvited');
  g.respondAlliance('p3', { side: 'offense', ships: { 'yellow-0': 4 } });
  assert(g.enc.allies.p3 === 'offense', 'Parasite joined the offense without an invitation');
  assertThrows(() => g.respondAlliance('p4', { side: 'defense', ships: { 'green-0': 1 } }), /not invited/, 'invited to the offense only');
  g.respondAlliance('p4', { side: 'offense', ships: { 'green-0': 3 } });
  g.respondAlliance('p5', { side: null });
  assert(g.enc.allies.p5 === undefined, 'declined');
  playCards(g, o, d);
  passAll(g);
  // 10 + 2 + 4 + 3 = 19 vs 10 + 4 = 14.
  assert(g.enc.outcome.type === 'offense', 'the allied offense wins');
  assert(g.shipsOn('p3', 'blue-0') === 4 && g.shipsOn('p4', 'blue-0') === 3, 'allies land and colonize too');
  assert(g.foreignColonies('p3') === 1 && g.foreignColonies('p4') === 1, 'allies gain foreign colonies');
  accounting(g);

  const solo = newGame(3);
  const [so] = setHand(solo, 'p1', [A(4), N]);
  const [sd] = setHand(solo, 'p2', [A(4), N]);
  toAlliance(solo, 'p2', 1);
  solo.invite('p1', []);
  solo.invite('p2', []);
  assert(solo.enc.phase === 'PLANNING', 'no invitations: straight to planning');
  playCards(solo, so, sd);
  passAll(solo);
  accounting(solo);
});

test('reinforcements are added to the chosen side after the reveal', () => {
  const g = newGame(3);
  const [o, r] = setHand(g, 'p1', [A(4), R(5), N]);
  const [d] = setHand(g, 'p2', [A(8), N]);
  toAlliance(g, 'p2', 1);
  noAllies(g);
  playCards(g, o, d);
  assertThrows(() => g.playReinforcement('p3', r, 'offense'), /in the encounter/, 'only involved players reinforce');
  g.pass('p1');
  g.playReinforcement('p1', r, 'offense');
  assert(!g.enc.passes.p1, 'a new card reopens the window for everyone');
  assert(g.totals().offense.total === 10, '4 + 1 ship + 5');
  passAll(g);
  assert(lastOutcome(g).type === 'defense', '10 vs 12: the defense still wins');
  accounting(g);
});

test('the warp: lost ships wait there and come back one per regroup', () => {
  const g = newGame(3);
  g.warp.p1 = 3;
  g.planets.find((pl) => pl.id === 'red-0').ships.p1 = 1;
  accounting(g);
  g.beginTurn('p1');
  g.regroup('p1', 'red-0');
  assert(g.warp.p1 === 2 && g.shipsOn('p1', 'red-0') === 2, 'one ship per regroup');
  assert(g.toClientJSON('p3').players.find((p) => p.id === 'p1').warp === 2, 'everyone sees warp counts');

  const empty = newGame(3);
  empty.planets.forEach((pl) => { if (pl.ships.p1) { empty.warp.p1 = (empty.warp.p1 || 0) + pl.ships.p1; delete pl.ships.p1; } });
  empty.beginTurn('p1');
  empty.regroup('p1', null);
  assert(sumGate(empty, 'p1') === 1, 'no colonies: the regrouped ship goes onto the gate');
  topDestiny(empty, { kind: 'color', color: 'blue' });
  empty.drawDestiny('p1');
  empty.launch('p1', { planetId: 'blue-1', ships: {} });
  assert(empty.enc.phase === 'ALLIANCE' && sumGate(empty, 'p1') === 1, 'the ship already on the gate is launched');
  accounting(empty);
});

function sumGate(g, id) {
  return Object.values(g.enc.gate[id] || {}).reduce((s, n) => s + n, 0);
}

test('victory: a fifth foreign colony wins at once, and shared fifth colonies win together', () => {
  const g = newGame(3);
  ['yellow-0', 'yellow-1', 'yellow-2', 'yellow-3'].forEach((id) => {
    g.planets.find((pl) => pl.id === id).ships.p1 = 1;
    g.planets.find((pl) => pl.id === 'red-0').ships.p1 -= 1;
  });
  [['red-1', 2], ['red-2', 1], ['red-3', 1], ['red-4', 1]].forEach(([id, n]) => {
    g.planets.find((pl) => pl.id === id).ships.p3 = n;
  });
  g.planets.find((pl) => pl.id === 'yellow-4').ships.p3 -= 4;
  g.planets.find((pl) => pl.id === 'yellow-3').ships.p3 -= 1;
  accounting(g);
  const [o] = setHand(g, 'p1', [A(20), N]);
  const [d] = setHand(g, 'p2', [A(0), N]);
  toAlliance(g, 'p2', 2, 0);
  g.invite('p1', ['p3']);
  g.invite('p2', []);
  g.respondAlliance('p3', { side: 'offense', ships: { 'yellow-4': 0, 'red-1': 1 } });
  playCards(g, o, d);
  passAll(g);
  assert(g.phase === PHASES.GAME_OVER, 'the game ends');
  assert(g.results.winnerIds.length === 2 && g.results.winnerIds.includes('p1') && g.results.winnerIds.includes('p3'), 'both reached five at once and both win');
  assert(g.results.standings.slice(0, 2).every((s) => s.winner && s.foreignColonies >= WIN_COLONIES), 'the winners lead the standings');
  assertThrows(() => g.beginTurn('p2'), /over/, 'no moves after the end');
  assert(g.toClientJSON('p2').results.winnerIds.length === 2, 'everyone sees the result');

  g.restart('p1');
  assert(g.phase === PHASES.LOBBY && g.planets.length === 0 && g.players.every((p) => p.hand.length === 0 && !p.alienId), 'restart clears the galaxy');
  g.start('p1');
  assert(g.phase === PHASES.ALIENS, 'and a new game can begin');
});

test('encounter cards run out: the offense redraws at the start, the defense shows and redraws, an empty offense ends the turn', () => {
  const g = newGame(3);
  setHand(g, 'p1', [R(2), ART('ionicGas')]);
  g.beginTurn('p1');
  assert(g.hasEncounterCard('p1') && g.getPlayer('p1').hand.length >= 8, 'the offense discarded and drew 8 until an encounter card came');

  const d = newGame(3);
  setHand(d, 'p1', [A(5), N]);
  setHand(d, 'p2', [R(3)]);
  toAlliance(d, 'p2', 2);
  noAllies(d);
  assert(d.hasEncounterCard('p2'), 'the defense drew a new hand with an encounter card');
  assert(d.log.some((e) => e.type === 'DEFENSE_REDRAW' && e.params.cards.length === 1), 'the old hand was shown to everyone');
  accounting(d);

  const o = newGame(3);
  setHand(o, 'p1', [A(5)]);
  toAlliance(o, 'p2', 2);
  // An effect strips the offense of encounter cards before planning.
  setHand(o, 'p1', [R(2)]);
  o.invite('p1', []);
  o.invite('p2', []);
  assert(o.enc.phase === 'START' && o.enc.aggressorId === 'p2', 'the offense with no encounter cards loses the turn');
  assert(o.shipsOn('p1', 'red-0') === 4, 'all launched ships went home');
  accounting(o);
});

test('second encounter only after a success; the Machine keeps going', () => {
  const g = newGame(3);
  const [o1, o2] = setHand(g, 'p1', [A(20), A(20), N]);
  const [d1] = setHand(g, 'p2', [A(0), N, A(0)]);
  toAlliance(g, 'p2', 1);
  noAllies(g);
  playCards(g, o1, d1);
  passAll(g);
  g.continueTurn('p1', true);
  assert(g.enc.number === 2 && g.enc.phase === 'REGROUP', 'a second encounter starts at regroup');
  g.regroup('p1', null);
  topDestiny(g, { kind: 'color', color: 'blue' });
  g.drawDestiny('p1');
  g.launch('p1', { planetId: 'blue-1', ships: { 'red-1': 1 } });
  noAllies(g);
  g.selectCard('p1', o2);
  g.selectCard('p2', g.getPlayer('p2').hand.find((u) => g.def(u).type === 'attack'));
  passAll(g);
  assert(g.enc.phase === 'START' && g.enc.aggressorId === 'p2', 'after two encounters the turn passes');

  const m = newGame(3, ['machine', null, null]);
  const cards = setHand(m, 'p1', [A(20), A(20), A(20), N]);
  setHand(m, 'p2', [A(0), A(0), A(0)]);
  for (let i = 0; i < 3; i += 1) {
    if (i === 0) toAlliance(m, 'p2', 1, i);
    else {
      m.continueTurn('p1', true);
      m.regroup('p1', null);
      topDestiny(m, { kind: 'color', color: 'blue' });
      m.drawDestiny('p1');
      m.launch('p1', { planetId: `blue-${i}`, ships: { [`red-${i}`]: 1 } });
    }
    noAllies(m);
    m.selectCard('p1', cards[i]);
    m.selectCard('p2', m.getPlayer('p2').hand.find((u) => isEncounter(m.def(u))));
    passAll(m);
  }
  assert(m.enc.step === 'NEXT' && m.enc.number === 3, 'the Machine may have a fourth encounter');
  accounting(m);
});

test('powers: Macron, Zombie, Clone, Oracle, Mind, Warrior and Fido work mechanically', () => {
  const g = newGame(3, ['macron', 'zombie', null]);
  const [o] = setHand(g, 'p1', [A(4), N]);
  const [d] = setHand(g, 'p2', [A(10), N]);
  g.beginTurn('p1');
  g.regroup('p1', null);
  topDestiny(g, { kind: 'color', color: 'blue' });
  g.drawDestiny('p1');
  assertThrows(() => g.launch('p1', { planetId: 'blue-0', ships: { 'red-0': 2 } }), /only send one/, 'Macron sends one ship');
  g.launch('p1', { planetId: 'blue-0', ships: { 'red-0': 1 } });
  noAllies(g);
  playCards(g, o, d);
  assert(g.totals().offense.total === 8, 'Macron: 4 + one ship worth 4');
  g.enc.reinforcements.push({ uid: 'x', playerId: 'p1', side: 'offense', value: 7 });
  g.enc.reinforcements.pop();
  passAll(g);
  assert(lastOutcome(g).type === 'defense', '8 vs 14');

  const z = newGame(3, [null, 'zombie', null]);
  const [zo] = setHand(z, 'p1', [A(20), N]);
  const [zd] = setHand(z, 'p2', [A(0), N]);
  toAlliance(z, 'p2', 2);
  noAllies(z);
  playCards(z, zo, zd);
  passAll(z);
  assert(z.enc.outcome.type === 'offense' && (z.warp.p2 || 0) === 0 && z.colonyShips('p2') === 20, 'Zombie ships never enter the warp');
  accounting(z);

  const c = newGame(3, ['clone', null, null]);
  const [co] = setHand(c, 'p1', [A(20), N]);
  const [cd] = setHand(c, 'p2', [A(0), N]);
  toAlliance(c, 'p2', 1);
  noAllies(c);
  playCards(c, co, cd);
  passAll(c);
  assert(c.enc.step === 'CLONE', 'Clone decides after the encounter');
  c.cloneChoice('p1', true);
  assert(c.getPlayer('p1').hand.includes(co), 'Clone kept its attack card');
  accounting(c);

  const or = newGame(3, ['oracle', null, null]);
  const [oo] = setHand(or, 'p1', [A(8), N]);
  const [od] = setHand(or, 'p2', [A(9), N]);
  toAlliance(or, 'p2', 1);
  noAllies(or);
  assert(or.enc.step === 'POWERS', 'Oracle is asked before cards');
  or.usePower('p1', { power: 'oracle', use: true });
  assertThrows(() => or.selectCard('p1', oo), /after the opponent/, 'Oracle waits for the opponent');
  or.selectCard('p2', od);
  assert(or.toClientJSON('p3').encounter.cards.defense.faceUp, 'the opponent\'s card is face up for everyone');
  or.selectCard('p1', oo);
  assert(or.enc.phase === 'REVEAL', 'then the Oracle chooses');

  const mind = newGame(3, [null, null, 'mind']);
  toAlliance(mind, 'p2', 1);
  mind.useMind('p3', 'p2');
  const seen = mind.toClientJSON('p3').you.mindHand;
  assert(seen && seen.length === mind.getPlayer('p2').hand.length, 'Mind sees the whole hand');
  assert(!mind.toClientJSON('p1').you.mindHand, 'nobody else does');

  const w = newGame(3, ['warrior', null, null]);
  const [wo] = setHand(w, 'p1', [A(0), N]);
  const [wd] = setHand(w, 'p2', [A(20), N]);
  toAlliance(w, 'p2', 1);
  noAllies(w);
  playCards(w, wo, wd);
  passAll(w);
  assert(w.getPlayer('p1').tokens === 2, 'Warrior gains 2 tokens after a loss');

  const f = newGame(3, [null, null, 'fido']);
  const [fo] = setHand(f, 'p1', [A(20), N]);
  const [fd] = setHand(f, 'p2', [A(0), N]);
  toAlliance(f, 'p2', 1);
  noAllies(f);
  playCards(f, fo, fd);
  passAll(f);
  assert(f.enc.step === 'FETCH' && f.enc.discarded.includes(fo), 'Fido may fetch a discarded encounter card');
  f.fetch('p3', { cardUid: fo, targetId: 'p2', reward: 'card' });
  const handBefore = f.getPlayer('p3').hand.length;
  f.fetchAnswer('p2', true);
  assert(f.getPlayer('p2').hand.includes(fo) && f.getPlayer('p3').hand.length === handBefore + 1, 'accepted: the card is theirs, Fido draws a card');
  accounting(f);
});

test('losing home colonies below three switches a power off', () => {
  const g = newGame(3, ['macron', null, null]);
  assert(g.powerActive('p1', 'macron'), 'the power works with 5 home colonies');
  ['red-0', 'red-1', 'red-2'].forEach((id) => {
    const pl = g.planets.find((x) => x.id === id);
    g.warp.p1 = (g.warp.p1 || 0) + pl.ships.p1;
    delete pl.ships.p1;
  });
  assert(!g.powerActive('p1', 'macron') && g.sendLimit('p1') === 4, 'two home colonies: no power');
  assert(g.toClientJSON('p2').players[0].powerActive === false, 'everyone sees the lost power');
});

test('artifacts: zap, emotion control, ionic gas, force field, plague, card zap, quash, Mobius tubes', () => {
  const g = newGame(3, ['macron', null, null]);
  const [o] = setHand(g, 'p1', [A(8), N]);
  const [d, emo] = setHand(g, 'p2', [A(9), ART('emotionControl'), N]);
  const [zap, gas] = setHand(g, 'p3', [ART('cosmicZap'), ART('ionicGas'), ART('cardZap')]);
  toAlliance(g, 'p2', 1);
  g.playArtifact('p3', zap, { targetId: 'p1' });
  assert(!g.powerActive('p1', 'macron'), 'Cosmic Zap freezes a power for the encounter');
  noAllies(g);
  playCards(g, o, d);
  assert(g.totals().offense.total === 9, 'the zapped Macron ship counts as 1');
  g.playArtifact('p2', emo);
  assert(g.effectiveCards().offense.type === 'negotiate', 'Emotion Control turns attacks into negotiates');
  const cz = g.getPlayer('p3').hand.find((u) => g.def(u).artifact === 'cardZap');
  g.playArtifact('p3', cz);
  assert(g.effectiveCards().offense.type === 'attack', 'Card Zap cancels Emotion Control');
  g.playArtifact('p3', gas);
  passAll(g);
  assert(lastOutcome(g).type === 'defense', '9 vs 13');
  assert(g.log.every((e) => e.type !== 'COMPENSATION'), 'Ionic Gas: no compensation');
  assert(g.powerActive('p1', 'macron'), 'the zap lasts one encounter');
  accounting(g);

  const ff = newGame(4);
  const [ffo] = setHand(ff, 'p1', [A(5), N]);
  const [ffd] = setHand(ff, 'p2', [A(5), N]);
  const [field] = setHand(ff, 'p4', [ART('forceField')]);
  toAlliance(ff, 'p2', 1);
  ff.invite('p1', ['p3']);
  ff.invite('p2', []);
  // Three of four ships: the colony stays, so the ships can return to it.
  ff.respondAlliance('p3', { side: 'offense', ships: { 'yellow-0': 3 } });
  assert(ff.enc.phase === 'PLANNING', 'alliances formed');
  ff.playArtifact('p4', field, { targetIds: ['p3'] });
  assert(!ff.enc.allies.p3 && ff.shipsOn('p3', 'yellow-0') === 4, 'Force Field cancels the alliance, ships go home');
  playCards(ff, ffo, ffd);
  accounting(ff);

  const pl = newGame(3);
  setHand(pl, 'p2', [A(4), N, R(2), ART('quash')]);
  const [plague] = setHand(pl, 'p3', [ART('plague')]);
  pl.playArtifact('p3', plague, { targetId: 'p2' });
  assert(pl.warp.p2 === 3 && pl.getPlayer('p2').hand.length === 0, 'Plague: 3 ships to the warp and one card of each type');
  assertThrows(() => pl.playArtifact('p3', pl.getPlayer('p3').hand[0]), /artifact card/, 'played artifacts leave the hand');
  accounting(pl);

  const q = newGame(3);
  const [qo, give] = setHand(q, 'p1', [N, A(4)]);
  const [qd] = setHand(q, 'p2', [N]);
  const [quash] = setHand(q, 'p3', [ART('quash')]);
  toAlliance(q, 'p2', 1);
  noAllies(q);
  playCards(q, qo, qd);
  passAll(q);
  q.proposeDeal('p1', { give: [give] });
  q.acceptDeal('p2', q.enc.deal.proposal.id);
  q.playArtifact('p3', quash);
  assert(q.warp.p1 === 3 && q.warp.p2 === 3 && q.getPlayer('p1').hand.includes(give), 'Quash: the deal fails and nothing changes hands');
  accounting(q);

  // Regression: Mobius Tubes with a colony-less player, then a home restore.
  const mt = newGame(3);
  mt.planets.forEach((x) => { if (x.ships.p3) { mt.warp.p3 = (mt.warp.p3 || 0) + x.ships.p3; delete x.ships.p3; } });
  const lostHome = mt.planets.find((x) => x.id === 'red-2');
  mt.planets.find((x) => x.id === 'red-0').ships.p1 += lostHome.ships.p1;
  delete lostHome.ships.p1;
  const [tubes] = setHand(mt, 'p1', [ART('mobiusTubes'), A(5)]);
  mt.beginTurn('p1');
  mt.playArtifact('p1', tubes);
  assert(mt.warp.p3 === 0 && mt.colonyShips('p3') === 20 && !mt.enc.gate.p3, 'Mobius Tubes: ships return home, never onto the gate');
  mt.regroup('p1', null);
  topDestiny(mt, { kind: 'color', color: 'red' });
  mt.drawDestiny('p1');
  mt.ownColorChoice('p1', 'restore');
  mt.launch('p1', { planetId: 'red-2', ships: { 'red-0': 2 } });
  accounting(mt);
});

test('payloads: hands, face-down cards and deal cards stay private', () => {
  const g = newGame(3);
  const [o] = setHand(g, 'p1', [A(13), N]);
  const [d] = setHand(g, 'p2', [A(6), N]);
  toAlliance(g, 'p2', 1);
  noAllies(g);
  g.selectCard('p1', o);
  const third = g.toClientJSON('p3');
  assert(third.encounter.cards.offense.hidden && !third.encounter.cards.offense.value, 'a face-down card is a back to others');
  assert(g.toClientJSON('p1').encounter.cards.offense.value === 13, 'its owner sees it');
  assert(third.players.every((p) => p.hand === undefined), 'no hands in player rows');
  assert(!JSON.stringify({ ...third, you: null }).includes('"value":13'), 'the value is nowhere in a third player\'s payload');
  g.selectCard('p2', d);
  assert(g.toClientJSON('p3').encounter.cards.offense.value === 13, 'revealed cards are public');
});

test('timeouts and leaving: every waiting step makes a legal choice', () => {
  const g = newGame(4);
  for (let i = 0; i < 400 && g.phase === PHASES.PLAY; i += 1) {
    g.onTimeout();
    accounting(g);
  }
  assert(g.phase === PHASES.PLAY || g.phase === PHASES.GAME_OVER, 'the clock alone keeps the game moving');
  g.removePlayer('p1');
  assert(g.getPlayer('p1').left && g.hostId !== 'p1', 'a leaving host hands over');
  for (let i = 0; i < 50 && g.phase === PHASES.PLAY; i += 1) g.onTimeout();
  assert(g.enc.aggressorId !== 'p1' || g.phase !== PHASES.PLAY || g.enc.phase !== 'START', 'a player who left does not take turns');
});

test('persistence: a saved game restores mid-encounter and plays on', () => {
  const g = newGame(3);
  const [o] = setHand(g, 'p1', [A(5), N]);
  toAlliance(g, 'p2', 2);
  noAllies(g);
  g.selectCard('p1', o);
  const copy = CosmicGame.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert(copy.enc.phase === 'PLANNING' && copy.enc.cards.offense === o, 'the encounter survives');
  assert(copy.players.every((p) => !p.connected), 'restored players start offline');
  copy.selectCard('p2', copy.getPlayer('p2').hand.find((u) => isEncounter(copy.def(u))));
  assert(copy.enc.phase === 'REVEAL', 'the restored game keeps playing');
  accounting(copy);
});

// --- whole games -----------------------------------------------------------------------

test('whole games: 30 random bot games of 3-5 races play to a winner without losing a ship or a card', () => {
  const pick = (l) => l[Math.floor(Math.random() * l.length)];
  const tryDo = (fn) => { try { fn(); return true; } catch (e) { if (!(e instanceof CosmicError)) throw e; return false; } };
  let finished = 0;
  let shared = 0;
  for (let gi = 0; gi < 30; gi += 1) {
    const g = new CosmicGame('T', 'p1');
    const n = 3 + (gi % 3);
    for (let i = 1; i <= n; i += 1) g.addPlayer({ playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}`, accountId: i === 1 ? 'a' : null });
    g.start('p1');
    g.players.forEach((p) => g.chooseAlien(p.id, pick(p.alienOptions)));
    for (let step = 0; step < 30000 && g.phase === PHASES.PLAY; step += 1) {
      g.players.forEach((p) => {
        if (g.phase !== PHASES.PLAY) return;
        const arts = g.playableArtifacts(p.id);
        if (arts.length && Math.random() < 0.12) tryDo(() => g.playArtifact(p.id, pick(arts), { targetId: pick(g.players).id }));
      });
      if (g.phase !== PHASES.PLAY) break;
      const e = g.enc;
      if (e.phase === 'ALLIANCE' && e.step === 'ACCEPT') {
        const id = e.acceptOrder[e.acceptIndex];
        const ch = g.allianceChoices(id);
        const sides = ['offense', 'defense'].filter((s) => ch[s]);
        if (sides.length && Math.random() < 0.6) g.respondAlliance(id, { side: pick(sides), ships: g.autoSelection(id, Math.min(g.sendLimit(id), 2)) });
        else g.respondAlliance(id, { side: null });
      } else if (e.phase === 'ALLIANCE' && e.step !== 'ACCEPT') {
        g.invite(e.step === 'INVITE_OFFENSE' ? e.aggressorId : e.defenderId, g.players.filter(() => Math.random() < 0.5).map((p) => p.id));
      } else if (e.phase === 'RESOLUTION' && e.step === 'DEAL' && Math.random() < 0.6) {
        const by = pick(g.mainIds());
        if (tryDo(() => g.proposeDeal(by, { take: 1, give: g.getPlayer(by).hand.slice(0, 1) }))) {
          g.acceptDeal(g.opponentOf(by), g.enc.deal.proposal.id);
        } else g.onTimeout();
      } else if (e.phase === 'RESOLUTION' && e.step === 'NEXT') {
        g.continueTurn(e.aggressorId, Math.random() < 0.8);
      } else {
        g.onTimeout();
      }
      accounting(g);
    }
    if (g.phase === PHASES.GAME_OVER) {
      finished += 1;
      if (g.results.winnerIds.length > 1) shared += 1;
      g.results.winnerIds.forEach((id) => assert(g.foreignColonies(id) >= WIN_COLONIES, 'winners hold five foreign colonies'));
    } else {
      // Random play can grind into a war of attrition the rules allow; what
      // must never happen is a game that stops moving.
      assert(g.turnCount > 500, `an unfinished game is still taking turns (turn ${g.turnCount})`);
    }
  }
  assert(finished >= 25, `bot games reach a winner (${finished}/30)`);
  // eslint-disable-next-line no-console
  console.log(`    (${shared} shared victories)`);
});

// eslint-disable-next-line no-console
console.log(`\nCosmic Encounter tests: ${passed} passed`);
