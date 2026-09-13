// PropertyChip.jsx
// The single shared way an owned/tradable asset is represented outside
// the board: a color-coded row with its name, what it is worth, and any
// state badges. Used by the trade screen, the property manager and the
// player list so one asset always looks the same wherever it appears.

import { TILE_TYPES, assetValue, getTileName, tileAccentColor } from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { hexToRgba } from '../colorUtils';
import Icon from './icons';

function TypeGlyph({ tile, className }) {
  if (tile.type === TILE_TYPES.RAILROAD) return <Icon.train className={className} />;
  if (tile.type === TILE_TYPES.UTILITY) {
    return /water|вод|aqua/i.test(tile.name) ? <Icon.droplet className={className} /> : <Icon.bolt className={className} />;
  }
  return <Icon.home className={className} />;
}

export function PropertyTag({ tile, propState, onRemove }) {
  const { language } = useTranslation();
  const accent = tileAccentColor(tile);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border py-1 pl-1.5 pr-2 text-[11.5px] font-semibold"
      style={{ borderColor: hexToRgba(accent, 0.55), backgroundColor: hexToRgba(accent, 0.16), color: '#f4ecdc' }}
    >
      <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: accent }} />
      <span className="truncate">{getTileName(tile, language)}</span>
      {propState?.houses > 0 && (
        <span className="shrink-0 rounded bg-black/30 px-1 text-[10px] font-bold">
          {propState.houses === 5 ? 'H' : `${propState.houses}×`}
        </span>
      )}
      {propState?.mortgaged && <Icon.lock className="h-3 w-3 shrink-0 text-rent-light" />}
      {onRemove && (
        <button type="button" onClick={onRemove} className="shrink-0 rounded p-0.5 text-parch/60 hover:bg-black/25 hover:text-parch">
          <Icon.close className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export default function PropertyChip({
  tile, propState, selected, disabled, onClick, trailing, subtitle, dense, testId,
}) {
  const { t, language } = useTranslation();
  const accent = tileAccentColor(tile);
  const value = assetValue(tile, propState);
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick ? { type: 'button', onClick, disabled } : {})}
      data-testid={testId}
      data-tile-id={tile.id}
      className={`group flex w-full items-center gap-2.5 rounded-xl border px-2.5 text-left transition-all
        ${dense ? 'py-1.5' : 'py-2'}
        ${selected
          ? 'border-brass/70 bg-brass/15 shadow-[0_0_0_1px_rgba(201,152,47,0.35)]'
          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.07]'}
        ${disabled ? 'cursor-not-allowed opacity-40' : onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: hexToRgba(accent, 0.9), color: '#fff' }}
      >
        <TypeGlyph tile={tile} className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-parch">{getTileName(tile, language)}</span>
          {propState?.mortgaged && (
            <span className="pill shrink-0 bg-rent/25 text-rent-light">{t('property.mortgagedShort')}</span>
          )}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-parch/45">
          {subtitle || <span className="tnum">${tile.price}</span>}
          {propState?.houses > 0 && (
            <span className="flex items-center gap-0.5 text-go-light">
              {propState.houses === 5
                ? <><Icon.hotel className="h-3 w-3" />{t('property.hotel')}</>
                : <><Icon.home className="h-3 w-3" />{propState.houses}</>}
            </span>
          )}
        </span>
      </span>

      {trailing !== undefined ? trailing : (
        <span className="shrink-0 text-[12px] font-bold text-parch/70 tnum">${value.toLocaleString('en-US')}</span>
      )}
    </Tag>
  );
}
