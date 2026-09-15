// throneArt.jsx
// Drawn pieces of the Iron Throne game: house sigils, the glyphs printed on
// the map (fortifications, ports, supply, crowns, terrain), unit and card
// marks, the Iron Throne itself and the menu artwork. Everything is SVG
// with no external images; shapes are simple enough to stay readable when
// the map is zoomed out.

import { HOUSES } from './houses';

// --- Sigils (drawn in a 100 x 100 box) --------------------------------------------

function SigilShape({ house, ink }) {
  const stroke = {
    fill: 'none', stroke: ink, strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (house) {
    case 'stark': // a direwolf's head, howling to the left
      return (
        <g>
          <path d="M80 84 L74 60 L78 30 L64 42 L58 20 L50 40 L38 44 L18 56 L14 64 L30 66 L22 74 L42 74 L54 84 Z" fill={ink} />
          <circle cx="44" cy="52" r="3.2" fill="#0b0d0f" />
        </g>
      );
    case 'lannister': // a lion's head in its mane
      return (
        <g>
          <path d="M50 12 L57 24 L71 18 L70 32 L85 34 L77 46 L88 56 L74 61 L78 75 L63 72 L58 86 L50 76 L42 86 L37 72 L22 75 L26 61 L12 56 L23 46 L15 34 L30 32 L29 18 L43 24 Z" fill={ink} />
          <path d="M36 42 Q50 30 64 42 L62 62 Q50 74 38 62 Z" fill="#00000055" />
          <circle cx="43" cy="49" r="2.8" fill="#0b0d0f" />
          <circle cx="57" cy="49" r="2.8" fill="#0b0d0f" />
          <path d="M45 60 L50 64 L55 60" {...stroke} stroke="#0b0d0f" strokeWidth="3" />
        </g>
      );
    case 'baratheon': // a crowned stag
      return (
        <g>
          <path d="M38 46 L50 82 L62 46 Q50 38 38 46 Z" fill={ink} />
          <path d="M40 44 L30 30 L20 26 M30 30 L28 16 M34 36 L18 38" {...stroke} />
          <path d="M60 44 L70 30 L80 26 M70 30 L72 16 M66 36 L82 38" {...stroke} />
          <circle cx="45" cy="54" r="2.6" fill="#f3e3b0" />
          <circle cx="55" cy="54" r="2.6" fill="#f3e3b0" />
        </g>
      );
    case 'greyjoy': // the kraken
      return (
        <g>
          <ellipse cx="50" cy="32" rx="18" ry="16" fill={ink} />
          <path d="M36 42 Q24 60 30 82 M44 46 Q40 66 44 88 M56 46 Q60 66 56 88 M64 42 Q76 60 70 82 M32 38 Q14 44 12 62 M68 38 Q86 44 88 62" {...stroke} strokeWidth="5.5" />
          <circle cx="43" cy="32" r="3" fill="#0b0d0f" />
          <circle cx="57" cy="32" r="3" fill="#0b0d0f" />
        </g>
      );
    case 'tyrell': // the golden rose
      return (
        <g>
          <path d="M50 58 L50 90 M50 74 Q36 70 30 78 Q40 84 50 78 M50 68 Q64 62 70 70 Q60 76 50 72" {...stroke} strokeWidth="4.5" />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="50" cy="26" rx="11" ry="16" fill={ink} transform={`rotate(${a} 50 40)`} />
          ))}
          <circle cx="50" cy="40" r="9" fill="#00000040" />
          <circle cx="50" cy="40" r="4.5" fill={ink} />
        </g>
      );
    case 'martell': // the sun pierced by a spear
      return (
        <g>
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d="M50 10 L54 26 L46 26 Z" fill={ink} transform={`rotate(${i * 22.5} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="21" fill={ink} />
          <path d="M14 86 L86 14" stroke="#0b0d0f" strokeWidth="5" strokeLinecap="round" />
          <path d="M86 14 L74 18 L82 26 Z" fill="#0b0d0f" />
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="30" fill={ink} />;
  }
}

// A sigil on its field, for use inside the map's SVG. (x, y) is the centre.
export function SigilMark({
  house, x = 0, y = 0, size = 40, shape = 'shield', stroke = '#0c0b09',
}) {
  const h = HOUSES[house];
  if (!h) return null;
  const s = size / 100;
  const field = shape === 'round'
    ? <circle cx="50" cy="50" r="48" fill={h.color} stroke={stroke} strokeWidth="5" />
    : <path d="M8 6 H92 V48 Q92 82 50 96 Q8 82 8 48 Z" fill={h.color} stroke={stroke} strokeWidth="5" />;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`}>
      {field}
      <path d="M14 12 H86 V46 Q86 76 50 88" fill="none" stroke="#ffffff22" strokeWidth="3" />
      <g transform="translate(18 16) scale(0.64)">
        <SigilShape house={house} ink={h.ink} />
      </g>
    </g>
  );
}

