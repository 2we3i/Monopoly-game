// CustomPricingSection.jsx
// Lets a property's owner set a per-player "For the Family" rent price.
// Not gated on isMyTurn - an administrative setting about future rent,
// not a board action with a turn-order dependency.

import { useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import PlayerAvatar from './PlayerAvatar';
import Icon from './icons';

function PlayerPriceRow({ player, currentPrice, normalRent, onSave }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(currentPrice != null ? String(currentPrice) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isDirty = (currentPrice != null ? String(currentPrice) : '') !== value;

  const save = async () => {
    setError('');
    if (value.trim() === '') {
      setSaving(true);
      try {
        await onSave(player.id, null);
      } finally {
        setSaving(false);
      }
      return;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      setError(t('customPrice.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await onSave(player.id, amount);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <PlayerAvatar player={player} sizeClassName="h-6 w-6" ringClassName="ring-1 ring-white/20" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-parch/80">{player.nickname}</span>
        <div className="flex items-center rounded-md border border-white/12 bg-black/25 px-1.5">
          <span className="text-[11px] text-parch/35">$</span>
          <input
            type="number"
            min="0"
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('customPrice.placeholder')}
            className="w-20 bg-transparent py-1 text-[12px] font-semibold text-parch outline-none placeholder:text-parch/25 tnum"
          />
        </div>
        {isDirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="shrink-0 rounded-md bg-brass px-2 py-1 text-[11px] font-bold text-ink transition-transform active:scale-95 disabled:opacity-50"
          >
            {saving ? t('customPrice.saving') : t('customPrice.save')}
          </button>
        )}
      </div>
      {error && <p className="pl-8 text-[11px] font-medium text-rent-light">{error}</p>}
      <p className="pl-8 text-[10.5px] text-parch/35">
        {currentPrice != null
          ? <span className="text-brass-light tnum">${currentPrice}</span>
          : `${t('customPrice.normalRent')} ($${normalRent})`}
      </p>
    </div>
  );
}

export default function CustomPricingSection({ tile, propState, players, myPlayerId, onSetCustomPrice }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const otherPlayers = players.filter((p) => p.id !== myPlayerId && !p.bankrupt);
  if (otherPlayers.length === 0) return null;

  const normalRent = tile.rent ? tile.rent[propState.houses] : undefined;
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
              currentPrice={propState.customPrices?.[player.id] ?? null}
              normalRent={normalRent ?? tile.rent?.[0] ?? 0}
              onSave={(targetId, amount) => onSetCustomPrice(tile.id, targetId, amount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
