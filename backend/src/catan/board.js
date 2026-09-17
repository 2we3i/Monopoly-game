// board.js
// The Catan island: fixed geometry plus a random layout per game.
//
// Hexes are pointy-top and addressed with axial coordinates (q, r). Every
// corner and side is computed once, in integer "board units", so vertex
// and edge ids are stable across games, restarts and the client:
//
//   hex centre   X = 2q + r,  Y = 3r
//   corners      (0,-2) (1,-1) (1,1) (0,2) (-1,1) (-1,-1) around the centre
//
// A unit of X is (sqrt(3)/2)*size and a unit of Y is size/2, so a renderer
// only has to scale the two axes to draw a regular hexagon.
//
// There are three islands, because a table of eight cannot be fed by a
// board built for four:
//
//   classic  19 hexes, radius 2          2-4 players (the original)
//   large    31 hexes, radius 3 without
//            its six corner hexes         5-6 players
//   grand    37 hexes, radius 3          7-8 players
//
// An island is DATA: its radius, which hexes it leaves out, how much
// terrain and how many number tokens it holds, how big the bank and the
// development deck are. Everything else - the geometry, the coast, where
// the harbours sit, the layout shuffle - is computed from that, so a
// fourth island is a new entry in ISLANDS and nothing else.
//
// Geometry is built once per island and cached: ids inside one island are
// stable forever, and two islands never share an id space (a game says
// which island it is playing on, and asks for that geometry).
//
// What changes from game to game is the layout: which terrain lies where,
// the number tokens (never two red 6/8 tokens side by side) and which
// harbour sits in each port position around the coast.

const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

const TERRAIN_RESOURCE = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'sheep',
  fields: 'wheat',
  mountains: 'ore',
  desert: null,
};

// A terrain pool written as counts, so a bigger island is a bigger number
// rather than a longer list to keep in step.
function terrainPool({
  forest, pasture, fields, hills, mountains, desert,
}) {
  return [
    ...Array(forest).fill('forest'),
    ...Array(pasture).fill('pasture'),
    ...Array(fields).fill('fields'),
    ...Array(hills).fill('hills'),
    ...Array(mountains).fill('mountains'),
    ...Array(desert).fill('desert'),
  ];
}

// The number tokens, likewise. The classic spread is one 2, one 12 and
// two of everything else; a bigger island keeps the shape of that curve.
function numberPool(counts) {
  return Object.entries(counts).flatMap(([n, times]) => Array(times).fill(Number(n)));
}

// --- the islands -------------------------------------------------------

const ISLANDS = [
  {
    id: 'classic',
    radius: 2,
    drop: [],
    minPlayers: 2,
    maxPlayers: 4,
    terrain: {
      forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1,
    },
    numbers: {
      2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1,
    },
    bank: 19,
    dev: {
      knight: 14, victoryPoint: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2,
    },
  },
  {
    id: 'large',
    radius: 3,
    // The six corners of the big hexagon, left out so the island keeps a
    // rounded shape instead of a wide flat rim.
    drop: [[3, 0], [0, 3], [-3, 3], [-3, 0], [0, -3], [3, -3]],
    minPlayers: 5,
    maxPlayers: 6,
    terrain: {
      forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 3,
    },
    numbers: {
      2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 8: 3, 9: 3, 10: 3, 11: 3, 12: 2,
    },
    bank: 24,
    dev: {
      knight: 20, victoryPoint: 6, roadBuilding: 3, yearOfPlenty: 3, monopoly: 3,
    },
  },
  {
    id: 'grand',
    radius: 3,
    drop: [],
    minPlayers: 7,
    maxPlayers: 8,
    terrain: {
      forest: 8, pasture: 7, fields: 7, hills: 6, mountains: 6, desert: 3,
    },
    numbers: {
      2: 2, 3: 4, 4: 4, 5: 4, 6: 3, 8: 3, 9: 4, 10: 4, 11: 4, 12: 2,
    },
    bank: 30,
    dev: {
      knight: 24, victoryPoint: 7, roadBuilding: 3, yearOfPlenty: 3, monopoly: 3,
    },
  },
];

const ISLAND_BY_ID = new Map(ISLANDS.map((i) => [i.id, i]));
const ISLAND_IDS = ISLANDS.map((i) => i.id);
const DEFAULT_ISLAND = 'classic';

