// GameUI.jsx
// The main gameplay screen once a room has left the LOBBY phase. Composes:
//  - Board (center)
//  - Dice + action panel (bottom, or floating on mobile)
//  - Sidebar: player list + chat (tabs on mobile, side-by-side on desktop)
//  - Overlays: pending buy-decision prompt, card reveal, property modal,
//    game-over screen
//
// Also owns the sound-effect triggers, watching for meaningful state
// transitions (log entries, pending actions) and playing the matching cue.

import { useEffect, useRef, useState } from 'react';
import Board from './Board';
import Dice from './Dice';
import PlayerCard from './PlayerCard';
import Chat from './Chat';
import PropertyModal from './PropertyModal';
import LanguageSwitcher from './LanguageSwitcher';
import { getTile } from '../boardData';
import { sounds } from '../sounds';
import { useTranslation } from '../i18n/LanguageContext';
import { formatLogEntry } from '../i18n/logFormatter';

function propertyCountFor(playerId, properties) {
  return Object.values(properties).filter((p) => p.ownerId === playerId).length;
}

function BuyPrompt({ tile, player, onBuy, onDecline }) {
  const { t } = useTranslation();
  return (
    <div className="animate-rise-in fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-sm px-3 pb-3 sm:bottom-6 sm:px-4">
      <div className="rounded-2xl border border-brass/30 bg-board p-5 shadow-board texture-parchment">
        <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-brass-deep">{t('buy.landedOnUnowned')}</p>
        <h3 className="mb-1 font-display text-2xl font-bold text-ink">{tile.name}</h3>
        <p className="mb-4 text-sm text-ink-soft">
          {t('buy.buyFor', { price: tile.price, money: player.money.toLocaleString() })}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-xl border-2 border-ink/15 px-4 py-3 font-semibold text-ink-soft transition-transform active:scale-95"
          >
            {t('buy.pass')}
          </button>
          <button
            type="button"
            onClick={onBuy}
            disabled={player.money < tile.price}
            className="flex-1 rounded-xl bg-gradient-to-b from-brass-bright to-brass px-4 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-95 disabled:opacity-40"
          >
            {t('buy.buyForPrice', { price: tile.price })}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardPrompt({ pendingAction, onAcknowledge }) {
  const { t, language } = useTranslation();
  const isChance = pendingAction.deckName === 'chance';
  const cardText = pendingAction.card.text[language] || pendingAction.card.text.en;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-sm rounded-2xl border border-brass/25 bg-board p-6 text-center shadow-board texture-parchment">
        <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${isChance ? 'text-brass-deep' : 'text-go'}`}>
          {isChance ? t('card.chance') : t('card.communityChest')}
        </p>
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold shadow-tile ${isChance ? 'bg-gradient-to-b from-brass-bright to-brass text-brass-ink' : 'bg-go/15 text-go'}`}>
          {isChance ? '?' : '$'}
        </div>
        <p className="mb-5 text-base font-medium leading-snug text-ink">{cardText}</p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="w-full rounded-xl bg-gradient-to-b from-brass-bright to-brass px-4 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-95"
        >
          {t('card.continue')}
        </button>
      </div>
    </div>
  );
}

// CardToast.jsx (inline)
// A non-blocking notice shown to everyone EXCEPT the player who drew the
// card. That player already sees the full blocking CardPrompt modal (see
// below); without this, a card like "Advance to nearest Railroad" moves
// the drawing player's token immediately (see GameManager._applyCard),
// and everyone else just watches an opponent's token hop across the board
// with zero explanation - which reads as a bug rather than a card effect.
// This surfaces the same card text (already localized via formatLogEntry,
// same as the activity log) as a small toast, timed to appear alongside
// the token animation, and auto-dismisses on its own.
const CARD_TOAST_DURATION_MS = 4200;

