// citadelsArt.jsx
// The look of Citadels: a colour and an icon per district type, a glyph
// per role, and a small drawn building for every district card - taller
// and grander as the district gets more expensive.

export const TYPE_COLORS = {
  RESIDENTIAL: '#d9a82e',
  RELIGIOUS: '#4f86e0',
  TRADE: '#3fae72',
  MILITARY: '#d65244',
  SPECIAL: '#a071e0',
};

export const TYPE_ORDER = ['RESIDENTIAL', 'RELIGIOUS', 'TRADE', 'MILITARY', 'SPECIAL'];

export const ROLE_GLYPH = {
  ASSASSIN: '🗡️',
  THIEF: '🎭',
  MAGICIAN: '🔮',
  KING: '👑',
  BISHOP: '⛪',
  MERCHANT: '💰',
  ARCHITECT: '📐',
  WARLORD: '⚔️',
};

export function TypeIcon({ type, className = 'h-3.5 w-3.5' }) {
  const paths = {
    RESIDENTIAL: <><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
    RELIGIOUS: <><path d="M12 3v5M10 5h4" /><path d="M7 21v-9l5-4 5 4v9" /><path d="M11 21v-4h2v4" /></>,
    TRADE: <><circle cx="12" cy="12" r="8" /><path d="M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4M12 7.5v9" /></>,
    MILITARY: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
    SPECIAL: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}

function Building({ type, cost }) {
  const h = 14 + cost * 5; // a grander building for a pricier district
  const base = 58;
  const top = base - h;
  const wall = '#2a2118';
  const lit = '#f3d27a';
  switch (type) {
    case 'RESIDENTIAL':
      return (
        <g>
          <rect x="30" y={top + 8} width="40" height={h - 8} fill={wall} />
          <path d={`M26 ${top + 9}L50 ${top - 6}L74 ${top + 9}z`} fill="#3a2c1c" />
          {cost >= 4 && <rect x="62" y={top - 4} width="5" height="9" fill={wall} />}
          <rect x="37" y={top + 14} width="6" height="7" rx="1" fill={lit} opacity="0.85" />
          <rect x="57" y={top + 14} width="6" height="7" rx="1" fill={lit} opacity="0.85" />
          <rect x="46" y={base - 11} width="8" height="11" rx="1" fill="#120d08" />
        </g>
      );
    case 'RELIGIOUS':
      return (
        <g>
          <rect x="34" y={top + 12} width="32" height={h - 12} fill={wall} />
          <rect x="45" y={top - 2} width="10" height="16" fill={wall} />
          <path d={`M43 ${top - 1}L50 ${top - 14}L57 ${top - 1}z`} fill="#3a2c1c" />
          <path d={`M50 ${top - 22}v8M47 ${top - 19}h6`} stroke={lit} strokeWidth="1.5" />
          <circle cx="50" cy={top + 20} r="4" fill={lit} opacity="0.8" />
          <path d={`M45 ${base}v-9a5 5 0 0110 0v9z`} fill="#120d08" />
        </g>
      );
    case 'TRADE':
      return (
        <g>
          <rect x="28" y={top + 10} width="44" height={h - 10} fill={wall} />
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M${28 + i * 8.8} ${top + 10}h8.8l-1 7h-6.8z`} fill={i % 2 ? '#e8e0cf' : '#3fae72'} />
          ))}
          <rect x="34" y={top + 22} width="32" height="4" fill="#5a4630" />
          <circle cx="40" cy={top + 20} r="2" fill={lit} />
          <circle cx="50" cy={top + 20} r="2" fill="#e07a3c" />
          <circle cx="60" cy={top + 20} r="2" fill={lit} />
        </g>
      );
    case 'MILITARY':
      return (
        <g>
          <rect x="38" y={top} width="24" height={h} fill={wall} />
          <path d={`M36 ${top}v-6h5v3h4v-3h5v3h4v-3h5v6z`} fill={wall} />
          <rect x="46" y={top + 8} width="8" height="3" fill={lit} opacity="0.7" />
          <rect x="47" y={base - 12} width="6" height="12" rx="3" fill="#120d08" />
          <path d={`M62 ${top - 8}v-10l8 3-8 3`} fill="#d65244" />
        </g>
      );
    default:
      return (
        <g>
          <rect x="41" y={top + 4} width="18" height={h - 4} fill={wall} />
          <path d={`M39 ${top + 5}L50 ${top - 16}L61 ${top + 5}z`} fill="#3b2a57" />
          <circle cx="50" cy={top - 20} r="3" fill={lit} />
          <rect x="47" y={top + 12} width="6" height="8" rx="3" fill="#b99af0" opacity="0.9" />
          <rect x="30" y={base - 14} width="11" height="14" fill={wall} />
          <rect x="59" y={base - 18} width="11" height="18" fill={wall} />
        </g>
      );
  }
}

export function DistrictArt({ district, className = 'h-16 w-full' }) {
  const color = TYPE_COLORS[district.type] || '#888';
  const id = `sky-${district.id}`;
  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor="#120d08" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect width="100" height="60" fill={`url(#${id})`} />
      <circle cx="82" cy="12" r="5" fill="#f3d27a" opacity="0.35" />
      <Building type={district.type} cost={Math.min(district.cost, 6)} />
      <rect y="57" width="100" height="3" fill="#0d0905" />
    </svg>
  );
}
