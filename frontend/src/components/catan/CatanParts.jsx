// CatanParts.jsx
// Small pieces of Catan UI shared by the lobby and the table: a piece
// icon, a cost as resource chips, a hand as chips, and a number stepper.

import {
  CityShape, RESOURCES, ResourceIcon, SettlementShape, playerColor,
} from './catanArt';

export function PieceIcon({ kind, color = 'white', className = 'h-8 w-8' }) {
  const c = playerColor(color);
  return (
    <svg viewBox="-16 -16 32 32" className={className} aria-hidden="true">
      {kind === 'road' && (
        <g>
          <line x1="-11" y1="9" x2="11" y2="-9" stroke={c.edge} strokeWidth="8" strokeLinecap="round" />
          <line x1="-11" y1="9" x2="11" y2="-9" stroke={c.fill} strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
      {kind === 'settlement' && <g transform="translate(0 1)"><SettlementShape color={color} scale={1.2} /></g>}
      {kind === 'city' && <CityShape color={color} scale={1} />}
      {kind === 'dev' && (
        <g>
          <rect x="-9" y="-13" width="18" height="26" rx="3" fill="#f3e6c2" stroke="#6b4a1f" strokeWidth="1.6" />
          <rect x="-6" y="-10" width="12" height="20" rx="2" fill="#6d4aa8" />
          <text x="0" y="5" textAnchor="middle" fontSize="13" fontWeight="900" fill="#f3e6c2">?</text>
        </g>
      )}
    </svg>
  );
}

// A cost as chips; with a hand, the chips you cannot cover turn red.
export function CostChips({ cost, hand = null, size = 'h-4 w-4' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {RESOURCES.filter((r) => cost?.[r]).map((r) => {
        const short = hand && (hand[r] || 0) < cost[r];
        return (
          <span
            key={r}
            className={`inline-flex items-center gap-0.5 rounded-md bg-black/25 px-1 py-0.5 text-[11px] font-bold tnum ${short ? 'text-rent-light ring-1 ring-rent-light/40' : 'text-parch/80'}`}
          >
            <ResourceIcon resource={r} className={size} />
            {cost[r] > 1 && `×${cost[r]}`}
          </span>
        );
      })}
    </span>
  );
}

export function HandChips({ hand }) {
  const items = RESOURCES.filter((r) => hand?.[r] > 0);
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((r) => (
        <span key={r} className="inline-flex items-center gap-0.5 rounded-md bg-white/[0.07] px-1 py-0.5 text-[11.5px] font-bold text-parch tnum">
          <ResourceIcon resource={r} className="h-4 w-4" />
          ×{hand[r]}
        </span>
      ))}
    </span>
  );
}

export function Stepper({
  value, onChange, min = 0, max = 19, compact = false,
}) {
  const btn = compact ? 'h-5 w-5 text-[13px]' : 'h-6 w-6 text-[15px]';
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={`flex ${btn} items-center justify-center rounded-md font-bold text-parch/70 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25`}
        aria-label="−"
      >
        −
      </button>
      <span className={`${compact ? 'w-4 text-[12px]' : 'w-5 text-[13px]'} text-center font-bold text-parch tnum`}>{value}</span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={`flex ${btn} items-center justify-center rounded-md font-bold text-parch/70 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25`}
        aria-label="+"
      >
        +
      </button>
    </span>
  );
}
