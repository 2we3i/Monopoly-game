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
import { getTile } from '../boardData';
import { sounds } from '../sounds';

function propertyCountFor(playerId, properties) {
  return Object.values(properties).filter((p) => p.ownerId === playerId).length;
}

function BuyPrompt({ tile, player, onBuy, onDecline }) {
  return (
    <div className="animate-rise-in fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-sm px-3 pb-3 sm:bottom-6 sm:px-4">
      <div className="rounded-2xl border border-brass/30 bg-board p-5 shadow-board texture-parchment">
        <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-brass-deep">Landed on unowned property</p>
        <h3 className="mb-1 font-display text-2xl font-bold text-ink">{tile.name}</h3>
        <p className="mb-4 text-sm text-ink-soft">
          Buy for <span className="font-display font-bold text-ink">${tile.price}</span>? You have ${player.money.toLocaleString()}.
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-xl border-2 border-ink/15 px-4 py-3 font-semibold text-ink-soft transition-transform active:scale-95"
          >
            Pass
          </button>
          <button
            type="button"
            onClick={onBuy}
            disabled={player.money < tile.price}
            className="flex-1 rounded-xl bg-gradient-to-b from-brass-bright to-brass px-4 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-95 disabled:opacity-40"
          >
            Buy for ${tile.price}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardPrompt({ pendingAction, onAcknowledge }) {
  const isChance = pendingAction.deckName === 'chance';
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-sm rounded-2xl border border-brass/25 bg-board p-6 text-center shadow-board texture-parchment">
        <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${isChance ? 'text-brass-deep' : 'text-go'}`}>
          {isChance ? 'Chance' : 'Community Chest'}
        </p>
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold shadow-tile ${isChance ? 'bg-gradient-to-b from-brass-bright to-brass text-brass-ink' : 'bg-go/15 text-go'}`}>
          {isChance ? '?' : '$'}
        </div>
        <p className="mb-5 text-base font-medium leading-snug text-ink">{pendingAction.card.text}</p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="w-full rounded-xl bg-gradient-to-b from-brass-bright to-brass px-4 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-95"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function GameOverScreen({ gameState, playerId, onLeave }) {
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
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-brass-deep">Game over</p>
        <h2 className="mb-2 font-display text-2xl font-bold text-ink">
          {iWon ? 'You won! 🎉' : `${winner?.nickname} wins!`}
        </h2>
        <p className="mb-6 text-sm text-ink-faint">
          Everyone else went bankrupt. {iWon ? 'Nicely played.' : 'Better luck next time.'}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="w-full rounded-xl bg-gradient-to-b from-brass-bright to-brass px-4 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-95"
        >
          Back to lobby
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
          You're ${Math.abs(me.money)} in debt. Mortgage or sell properties, or declare bankruptcy.
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
              Pay $50 fine
            </button>
            {me.getOutOfJailFreeCards > 0 && (
              <button
                type="button"
                onClick={actions.useJailCard}
                className="flex-1 rounded-xl border-2 border-brass px-4 py-3 text-sm font-semibold text-brass-deep transition-transform active:scale-95"
              >
                Use jail card
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
            End turn
          </button>
        )}
        {inDebt && (
          <button
            type="button"
            onClick={actions.declareBankruptcy}
            className="w-full rounded-xl border-2 border-rent px-4 py-2.5 text-sm font-semibold text-rent transition-transform active:scale-[0.98]"
          >
            Declare bankruptcy
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityLog({ log }) {
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
        <p key={i} className="py-0.5">{entry.message}</p>
      ))}
    </div>
  );
}

export default function GameUI({ gameState, playerId, actions, onLeave, chatMessages, sendChat }) {
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('players'); // 'players' | 'chat'
  const lastLogLength = useRef(gameState.log.length);
  const prevPendingRef = useRef(gameState.pendingAction);
  const prevTurnPlayerRef = useRef(gameState.currentPlayerIndex);

  const me = gameState.players.find((p) => p.id === playerId);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === playerId;
  const selectedTile = selectedTileId != null ? getTile(selectedTileId) : null;

  // Sound effects: watch for new log entries and match keywords, watch for
  // pending-action transitions, and watch for "it's now my turn".
  useEffect(() => {
    if (gameState.log.length > lastLogLength.current) {
      const newEntries = gameState.log.slice(lastLogLength.current);
      newEntries.forEach((entry) => {
        const msg = entry.message;
        if (msg.includes('bought')) sounds.purchase();
        else if (msg.includes('bankrupt')) sounds.bankruptcy();
        else if (msg.includes('collected') || msg.includes('wins')) sounds.collectMoney();
        else if (msg.includes('paid')) sounds.payMoney();
      });
    }
    lastLogLength.current = gameState.log.length;
  }, [gameState.log.length]);

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
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl font-bold tracking-tight text-board-tile sm:text-2xl">Landmark</h1>
          <button type="button" onClick={onLeave} className="text-sm text-board-tile/55 transition-colors hover:text-board-tile">
            Leave game
          </button>
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

      {/* Sidebar: players + chat */}
      <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-brass/15 bg-board shadow-panel texture-parchment lg:w-80 lg:shrink-0">
        <div className="flex border-b border-board-line/60">
          <button
            type="button"
            onClick={() => setSidebarTab('players')}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
              sidebarTab === 'players' ? 'border-b-2 border-brass text-ink' : 'text-ink-faint'
            }`}
          >
            Players
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('chat')}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
              sidebarTab === 'chat' ? 'border-b-2 border-brass text-ink' : 'text-ink-faint'
            }`}
          >
            Chat
          </button>
        </div>

        {sidebarTab === 'players' ? (
          <div className="flex flex-col gap-2 overflow-y-auto scrollbar-thin p-3" style={{ maxHeight: '70vh' }}>
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
        ) : (
          <div style={{ height: '70vh' }}>
            <Chat messages={chatMessages} onSend={sendChat} playerId={playerId} />
          </div>
        )}
      </div>

      {/* Overlays */}
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
