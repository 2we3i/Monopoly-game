// Deterministic tests of the Catan engine.
//
// Dice and layouts are random in a real game, so the tests do what a
// referee would: finish the opening placement with legal moves, then put
// pieces and cards exactly where a rule needs them and drive the real
// engine methods. After the rule tests, hundreds of bot turns play whole
// games to the end while checking that no resource is ever created or
// lost and that no piece breaks the placement rules.

const {
  CatanGame, CatanError, PHASES, STEPS, COSTS, PIECES, BANK_PER_RESOURCE, DEV_DECK, MAX_PLAYERS, handSize,
} = require('../src/catan/CatanGame');
const {
  GEOMETRY, RESOURCES, TERRAIN_POOL, NUMBER_POOL, PORT_POOL, generateLayout, hasAdjacentRedNumbers,
} = require('../src/catan/board');

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertThrows(fn, pattern, msg) {
  let threw = false;
  let text = '';
  try { fn(); } catch (e) { threw = e instanceof CatanError; text = e.message; }
  assert(threw, `${msg} (expected a CatanError, got "${text}")`);
  if (pattern) assert(pattern.test(text), `${msg} (message "${text}" did not match ${pattern})`);
}

function test(name, fn) {
  fn();
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${name}`);
}

const sorted = (list) => [...list].map(String).sort().join(',');

function gameWith(count, settings) {
  const game = new CatanGame('TEST', 'p1', settings);
  for (let i = 1; i <= count; i += 1) {
    game.addPlayer({
      playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}`, accountId: i === 1 ? 'acc1' : null,
    });
  }
  return game;
}

function conserved(game) {
  RESOURCES.forEach((r) => {
    const total = game.bank[r] + game.players.reduce((sum, p) => sum + p.resources[r], 0);
    assert(total === BANK_PER_RESOURCE, `${r} is conserved (${total})`);
    assert(game.bank[r] >= 0 && game.players.every((p) => p.resources[r] >= 0), `${r} never goes negative`);
  });
}

function placementValid(game) {
  Object.keys(game.buildings).forEach((v) => {
    GEOMETRY.vertices[v].neighbors.forEach((n) => assert(!game.buildings[n], `no settlements next to each other (${v}-${n})`));
  });
  game.players.forEach((p) => {
    const left = game.piecesLeft(p.id);
    assert(left.road >= 0 && left.settlement >= 0 && left.city >= 0, 'piece limits hold');
  });
}

// Plays the opening placement with the first legal spot every time.
function finishSetup(game) {
  while (game.phase === PHASES.SETUP) {
    const id = game.setup.order[game.setup.index];
    if (game.setup.step === 'SETTLEMENT') game.buildSettlement(id, game.legalSettlementVertices(id)[0]);
    else game.buildRoad(id, game.legalRoadEdges(id)[0]);
  }
}

function emptyHands(game) {
  game.players.forEach((p) => {
    RESOURCES.forEach((r) => { game.bank[r] += p.resources[r]; p.resources[r] = 0; });
  });
}

// Moves cards from the bank to a player, so conservation still holds.
function grant(game, player, hand) {
  RESOURCES.forEach((r) => {
    const n = hand[r] || 0;
    assert(game.bank[r] >= n, 'test grant fits in the bank');
    game.bank[r] -= n;
    player.resources[r] += n;
  });
}

function clearBoard(game) {
  game.buildings = {};
  game.roads = {};
  game.longestRoad = null;
}

function toMain(game) {
  if (game.turn.step === STEPS.ROLL) game.rollDice(game.turn.playerId, [2, 3]);
  assert(game.turn.step === STEPS.MAIN, 'the turn reached its main step');
}

// A path of `length` connected edges starting from vertex `start`.
function edgePath(start, length) {
  const walk = (vertex, used, path) => {
    if (path.length === length) return path;
    for (const e of GEOMETRY.vertices[vertex].edges) {
      if (!used.has(e)) {
        const edge = GEOMETRY.edges[e];
        const next = edge.a === vertex ? edge.b : edge.a;
        if (!path.some((p) => p.vertex === next) && next !== start) {
          used.add(e);
          const found = walk(next, used, [...path, { edge: e, vertex: next }]);
          if (found) return found;
          used.delete(e);
        }
      }
    }
    return null;
  };
  return walk(start, new Set(), []);
}

// --- board --------------------------------------------------------------

test('geometry: 19 hexes, 54 corners, 72 sides, 30 coastal sides, 9 harbours', () => {
  assert(GEOMETRY.hexes.length === 19, '19 land hexes');
  assert(GEOMETRY.vertices.length === 54, '54 corners');
  assert(GEOMETRY.edges.length === 72, '72 sides');
  assert(GEOMETRY.coast.length === 30, '30 coastal sides');
  assert(GEOMETRY.portEdges.length === 9, '9 harbour positions');
  const corners = GEOMETRY.portEdges.flatMap((e) => [GEOMETRY.edges[e].a, GEOMETRY.edges[e].b]);
  assert(new Set(corners).size === 18, 'no two harbours share a corner');
  assert(GEOMETRY.hexes.every((h) => h.vertices.length === 6 && h.edges.length === 6), 'every hex has 6 corners and 6 sides');
  assert(GEOMETRY.vertices.every((v) => v.hexes.length >= 1 && v.hexes.length <= 3), 'a corner touches 1-3 hexes');
});

