// ActionDock.jsx
// The one place a player looks to act. Whatever the game is waiting for
// right now is the biggest, brightest control on screen; everything else
// a player might want (portfolio, trading, conceding) sits beside it at a
// lower weight instead of being scattered across the interface.

import { useEffect } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import PlayerAvatar from './PlayerAvatar';
import { hexToRgba } from '../colorUtils';
import Icon from './icons';

// Resolves "what is the game waiting for?" into a single description the
// dock and the keyboard shortcut both read from, so they can never
// disagree about what the primary action is.
function primaryActionFor({ gameState, me, isMyTurn, actions, t }) {
  if (!me || me.bankrupt) return null;
  const pending = gameState.pendingAction;
  const mine = pending?.playerId === me.id;

  if (mine && pending?.type === 'BUY_DECISION') {
    return { key: 'buy', label: t('dock.decidePurchase'), icon: Icon.bank, disabled: true, muted: true, hint: t('dock.decidePurchaseHint') };
  }
  if (mine && pending?.type === 'CARD_REVEAL') {
    return { key: 'card', label: t('card.continue'), icon: Icon.chance, onClick: actions.acknowledgeCard };
  }
  if (!isMyTurn) return null;
  if (pending) return null;

  if (gameState.phase === 'ROLLING') {
    return {
      key: 'roll',
      label: me.inJail ? t('game.tryForDoubles') : t('game.rollDice'),
      icon: Icon.dice,
      onClick: actions.rollDice,
      hint: me.inJail ? t('dock.jailHint') : t('dock.rollHint'),
    };
  }
  if (gameState.phase === 'ACTION') {
    return {
      key: 'end',
      label: t('game.endTurn'),
      icon: Icon.check,
      onClick: actions.endTurn,
      disabled: me.money < 0,
      hint: me.money < 0 ? t('dock.settleDebtFirst') : t('dock.endTurnHint'),
    };
  }
  return null;
}

export default function ActionDock({
  gameState, me, isMyTurn, actions, onOpenTrade, onOpenManage, tradeCount, propertyCount, diceSlot,
}) {
  const { t } = useTranslation();
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const primary = primaryActionFor({ gameState, me, isMyTurn, actions, t });
  const inDebt = !!me && me.money < 0;
  const showJail = isMyTurn && gameState.phase === 'ROLLING' && me?.inJail && !gameState.pendingAction;

  // Space / Enter fires whatever the dock's primary button is, so a whole
  // turn can be played without moving the mouse.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.tagName === 'BUTTON')) return;
      if (!primary?.onClick || primary.disabled) return;
      e.preventDefault();
      primary.onClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [primary]);

  if (!me) return null;
  const PrimaryIcon = primary?.icon;

  return (
    <div className="panel flex flex-col gap-2 p-2.5">
      {inDebt && (
        <div className="flex items-center gap-2 rounded-lg border border-rent/40 bg-rent/15 px-3 py-2">
          <Icon.warning className="h-4 w-4 shrink-0 text-rent-light" />
          <p className="flex-1 text-[12px] font-medium text-rent-light">
            {t('game.inDebt', { amount: Math.abs(me.money) })}
          </p>
          <button type="button" onClick={actions.declareBankruptcy} className="btn-danger shrink-0 px-3 py-1.5 text-[11.5px]">
            {t('game.declareBankruptcy')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Whose turn it is - identity first, so the dock always answers
            "am I waiting or acting?" before anything else. */}
        <div
          className="flex min-w-[13rem] flex-1 basis-[15rem] items-center gap-2.5 rounded-xl border px-3 py-2"
          style={{
            borderColor: hexToRgba(currentPlayer?.color || '#888', isMyTurn ? 0.6 : 0.25),
            backgroundColor: hexToRgba(currentPlayer?.color || '#888', isMyTurn ? 0.16 : 0.07),
          }}
        >
          {currentPlayer && <PlayerAvatar player={currentPlayer} sizeClassName="h-8 w-8" ringClassName="ring-2 ring-white/25" />}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-parch">
              {isMyTurn ? t('game.yourTurn') : t('game.nameTurn', { name: currentPlayer?.nickname })}
            </p>
            <p className="truncate text-[11px] text-parch/45">
              {primary?.hint || (isMyTurn ? t('dock.yourMove') : t('dock.waiting'))}
            </p>
          </div>
          {/* The last roll, mirrored out of the board: the board's own
              dice can be panned or zoomed out of sight, and "what did
              they roll?" should never require finding them again. */}
          {gameState.lastRoll && (
            <div className="flex shrink-0 items-center gap-1.5 border-l border-white/10 pl-2.5">
              {diceSlot}
              <span className="font-display text-[15px] font-bold text-parch/70 tnum">
                {gameState.lastRoll.d1 + gameState.lastRoll.d2}
              </span>
            </div>
          )}
        </div>

        {/* Primary action */}
        <div className="flex min-w-[12rem] flex-[2] basis-[16rem] items-center gap-2">
          {showJail ? (
            <>
              <button type="button" onClick={actions.rollDice} className="btn-primary min-w-0 flex-1 py-3 text-[15px]">
                <Icon.dice className="h-5 w-5" />
                {t('game.tryForDoubles')}
              </button>
              <button
                type="button"
                onClick={actions.payJailFine}
                disabled={me.money < 50}
                className="btn-ghost py-3"
              >
                {t('game.payJailFine')}
              </button>
              {me.getOutOfJailFreeCards > 0 && (
                <button type="button" onClick={actions.useJailCard} className="btn-ghost py-3">
                  <Icon.scroll className="h-4 w-4" />
                  {t('game.useJailCard')}
                </button>
              )}
            </>
          ) : primary ? (
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled || !primary.onClick}
              className={`${primary.muted ? 'btn-ghost' : primary.key === 'end' ? 'btn-success' : 'btn-primary'} min-w-0 flex-1 py-3 text-[15px]`}
            >
              {PrimaryIcon && <PrimaryIcon className="h-5 w-5" />}
              {primary.label}
            </button>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 text-[13px] text-parch/35">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-parch/40" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-parch/40 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-parch/40 [animation-delay:300ms]" />
              </span>
              {t('dock.waitingFor', { name: currentPlayer?.nickname || '' })}
            </div>
          )}
        </div>

        {/* Always-available secondary actions */}
        <div className="flex shrink-0 grow items-center justify-end gap-2 sm:grow-0">
          <button type="button" onClick={onOpenManage} className="btn-ghost relative py-3">
            <Icon.bank className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dock.myProperties')}</span>
            <span className="rounded-md bg-white/10 px-1.5 text-[11px] font-bold tnum">{propertyCount}</span>
          </button>
          <button type="button" onClick={() => onOpenTrade(null)} className="btn-ghost relative py-3">
            <Icon.trade className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dock.trade')}</span>
            {tradeCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brass px-1 text-[10px] font-black text-ink ring-2 ring-felt-700">
                {tradeCount > 9 ? '9+' : tradeCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
