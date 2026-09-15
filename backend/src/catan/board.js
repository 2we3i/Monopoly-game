// board.js
// The Catan island: fixed geometry plus a random layout per game.
//
// The classic island is 19 land hexes in a radius-2 hexagon. Hexes are
// pointy-top and addressed with axial coordinates (q, r). Every corner
// and side is computed once, in integer "board units", so vertex and edge
// ids are stable across games, restarts and the client:
//
//   hex centre   X = 2q + r,  Y = 3r
//   corners      (0,-2) (1,-1) (1,1) (0,2) (-1,1) (-1,-1) around the centre
//
// A unit of X is (sqrt(3)/2)*size and a unit of Y is size/2, so a renderer
// only has to scale the two axes to draw a regular hexagon.
//
// What changes from game to game is the layout: which terrain lies where,
// the number tokens (never two red 6/8 tokens side by side) and which
// harbour sits in each of the nine port positions around the coast.

const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

const TERRAIN_RESOURCE = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'sheep',
  fields: 'wheat',
  mountains: 'ore',
  desert: null,
};

const TERRAIN_POOL = [
  'forest', 'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields',
  'hills', 'hills', 'hills',
  'mountains', 'mountains', 'mountains',
  'desert',
];

const NUMBER_POOL = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const PORT_POOL = ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore'];

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

function buildGeometry() {
  const coords = [];
  for (let r = -2; r <= 2; r += 1) {
    for (let q = -2; q <= 2; q += 1) {
      if (Math.abs(q + r) <= 2) coords.push([q, r]);
    }
  }

  const vertexByKey = new Map();
  const vertices = [];
  const edgeByKey = new Map();
  const edges = [];

  const vertexAt = (x, y) => {
    const key = `${x},${y}`;
    if (!vertexByKey.has(key)) {
      const v = { id: vertices.length, x, y, hexes: [], edges: [], neighbors: [] };
      vertexByKey.set(key, v);
      vertices.push(v);
    }
    return vertexByKey.get(key);
  };

  const edgeBetween = (a, b) => {
    const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    if (!edgeByKey.has(key)) {
      const e = { id: edges.length, a: Math.min(a.id, b.id), b: Math.max(a.id, b.id), hexes: [] };
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

  // The coast, walked once around the island. Nine harbours sit on it at
  // the classic spacing (3, 3, 4 sides apart, three times over), which
  // also guarantees no two harbours share a corner.
  const coast = edges
    .filter((e) => e.hexes.length === 1)
    .map((e) => {
      const va = vertices[e.a];
      const vb = vertices[e.b];
      // The angle is measured in true proportions so the walk is even.
      const mx = ((va.x + vb.x) / 2) * (Math.sqrt(3) / 2);
      const my = (va.y + vb.y) / 4;
      return { id: e.id, angle: Math.atan2(my, mx) };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((e) => e.id);
  const portEdges = [];
  let cursor = 0;
  for (let i = 0; i < 9; i += 1) {
    portEdges.push(coast[cursor]);
    cursor += [3, 3, 4][i % 3];
  }

  return {
    hexes, vertices, edges, coast, portEdges,
  };
}

const GEOMETRY = buildGeometry();

function hasAdjacentRedNumbers(numbers) {
  const red = (n) => n === 6 || n === 8;
  return GEOMETRY.hexes.some((h) => red(numbers[h.id]) && h.neighbors.some((n) => red(numbers[n])));
}

// A fresh island. `random` is injectable so tests can reproduce a board.
function generateLayout(random = Math.random) {
  let terrain;
  let numbers;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    terrain = shuffle(TERRAIN_POOL, random);
    const tokens = shuffle(NUMBER_POOL, random);
    numbers = terrain.map((t) => (t === 'desert' ? null : tokens.pop()));
    if (!hasAdjacentRedNumbers(numbers)) break;
  }
  const portTypes = shuffle(PORT_POOL, random);
  return {
    hexes: GEOMETRY.hexes.map((h) => ({ id: h.id, terrain: terrain[h.id], number: numbers[h.id] })),
    ports: GEOMETRY.portEdges.map((edgeId, i) => ({ edgeId, type: portTypes[i] })),
  };
}

module.exports = {
  RESOURCES,
  TERRAIN_RESOURCE,
  TERRAIN_POOL,
  NUMBER_POOL,
  PORT_POOL,
  GEOMETRY,
  generateLayout,
  hasAdjacentRedNumbers,
  shuffle,
};
