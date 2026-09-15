// westeros.js
// The map of the Iron Throne game: the coastline, the territories, the sea
// zones and which of them touch. Pure data and geometry - no React - so the
// rules engine and a script can use the same adjacency the screen draws.
//
// A territory is one or more seed points. The mainland is split into the
// Voronoi cells of every mainland seed and clipped to the coastline, so
// borders are always shared exactly and never leave gaps; islands are their
// own outline. Sea zones are the Voronoi cells of the sea seeds, drawn under
// the land. Several seeds per zone let a long shape (the Sea of Dorne, the
// strip under the Wall) follow the coast instead of cutting across it.
//
// Adjacency is measured, not typed: two territories touch when their shared
// border runs over land for a while; a territory touches a sea zone when
// enough of its coastline lies in that zone. ADJ_EXTRA / ADJ_CUT correct the
// few places where a straight Voronoi edge disagrees with the drawing.

export const MAP_W = 1600;
export const MAP_H = 2400;
export const WALL_Y = 270;
export const WALL_X = [396, 1104];

// --- Territories -----------------------------------------------------------
// structure: stronghold | castle | city | capital (King's Landing)
// port: armies may sail from here. supply: barrels (army limit).
// crown: +1 influence per turn. garrison: neutral defenders at the start.

export const TERRITORIES_DATA = [
  // The North
  { id: 'castle_black', region: 'north', seeds: [[560, 340], [900, 340]], structure: 'castle', garrison: 2, crown: 1, terrain: 'snow' },
  { id: 'karhold', region: 'north', seeds: [[1190, 450]], structure: 'castle', garrison: 1, supply: 1, terrain: 'snow' },
  { id: 'winterfell', region: 'north', seeds: [[720, 600]], structure: 'stronghold', supply: 1, crown: 1, terrain: 'forest', home: 'stark' },
  { id: 'stony_shore', region: 'north', seeds: [[420, 740], [430, 460]], supply: 1, terrain: 'forest' },
  { id: 'widows_watch', region: 'north', seeds: [[1110, 700]], crown: 1, home: 'stark' },
  { id: 'white_harbor', region: 'north', seeds: [[930, 835]], structure: 'city', port: true, home: 'stark' },
  // The Neck
  { id: 'moat_cailin', region: 'neck', seeds: [[790, 965]], structure: 'castle', garrison: 2, terrain: 'swamp' },
  { id: 'greywater', region: 'neck', seeds: [[640, 1010]], structure: 'castle', terrain: 'swamp', home: 'greyjoy' },
  { id: 'flints_finger', region: 'neck', seeds: [[440, 1008]], home: 'greyjoy' },
  // The Riverlands
  { id: 'twins', region: 'river', seeds: [[700, 1130]], structure: 'castle', garrison: 2, crown: 1 },
  { id: 'seagard', region: 'river', seeds: [[505, 1180]], structure: 'castle', garrison: 1, port: true },
  { id: 'riverrun', region: 'river', seeds: [[590, 1310]], structure: 'castle', garrison: 2, supply: 1 },
  { id: 'harrenhal', region: 'river', seeds: [[820, 1300]], structure: 'castle', garrison: 3 },
  { id: 'stoney_sept', region: 'river', seeds: [[580, 1460]], structure: 'castle', crown: 1, home: 'lannister' },
  // The Vale
  { id: 'fingers', region: 'vale', seeds: [[1150, 1065]], supply: 1 },
  { id: 'mountains_moon', region: 'vale', seeds: [[960, 1175]], terrain: 'mountains' },
  { id: 'eyrie', region: 'vale', seeds: [[1175, 1240]], structure: 'stronghold', garrison: 3, crown: 1, terrain: 'mountains' },
  { id: 'crackclaw', region: 'vale', seeds: [[1110, 1435]], terrain: 'forest' },
  // The Westerlands
  { id: 'lannisport', region: 'west', seeds: [[385, 1360]], structure: 'stronghold', port: true, supply: 1, home: 'lannister' },
  { id: 'searoad', region: 'west', seeds: [[380, 1590]], supply: 1, home: 'lannister', terrain: 'hills' },
  // The Crownlands
  { id: 'blackwater', region: 'crown', seeds: [[760, 1510]], supply: 1 },
  { id: 'kings_landing', region: 'crown', seeds: [[955, 1590]], structure: 'capital', garrison: 4, port: true, crown: 1 },
  { id: 'kingswood', region: 'storm', seeds: [[1090, 1730]], terrain: 'forest', home: 'baratheon' },
  // The Stormlands
  { id: 'storms_end', region: 'storm', seeds: [[1215, 1860]], structure: 'stronghold', port: true, supply: 1, home: 'baratheon' },
  { id: 'rainwood', region: 'storm', seeds: [[960, 1850]], terrain: 'forest' },
  { id: 'boneway', region: 'storm', seeds: [[790, 1900]], terrain: 'mountains' },
  // The Reach
  { id: 'reach', region: 'reach', seeds: [[660, 1700]], supply: 1, home: 'tyrell' },
  { id: 'highgarden', region: 'reach', seeds: [[450, 1810]], structure: 'stronghold', supply: 1, crown: 1, home: 'tyrell' },
  { id: 'dornish_marches', region: 'reach', seeds: [[620, 1935]], structure: 'castle', home: 'tyrell', terrain: 'hills' },
  { id: 'oldtown', region: 'reach', seeds: [[395, 2050]], structure: 'city', garrison: 3, port: true },
  { id: 'three_towers', region: 'reach', seeds: [[505, 2165]], port: true },
  // Dorne
  { id: 'starfall', region: 'dorne', seeds: [[680, 2195]], structure: 'castle', garrison: 1, port: true },
  { id: 'princes_pass', region: 'dorne', seeds: [[720, 2060]], terrain: 'mountains' },
  { id: 'yronwood', region: 'dorne', seeds: [[900, 2110]], structure: 'castle', home: 'martell', terrain: 'desert' },
  { id: 'salt_shore', region: 'dorne', seeds: [[1110, 2125]], port: true, home: 'martell', terrain: 'desert' },
  { id: 'sunspear', region: 'dorne', seeds: [[1330, 2110]], structure: 'stronghold', port: true, supply: 1, home: 'martell' },
  // Islands
  { id: 'pyke', region: 'islands', island: true, structure: 'stronghold', port: true, supply: 1, home: 'greyjoy' },
  { id: 'dragonstone', region: 'islands', island: true, structure: 'stronghold', port: true, crown: 1, home: 'baratheon' },
];