// The same sigil as a standalone element for the panels.
export function SigilBadge({ house, className = 'h-10 w-10', shape = 'shield' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <SigilMark house={house} x={50} y={50} size={100} shape={shape} />
    </svg>
  );
}

// --- Map glyphs (centred on 0,0, about 40 units wide) ------------------------------

const DARK = '#1b140c';
const LIGHT = '#efe2c0';

export function StructureGlyph({ type }) {
  const body = { fill: '#3a3128', stroke: DARK, strokeWidth: 2.2, strokeLinejoin: 'round' };
  const hi = { fill: 'none', stroke: '#b8a47a', strokeWidth: 1.2, opacity: 0.8 };
  if (type === 'stronghold' || type === 'capital') {
    return (
      <g>
        <path d="M-22 16 V-6 H-14 V-12 H-10 V-8 H-6 V-12 H-2 V-8 H2 V-12 H6 V-8 H10 V-12 H14 V-6 H22 V16 Z" {...body} />
        <path d="M-22 -6 V-20 H-18 V-16 H-15 V-20 H-11 V16 M22 -6 V-20 H18 V-16 H15 V-20 H11 V16" {...body} />
        <path d="M-4 16 V6 Q0 1 4 6 V16" fill={DARK} />
        <path d="M-19 -4 V12 M19 -4 V12" {...hi} />
        {type === 'capital' && (
          <path d="M-12 -26 L-8 -34 L-3 -27 L0 -36 L3 -27 L8 -34 L12 -26 Z" fill="#d8b04a" stroke={DARK} strokeWidth="1.6" />
        )}
      </g>
    );
  }
  if (type === 'castle') {
    return (
      <g>
        <path d="M-12 16 V-12 H-8 V-8 H-4 V-12 H0 V-8 H4 V-12 H8 V-8 H12 V16 Z" {...body} />
        <path d="M-3 16 V7 Q0 3 3 7 V16" fill={DARK} />
        <rect x="-2" y="-3" width="4" height="5" fill={DARK} />
        <path d="M-9 -6 V12" {...hi} />
      </g>
    );
  }
  if (type === 'city') {
    return (
      <g>
        <path d="M-20 16 V2 L-14 -4 L-8 2 V16 Z M-8 16 V-6 L0 -18 L8 -6 V16 Z M8 16 V0 L14 -6 L20 0 V16 Z" {...body} />
        <path d="M0 -18 V-26" stroke={DARK} strokeWidth="2" />
        <path d="M0 -26 L7 -23 L0 -20" fill="#8c2a22" />
        <rect x="-2" y="4" width="4" height="12" fill={DARK} />
      </g>
    );
  }
  if (type === 'fort') {
    return (
      <g>
        {[-12, -6, 0, 6, 12].map((x) => (
          <path key={x} d={`M${x - 2.6} 14 V-6 L${x} -11 L${x + 2.6} -6 V14 Z`} fill="#6b4a2b" stroke={DARK} strokeWidth="1.6" />
        ))}
        <path d="M-15 2 H15" stroke={DARK} strokeWidth="2" />
      </g>
    );
  }
  return null;
}

export function PortGlyph() {
  return (
    <g fill="none" stroke={DARK} strokeWidth="2.4" strokeLinecap="round">
      <circle cx="0" cy="-8" r="3" />
      <path d="M0 -5 V9 M-6 -1 H6 M-9 3 Q-8 10 0 10 Q8 10 9 3" />
    </g>
  );
}

export function SupplyGlyph() {
  return (
    <g>
      <path d="M-7 -9 Q-9 0 -7 9 H7 Q9 0 7 -9 Z" fill="#8a5b2e" stroke={DARK} strokeWidth="1.8" />
      <path d="M-8 -4 H8 M-8 4 H8" stroke={DARK} strokeWidth="1.6" />
    </g>
  );
}

export function CrownGlyph() {
  return <path d="M-9 6 L-10 -6 L-4 -1 L0 -9 L4 -1 L10 -6 L9 6 Z" fill="#d8b04a" stroke={DARK} strokeWidth="1.8" strokeLinejoin="round" />;
}

