// Board.jsx
// Renders the 40-tile board as an 11x11 CSS grid (corners + 9 tiles per
// side), with player tokens that step through the server-provided path of
// intermediate tiles for each move (see useAnimatedTokenPosition below),
// so a token visibly hops along the board's perimeter tile by tile
// instead of sliding in a straight line through the middle of the board.

import { useEffect, useRef, useState } from 'react';
import { BOARD, GROUP_COLORS, TILE_TYPES, tileGridPosition, getTileName } from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';

function ownerColor(tileId, properties, players) {
  const p = properties[tileId];
  if (!p?.ownerId) return null;
  const owner = players.find((pl) => pl.id === p.ownerId);
  return owner?.color || null;
}

function HouseIndicator({ houses }) {
  if (!houses) return null;
  if (houses === 5) {
    return (
      <div className="absolute left-1/2 top-0.5 -translate-x-1/2 rounded-sm bg-rent px-1 py-px text-[7px] font-bold tracking-wide text-white shadow-sm sm:text-[8px]">
        HOTEL
      </div>
    );
  }
  return (
    <div className="absolute left-1/2 top-0.5 flex -translate-x-1/2 gap-0.5">
      {Array.from({ length: houses }).map((_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-[1px] bg-go shadow-sm ring-1 ring-white/40" />
      ))}
    </div>
  );
}

function PropertyTile({ tile, properties, players, orientation, onSelect }) {
  const { language } = useTranslation();
  const propState = properties[tile.id];
  const owner = propState?.ownerId ? players.find((p) => p.id === propState.ownerId) : null;
  const groupColor = GROUP_COLORS[tile.group];

  const barClasses = {
    bottom: 'order-2 h-[22%] w-full',
    top: 'order-0 h-[22%] w-full',
    left: 'order-0 h-full w-[22%]',
    right: 'order-2 h-full w-[22%]',
  }[orientation];

  const isVertical = orientation === 'left' || orientation === 'right';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tile.id)}
      className={`group relative flex ${isVertical ? 'flex-row' : 'flex-col'} h-full w-full overflow-hidden border border-board-line/70 bg-board-tile text-left transition-colors hover:bg-brass/10 focus-visible:z-10`}
    >
      <div className={`${barClasses} shadow-[inset_0_-1px_2px_rgba(0,0,0,0.15)]`} style={{ backgroundColor: groupColor }} />
      <div className="order-1 flex flex-1 flex-col items-center justify-center gap-0.5 p-0.5 text-center">
        <p className="line-clamp-2 text-[6.5px] font-semibold leading-tight text-ink sm:text-[7.5px]">
          {getTileName(tile, language)}
        </p>
        <p className="text-[6px] font-medium text-ink-faint sm:text-[7px]">${tile.price}</p>
        {propState?.mortgaged && (
          <span className="rounded-sm bg-ink/70 px-1 text-[6px] font-bold text-white">MTG</span>
        )}
      </div>
      <HouseIndicator houses={propState?.houses} />
      {owner && (
        <span
          className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full shadow-token ring-1 ring-white/80"
          style={{ backgroundColor: owner.color }}
        />
      )}
    </button>
  );
}

function RailroadTile({ tile, properties, players, onSelect }) {
  const { language } = useTranslation();
  const propState = properties[tile.id];
  const owner = propState?.ownerId ? players.find((p) => p.id === propState.ownerId) : null;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(tile.id)}
      className="relative flex h-full w-full flex-col items-center justify-center gap-0.5 border border-board-line/70 bg-board-tile p-0.5 text-center transition-colors hover:bg-brass/10"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-soft sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 17h16M6 17V7a2 2 0 012-2h8a2 2 0 012 2v10M8 21l-2-4M16 21l2-4" />
        <circle cx="8.5" cy="14" r="1" fill="currentColor" />
        <circle cx="15.5" cy="14" r="1" fill="currentColor" />
      </svg>
      <p className="line-clamp-2 text-[6.5px] font-semibold leading-tight text-ink sm:text-[7.5px]">{getTileName(tile, language)}</p>
      <p className="text-[6px] font-medium text-ink-faint sm:text-[7px]">${tile.price}</p>
      {owner && (
        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full shadow-token ring-1 ring-white/80" style={{ backgroundColor: owner.color }} />
      )}
    </button>
  );
}

