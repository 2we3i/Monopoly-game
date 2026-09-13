// TradeComposer.jsx
// The "make an offer" screen. Both halves of the deal are always on
// screen at once, side by side, each one clearly labelled with whose
// assets they are and what the whole side is worth - so the question
// "who is giving what, and is this a good deal?" is answered by looking,
// not by reading a list of names.

import { useEffect, useMemo, useState } from 'react';
import { assetValue, formatMoney, getTileName, ownedTileIds } from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import Modal from './Modal';
import PlayerAvatar from './PlayerAvatar';
import PropertyChip from './PropertyChip';
import Icon from './icons';

function tradableState(tile, propState) {
  if (!tile || !propState) return { ok: false, reason: null };
  if (propState.houses > 0) return { ok: false, reason: 'trade.blockedHouses' };
  if (propState.mortgaged) return { ok: false, reason: 'trade.blockedMortgaged' };
  return { ok: true, reason: null };
}

function MoneyField({ value, max, onChange, label, accent }) {
  const { t } = useTranslation();
  const clamp = (n) => Math.max(0, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));
  return (
    <div className="shrink-0 rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="section-label">{label}</span>
        <span className="text-[10.5px] text-parch/35">
          {t('trade.available')} <span className="tnum">{formatMoney(max)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-white/12 bg-black/30 px-2.5 focus-within:border-brass">
          <span className="mr-1 text-sm font-bold text-parch/40">$</span>
          <input
            type="number"
            min="0"
            max={max}
            step="1"
            value={value === 0 ? '' : value}
            placeholder="0"
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="w-full bg-transparent py-1.5 text-[15px] font-bold text-parch outline-none placeholder:text-parch/25 tnum"
          />
        </div>
        {[50, 100, 500].map((step) => (
          <button
            key={step}
            type="button"
            disabled={max < step}
            onClick={() => onChange(clamp(value + step))}
            className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-bold text-parch/60 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25"
          >
            +{step}
          </button>
        ))}
        <button
          type="button"
          disabled={max <= 0}
          onClick={() => onChange(max)}
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-bold text-parch/60 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25"
        >
          {t('trade.max')}
        </button>
      </div>
      <input
        type="range"
        min="0"
        max={Math.max(max, 1)}
        step="1"
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        disabled={max <= 0}
        className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 disabled:opacity-30"
        style={{ accentColor: accent }}
      />
    </div>
  );
}

