// Catan on the bigger islands: five to eight players.
//
// The classic game is covered by catan.test.js and is untouched by any of
// this; what is tested here is everything that only exists because a table
// can now seat more than four:
//
//   * the three islands themselves - geometry, terrain, tokens, harbours;
//   * which island a table of a given size plays on, and a host pinning
//     one by hand;
//   * eight seats, eight distinct colours, a bank and a development deck
//     that grow with the island;
//   * whole games of 5, 6, 7 and 8 players played to a winner with no
//     resource created or destroyed and no piece breaking a rule;
//   * a big game saved and restored, and an old save from before there was
//     more than one island.

const {
  CatanGame, CatanError, PHASES, STEPS, MAX_PLAYERS, PIECES, handSize,
} = require('../src/catan/CatanGame');
const {
  RESOURCES, ISLAND_IDS, geometryFor, islandSpec, islandForPlayers, generateLayout,
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

function gameWith(count, settings) {
  const game = new CatanGame('BIG', 'p1', settings);
  for (let i = 1; i <= count; i += 1) {
    game.addPlayer({
      playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}`, accountId: i === 1 ? 'acc1' : null,
    });
  }
  return game;
}

// Nothing is ever created or destroyed: every resource is either in the
// bank or in somebody's hand.
function conserved(game) {
  const spec = islandSpec(game.island);
  RESOURCES.forEach((r) => {
    const held = game.players.reduce((sum, p) => sum + p.resources[r], 0);
    assert(game.bank[r] + held === spec.bank, `${r} is conserved (${game.bank[r]} + ${held} != ${spec.bank})`);
    assert(game.bank[r] >= 0, `the bank never goes negative in ${r}`);
  });
}

// Settlements never touch, roads never double up, nobody has more pieces
// than they own.
function placementValid(game) {
  const geo = game.geo;
  Object.entries(game.buildings).forEach(([vertex, b]) => {
    geo.vertices[vertex].neighbors.forEach((n) => {
      assert(!game.buildings[n], `no two buildings on neighbouring corners (${vertex}-${n})`);
    });
    assert(b.type === 'settlement' || b.type === 'city', 'a building is a settlement or a city');
  });
  game.players.forEach((p) => {
    const left = game.piecesLeft(p.id);
    assert(left.road >= 0 && left.settlement >= 0 && left.city >= 0, `${p.nickname} never places more pieces than they have`);
    assert(left.road <= PIECES.road, 'road stock never grows');
  });
}

// --- the islands ---------------------------------------------------------

test('islands: three boards, each whole - terrain fits the hexes, tokens fit the land, harbours keep apart', () => {
  ISLAND_IDS.forEach((id) => {
    const geo = geometryFor(id);
    const spec = islandSpec(id);
    const terrainCount = Object.values(spec.terrain).reduce((a, c) => a + c, 0);
    const tokenCount = Object.values(spec.numbers).reduce((a, c) => a + c, 0);

    assert(terrainCount === geo.hexes.length, `${id}: a terrain tile for every hex (${terrainCount}/${geo.hexes.length})`);
    assert(tokenCount === terrainCount - spec.terrain.desert, `${id}: a number token for every hex but the deserts`);
    assert(geo.hexes.every((h) => h.vertices.length === 6 && h.edges.length === 6), `${id}: every hex has six corners and six sides`);
    assert(geo.vertices.every((v) => v.hexes.length >= 1 && v.hexes.length <= 3), `${id}: a corner touches one to three hexes`);

    // The coast is a closed walk: every coastal side appears once.
    const coastal = geo.edges.filter((e) => e.hexes.length === 1).map((e) => e.id);
    assert(geo.coast.length === coastal.length, `${id}: the coast walk covers every coastal side`);
    assert(new Set(geo.coast).size === geo.coast.length, `${id}: the coast walk never repeats a side`);

    // No two harbours may share a corner, or one spot would serve both.
    const corners = geo.portEdges.flatMap((e) => [geo.edges[e].a, geo.edges[e].b]);
    assert(new Set(corners).size === corners.length, `${id}: no two harbours share a corner`);
    assert(geo.portEdges.every((e) => coastal.includes(e)), `${id}: every harbour sits on the coast`);
  });

  // Bigger islands really are bigger, in that order.
  const sizes = ISLAND_IDS.map((id) => geometryFor(id).hexes.length);
  assert(sizes[0] === 19, 'the classic island is untouched at 19 hexes');
  assert(sizes.every((n, i) => i === 0 || n > sizes[i - 1]), `each island is larger than the last (${sizes.join(' < ')})`);
});

test('islands: every layout deals the right land, no two red numbers side by side, every harbour type on the board', () => {
  ISLAND_IDS.forEach((id) => {
    const geo = geometryFor(id);
    const spec = islandSpec(id);
    for (let i = 0; i < 40; i += 1) {
      const layout = generateLayout(id);
      assert(layout.island === id, `${id}: the layout knows its island`);
      assert(layout.hexes.length === geo.hexes.length, `${id}: a tile for every hex`);
      assert(layout.ports.length === geo.portEdges.length, `${id}: a harbour in every position`);

      const deserts = layout.hexes.filter((h) => h.terrain === 'desert');
      assert(deserts.length === spec.terrain.desert, `${id}: the right number of deserts`);
      assert(deserts.every((h) => h.number === null), `${id}: a desert never carries a number`);
      assert(layout.hexes.every((h) => h.terrain === 'desert' || Number.isInteger(h.number)), `${id}: every other hex carries one`);

      const red = (n) => n === 6 || n === 8;
      const byId = Object.fromEntries(layout.hexes.map((h) => [h.id, h.number]));
      geo.hexes.forEach((h) => {
        if (!red(byId[h.id])) return;
        assert(!h.neighbors.some((n) => red(byId[n])), `${id}: no 6 or 8 next to another`);
      });

      const types = new Set(layout.ports.map((p) => p.type));
      assert(types.has('any'), `${id}: at least one 3:1 harbour`);
      RESOURCES.forEach((r) => assert(types.has(r), `${id}: a 2:1 harbour for ${r}`));
    }
  });
});

test('islands: the board a table gets follows the number of players, and a host can pin one', () => {
  assert(islandForPlayers(2) === 'classic' && islandForPlayers(4) === 'classic', 'two to four keep the classic island');
  assert(islandForPlayers(5) === 'large' && islandForPlayers(6) === 'large', 'five and six get the large island');
  assert(islandForPlayers(7) === 'grand' && islandForPlayers(8) === 'grand', 'seven and eight get the grand island');

  const six = gameWith(6);
  assert(six.settings.island === 'auto', 'a room starts on automatic');
  six.start('p1');
  assert(six.island === 'large' && six.geo.hexes.length === 31, 'six players start on the large island');

  const pinned = gameWith(3, { island: 'grand' });
  pinned.start('p1');
  assert(pinned.island === 'grand' && pinned.geo.hexes.length === 37, 'a host can put three players on the grand island');

  const nonsense = gameWith(2, { island: 'atlantis' });
  assert(nonsense.settings.island === 'auto', 'an island nobody has heard of falls back to automatic');

  const four = gameWith(4);
  four.start('p1');
  assert(four.island === 'classic' && four.geo.hexes.length === 19, 'a table of four plays exactly the game it always did');
});

// --- eight seats ---------------------------------------------------------

test('eight seats: the table fills to eight, colours never repeat, the bank and the deck grow with the island', () => {
  assert(MAX_PLAYERS === 8, 'eight seats');
  const full = gameWith(8);
  assertThrows(() => full.addPlayer({ playerId: 'p9', socketId: 's9', nickname: 'P9' }), /at most 8/, 'a ninth player is refused');
  full.start('p1');

  const colours = full.players.map((p) => p.color);
  assert(new Set(colours).size === 8, `all eight colours are different (${colours.join(', ')})`);
  assert(colours.slice(0, 4).join(',') === 'red,blue,orange,white', 'the first four are the classic colours');

  const spec = islandSpec(full.island);
  assert(RESOURCES.every((r) => full.bank[r] === spec.bank), `the bank holds ${spec.bank} of each resource`);
  assert(full.bank.wood > 19, 'the grand island has a bigger bank than the classic one');
  assert(full.devDeck.length === Object.values(spec.dev).reduce((a, c) => a + c, 0), 'the development deck is the size the island says');
  assert(full.devDeck.length > 25, 'and it is bigger than the classic one');

  // The snake order covers everybody twice, and nobody twice in a row at
  // the turn of the snake except the last player.
  assert(full.setup.order.length === 16, 'the opening placement goes round the table and back');
  assert(new Set(full.setup.order).size === 8, 'every player places twice');
  assert(full.setup.order[7] === full.setup.order[8], 'the player at the turn of the snake places twice running');
  assert(full.order.length === 8, 'eight seats in the turn order');
});

test('eight seats: the board the client is sent is the big one, and placement spots come from it', () => {
  const game = gameWith(8);
  game.start('p1');
  const actor = game.setup.order[0];
  const view = game.toClientJSON(actor);
  assert(view.board.island === 'grand', 'the payload names the island');
  assert(view.board.hexes.length === 37 && view.board.vertices.length === 96, 'the whole big island travels to the client');
  assert(view.board.ports.length === 12, 'twelve harbours on the big island');
  assert(view.you.legal.settlements.length === 96, 'every corner is open to the first placement');
  assert(view.players.length === 8 && view.maxPlayers === 8, 'the table shows eight seats');
  const others = game.toClientJSON(game.setup.order[1]);
  assert(others.you.legal.settlements.length === 0, 'and only the player whose turn it is may place');
});

// --- whole games ---------------------------------------------------------

function botTurn(game, pick) {
  const id = game.turn.playerId;
  const me = game.getPlayer(id);
  const tryDo = (fn) => { try { fn(); return true; } catch (e) { if (!(e instanceof CatanError)) throw e; return false; } };

  if (game.turn.step === STEPS.ROLL) { game.rollDice(id); return; }
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
  if (game.turn.step === STEPS.ROBBER) { game.moveRobber(id, pick(game.legalRobberHexes())); return; }
  if (game.turn.step === STEPS.STEAL) { game.steal(id, pick(game.turn.stealFrom)); return; }

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
  }
  if (game.phase === PHASES.PLAY && game.turn.step === STEPS.MAIN && game.turn.playerId === id) game.endTurn(id);
}

test('whole games: 5 to 8 players play to a winner on the big islands without breaking a rule', () => {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const lengths = {};
  let finished = 0;
  const tables = [5, 6, 7, 8, 8, 7, 6, 5, 8, 6, 7, 5];

  tables.forEach((seats) => {
    const game = gameWith(seats);
    game.start('p1');
    assert(game.island === islandForPlayers(seats), `${seats} players get the island meant for them`);

    while (game.phase === PHASES.SETUP) {
      const id = game.setup.order[game.setup.index];
      if (game.setup.step === 'SETTLEMENT') game.buildSettlement(id, pick(game.legalSettlementVertices(id)));
      else game.buildRoad(id, pick(game.legalRoadEdges(id)));
    }
    placementValid(game);
    conserved(game);

    let actions = 0;
    while (game.phase === PHASES.PLAY && actions < 40000) {
      botTurn(game, pick);
      actions += 1;
      conserved(game);
      if (actions % 50 === 0) placementValid(game);
    }
    placementValid(game);
    assert(game.phase === PHASES.GAME_OVER, `a ${seats}-player game reaches an end (phase ${game.phase} after ${actions} actions)`);
    const winner = game.getPlayer(game.results.winnerId);
    assert(game.totalPoints(winner) >= game.settings.victoryPoints, 'the winner reached the target');
    assert(game.results.standings.length === seats, 'everyone is in the standings');
    finished += 1;
    lengths[seats] = Math.max(lengths[seats] || 0, game.turnNumber);
  });

  assert(finished === tables.length, `every big game reached a winner (${finished}/${tables.length})`);
  // eslint-disable-next-line no-console
  console.log(`    (longest game per table size: ${Object.entries(lengths).map(([n, t]) => `${n}p ${t} turns`).join(', ')})`);
});

// --- saving and loading ---------------------------------------------------

test('persistence: a big game restores on its own island, and a save from before the islands reads as the classic one', () => {
  const game = gameWith(7);
  game.start('p1');
  while (game.phase === PHASES.SETUP) {
    const id = game.setup.order[game.setup.index];
    if (game.setup.step === 'SETTLEMENT') game.buildSettlement(id, game.legalSettlementVertices(id)[0]);
    else game.buildRoad(id, game.legalRoadEdges(id)[0]);
  }
  const copy = CatanGame.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert(copy.island === 'grand' && copy.geo.hexes.length === 37, 'the island survives a save');
  assert(JSON.stringify(copy.buildings) === JSON.stringify(game.buildings), 'so do the pieces on it');
  copy.rollDice(copy.turn.playerId, [3, 4]);
  assert(copy.phase === PHASES.PLAY, 'and the restored game plays on');
  conserved(copy);

  // A room saved before any of this existed has no `island` at all.
  const old = JSON.parse(JSON.stringify(gameWith(3).toJSON()));
  delete old.island;
  old.settings = { victoryPoints: 10, turnSec: 120 };
  const restored = CatanGame.fromJSON(old);
  assert(restored.geo.hexes.length === 19, 'an old save is on the classic island');
  restored.start('p1');
  assert(restored.island === 'classic' && restored.layout.hexes.length === 19, 'and it starts there too');
});

// eslint-disable-next-line no-console
console.log(`\nCatan on the big islands: ${passed} passed\n`);