export const SEAS_DATA = [
  { id: 'bay_of_ice', seeds: [[150, 430], [170, 720]], label: [150, 560] },
  { id: 'shivering_sea', seeds: [[1460, 330], [1480, 720]], label: [1440, 560] },
  { id: 'the_bite', seeds: [[1030, 975]], label: [1035, 968] },
  { id: 'narrow_sea', seeds: [[1460, 1060], [1480, 1400]], label: [1470, 1240], rotate: -90 },
  { id: 'blackwater_bay', seeds: [[1080, 1570]], label: [1072, 1566] },
  { id: 'shipbreaker_bay', seeds: [[1420, 1690], [1365, 1880]], label: [1420, 1760] },
  { id: 'sea_of_dorne', seeds: [[900, 1990], [1120, 1985]], label: [1010, 1992] },
  { id: 'east_summer_sea', seeds: [[1510, 2170], [1250, 2330]], label: [1330, 2290] },
  { id: 'west_summer_sea', seeds: [[860, 2345], [470, 2345]], label: [720, 2330] },
  { id: 'redwyne_straits', seeds: [[230, 2090]], label: [210, 2150] },
  { id: 'sunset_sea', seeds: [[100, 1700], [110, 1950]], label: [120, 1800], rotate: -90 },
  { id: 'golden_sound', seeds: [[180, 1430]], label: [150, 1470] },
  { id: 'ironmans_bay', seeds: [[380, 1105], [110, 1080]], label: [330, 1110] },
];

