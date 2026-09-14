// Board.jsx
// The board viewport: a fixed-size board drawn in design pixels, wrapped
// in a free zoom/pan surface (wheel to zoom at the cursor, drag to pan,
// pinch on touch). Zoom is purely local UI state and never touches the
// game state.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  TILE_TYPES, TILE_W, boardInnerRect, boardPixelSize, computeGroupOwners, currentRent,
  getTileName, tileAccentColor, tileCenter, tileOrientation, tileRect, utilityMultiplier,
} from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { useSettings } from '../settings/SettingsContext';
import BoardTile from './BoardTile';
import { artTierFor } from './tileArt';
import { hexToRgba } from '../colorUtils';
import PlayerAvatar from './PlayerAvatar';
import { pieceIdFor, pieceLabel } from './tokenArt';
import Icon from './icons';
import { TokenDecor, useLook } from '../cosmetics/Cosmetics';

const SCALE_MAX = 3.2;
const SCALE_FLOOR = 0.12;
const PAD = 28;
const HOP_DURATION_MS = 220;

// Thresholds are in EFFECTIVE screen pixels per tile, not in zoom
// percent: text that renders below ~6px is visual noise rather than
// information, so a tile drops its label entirely and leans on color,
// ownership and the hover card instead of pretending to be readable.
function detailFor(scale) {
  const px = TILE_W * scale;
  if (px < 40) return 'min';
  if (px < 62) return 'mid';
  return 'full';
}

// --- The board surface (memoized: it only re-renders on real changes) ---

const BoardSurface = memo(function BoardSurface({
  board, properties, players, sideLength, detail, selectedTileId, onSelectTile, onHoverTile, language, art,
}) {
  const size = boardPixelSize(sideLength);
  const inner = boardInnerRect(sideLength);
  const groupOwners = useMemo(() => computeGroupOwners(board, properties), [board, properties]);
  // The tallest building on the board is whatever the priciest square
  // costs - taking it from the layout keeps the skyline meaningful on a
  // 40-tile board and an 84-tile one alike, with no per-layout tuning.
  const maxPrice = useMemo(
    () => board.reduce((max, tile) => (tile.type === TILE_TYPES.PROPERTY ? Math.max(max, tile.price || 0) : max), 0),
    [board],
  );
  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  return (
    <div
      className="absolute left-0 top-0 rounded-[18px]"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(ellipse at 50% 35%, #f7efdd 0%, #eee2c8 70%, #e6d7b9 100%)',
        boxShadow: '0 0 0 1px rgba(31,36,23,0.25), 0 40px 90px -30px rgba(0,0,0,0.85)',
      }}
    >
      {/* Inner playfield well - gives the middle of the board a subtle
          recess so the ring of tiles reads as a raised frame. */}
      <div
        className="pointer-events-none absolute rounded-[10px]"
        style={{
          left: inner.x, top: inner.y, width: inner.w, height: inner.h,
          background: 'linear-gradient(160deg, rgba(31,36,23,0.05), rgba(31,36,23,0.015))',
          boxShadow: 'inset 0 1px 3px rgba(31,36,23,0.12)',
        }}
      />

      {board.map((tile) => {
        const propState = properties[tile.id];
        const owner = propState?.ownerId ? playerById[propState.ownerId] : null;
        return (
          <BoardTile
            key={tile.id}
            tile={tile}
            propState={propState}
            owner={owner}
            monopoly={tile.type === TILE_TYPES.PROPERTY && !!groupOwners[tile.group]}
            orientation={tileOrientation(tile.id, sideLength)}
            rect={tileRect(tile.id, sideLength)}
            detail={detail}
            art={art}
            tier={artTierFor(tile, maxPrice)}
            selected={selectedTileId === tile.id}
            onSelect={() => onSelectTile(tile.id)}
            onHover={(el) => onHoverTile(tile.id, el)}
            language={language}
          />
        );
      })}
    </div>
  );
});

// --- Tokens ---------------------------------------------------------

