// DistrictCard.jsx
// One district card: type colour, cost coin, drawn building, name and -
// for special districts - the rule it changes.

import { DistrictArt, TYPE_COLORS, TypeIcon } from './citadelsArt';

export default function DistrictCard({
  district, language, compact = false, onClick, disabled = false, selected = false, children,
}) {
  if (!district) return null;
  const color = TYPE_COLORS[district.type];
  const name = district.name[language] || district.name.en;
  const text = district.text ? (district.text[language] || district.text.en) : null;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      title={text ? `${name} — ${text}` : name}
      className={`group relative flex shrink-0 flex-col overflow-hidden rounded-xl border bg-[#17120c] text-left shadow-lift transition-all ${
        compact ? 'w-[96px]' : 'w-[136px]'
      } ${selected ? 'border-brass-light ring-2 ring-brass-light/60' : 'border-white/10'} ${
        onClick && !disabled ? 'hover:-translate-y-1 hover:border-white/30' : ''
      } ${onClick && disabled ? 'opacity-50' : ''}`}
    >
      <div className="h-1 w-full" style={{ backgroundColor: color }} />
      <div className="relative">
        <DistrictArt district={district} className={compact ? 'h-12 w-full' : 'h-[74px] w-full'} />
        <span className={`absolute left-1.5 top-1.5 flex items-center justify-center rounded-full bg-gradient-to-b from-[#f7dc8a] to-[#c99a2e] font-black text-[#3a2a0a] shadow ${compact ? 'h-5 w-5 text-[10.5px]' : 'h-6 w-6 text-[12px]'}`}>
          {district.cost}
        </span>
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60" style={{ color }}>
          <TypeIcon type={district.type} className="h-3 w-3" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2 py-1.5">
        <p className={`font-display font-bold leading-tight text-parch ${compact ? 'text-[11px]' : 'text-[12.5px]'}`}>{name}</p>
        {!compact && text && <p className="text-[10px] leading-snug text-parch/50">{text}</p>}
        {children}
      </div>
    </Tag>
  );
}