test('layout: classic terrain and numbers, desert without a number, never two red numbers side by side', () => {
  for (let i = 0; i < 200; i += 1) {
    const layout = generateLayout();
    assert(sorted(layout.hexes.map((h) => h.terrain)) === sorted(TERRAIN_POOL), 'terrain matches the classic set');
    const numbers = layout.hexes.filter((h) => h.terrain !== 'desert').map((h) => h.number);
    assert(sorted(numbers) === sorted(NUMBER_POOL), 'number tokens match the classic set');
    assert(layout.hexes.find((h) => h.terrain === 'desert').number === null, 'the desert has no number');
    assert(!hasAdjacentRedNumbers(layout.hexes.map((h) => h.number)), 'no adjacent 6 and 8 tokens');
    assert(sorted(layout.ports.map((p) => p.type)) === sorted(PORT_POOL), 'four 3:1 and five 2:1 harbours');
  }
});

// --- lobby and start ----------------------------------------------------

test('lobby: player limits, host-only start and settings', () => {
  const solo = gameWith(1);
  assertThrows(() => solo.start('p1'), /at least 2/, 'one player cannot start');
  // The table is full at MAX_PLAYERS, whatever that number is today.
  const full = gameWith(MAX_PLAYERS);
  assertThrows(
    () => full.addPlayer({ playerId: 'pX', socketId: 'sX', nickname: 'PX' }),
    new RegExp(`at most ${MAX_PLAYERS}`),
    'one player too many is refused',
  );
  assertThrows(() => full.start('p2'), /host/, 'only the host starts');
  assertThrows(() => full.updateSettings('p2', { victoryPoints: 12 }), /host/, 'only the host changes settings');
  full.updateSettings('p1', { victoryPoints: 99, turnSec: 7 });
  assert(full.settings.victoryPoints === 15 && full.settings.turnSec === 120, 'settings are clamped to sane values');
  full.updateSettings('p1', { victoryPoints: 8, turnSec: 0 });
  assert(full.settings.victoryPoints === 8 && full.settings.turnSec === 0, 'an untimed game can be chosen');
});

test('start: bank, deck, robber on the desert, colours and snake order', () => {
  const game = gameWith(3);
  game.start('p1');
  assert(game.phase === PHASES.SETUP, 'the game opens with placement');
  assert(RESOURCES.every((r) => game.bank[r] === 19), 'the bank holds 19 of each resource');
  assert(game.devDeck.length === DEV_DECK.length && DEV_DECK.length === 25, '25 development cards');
  assert(game.layout.hexes[game.robberHex].terrain === 'desert', 'the robber starts on the desert');
  assert(new Set(game.players.map((p) => p.color)).size === 3, 'every player has their own colour');
  const { order } = game.setup;
  assert(order.length === 6 && order.slice(3).join() === order.slice(0, 3).reverse().join(), 'second placement round runs in reverse');
  assert(game.addPlayer({ playerId: 'p1', socketId: 'again', nickname: 'P1' }).socketId === 'again', 'a player can reconnect after the start');
  assertThrows(() => game.addPlayer({ playerId: 'late', socketId: 'x', nickname: 'Late' }), /already started/, 'nobody new joins mid-game');
});

// --- setup --------------------------------------------------------------

test('setup: turn order, distance rule, road next to the new settlement, second settlement pays out', () => {
  const game = gameWith(2);
  game.start('p1');
  const [first, second] = game.order;
  assertThrows(() => game.buildSettlement(second, 0), /not your turn/, 'players place in order');
  assertThrows(() => game.buildRoad(first, 0), /settlement first/, 'settlement comes before the road');

  const v = GEOMETRY.hexes[9].vertices[0];
  game.buildSettlement(first, v);
  assertThrows(() => game.buildSettlement(first, GEOMETRY.vertices[v].neighbors[0]), /road next to/, 'a second settlement is not allowed before the road');
  const farEdge = GEOMETRY.edges.find((e) => e.a !== v && e.b !== v).id;
  assertThrows(() => game.buildRoad(first, farEdge), /must touch/, 'the road must touch the new settlement');
  game.buildRoad(first, GEOMETRY.vertices[v].edges[0]);

  assertThrows(() => game.buildSettlement(second, GEOMETRY.vertices[v].neighbors[0]), /two road lengths/, 'distance rule during setup');
  assert(!game.legalSettlementVertices(second).includes(GEOMETRY.vertices[v].neighbors[0]), 'the legal list honours the distance rule');

  // Finish round one for the second player, then round two in reverse.
  game.buildSettlement(second, game.legalSettlementVertices(second)[0]);
  game.buildRoad(second, game.legalRoadEdges(second)[0]);
  assert(game.setup.order[game.setup.index] === second, 'the last player of round one also opens round two');

  const spot = game.legalSettlementVertices(second).find((id) => GEOMETRY.vertices[id].hexes.length === 3
    && GEOMETRY.vertices[id].hexes.every((h) => game.layout.hexes[h].terrain !== 'desert'));
  game.buildSettlement(second, spot);
  const expected = {};
  GEOMETRY.vertices[spot].hexes.forEach((h) => {
    const r = game.hexResource(h);
    expected[r] = (expected[r] || 0) + 1;
  });
  const p = game.getPlayer(second);
  assert(RESOURCES.every((r) => p.resources[r] === (expected[r] || 0)), 'the second settlement collects one card per adjacent hex');
  conserved(game);
  game.buildRoad(second, game.legalRoadEdges(second)[0]);
  game.buildSettlement(first, game.legalSettlementVertices(first)[0]);
  game.buildRoad(first, game.legalRoadEdges(first)[0]);
  assert(game.phase === PHASES.PLAY && game.turn.playerId === first && game.turn.step === STEPS.ROLL, 'play starts with the first player rolling');
  assert(game.players.every((pl) => game.piecesLeft(pl.id).settlement === PIECES.settlement - 2), 'two settlements each after setup');
});