function moveSignature(moveDescriptor) {
  if (!moveDescriptor) return null;
  return `${moveDescriptor.playerId}|${moveDescriptor.teleport ? 'T' : 'W'}|${moveDescriptor.path.join(',')}`;
}

// A move is uniquely identified by WHO moved, WHERE the hop ends up, and
// HOW it got there - not by object identity. Every game:state broadcast
// has gone through a JSON round-trip, so the same logical move arrives as
// a brand new object repeatedly; a content signature is what lets this
// tell "new move" apart from "same move, freshly deserialized" (the
// latter used to restart the hop animation and look like a token jumping
// backward on the board).
function useAnimatedTokenPosition(serverPosition, moveDescriptor, animate = true) {
  const [displayedPosition, setDisplayedPosition] = useState(serverPosition);
  const hopTimeoutRef = useRef(null);
  const appliedSignatureRef = useRef(null);

  useEffect(() => {
    const signature = moveSignature(moveDescriptor);
    const isNewMove = signature && signature !== appliedSignatureRef.current;

    if (isNewMove) {
      appliedSignatureRef.current = signature;
      if (!animate) {
        setDisplayedPosition(moveDescriptor.path[moveDescriptor.path.length - 1]);
        return undefined;
      }
      if (moveDescriptor.teleport) {
        setDisplayedPosition(moveDescriptor.path[moveDescriptor.path.length - 1]);
        return undefined;
      }
      let i = 0;
      const stepToNext = () => {
        if (i >= moveDescriptor.path.length) return;
        setDisplayedPosition(moveDescriptor.path[i]);
        i += 1;
        if (i < moveDescriptor.path.length) hopTimeoutRef.current = setTimeout(stepToNext, HOP_DURATION_MS);
      };
      stepToNext();
      return () => { if (hopTimeoutRef.current) clearTimeout(hopTimeoutRef.current); };
    }

    if (!moveDescriptor && displayedPosition !== serverPosition) setDisplayedPosition(serverPosition);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDescriptor, serverPosition]);

  return displayedPosition;
}

// Where a token sits inside its tile when several players share it,
// expressed as a UNIT vector that is later multiplied by the token's own
// size. Tying the spread to the token (rather than to a fixed pixel
// count) is what keeps a stack inside its own square at every zoom
// level - a fixed offset that looks right at 100% throws tokens onto the
// neighbouring tiles once the board is zoomed out.
function stackUnit(index, total) {
  if (total <= 1) return { x: 0, y: 0 };
  if (total === 2) return { x: index === 0 ? -0.5 : 0.5, y: 0 };
  if (total === 3) return [{ x: 0, y: -0.5 }, { x: -0.48, y: 0.4 }, { x: 0.48, y: 0.4 }][index];
  if (total === 4) {
    return [{ x: -0.48, y: -0.48 }, { x: 0.48, y: -0.48 }, { x: -0.48, y: 0.48 }, { x: 0.48, y: 0.48 }][index];
  }
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * 0.62, y: Math.sin(angle) * 0.62 };
}

// Money moves constantly and silently: rent, salary, tax, a card. The
// log records all of it, but a number that changes in a side panel is
// easy to miss entirely. A short flash over the player's own token
// answers "what just happened to me?" where the player is already
// looking - at the board.
function useMoneyFlashes(money, enabled) {
  const [flashes, setFlashes] = useState([]);
  const previous = useRef(money);
  const nextId = useRef(0);

  useEffect(() => {
    const delta = money - previous.current;
    previous.current = money;
    if (!enabled || delta === 0) return undefined;
    nextId.current += 1;
    const id = nextId.current;
    setFlashes((list) => [...list, { id, delta }]);
    const timeout = setTimeout(() => setFlashes((list) => list.filter((f) => f.id !== id)), 1700);
    return () => clearTimeout(timeout);
  }, [money, enabled]);

  return flashes;
}

