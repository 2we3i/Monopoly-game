// catanArt.jsx
// Every picture Catan draws: resource icons, terrain illustrations, the
// pieces, dice and the main-menu artwork. All plain SVG with fixed
// colours, so the board reads the same on every screen and in both
// languages - a hex is recognisable by its picture before its label.

export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export const RESOURCE_COLORS = {
  wood: '#3f8a47',
  brick: '#c8653a',
  sheep: '#8cc862',
  wheat: '#e2b53c',
  ore: '#9097a3',
};

export const TERRAIN_STYLE = {
  forest: { fill: '#3b7a3d', deep: '#1f5130', light: '#5a9c4f', resource: 'wood' },
  hills: { fill: '#c76b3e', deep: '#9a4a25', light: '#e08d5c', resource: 'brick' },
  pasture: { fill: '#8fc467', deep: '#5f9a44', light: '#b3dc8a', resource: 'sheep' },
  fields: { fill: '#e2bb45', deep: '#b98a1f', light: '#f2d77a', resource: 'wheat' },
  mountains: { fill: '#8b8f98', deep: '#5d616b', light: '#b6bac2', resource: 'ore' },
  desert: { fill: '#e3cf9c', deep: '#c2a86a', light: '#f1e3bd', resource: null },
};

export const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'];

// Player colours: the four classic piece colours first, then the four the
// big islands need, in the order the server hands out seats. Each has an
// outline that keeps it visible on every terrain (white pieces get a dark
// edge) and a lighter shade for a name on a dark panel. Eight pieces have
// to be told apart at a glance on a crowded board, so no two of them sit
// near each other in hue.
export const PLAYER_COLORS = {
  red: { fill: '#d9412f', edge: '#5e140c', text: '#ff8a7a' },
  blue: { fill: '#2f6fd6', edge: '#0d2a5c', text: '#8db8ff' },
  orange: { fill: '#f08c1c', edge: '#6b3504', text: '#ffba6b' },
  white: { fill: '#f4f1e8', edge: '#2b2822', text: '#f4f1e8' },
  green: { fill: '#2e9e52', edge: '#0d3d1e', text: '#7fe0a0' },
  purple: { fill: '#8a4fd0', edge: '#31135c', text: '#c9a4ff' },
  teal: { fill: '#17a2a2', edge: '#05393c', text: '#79e3e3' },
  pink: { fill: '#e2569c', edge: '#65123c', text: '#ffa5cd' },
};

// The seats in the order the server fills them, so a lobby can show a
// player's colour before the game has dealt one.
export const SEAT_ORDER = ['red', 'blue', 'orange', 'white', 'green', 'purple', 'teal', 'pink'];

export function playerColor(color) {
  return PLAYER_COLORS[color] || { fill: '#9aa0a6', edge: '#2b2822', text: '#cfd3d6' };
}

// --- resource icons (24x24) --------------------------------------------

function WoodGlyph() {
  return (
    <>
      <rect x="10.6" y="16" width="2.8" height="5.5" rx="0.8" fill="#6b4423" />
      <path d="M12 2.5l5.6 7.2h-2.8l4.2 5.6H5l4.2-5.6H6.4z" fill="#2f7a3a" />
      <path d="M12 2.5l5.6 7.2h-2.8l4.2 5.6H12z" fill="#236130" />
    </>
  );
}

function BrickGlyph() {
  return (
    <g stroke="#7a3316" strokeWidth="0.9">
      <rect x="2.5" y="5" width="9" height="4.4" rx="0.8" fill="#d06a3c" />
      <rect x="12.5" y="5" width="9" height="4.4" rx="0.8" fill="#bd5a2f" />
      <rect x="6.5" y="10.4" width="11" height="4.4" rx="0.8" fill="#c8633a" />
      <rect x="2.5" y="15.8" width="9" height="4.4" rx="0.8" fill="#bd5a2f" />
      <rect x="12.5" y="15.8" width="9" height="4.4" rx="0.8" fill="#d06a3c" />
    </g>
  );
}

function SheepGlyph() {
  return (
    <>
      <rect x="7" y="15" width="1.8" height="5" rx="0.8" fill="#3b3a36" />
      <rect x="14" y="15" width="1.8" height="5" rx="0.8" fill="#3b3a36" />
      <g fill="#f6f3ea" stroke="#b9b2a0" strokeWidth="0.7">
        <circle cx="8" cy="11.5" r="3.6" />
        <circle cx="12" cy="9.5" r="3.8" />
        <circle cx="15.5" cy="12" r="3.4" />
        <circle cx="11" cy="14" r="3.4" />
      </g>
      <ellipse cx="19" cy="10.5" rx="2.6" ry="2.1" fill="#3b3a36" />
      <circle cx="19.8" cy="10" r="0.45" fill="#fff" />
    </>
  );
}

