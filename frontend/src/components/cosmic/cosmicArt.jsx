// cosmicArt.jsx
// Every picture Cosmic Encounter draws: player colours, ship tokens,
// planets, the warp, the hyperspace gate, alien portraits, card faces and
// the main-menu artwork. Plain SVG with fixed colours.

export const COSMIC_COLORS = {
  red: { fill: '#e2463a', deep: '#7a1710', glow: '#ff8a7d', text: '#ff9a8e' },
  blue: { fill: '#3f7fe6', deep: '#12306b', glow: '#8ab8ff', text: '#9cc3ff' },
  yellow: { fill: '#f2c231', deep: '#7a5a07', glow: '#ffe27e', text: '#ffe07a' },
  green: { fill: '#3fbf6a', deep: '#11502a', glow: '#8ef0ae', text: '#8ee8aa' },
  purple: { fill: '#a260e6', deep: '#3f1a6e', glow: '#d2a8ff', text: '#d0a6ff' },
};

export function cosmicColor(color) {
  return COSMIC_COLORS[color] || { fill: '#9aa0a6', deep: '#2b2822', glow: '#cfd3d6', text: '#cfd3d6' };
}

// A flying-saucer ship; `x`/`y` is its centre.
export function ShipGlyph({
  color, x = 0, y = 0, size = 16, count = null, dim = false,
}) {
  const c = cosmicColor(color);
  const s = size / 16;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={dim ? 0.45 : 1}>
      {count > 1 && <ellipse cx="2" cy="3" rx="9" ry="3.8" fill={c.deep} opacity="0.9" />}
      <ellipse cx="0" cy="1.5" rx="9" ry="3.8" fill={c.fill} stroke={c.deep} strokeWidth="1.2" />
      <path d="M-4.5 0.5a4.5 4.8 0 019 0z" fill={c.glow} stroke={c.deep} strokeWidth="1" />
      <circle cx="-4" cy="2" r="0.9" fill="#fff" opacity="0.8" />
      <circle cx="0" cy="2.6" r="0.9" fill="#fff" opacity="0.8" />
      <circle cx="4" cy="2" r="0.9" fill="#fff" opacity="0.8" />
      {count !== null && (
        <g transform="translate(9 -5)">
          <circle r="5.6" fill="#0b0d18" stroke={c.fill} strokeWidth="1.2" />
          <text y="2.6" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#fff" fontFamily="Inter, system-ui, sans-serif">{count}</text>
        </g>
      )}
    </g>
  );
}

export function ShipIcon({ color, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="-11 -9 22 16" className={className} aria-hidden="true">
      <ShipGlyph color={color} />
    </svg>
  );
}

// --- alien portraits ------------------------------------------------------

const PORTRAIT_BG = {
  macron: ['#5b3a1f', '#1f140b'],
  parasite: ['#3d5a1e', '#0f1a08'],
  clone: ['#1e4f5a', '#08171a'],
  zombie: ['#3f4a36', '#11150e'],
  oracle: ['#4a2f6b', '#140b22'],
  trader: ['#6b5a1f', '#1e1807'],
  mind: ['#6b2f5a', '#1e0b19'],
  fido: ['#5a3f2a', '#1a120b'],
  warrior: ['#6b2a2a', '#1e0a0a'],
  machine: ['#3a4a5a', '#0e141a'],
};

