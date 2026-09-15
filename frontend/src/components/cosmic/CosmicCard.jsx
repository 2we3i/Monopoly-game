// CosmicCard.jsx
// One card as an interactive object: its face (or back), and the states a
// player needs to read at a glance - hover, selected, playable, disabled.

import { useTranslation } from '../../i18n/LanguageContext';
import { CARD_STYLE, cardGlyph } from './cosmicArt';

export default function CosmicCard({
  card,
  size = 'md',
  selected = false,
  playable = false,
  disabled = false,
  onClick,
  title,
  children,
  className = '',
}) {
  const { t } = useTranslation();
  const kind = !card || card.hidden ? 'hidden' : card.type;
  const style = CARD_STYLE[kind] || CARD_STYLE.hidden;
  const dims = {
    sm: 'h-[4.6rem] w-[3.3rem] text-[9px]',
    md: 'h-[7.2rem] w-[5.2rem] text-[10px]',
    lg: 'h-[9.4rem] w-[6.8rem] text-[11px]',
  }[size];
  const glyphSize = { sm: 'text-[18px]', md: 'text-[28px]', lg: 'text-[36px]' }[size];
  const name = kind === 'artifact'
    ? t(`cosmic.artifact.${card.artifact}.name`)
    : t(`cosmic.card.${kind}`);
  const interactive = !!onClick && !disabled;

  const body = (
    <>
      <span
        className="absolute inset-0 rounded-[inherit]"
        style={{ background: `linear-gradient(160deg, ${style.from}, ${style.to})` }}
      />
      <span className="absolute inset-[3px] rounded-[inherit] border border-white/15" />
      {kind === 'hidden' ? (
        <span className="relative flex h-full w-full items-center justify-center">
          <span className="font-display text-[1.6em] font-black text-indigo-200/70">✦</span>
        </span>
      ) : (
        <span className="relative flex h-full w-full flex-col items-center justify-between px-1 py-1.5">
          <span className={`w-full truncate text-center font-bold uppercase tracking-wide ${style.label}`}>{name}</span>
          <span className={`font-display font-black leading-none text-white drop-shadow ${glyphSize}`}>{cardGlyph(card)}</span>
          <span className={`w-full truncate text-center ${style.label} opacity-80`}>
            {kind === 'attack' && t('cosmic.card.attackShort')}
            {kind === 'negotiate' && t('cosmic.card.negotiateShort')}
            {kind === 'morph' && t('cosmic.card.morphShort')}
            {kind === 'reinforcement' && t('cosmic.card.reinforcementShort')}
            {kind === 'artifact' && t(`cosmic.artifact.${card.artifact}.when`)}
          </span>
        </span>
      )}
    </>
  );

  const ring = selected
    ? 'ring-2 ring-offset-2 ring-offset-[#0b0d1c] -translate-y-1.5 shadow-[0_12px_30px_-8px_rgba(0,0,0,0.9)]'
    : playable
      ? 'ring-1 ring-white/40 hover:-translate-y-1'
      : '';

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {interactive || onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={title || name}
          aria-pressed={selected}
          className={`relative ${dims} shrink-0 overflow-hidden rounded-lg transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:brightness-110 ${ring}`}
          style={selected ? { '--tw-ring-color': style.ring } : undefined}
        >
          {body}
        </button>
      ) : (
        <div title={title || name} className={`relative ${dims} shrink-0 overflow-hidden rounded-lg ${disabled ? 'opacity-45' : ''} ${ring}`}>
          {body}
        </div>
      )}
      {children}
    </div>
  );
}
