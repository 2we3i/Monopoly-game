// GameUI.jsx
// The game screen shell: a board that owns most of the space, one dock
// that holds every action, and one sidebar that answers "who else is in
// this game, what are they offering, what are they saying". Things that
// need everyone's attention right now - an auction, a trade offer for this
// player - are drawn over it so they cannot be missed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board';
import Dice from './Dice';
import PlayerCard from './PlayerCard';
import Chat from './Chat';
import PropertyModal from './PropertyModal';
import TradePanel from './TradePanel';
import TradeComposer from './TradeComposer';
import ManagePropertiesModal from './ManagePropertiesModal';
import ActionDock from './ActionDock';
import ActivityLog from './ActivityLog';
import SettingsModal from './SettingsModal';
import PlayerAvatar from './PlayerAvatar';
import Modal from './Modal';
import AuctionPanel from './AuctionPanel';
import TradeAlert from './TradeAlert';
import RaiseFundsModal from './RaiseFundsModal';
import { formatMoney, getTileName, netWorth, ownedTileIds, tileAccentColor } from '../boardData';
import { hexToRgba, isLightColor } from '../colorUtils';
import { useTranslation } from '../i18n/LanguageContext';
import { useSettings } from '../settings/SettingsContext';
import { usePendingAction } from '../hooks/usePendingAction';
import Icon from './icons';
import SocialBar from './social/SocialBar';
import { SpectatorBanner, SpectatorStrip, SurrenderButton } from './room/RoomStatus';
import { StyledName, VictoryMark, useLook } from '../cosmetics/Cosmetics';
import { useOutcomeEffects, useTurnSound } from '../cosmetics/useGameCosmetics';

function PlayerVictoryMark({ player, place }) {
  const look = useLook(player.cosmetics);
  return <VictoryMark item={look.tokenVictory} place={place} />;
}

function TopBar({
  gameState, me, onLeave, onOpenSettings, incomingTrades, onOpenTrades, onSurrender, spectating,
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(gameState.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be unavailable - the code is still visible to read */
    }
  };

  return (
    <header className="relative z-40 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-white/[0.07] bg-black/25 px-3 py-2 backdrop-blur-xl sm:gap-x-3 sm:px-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brass-light to-brass-deep text-ink shadow-lift">
          <Icon.crown className="h-5 w-5" />
        </span>
        <h1 className="hidden font-display text-[17px] font-black tracking-tight text-parch sm:block">{t('app.title')}</h1>
      </div>

      <button
        type="button"
        onClick={copyCode}
        title={t('waiting.copy')}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-parch/70 transition-colors hover:bg-white/[0.09] hover:text-parch"
      >
        <span className="hidden text-[10px] font-bold uppercase tracking-wide text-parch/40 sm:inline">{t('waiting.roomCode')}</span>
        <span className="font-mono text-[13px] font-bold tracking-widest">{gameState.roomCode}</span>
        {copied ? <Icon.check className="h-3.5 w-3.5 text-go-light" /> : <Icon.scroll className="h-3.5 w-3.5 opacity-50" />}
      </button>

      <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11.5px] text-parch/50 md:flex">
        <Icon.users className="h-3.5 w-3.5" />
        <span className="tnum">{gameState.players.filter((p) => !p.bankrupt).length}/{gameState.players.length}</span>
        <span className="text-parch/25">·</span>
        <span className="tnum">{t('landing.tiles', { count: gameState.board.length })}</span>
      </span>

      <div className="flex-1" />

      {/* Offers waiting for an answer, visible from anywhere in the game. */}
      {incomingTrades > 0 && (
        <button
          type="button"
          onClick={() => onOpenTrades(null)}
          title={t('tradeAlert.badge', { count: incomingTrades })}
          aria-label={t('tradeAlert.badge', { count: incomingTrades })}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brass/60 bg-brass/20 px-2.5 py-1.5 text-[12.5px] font-bold text-brass-light transition-colors hover:bg-brass/30"
        >
          <Icon.trade className="h-4 w-4" />
          <span className="hidden sm:inline">{t('dock.trade')}</span>
          <span className="flex h-4 min-w-[16px] animate-pulse items-center justify-center rounded-full bg-brass px-1 text-[10px] font-black text-ink">
            {incomingTrades > 9 ? '9+' : incomingTrades}
          </span>
        </button>
      )}

      {me && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1">
          <PlayerAvatar player={me} sizeClassName="h-6 w-6" ringClassName="ring-1 ring-white/25" />
          <span className="hidden max-w-[140px] truncate text-[12.5px] font-semibold text-parch sm:inline 4xl:max-w-[240px] 4xl:text-[15px]">
            <StyledName nickname={me.nickname} cosmetics={me.cosmetics} />
          </span>
          <span className={`font-display text-[14px] font-bold tnum ${me.money < 0 ? 'text-rent-light' : 'text-brass-light'}`}>
            {formatMoney(me.money)}
          </span>
        </div>
      )}

      <SocialBar compact />

      <button
        type="button"
        onClick={onOpenSettings}
        title={t('settings.open')}
        aria-label={t('settings.open')}
        className="btn-ghost shrink-0 px-2 py-1.5"
      >
        <Icon.settings className="h-4 w-4" />
        <span className="hidden xl:inline text-[12.5px]">{t('settings.open')}</span>
      </button>
      {/* Giving up mid-game is a bankruptcy, which is final: the dialog
          says so before anything happens. */}
      {!spectating && me && !me.bankrupt && gameState.phase !== 'GAME_OVER' && gameState.phase !== 'LOBBY' && (
        <SurrenderButton onSurrender={onSurrender} className="btn-danger shrink-0 px-2 py-1.5 text-[12.5px]" />
      )}
      <button
        type="button"
        onClick={onLeave}
        title={t('app.leaveGame')}
        className="btn-quiet shrink-0 px-2 py-1.5 text-[12.5px]"
      >
        <Icon.close className="h-4 w-4 lg:hidden" />
        <span className="hidden lg:inline">{t('app.leaveGame')}</span>
      </button>
    </header>
  );
}