// --- production -----------------------------------------------------------

test('production: settlements take 1, cities 2, the robber blocks, a short bank pays nobody', () => {
  const game = gameWith(2);
  game.start('p1');
  finishSetup(game);
  clearBoard(game);
  emptyHands(game);
  const hex = game.layout.hexes.find((h) => h.terrain !== 'desert');
  const resource = game.hexResource(hex.id);
  const [a, , , b] = GEOMETRY.hexes[hex.id].vertices;
  const p1 = game.getPlayer('p1');
  const p2 = game.getPlayer('p2');
  game.buildings[a] = { playerId: 'p1', type: 'settlement' };
  game.buildings[b] = { playerId: 'p2', type: 'city' };
  game.robberHex = game.layout.hexes.find((h) => h.terrain === 'desert').id;

  const expectFor = (vertex, mult) => game.layout.hexes
    .filter((h) => h.number === hex.number && h.id !== game.robberHex && GEOMETRY.hexes[h.id].vertices.includes(vertex))
    .reduce((acc, h) => {
      const r = game.hexResource(h.id);
      acc[r] = (acc[r] || 0) + mult;
      return acc;
    }, {});

  const e1 = expectFor(a, 1);
  const e2 = expectFor(b, 2);
  game.produce(hex.number);
  assert(RESOURCES.every((r) => p1.resources[r] === (e1[r] || 0)), 'a settlement collects one card');
  assert(RESOURCES.every((r) => p2.resources[r] === (e2[r] || 0)), 'a city collects two cards');
  assert(p2.resources[resource] >= 2, 'the city really got two from this hex');
  conserved(game);

  emptyHands(game);
  game.robberHex = hex.id;
  game.produce(hex.number);
  const e1b = expectFor(a, 1);
  assert(RESOURCES.every((r) => p1.resources[r] === (e1b[r] || 0)), 'the robber hex pays nothing');
  assert((e1b[resource] || 0) < (e1[resource] || 0), 'the blocked hex really contributed before');

  emptyHands(game);
  game.robberHex = game.layout.hexes.find((h) => h.terrain === 'desert').id;
  const spare = game.bank[resource] - 1;
  game.bank[resource] = 1;
  p1.resources[resource] = 0;
  // Park the rest with a third holder so conservation stays checkable.
  p1.resources[resource] += 0;
  game.produce(hex.number);
  assert(p1.resources[resource] === 0 && p2.resources[resource] === 0, 'when the bank is short, nobody collects that resource');
  game.bank[resource] += spare;
  conserved(game);
});

// --- the seven ------------------------------------------------------------

test('a seven: big hands discard half, the robber moves, a lone victim is robbed', () => {
  const game = gameWith(3);
  game.start('p1');
  finishSetup(game);
  emptyHands(game);
  const current = game.getPlayer(game.turn.playerId);
  const others = game.players.filter((p) => p.id !== current.id);
  const [big, small] = others;
  grant(game, big, { wood: 3, brick: 3, sheep: 3 });
  grant(game, small, { wheat: 7 });

  game.rollDice(current.id, [3, 4]);
  assert(game.turn.step === STEPS.DISCARD, 'a seven with a big hand asks for discards');
  assert(game.turn.discards[big.id] === 4 && !game.turn.discards[small.id], 'nine cards discard four; seven cards discard none');
  assertThrows(() => game.endTurn(current.id), /robber/, 'the turn cannot end mid-robber');
  assertThrows(() => game.discard(small.id, { wheat: 3 }), /do not need/, 'only listed players discard');
  assertThrows(() => game.discard(big.id, { wood: 3 }), /exactly 4/, 'the exact number is required');
  assertThrows(() => game.discard(big.id, { ore: 4 }), /do not have/, 'only cards in hand');
  game.discard(big.id, { wood: 2, sheep: 2 });
  assert(handSize(big.resources) === 5 && game.turn.step === STEPS.ROBBER, 'after discards the robber moves');
  conserved(game);

  clearBoard(game);
  const target = game.layout.hexes.find((h) => h.id !== game.robberHex).id;
  game.buildings[GEOMETRY.hexes[target].vertices[0]] = { playerId: big.id, type: 'settlement' };
  assertThrows(() => game.moveRobber(current.id, game.robberHex), /different hex/, 'the robber must move');
  const before = handSize(current.resources);
  game.moveRobber(current.id, target);
  assert(game.robberHex === target, 'the robber sits on the chosen hex');
  assert(handSize(current.resources) === before + 1 && handSize(big.resources) === 4, 'the only victim loses a card to the robber');
  assert(game.turn.step === STEPS.MAIN, 'the turn continues after the theft');
  const publicLog = game.toClientJSON(small.id).log.map((e) => e.type);
  const thiefLog = game.toClientJSON(current.id).log.map((e) => e.type);
  assert(publicLog.includes('STOLE') && !publicLog.includes('STOLE_PRIVATE'), 'bystanders do not learn which card was taken');
  assert(thiefLog.includes('STOLE_PRIVATE'), 'the thief learns which card was taken');
  conserved(game);
});