// Corrections to the measured adjacency, as [a, b] pairs.
const ADJ_EXTRA = [];
const ADJ_CUT = [];

// --- Coastline ---------------------------------------------------------------

const MAINLAND_POINTS = [
  [396, 270], [575, 270], [750, 270], [925, 270], [1104, 270],
  [1165, 302], [1218, 362], [1300, 395], [1332, 452], [1272, 506], [1192, 532], [1162, 592],
  [1198, 652], [1252, 702], [1226, 772], [1150, 802], [1092, 852], [1040, 906],
  [962, 930], [892, 962], [872, 1012], [892, 1062],
  [962, 1078], [1042, 1052], [1122, 1022], [1202, 986], [1268, 1002], [1232, 1062], [1162, 1102],
  [1182, 1152], [1252, 1192], [1292, 1262], [1262, 1332], [1192, 1372], [1152, 1422], [1188, 1480],
  [1142, 1516], [1072, 1506], [1012, 1532], [986, 1582], [1022, 1626], [1092, 1642], [1162, 1652],
  [1217, 1702], [1192, 1762], [1252, 1802], [1322, 1832], [1302, 1906], [1212, 1936],
  [1082, 1946], [942, 1952], [832, 1972], [812, 2000], [872, 2026], [1002, 2036], [1142, 2032],
  [1292, 2046], [1422, 2080], [1452, 2132], [1382, 2172], [1232, 2192], [1062, 2216], [882, 2240],
  [722, 2236], [602, 2252], [512, 2216], [472, 2152], [422, 2092], [372, 2042], [322, 1982],
  [292, 1892], [322, 1802], [282, 1722], [257, 1622], [292, 1522], [267, 1442], [292, 1362],
  [347, 1292], [347, 1222], [402, 1162], [462, 1122], [502, 1092], [472, 1052],
  [402, 1042], [332, 1016], [362, 980], [462, 976], [562, 966], [582, 922],
  [522, 882], [422, 852], [342, 802], [292, 732], [302, 662], [392, 622], [397, 577], [302, 547],
  [272, 472], [302, 402], [352, 342], [362, 300],
];

const ISLAND_POINTS = {
  pyke: [[160, 1150], [215, 1122], [268, 1146], [282, 1200], [250, 1252], [196, 1268], [150, 1238], [138, 1190]],
  dragonstone: [[1262, 1522], [1312, 1512], [1348, 1542], [1342, 1592], [1298, 1616], [1256, 1598], [1240, 1558]],
};

const BEYOND_POINTS = [
  [396, 276], [362, 206], [322, 132], [282, 58], [262, -10], [1330, -10], [1300, 70],
  [1250, 140], [1180, 210], [1104, 276], [925, 276], [750, 276], [575, 276],
];

function hashNoise(k, seed) {
  return Math.sin(k * 0.93 + seed) * 0.55 + Math.sin(k * 2.31 + seed * 1.7) * 0.3 + Math.sin(k * 5.1 + seed * 0.4) * 0.15;
}

// Closed Catmull-Rom through the control points, then a little noise along
// the normal so the coast reads as drawn by hand. The Wall stays straight.
function smoothOutline(points, { sub = 6, amp = 3.6, seed = 1, straightY = null } = {}) {
  const n = points.length;
  const dense = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const flat = straightY != null && Math.abs(p1[1] - straightY) < 8 && Math.abs(p2[1] - straightY) < 8;
    for (let s = 0; s < sub; s += 1) {
      const t = s / sub;
      if (flat) {
        dense.push([p1[0] + (p2[0] - p1[0]) * t, p1[1], true]);
        continue;
      }
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      dense.push([x, y, false]);
    }
  }
  const m = dense.length;
  return dense.map(([x, y, flat], k) => {
    if (flat || (straightY != null && Math.abs(y - straightY) < 4)) return [x, y, true];
    const a = dense[(k - 1 + m) % m];
    const b = dense[(k + 1) % m];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const off = amp * hashNoise(k, seed);
    return [x + (dy / len) * off, y - (dx / len) * off, false];
  });
}