function Token({ player, moveDescriptor, activePlayers, sideLength, isCurrent, animate, language }) {
  const position = useAnimatedTokenPosition(player.position, moveDescriptor, animate);
  const { x, y } = tileCenter(position, sideLength);
  const sameTile = activePlayers.filter((p) => (p.id === player.id ? true : p.position === position));
  const index = sameTile.findIndex((p) => p.id === player.id);
  const total = sameTile.length;
  const unit = stackUnit(index, total);
  // --tok / --tok-stack are maintained by the viewport in BOARD design
  // pixels, so a token is always drawn at a sane fraction of a tile no
  // matter how far the board is zoomed in or out.
  const sizeVar = total > 1 ? 'var(--tok-stack, 30px)' : 'var(--tok, 30px)';
  const flashes = useMoneyFlashes(player.money, animate);
  // Cosmetic only: the owner's token shape, rim, aura and movement trail.
  const look = useLook(player.cosmetics);
  const firstPosition = useRef(position);
  const hop = animate && position !== firstPosition.current ? position : null;

  return (
    <div
      className={`pointer-events-none absolute z-30 ${animate ? 'transition-[left,top] ease-[cubic-bezier(0.34,1.2,0.44,1)]' : ''}`}
      style={{ left: x, top: y, transitionDuration: animate ? `${HOP_DURATION_MS}ms` : undefined }}
    >
      <div
        className="relative"
        style={{
          width: sizeVar,
          height: sizeVar,
          transform: `translate(-50%, -50%) translate(calc(${sizeVar} * ${unit.x.toFixed(3)}), calc(${sizeVar} * ${unit.y.toFixed(3)}))`,
        }}
      >
        {isCurrent && (
          <span
            className={`absolute inset-[-12%] rounded-full ${animate ? 'animate-turn-ring' : ''}`}
            style={{ boxShadow: `0 0 0 2px ${hexToRgba(player.color, 0.9)}` }}
          />
        )}
        <TokenDecor look={look} color={player.color} hop={hop}>
          <PlayerAvatar
            player={player}
            title={`${player.nickname} · ${pieceLabel(pieceIdFor(player), language)}`}
            sizeClassName="h-full w-full"
            ringClassName={look.tokenShape || look.tokenFrame ? '' : 'ring-[3px] ring-white/95'}
          />
        </TokenDecor>

        {player.inJail && (
          <span
            className="absolute -bottom-[15%] -right-[15%] flex h-[55%] w-[55%] items-center justify-center rounded-full bg-rent ring-2 ring-white/90"
            title={player.nickname}
          >
            <Icon.jail className="h-[70%] w-[70%] text-white" />
          </span>
        )}

        {/* Counter-scaled so the amount stays readable however far out
            the board is zoomed - the same trick the board centre uses. */}
        {flashes.map((flash, i) => (
          <span
            key={flash.id}
            className={`pointer-events-none absolute left-1/2 whitespace-nowrap rounded-full px-2 py-[1px] text-[13px] font-black tabular-nums shadow-lift ${
              flash.delta > 0 ? 'bg-go text-white' : 'bg-rent text-white'
            }`}
            style={{
              bottom: '110%',
              transform: `translateX(-50%) scale(var(--hud-scale, 1)) translateY(${-i * 18}px)`,
              transformOrigin: 'bottom center',
              animation: 'money-float 1.7s ease-out forwards',
              zIndex: 40,
            }}
          >
            {flash.delta > 0 ? '+' : '-'}${Math.abs(flash.delta).toLocaleString('en-US')}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayerTokens({ players, lastMove, sideLength, currentPlayerId, animate, language }) {
  const active = players.filter((p) => !p.bankrupt);
  return active.map((player) => (
    <Token
      key={player.id}
      player={player}
      moveDescriptor={lastMove?.playerId === player.id ? lastMove : null}
      activePlayers={active}
      sideLength={sideLength}
      isCurrent={player.id === currentPlayerId}
      animate={animate}
      language={language}
    />
  ));
}

// --- Board centre ---------------------------------------------------

function BoardCenter({ sideLength, freeParkingPot, diceSlot, currentPlayer, isMyTurn, t }) {
  const inner = boardInnerRect(sideLength);
  return (
    <div
      className="pointer-events-none absolute flex flex-col items-center justify-center"
      style={{ left: inner.x, top: inner.y, width: inner.w, height: inner.h }}
    >
      <p
        className="absolute font-display font-black tracking-tight text-ink/[0.055]"
        style={{ fontSize: Math.min(inner.w * 0.16, 150), transform: 'rotate(-4deg)' }}
      >
        LANDMARK
      </p>

      {/* Counter-scaled: the dice and the turn banner are information, not
          board art, so they hold a constant size on screen instead of
          shrinking into illegibility as the board zooms out. */}
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{ transform: 'scale(var(--hud-scale, 1))' }}
      >

      {currentPlayer && (
        <div
          className="flex items-center gap-2 rounded-full px-4 py-1.5 shadow-sm"
          style={{ backgroundColor: hexToRgba(currentPlayer.color, 0.16), border: `1px solid ${hexToRgba(currentPlayer.color, 0.45)}` }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentPlayer.color }} />
          <span className="text-[15px] font-bold tracking-tight" style={{ color: currentPlayer.color }}>
            {isMyTurn ? t('game.yourTurn') : t('game.nameTurn', { name: currentPlayer.nickname })}
          </span>
        </div>
      )}

      {diceSlot}

      {freeParkingPot > 0 && (
          <div className="flex items-center gap-2 rounded-full border-2 border-dashed border-brass/50 bg-brass/10 px-4 py-1.5">
            <Icon.parking className="h-4 w-4 text-brass-deep" />
            <span className="text-[13px] font-semibold text-brass-deep">
              {t('game.freeParkingLabel')} <span className="font-display font-black tnum">${freeParkingPot}</span>
            </span>
          </div>
      )}
      </div>
    </div>
  );
}

// --- Hover tooltip --------------------------------------------------

function TileTooltip({ hover, gameState, language, t }) {
  if (!hover) return null;
  const tile = gameState.board[hover.tileId];
  if (!tile) return null;
  const propState = gameState.properties[tile.id];
  const owner = propState?.ownerId ? gameState.players.find((p) => p.id === propState.ownerId) : null;
  const rent = currentRent(tile, propState, gameState.board, gameState.properties);
  const ownable = !!propState;

  return (
    <div
      className="pointer-events-none fixed z-40 w-56 animate-fade-in rounded-xl border border-white/12 bg-felt-800/95 p-3 shadow-deep backdrop-blur-md"
      style={{ left: hover.x, top: hover.y, transform: hover.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: hover.accent }} />
        <p className="truncate text-sm font-bold text-parch">{getTileName(tile, language)}</p>
      </div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parch/40">
        {t(`tileType.${tile.type}`)}
      </p>
      {ownable && (
        <dl className="space-y-1 text-[12px]">
          <div className="flex justify-between gap-3">
            <dt className="text-parch/50">{t('tooltip.price')}</dt>
            <dd className="font-semibold text-parch tnum">${tile.price}</dd>
          </div>
          {rent != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-parch/50">{t('tooltip.rentNow')}</dt>
              <dd className="font-semibold text-brass-light tnum">${rent}</dd>
            </div>
          )}
          {tile.type === TILE_TYPES.UTILITY && owner && (
            <div className="flex justify-between gap-3">
              <dt className="text-parch/50">{t('tooltip.rentNow')}</dt>
              <dd className="font-semibold text-brass-light">
                {utilityMultiplier(owner.id, gameState.board, gameState.properties)}× {t('tooltip.diceRoll')}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-parch/50">{t('tooltip.owner')}</dt>
            <dd className="flex items-center gap-1.5 font-semibold text-parch">
              {owner ? (
                <>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: owner.color }} />
                  <span className="max-w-[90px] truncate">{owner.nickname}</span>
                </>
              ) : (
                <span className="text-go-light">{t('tooltip.available')}</span>
              )}
            </dd>
          </div>
          {propState?.houses > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-parch/50">{t('tooltip.buildings')}</dt>
              <dd className="font-semibold text-parch">
                {propState.houses === 5 ? t('property.hotel') : t('property.housesCount', { count: propState.houses })}
              </dd>
            </div>
          )}
          {propState?.mortgaged && (
            <p className="mt-1 rounded bg-rent/20 px-2 py-1 text-center text-[11px] font-bold uppercase text-rent-light">
              {t('property.mortgaged')}
            </p>
          )}
        </dl>
      )}
      {!ownable && tile.amount != null && (
        <p className="text-[12px] font-semibold text-rent-light tnum">-${tile.amount}</p>
      )}
      <p className="mt-2 border-t border-white/10 pt-1.5 text-[10.5px] text-parch/35">{t('tooltip.clickForDetails')}</p>
    </div>
  );
}

// --- Zoom / pan viewport --------------------------------------------

export default function Board({
  gameState, onSelectTile, selectedTileId, isMyTurn, diceSlot, overlay,
}) {
  const { language, t } = useTranslation();
  const { settings } = useSettings();
  const { properties, players, board, sideLength, lastMove } = gameState;
  const size = boardPixelSize(sideLength);
  // Settings are read through refs inside the imperative zoom path,
  // which runs outside React's render cycle and would otherwise close
  // over whatever value was current when the handler was created.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const touchedRef = useRef(false);

  const [zoomPct, setZoomPct] = useState(100);
  const [detail, setDetail] = useState('full');
  const [hover, setHover] = useState(null);
  const [isPanning, setIsPanning] = useState(false);

  const fitScale = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return 1;
    return Math.min((el.clientWidth - PAD * 2) / size, (el.clientHeight - PAD * 2) / size);
  }, [size]);

  const clampPosition = useCallback((x, y, scale) => {
    const el = viewportRef.current;
    if (!el) return { x, y };
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const cw = size * scale;
    const ch = size * scale;
    const nx = cw + PAD * 2 <= vw ? (vw - cw) / 2 : Math.min(PAD, Math.max(vw - cw - PAD, x));
    const ny = ch + PAD * 2 <= vh ? (vh - ch) / 2 : Math.min(PAD, Math.max(vh - ch - PAD, y));
    return { x: nx, y: ny };
  }, [size]);

  // Written straight to the DOM rather than through React state: a pan
  // gesture fires pointermove at screen refresh rate, and re-rendering
  // dozens of tiles on each one is what makes a board feel heavy. Only
  // the zoom readout and the detail level (which changes rarely) go
  // through state.
  const commit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { scale, x, y } = view.current;
    stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    stage.style.setProperty('--board-scale', String(scale));

    // Token size is derived from how big a TILE currently is on screen,
    // then converted back into board design pixels. A token therefore
    // stays a fixed fraction of its own square at every zoom level
    // (with a floor so it never vanishes), instead of growing until it
    // covers the neighbouring tiles when the board is zoomed out.
    const tileOnScreen = TILE_W * scale;
    const floor = settingsRef.current.largeTokens ? 20 : 15;
    const single = Math.min(34, Math.max(floor, tileOnScreen * 0.46));
    // Two tokens side by side span exactly 2x their own width, so
    // holding that below the tile width is what keeps a shared square
    // from bleeding onto its neighbours.
    const stacked = Math.max(9, Math.min(single, tileOnScreen * 0.42));
    stage.style.setProperty('--tok', `${(single / scale).toFixed(2)}px`);
    stage.style.setProperty('--tok-stack', `${(stacked / scale).toFixed(2)}px`);

    // The middle of the board carries information (dice, whose turn),
    // so it counter-scales to hold a constant on-screen size.
    stage.style.setProperty('--hud-scale', String(Math.min(3.4, Math.max(0.55, 1 / scale))));

    setZoomPct(Math.round(scale * 100));
    setDetail((prev) => {
      const next = detailFor(scale);
      return next === prev ? prev : next;
    });
  }, []);

  const setView = useCallback((scale, x, y, animate = false) => {
    const stage = stageRef.current;
    const min = Math.max(SCALE_FLOOR, fitScale() * 0.55);
    const s = Math.min(SCALE_MAX, Math.max(min, scale));
    const pos = clampPosition(x, y, s);
    view.current = { scale: s, x: pos.x, y: pos.y };
    if (stage) stage.style.transition = animate ? 'transform 220ms cubic-bezier(0.22,1,0.36,1)' : 'none';
    commit();
  }, [clampPosition, commit, fitScale]);

  const fit = useCallback((animate = true) => {
    const el = viewportRef.current;
    if (!el) return;
    const s = fitScale();
    setView(s, (el.clientWidth - size * s) / 2, (el.clientHeight - size * s) / 2, animate);
  }, [fitScale, setView, size]);

  // Zoom around a fixed viewport point, so the thing under the cursor
  // (or the middle of the screen, for the buttons) stays put.
  const zoomAt = useCallback((nextScale, px, py, animate = false) => {
    const { scale, x, y } = view.current;
    const min = Math.max(SCALE_FLOOR, fitScale() * 0.55);
    const s = Math.min(SCALE_MAX, Math.max(min, nextScale));
    const k = s / scale;
    setView(s, px - (px - x) * k, py - (py - y) * k, animate);
  }, [fitScale, setView]);

  const zoomByStep = useCallback((factor) => {
    const el = viewportRef.current;
    if (!el) return;
    zoomAt(view.current.scale * factor, el.clientWidth / 2, el.clientHeight / 2, true);
  }, [zoomAt]);

  useLayoutEffect(() => {
    fit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideLength]);

  // Token size is written straight to the DOM by commit(), which only
  // runs on zoom/pan - a settings change has to ask for a fresh one or
  // it would not show up until the next time the board moved.
  useEffect(() => {
    commit();
  }, [settings.largeTokens, commit]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      if (touchedRef.current) {
        const { scale, x, y } = view.current;
        setView(scale, x, y, false);
      } else {
        fit(false);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, setView]);

  // Wheel zoom. Registered natively (not via React's onWheel) because the
  // listener must be non-passive to preventDefault the page scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      // Trackpad pinch arrives as ctrl+wheel with much smaller deltas -
      // a single exponential curve handles both without a mode switch.
      const intensity = (e.ctrlKey ? 0.012 : 0.0022) * (settingsRef.current.zoomSpeed || 1);
      const factor = Math.exp(-e.deltaY * intensity);
      zoomAt(view.current.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Deliberately NOT capturing the pointer here. While a capture is
    // active, the browser retargets the eventual click to the capturing
    // element, which would swallow every tile click - the board would
    // pan beautifully and open nothing. Capture is taken only once a
    // real drag starts (below), where it is actually needed to keep
    // receiving moves that leave the viewport.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggedRef.current = false;
    if (pointers.current.size === 1) {
      gesture.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, originX: view.current.x, originY: view.current.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        mode: 'pinch',
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startScale: view.current.scale,
      };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const el = viewportRef.current;
    const rect = el.getBoundingClientRect();

    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      draggedRef.current = true;
      touchedRef.current = true;
      zoomAt(g.startScale * (dist / g.startDist), mid.x, mid.y);
      return;
    }

    if (g.mode === 'pan') {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!draggedRef.current && Math.hypot(dx, dy) < 4) return;
      if (!draggedRef.current) {
        draggedRef.current = true;
        touchedRef.current = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        setIsPanning(true);
        setHover(null);
      }
      setView(view.current.scale, g.originX + dx, g.originY + dy);
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    // The click that closes a drag has to be swallowed, but only that
    // one: a flag left standing would eat the next genuine tile click.
    // Clearing it from a macrotask is precise, because pointerup ->
    // mouseup -> click all run in the same task.
    if (draggedRef.current) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    draggedRef.current = false;
    if (pointers.current.size === 0) {
      gesture.current = null;
      setIsPanning(false);
    } else if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      gesture.current = { mode: 'pan', startX: only.x, startY: only.y, originX: view.current.x, originY: view.current.y };
    }
  };

  // A pan that ends over a tile must not also "click" that tile.
  const onClickCapture = (e) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  // Double-click zooms, but only on empty board surface: over a tile a
  // double click is just two clicks, and that already opens its deed -
  // zooming as well would fight the player's own intent.
  const onDoubleClick = (e) => {
    if (e.target.closest('button')) return;
    const rect = viewportRef.current.getBoundingClientRect();
    touchedRef.current = true;
    zoomAt(view.current.scale * 1.8, e.clientX - rect.left, e.clientY - rect.top, true);
  };

  const handleHoverTile = useCallback((tileId, el) => {
    if (!el || !settingsRef.current.showTooltips) {
      setHover(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // Near the top of the window there is no room for a card above the
    // tile, so it flips below rather than being clipped by the header.
    const below = r.top < 230;
    setHover({
      tileId,
      x: Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120),
      y: below ? r.bottom + 10 : r.top - 10,
      below,
      accent: tileAccentColor(gameState.board[tileId]),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.board]);

  const currentPlayer = players[gameState.currentPlayerIndex];
  // 'auto' lets the zoom level decide; the other two are the player
  // saying they would rather have the names (or the clean board art)
  // whatever the zoom is doing.
  const effectiveDetail = settings.tileLabels === 'always' ? 'full'
    : settings.tileLabels === 'never' ? 'min'
      : detail;
  const atMin = zoomPct / 100 <= Math.max(SCALE_FLOOR, fitScale() * 0.55) + 0.001;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-2xl border border-white/10 bg-felt-900/60 shadow-[inset_0_2px_30px_rgba(0,0,0,0.6)]">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClickCapture={onClickCapture}
        onDoubleClick={onDoubleClick}
        className={`no-drag absolute inset-0 overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div ref={stageRef} data-board-stage className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ width: size, height: size }}>
          <BoardSurface
            board={board}
            properties={properties}
            players={players}
            sideLength={sideLength}
            detail={effectiveDetail}
            selectedTileId={selectedTileId}
            onSelectTile={onSelectTile}
            onHoverTile={handleHoverTile}
            language={language}
            art={settings.tileArt}
          />
          <BoardCenter
            sideLength={sideLength}
            freeParkingPot={gameState.freeParkingPot}
            diceSlot={diceSlot}
            currentPlayer={currentPlayer}
            isMyTurn={isMyTurn}
            t={t}
          />
          <PlayerTokens
            players={players}
            lastMove={lastMove}
            sideLength={sideLength}
            currentPlayerId={currentPlayer?.id}
            animate={settings.animations}
            language={language}
          />
        </div>
      </div>

      {/* Overlays sit outside the transformed stage, so they keep a
          constant size and can never be panned off screen. */}
      {overlay}

      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-full border border-white/12 bg-felt-800/90 p-1 shadow-lift backdrop-blur-md">
        <button
          type="button"
          onClick={() => zoomByStep(1 / 1.35)}
          disabled={atMin}
          title={t('game.zoomOut')}
          aria-label={t('game.zoomOut')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25"
        >
          <Icon.minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => fit(true)}
          title={t('game.resetZoom')}
          className="flex min-w-[3.6rem] items-center justify-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold text-parch/80 transition-colors hover:bg-white/10 hover:text-parch tnum"
        >
          {zoomPct}%
        </button>
        <button
          type="button"
          onClick={() => zoomByStep(1.35)}
          disabled={zoomPct / 100 >= SCALE_MAX - 0.001}
          title={t('game.zoomIn')}
          aria-label={t('game.zoomIn')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25"
        >
          <Icon.plus className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => fit(true)}
          title={t('game.fitBoard')}
          aria-label={t('game.fitBoard')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch"
        >
          <Icon.fit className="h-4 w-4" />
        </button>
      </div>

      {!isPanning && <TileTooltip hover={hover} gameState={gameState} language={language} t={t} />}
    </div>
  );
}