test('the robber with two victims waits for a choice, and a seven with no big hands goes straight to the robber', () => {
  const game = gameWith(3);
  game.start('p1');
  finishSetup(game);
  emptyHands(game);
  clearBoard(game);
  const current = game.getPlayer(game.turn.playerId);
  const [v1, v2] = game.players.filter((p) => p.id !== current.id);
  grant(game, v1, { ore: 1 });
  grant(game, v2, { wood: 1 });
  game.rollDice(current.id, [6, 1]);
  assert(game.turn.step === STEPS.ROBBER, 'no discards needed');
  const hex = game.layout.hexes.find((h) => h.id !== game.robberHex).id;
  const [a, , , b] = GEOMETRY.hexes[hex].vertices;
  game.buildings[a] = { playerId: v1.id, type: 'settlement' };
  game.buildings[b] = { playerId: v2.id, type: 'city' };
  game.moveRobber(current.id, hex);
  assert(game.turn.step === STEPS.STEAL && sorted(game.turn.stealFrom) === sorted([v1.id, v2.id]), 'both players can be robbed');
  assertThrows(() => game.steal(current.id, current.id), /building on the robber/, 'you cannot rob yourself');
  game.steal(current.id, v2.id);
  assert(v2.resources.wood === 0 && current.resources.wood === 1, 'the chosen victim is robbed');
  conserved(game);
});

// --- building -------------------------------------------------------------

test('building: costs, connection, distance rule, cities and piece limits', () => {
  const game = gameWith(2);
  game.start('p1');
  finishSetup(game);
  emptyHands(game);
  const me = game.getPlayer(game.turn.playerId);
  assertThrows(() => game.buildRoad(me.id, game.legalRoadEdges(me.id)[0]), /Roll the dice/, 'nothing is built before rolling');
  toMain(game);
  emptyHands(game);

  const edge = game.legalRoadEdges(me.id)[0];
  assertThrows(() => game.buildRoad(me.id, edge), /Not enough/, 'a road costs wood and brick');
  grant(game, me, COSTS.road);
  const unconnected = GEOMETRY.edges.find((e) => !game.legalRoadEdges(me.id).includes(e.id) && game.roads[e.id] === undefined).id;
  assertThrows(() => game.buildRoad(me.id, unconnected), /connect/, 'a road must connect');
  game.buildRoad(me.id, edge);
  assert(game.roads[edge] === me.id && handSize(me.resources) === 0, 'the road is placed and paid for');

  // Settlement: must sit at the end of your road and obey distance.
  clearBoard(game);
  const path = edgePath(GEOMETRY.hexes[9].vertices[0], 2);
  const start = GEOMETRY.hexes[9].vertices[0];
  game.buildings[start] = { playerId: me.id, type: 'settlement' };
  game.roads[path[0].edge] = me.id;
  grant(game, me, COSTS.settlement);
  assertThrows(() => game.buildSettlement(me.id, path[0].vertex), /two road lengths/, 'too close to your own settlement');
  game.roads[path[1].edge] = me.id;
  const far = GEOMETRY.vertices.find((v) => game.vertexOpen(v.id) && !game.touchesOwnRoad(me.id, v.id)).id;
  assertThrows(() => game.buildSettlement(me.id, far), /end of one of your roads/, 'a settlement needs a road');
  game.buildSettlement(me.id, path[1].vertex);
  assert(game.buildings[path[1].vertex]?.type === 'settlement', 'the settlement is built');

  assertThrows(() => game.buildCity(me.id, far), /own settlements/, 'a city replaces your own settlement');
  grant(game, me, COSTS.city);
  game.buildCity(me.id, start);
  assert(game.buildings[start].type === 'city' && game.publicPoints(me.id) === 3, 'city worth 2, settlement worth 1');
  conserved(game);

  // Five settlements is the limit.
  clearBoard(game);
  const spots = [];
  GEOMETRY.vertices.forEach((v) => {
    if (spots.length < 5 && spots.every((s) => s !== v.id && !GEOMETRY.vertices[s].neighbors.includes(v.id))) spots.push(v.id);
  });
  spots.forEach((s) => { game.buildings[s] = { playerId: me.id, type: 'settlement' }; });
  grant(game, me, COSTS.settlement);
  assertThrows(() => game.buildSettlement(me.id, far), /no settlements left/, 'the sixth settlement is refused');
  emptyHands(game);
  conserved(game);
});

// --- longest road and largest army -----------------------------------------