function UtilityTile({ tile, properties, players, onSelect }) {
  const { language } = useTranslation();
  const propState = properties[tile.id];
  const owner = propState?.ownerId ? players.find((p) => p.id === propState.ownerId) : null;
  // id 12 = Power Plant, id 28 = Water Works (see boardData.js) - checked
  // by id rather than name text, since name text is now localized and an
  // id is stable regardless of language or any future wording tweak.
  const isPower = tile.id === 12;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(tile.id)}
      className="relative flex h-full w-full flex-col items-center justify-center gap-0.5 border border-board-line/70 bg-board-tile p-0.5 text-center transition-colors hover:bg-brass/10"
    >
      {isPower ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-brass-deep sm:h-4 sm:w-4" fill="currentColor">
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-blue-600 sm:h-4 sm:w-4" fill="currentColor">
          <path d="M12 2C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-13z" />
        </svg>
      )}
      <p className="line-clamp-2 text-[6.5px] font-semibold leading-tight text-ink sm:text-[7.5px]">{getTileName(tile, language)}</p>
      <p className="text-[6px] font-medium text-ink-faint sm:text-[7px]">${tile.price}</p>
      {owner && (
        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full shadow-token ring-1 ring-white/80" style={{ backgroundColor: owner.color }} />
      )}
    </button>
  );
}

const CORNER_TYPES = new Set([TILE_TYPES.GO, TILE_TYPES.JAIL, TILE_TYPES.FREE_PARKING, TILE_TYPES.GO_TO_JAIL]);