function WheatGlyph() {
  return (
    <>
      <path d="M12 22V6" stroke="#9a7318" strokeWidth="1.3" strokeLinecap="round" />
      <g fill="#e2b53c" stroke="#a67b17" strokeWidth="0.6">
        <ellipse cx="12" cy="4.5" rx="1.5" ry="2.4" />
        {[7.5, 11, 14.5].map((y) => (
          <g key={y}>
            <ellipse cx="9.6" cy={y} rx="1.4" ry="2.3" transform={`rotate(-35 9.6 ${y})`} />
            <ellipse cx="14.4" cy={y} rx="1.4" ry="2.3" transform={`rotate(35 14.4 ${y})`} />
          </g>
        ))}
      </g>
    </>
  );
}

function OreGlyph() {
  return (
    <>
      <path d="M3 19l4.5-9 4 3.5L15 6l6 13z" fill="#7d838e" stroke="#474c55" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M15 6l2.2 5-3 1.2L11.5 13.5z" fill="#a9b0bb" />
      <path d="M7.5 10l1.6 4.5L11.5 13.5z" fill="#9ca3ae" />
      <path d="M13 15.5l2.5-1.5 2.2 2.4-2.6 1.4z" fill="#c9d4e3" stroke="#6f7c90" strokeWidth="0.5" />
    </>
  );
}

const GLYPHS = {
  wood: WoodGlyph, brick: BrickGlyph, sheep: SheepGlyph, wheat: WheatGlyph, ore: OreGlyph,
};

export function ResourceIcon({ resource, className = 'h-5 w-5', title }) {
  const Glyph = GLYPHS[resource];
  if (!Glyph) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
      {title && <title>{title}</title>}
      <Glyph />
    </svg>
  );
}