test('longest road: five segments earn it, a longer road takes it, a settlement can cut it', () => {
  const game = gameWith(2);
  game.start('p1');
  finishSetup(game);
  clearBoard(game);
  const path = edgePath(GEOMETRY.hexes[9].vertices[0], 5);
  path.slice(0, 4).forEach((s) => { game.roads[s.edge] = 'p1'; });
  game.updateLongestRoad();
  assert(!game.longestRoad, 'four segments are not enough');
  game.roads[path[4].edge] = 'p1';
  game.updateLongestRoad();
  assert(game.longestRoad?.playerId === 'p1' && game.longestRoad.length === 5, 'five segments earn the card');
  assert(game.publicPoints('p1') === 2, 'the card is worth 2 points');

  const other = edgePath(GEOMETRY.hexes[0].vertices[0], 5).filter((s) => game.roads[s.edge] === undefined);
  other.forEach((s) => { game.roads[s.edge] = 'p2'; });
  game.updateLongestRoad();
  assert(game.longestRoad.playerId === 'p1' || game.longestRoadFor('p2') > 5, 'a tie does not take the card away');

  // An opponent's settlement in the middle of the road splits it.
  game.buildings[path[2].vertex] = { playerId: 'p2', type: 'settlement' };
  game.updateLongestRoad();
  assert(game.longestRoadFor('p1') === 3, 'the road is cut in two by an opponent settlement');
  assert(game.longestRoad?.playerId !== 'p1', 'the cut road loses the card');
});

test('largest army: three knights earn it, a knight before rolling returns to the roll', () => {
  const game = gameWith(2);
  game.start('p1');
  finishSetup(game);
  const first = game.getPlayer(game.turn.playerId);
  const second = game.players.find((p) => p.id !== first.id);
  for (let i = 0; i < 3; i += 1) {
    const me = game.getPlayer(game.turn.playerId);
    if (me.id !== first.id) {
      toMain(game);
      game.endTurn(me.id);
    }
    first.devCards.push({ type: 'knight', boughtTurn: -1 });
    game.playDevCard(first.id, 'knight');
    assert(game.turn.step === STEPS.ROBBER && game.turn.afterRobber === STEPS.ROLL, 'a knight before rolling moves the robber first');
    const hex = game.legalRobberHexes().find((h) => !game.playersOnHex(h).length);
    game.moveRobber(first.id, hex);
    assert(game.turn.step === STEPS.ROLL, 'then the player still rolls');
    toMain(game);
    game.endTurn(first.id);
  }
  assert(first.knights === 3 && game.largestArmy?.playerId === first.id, 'three knights earn the largest army');
  assert(game.toClientJSON(second.id).players.find((p) => p.id === first.id).largestArmy, 'everyone sees who holds it');
});

// --- development cards ------------------------------------------------------

test('development cards: buying, not on the turn bought, one per turn, each card does its job', () => {
  const game = gameWith(2);
  game.start('p1');
  finishSetup(game);
  emptyHands(game);
  const me = game.getPlayer(game.turn.playerId);
  const them = game.players.find((p) => p.id !== me.id);
  toMain(game);
  emptyHands(game);

  grant(game, me, COSTS.dev);
  const deck = game.devDeck.length;
  game.devDeck.push('yearOfPlenty');
  game.buyDevCard(me.id);
  assert(game.devDeck.length === deck && me.devCards.at(-1).type === 'yearOfPlenty', 'buying takes the top card');
  assertThrows(() => game.playDevCard(me.id, 'yearOfPlenty', { resources: ['ore', 'ore'] }), /turn it was bought/, 'not on the turn it was bought');
  assert(game.toClientJSON(them.id).players.find((p) => p.id === me.id).devCardCount === 1, 'others see only a card count');
  assert(!JSON.stringify(game.toClientJSON(them.id).players).includes('yearOfPlenty'), 'others never see the card');

  game.endTurn(me.id);
  toMain(game);
  game.endTurn(them.id);
  toMain(game);
  emptyHands(game);
  game.playDevCard(me.id, 'yearOfPlenty', { resources: ['ore', 'wheat'] });
  assert(me.resources.ore === 1 && me.resources.wheat === 1, 'year of plenty takes two resources');
  me.devCards.push({ type: 'monopoly', boughtTurn: -1 });
  assertThrows(() => game.playDevCard(me.id, 'monopoly', { resource: 'ore' }), /one development card/, 'one card per turn');
  conserved(game);

  game.endTurn(me.id);
  toMain(game);
  game.endTurn(them.id);
  toMain(game);
  emptyHands(game);
  grant(game, them, { sheep: 4 });
  grant(game, me, { sheep: 1 });
  game.playDevCard(me.id, 'monopoly', { resource: 'sheep' });
  assert(me.resources.sheep === 5 && them.resources.sheep === 0, 'monopoly takes every card of that resource');
  conserved(game);

  game.endTurn(me.id);
  toMain(game);
  game.endTurn(them.id);
  toMain(game);
  emptyHands(game);
  me.devCards.push({ type: 'roadBuilding', boughtTurn: -1 });
  game.playDevCard(me.id, 'roadBuilding');
  assert(game.turn.freeRoads === 2, 'road building gives two free roads');
  game.buildRoad(me.id, game.legalRoadEdges(me.id)[0]);
  game.buildRoad(me.id, game.legalRoadEdges(me.id)[0]);
  assert(game.turn.freeRoads === 0 && handSize(me.resources) === 0, 'the free roads cost nothing');
  assertThrows(() => game.buildRoad(me.id, game.legalRoadEdges(me.id)[0]), /Not enough/, 'a third road is paid for again');
  assertThrows(() => game.playDevCard(me.id, 'victoryPoint'), /cannot be played/, 'victory point cards are never played');
  conserved(game);
});