// The island a table of this size plays on, unless the host picked one.
function islandForPlayers(count) {
  const found = ISLANDS.find((i) => count >= i.minPlayers && count <= i.maxPlayers);
  return (found || ISLANDS[ISLANDS.length - 1]).id;
}

function islandSpec(id) {
  return ISLAND_BY_ID.get(id) || ISLAND_BY_ID.get(DEFAULT_ISLAND);
}

const CORNERS = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
const AXIAL_NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- geometry ----------------------------------------------------------

// The coast as a walk: start on any edge with one hex behind it and keep
// stepping to the next coastal edge that shares the corner ahead. A walk
// works on any island shape, including one with a notch where a corner
// hex was left out; sorting by angle would not.
function walkCoast(edges, vertices) {
  const coastal = edges.filter((e) => e.hexes.length === 1);
  if (!coastal.length) return [];
  const byVertex = new Map();
  coastal.forEach((e) => {
    [e.a, e.b].forEach((v) => {
      if (!byVertex.has(v)) byVertex.set(v, []);
      byVertex.get(v).push(e.id);
    });
  });
  // An island every hex of which joins the rest by a side (never only by
  // a corner) has exactly two coastal edges at every coastal corner.
  const clean = [...byVertex.values()].every((list) => list.length === 2);
  if (!clean) {
    // A shape this walk cannot follow: fall back to the angle order,
    // which is right for any island that is convex around its centre.
    return coastal
      .map((e) => {
        const va = vertices[e.a];
        const vb = vertices[e.b];
        const mx = ((va.x + vb.x) / 2) * (Math.sqrt(3) / 2);
        const my = (va.y + vb.y) / 4;
        return { id: e.id, angle: Math.atan2(my, mx) };
      })
      .sort((a, b) => a.angle - b.angle)
      .map((e) => e.id);
  }

  const byId = new Map(coastal.map((e) => [e.id, e]));
  const start = coastal[0];
  const order = [start.id];
  let previous = start.a;
  let current = start.b;
  while (order.length < coastal.length) {
    const next = byVertex.get(current).find((id) => id !== order[order.length - 1]);
    if (next === undefined) break;
    order.push(next);
    const edge = byId.get(next);
    previous = current;
    current = edge.a === previous ? edge.b : edge.a;
  }
  return order;
}

// Harbour positions: the classic 3-3-4 spacing walked round the coast for
// as long as it fits, which puts nine on the small island and twelve on
// the big ones, and never lets two harbours share a corner.
const PORT_SPACING = [3, 3, 4];

function placePorts(coast) {
  const out = [];
  let cursor = 0;
  for (let i = 0; cursor < coast.length; i += 1) {
    // The last harbour must also keep its distance from the first one,
    // measured the short way round the seam.
    if (out.length && coast.length - cursor < PORT_SPACING[0]) break;
    out.push(coast[cursor]);
    cursor += PORT_SPACING[i % PORT_SPACING.length];
  }
  return out;
}

function buildGeometry(spec) {
  const dropped = new Set((spec.drop || []).map(([q, r]) => `${q},${r}`));
  const coords = [];
  const R = spec.radius;
  for (let r = -R; r <= R; r += 1) {
    for (let q = -R; q <= R; q += 1) {
      if (Math.abs(q + r) <= R && !dropped.has(`${q},${r}`)) coords.push([q, r]);
    }
  }

  const vertexByKey = new Map();
  const vertices = [];
  const edgeByKey = new Map();
  const edges = [];

  const vertexAt = (x, y) => {
    const key = `${x},${y}`;
    if (!vertexByKey.has(key)) {
      const v = {
        id: vertices.length, x, y, hexes: [], edges: [], neighbors: [],
      };
      vertexByKey.set(key, v);
      vertices.push(v);
    }
    return vertexByKey.get(key);
  };

  const edgeBetween = (a, b) => {
    const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    if (!edgeByKey.has(key)) {
      const e = {
        id: edges.length, a: Math.min(a.id, b.id), b: Math.max(a.id, b.id), hexes: [],
      };
      edgeByKey.set(key, e);
      edges.push(e);
      a.edges.push(e.id);
      b.edges.push(e.id);
      a.neighbors.push(b.id);
      b.neighbors.push(a.id);
    }
    return edgeByKey.get(key);
  };

  const hexes = coords.map(([q, r], id) => {
    const cx = 2 * q + r;
    const cy = 3 * r;
    const corner = CORNERS.map(([dx, dy]) => vertexAt(cx + dx, cy + dy));
    const hex = {
      id, q, r, x: cx, y: cy, vertices: corner.map((v) => v.id), edges: [],
    };
    corner.forEach((v, i) => {
      v.hexes.push(id);
      const e = edgeBetween(v, corner[(i + 1) % 6]);
      e.hexes.push(id);
      hex.edges.push(e.id);
    });
    return hex;
  });

  const hexIdByCoord = new Map(hexes.map((h) => [`${h.q},${h.r}`, h.id]));
  hexes.forEach((h) => {
    h.neighbors = AXIAL_NEIGHBORS
      .map(([dq, dr]) => hexIdByCoord.get(`${h.q + dq},${h.r + dr}`))
      .filter((id) => id !== undefined);
  });

  const coast = walkCoast(edges, vertices);
  return {
    island: spec.id,
    hexes,
    vertices,
    edges,
    coast,
    portEdges: placePorts(coast),
  };
}

