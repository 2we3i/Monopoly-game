// TradeAlert.jsx
// A trade offer arriving for this player is announced where it cannot be
// missed - on top of whatever they are looking at, dialogs included - with
// who sent it, what they offer, what they want back, and the answers.
// Each offer is announced once per browser session; after that it lives on
// in the Trades tab (and its badges) until it is answered.

import { useEffect, useState } from 'react';
import { formatMoney } from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { usePendingAction } from '../hooks/usePendingAction';
import { PropertyTag } from './PropertyChip';
import PlayerAvatar from './PlayerAvatar';
import Icon from './icons';

function loadSeen(key) {
  try {
    const list = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function Side({
  label, tone, tileIds, money, board, properties,
}) {
  const { t } = useTranslation();
  const empty = tileIds.length === 0 && !money;
  return (
    <div className={`min-w-0 flex-1 rounded-xl border p-2 ${tone === 'in' ? 'border-go/30 bg-go/[0.08]' : 'border-rent/30 bg-rent/[0.08]'}`}>
      <p className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${tone === 'in' ? 'text-go-light/85' : 'text-rent-light/85'}`}>{label}</p>
      {empty ? (
        <p className="text-[12px] italic text-parch/40">{t('tradeAlert.nothing')}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {money > 0 && (
            <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-parch tnum">
              <Icon.cash className="h-3.5 w-3.5 text-brass-light" />
              {formatMoney(money)}
            </span>
          )}
          {tileIds.map((id) => <PropertyTag key={id} tile={board[id]} propState={properties[id]} />)}
        </div>
      )}
    </div>
  );
}

// compact: a one-line version for small screens while an auction is on,
// so the offer is still announced without covering the auction's clock.
export default function TradeAlert({
  gameState, playerId, onAccept, onDecline, onDetails, compact = false,
}) {
  const { t } = useTranslation();
  const key = `landmark_seen_trades_${gameState.roomCode}_${playerId}`;
  const [seen, setSeen] = useState(() => loadSeen(key));
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, run] = usePendingAction(gameState.receivedAt);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(seen.slice(-60)));
    } catch {
      // Storage blocked: offers are still remembered for this page.
    }
  }, [key, seen]);

  const incoming = gameState.trades.filter((tr) => tr.toPlayerId === playerId && tr.status === 'PENDING');
  const unseen = incoming.filter((tr) => !seen.includes(tr.id));
  const trade = unseen[unseen.length - 1];
  const tradeId = trade?.id;

  useEffect(() => {
    setConfirming(false);
    setExpanded(false);
  }, [tradeId]);
  useEffect(() => {
    if (!confirming) return undefined;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

  if (!trade) return null;
  const from = gameState.players.find((p) => p.id === trade.fromPlayerId);
  if (!from) return null;
  const markSeen = () => setSeen((list) => (list.includes(trade.id) ? list : [...list, trade.id]));

  if (compact && !expanded) {
    return (
      <div
        role="alertdialog"
        aria-live="assertive"
        aria-label={t('tradeAlert.title')}
        className="pointer-events-auto flex w-full animate-slide-up items-center gap-2 rounded-2xl border border-brass/60 bg-felt-700/95 py-1.5 pl-2 pr-1 shadow-deep ring-4 ring-brass/20 backdrop-blur-2xl"
      >
        <span className="relative flex shrink-0">
          <PlayerAvatar player={from} sizeClassName="h-7 w-7" ringClassName="ring-2 ring-brass/70" />
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 animate-pulse items-center justify-center rounded-full bg-brass text-ink">
            <Icon.trade className="h-2 w-2" />
          </span>
        </span>
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-parch">
          {t('trade.incomingFrom', { name: from.nickname })}
          {unseen.length > 1 && <span className="ml-1 text-brass-light">· {t('tradeAlert.more', { count: unseen.length - 1 })}</span>}
        </p>
        <button type="button" onClick={() => { markSeen(); onDetails(trade.id); }} className="btn-ghost shrink-0 px-2 py-1 text-[11.5px]">
          {t('tradeAlert.details')}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title={t('tradeAlert.title')}
          aria-label={t('tradeAlert.title')}
          className="shrink-0 rounded-lg p-1.5 text-parch/55 hover:bg-white/10 hover:text-parch"
        >
          <Icon.chevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={markSeen}
          title={t('tradeAlert.dismiss')}
          aria-label={t('tradeAlert.dismiss')}
          className="shrink-0 rounded-lg p-1.5 text-parch/45 hover:bg-white/10 hover:text-parch"
        >
          <Icon.close className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={t('tradeAlert.title')}
      className="pointer-events-auto w-full animate-slide-up overflow-hidden rounded-2xl border border-brass/60 bg-felt-700/95 shadow-deep ring-4 ring-brass/20 backdrop-blur-2xl"
    >
      <div className="flex items-center gap-2.5 border-b border-white/[0.08] bg-brass/10 px-3 py-2">
        <span className="relative flex shrink-0">
          <PlayerAvatar player={from} sizeClassName="h-8 w-8" ringClassName="ring-2 ring-brass/70" />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 animate-pulse items-center justify-center rounded-full bg-brass text-ink">
            <Icon.trade className="h-2.5 w-2.5" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-black uppercase tracking-[0.14em] text-brass-light">{t('tradeAlert.title')}</p>
          <p className="truncate text-[13.5px] font-bold text-parch">{t('trade.incomingFrom', { name: from.nickname })}</p>
        </div>
        {unseen.length > 1 && <span className="pill shrink-0 bg-brass text-ink">{t('tradeAlert.more', { count: unseen.length - 1 })}</span>}
        <button
          type="button"
          onClick={markSeen}
          title={t('tradeAlert.dismiss')}
          aria-label={t('tradeAlert.dismiss')}
          className="shrink-0 rounded-lg p-1.5 text-parch/45 hover:bg-white/10 hover:text-parch"
        >
          <Icon.close className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-2 p-2.5">
        <Side label={t('tradeAlert.offers')} tone="in" tileIds={trade.offerTileIds} money={trade.offerMoney} board={gameState.board} properties={gameState.properties} />
        <Side label={t('tradeAlert.wants')} tone="out" tileIds={trade.requestTileIds} money={trade.requestMoney} board={gameState.board} properties={gameState.properties} />
      </div>

      <div className="flex gap-1.5 border-t border-white/[0.08] bg-black/20 p-2.5">
        <button type="button" disabled={!!pending} onClick={() => run('decline', () => onDecline(trade.id))} className="btn-danger flex-1 px-2 py-2 text-[12.5px]">
          <Icon.close className="h-3.5 w-3.5" />
          {pending === 'decline' ? '…' : t('trade.decline')}
        </button>
        <button
          type="button"
          onClick={() => { markSeen(); onDetails(trade.id); }}
          className="btn-ghost flex-1 px-2 py-2 text-[12.5px]"
        >
          <Icon.search className="h-3.5 w-3.5" />
          {t('tradeAlert.details')}
        </button>
        <button
          type="button"
          disabled={!!pending}
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            run('accept', () => onAccept(trade.id));
          }}
          className="btn-success flex-1 px-2 py-2 text-[12.5px]"
        >
          <Icon.check className="h-3.5 w-3.5" />
          {pending === 'accept' ? '…' : confirming ? t('tradeAlert.confirmAccept') : t('trade.accept')}
        </button>
      </div>
    </div>
  );
}