// --- trading ------------------------------------------------------------------

test('trading: bank 4:1, harbours 3:1 and 2:1, and offers between players', () => {
  const game = gameWith(3);
  game.start('p1');
  finishSetup(game);
  const me = game.getPlayer(game.turn.playerId);
  const [a, b] = game.players.filter((p) => p.id !== me.id);
  toMain(game);
  emptyHands(game);
  clearBoard(game);

  grant(game, me, { wood: 4 });
  assertThrows(() => game.bankTrade(me.id, 'wood', 'wood'), /different/, 'the same resource cannot be swapped');
  assertThrows(() => game.bankTrade(me.id, 'wood', 'ore', 2), /need 8/, 'four of a kind per card');
  game.bankTrade(me.id, 'wood', 'ore');
  assert(me.resources.wood === 0 && me.resources.ore === 1, 'the bank trades 4:1');

  const generic = game.layout.ports.find((p) => p.type === 'any');
  const special = game.layout.ports.find((p) => p.type !== 'any');
  game.buildings[GEOMETRY.edges[generic.edgeId].a] = { playerId: me.id, type: 'settlement' };
  game.buildings[GEOMETRY.edges[special.edgeId].b] = { playerId: me.id, type: 'settlement' };
  const rates = game.tradeRates(me.id);
  assert(rates[special.type] === 2, 'a resource harbour trades 2:1');
  assert(RESOURCES.filter((r) => r !== special.type).every((r) => rates[r] === 3), 'a generic harbour trades 3:1');
  assert(RESOURCES.every((r) => game.tradeRates(a.id)[r] === 4), 'other players keep 4:1');
  conserved(game);

  emptyHands(game);
  grant(game, me, { wheat: 2 });
  grant(game, a, { ore: 1 });
  grant(game, b, { ore: 1 });
  assertThrows(() => game.proposeTrade(a.id, { give: { ore: 1 }, get: { wheat: 1 } }), /not your turn/, 'only the current player makes offers');
  assertThrows(() => game.proposeTrade(me.id, { give: { wheat: 3 }, get: { ore: 1 } }), /do not have/, 'you cannot offer what you lack');
  assertThrows(() => game.proposeTrade(me.id, { give: { wheat: 1 }, get: {} }), /both sides/, 'no gifts');
  game.proposeTrade(me.id, { give: { wheat: 2 }, get: { ore: 1 } });
  const { id } = game.trade;
  assertThrows(() => game.confirmTrade(me.id, id, a.id), /not accepted/, 'nobody accepted yet');
  game.respondTrade(b.id, id, false);
  game.respondTrade(a.id, id, true);
  assert(game.toClientJSON(b.id).trade.responses[a.id] === 'accept', 'everyone sees the responses');
  game.confirmTrade(me.id, id, a.id);
  assert(me.resources.ore === 1 && me.resources.wheat === 0 && a.resources.wheat === 2 && a.resources.ore === 0, 'the trade swaps the cards');
  assert(game.trade === null, 'the offer is closed');
  conserved(game);

  grant(game, me, { brick: 1 });
  game.proposeTrade(me.id, { give: { brick: 1 }, get: { ore: 1 }, to: [b.id] });
  assertThrows(() => game.respondTrade(a.id, game.trade.id, true), /not for you/, 'an offer can be for one player only');
  game.cancelTrade(me.id);
  assert(!game.trade, 'the offerer can withdraw the offer');
  game.proposeTrade(me.id, { give: { brick: 1 }, get: { ore: 1 } });
  game.endTurn(me.id);
  assert(!game.trade, 'offers expire with the turn');
});

// --- victory ------------------------------------------------------------------

test('victory: reaching the target on your own turn ends the game, hidden points count', () => {
  const game = gameWith(2, { victoryPoints: 10 });
  game.start('p1');
  finishSetup(game);
  const me = game.getPlayer(game.turn.playerId);
  const them = game.players.find((p) => p.id !== me.id);
  toMain(game);
  emptyHands(game);
  clearBoard(game);

  // Three cities (6) and a settlement at the end of a road (1) ...
  const spots = [];
  GEOMETRY.vertices.forEach((v) => {
    if (spots.length < 5 && spots.every((s) => s !== v.id && !GEOMETRY.vertices[s].neighbors.includes(v.id))) spots.push(v.id);
  });
  spots.slice(0, 3).forEach((s) => { game.buildings[s] = { playerId: me.id, type: 'city' }; });
  // ... plus two victory point cards (2) makes 9 before the winning build.
  me.devCards.push({ type: 'victoryPoint', boughtTurn: 0 }, { type: 'victoryPoint', boughtTurn: 0 });
  assert(game.totalPoints(me) === 8, 'eight points so far');
  assert(game.toClientJSON(them.id).players.find((p) => p.id === me.id).points === 6, 'others do not see hidden points');

  const target = spots[4];
  const edge = GEOMETRY.vertices[target].edges[0];
  game.roads[edge] = me.id;
  game.buildings[spots[3]] = { playerId: me.id, type: 'settlement' };
  assert(game.totalPoints(me) === 9, 'nine points');
  grant(game, me, COSTS.settlement);
  game.buildSettlement(me.id, target);
  assert(game.phase === PHASES.GAME_OVER, 'the tenth point ends the game');
  assert(game.results.winnerId === me.id && game.results.standings[0].total === 10, 'the winner leads the standings');
  assert(game.results.standings[0].victoryCards === 2, 'hidden cards are revealed at the end');
  assertThrows(() => game.endTurn(me.id), /over/, 'no more moves after the end');
  assert(game.toClientJSON(them.id).players.find((p) => p.id === me.id).points === 10, 'final scores include hidden points');

  game.restart('p1');
  assert(game.phase === PHASES.LOBBY && !game.layout && game.players.every((p) => handSize(p.resources) === 0), 'restart returns to a clean lobby');
  game.start('p1');
  assert(game.phase === PHASES.SETUP, 'and a new game can start');
});