function CardToast({ entry, onDone }) {
  const { t, language } = useTranslation();
  useEffect(() => {
    const id = setTimeout(onDone, CARD_TOAST_DURATION_MS);
    return () => clearTimeout(id);
  }, [entry, onDone]);

  const isChance = entry.type === 'DREW_CARD' && entry.params?.deckName === 'chance';

  return (
    <div className="animate-rise-in pointer-events-none fixed inset-x-0 top-4 z-30 mx-auto w-full max-w-sm px-3">
      <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-brass/25 bg-board px-4 py-3 shadow-board texture-parchment">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-tile ${
            isChance ? 'bg-gradient-to-b from-brass-bright to-brass text-brass-ink' : 'bg-go/15 text-go'
          }`}
        >
          {isChance ? '?' : '$'}
        </div>
        <div className="min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-wide ${isChance ? 'text-brass-deep' : 'text-go'}`}>
            {isChance ? t('card.chance') : t('card.communityChest')}
          </p>
          <p className="text-sm leading-snug text-ink">{formatLogEntry(entry, t, language)}</p>
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({ gameState, playerId, onLeave }) {
  const { t } = useTranslation();
  const winner = gameState.players.find((p) => p.id === gameState.winnerId);
  const iWon = winner?.id === playerId;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-sm rounded-2xl border border-brass/25 bg-board p-7 text-center shadow-board texture-parchment">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-brass-bright to-brass shadow-tile">
          <svg viewBox="0 0 24 24" className="h-9 w-9 text-brass-ink" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M8 21h8M12 17v4M6 4h12v3a6 6 0 01-12 0V4zM6 6H4a2 2 0 002 2M18 6h2a2 2 0 01-2 2" />
          </svg>
        </div>
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-brass-deep">{t('gameOver.title')}</p>
        <h2 className="mb-2 font-display text-2xl font-bold text-ink">
          {iWon ? t('gameOver.youWon') : t('gameOver.nameWins', { name: winner?.nickname })}
        </h2>
        <p className="mb-6 text-sm text-ink-faint">
          {iWon ? t('gameOver.subtitleWon') : t('gameOver.subtitleLost')}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="w-full rounded-xl bg-gradient-to-b from-brass-bright to-brass px-4 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-95"
        >
          {t('gameOver.backToLobby')}
        </button>
      </div>
    </div>
  );
}

