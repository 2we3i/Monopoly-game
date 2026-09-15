// TradePanel.jsx
// The pending-trade list that lives in the sidebar. Each row states, in
// the reader's own terms, exactly what leaves and what arrives, with a
// value summary so a deal can be judged without opening anything.

import { useEffect, useRef } from 'react';
import { assetValue, formatMoney } from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { PropertyTag } from './PropertyChip';
import PlayerAvatar from './PlayerAvatar';
import Icon from './icons';

function sideValue(tileIds, money, board, properties) {
  return tileIds.reduce((sum, id) => sum + assetValue(board[id], properties[id]), money || 0);
}

function SideBlock({ label, accent, tileIds, money, board, properties, total, tone }) {
  const { t, language } = useTranslation();
  const empty = tileIds.length === 0 && !money;
  return (
    <div className={`flex-1 rounded-xl border p-2.5 ${tone === 'out' ? 'border-rent/25 bg-rent/[0.07]' : 'border-go/25 bg-go/[0.07]'}`}>
      <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${tone === 'out' ? 'text-rent-light/80' : 'text-go-light/80'}`}>
        {label}
      </p>
      {empty ? (
        <p className="text-[12px] italic text-parch/35">{t('trade.nothing')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {money > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-parch">
              <Icon.cash className="h-3.5 w-3.5 text-brass-light" />
              <span className="tnum">{formatMoney(money)}</span>
            </span>
          )}
          <div className="flex flex-wrap gap-1">
            {tileIds.map((id) => (
              <PropertyTag key={id} tile={board[id]} propState={properties[id]} />
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 border-t border-white/10 pt-1.5 text-[10.5px] text-parch/40">
        {t('trade.estimatedValue')} <span className="font-bold text-parch/70 tnum">{formatMoney(total)}</span>
      </p>
    </div>
  );
}

function TradeCard({
  trade, playerId, players, board, properties, onAccept, onDecline, onCancel, focused = false, focusAt = null,
}) {
  const { t } = useTranslation();
  const cardRef = useRef(null);
  // Opened from a trade alert: bring this offer into view and mark it.
  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [focused, focusAt]);
  const isRecipient = trade.toPlayerId === playerId;
  const other = players.find((p) => p.id === (isRecipient ? trade.fromPlayerId : trade.toPlayerId));
  if (!other) return null;

  // Always phrased from the reader's point of view: "give" is whatever
  // leaves THEIR side, no matter which end of the proposal they are on.
  const giveTiles = isRecipient ? trade.requestTileIds : trade.offerTileIds;
  const giveMoney = isRecipient ? trade.requestMoney : trade.offerMoney;
  const getTiles = isRecipient ? trade.offerTileIds : trade.requestTileIds;
  const getMoney = isRecipient ? trade.offerMoney : trade.requestMoney;

  const giveTotal = sideValue(giveTiles, giveMoney, board, properties);
  const getTotal = sideValue(getTiles, getMoney, board, properties);
  const delta = getTotal - giveTotal;

  return (
    <div
      ref={cardRef}
      data-trade-id={trade.id}
      className={`overflow-hidden rounded-xl border transition-shadow ${isRecipient ? 'border-brass/45 bg-brass/[0.07]' : 'border-white/[0.09] bg-white/[0.03]'} ${
        focused ? 'shadow-[0_0_0_3px_rgba(227,187,92,0.85),0_0_24px_rgba(201,152,47,0.45)]' : ''
      }`}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <PlayerAvatar player={other} sizeClassName="h-7 w-7" ringClassName="ring-2 ring-white/20" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-parch">
            {isRecipient ? t('trade.incomingFrom', { name: other.nickname }) : t('trade.outgoingTo', { name: other.nickname })}
          </p>
          <p className="text-[10.5px] text-parch/40">
            {isRecipient ? t('trade.awaitingYou') : t('trade.awaitingThem')}
          </p>
        </div>
        {isRecipient && <span className="pill animate-pop-in bg-brass text-ink">{t('trade.new')}</span>}
      </div>

      <div className="flex gap-2 p-2.5">
        <SideBlock label={t('trade.youGiveShort')} tileIds={giveTiles} money={giveMoney} board={board} properties={properties} total={giveTotal} tone="out" />
        <div className="flex shrink-0 items-center">
          <Icon.trade className="h-4 w-4 text-parch/30" />
        </div>
        <SideBlock label={t('trade.youGetShort')} tileIds={getTiles} money={getMoney} board={board} properties={properties} total={getTotal} tone="in" />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-3 py-2">
        <span className={`text-[11.5px] font-semibold ${delta > 0 ? 'text-go-light' : delta < 0 ? 'text-rent-light' : 'text-parch/50'}`}>
          {delta === 0
            ? t('trade.evenDeal')
            : delta > 0
              ? t('trade.inYourFavor', { amount: formatMoney(Math.abs(delta)) })
              : t('trade.againstYou', { amount: formatMoney(Math.abs(delta)) })}
        </span>
        {isRecipient ? (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => onDecline(trade.id)} className="btn-danger px-3 py-1.5 text-xs">
              <Icon.close className="h-3.5 w-3.5" />{t('trade.decline')}
            </button>
            <button type="button" onClick={() => onAccept(trade.id)} className="btn-success px-3 py-1.5 text-xs">
              <Icon.check className="h-3.5 w-3.5" />{t('trade.accept')}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => onCancel(trade.id)} className="btn-ghost px-3 py-1.5 text-xs">
            {t('trade.cancelOffer')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TradePanel({
  gameState, playerId, onOpenComposer, onAcceptTrade, onDeclineTrade, onCancelTrade, focus = null,
}) {
  const { t } = useTranslation();
  const me = gameState.players.find((p) => p.id === playerId);
  const myTrades = gameState.trades.filter((tr) => tr.fromPlayerId === playerId || tr.toPlayerId === playerId);
  const others = gameState.players.filter((p) => p.id !== playerId && !p.bankrupt);
  if (!me) return null;

  const incoming = myTrades.filter((tr) => tr.toPlayerId === playerId);
  const outgoing = myTrades.filter((tr) => tr.fromPlayerId === playerId);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <button type="button" onClick={() => onOpenComposer(null)} disabled={others.length === 0} className="btn-primary w-full">
          <Icon.trade className="h-4 w-4" />
          {t('trade.propose')}
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        {myTrades.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
              <Icon.trade className="h-6 w-6 text-parch/25" />
            </span>
            <p className="text-[13px] font-semibold text-parch/60">{t('trade.noPendingTrades')}</p>
            <p className="text-[11.5px] leading-relaxed text-parch/35">{t('trade.emptyHint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {incoming.length > 0 && (
              <section className="flex flex-col gap-2">
                <p className="section-label flex items-center gap-1.5">
                  {t('trade.incoming')}
                  <span className="rounded-full bg-brass/25 px-1.5 text-[10px] text-brass-light tnum">{incoming.length}</span>
                </p>
                {incoming.map((trade) => (
                  <TradeCard
                    key={trade.id}
                    focused={focus?.id === trade.id}
                    focusAt={focus?.at}
                    trade={trade}
                    playerId={playerId}
                    players={gameState.players}
                    board={gameState.board}
                    properties={gameState.properties}
                    onAccept={onAcceptTrade}
                    onDecline={onDeclineTrade}
                    onCancel={onCancelTrade}
                  />
                ))}
              </section>
            )}
            {outgoing.length > 0 && (
              <section className="flex flex-col gap-2">
                <p className="section-label">{t('trade.outgoing')}</p>
                {outgoing.map((trade) => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    playerId={playerId}
                    players={gameState.players}
                    board={gameState.board}
                    properties={gameState.properties}
                    onAccept={onAcceptTrade}
                    onDecline={onDeclineTrade}
                    onCancel={onCancelTrade}
                  />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