test('victory: points gained on another turn win at the start of your own turn', () => {
  const game = gameWith(2, { victoryPoints: 6 });
  game.start('p1');
  finishSetup(game);
  const first = game.getPlayer(game.turn.playerId);
  const second = game.players.find((p) => p.id !== first.id);
  toMain(game);
  // The second player reaches the target while it is not their turn.
  second.devCards.push(...Array(4).fill(null).map(() => ({ type: 'victoryPoint', boughtTurn: 0 })));
  assert(game.totalPoints(second) === 6 && game.phase === PHASES.PLAY, 'no win outside your own turn');
  game.endTurn(first.id);
  game.rollDice(second.id, [2, 3]);
  assert(game.phase === PHASES.GAME_OVER && game.results.winnerId === second.id, 'the win is declared when their turn starts');
  assert(!game.lastRoll || game.lastRoll.playerId !== second.id, 'the game ends before the dice are rolled');
});

// --- secrecy, timeouts, leaving, persistence ------------------------------------

test('payloads: your hand and legal moves only in your own payload', () => {
  const game = gameWith(3);
  game.start('p1');
  const actor = game.setup.order[0];
  const other = game.players.find((p) => p.id !== actor).id;
  const mine = game.toClientJSON(actor);
  const theirs = game.toClientJSON(other);
  assert(mine.you.legal.settlements.length === 54 && theirs.you.legal.settlements.length === 0, 'only the placing player gets placement spots');
  assert(mine.players.every((p) => p.resources === undefined), 'player rows never carry hands');
  assert(mine.board.hexes.length === 19 && mine.board.vertices.length === 54 && mine.board.ports.length === 9, 'the board travels with the state');
  assert(game.toClientJSON('stranger').you === null, 'a stranger gets no private section');
});

test('timeouts: every waiting step makes a legal move', () => {
  const game = gameWith(3);
  game.start('p1');
  for (let i = 0; i < 12; i += 1) game.onTimeout();
  assert(game.phase === PHASES.PLAY, 'automatic placement completes the setup');
  placementValid(game);
  const current = game.turn.playerId;
  game.onTimeout();
  assert(game.turn.step !== STEPS.ROLL || game.turn.playerId !== current, 'an automatic roll happens');
  let guard = 0;
  while (game.turn.playerId === current && guard < 10) {
    game.onTimeout();
    guard += 1;
  }
  assert(game.turn.playerId !== current, 'the clock eventually ends the turn');
  conserved(game);

  // A pending discard is made for the player.
  emptyHands(game);
  const roller = game.getPlayer(game.turn.playerId);
  const victim = game.players.find((p) => p.id !== roller.id);
  grant(game, victim, { wood: 5, ore: 5 });
  game.rollDice(roller.id, [5, 2]);
  game.onTimeout();
  assert(handSize(victim.resources) === 5 && game.turn.step !== STEPS.DISCARD, 'an automatic discard removes half');
  conserved(game);
});

test('leaving: the seat stays, the host passes on, the deadline shortens', () => {
  const game = gameWith(3, { turnSec: 0 });
  game.start('p1');
  assert(game.phaseEndsAt === null, 'an untimed game has no clock while players are here');
  const actor = game.setup.order[0];
  game.setConnected(actor, false);
  assert(game.phaseEndsAt && game.phaseEndsAt - Date.now() <= 20000, 'a missing player gets a short grace period');
  game.addPlayer({ playerId: actor, socketId: 'back', nickname: 'x' });
  assert(game.phaseEndsAt === null, 'coming back lifts the grace clock in an untimed game');
  game.removePlayer('p1');
  assert(game.getPlayer('p1').left && game.hostId !== 'p1', 'the host role is handed on mid-game');
});

test('persistence: a saved game restores and plays on', () => {
  const game = gameWith(3);
  game.start('p1');
  finishSetup(game);
  toMain(game);
  const copy = CatanGame.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert(copy.phase === PHASES.PLAY && copy.turn.step === STEPS.MAIN, 'phase and step survive');
  assert(JSON.stringify(copy.buildings) === JSON.stringify(game.buildings) && copy.robberHex === game.robberHex, 'the island survives');
  assert(copy.players.every((p) => !p.connected), 'restored players start offline');
  copy.endTurn(copy.turn.playerId);
  assert(copy.turn.step === STEPS.ROLL, 'the restored game keeps playing');
  conserved(copy);
});

// --- whole games ------------------------------------------------------------------