// The same glyph inside an existing SVG, centred on (x, y).
export function ResourceGlyph({
  resource, x = 0, y = 0, size = 24,
}) {
  const Glyph = GLYPHS[resource];
  if (!Glyph) return null;
  const s = size / 24;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`}>
      <Glyph />
    </g>
  );
}

// --- terrain illustrations ---------------------------------------------

// Drawn around the middle of a hex whose corners are `r` from its centre,
// leaving the centre free for the number token.
export function TerrainDecor({ terrain, r = 60 }) {
  const k = r / 60;
  const style = TERRAIN_STYLE[terrain];
  if (!style) return null;
  const at = (x, y) => `translate(${x * k} ${y * k}) scale(${k})`;

  if (terrain === 'forest') {
    const trees = [[-30, -8, 1], [-18, 22, 1.1], [26, -10, 1], [16, 24, 1.05], [-4, 36, 0.8], [36, 14, 0.8], [-38, 14, 0.8], [0, -40, 0.75]];
    return (
      <g>
        {trees.map(([x, y, s]) => (
          <g key={`${x},${y}`} transform={`${at(x, y)} scale(${s})`}>
            <rect x="-1.6" y="4" width="3.2" height="6" fill="#5b3a1e" />
            <path d="M0 -14l8 10h-4l6 8H-10l6-8h-4z" fill={style.deep} />
            <path d="M0 -14l8 10h-4l6 8H0z" fill="#174226" opacity="0.6" />
          </g>
        ))}
      </g>
    );
  }
  if (terrain === 'hills') {
    const rows = [[-28, -16], [22, -16], [-36, 16], [30, 14], [-10, 34], [0, -36]];
    return (
      <g>
        <path d={`M${-50 * k} ${30 * k} Q${-20 * k} ${6 * k} ${8 * k} ${28 * k} T${52 * k} ${22 * k}`} fill="none" stroke={style.deep} strokeWidth={3 * k} opacity="0.5" />
        {rows.map(([x, y]) => (
          <g key={`${x},${y}`} transform={at(x, y)} stroke="#8a3f1d" strokeWidth="0.8">
            <rect x="-9" y="-5" width="8.5" height="4.5" fill={style.light} />
            <rect x="0.5" y="-5" width="8.5" height="4.5" fill={style.deep} />
            <rect x="-4.5" y="0.5" width="9" height="4.5" fill={style.light} />
          </g>
        ))}
      </g>
    );
  }
  if (terrain === 'pasture') {
    const sheep = [[-28, -10], [26, 18], [-14, 30], [30, -16]];
    const tufts = [[-38, 12], [8, -38], [38, 4], [0, 40], [-30, -30], [18, 34]];
    return (
      <g>
        {tufts.map(([x, y]) => (
          <path key={`t${x},${y}`} transform={at(x, y)} d="M-5 3l2-6 1.5 6 2-8 1.5 8 2-5L6 3z" fill={style.deep} opacity="0.8" />
        ))}
        {sheep.map(([x, y]) => (
          <g key={`s${x},${y}`} transform={at(x, y)}>
            <rect x="-4" y="2" width="1.5" height="4" fill="#3b3a36" />
            <rect x="2" y="2" width="1.5" height="4" fill="#3b3a36" />
            <ellipse cx="0" cy="0" rx="7" ry="4.8" fill="#f7f4ea" stroke="#bdb6a4" strokeWidth="0.6" />
            <ellipse cx="7" cy="-1.5" rx="2.6" ry="2.1" fill="#3b3a36" />
          </g>
        ))}
      </g>
    );
  }
  if (terrain === 'fields') {
    const stalks = [-36, -26, -16, 16, 26, 36];
    return (
      <g stroke={style.deep} strokeLinecap="round">
        {stalks.map((x) => (
          <g key={x} transform={at(x, 6)}>
            <path d="M0 24V-18" strokeWidth="1.4" />
            {[-14, -7, 0, 7].map((y) => (
              <g key={y} fill="#f3d67c" strokeWidth="0.6">
                <ellipse cx="-2.6" cy={y} rx="1.8" ry="3.2" transform={`rotate(-30 -2.6 ${y})`} />
                <ellipse cx="2.6" cy={y} rx="1.8" ry="3.2" transform={`rotate(30 2.6 ${y})`} />
              </g>
            ))}
          </g>
        ))}
        <path d={`M${-24 * k} ${-38 * k}h${48 * k}`} strokeWidth={2 * k} opacity="0.45" />
        <path d={`M${-22 * k} ${40 * k}h${44 * k}`} strokeWidth={2 * k} opacity="0.45" />
      </g>
    );
  }
  if (terrain === 'mountains') {
    const peaks = [[-26, 8, 1.1], [24, 6, 1.2], [0, 34, 0.85], [-2, -30, 0.9]];
    return (
      <g>
        {peaks.map(([x, y, s]) => (
          <g key={`${x},${y}`} transform={`${at(x, y)} scale(${s})`}>
            <path d="M-16 10L-2 -14 4 -4 8 -9 18 10z" fill={style.deep} />
            <path d="M-2 -14L4 -4 8 -9 18 10H4z" fill="#4a4e57" opacity="0.7" />
            <path d="M-2 -14l-5 8 3 -1 2 2 3-3z" fill="#f3f5f8" />
          </g>
        ))}
      </g>
    );
  }
  // desert
  return (
    <g>
      <path d={`M${-48 * k} ${20 * k} Q${-24 * k} ${6 * k} 0 ${20 * k} T${48 * k} ${18 * k}`} fill="none" stroke={style.deep} strokeWidth={2.4 * k} />
      <path d={`M${-40 * k} ${36 * k} Q${-16 * k} ${24 * k} ${10 * k} ${36 * k} T${44 * k} ${34 * k}`} fill="none" stroke={style.deep} strokeWidth={2 * k} opacity="0.7" />
      <g transform={at(-26, -14)}>
        <path d="M0 14V-12a3 3 0 016 0V14z" fill="#6e9a4a" />
        <path d="M0 0h-5a2.5 2.5 0 01-2.5-2.5V-7a2 2 0 014 0v3H0zM6 4h4V-2a2 2 0 014 0v4a4 4 0 01-4 4H6z" fill="#6e9a4a" />
      </g>
      <circle cx={28 * k} cy={-26 * k} r={7 * k} fill="#f4d77a" opacity="0.9" />
    </g>
  );
}

// --- pieces --------------------------------------------------------------

export function SettlementShape({ color, scale = 1 }) {
  const c = playerColor(color);
  return (
    <g transform={`scale(${scale})`}>
      <path d="M-9 9V-2L0-11 9-2V9z" fill={c.fill} stroke={c.edge} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M0-11L9-2V9H0z" fill="#000" opacity="0.14" />
    </g>
  );
}

export function CityShape({ color, scale = 1 }) {
  const c = playerColor(color);
  return (
    <g transform={`scale(${scale})`}>
      <path d="M-14 10V-3L-7-11 0-3V-1H14V10z" fill={c.fill} stroke={c.edge} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M0-1H14V10H0z" fill="#000" opacity="0.14" />
      <rect x="-9" y="1" width="4" height="4" rx="0.6" fill={c.edge} opacity="0.55" />
      <rect x="5" y="3" width="4" height="4" rx="0.6" fill={c.edge} opacity="0.55" />
    </g>
  );
}

export function RobberShape({ scale = 1 }) {
  return (
    <g transform={`scale(${scale})`}>
      <ellipse cx="0" cy="16" rx="11" ry="3.5" fill="#000" opacity="0.28" />
      <path d="M-9 15c0-9 3-13 5-15a7.5 7.5 0 118 0c2 2 5 6 5 15z" fill="#2c2b31" stroke="#0b0b0d" strokeWidth="1.6" />
      <circle cx="0" cy="-8" r="7.5" fill="#2c2b31" stroke="#0b0b0d" strokeWidth="1.6" />
      <ellipse cx="-2.5" cy="-10.5" rx="2.3" ry="1.6" fill="#fff" opacity="0.22" />
    </g>
  );
}

// --- dice ----------------------------------------------------------------

const PIPS = {
  1: [[12, 12]],
  2: [[7, 7], [17, 17]],
  3: [[7, 7], [12, 12], [17, 17]],
  4: [[7, 7], [17, 7], [7, 17], [17, 17]],
  5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
  6: [[7, 6.5], [17, 6.5], [7, 12], [17, 12], [7, 17.5], [17, 17.5]],
};

export function DieFace({ value, className = 'h-10 w-10', red = false }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="5" fill={red ? '#c8372d' : '#faf6ec'} stroke={red ? '#7a1b14' : '#b9ad92'} strokeWidth="1" />
      {(PIPS[value] || []).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="2.1" fill={red ? '#fff3e8' : '#1f2417'} />
      ))}
    </svg>
  );
}

// How many of the 36 dice outcomes produce a number - the dots under a token.
export function pipCount(number) {
  if (!number) return 0;
  return 6 - Math.abs(7 - number);
}

// --- main menu artwork ------------------------------------------------------

export function CatanArt() {
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  const w = 11 * Math.sqrt(3);
  const tiles = [
    [60 - w, 40 - 16.5, 'fields'], [60, 40 - 16.5, 'forest'], [60 + w, 40 - 16.5, 'hills'],
    [60 - 1.5 * w, 40, 'pasture'], [60 - 0.5 * w, 40, 'mountains'], [60 + 0.5 * w, 40, 'fields'], [60 + 1.5 * w, 40, 'forest'],
    [60 - w, 40 + 16.5, 'hills'], [60, 40 + 16.5, 'pasture'], [60 + w, 40 + 16.5, 'desert'],
  ];
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="catan-sea" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#3b8fc0" />
          <stop offset="100%" stopColor="#0f3a5c" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" rx="6" fill="url(#catan-sea)" />
      {[[16, 12], [100, 14], [12, 66], [104, 66]].map(([x, y]) => (
        <path key={`${x},${y}`} d={`M${x - 6} ${y}q3-2.5 6 0t6 0`} fill="none" stroke="#9fd3f0" strokeWidth="1" opacity="0.5" />
      ))}
      {tiles.map(([cx, cy, terrain]) => (
        <polygon key={`${cx},${cy}`} points={hex(cx, cy, 11)} fill={TERRAIN_STYLE[terrain].fill} stroke="#f1e3bd" strokeWidth="1.2" />
      ))}
      <circle cx={60 - 0.5 * w} cy="40" r="4.2" fill="#f5ecd6" stroke="#b9a57a" strokeWidth="0.6" />
      <text x={60 - 0.5 * w} y="41.8" textAnchor="middle" fontSize="5" fontWeight="900" fill="#b3261e">8</text>
      <circle cx={60 + 0.5 * w} cy="40" r="4.2" fill="#f5ecd6" stroke="#b9a57a" strokeWidth="0.6" />
      <text x={60 + 0.5 * w} y="41.8" textAnchor="middle" fontSize="5" fontWeight="900" fill="#1f2417">5</text>
      <g transform={`translate(${60 - 0.5 * w} ${40 - 11}) scale(0.42)`}><SettlementShape color="red" /></g>
      <g transform={`translate(${60 + w} ${40 - 5.5}) scale(0.42)`}><CityShape color="blue" /></g>
      <line x1={60 - w} y1={40 + 5.5} x2={60 - 0.5 * w} y2={40 + 11} stroke="#5e140c" strokeWidth="3.2" strokeLinecap="round" />
      <line x1={60 - w} y1={40 + 5.5} x2={60 - 0.5 * w} y2={40 + 11} stroke="#d9412f" strokeWidth="2" strokeLinecap="round" />
      <g transform={`translate(${60 + w} ${40 + 14}) scale(0.38)`}><RobberShape /></g>
    </svg>
  );
}