export function TerrainGlyph({ type, x, y }) {
  const ink = { fill: 'none', stroke: '#4a3a24', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.5 };
  const g = (children) => <g transform={`translate(${x} ${y})`}>{children}</g>;
  if (type === 'mountains') return g(<><path d="M-16 8 L-6 -8 L2 4 L8 -4 L18 8" {...ink} /><path d="M-6 -8 L-3 -2" {...ink} /></>);
  if (type === 'forest') return g(<><path d="M-8 8 L-8 4 M-8 4 L-13 4 L-8 -8 L-3 4 Z M6 10 V5 M6 5 L0 5 L6 -9 L12 5 Z" {...ink} /></>);
  if (type === 'swamp') return g(<path d="M-12 6 H12 M-6 6 V-4 M0 6 V-8 M6 6 V-3 M-10 10 H4" {...ink} />);
  if (type === 'hills') return g(<path d="M-16 6 Q-8 -6 0 6 Q8 -4 16 6" {...ink} />);
  if (type === 'desert') return g(<path d="M-16 4 Q-8 -2 0 4 T16 4 M-10 10 Q-4 6 2 10" {...ink} />);
  if (type === 'snow') return g(<path d="M0 -9 V9 M-8 -4.5 L8 4.5 M-8 4.5 L8 -4.5" {...ink} stroke="#5d6a74" />);
  return null;
}