// One geometry per island, built on first use and kept.
const GEOMETRY_CACHE = new Map();

function geometryFor(islandId = DEFAULT_ISLAND) {
  const spec = islandSpec(islandId);
  if (!GEOMETRY_CACHE.has(spec.id)) GEOMETRY_CACHE.set(spec.id, buildGeometry(spec));
  return GEOMETRY_CACHE.get(spec.id);
}

// The original island, still exported under its old name: everything that
// was written against a single fixed board keeps working unchanged.
const GEOMETRY = geometryFor(DEFAULT_ISLAND);

// --- layouts -----------------------------------------------------------

function hasAdjacentRedNumbers(numbers, geometry = GEOMETRY) {
  const red = (n) => n === 6 || n === 8;
  return geometry.hexes.some((h) => red(numbers[h.id]) && h.neighbors.some((n) => red(numbers[n])));
}

// The harbour types for a coast with `count` positions: the classic four
// "any" harbours to five resource ones, scaled, and never a resource
// missing from a board that has room for all five.
function portPool(count) {
  const anyCount = Math.max(1, Math.round((count * 4) / 9));
  const pool = Array(anyCount).fill('any');
  for (let i = 0; pool.length < count; i += 1) pool.push(RESOURCES[i % RESOURCES.length]);
  return pool;
}

// A fresh island. `random` is injectable so tests can reproduce a board.
function generateLayout(islandId = DEFAULT_ISLAND, random = Math.random) {
  // The older signature was generateLayout(random): a function in the
  // first argument still means "the classic island, with this randomness".
  if (typeof islandId === 'function') return generateLayout(DEFAULT_ISLAND, islandId);

  const spec = islandSpec(islandId);
  const geometry = geometryFor(spec.id);
  const pool = terrainPool(spec.terrain);
  const tokenPool = numberPool(spec.numbers);

  let terrain;
  let numbers;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    terrain = shuffle(pool, random);
    const tokens = shuffle(tokenPool, random);
    numbers = terrain.map((t) => (t === 'desert' ? null : tokens.pop() ?? null));
    if (!hasAdjacentRedNumbers(numbers, geometry)) break;
  }
  const portTypes = shuffle(portPool(geometry.portEdges.length), random);
  return {
    island: spec.id,
    hexes: geometry.hexes.map((h) => ({ id: h.id, terrain: terrain[h.id], number: numbers[h.id] })),
    ports: geometry.portEdges.map((edgeId, i) => ({ edgeId, type: portTypes[i] })),
  };
}

// The pools of the classic island, still exported under their old names.
const TERRAIN_POOL = terrainPool(islandSpec(DEFAULT_ISLAND).terrain);
const NUMBER_POOL = numberPool(islandSpec(DEFAULT_ISLAND).numbers);
const PORT_POOL = portPool(GEOMETRY.portEdges.length);

module.exports = {
  RESOURCES,
  TERRAIN_RESOURCE,
  TERRAIN_POOL,
  NUMBER_POOL,
  PORT_POOL,
  GEOMETRY,
  ISLANDS,
  ISLAND_IDS,
  DEFAULT_ISLAND,
  islandSpec,
  islandForPlayers,
  geometryFor,
  terrainPool,
  numberPool,
  portPool,
  generateLayout,
  hasAdjacentRedNumbers,
  shuffle,
};
