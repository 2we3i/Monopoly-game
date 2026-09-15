// CustomPricingSection.jsx
// Lets a property's owner set a per-player "For the Family" rent price.
// Not gated on isMyTurn - an administrative setting about future rent,
// not a board action with a turn-order dependency. A price moves in steps:
// one change may shift it by at most 10% of what that player pays now,
// and the last change (how much, what percent) stays visible to both the
// owner and the player it applies to.

import { useEffect, useState } from 'react';
import {
  formatSignedMoney, formatSignedPercent, priceStepLimit, pricingBaseRent,
} from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { usePendingAction } from '../hooks/usePendingAction';
import PlayerAvatar from './PlayerAvatar';
import Icon from './icons';

export function PriceChangeBadge({ change, className = '' }) {
  if (!change) return null;
  const tone = change.delta > 0 ? 'bg-rent/20 text-rent-light' : change.delta < 0 ? 'bg-go/20 text-go-light' : 'bg-white/10 text-parch/60';
  const percent = formatSignedPercent(change.percent);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tnum ${tone} ${className}`}>
      {change.delta > 0 ? '▲' : change.delta < 0 ? '▼' : '•'}
      {formatSignedMoney(change.delta)}
      {percent && <span className="opacity-80">({percent})</span>}
    </span>
  );
}

function PlayerPriceRow({
  player, customPrice, change, normalRent, stamp, onSave,
}) {
  const { t } = useTranslation();
  const current = customPrice ?? normalRent;
  const step = priceStepLimit(current);
  const min = Math.max(0, current - step);
  const max = current + step;
  const [value, setValue] = useState(String(current));
  const [pending, run] = usePendingAction(stamp);

  useEffect(() => { setValue(String(current)); }, [current]);

  const typed = value.trim() === '' ? null : Number(value);
  const typedValid = typed != null && Number.isInteger(typed) && typed >= min && typed <= max && typed !== current;
  const outOfRange = typed != null && Number.isFinite(typed) && (typed < min || typed > max);
  const canReset = customPrice != null && Math.abs(normalRent - current) <= step;
  const save = (amount, key) => run(key, () => onSave(amount));

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-2">
      <div className="flex items-center gap-2">
        <PlayerAvatar player={player} sizeClassName="h-6 w-6" ringClassName="ring-1 ring-white/20" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-parch/85">{player.nickname}</span>
        <span className={`text-[13px] font-bold tnum ${customPrice != null ? 'text-brass-light' : 'text-parch/60'}`}>${current}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-8 text-[10.5px] text-parch/45">
        {change ? (
          <>
            <span>{t('familyPrice.lastChange')}:</span>
            <span className="tnum">${change.from} → ${change.to}</span>
            <PriceChangeBadge change={change} />
            {change.cleared && <span>{t('familyPrice.cleared')}</span>}
          </>
        ) : (
          <span>{t('customPrice.normalRent')} (${normalRent})</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-8">
        <button
          type="button"
          disabled={!!pending || current === 0}
          onClick={() => save(min, 'down')}
          title="−10%"
          className="rounded-md border border-go/40 bg-go/15 px-2 py-1 text-[11px] font-bold text-go-light transition-transform active:scale-95 disabled:opacity-35"
        >
          {pending === 'down' ? '…' : `▼ $${min}`}
        </button>
        <button
          type="button"
          disabled={!!pending}
          onClick={() => save(max, 'up')}
          title="+10%"
          className="rounded-md border border-rent/40 bg-rent/15 px-2 py-1 text-[11px] font-bold text-rent-light transition-transform active:scale-95 disabled:opacity-35"
        >
          {pending === 'up' ? '…' : `▲ $${max}`}
        </button>
        <div className="flex items-center rounded-md border border-white/12 bg-black/25 px-1.5">
          <span className="text-[11px] text-parch/35">$</span>
          <input
            type="number"
            min={min}
            max={max}
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t('familyPrice.forPlayer', { name: player.nickname })}
            className="w-16 bg-transparent py-1 text-[12px] font-semibold text-parch outline-none tnum"
          />
        </div>
        <button
          type="button"
          onClick={() => save(typed, 'custom')}
          disabled={!typedValid || !!pending}
          className="rounded-md bg-brass px-2 py-1 text-[11px] font-bold text-ink transition-transform active:scale-95 disabled:opacity-40"
        >
          {pending === 'custom' ? t('customPrice.saving') : t('customPrice.save')}
        </button>
        {customPrice != null && (
          <button
            type="button"
            disabled={!canReset || !!pending}
            onClick={() => save(null, 'reset')}
            title={canReset ? t('customPrice.clear') : t('familyPrice.resetBlocked', { amount: normalRent })}
            className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-bold text-parch/70 disabled:opacity-35"
          >
            {pending === 'reset' ? '…' : t('familyPrice.reset')}
          </button>
        )}
      </div>

      <p className={`pl-8 text-[10.5px] leading-snug ${outOfRange ? 'font-semibold text-rent-light' : 'text-parch/35'}`}>
        {outOfRange ? t('familyPrice.tooFar', { step }) : t('familyPrice.stepHint', { step, min, max })}
      </p>
      {customPrice != null && !canReset && (
        <p className="pl-8 text-[10.5px] leading-snug text-parch/35">{t('familyPrice.resetBlocked', { amount: normalRent })}</p>
      )}
    </div>
  );
}

export default function CustomPricingSection({
  tile, propState, gameState, myPlayerId, onSetCustomPrice,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { players, board, properties } = gameState;
  const otherPlayers = players.filter((p) => p.id !== myPlayerId && !p.bankrupt);
  if (otherPlayers.length === 0) return null;

  const normalRent = pricingBaseRent(tile, propState, board, properties) ?? 0;
  const activeCount = Object.keys(propState.customPrices || {}).length;

  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <Icon.users className="h-4 w-4 shrink-0 text-brass/70" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-bold text-parch">{t('customPrice.title')}</span>
          <span className="block truncate text-[11px] text-parch/40">{t('customPrice.subtitle')}</span>
        </span>
        {activeCount > 0 && (
          <span className="pill shrink-0 bg-brass/25 text-brass-light tnum">{activeCount}</span>
        )}
        {open ? <Icon.chevronUp className="h-4 w-4 shrink-0 text-parch/40" /> : <Icon.chevronDown className="h-4 w-4 shrink-0 text-parch/40" />}
      </button>
      {open && (
        <div className="flex animate-fade-in flex-col gap-1.5 border-t border-white/[0.07] p-2">
          {otherPlayers.map((player) => (
            <PlayerPriceRow
              key={player.id}
              player={player}
              customPrice={propState.customPrices?.[player.id] ?? null}
              change={propState.priceChanges?.[player.id] || null}
              normalRent={normalRent}
              stamp={gameState.receivedAt}
              onSave={(amount) => onSetCustomPrice(tile.id, player.id, amount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