// The primary "Roll dice" action now lives in the board's own center (see
// Board.jsx's BoardCenter) since that's a stronger, more central place for
// the game's signature moment than a separate panel below the fold. This
// panel now only holds secondary/contextual actions: jail options, ending
// the turn once it's resolved, and debt resolution. It renders nothing
// when there's genuinely no action available, rather than showing an
// empty shell.
function ActionPanel({ gameState, me, isMyTurn, actions }) {
  const { t } = useTranslation();
  if (!me || me.bankrupt) return null;

  const inDebt = me.money < 0;
  const showJailOptions = isMyTurn && gameState.phase === 'ROLLING' && me.inJail && !gameState.pendingAction;
  const showEndTurn = isMyTurn && gameState.phase === 'ACTION' && !gameState.pendingAction;
  const showAnything = showJailOptions || showEndTurn || inDebt;

  if (!showAnything) return null;

  return (
    <div className="animate-rise-in rounded-2xl border border-brass/15 bg-board p-4 shadow-panel texture-parchment">
      {inDebt && (
        <p className="mb-3 rounded-lg bg-rent/10 px-3 py-2 text-sm font-medium text-rent">
          {t('game.inDebt', { amount: Math.abs(me.money) })}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {showJailOptions && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={actions.payJailFine}
              disabled={me.money < 50}
              className="flex-1 rounded-xl bg-gradient-to-b from-brass-bright to-brass px-4 py-3 text-sm font-semibold text-brass-ink shadow-tile transition-transform active:scale-95 disabled:opacity-40"
            >
              {t('game.payJailFine')}
            </button>
            {me.getOutOfJailFreeCards > 0 && (
              <button
                type="button"
                onClick={actions.useJailCard}
                className="flex-1 rounded-xl border-2 border-brass px-4 py-3 text-sm font-semibold text-brass-deep transition-transform active:scale-95"
              >
                {t('game.useJailCard')}
              </button>
            )}
          </div>
        )}
        {showEndTurn && (
          <button
            type="button"
            onClick={actions.endTurn}
            disabled={inDebt}
            className="w-full rounded-xl bg-ink px-4 py-3.5 font-semibold text-board-tile shadow-tile transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {t('game.endTurn')}
          </button>
        )}
        {inDebt && (
          <button
            type="button"
            onClick={actions.declareBankruptcy}
            className="w-full rounded-xl border-2 border-rent px-4 py-2.5 text-sm font-semibold text-rent transition-transform active:scale-[0.98]"
          >
            {t('game.declareBankruptcy')}
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityLog({ log }) {
  const { t, language } = useTranslation();
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [log.length]);
  const recent = log.slice(-30);
  if (recent.length === 0) return null;
  return (
    <div
      ref={scrollRef}
      className="max-h-28 overflow-y-auto scrollbar-thin rounded-xl border border-white/10 bg-table-deep/50 p-3 text-xs leading-relaxed text-board-tile/70"
    >
      {recent.map((entry, i) => (
        <p key={i} className="py-0.5">{formatLogEntry(entry, t, language)}</p>
      ))}
    </div>
  );
}

export default function GameUI({ gameState, playerId, actions, onLeave, chatMessages, sendChat }) {
  const { t } = useTranslation();
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('players'); // 'players' | 'chat'
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [cardToast, setCardToast] = useState(null);
  const lastLogLength = useRef(gameState.log.length);
  const lastToastLogLength = useRef(gameState.log.length);
  const isFirstLogRender = useRef(true);
  const prevPendingRef = useRef(gameState.pendingAction);
  const prevTurnPlayerRef = useRef(gameState.currentPlayerIndex);
  const lastSeenChatLength = useRef(chatMessages.length);
  const isFirstChatRender = useRef(true);

  const me = gameState.players.find((p) => p.id === playerId);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === playerId;
  const selectedTile = selectedTileId != null ? getTile(selectedTileId) : null;
  const hasUnreadChat = unreadChatCount > 0;

  // Unread chat tracking: play a notification sound and bump the unread
  // badge whenever a new message arrives while the Chat tab isn't the
  // active one. Own outgoing messages don't count as "unread" (you know
  // what you just sent), and the very first render (loading existing
  // history on join/reconnect) shouldn't ding either - only genuinely new
  // messages that arrive during this session should notify.
  useEffect(() => {
    if (isFirstChatRender.current) {
      isFirstChatRender.current = false;
      lastSeenChatLength.current = chatMessages.length;
      return;
    }
    if (chatMessages.length > lastSeenChatLength.current) {
      const newMessages = chatMessages.slice(lastSeenChatLength.current);
      const newFromOthers = newMessages.filter((m) => !m.system && m.playerId !== playerId);
      if (newFromOthers.length > 0 && sidebarTab !== 'chat') {
        sounds.chatMessage();
        setUnreadChatCount((n) => n + newFromOthers.length);
      }
    }
    lastSeenChatLength.current = chatMessages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length]);

  // Switching to the Chat tab marks everything read.
  useEffect(() => {
    if (sidebarTab === 'chat' && unreadChatCount > 0) {
      setUnreadChatCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarTab]);

  // Sound effects: watch for new log entries and match on their
  // structured `type` field (see logFormatter.js / backend addLog) rather
  // than pattern-matching English words in a pre-rendered sentence - this
  // is both correct for i18n (the message text may now be in any
  // language) and more robust in general than substring matching.
  useEffect(() => {
    if (gameState.log.length > lastLogLength.current) {
      const newEntries = gameState.log.slice(lastLogLength.current);
      newEntries.forEach((entry) => {
        const type = entry.type || '';
        if (type === 'BOUGHT_PROPERTY') sounds.purchase();
        else if (type === 'BANKRUPTCY' || type === 'AUTO_BANKRUPTCY') sounds.bankruptcy();
        else if (type === 'COLLECTED_GO' || type === 'WIN' || type === 'CARD_COLLECT' || type === 'FREE_PARKING_COLLECT') sounds.collectMoney();
        else if (type === 'PAID_RENT' || type === 'PAID_TAX' || type === 'PAID_JAIL_FINE') sounds.payMoney();
      });
    }
    lastLogLength.current = gameState.log.length;
  }, [gameState.log.length]);

  // Card toast: when someone else draws a Chance/Community Chest card, the
  // card itself may move their token (see GameManager._applyCard) before
  // they've even acknowledged it - they see the full blocking CardPrompt,
  // but everyone else just watches a token move for no visible reason.
  // Surface the same card text as a brief, non-blocking toast for
  // observers. Skipped on the very first render so a returning/reconnecting
  // player doesn't get a toast for old history already in the log.
  useEffect(() => {
    if (isFirstLogRender.current) {
      isFirstLogRender.current = false;
      lastToastLogLength.current = gameState.log.length;
      return;
    }
    if (gameState.log.length > lastToastLogLength.current) {
      const newEntries = gameState.log.slice(lastToastLogLength.current);
      const cardEntry = [...newEntries].reverse().find(
        (entry) => entry.type === 'DREW_CARD' && entry.params?.playerId !== playerId,
      );
      if (cardEntry) setCardToast(cardEntry);
    }
    lastToastLogLength.current = gameState.log.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.log.length, playerId]);

  useEffect(() => {
    if (gameState.lastRoll && !prevPendingRef.current && gameState.pendingAction === null) {
      // roll happened (handled by Dice component's own animation trigger)
    }
    prevPendingRef.current = gameState.pendingAction;
  }, [gameState.pendingAction]);

  useEffect(() => {
    if (gameState.currentPlayerIndex !== prevTurnPlayerRef.current) {
      prevTurnPlayerRef.current = gameState.currentPlayerIndex;
      if (gameState.players[gameState.currentPlayerIndex]?.id === playerId) {
        sounds.yourTurn();
      }
    }
  }, [gameState.currentPlayerIndex, gameState.players, playerId]);

  useEffect(() => {
    if (gameState.lastRoll) sounds.diceRoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.lastRoll?.d1, gameState.lastRoll?.d2, gameState.lastRoll?.playerId]);

  const pendingBuy = gameState.pendingAction?.type === 'BUY_DECISION' ? gameState.pendingAction : null;
  const pendingCard = gameState.pendingAction?.type === 'CARD_REVEAL' ? gameState.pendingAction : null;
  const pendingIsMine = gameState.pendingAction?.playerId === playerId;

  // Overlays are mutually exclusive - a pending game action (something the
  // server is actively waiting on this player to resolve) always takes
  // priority over a manually-opened property inspection modal. Without
  // this, clicking a tile to inspect it and then landing on a new tile
  // (triggering a buy/card prompt) would stack two overlays at once, since
  // selectedTileId only ever clears via an explicit close.
  const hasBlockingPendingAction = (pendingBuy || pendingCard) && pendingIsMine;
  const showPropertyModal = selectedTile && !hasBlockingPendingAction;

  useEffect(() => {
    if (hasBlockingPendingAction && selectedTileId != null) {
      setSelectedTileId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBlockingPendingAction]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 px-3 py-4 lg:flex-row lg:px-6 lg:py-6">
      {/* Main column: board + action panel */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold tracking-tight text-board-tile sm:text-2xl">{t('app.title')}</h1>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="dark" />
            <button type="button" onClick={onLeave} className="text-sm text-board-tile/55 transition-colors hover:text-board-tile">
              {t('app.leaveGame')}
            </button>
          </div>
        </div>

        <Board
          gameState={gameState}
          onSelectTile={setSelectedTileId}
          me={me}
          isMyTurn={isMyTurn}
          onRollDice={actions.rollDice}
          diceSlot={<Dice lastRoll={gameState.lastRoll} />}
        />

        <ActionPanel gameState={gameState} me={me} isMyTurn={isMyTurn} actions={actions} />

        <ActivityLog log={gameState.log} />
      </div>

      {/* Sidebar: players + chat. lg:self-stretch matches the board
          column's height so the player list can use real available space
          (flex-1 + min-h-0) instead of an arbitrary vh guess that clips
          around 9 players - the exact scenario that broke with a full
          10-player room. */}
      <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-brass/15 bg-board shadow-panel texture-parchment lg:w-80 lg:shrink-0 lg:self-stretch">
        <div className="flex shrink-0 border-b border-board-line/60">
          <button
            type="button"
            onClick={() => setSidebarTab('players')}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
              sidebarTab === 'players' ? 'border-b-2 border-brass text-ink' : 'text-ink-faint'
            }`}
          >
            {t('sidebar.players')} {gameState.players.length > 6 && <span className="text-ink-faint">({gameState.players.length})</span>}
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('chat')}
            className={`relative flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
              sidebarTab === 'chat' ? 'border-b-2 border-brass text-ink' : 'text-ink-faint'
            }`}
          >
            {t('sidebar.chat')}
            {hasUnreadChat && sidebarTab !== 'chat' && (
              <span className="absolute right-3 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rent px-1 text-[10px] font-bold text-white ring-2 ring-board">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>
        </div>

        {sidebarTab === 'players' ? (
          <div className="relative min-h-0 flex-1">
            <div className="scrollbar-thin flex h-full flex-col gap-2 overflow-y-auto p-3">
              {gameState.players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  isMe={p.id === playerId}
                  isCurrentTurn={gameState.players[gameState.currentPlayerIndex]?.id === p.id}
                  propertyCount={propertyCountFor(p.id, gameState.properties)}
                />
              ))}
            </div>
            {/* Fade hints at the top/bottom of the scroll area so it's
                visually obvious there's more to scroll to, rather than a
                list that looks complete but silently clips players. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-board to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-board to-transparent" />
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <Chat messages={chatMessages} onSend={sendChat} playerId={playerId} />
          </div>
        )}
      </div>

      {/* Overlays */}
      {cardToast && <CardToast entry={cardToast} onDone={() => setCardToast(null)} />}

      {showPropertyModal && (
        <PropertyModal
          tile={selectedTile}
          properties={gameState.properties}
          players={gameState.players}
          myPlayerId={playerId}
          isMyTurn={isMyTurn}
          onClose={() => setSelectedTileId(null)}
          onBuildHouse={actions.buildHouse}
          onSellHouse={actions.sellHouse}
          onMortgage={actions.mortgage}
          onUnmortgage={actions.unmortgage}
        />
      )}

      {pendingBuy && pendingIsMine && (
        <BuyPrompt
          tile={getTile(pendingBuy.tileId)}
          player={me}
          onBuy={() => actions.buyProperty(pendingBuy.tileId)}
          onDecline={() => actions.declinePurchase(pendingBuy.tileId)}
        />
      )}

      {pendingCard && pendingIsMine && (
        <CardPrompt pendingAction={pendingCard} onAcknowledge={actions.acknowledgeCard} />
      )}

      {gameState.phase === 'GAME_OVER' && (
        <GameOverScreen gameState={gameState} playerId={playerId} onLeave={onLeave} />
      )}
    </div>
  );
}