export function FootmanMark({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3 L7 21" />
      <path d="M16 3 L19 2 L18 5" />
      <path d="M6 9 H14 V14 Q14 18 10 20 Q6 18 6 14 Z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}

export function KnightMark({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M8 21 H18 V19 Q18 14 15 11 L17 8 Q16 4 11 3 L10 5 L7 7 L5 11 L7 12 L10 10 Q10 13 8 15 Z" />
    </svg>
  );
}

// Glyphs for resources shown in the panels.
export function ResourceMark({ kind, className = 'h-4 w-4' }) {
  const common = {
    viewBox: '0 0 24 24', className, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  if (kind === 'gold') return <svg {...common}><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7 V12 Q12 17 19 12 V7 M5 12 V17 Q12 22 19 17 V12" /></svg>;
  if (kind === 'influence') return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M8 13 L10 9 L12 12 L14 9 L16 13 Z" fill="currentColor" /></svg>;
  if (kind === 'commands') return <svg {...common}><path d="M6 21 V4 M6 4 H17 L14 8 L17 12 H6" /></svg>;
  if (kind === 'supply') return <svg {...common}><path d="M7 3 Q5 12 7 21 H17 Q19 12 17 3 Z M6 8 H18 M6 16 H18" /></svg>;
  if (kind === 'power') return <svg {...common}><path d="M4 18 L3 7 L8 11 L12 4 L16 11 L21 7 L20 18 Z" /></svg>;
  if (kind === 'army') return <svg {...common}><path d="M5 19 L19 5 M15 5 H19 V9 M19 19 L5 5 M9 5 H5 V9" /></svg>;
  if (kind === 'cards') return <svg {...common}><rect x="4" y="5" width="11" height="15" rx="2" /><path d="M9 3 H18 A2 2 0 0 1 20 5 V17" /></svg>;
  if (kind === 'dice') return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
  return null;
}

// --- Card and event marks --------------------------------------------------------

const CARD_PATHS = {
  surprise: 'M4 20 L14 10 M12 6 L18 4 L16 10 M3 14 L8 19',
  walls: 'M4 20 V8 H7 V11 H10 V8 H14 V11 H17 V8 H20 V20 Z',
  march: 'M4 16 Q8 10 12 16 T20 16 M6 20 H18',
  raven: 'M3 12 Q8 6 14 9 L21 7 L17 12 Q14 17 8 16 Z',
  mercs: 'M12 3 L19 6 V12 Q19 18 12 21 Q5 18 5 12 V6 Z M9 12 H15',
  sabotage: 'M12 3 Q16 8 14 11 Q18 12 17 17 Q15 21 12 21 Q7 21 7 16 Q7 12 10 10 Q9 6 12 3 Z',
  treasure: 'M4 10 H20 V20 H4 Z M4 10 L6 5 H18 L20 10 M10 14 H14',
};

const EVENT_PATHS = {
  winter: 'M12 3 V21 M4 7.5 L20 16.5 M4 16.5 L20 7.5 M9 4 L12 7 L15 4 M9 20 L12 17 L15 20',
  harvest: 'M12 21 V8 M12 8 Q8 6 8 3 Q12 4 12 8 Q12 4 16 3 Q16 6 12 8 M12 13 Q8 11 7 8 M12 13 Q16 11 17 8',
  wildlings: 'M5 20 L15 4 M13 4 H19 V10 Q15 12 13 8 M3 14 L9 18',
  feast: 'M7 3 H17 L16 10 Q12 14 8 10 Z M12 13 V20 M8 20 H16',
  storm: 'M3 9 Q7 5 11 9 T19 9 M3 15 Q7 11 11 15 T19 15 M13 3 L10 8 H14 L11 13',
  plague: 'M12 4 A6 6 0 1 1 11.99 4 M9 9 H9.01 M15 9 H15.01 M10 14 H14 M9 17 L9 20 M12 17 V21 M15 17 V20',
  muster: 'M6 21 V3 M6 4 Q12 1 12 6 Q12 10 18 7 V14 Q12 17 12 13 Q12 9 6 12',
  council: 'M4 20 V11 L12 5 L20 11 V20 M9 20 V14 H15 V20',
  calm: 'M16 4 A8 8 0 1 0 20 16 A6 6 0 0 1 16 4',
  tourney: 'M3 21 L17 7 M15 5 L21 3 L19 9 M8 12 L12 16',
};

export function CardMark({ card, className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={CARD_PATHS[card] || CARD_PATHS.walls} />
    </svg>
  );
}

export function EventMark({ event, className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={EVENT_PATHS[event] || EVENT_PATHS.calm} />
    </svg>
  );
}

// --- The Iron Throne ---------------------------------------------------------------

// A throne of melted swords in a 200 x 220 box.
export function IronThroneShape({ id = 'it' }) {
  const blades = Array.from({ length: 17 }, (_, i) => {
    const a = -52 + (i * 104) / 16;
    const len = 118 - Math.abs(a) * 0.9 + ((i * 37) % 11);
    return { a, len };
  });
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-iron`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9aa1a6" />
          <stop offset="45%" stopColor="#4c5257" />
          <stop offset="100%" stopColor="#1c1f22" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor="#c9982f" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#c9982f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="130" rx="96" ry="92" fill={`url(#${id}-glow)`} />
      <g transform="translate(100 132)">
        {blades.map(({ a, len }) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d={`M-3.2 0 L-2.2 ${-len} L0 ${-len - 9} L2.2 ${-len} L3.2 0 Z`} fill={`url(#${id}-iron)`} stroke="#0d0e10" strokeWidth="1" />
            <path d={`M-9 ${-len * 0.28} H9`} stroke="#6e5a2c" strokeWidth="3" strokeLinecap="round" />
          </g>
        ))}
      </g>
      <path d="M58 104 H142 L150 150 H50 Z" fill="#2b2f33" stroke="#0d0e10" strokeWidth="2.5" />
      <path d="M64 110 H136 L140 140 H60 Z" fill="#5a2a22" stroke="#0d0e10" strokeWidth="1.5" />
      <path d="M44 150 H156 V164 H44 Z M34 164 H166 V180 H34 Z M22 180 H178 V198 H22 Z" fill="#3b3f43" stroke="#0d0e10" strokeWidth="2" />
      <path d="M46 153 H154 M36 167 H164 M24 183 H176" stroke="#8b9196" strokeWidth="1.2" opacity="0.6" />
      {[-40, -20, 0, 20, 40].map((x) => (
        <path key={x} d={`M${100 + x} 150 l-3 -18 l3 -6 l3 6 z`} fill={`url(#${id}-iron)`} stroke="#0d0e10" strokeWidth="0.8" />
      ))}
    </g>
  );
}

export function IronThroneBadge({ className = 'h-12 w-12' }) {
  return (
    <svg viewBox="0 0 200 210" className={className} aria-hidden="true">
      <IronThroneShape id="itb" />
    </svg>
  );
}

// Menu art for the game card: the throne on an old map of Westeros.
export function ThroneArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="throne-menu-bg" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#3a3226" />
          <stop offset="100%" stopColor="#0d0c0a" />
        </radialGradient>
        <linearGradient id="throne-menu-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d2a31" />
          <stop offset="100%" stopColor="#0c1418" />
        </linearGradient>
      </defs>
      <rect width="120" height="80" fill="url(#throne-menu-sea)" />
      <path d="M40 -2 H78 L80 10 L86 18 L78 26 L70 30 L74 40 L84 46 L80 56 L70 60 L76 70 L96 74 L98 82 H34 L30 70 L26 58 L30 46 L26 34 L34 24 L30 12 Z" fill="#b59f74" opacity="0.9" />
      <path d="M40 -2 H78 L80 10 L86 18 L78 26 L70 30 L74 40 L84 46 L80 56 L70 60 L76 70 L96 74 L98 82 H34 L30 70 L26 58 L30 46 L26 34 L34 24 L30 12 Z" fill="none" stroke="#2b2116" strokeWidth="0.8" />
      <path d="M32 22 L58 26 L78 24 M28 44 L50 40 L74 44 M32 62 L54 58 L72 64" stroke="#5b4a30" strokeWidth="0.6" strokeDasharray="1.6 1.4" fill="none" />
      <rect width="120" height="80" fill="url(#throne-menu-bg)" opacity="0.55" />
      <g transform="translate(38 10) scale(0.22)">
        <IronThroneShape id="itm" />
      </g>
      <g opacity="0.95">
        <SigilMark house="stark" x={16} y={16} size={16} />
        <SigilMark house="lannister" x={104} y={16} size={16} />
        <SigilMark house="tyrell" x={16} y={64} size={16} />
        <SigilMark house="martell" x={104} y={64} size={16} />
      </g>
    </svg>
  );
}