function SpecialTile({ tile }) {
  const { language } = useTranslation();
  const isCorner = CORNER_TYPES.has(tile.type);
  const icons = {
    [TILE_TYPES.GO]: (
      <svg viewBox="0 0 24 24" className={isCorner ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-5 w-5 sm:h-6 sm:w-6'} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    ),
    [TILE_TYPES.JAIL]: (
      <svg viewBox="0 0 24 24" className={isCorner ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-5 w-5 sm:h-6 sm:w-6'} fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 4v16M15 4v16M4 9h16M4 15h16" strokeOpacity="0.45" />
      </svg>
    ),
    [TILE_TYPES.FREE_PARKING]: (
      <svg viewBox="0 0 24 24" className={isCorner ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-5 w-5 sm:h-6 sm:w-6'} fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M10 16V8h3a2.5 2.5 0 010 5h-3" />
      </svg>
    ),
    [TILE_TYPES.GO_TO_JAIL]: (
      <svg viewBox="0 0 24 24" className={isCorner ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-5 w-5 sm:h-6 sm:w-6'} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3l3 5.5-1 8.5H10l-1-8.5L12 3z" />
        <path d="M7 21h10" />
      </svg>
    ),
    [TILE_TYPES.CHANCE]: (
      <span className={`font-display font-bold text-brass ${isCorner ? 'text-3xl' : 'text-lg sm:text-xl'}`}>?</span>
    ),
    [TILE_TYPES.CHEST]: (
      <svg viewBox="0 0 24 24" className={isCorner ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-5 w-5 sm:h-6 sm:w-6'} fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="9" width="18" height="11" rx="1" />
        <path d="M3 9l2-5h14l2 5M12 13v4M9 13h6" />
      </svg>
    ),
    [TILE_TYPES.TAX]: (
      <svg viewBox="0 0 24 24" className={isCorner ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-5 w-5 sm:h-6 sm:w-6'} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 2v20M17 6H9.5a2.5 2.5 0 000 5H14a2.5 2.5 0 010 5H7" />
      </svg>
    ),
  };
  const tint = {
    [TILE_TYPES.GO]: 'text-go bg-go/10',
    [TILE_TYPES.JAIL]: 'text-rent bg-rent/[0.07]',
    [TILE_TYPES.FREE_PARKING]: 'text-brass-deep bg-brass/10',
    [TILE_TYPES.GO_TO_JAIL]: 'text-rent bg-rent/[0.07]',
    [TILE_TYPES.CHANCE]: 'text-brass-deep',
    [TILE_TYPES.CHEST]: 'text-go',
    [TILE_TYPES.TAX]: 'text-ink-soft',
  }[tile.type];

  if (isCorner) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-1 border-2 border-board-line bg-board-tile p-1 text-center ${tint}`}>
        {icons[tile.type]}
        <p className="font-display text-[8px] font-bold uppercase leading-tight tracking-wide text-ink sm:text-[10px]">
          {getTileName(tile, language)}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-0.5 border border-board-line/70 bg-board-tile p-1 text-center ${tint}`}>
      {icons[tile.type]}
      <p className="line-clamp-2 text-[6.5px] font-semibold leading-tight text-ink sm:text-[7.5px]">{getTileName(tile, language)}</p>
      {tile.amount && <p className="text-[6px] font-medium text-ink-faint sm:text-[7px]">${tile.amount}</p>}
    </div>
  );
}

function TileRenderer({ tile, properties, players, onSelect }) {
  const pos = tileGridPosition(tile.id);
  const orientation = pos.row === 11 ? 'bottom' : pos.row === 1 ? 'top' : pos.col === 1 ? 'left' : 'right';

  if (tile.type === TILE_TYPES.PROPERTY) {
    return <PropertyTile tile={tile} properties={properties} players={players} orientation={orientation} onSelect={onSelect} />;
  }
  if (tile.type === TILE_TYPES.RAILROAD) {
    return <RailroadTile tile={tile} properties={properties} players={players} onSelect={onSelect} />;
  }
  if (tile.type === TILE_TYPES.UTILITY) {
    return <UtilityTile tile={tile} properties={properties} players={players} onSelect={onSelect} />;
  }
  return <SpecialTile tile={tile} />;
}

// Position tokens within a tile: if multiple players share a tile, arrange
// them in a small cluster so they don't fully overlap.
function tokenOffset(indexInStack, totalOnTile) {
  if (totalOnTile <= 1) return { x: 0, y: 0 };
  const positions = [
    [-9, -9], [9, -9], [-9, 9], [9, 9], [0, -9], [0, 9], [-9, 0], [9, 0], [0, 0], [4, 4],
  ];
  return { x: positions[indexInStack]?.[0] ?? 0, y: positions[indexInStack]?.[1] ?? 0 };
}

// CSS Grid line placement (gridRow/gridColumn) is a discrete property -
// browsers cannot smoothly interpolate between grid lines, so animating it
// via a CSS transition just snaps instantly despite the transition class
// being present. To get an actual sliding token, every token is placed in
// the SAME grid cell (the full 11x11 area, top-left aligned) and moved
// with a `transform: translate()` computed in percentages of the board's
// own size - translate is a continuous property and animates properly.
function tokenTranslatePercent(tileId) {
  const pos = tileGridPosition(tileId);
  // Each grid line step is 1/11th of the board. Center the token within
  // its cell by adding half a cell (50/11 %) to both axes.
  const stepPct = 100 / 11;
  const xPct = (pos.col - 1) * stepPct + stepPct / 2;
  const yPct = (pos.row - 1) * stepPct + stepPct / 2;
  return { xPct, yPct };
}

// A single continuous transform between two arbitrary tiles cuts a
// straight line across the board (through the middle, through walls -
// exactly the "teleporting" look this hook exists to fix), because CSS
// only knows the start and end points, not the board's perimeter shape.
// This hook instead steps the *displayed* tile id through every
// intermediate tile in `path` one at a time, each hop getting its own
// short CSS transition - so a 6-tile move plays as six small hops tracing
// the actual edge of the board, corners included, rather than one long
// diagonal slide.
//
// `path` (from the server's state.lastMove) is the ordered list of tile
// ids to visit, NOT including the starting tile. `teleport` skips the
// stepping entirely (used for Jail sends, which the real game doesn't
// animate as a walk).
const HOP_DURATION_MS = 220;

function useAnimatedTokenPosition(serverPosition, moveDescriptor) {
  const [displayedPosition, setDisplayedPosition] = useState(serverPosition);
  const hopTimeoutRef = useRef(null);
  // Dedupe by moveId (a stable value from the server), not by object
  // identity. gameState.lastMove is rebuilt from JSON on every socket
  // broadcast, so a plain `!==` reference check is true on EVERY broadcast
  // - including ones unrelated to movement (e.g. a purchase or chat event
  // that just happens to arrive while the last move is still the newest
  // one) - which replayed the hop animation repeatedly. Comparing moveId
  // instead only treats it as "new" when the server actually produced a
  // new move.
  const appliedMoveIdRef = useRef(null);

  useEffect(() => {
    const isNewMove = moveDescriptor && moveDescriptor.moveId !== appliedMoveIdRef.current;

    if (isNewMove) {
      appliedMoveIdRef.current = moveDescriptor.moveId;

      if (moveDescriptor.teleport) {
        setDisplayedPosition(moveDescriptor.path[moveDescriptor.path.length - 1]);
        return undefined;
      }

      // Step through the path one hop at a time. Each setTimeout schedules
      // the next hop; clearing hopTimeoutRef on cleanup/re-trigger stops a
      // stale sequence from continuing to fire after a newer move arrives.
      let i = 0;
      const stepToNext = () => {
        if (i >= moveDescriptor.path.length) return;
        setDisplayedPosition(moveDescriptor.path[i]);
        i += 1;
        if (i < moveDescriptor.path.length) {
          hopTimeoutRef.current = setTimeout(stepToNext, HOP_DURATION_MS);
        }
      };
      stepToNext();

      return () => {
        if (hopTimeoutRef.current) clearTimeout(hopTimeoutRef.current);
      };
    }

    // No new move to animate, but the server's authoritative position
    // still doesn't match what we're showing (first render, reconnect, or
    // a position change that for any reason arrived without a matching
    // lastMove) - snap straight there rather than leaving the token
    // stranded on a stale tile.
    if (!moveDescriptor && displayedPosition !== serverPosition) {
      setDisplayedPosition(serverPosition);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDescriptor, serverPosition]);

  return displayedPosition;
}

function PlayerTokens({ players, lastMove }) {
  const active = players.filter((p) => !p.bankrupt);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {active.map((player) => (
        <AnimatedToken
          key={player.id}
          player={player}
          isMoving={lastMove?.playerId === player.id}
          moveDescriptor={lastMove?.playerId === player.id ? lastMove : null}
          allActivePlayers={active}
        />
      ))}
    </div>
  );
}

function AnimatedToken({ player, moveDescriptor, allActivePlayers }) {
  const displayedPosition = useAnimatedTokenPosition(player.position, moveDescriptor);
  const { xPct, yPct } = tokenTranslatePercent(displayedPosition);

  // Clustering offset is computed against OTHER tokens' current displayed
  // (not server) positions too, so two tokens animating past each other
  // mid-hop don't briefly overlap at full opacity - each still offsets
  // from whoever else currently visually shares its tile.
  const sameTilePlayers = allActivePlayers.filter((p) => {
    if (p.id === player.id) return true;
    // Other tokens not currently mid-move are simply at their server
    // position for this comparison; a token that IS mid-move but isn't
    // `player` can't happen simultaneously today (moves are strictly
    // sequential - only the current turn's player ever moves), but this
    // stays correct even if that ever changes.
    return p.position === displayedPosition;
  });
  const indexInStack = sameTilePlayers.findIndex((p) => p.id === player.id);
  const offset = tokenOffset(indexInStack, sameTilePlayers.length);

  return (
    // `left`/`top` as percentages correctly resolve against the PARENT's
    // size (the full board), which is what we want. This is the fix for a
    // real bug: `transform: translate(X%, ...)` resolves percentages
    // against the TRANSFORMED ELEMENT'S OWN size, not its container - on a
    // zero-size wrapper (the previous approach) every percentage
    // component silently resolved to 0, so tokens rendered pinned to the
    // top-left corner regardless of their actual tile. left/top percent
    // positioning doesn't have that problem, so it's used for the
    // continuous per-tile movement, while the transform here only ever
    // carries fixed, non-percentage values (self-centering and the small
    // px clustering offset), which are safe regardless of element size.
    <div
      className="absolute transition-[left,top] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transitionDuration: `${HOP_DURATION_MS}ms`,
        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
      }}
    >
      <span
        className="block h-4 w-4 rounded-full ring-[2.5px] ring-white shadow-token sm:h-[18px] sm:w-[18px]"
        style={{ backgroundColor: player.color, boxShadow: `0 2px 6px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.15)` }}
        title={player.nickname}
      />
    </div>
  );
}

// The board's center used to be a near-empty watermark - the single
// biggest wasted area on the whole screen. It now hosts the actual turn
// status and dice, which is both a better use of the space (the eye
// already goes there) and a stronger signature moment for the dice roll
// than tucking it into a corner of a separate panel.
function BoardCenter({ gameState, me, isMyTurn, onRollDice, diceSlot }) {
  const { t } = useTranslation();
  const { freeParkingPot, phase, pendingAction } = gameState;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl sm:gap-4"
      style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}
    >
      <p className="pointer-events-none absolute font-display text-[clamp(1.75rem,6vw,3.5rem)] font-bold tracking-tight text-ink/[0.06]">
        LANDMARK
      </p>

      <div className="relative flex flex-col items-center gap-1">
        <p
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide sm:text-xs"
          style={{ color: currentPlayer?.color, backgroundColor: `${currentPlayer?.color}18` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: currentPlayer?.color }} />
          {isMyTurn ? t('game.yourTurn') : t('game.nameTurn', { name: currentPlayer?.nickname })}
        </p>
      </div>

      {diceSlot}

      {isMyTurn && phase === 'ROLLING' && !pendingAction && (
        <button
          type="button"
          onClick={onRollDice}
          className="shimmer-sweep relative rounded-full bg-gradient-to-b from-brass-bright to-brass px-6 py-2.5 text-sm font-bold text-brass-ink shadow-tile transition-transform active:scale-95 sm:px-7 sm:py-3 sm:text-base"
        >
          {me?.inJail ? t('game.tryForDoubles') : t('game.rollDice')}
        </button>
      )}

      {freeParkingPot > 0 && (
        <div className="relative rounded-full border-2 border-dashed border-brass/50 bg-brass/10 px-3 py-1 sm:px-4 sm:py-1.5">
          <p className="text-[10px] font-medium text-brass-deep sm:text-xs">
            {t('game.freeParkingLabel')} <span className="font-display font-bold">${freeParkingPot}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export default function Board({ gameState, onSelectTile, me, isMyTurn, onRollDice, diceSlot }) {
  const { properties, players } = gameState;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[720px] rounded-2xl border border-brass/15 bg-board p-2 shadow-board texture-parchment sm:p-3">
      <div
        className="relative grid h-full w-full"
        style={{
          gridTemplateColumns: 'repeat(11, 1fr)',
          gridTemplateRows: 'repeat(11, 1fr)',
        }}
      >
        {BOARD.map((tile) => {
          const pos = tileGridPosition(tile.id);
          return (
            <div key={tile.id} style={{ gridRow: pos.row, gridColumn: pos.col }} className="relative">
              <TileRenderer tile={tile} properties={properties} players={players} onSelect={onSelectTile} />
            </div>
          );
        })}

        <PlayerTokens players={players} lastMove={gameState.lastMove} />

        <BoardCenter gameState={gameState} me={me} isMyTurn={isMyTurn} onRollDice={onRollDice} diceSlot={diceSlot} />
      </div>
    </div>
  );
}