export function pathOf(points) {
  return `${points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}Z`;
}

const MAINLAND = smoothOutline(MAINLAND_POINTS, { seed: 2, straightY: WALL_Y });
const ISLANDS = Object.fromEntries(Object.entries(ISLAND_POINTS).map(([id, pts], i) => [id, smoothOutline(pts, { sub: 5, amp: 2.4, seed: 7 + i * 3 })]));
const BEYOND = smoothOutline(BEYOND_POINTS, { sub: 4, amp: 4, seed: 11, straightY: WALL_Y + 6 });

export const MAINLAND_PATH = pathOf(MAINLAND);
export const ISLAND_PATHS = Object.fromEntries(Object.entries(ISLANDS).map(([id, pts]) => [id, pathOf(pts)]));
export const BEYOND_PATH = pathOf(BEYOND);

// --- Land raster ---------------------------------------------------------------
// A coarse scanline fill answers "is this point land, and which mass" in
// constant time, which keeps every measurement below cheap.

const RES = 4;
const GW = Math.ceil(MAP_W / RES);
const GH = Math.ceil(MAP_H / RES);
const LAND = new Uint8Array(GW * GH); // 0 sea, 1 mainland, 2 beyond the Wall, 10+ islands
const ISLAND_CODES = {};

function fillPolygon(points, code) {
  for (let gy = 0; gy < GH; gy += 1) {
    const y = gy * RES + RES / 2;
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - RES / 2) / RES));
      const to = Math.min(GW - 1, Math.floor((xs[k + 1] - RES / 2) / RES));
      for (let gx = from; gx <= to; gx += 1) LAND[gy * GW + gx] = code;
    }
  }
}

fillPolygon(MAINLAND, 1);
fillPolygon(BEYOND, 2);
Object.keys(ISLANDS).forEach((id, i) => {
  ISLAND_CODES[id] = 10 + i;
  fillPolygon(ISLANDS[id], 10 + i);
});

function landAt(x, y) {
  const gx = Math.floor(x / RES);
  const gy = Math.floor(y / RES);
  if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return 0;
  return LAND[gy * GW + gx];
}

// --- Voronoi ---------------------------------------------------------------------

function clipHalfPlane(poly, a, b) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const side = (p) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function voronoi(sites) {
  const frame = [[-40, -40], [MAP_W + 40, -40], [MAP_W + 40, MAP_H + 40], [-40, MAP_H + 40]];
  const cells = sites.map((s, i) => {
    let poly = frame;
    for (let j = 0; j < sites.length && poly.length; j += 1) {
      if (j !== i) poly = clipHalfPlane(poly, s.p, sites[j].p);
    }
    return poly;
  });
  // Shared edges: an edge of cell i lies on the bisector with its neighbour.
  const edges = [];
  cells.forEach((poly, i) => {
    for (let k = 0; k < poly.length; k += 1) {
      const p = poly[k];
      const q = poly[(k + 1) % poly.length];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5) continue;
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const di = Math.hypot(mid[0] - sites[i].p[0], mid[1] - sites[i].p[1]);
      let best = -1;
      let bestGap = 0.75;
      sites.forEach((s, j) => {
        if (j === i) return;
        const gap = Math.abs(Math.hypot(mid[0] - s.p[0], mid[1] - s.p[1]) - di);
        if (gap < bestGap) { bestGap = gap; best = j; }
      });
      if (best > i) edges.push({ a: i, b: best, p, q });
    }
  });
  return { cells, edges };
}