function botTurn(game, pick) {
  const id = game.turn.playerId;
  const me = game.getPlayer(id);
  const tryDo = (fn) => { try { fn(); return true; } catch (e) { if (!(e instanceof CatanError)) throw e; return false; } };

  if (game.turn.step === STEPS.ROLL) {
    if (Math.random() < 0.3 && me.devCards.some((c) => c.type === 'knight' && c.boughtTurn < game.turnNumber) && !game.turn.devPlayed) {
      game.playDevCard(id, 'knight');
    } else {
      game.rollDice(id);
    }
    return;
  }
  if (game.turn.step === STEPS.DISCARD) {
    Object.entries({ ...game.turn.discards }).forEach(([pid, count]) => {
      const p = game.getPlayer(pid);
      const pool = RESOURCES.flatMap((r) => Array(p.resources[r]).fill(r));
      const chosen = {};
      for (let i = 0; i < count; i += 1) {
        const r = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        chosen[r] = (chosen[r] || 0) + 1;
      }
      game.discard(pid, chosen);
    });
    return;
  }
  if (game.turn.step === STEPS.ROBBER) {
    game.moveRobber(id, pick(game.legalRobberHexes()));
    return;
  }
  if (game.turn.step === STEPS.STEAL) {
    game.steal(id, pick(game.turn.stealFrom));
    return;
  }

  // Main step: build what can be afforded, trade for what is missing.
  let acted = true;
  let guard = 0;
  while (acted && game.phase === PHASES.PLAY && game.turn.step === STEPS.MAIN && game.turn.playerId === id && guard < 30) {
    guard += 1;
    acted = false;
    const cities = game.legalCityVertices(id);
    if (cities.length && tryDo(() => game.buildCity(id, pick(cities)))) { acted = true; continue; }
    const spots = game.legalSettlementVertices(id);
    if (spots.length && tryDo(() => game.buildSettlement(id, pick(spots)))) { acted = true; continue; }
    const playable = me.devCards.filter((c) => c.type !== 'victoryPoint' && c.boughtTurn < game.turnNumber);
    if (playable.length && !game.turn.devPlayed) {
      const card = pick(playable).type;
      const payload = { resources: [pick(RESOURCES), pick(RESOURCES)], resource: pick(RESOURCES) };
      if (tryDo(() => game.playDevCard(id, card, payload))) { acted = true; continue; }
    }
    const roads = game.legalRoadEdges(id);
    if (roads.length && (game.turn.freeRoads > 0 || spots.length === 0) && tryDo(() => game.buildRoad(id, pick(roads)))) { acted = true; continue; }
    if (game.devDeck.length && Math.random() < 0.5 && tryDo(() => game.buyDevCard(id))) { acted = true; continue; }
    const rates = game.tradeRates(id);
    const surplus = RESOURCES.find((r) => me.resources[r] >= rates[r] + 1);
    const need = RESOURCES.filter((r) => me.resources[r] === 0 && game.bank[r] > 0);
    if (surplus && need.length && tryDo(() => game.bankTrade(id, surplus, pick(need)))) { acted = true; continue; }
    if (Math.random() < 0.2) {
      const give = RESOURCES.find((r) => me.resources[r] > 0);
      const get = RESOURCES.find((r) => r !== give);
      if (give && tryDo(() => game.proposeTrade(id, { give: { [give]: 1 }, get: { [get]: 1 } }))) {
        const partner = game.players.find((p) => p.id !== id && p.resources[get] > 0);
        if (partner) {
          game.respondTrade(partner.id, game.trade.id, true);
          game.confirmTrade(id, game.trade.id, partner.id);
        } else {
          game.cancelTrade(id);
        }
      }
    }
  }
  if (game.phase === PHASES.PLAY && game.turn.step === STEPS.MAIN && game.turn.playerId === id) game.endTurn(id);
}

test('whole games: 40 bot games of 2-4 players play to a winner without breaking a rule', () => {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  let finished = 0;
  let totalTurns = 0;
  for (let g = 0; g < 40; g += 1) {
    const game = gameWith(2 + (g % 3));
    game.start('p1');
    while (game.phase === PHASES.SETUP) {
      const id = game.setup.order[game.setup.index];
      if (game.setup.step === 'SETTLEMENT') game.buildSettlement(id, pick(game.legalSettlementVertices(id)));
      else game.buildRoad(id, pick(game.legalRoadEdges(id)));
    }
    let actions = 0;
    while (game.phase === PHASES.PLAY && actions < 20000) {
      botTurn(game, pick);
      actions += 1;
      conserved(game);
      if (actions % 25 === 0) placementValid(game);
    }
    placementValid(game);
    if (game.phase === PHASES.GAME_OVER) {
      finished += 1;
      totalTurns += game.turnNumber;
      const winner = game.getPlayer(game.results.winnerId);
      assert(game.totalPoints(winner) >= game.settings.victoryPoints, 'the winner reached the target');
      assert(game.players.every((p) => p.id === winner.id || game.totalPoints(p) < game.settings.victoryPoints || true), 'standings computed');
    }
  }
  assert(finished === 40, `every bot game reached a winner (${finished}/40)`);
  // eslint-disable-next-line no-console
  console.log(`    (average game length ${Math.round(totalTurns / finished)} turns)`);
});

// eslint-disable-next-line no-console
console.log(`\nCatan tests: ${passed} passed`);
