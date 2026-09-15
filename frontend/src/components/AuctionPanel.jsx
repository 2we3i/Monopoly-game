// AuctionPanel.jsx
// The live auction, over the board for every player at once: which square,
// the leading bid and bidder, who is still in, and a countdown to the
// server's own deadline (corrected for this browser's clock, so it reads
// the same on every screen). Participants bid from here; the server
// checks every bid.

import { useEffect, useMemo, useState } from 'react';
import {
  formatMoney, getTileName, serverMsLeft, tileAccentColor,
} from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { useNow } from '../hooks/useNow';
import { usePendingAction } from '../hooks/usePendingAction';
import PlayerAvatar from './PlayerAvatar';
import Icon from './icons';

function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function AuctionPanel({ gameState, playerId, actions }) {
  const { t, language } = useTranslation();
  const { auction, board, players } = gameState;
  const now = useNow(!!auction, 200);
  const [collapsed, setCollapsed] = useState(false);
  const [custom, setCustom] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pending, run] = usePendingAction(gameState.receivedAt);
  const auctionId = auction?.id;

  useEffect(() => {
    setCollapsed(false);
    setCustom('');
    setConfirmLeave(false);
  }, [auctionId]);

  useEffect(() => {
    if (!confirmLeave) return undefined;
    const id = setTimeout(() => setConfirmLeave(false), 4000);
    return () => clearTimeout(id);
  }, [confirmLeave]);

  const bidsByPlayer = useMemo(() => {
    const map = {};
    (auction?.bids || []).forEach((b) => { map[b.playerId] = Math.max(map[b.playerId] || 0, b.amount); });
    return map;
  }, [auction?.bids]);

  if (!auction) return null;

  const tile = board[auction.tileId];
  const accent = tileAccentColor(tile);
  const msLeft = Math.max(0, serverMsLeft(auction.endsAt, gameState, now));
  const open = msLeft > 0;
  const urgent = msLeft <= 5000;
  const me = players.find((p) => p.id === playerId);
  const leader = players.find((p) => p.id === auction.highestBidderId);
  const takingPart = !!me && auction.participants.includes(playerId) && !me.bankrupt;
  const withdrawn = auction.withdrawn.includes(playerId);
  const leading = auction.highestBidderId === playerId;
  const minNext = auction.highestBidderId ? auction.highestBid + auction.minStep : auction.minBid;
  const myMoney = me?.money || 0;
  const canBid = takingPart && !withdrawn && !leading && open && myMoney >= minNext;
  const base = auction.highestBidderId ? auction.highestBid : 0;
  const quickBids = [...new Set([minNext, base + 50, base + 100, base + 200])]
    .filter((v) => v >= minNext && v <= myMoney)
    .slice(0, 3);
  const typed = custom.trim() === '' ? null : Number(custom);
  const typedValid = typed != null && Number.isInteger(typed) && typed >= minNext && typed <= myMoney;
  const timeFraction = Math.min(1, msLeft / (auction.duration || 30000));
  const reason = auction.reason === 'MORTGAGE_EXPIRED'
    ? t('auction.reason.MORTGAGE_EXPIRED', { name: players.find((p) => p.id === auction.previousOwnerId)?.nickname || '—' })
    : t('auction.reason.DECLINED');

  const bid = (amount, key) => run(key, () => {
    actions.placeBid(auction.id, amount);
    setCustom('');
  });

  if (collapsed) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-bold shadow-deep backdrop-blur-xl ${
            urgent ? 'border-rent-light/60 bg-rent/85 text-white' : 'border-brass/50 bg-felt-800/95 text-brass-light'
          }`}
        >
          <Icon.bank className="h-4 w-4" />
          {t('auction.expand', { time: clock(msLeft) })}
          <span className="text-parch tnum">{auction.highestBidderId ? formatMoney(auction.highestBid) : '—'}</span>
          <Icon.chevronUp className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 top-3 z-40 flex items-end justify-center px-3">
      <section
        aria-live="polite"
        aria-label={t('auction.title')}
        className="pointer-events-auto flex max-h-full w-full max-w-lg animate-slide-up flex-col overflow-hidden rounded-2xl border border-brass/50 bg-felt-700/95 shadow-deep backdrop-blur-2xl"
      >
        <div className="h-1.5 w-full shrink-0 bg-white/10">
          <div className={`h-full transition-[width] duration-200 ${urgent ? 'bg-rent-light' : 'bg-brass'}`} style={{ width: `${timeFraction * 100}%` }} />
        </div>

        <header className="flex shrink-0 items-center gap-3 px-4 pt-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: accent }}>
            <Icon.bank className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-black uppercase tracking-[0.14em] text-brass-light">{t('auction.title')} · {reason}</p>
            <h3 className="truncate font-display text-[18px] font-black leading-tight text-parch">{getTileName(tile, language)}</h3>
            <p className="text-[11.5px] text-parch/45 tnum">{t('tooltip.price')} ${tile.price}</p>
          </div>
          <div role="timer" className={`flex shrink-0 flex-col items-end ${urgent ? 'text-rent-light' : 'text-parch'}`}>
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-60">{t('auction.timeLeft')}</span>
            <span className={`font-mono text-[24px] font-black leading-none tnum ${urgent && open ? 'animate-pulse' : ''}`}>
              {open ? clock(msLeft) : t('auction.closing')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title={t('auction.minimize')}
            aria-label={t('auction.minimize')}
            className="-mr-1 self-start rounded-lg p-1.5 text-parch/40 hover:bg-white/10 hover:text-parch"
          >
            <Icon.chevronDown className="h-4 w-4" />
          </button>
        </header>

        <div className="scrollbar-thin min-h-0 overflow-y-auto px-4 pb-3">
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
            <div>
              <p className="section-label">{t('auction.currentBid')}</p>
              <p className="font-display text-[22px] font-black leading-tight text-brass-light tnum">
                {auction.highestBidderId ? formatMoney(auction.highestBid) : '—'}
              </p>
            </div>
            <p className="text-right text-[12.5px] font-semibold text-parch/70">
              {leading ? t('auction.youLead') : leader ? t('auction.leader', { name: leader.nickname }) : t('auction.noBids')}
            </p>
          </div>

          <p className="section-label mb-1.5 mt-3">{t('auction.participants')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {auction.participants.map((id) => {
              const p = players.find((x) => x.id === id);
              if (!p) return null;
              const out = auction.withdrawn.includes(id) || p.bankrupt;
              const lead = auction.highestBidderId === id;
              return (
                <li
                  key={id}
                  className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11.5px] ${
                    lead ? 'border-brass/60 bg-brass/15 text-parch' : out ? 'border-white/[0.06] text-parch/35' : 'border-white/[0.1] bg-white/[0.04] text-parch/75'
                  }`}
                >
                  <PlayerAvatar player={p} sizeClassName="h-5 w-5" ringClassName="ring-1 ring-white/20" />
                  <span className={`max-w-[7rem] truncate font-semibold ${out ? 'line-through' : ''}`}>
                    {p.nickname}{id === playerId ? ` (${t('auction.you')})` : ''}
                  </span>
                  {bidsByPlayer[id] ? <span className="font-bold tnum">${bidsByPlayer[id]}</span> : null}
                  <span className="text-[10px] uppercase opacity-70">
                    {lead ? t('auction.statusLeading') : out ? t('auction.statusOut') : t('auction.statusIn')}
                  </span>
                </li>
              );
            })}
          </ul>

          {takingPart && !withdrawn ? (
            <div className="mt-3 flex flex-col gap-2">
              {leading && (
                <p className="rounded-lg bg-brass/15 px-3 py-2 text-center text-[12.5px] font-semibold text-brass-light">
                  {t('auction.youLead')} · {t('auction.leaderCantLeave')}
                </p>
              )}
              {!leading && myMoney < minNext && (
                <p className="rounded-lg bg-rent/15 px-3 py-2 text-center text-[12px] font-semibold text-rent-light">
                  {t('auction.cantAfford')} ({formatMoney(minNext)})
                </p>
              )}
              {!leading && myMoney >= minNext && (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {quickBids.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        disabled={!canBid || !!pending}
                        onClick={() => bid(amount, `quick:${amount}`)}
                        className="btn-primary px-2 py-2.5 text-[14px]"
                      >
                        {pending === `quick:${amount}` ? '…' : t('auction.bid', { amount })}
                      </button>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (typedValid && canBid) bid(typed, 'custom');
                    }}
                    className="flex gap-1.5"
                  >
                    <label className="flex flex-1 items-center rounded-lg border border-white/12 bg-black/25 px-2">
                      <span className="text-[12px] text-parch/40">$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={minNext}
                        max={myMoney}
                        step="1"
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder={t('auction.minBid', { amount: minNext })}
                        aria-label={t('auction.customBid')}
                        className="w-full bg-transparent px-1 py-2 text-[13px] font-semibold text-parch outline-none placeholder:text-parch/30 tnum"
                      />
                    </label>
                    <button type="submit" disabled={!canBid || !typedValid || !!pending} className="btn-ghost px-4 py-2 text-[12.5px]">
                      {pending === 'custom' ? '…' : t('auction.place')}
                    </button>
                  </form>
                </>
              )}
              {!leading && (
                <button
                  type="button"
                  disabled={!open || !!pending}
                  onClick={() => {
                    if (!confirmLeave) {
                      setConfirmLeave(true);
                      return;
                    }
                    run('leave', () => actions.withdrawAuction(auction.id));
                  }}
                  className={`${confirmLeave ? 'btn-danger' : 'btn-quiet'} py-2 text-[12px]`}
                >
                  {confirmLeave ? t('auction.confirmWithdraw') : t('auction.withdraw')}
                </button>
              )}
              <p className="text-center text-[10.5px] text-parch/35">{t('auction.extendHint')}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-center text-[12px] text-parch/50">
              {withdrawn ? t('auction.youWithdrew') : t('auction.spectator')}
            </p>
          )}

          {gameState.auctionQueue?.length > 0 && (
            <p className="mt-2 text-center text-[11px] text-parch/40">{t('auction.queue', { count: gameState.auctionQueue.length })}</p>
          )}
        </div>
      </section>
    </div>
  );
}