function nearestSite(sites, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sites.length; i += 1) {
    const d = (sites[i].p[0] - x) ** 2 + (sites[i].p[1] - y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function insideConvex(poly, x, y) {
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

// --- Build -----------------------------------------------------------------------

const landSites = [];
TERRITORIES_DATA.forEach((t) => {
  if (!t.island) t.seeds.forEach((p) => landSites.push({ id: t.id, p }));
});
const seaSites = [];
SEAS_DATA.forEach((s) => s.seeds.forEach((p) => seaSites.push({ id: s.id, p })));

const landVor = voronoi(landSites);
const seaVor = voronoi(seaSites);

const adjacency = new Map();
const link = (a, b) => {
  if (a === b) return;
  if (!adjacency.has(a)) adjacency.set(a, new Set());
  if (!adjacency.has(b)) adjacency.set(b, new Set());
  adjacency.get(a).add(b);
  adjacency.get(b).add(a);
};

const sampleEdge = (e, test) => {
  let hits = 0;
  for (let k = 1; k < 16; k += 1) {
    const t = k / 16;
    if (test(e.p[0] + (e.q[0] - e.p[0]) * t, e.p[1] + (e.q[1] - e.p[1]) * t)) hits += 1;
  }
  return hits;
};

export const LAND_BORDERS = [];
landVor.edges.forEach((e) => {
  const A = landSites[e.a].id;
  const B = landSites[e.b].id;
  if (A === B) return;
  LAND_BORDERS.push([e.p, e.q]);
  if (sampleEdge(e, (x, y) => landAt(x, y) === 1) >= 3) link(A, B);
});

export const SEA_BORDERS = [];
seaVor.edges.forEach((e) => {
  const A = seaSites[e.a].id;
  const B = seaSites[e.b].id;
  if (A === B) return;
  SEA_BORDERS.push([e.p, e.q]);
  if (sampleEdge(e, (x, y) => landAt(x, y) === 0) >= 3) link(A, B);
});

// Coast: walk every outline and count, per (territory, sea zone), how much
// shoreline they share. The Wall is not a shore.
const coastCount = new Map();
const countCoast = (tid, x, y) => {
  const sea = seaSites[nearestSite(seaSites, x, y)].id;
  const key = `${tid}|${sea}`;
  coastCount.set(key, (coastCount.get(key) || 0) + 1);
};
MAINLAND.forEach(([x, y, flat]) => {
  if (flat || y < WALL_Y + 4) return;
  countCoast(landSites[nearestSite(landSites, x, y)].id, x, y);
});
Object.entries(ISLANDS).forEach(([id, pts]) => pts.forEach(([x, y]) => countCoast(id, x, y)));
coastCount.forEach((n, key) => {
  if (n >= 2) {
    const [tid, sea] = key.split('|');
    link(tid, sea);
  }
});

ADJ_EXTRA.forEach(([a, b]) => link(a, b));
ADJ_CUT.forEach(([a, b]) => {
  adjacency.get(a)?.delete(b);
  adjacency.get(b)?.delete(a);
});

const SEA_IDS = new Set(SEAS_DATA.map((s) => s.id));

// Anchor: the sampled interior point nearest the territory's centre of mass,
// so tokens never sit on a border or out at sea.
function anchorFor(t) {
  const pts = [];
  if (t.island) {
    const code = ISLAND_CODES[t.id];
    for (let gy = 0; gy < GH; gy += 2) {
      for (let gx = 0; gx < GW; gx += 2) {
        if (LAND[gy * GW + gx] === code) pts.push([gx * RES + RES / 2, gy * RES + RES / 2]);
      }
    }
  } else {
    landSites.forEach((s, i) => {
      if (s.id !== t.id) return;
      const poly = landVor.cells[i];
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      for (let y = Math.max(0, Math.min(...ys)); y < Math.min(MAP_H, Math.max(...ys)); y += 8) {
        for (let x = Math.max(0, Math.min(...xs)); x < Math.min(MAP_W, Math.max(...xs)); x += 8) {
          if (landAt(x, y) === 1 && insideConvex(poly, x, y)) pts.push([x, y]);
        }
      }
    });
  }
  if (!pts.length) return { anchor: t.seeds?.[0] || [0, 0], samples: pts };
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  // Prefer points with room around them: penalise distance to foreign ground.
  const owner = (x, y) => {
    const code = landAt(x, y);
    if (t.island) return code === ISLAND_CODES[t.id];
    return code === 1 && landSites[nearestSite(landSites, x, y)].id === t.id;
  };
  let best = pts[0];
  let bestScore = Infinity;
  pts.forEach(([x, y], i) => {
    if (i % 3) return;
    let room = 0;
    for (const r of [24, 48, 72]) {
      for (let a = 0; a < 8; a += 1) {
        if (owner(x + Math.cos((a * Math.PI) / 4) * r, y + Math.sin((a * Math.PI) / 4) * r)) room += 1;
      }
    }
    const score = Math.hypot(x - cx, y - cy) * 0.35 + (24 - room) * 14;
    if (score < bestScore) { bestScore = score; best = [x, y]; }
  });
  return { anchor: best, samples: pts, owner };
}

function decorFor(t, anchor, samples, owner) {
  if (!t.terrain || !samples.length) return [];
  const picks = [];
  const ordered = samples
    .map((p, i) => ({ p, h: Math.abs(Math.sin(i * 12.9898 + p[0] * 78.233 + p[1] * 3.17)) }))
    .sort((a, b) => a.h - b.h);
  for (const { p: [x, y] } of ordered) {
    if (picks.length >= 7) break;
    if (Math.hypot(x - anchor[0], y - anchor[1]) < 78) continue;
    if (![[18, 0], [-18, 0], [0, 18], [0, -18]].every(([dx, dy]) => owner(x + dx, y + dy))) continue;
    if (picks.some((q) => Math.hypot(q.x - x, q.y - y) < 46)) continue;
    picks.push({ x, y, type: t.terrain });
  }
  return picks;
}

export const TERRITORIES = TERRITORIES_DATA.map((t) => {
  const cells = t.island ? [ISLANDS[t.id]] : landSites.map((s, i) => (s.id === t.id ? landVor.cells[i] : null)).filter(Boolean);
  const { anchor, samples, owner } = anchorFor(t);
  const near = [...(adjacency.get(t.id) || [])];
  return {
    structure: null,
    port: false,
    supply: 0,
    crown: 0,
    garrison: 0,
    ...t,
    cells,
    paths: cells.map(pathOf),
    anchor,
    decor: owner ? decorFor(t, anchor, samples, owner) : [],
    neighbors: near.filter((id) => !SEA_IDS.has(id)).sort(),
    seas: near.filter((id) => SEA_IDS.has(id)).sort(),
  };
});

export const SEAS = SEAS_DATA.map((s) => {
  const near = [...(adjacency.get(s.id) || [])];
  const cells = seaSites.map((site, i) => (site.id === s.id ? seaVor.cells[i] : null)).filter(Boolean);
  return {
    rotate: 0,
    ...s,
    cells,
    paths: cells.map(pathOf),
    neighbors: near.filter((id) => SEA_IDS.has(id)).sort(),
    coasts: near.filter((id) => !SEA_IDS.has(id)).sort(),
  };
});

export const TERRITORY = Object.fromEntries(TERRITORIES.map((t) => [t.id, t]));
export const SEA = Object.fromEntries(SEAS.map((s) => [s.id, s]));

// The Iron Throne cartouche sits in the Narrow Sea, east of King's Landing.
export const THRONE_SPOT = [1395, 1470];