function SidePanel({ player, isYou, tiles, properties, selectedIds, onToggle, money, onMoney, accent }) {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tiles;
    return tiles.filter((tile) => getTileName(tile, language).toLowerCase().includes(q));
  }, [tiles, query, language]);

  const selectedValue = selectedIds.reduce((sum, id) => sum + assetValue(tiles.find((x) => x.id === id), properties[id]), 0);

  return (
    <section className="flex flex-col gap-2.5 lg:min-h-0 lg:flex-1">
      <header
        className="flex shrink-0 items-center gap-2.5 rounded-xl border p-2.5"
        style={{ borderColor: `${accent}55`, backgroundColor: `${accent}14` }}
      >
        <PlayerAvatar player={player} sizeClassName="h-9 w-9" ringClassName="ring-2 ring-white/25" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-parch">
            {isYou ? t('trade.yourSide') : t('trade.theirSide', { name: player.nickname })}
          </p>
          <p className="text-[11px] text-parch/45 tnum">{formatMoney(player.money)}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-black/30 px-2 py-1 text-right">
          <span className="block text-[9px] font-bold uppercase tracking-wide text-parch/40">{t('trade.total')}</span>
          <span className="block text-[13px] font-black text-parch tnum">{formatMoney(selectedValue + money)}</span>
        </span>
      </header>

      <MoneyField value={money} max={player.money} onChange={onMoney} label={t('trade.money')} accent={accent} />

      {/* Below lg the dialog body is what scrolls, so the list keeps its
          own bounded height; from lg up the two columns become full-height
          panes that scroll internally instead. */}
      <div className="flex max-h-64 min-h-[8rem] flex-col rounded-xl border border-white/[0.08] bg-black/20 lg:max-h-none lg:min-h-0 lg:flex-1">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-2.5 py-2">
          <span className="section-label flex-1">
            {t('trade.properties')}
            {selectedIds.length > 0 && <span className="ml-1.5 text-brass-light">· {selectedIds.length}</span>}
          </span>
          {tiles.length > 6 && (
            <span className="flex items-center gap-1 rounded-md border border-white/10 px-1.5">
              <Icon.search className="h-3 w-3 text-parch/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('trade.search')}
                className="w-24 bg-transparent py-1 text-[11px] text-parch outline-none placeholder:text-parch/30"
              />
            </span>
          )}
        </div>
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {visible.length === 0 && (
            <p className="m-auto px-4 text-center text-[12px] italic text-parch/30">{t('trade.noTradableProperties')}</p>
          )}
          {visible.map((tile) => {
            const propState = properties[tile.id];
            const status = tradableState(tile, propState);
            return (
              <PropertyChip
                key={tile.id}
                tile={tile}
                propState={propState}
                testId={isYou ? 'trade-offer-option' : 'trade-request-option'}
                dense
                selected={selectedIds.includes(tile.id)}
                disabled={!status.ok}
                onClick={status.ok ? () => onToggle(tile.id) : undefined}
                subtitle={status.ok ? undefined : <span className="text-rent-light">{t(status.reason)}</span>}
                trailing={
                  status.ok ? (
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      selectedIds.includes(tile.id) ? 'border-brass bg-brass text-ink' : 'border-white/20 text-transparent'
                    }`}
                    >
                      <Icon.check className="h-3 w-3" />
                    </span>
                  ) : (
                    <Icon.lock className="h-4 w-4 shrink-0 text-parch/25" />
                  )
                }
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function TradeComposer({ gameState, playerId, initialTarget, onClose, onPropose }) {
  const { t } = useTranslation();
  const me = gameState.players.find((p) => p.id === playerId);
  const others = gameState.players.filter((p) => p.id !== playerId && !p.bankrupt);
  const [targetId, setTargetId] = useState(initialTarget?.id || others[0]?.id || null);
  const [offerIds, setOfferIds] = useState([]);
  const [requestIds, setRequestIds] = useState([]);
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const target = others.find((p) => p.id === targetId) || null;

  // Switching partner invalidates every selection that referred to the
  // previous one's deeds, so the offer starts clean rather than silently
  // carrying over tiles the new partner does not own.
  useEffect(() => {
    setRequestIds([]);
    setRequestMoney(0);
  }, [targetId]);

  const myTiles = useMemo(
    () => ownedTileIds(playerId, gameState.properties).map((id) => gameState.board[id]),
    [playerId, gameState.properties, gameState.board],
  );
  const theirTiles = useMemo(
    () => (target ? ownedTileIds(target.id, gameState.properties).map((id) => gameState.board[id]) : []),
    [target, gameState.properties, gameState.board],
  );

  const offerValue = offerIds.reduce((s, id) => s + assetValue(gameState.board[id], gameState.properties[id]), offerMoney);
  const requestValue = requestIds.reduce((s, id) => s + assetValue(gameState.board[id], gameState.properties[id]), requestMoney);
  const delta = requestValue - offerValue;
  const isEmpty = offerIds.length === 0 && requestIds.length === 0 && offerMoney <= 0 && requestMoney <= 0;

  const toggle = (setFn) => (id) => setFn((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const submit = async () => {
    setError('');
    if (!target) {
      setError(t('trade.mustSelectPlayer'));
      return;
    }
    if (isEmpty) {
      setError(t('trade.invalidEmpty'));
      return;
    }
    setSending(true);
    try {
      await onPropose({
        toPlayerId: target.id,
        offerTileIds: offerIds,
        offerMoney,
        requestTileIds: requestIds,
        requestMoney,
      });
      onClose();
    } finally {
      setSending(false);
    }
  };

  if (!me) return null;

  return (
    <Modal
      onClose={onClose}
      widthClass="max-w-5xl"
      bodyClass="flex flex-col"
      title={t('trade.propose')}
      subtitle={t('trade.composerHint')}
      icon={<Icon.trade className="h-5 w-5" />}
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-[12px]">
              <span className="text-parch/40">{t('trade.youGiveShort')}</span>
              <span className="font-bold text-rent-light tnum">{formatMoney(offerValue)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px]">
              <span className="text-parch/40">{t('trade.youGetShort')}</span>
              <span className="font-bold text-go-light tnum">{formatMoney(requestValue)}</span>
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
              delta === 0 ? 'bg-white/8 text-parch/60' : delta > 0 ? 'bg-go/20 text-go-light' : 'bg-rent/20 text-rent-light'
            }`}
            >
              {delta === 0
                ? t('trade.evenDeal')
                : delta > 0
                  ? t('trade.inYourFavor', { amount: formatMoney(Math.abs(delta)) })
                  : t('trade.againstYou', { amount: formatMoney(Math.abs(delta)) })}
            </span>
          </div>
          {error && <p className="text-[12px] font-semibold text-rent-light">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">{t('trade.cancel')}</button>
            <button type="button" onClick={submit} disabled={sending || isEmpty || !target} className="btn-primary">
              <Icon.check className="h-4 w-4" />
              {sending ? t('trade.sending') : t('trade.send')}
            </button>
          </div>
        </div>
      )}
    >
      {/* Partner picker */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <span className="section-label mr-1">{t('trade.tradeWithLabel')}</span>
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setTargetId(p.id)}
            className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-all ${
              p.id === targetId
                ? 'border-brass bg-brass/20 text-parch'
                : 'border-white/10 bg-white/[0.03] text-parch/60 hover:bg-white/[0.08]'
            }`}
          >
            <PlayerAvatar player={p} sizeClassName="h-6 w-6" ringClassName="ring-1 ring-white/25" />
            <span className="max-w-[110px] truncate text-[12.5px] font-semibold">{p.nickname}</span>
            <span className="text-[11px] text-parch/40 tnum">{formatMoney(p.money)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        <SidePanel
          player={me}
          isYou
          tiles={myTiles}
          properties={gameState.properties}
          selectedIds={offerIds}
          onToggle={toggle(setOfferIds)}
          money={offerMoney}
          onMoney={setOfferMoney}
          accent="#a8342a"
        />

        <div className="flex shrink-0 items-center justify-center lg:flex-col">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-parch/50">
            <Icon.trade className="h-5 w-5" />
          </span>
        </div>

        {target ? (
          <SidePanel
            player={target}
            tiles={theirTiles}
            properties={gameState.properties}
            selectedIds={requestIds}
            onToggle={toggle(setRequestIds)}
            money={requestMoney}
            onMoney={setRequestMoney}
            accent="#1f7a5c"
          />
        ) : (
          <section className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 p-6">
            <p className="text-center text-[13px] text-parch/40">{t('trade.mustSelectPlayer')}</p>
          </section>
        )}
      </div>
    </Modal>
  );
}