function Face({ id }) {
  switch (id) {
    case 'macron':
      return (
        <g>
          <rect x="-26" y="-22" width="52" height="46" rx="10" fill="#c98a4b" stroke="#3b220c" strokeWidth="2.5" />
          <rect x="-18" y="-8" width="12" height="7" rx="2" fill="#2a1606" />
          <rect x="6" y="-8" width="12" height="7" rx="2" fill="#2a1606" />
          <path d="M-14 12h28" stroke="#2a1606" strokeWidth="4" strokeLinecap="round" />
          <rect x="-30" y="-26" width="60" height="10" rx="4" fill="#8a5a2b" />
        </g>
      );
    case 'parasite':
      return (
        <g>
          {[-20, -8, 4, 16].map((x, i) => (
            <path key={x} d={`M${x} 18q${i % 2 ? 8 : -8} 10 ${i % 2 ? -2 : 2} 20`} stroke="#8fcf4f" strokeWidth="5" fill="none" strokeLinecap="round" />
          ))}
          <ellipse cx="0" cy="-2" rx="24" ry="22" fill="#9ad65a" stroke="#2e4a12" strokeWidth="2.5" />
          <circle cx="-8" cy="-6" r="6" fill="#fff" />
          <circle cx="8" cy="-6" r="6" fill="#fff" />
          <circle cx="-7" cy="-5" r="3" fill="#1a2a08" />
          <circle cx="9" cy="-5" r="3" fill="#1a2a08" />
          <path d="M-8 9q8 6 16 0" stroke="#2e4a12" strokeWidth="2.5" fill="none" />
        </g>
      );
    case 'clone':
      return (
        <g>
          {[[-10, '#5fc9d6'], [10, '#8fe3ec']].map(([dx, fill]) => (
            <g key={dx} transform={`translate(${dx} 0)`}>
              <ellipse cx="0" cy="0" rx="17" ry="22" fill={fill} stroke="#0f3a40" strokeWidth="2.2" />
              <ellipse cx="-6" cy="-4" rx="3.5" ry="5" fill="#0f3a40" />
              <ellipse cx="6" cy="-4" rx="3.5" ry="5" fill="#0f3a40" />
              <path d="M-5 10h10" stroke="#0f3a40" strokeWidth="2.2" strokeLinecap="round" />
            </g>
          ))}
        </g>
      );
    case 'zombie':
      return (
        <g>
          <path d="M-22 -4a22 24 0 0144 0v16l-6 10h-32l-6-10z" fill="#9fb08a" stroke="#28301f" strokeWidth="2.5" />
          <circle cx="-9" cy="-2" r="7" fill="#1c2216" />
          <circle cx="9" cy="-2" r="7" fill="#1c2216" />
          <circle cx="-9" cy="-2" r="2" fill="#d6ff7a" />
          <circle cx="9" cy="-2" r="2" fill="#d6ff7a" />
          <path d="M-10 16v6M-3 16v6M4 16v6M11 16v6" stroke="#28301f" strokeWidth="2.2" />
          <path d="M-18 -18l6 4M14 -20l-4 6" stroke="#28301f" strokeWidth="2" />
        </g>
      );
    case 'oracle':
      return (
        <g>
          <path d="M-30 0q30-28 60 0q-30 28-60 0z" fill="#e8dcff" stroke="#2a1648" strokeWidth="2.5" />
          <circle cx="0" cy="0" r="12" fill="#8a5ae6" stroke="#2a1648" strokeWidth="2" />
          <circle cx="0" cy="0" r="5" fill="#140b22" />
          <circle cx="-3" cy="-3" r="2" fill="#fff" />
          {[-20, 0, 20].map((x) => <path key={x} d={`M${x} -26l0 -6`} stroke="#d2b8ff" strokeWidth="2.5" strokeLinecap="round" />)}
        </g>
      );
    case 'trader':
      return (
        <g>
          <circle cx="-10" cy="4" r="16" fill="#f2c94c" stroke="#5a4208" strokeWidth="2.5" />
          <circle cx="10" cy="-4" r="16" fill="#ffd96b" stroke="#5a4208" strokeWidth="2.5" />
          <text x="10" y="2" textAnchor="middle" fontSize="18" fontWeight="900" fill="#5a4208" fontFamily="Georgia, serif">¤</text>
          <path d="M-30 20q10-8 20 0M10 26q10-8 20 0" stroke="#f2e2a6" strokeWidth="2.5" fill="none" />
        </g>
      );
    case 'mind':
      return (
        <g>
          <path d="M-24 4q-4-26 22-26q30 0 26 26q0 16-24 18q-24-2-24-18z" fill="#f08acb" stroke="#4a1238" strokeWidth="2.5" />
          <path d="M-14 -10q6 6 0 12M-2 -16q6 8 0 16M10 -12q-6 8 2 14M-8 10q8-4 16 0" stroke="#4a1238" strokeWidth="2" fill="none" />
          {[[-30, -20], [30, -18], [0, 30]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.5" fill="#ffc6ec" />)}
        </g>
      );
    case 'fido':
      return (
        <g>
          <path d="M-26 -18q-6 18 6 24M26 -18q6 18-6 24" stroke="#3a2412" strokeWidth="8" fill="none" strokeLinecap="round" />
          <ellipse cx="0" cy="0" rx="20" ry="22" fill="#c78d5a" stroke="#3a2412" strokeWidth="2.5" />
          <circle cx="-7" cy="-5" r="3.5" fill="#1a0f06" />
          <circle cx="7" cy="-5" r="3.5" fill="#1a0f06" />
          <ellipse cx="0" cy="7" rx="6" ry="4.5" fill="#1a0f06" />
          <path d="M-2 13q2 8 6 2" fill="#ff6b8a" />
        </g>
      );
    case 'warrior':
      return (
        <g>
          <path d="M-22 -10q22-24 44 0v18q-22 20-44 0z" fill="#b0463f" stroke="#3a0e0b" strokeWidth="2.5" />
          <path d="M-22 -2h44" stroke="#3a0e0b" strokeWidth="5" />
          <rect x="-14" y="-4" width="10" height="4" fill="#ffd56b" />
          <rect x="4" y="-4" width="10" height="4" fill="#ffd56b" />
          <path d="M0 -30v-8M-6 -34h12" stroke="#e8e2c8" strokeWidth="3" strokeLinecap="round" />
          <path d="M-8 12h16" stroke="#3a0e0b" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'machine':
      return (
        <g>
          <g fill="#8aa0b6" stroke="#1a2530" strokeWidth="2">
            {Array.from({ length: 8 }).map((_, i) => (
              <rect key={i} x="-4" y="-30" width="8" height="10" rx="1.5" transform={`rotate(${i * 45})`} />
            ))}
          </g>
          <circle r="22" fill="#a8bccf" stroke="#1a2530" strokeWidth="2.5" />
          <rect x="-12" y="-8" width="24" height="8" rx="3" fill="#1a2530" />
          <circle cx="-6" cy="-4" r="2.5" fill="#6bf0ff" />
          <circle cx="6" cy="-4" r="2.5" fill="#6bf0ff" />
          <path d="M-9 10h18" stroke="#1a2530" strokeWidth="3" strokeDasharray="3 2" />
        </g>
      );
    default:
      return <circle r="22" fill="#888" />;
  }
}

export function AlienPortrait({ id, className = 'h-12 w-12', rounded = 'rounded-xl' }) {
  const [a, b] = PORTRAIT_BG[id] || ['#333', '#111'];
  return (
    <span className={`inline-block shrink-0 overflow-hidden ${rounded} ${className}`} aria-hidden="true">
      <svg viewBox="-40 -40 80 80" className="h-full w-full">
        <defs>
          <radialGradient id={`alien-bg-${id}`} cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor={a} />
            <stop offset="100%" stopColor={b} />
          </radialGradient>
        </defs>
        <rect x="-40" y="-40" width="80" height="80" fill={`url(#alien-bg-${id})`} />
        {[[-30, -30], [28, -24], [-24, 30], [32, 26], [4, -34]].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="0.9" fill="#fff" opacity="0.55" />
        ))}
        <Face id={id} />
      </svg>
    </span>
  );
}

// --- card faces --------------------------------------------------------------

export const CARD_STYLE = {
  attack: { from: '#8f2a22', to: '#3d0f0b', ring: '#ff8a7d', label: 'text-rose-100' },
  negotiate: { from: '#1f7a4f', to: '#0b2e1e', ring: '#7ff0b4', label: 'text-emerald-100' },
  morph: { from: '#6a3fb0', to: '#241140', ring: '#c9a6ff', label: 'text-violet-100' },
  reinforcement: { from: '#2a5fae', to: '#0c1f3d', ring: '#8ab8ff', label: 'text-sky-100' },
  artifact: { from: '#9a7a22', to: '#3a2c08', ring: '#ffe08a', label: 'text-amber-100' },
  hidden: { from: '#23284a', to: '#0b0d1c', ring: '#6b75c9', label: 'text-indigo-100' },
};

export const ARTIFACT_GLYPH = {
  cosmicZap: '⚡', cardZap: '✂️', mobiusTubes: '🌀', plague: '☣️', forceField: '🛡️', emotionControl: '💗', ionicGas: '💨', quash: '✋',
};

export function cardGlyph(card) {
  if (!card || card.hidden) return '✦';
  switch (card.type) {
    case 'attack': return String(card.value).padStart(2, '0');
    case 'negotiate': return 'N';
    case 'morph': return 'M';
    case 'reinforcement': return `+${card.value}`;
    case 'artifact': return ARTIFACT_GLYPH[card.artifact] || '★';
    default: return '?';
  }
}

// --- main menu artwork ---------------------------------------------------------

export function CosmicArt() {
  const planets = [
    [20, 58, 7, '#e2463a'], [34, 20, 6, '#3f7fe6'], [98, 16, 6, '#f2c231'], [104, 58, 7, '#3fbf6a'], [60, 72, 5, '#a260e6'],
  ];
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="cosmic-menu-sky" cx="50%" cy="45%" r="80%">
          <stop offset="0%" stopColor="#2a2060" />
          <stop offset="100%" stopColor="#05040f" />
        </radialGradient>
        <radialGradient id="cosmic-menu-warp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6c9" />
          <stop offset="35%" stopColor="#b48bff" />
          <stop offset="100%" stopColor="#2a1060" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" rx="6" fill="url(#cosmic-menu-sky)" />
      {[[8, 8], [52, 10], [80, 30], [14, 34], [112, 36], [44, 60], [90, 72], [70, 6]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="0.8" fill="#fff" opacity="0.7" />
      ))}
      <circle cx="60" cy="40" r="20" fill="url(#cosmic-menu-warp)" />
      <circle cx="60" cy="40" r="11" fill="none" stroke="#e8dcff" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
      {planets.map(([x, y, r, c]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r={r} fill={c} />
          <ellipse cx={x} cy={y} rx={r + 4} ry={r / 3} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.8" />
        </g>
      ))}
      <path d="M66 36L96 20" stroke="#fff3b0" strokeWidth="1.4" strokeDasharray="3 2" />
      <g transform="translate(78 28) rotate(-28) scale(0.55)"><ShipGlyph color="red" /></g>
      <g transform="translate(86 24) rotate(-28) scale(0.55)"><ShipGlyph color="red" /></g>
    </svg>
  );
}