// The buy decision. A player who cannot afford the square is not turned
// away: they see how much is missing and can raise it themselves; passing
// sends the square to auction for everyone.
function BuyPrompt({
  tile, player, onBuy, onDecline, onRaise, stamp,
}) {
  const { t, language } = useTranslation();
  const [pending, run] = usePendingAction(stamp);
  const accent = tileAccentColor(tile);
  const affordable = player.money >= tile.price;
  const short = tile.price - player.money;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3">
      <div className="pointer-events-auto w-full max-w-md animate-slide-up overflow-hidden rounded-2xl border border-brass/40 bg-felt-700/95 shadow-deep backdrop-blur-2xl">
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
        <div className="flex items-center gap-3 p-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[20px] font-black"
            style={{ backgroundColor: accent, color: isLightColor(accent) ? '#1f2417' : '#fff' }}
          >
            <Icon.bank className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-brass-light">{t('buy.landedOnUnowned')}</p>
            <h3 className="truncate font-display text-[19px] font-black leading-tight text-parch">{getTileName(tile, language)}</h3>
            {affordable ? (
              <p className="text-[12px] text-parch/50">
                {t('buy.balanceAfter', { price: tile.price, rest: formatMoney(player.money - tile.price) })}
              </p>
            ) : (
              <p className="text-[12px] font-semibold text-rent-light">
                {t('buy.shortBy', { amount: short })}
                <span className="font-normal text-parch/45"> · ${tile.price} · {t('buy.balance', { money: formatMoney(player.money) })}</span>
              </p>
            )}
          </div>
        </div>
        <p className="border-t border-white/[0.06] px-4 py-1.5 text-[11px] leading-snug text-parch/40">{t('buy.passHint')}</p>
        <div className="flex gap-2 border-t border-white/[0.08] bg-black/20 p-3">
          <button type="button" disabled={!!pending} onClick={() => run('pass', onDecline)} className="btn-ghost flex-1 py-3">
            {pending === 'pass' ? '…' : t('buy.passToAuction')}
          </button>
          {affordable ? (
            <button type="button" disabled={!!pending} onClick={() => run('buy', onBuy)} className="btn-primary flex-[1.4] py-3 text-[15px]">
              <Icon.check className="h-5 w-5" />
              {pending === 'buy' ? '…' : t('buy.buyForPrice', { price: tile.price })}
            </button>
          ) : (
            <button type="button" onClick={onRaise} className="btn-primary flex-[1.4] py-3 text-[15px]">
              <Icon.cash className="h-5 w-5" />
              {t('buy.raiseFunds')}
            </button>
          )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-scale-in overflow-hidden rounded-2xl border border-white/12 bg-board shadow-deep">
        <div className={`flex items-center justify-center gap-2 py-2.5 ${isChance ? 'bg-brass' : 'bg-go'}`}>
          {isChance ? <Icon.chance className="h-4 w-4 text-ink" /> : <Icon.chest className="h-4 w-4 text-white" />}
          <p className={`text-[11.5px] font-black uppercase tracking-[0.18em] ${isChance ? 'text-ink' : 'text-white'}`}>
            {isChance ? t('card.chance') : t('card.communityChest')}
          </p>
        </div>
        <div className="p-6 text-center">
          <p className="mb-6 font-display text-[17px] font-semibold leading-snug text-ink">{cardText}</p>
          <button type="button" onClick={onAcknowledge} className="btn-primary w-full py-3">
            {t('card.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({ gameState, playerId, onLeave }) {
  const { t } = useTranslation();
  const winner = gameState.players.find((p) => p.id === gameState.winnerId);
  const iWon = winner?.id === playerId;
  // Final standings by what each player was actually worth, not just who
  // survived - a game that ends with three players still solvent should
  // still say who came second.
  const standings = [...gameState.players]
    .map((p) => ({ player: p, worth: p.bankrupt ? -1 : netWorth(p, gameState.board, gameState.properties) }))
    .sort((a, b) => b.worth - a.worth);
  const myPlace = standings.findIndex((row) => row.player.id === playerId) + 1;
  const podium = (myPlace === 2 && standings.length >= 3) || (myPlace === 3 && standings.length >= 4);
  useOutcomeEffects(iWon ? 'win' : podium ? 'podium' : 'loss', `${gameState.roomCode}-${gameState.winnerId}`);

  return (
    <Modal onClose={onLeave} widthClass="max-w-sm">
      <div className="flex flex-col items-center text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-brass-light to-brass-deep shadow-lift">
          <Icon.crown className="h-8 w-8 text-ink" />
        </span>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brass-light">{t('gameOver.title')}</p>
        <h2 className="mb-1 mt-1 font-display text-2xl font-black text-parch">
          {iWon ? t('gameOver.youWon') : t('gameOver.nameWins', { name: winner?.nickname })}
        </h2>
        <p className="mb-4 text-[13px] text-parch/45">
          {iWon ? t('gameOver.subtitleWon') : t('gameOver.subtitleLost')}
        </p>

        <div className="mb-5 w-full overflow-hidden rounded-xl border border-white/[0.08]">
          <p className="section-label border-b border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-left">
            {t('gameOver.standings')}
          </p>
          <ol className="divide-y divide-white/[0.06]">
            {standings.map((row, i) => (
              <li key={row.player.id} className="flex items-center gap-2.5 px-3 py-2 text-left">
                <span className="w-4 shrink-0 text-[12px] font-bold text-parch/35 tnum">{i + 1}</span>
                <PlayerAvatar player={row.player} sizeClassName="h-7 w-7" ringClassName="ring-2 ring-white/20" />
                <span className="flex min-w-0 flex-1 items-center gap-1 text-[13px] font-semibold text-parch">
                  <StyledName nickname={row.player.nickname} cosmetics={row.player.cosmetics} showTitle titleSize="xs" />
                  {row.player.id === playerId && <span className="ml-1 shrink-0 text-[11px] font-normal text-parch/40">{t('sidebar.you')}</span>}
                  <PlayerVictoryMark player={row.player} place={row.player.bankrupt ? null : i + 1} />
                </span>
                {row.player.bankrupt ? (
                  <span className="pill bg-rent/20 text-rent-light">{t('sidebar.bankrupt')}</span>
                ) : (
                  <span className="text-[13px] font-bold text-parch/80 tnum">{formatMoney(row.worth)}</span>
                )}
              </li>
            ))}
          </ol>
        </div>

        <button type="button" onClick={onLeave} className="btn-primary w-full py-3">{t('gameOver.backToLobby')}</button>
      </div>
    </Modal>
  );
}

function SidebarTab({ active, onClick, icon: IconCmp, label, badge, badgeTone = 'brass' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-selected={active}
      role="tab"
      className={`relative flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[12.5px] font-bold transition-colors ${
        active ? 'text-parch' : 'text-parch/40 hover:text-parch/70'
      }`}
    >
      <IconCmp className="h-4 w-4" />
      {/* The active tab always names itself; the others fall back to
          their icon on narrow panels so three labels never collide. */}
      <span className={active ? 'inline' : 'hidden xl:inline'}>{label}</span>
      {badge > 0 && (
        <span className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-black ${
          badgeTone === 'brass' ? 'bg-brass text-ink' : 'bg-rent text-white'
        }`}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brass" />}
    </button>
  );
}

// A short, factual read-out of the things that are true of the room
// rather than of any one player - it also gives the player list somewhere
// to end instead of trailing off into empty panel.
function GameSnapshot({ gameState }) {
  const { t } = useTranslation();
  const ownable = Object.keys(gameState.properties).length;
  const owned = Object.values(gameState.properties).filter((p) => p.ownerId).length;

  return (
    <div className="mt-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="section-label mb-2">{t('game.snapshot')}</p>
      <dl className="flex flex-col gap-1.5 text-[12px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-parch/45"><Icon.bank className="h-3.5 w-3.5" />{t('game.ownedOfTotal')}</dt>
          <dd className="font-semibold text-parch/80 tnum">{owned} / {ownable}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-parch/45"><Icon.parking className="h-3.5 w-3.5" />{t('game.freeParkingPot')}</dt>
          <dd className={`font-semibold tnum ${gameState.freeParkingPot > 0 ? 'text-brass-light' : 'text-parch/80'}`}>
            {formatMoney(gameState.freeParkingPot)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-parch/45"><Icon.flag className="h-3.5 w-3.5" />{t('game.mode')}</dt>
          <dd className="font-semibold capitalize text-parch/80">{gameState.modeId}</dd>
        </div>
      </dl>
    </div>
  );
}

// Short-lived notices about auctions: one when an auction opens, one with
// its result. Only changes that happen while the screen is open announce
// themselves - a reload does not replay old results.
function useAuctionToasts(gameState, playerId) {
  const { t, language } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const auctionId = gameState.auction?.id ?? null;
  const resultId = gameState.lastAuctionResult?.auctionId ?? null;
  const seenAuction = useRef(auctionId);
  const seenResult = useRef(resultId);

  const push = useCallback((text, tone) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 6000);
  }, []);

  useEffect(() => {
    if (resultId && resultId !== seenResult.current) {
      const result = gameState.lastAuctionResult;
      const tile = getTileName(gameState.board[result.tileId], language);
      const winner = gameState.players.find((p) => p.id === result.winnerId);
      if (!winner) push(t('auction.resultUnsold', { tile }), 'muted');
      else if (winner.id === playerId) push(t('auction.resultYouWon', { tile, amount: result.amount }), 'go');
      else push(t('auction.resultWon', { name: winner.nickname, tile, amount: result.amount }), 'go');
    }
    seenResult.current = resultId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId]);

  useEffect(() => {
    if (auctionId && auctionId !== seenAuction.current) {
      const tile = getTileName(gameState.board[gameState.auction.tileId], language);
      push(t('auction.startedToast', { tile }), 'brass');
    }
    seenAuction.current = auctionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
  return [toasts, dismiss];
}

const TOAST_TONES = {
  brass: 'border-brass/60 bg-felt-700/95 text-brass-light',
  go: 'border-go-light/50 bg-felt-700/95 text-go-light',
  muted: 'border-white/15 bg-felt-700/95 text-parch/75',
};

export default function GameUI({
  gameState, playerId, actions, onLeave, chatMessages, sendChat, spectating,
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('players');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [composer, setComposer] = useState(null); // { target } | null
  const [manageOpen, setManageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [tradeFocus, setTradeFocus] = useState(null); // { id, at } | null
  const lastSeenChatLength = useRef(chatMessages.length);
  const isFirstChatRender = useRef(true);
  const sidebarRef = useRef(null);

  // "Highlight my properties", switched on from the property manager, is
  // remembered for this room for the rest of the browser session; the
  // "always" setting is a personal preference kept in local settings.
  const highlightKey = `landmark_highlight_${gameState.roomCode}`;
  const [manualHighlight, setManualHighlight] = useState(() => {
    try {
      return sessionStorage.getItem(highlightKey) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(highlightKey, manualHighlight ? '1' : '0');
    } catch {
      /* storage blocked - the highlight still works for this page */
    }
  }, [highlightKey, manualHighlight]);
  const highlightMine = settings.alwaysHighlightMine || manualHighlight;

  // On a phone the board is short: a running auction fills it, and a full
  // trade alert on top would cover the auction's clock and current bid.
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const me = gameState.players.find((p) => p.id === playerId);
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === playerId;
  useTurnSound(isMyTurn && gameState.phase !== 'GAME_OVER');
  const selectedTile = selectedTileId != null ? gameState.board[selectedTileId] : null;
  const myTrades = gameState.trades.filter((tr) => tr.fromPlayerId === playerId || tr.toPlayerId === playerId);
  const incomingTrades = myTrades.filter((tr) => tr.toPlayerId === playerId).length;
  const myPropertyCount = useMemo(() => ownedTileIds(playerId, gameState.properties).length, [playerId, gameState.properties]);
  const [toasts, dismissToast] = useAuctionToasts(gameState, playerId);

  const myBuyDecision = gameState.pendingAction?.type === 'BUY_DECISION' && gameState.pendingAction.playerId === playerId
    ? gameState.pendingAction
    : null;
  const buyTileId = myBuyDecision ? myBuyDecision.tileId : null;
  useEffect(() => {
    if (buyTileId == null) setRaiseOpen(false);
  }, [buyTileId]);

  const openTradeWith = (player) => {
    setComposer({ target: player });
    setSidebarTab('trades');
  };

  // Straight to an offer: close whatever is on top, open the Trades tab,
  // and mark the offer (the sidebar sits under the board on small screens,
  // so it is scrolled into view as well).
  const openTrades = useCallback((tradeId) => {
    const incoming = gameState.trades.filter((tr) => tr.toPlayerId === playerId);
    const id = tradeId || incoming[incoming.length - 1]?.id || null;
    setComposer(null);
    setManageOpen(false);
    setSettingsOpen(false);
    setSelectedTileId(null);
    setSidebarTab('trades');
    setTradeFocus(id ? { id, at: Date.now() } : null);
    if (window.innerWidth < 1024) sidebarRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [gameState.trades, playerId]);

  useEffect(() => {
    if (sidebarTab !== 'trades') setTradeFocus(null);
  }, [sidebarTab]);

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
        setUnreadChatCount((n) => n + newFromOthers.length);
      }
    }
    lastSeenChatLength.current = chatMessages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length]);

  useEffect(() => {
    if (sidebarTab === 'chat' && unreadChatCount > 0) setUnreadChatCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarTab]);

  const hasBlockingPendingAction = (gameState.pendingAction?.type === 'BUY_DECISION' || gameState.pendingAction?.type === 'CARD_REVEAL')
    && gameState.pendingAction?.playerId === playerId;

  // A decision prompt owns the screen: any deed sheet opened beforehand
  // would sit on top of the very prompt the player has to answer.
  useEffect(() => {
    if (hasBlockingPendingAction) setSelectedTileId(null);
  }, [hasBlockingPendingAction]);

  const showPropertyModal = selectedTile && !hasBlockingPendingAction;

  return (
    <div className="table-felt flex min-h-screen flex-col overflow-x-hidden lg:h-screen lg:overflow-hidden">
      <TopBar
        gameState={gameState}
        me={me}
        onLeave={onLeave}
        onOpenSettings={() => setSettingsOpen(true)}
        incomingTrades={incomingTrades}
        onOpenTrades={openTrades}
        onSurrender={actions.surrender}
        spectating={spectating}
      />

      {spectating && <SpectatorBanner onLeave={onLeave} className="mx-2.5 mt-2.5" />}
      {gameState.spectators?.length > 0 && <SpectatorStrip spectators={gameState.spectators} className="mx-2.5 mt-2.5" />}

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 p-2.5 lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
          <div className="h-[52vh] min-h-0 lg:h-auto lg:flex-1">
            <Board
              gameState={gameState}
              onSelectTile={setSelectedTileId}
              selectedTileId={selectedTileId}
              isMyTurn={isMyTurn}
              viewerId={playerId}
              highlightOwnerId={highlightMine && me ? playerId : null}
              diceSlot={<Dice lastRoll={gameState.lastRoll} />}
              overlay={(
                <>
                  {settings.showActivityLog && (
                    <div className="pointer-events-none absolute bottom-3 left-3 right-[13rem] z-20 flex">
                      <ActivityLog log={gameState.log} board={gameState.board} />
                    </div>
                  )}

                  {highlightMine && me && (
                    <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)]">
                      <div
                        className="pointer-events-auto flex items-center gap-2 rounded-full border bg-felt-800/90 py-1 pl-2.5 pr-1 text-[12px] font-semibold shadow-lift backdrop-blur-md"
                        style={{ borderColor: hexToRgba(me.color, 0.65) }}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: me.color, boxShadow: `0 0 8px ${me.color}` }} />
                        <span className="truncate text-parch">{t('highlight.active', { count: myPropertyCount })}</span>
                        {settings.alwaysHighlightMine ? (
                          <button type="button" onClick={() => setSettingsOpen(true)} className="shrink-0 rounded-full px-2 py-0.5 text-[11px] text-parch/60 hover:bg-white/10 hover:text-parch">
                            {t('highlight.settings')}
                          </button>
                        ) : (
                          <button type="button" onClick={() => setManualHighlight(false)} className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-parch hover:bg-white/20">
                            {t('highlight.off')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* The buy decision belongs over the board, right above
                      the dock - not over the whole window, where it would
                      also cover the sidebar on a wide screen. */}
                  {myBuyDecision && !gameState.auction && me && (
                    <BuyPrompt
                      tile={gameState.board[myBuyDecision.tileId]}
                      player={me}
                      stamp={gameState.receivedAt}
                      onBuy={() => actions.buyProperty(myBuyDecision.tileId)}
                      onDecline={() => actions.declinePurchase(myBuyDecision.tileId)}
                      onRaise={() => setRaiseOpen(true)}
                    />
                  )}

                  {gameState.auction && <AuctionPanel gameState={gameState} playerId={playerId} actions={actions} />}
                </>
              )}
            />
          </div>

          <ActionDock
            gameState={gameState}
            me={me}
            isMyTurn={isMyTurn}
            actions={actions}
            onOpenTrade={() => setComposer({ target: null })}
            onOpenManage={() => setManageOpen(true)}
            tradeCount={incomingTrades}
            propertyCount={myPropertyCount}
            diceSlot={<Dice lastRoll={gameState.lastRoll} size={26} showTotal={false} />}
          />
        </section>

        <aside ref={sidebarRef} className="panel flex min-h-0 w-full shrink-0 flex-col lg:h-auto lg:w-[22rem] xl:w-[24rem] 3xl:w-[27rem] 4xl:w-[34rem] 5xl:w-[40rem]">
          <div role="tablist" className="flex shrink-0 border-b border-white/[0.08]">
            <SidebarTab
              active={sidebarTab === 'players'}
              onClick={() => setSidebarTab('players')}
              icon={Icon.users}
              label={t('sidebar.players')}
            />
            <SidebarTab
              active={sidebarTab === 'trades'}
              onClick={() => setSidebarTab('trades')}
              icon={Icon.trade}
              label={t('trade.pendingTrades')}
              badge={sidebarTab !== 'trades' ? incomingTrades : 0}
            />
            <SidebarTab
              active={sidebarTab === 'chat'}
              onClick={() => setSidebarTab('chat')}
              icon={Icon.chat}
              label={t('sidebar.chat')}
              badge={sidebarTab !== 'chat' ? unreadChatCount : 0}
              badgeTone="rent"
            />
          </div>

          {sidebarTab === 'players' && (
            <div className="scrollbar-thin flex max-h-[60vh] min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 lg:max-h-none">
              {gameState.players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  isMe={p.id === playerId}
                  isCurrentTurn={currentPlayer?.id === p.id}
                  board={gameState.board}
                  properties={gameState.properties}
                  onTrade={openTradeWith}
                  expanded={expandedPlayerId === p.id}
                  onToggleExpand={() => setExpandedPlayerId((id) => (id === p.id ? null : p.id))}
                  onSelectTile={setSelectedTileId}
                />
              ))}

              <GameSnapshot gameState={gameState} />
            </div>
          )}

          {sidebarTab === 'trades' && (
            <div className="flex max-h-[60vh] min-h-0 flex-1 flex-col lg:max-h-none">
              <TradePanel
                gameState={gameState}
                playerId={playerId}
                focus={tradeFocus}
                onOpenComposer={(target) => setComposer({ target })}
                onAcceptTrade={actions.acceptTrade}
                onDeclineTrade={actions.declineTrade}
                onCancelTrade={actions.cancelTrade}
              />
            </div>
          )}

          {sidebarTab === 'chat' && (
            <div className="flex max-h-[60vh] min-h-0 flex-1 lg:max-h-none">
              <Chat messages={chatMessages} onSend={sendChat} playerId={playerId} players={gameState.players} board={gameState.board} />
            </div>
          )}
        </aside>
      </main>

      {gameState.pendingAction?.type === 'CARD_REVEAL' && gameState.pendingAction.playerId === playerId && (
        <CardPrompt pendingAction={gameState.pendingAction} onAcknowledge={actions.acknowledgeCard} />
      )}

      {showPropertyModal && (
        <PropertyModal
          tile={selectedTile}
          gameState={gameState}
          myPlayerId={playerId}
          isMyTurn={isMyTurn}
          onClose={() => setSelectedTileId(null)}
          onBuildHouse={actions.buildHouse}
          onSellHouse={actions.sellHouse}
          onMortgage={actions.mortgage}
          onUnmortgage={actions.unmortgage}
          onSetCustomPrice={actions.setCustomPrice}
        />
      )}

      {composer && (
        <TradeComposer
          gameState={gameState}
          playerId={playerId}
          initialTarget={composer.target}
          onClose={() => setComposer(null)}
          onPropose={actions.proposeTrade}
        />
      )}

      {manageOpen && (
        <ManagePropertiesModal
          gameState={gameState}
          playerId={playerId}
          isMyTurn={isMyTurn}
          onClose={() => setManageOpen(false)}
          onSelectTile={(id) => { setManageOpen(false); setSelectedTileId(id); }}
          onBuildHouse={actions.buildHouse}
          onSellHouse={actions.sellHouse}
          onMortgage={actions.mortgage}
          onUnmortgage={actions.unmortgage}
          highlightOn={highlightMine}
          alwaysHighlight={settings.alwaysHighlightMine}
          onToggleHighlight={() => {
            setManualHighlight((on) => !on);
            // Close the manager so the lit-up board is actually visible.
            setManageOpen(false);
          }}
        />
      )}

      {raiseOpen && myBuyDecision && (
        <RaiseFundsModal
          gameState={gameState}
          playerId={playerId}
          tileId={myBuyDecision.tileId}
          actions={actions}
          onClose={() => setRaiseOpen(false)}
        />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {gameState.phase === 'GAME_OVER' && (
        <GameOverScreen gameState={gameState} playerId={playerId} onLeave={onLeave} />
      )}

      {/* Above everything, dialogs included: a trade offer for this player
          and short auction notices. */}
      <div className="pointer-events-none fixed inset-x-0 top-14 z-[60] flex flex-col items-center gap-2 px-3">
        <div className="w-full max-w-md">
          {me && gameState.phase !== 'GAME_OVER' && (
            <TradeAlert
              gameState={gameState}
              playerId={playerId}
              onAccept={actions.acceptTrade}
              onDecline={actions.declineTrade}
              onDetails={openTrades}
              compact={narrow && !!gameState.auction}
            />
          )}
        </div>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex max-w-md animate-slide-up items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold shadow-deep backdrop-blur-xl ${TOAST_TONES[toast.tone] || TOAST_TONES.muted}`}
          >
            <Icon.bank className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{toast.text}</span>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label={t('common.close')} className="shrink-0 rounded-full p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100">
              <Icon.close className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
