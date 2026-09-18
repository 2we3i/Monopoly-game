// CatanBoard.jsx
// The island: an SVG board drawn at a fixed design size inside a zoom/pan
// viewport. Wheel zooms smoothly around the cursor, a drag pans (with a
// small threshold, so a click is never mistaken for a drag and a drag
// never places a piece), two fingers pinch. Zoom is local to this player
// and never touches the game.
//
// The board only draws what the server says: terrain, numbers, harbours,
// pieces and the robber from the state, and the clickable spots from the
// legal moves in this player's own payload.

import {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import Icon from '../icons';
import {
  CityShape, ResourceGlyph, RobberShape, SettlementShape, TERRAIN_STYLE, TerrainDecor, pipCount, playerColor,
} from './catanArt';

const S = 64; // hex corner radius in design pixels
const UX = (S * Math.sqrt(3)) / 2;
const UY = S / 2;
const MARGIN = 26;
const PAD = 16;
const MAX_SCALE_ABS = 2.6;

function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

// Everything that depends on how big the island is, worked out from the
// board the server sent. A hex is always S across, so the big islands make
// a bigger picture rather than smaller hexes, and the viewport below
// scales whatever comes out to fit.
//
// The sea is every hex position within one ring of the island that the
// island itself does not use, which also fills the notches an island
// leaves where it drops a corner hex.
function metricsFor(board) {
  const ring = board.hexes.reduce(
    (max, h) => Math.max(max, Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)),
    0,
  );
  const land = new Set(board.hexes.map((h) => `${h.q},${h.r}`));
  const R = ring + 1;
  const sea = [];
  for (let q = -R; q <= R; q += 1) {
    for (let r = -R; r <= R; r += 1) {
      if (Math.abs(q + r) <= R && !land.has(`${q},${r}`)) sea.push({ x: 2 * q + r, y: 3 * r });
    }
  }
  // A hex corner reaches one X unit and two Y units from its centre, so
  // the picture is the outermost sea tile plus that, plus the margin.
  const spanX = sea.reduce((max, h) => Math.max(max, Math.abs(h.x)), 0) + 1;
  const spanY = sea.reduce((max, h) => Math.max(max, Math.abs(h.y)), 0) + 2;
  const W = 2 * spanX * UX + MARGIN * 2;
  const H = 2 * spanY * UY + MARGIN * 2;
  const OX = W / 2;
  const OY = H / 2;
  return {
    W,
    H,
    OX,
    OY,
    sea,
    // The circle of open water behind everything, in hex radii.
    water: R * 2 + 1.6,
    px: (x) => OX + x * UX,
    py: (y) => OY + y * UY,
  };
}

// --- the static island (terrain, numbers, harbours) ----------------------

const Island = memo(function Island({
  board, m, rolled, t,
}) {
  const vertexById = useMemo(() => Object.fromEntries(board.vertices.map((v) => [v.id, v])), [board]);
  const edgeById = useMemo(() => Object.fromEntries(board.edges.map((e) => [e.id, e])), [board]);

  return (
    <g>
      <defs>
        <radialGradient id="catan-sea-grad" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#3a8dbf" />
          <stop offset="100%" stopColor="#1d5a86" />
        </radialGradient>
      </defs>
      <polygon points={hexPoints(m.OX, m.OY, m.water * S)} transform={`rotate(30 ${m.OX} ${m.OY})`} fill="url(#catan-sea-grad)" opacity="0.55" />
      {m.sea.map((h) => (
        <g key={`sea${h.x},${h.y}`}>
          <polygon points={hexPoints(m.px(h.x), m.py(h.y), S)} fill="url(#catan-sea-grad)" stroke="#5aa6d4" strokeOpacity="0.35" strokeWidth="1.5" />
          <path
            d={`M${m.px(h.x) - 16} ${m.py(h.y) + 6}q4-4 8 0t8 0t8 0`}
            fill="none"
            stroke="#b7e0f5"
            strokeOpacity="0.35"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* A soft shadow under the island lifts it off the water. */}
      {board.hexes.map((h) => (
        <polygon key={`sh${h.id}`} points={hexPoints(m.px(h.x), m.py(h.y) + 5, S)} fill="#0b2a40" opacity="0.45" />
      ))}

      {board.hexes.map((h) => {
        const style = TERRAIN_STYLE[h.terrain];
        const cx = m.px(h.x);
        const cy = m.py(h.y);
        return (
          <g key={`hex${h.id}`}>
            <polygon points={hexPoints(cx, cy, S - 1)} fill={style.fill} stroke="#f3e6c2" strokeWidth="3" strokeLinejoin="round" />
            <polygon points={hexPoints(cx, cy, S - 7)} fill="none" stroke={style.light} strokeOpacity="0.55" strokeWidth="2" />
            <g transform={`translate(${cx} ${cy})`}>
              <TerrainDecor terrain={h.terrain} r={S - 8} />
            </g>
          </g>
        );
      })}

      {/* Harbours: two piers from the coastal corners to a badge in the sea. */}
      {board.ports.map((port) => {
        const edge = edgeById[port.edgeId];
        const a = vertexById[edge.a];
        const b = vertexById[edge.b];
        const mx = (m.px(a.x) + m.px(b.x)) / 2;
        const my = (m.py(a.y) + m.py(b.y)) / 2;
        const dx = mx - m.OX;
        const dy = my - m.OY;
        const len = Math.hypot(dx, dy) || 1;
        const bx = mx + (dx / len) * 34;
        const by = my + (dy / len) * 34;
        const label = port.type === 'any'
          ? t('catan.port.any')
          : t('catan.port.specific', { resource: t(`catan.resource.${port.type}`) });
        return (
          <g key={`port${port.edgeId}`}>
            <title>{label}</title>
            {[a, b].map((v) => (
              <line key={v.id} x1={m.px(v.x)} y1={m.py(v.y)} x2={bx} y2={by} stroke="#8a5a2b" strokeWidth="5" strokeLinecap="round" />
            ))}
            <circle cx={bx} cy={by} r="19" fill="#f6edd6" stroke="#8a5a2b" strokeWidth="2.5" />
            {port.type === 'any' ? (
              <text x={bx} y={by + 5} textAnchor="middle" fontSize="15" fontWeight="900" fill="#3b2a14" fontFamily="Inter, system-ui, sans-serif">3:1</text>
            ) : (
              <>
                <ResourceGlyph resource={port.type} x={bx} y={by - 5} size={17} />
                <text x={bx} y={by + 13} textAnchor="middle" fontSize="10" fontWeight="900" fill="#3b2a14" fontFamily="Inter, system-ui, sans-serif">2:1</text>
              </>
            )}
          </g>
        );
      })}

      {/* Number tokens, with the resource each hex produces above them. */}
      {board.hexes.map((h) => {
        const cx = m.px(h.x);
        const cy = m.py(h.y);
        const resource = TERRAIN_STYLE[h.terrain].resource;
        const hot = h.number === rolled;
        const red = h.number === 6 || h.number === 8;
        return (
          <g key={`num${h.id}`}>
            {resource && (
              <g>
                <circle cx={cx} cy={cy - 34} r="12" fill="#fbf6e9" fillOpacity="0.9" stroke="#000" strokeOpacity="0.15" />
                <ResourceGlyph resource={resource} x={cx} y={cy - 34} size={17} />
              </g>
            )}
            {h.number && (
              <g>
                {hot && <circle cx={cx} cy={cy + 2} r="27" fill="none" stroke="#ffe27a" strokeWidth="4" opacity="0.95" />}
                <circle cx={cx} cy={cy + 3} r="20" fill="#000" opacity="0.2" />
                <circle cx={cx} cy={cy + 1} r="20" fill="#f7eed8" stroke="#b9a57a" strokeWidth="1.5" />
                <text
                  x={cx}
                  y={cy + 6}
                  textAnchor="middle"
                  fontSize={red ? 19 : 17}
                  fontWeight="900"
                  fill={red ? '#b3261e' : '#2a2418'}
                  fontFamily="Fraunces, Georgia, serif"
                >
                  {h.number}
                </text>
                <g>
                  {Array.from({ length: pipCount(h.number) }).map((_, i, arr) => (
                    <circle key={i} cx={cx + (i - (arr.length - 1) / 2) * 4.2} cy={cy + 13} r="1.45" fill={red ? '#b3261e' : '#2a2418'} />
                  ))}
                </g>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}, (a, b) => a.layoutKey === b.layoutKey && a.rolled === b.rolled && a.t === b.t);

// --- hover card ------------------------------------------------------------

function HexCard({
  hover, board, state, t,
}) {
  if (!hover) return null;
  const hex = board.hexes[hover.hexId];
  if (!hex) return null;
  const style = TERRAIN_STYLE[hex.terrain];
  const owners = new Map();
  hex.vertices.forEach((v) => {
    const b = state.buildings.find((x) => x.vertexId === v);
    if (!b) return;
    const p = state.players.find((pl) => pl.id === b.playerId);
    if (!p) return;
    const prev = owners.get(p.id) || { player: p, gain: 0 };
    prev.gain += b.type === 'city' ? 2 : 1;
    owners.set(p.id, prev);
  });
  const robbed = board.robberHex === hex.id;
  return (
    <div
      className="pointer-events-none fixed z-40 w-56 animate-fade-in rounded-xl border border-white/12 bg-felt-800/95 p-3 text-parch shadow-deep backdrop-blur-md"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: style.fill }} />
        <p className="text-[14px] font-bold">{t(`catan.terrain.${hex.terrain}`)}</p>
      </div>
      <p className="text-[12px] text-parch/60">
        {style.resource
          ? t('catan.hex.produces', { resource: t(`catan.resource.${style.resource}`) })
          : t('catan.hex.nothing')}
      </p>
      {hex.number && (
        <p className="mt-1 text-[12px] text-parch/60">
          {t('catan.hex.number', { n: hex.number })} · {t('catan.hex.chance', { n: pipCount(hex.number) })}
        </p>
      )}
      {robbed && <p className="mt-1.5 rounded bg-black/40 px-2 py-1 text-[11.5px] font-semibold text-rent-light">🗡️ {t('catan.hex.robber')}</p>}
      {owners.size > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-white/10 pt-1.5">
          {[...owners.values()].map(({ player, gain }) => (
            <li key={player.id} className="flex items-center gap-1.5 text-[11.5px]">
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/40" style={{ backgroundColor: playerColor(player.color).fill }} />
              <span className="min-w-0 flex-1 truncate">{player.nickname}</span>
              <span className="text-parch/55 tnum">+{gain}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- viewport ----------------------------------------------------------------

export default function CatanBoard({
  state, mode, onVertex, onEdge, onHex, t,
}) {
  const { board } = state;
  // The island's size: the same for every board of a given island, so it
  // is worked out again only when the game moves to a different one.
  const m = useMemo(
    () => metricsFor(board),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.island, board.hexes.length],
  );
  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const target = useRef({ s: 1, x: 0, y: 0 });
  const rafRef = useRef(0);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const touchedRef = useRef(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [isPanning, setIsPanning] = useState(false);
  const [hover, setHover] = useState(null);
  const [hoverSpot, setHoverSpot] = useState(null);

  const limits = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { fit: 1, min: 0.3, max: MAX_SCALE_ABS };
    const fit = Math.min((el.clientWidth - PAD * 2) / m.W, (el.clientHeight - PAD * 2) / m.H);
    return { fit, min: fit * 0.8, max: Math.max(MAX_SCALE_ABS, fit * 3) };
  }, [m]);

  const clamp = useCallback((s, x, y) => {
    const el = viewportRef.current;
    const { min, max } = limits();
    const ns = Math.min(max, Math.max(min, s));
    if (!el) return { s: ns, x, y };
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const cw = m.W * ns;
    const ch = m.H * ns;
    const nx = cw + PAD * 2 <= vw ? (vw - cw) / 2 : Math.min(PAD, Math.max(vw - cw - PAD, x));
    const ny = ch + PAD * 2 <= vh ? (vh - ch) / 2 : Math.min(PAD, Math.max(vh - ch - PAD, y));
    return { s: ns, x: nx, y: ny };
  }, [limits]);

  // Written straight to the DOM: pans and zoom frames run at screen
  // refresh rate, and re-rendering the island on each would stutter.
  const paint = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { s, x, y } = view.current;
    stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    const pct = Math.round(s * 100);
    setZoomPct((prev) => (prev === pct ? prev : pct));
  }, []);

  const tick = useCallback(() => {
    const cur = view.current;
    const tgt = target.current;
    const k = 0.24;
    const next = { s: cur.s + (tgt.s - cur.s) * k, x: cur.x + (tgt.x - cur.x) * k, y: cur.y + (tgt.y - cur.y) * k };
    const done = Math.abs(next.s - tgt.s) < 0.0008 && Math.abs(next.x - tgt.x) < 0.4 && Math.abs(next.y - tgt.y) < 0.4;
    view.current = done ? { ...tgt } : next;
    paint();
    rafRef.current = done ? 0 : requestAnimationFrame(tick);
  }, [paint]);

  const setTarget = useCallback((s, x, y, immediate = false) => {
    target.current = clamp(s, x, y);
    if (immediate) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      view.current = { ...target.current };
      paint();
    } else if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [clamp, paint, tick]);

  const fit = useCallback((immediate = false) => {
    const el = viewportRef.current;
    if (!el) return;
    const { fit: s } = limits();
    setTarget(s, (el.clientWidth - m.W * s) / 2, (el.clientHeight - m.H * s) / 2, immediate);
  }, [limits, setTarget]);

  // Zoom around a fixed viewport point. Built on the TARGET view, so a
  // quick series of wheel ticks adds up instead of fighting the animation;
  // interpolating scale and offset together keeps that point still.
  const zoomAt = useCallback((factor, ax, ay, immediate = false) => {
    const tgt = target.current;
    const { min, max } = limits();
    const ns = Math.min(max, Math.max(min, tgt.s * factor));
    const wx = (ax - tgt.x) / tgt.s;
    const wy = (ay - tgt.y) / tgt.s;
    setTarget(ns, ax - wx * ns, ay - wy * ns, immediate);
  }, [limits, setTarget]);

  // Fit on the first paint, and again if the game moves to a board of a
  // different size - a zoom chosen for the small island means nothing on
  // the big one.
  useLayoutEffect(() => {
    touchedRef.current = false;
    fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      if (touchedRef.current) {
        const { s, x, y } = target.current;
        setTarget(s, x, y, true);
      } else {
        fit(true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, setTarget]);

  // Registered natively: the listener must be non-passive to stop the page
  // from scrolling while the board zooms.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-Math.max(-120, Math.min(120, delta)) * (e.ctrlKey ? 0.01 : 0.0022));
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    // No pointer capture yet: a capture would retarget the click away from
    // the corner or side being clicked. It is taken once a drag starts.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggedRef.current = false;
    if (pointers.current.size === 1) {
      gesture.current = {
        mode: 'pan', startX: e.clientX, startY: e.clientY, originX: target.current.x, originY: target.current.y,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startScale: target.current.s };
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
      draggedRef.current = true;
      touchedRef.current = true;
      const wanted = (g.startScale * dist) / g.startDist;
      zoomAt(wanted / target.current.s, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, true);
      return;
    }
    if (g.mode === 'pan') {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!draggedRef.current && Math.hypot(dx, dy) < 5) return;
      if (!draggedRef.current) {
        draggedRef.current = true;
        touchedRef.current = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        setIsPanning(true);
        setHover(null);
        setHoverSpot(null);
      }
      setTarget(target.current.s, g.originX + dx, g.originY + dy, true);
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    // Swallow exactly the click that ends a drag (pointerup, mouseup and
    // click run in one task, so a macrotask clears the flag precisely).
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
      gesture.current = {
        mode: 'pan', startX: only.x, startY: only.y, originX: target.current.x, originY: target.current.y,
      };
    }
  };

  const onClickCapture = (e) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  const onDoubleClick = (e) => {
    if (mode) return;
    const rect = viewportRef.current.getBoundingClientRect();
    touchedRef.current = true;
    zoomAt(1.6, e.clientX - rect.left, e.clientY - rect.top);
  };

  const zoomStep = (factor) => {
    const el = viewportRef.current;
    touchedRef.current = true;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  // --- derived drawing data ----------------------------------------------

  const layoutKey = useMemo(
    () => `${board.island || 'classic'}:${board.hexes.map((h) => `${h.terrain[0]}${h.number || 0}`).join('')}${board.ports.map((p) => `${p.edgeId}${p.type}`).join('')}`,
    [board],
  );
  const vertexById = useMemo(() => Object.fromEntries(board.vertices.map((v) => [v.id, v])), [board]);
  const edgeById = useMemo(() => Object.fromEntries(board.edges.map((e) => [e.id, e])), [board]);
  const colorOf = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p.color])), [state.players]);
  const myColor = state.you?.color;
  const legal = state.you?.legal || {
    settlements: [], roads: [], cities: [], robberHexes: [],
  };
  const rolledThisTurn = state.lastRoll && state.lastRoll.turn === state.turnNumber && state.lastRoll.total !== 7
    ? state.lastRoll.total
    : null;
  const robber = board.hexes[board.robberHex];
  const setupVertex = state.setup?.lastVertex;

  const spots = {
    settlements: mode === 'settlement' ? legal.settlements : [],
    roads: mode === 'road' ? legal.roads : [],
    cities: mode === 'city' ? legal.cities : [],
    robber: mode === 'robber' ? legal.robberHexes : [],
  };

  const hexHover = (h) => (e) => {
    if (gesture.current && draggedRef.current) return;
    setHover({ hexId: h.id, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0c2536] shadow-[inset_0_2px_30px_rgba(0,0,0,0.6)]">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClickCapture={onClickCapture}
        onDoubleClick={onDoubleClick}
        onPointerLeave={() => setHover(null)}
        className={`no-drag absolute inset-0 overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div ref={stageRef} className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ width: m.W, height: m.H }}>
          <svg width={m.W} height={m.H} viewBox={`0 0 ${m.W} ${m.H}`} className="block select-none" aria-label={t('catan.boardLabel')}>
            <Island board={board} m={m} layoutKey={layoutKey} rolled={rolledThisTurn} t={t} />

            {/* Hex hit areas: hover explains the hex; in robber mode a click moves the robber. */}
            {board.hexes.map((h) => {
              const target2 = spots.robber.includes(h.id);
              return (
                <polygon
                  key={`hit${h.id}`}
                  points={hexPoints(m.px(h.x), m.py(h.y), S - 2)}
                  fill={target2 ? 'rgba(255,255,255,0.12)' : 'transparent'}
                  stroke={target2 ? '#fff6c9' : 'none'}
                  strokeWidth={target2 ? 3 : 0}
                  strokeDasharray={target2 ? '10 7' : undefined}
                  className={target2 ? 'cursor-pointer transition-[fill] hover:fill-[rgba(255,240,160,0.32)]' : ''}
                  onPointerMove={hexHover(h)}
                  onPointerLeave={() => setHover((cur) => (cur?.hexId === h.id ? null : cur))}
                  onClick={target2 ? () => onHex(h.id) : undefined}
                />
              );
            })}

            {/* Roads */}
            {state.roads.map((r) => {
              const e = edgeById[r.edgeId];
              const a = vertexById[e.a];
              const b = vertexById[e.b];
              const c = playerColor(colorOf[r.playerId]);
              const x1 = m.px(a.x) + (m.px(b.x) - m.px(a.x)) * 0.16;
              const y1 = m.py(a.y) + (m.py(b.y) - m.py(a.y)) * 0.16;
              const x2 = m.px(b.x) + (m.px(a.x) - m.px(b.x)) * 0.16;
              const y2 = m.py(b.y) + (m.py(a.y) - m.py(b.y)) * 0.16;
              return (
                <g key={`road${r.edgeId}`} pointerEvents="none">
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.edge} strokeWidth="11" strokeLinecap="round" />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.fill} strokeWidth="7" strokeLinecap="round" />
                </g>
              );
            })}

            {/* Legal road spots */}
            {spots.roads.map((id) => {
              const e = edgeById[id];
              const a = vertexById[e.a];
              const b = vertexById[e.b];
              const c = playerColor(myColor);
              const hot = hoverSpot === `e${id}`;
              return (
                <g
                  key={`lr${id}`}
                  className="cursor-pointer"
                  onClick={() => onEdge(id)}
                  onPointerEnter={() => setHoverSpot(`e${id}`)}
                  onPointerLeave={() => setHoverSpot(null)}
                >
                  <line x1={m.px(a.x)} y1={m.py(a.y)} x2={m.px(b.x)} y2={m.py(b.y)} stroke="transparent" strokeWidth="22" />
                  <line
                    x1={m.px(a.x) + (m.px(b.x) - m.px(a.x)) * 0.2}
                    y1={m.py(a.y) + (m.py(b.y) - m.py(a.y)) * 0.2}
                    x2={m.px(b.x) + (m.px(a.x) - m.px(b.x)) * 0.2}
                    y2={m.py(b.y) + (m.py(a.y) - m.py(b.y)) * 0.2}
                    stroke={hot ? c.fill : '#fffbe8'}
                    strokeOpacity={hot ? 1 : 0.85}
                    strokeWidth={hot ? 9 : 6}
                    strokeLinecap="round"
                    strokeDasharray={hot ? undefined : '6 6'}
                    className="catan-pulse"
                  />
                </g>
              );
            })}

            {/* Settlements and cities */}
            {state.buildings.map((b) => {
              const v = vertexById[b.vertexId];
              const hot = spots.cities.includes(b.vertexId);
              return (
                <g key={`b${b.vertexId}`} transform={`translate(${m.px(v.x)} ${m.py(v.y)})`} pointerEvents={hot ? undefined : 'none'}>
                  {b.vertexId === setupVertex && <circle r="17" fill="none" stroke="#fff6c9" strokeWidth="2.5" opacity="0.9" />}
                  {b.type === 'city' ? <CityShape color={colorOf[b.playerId]} scale={1.05} /> : <SettlementShape color={colorOf[b.playerId]} scale={1.1} />}
                </g>
              );
            })}

            {/* Legal city upgrades: a ring around your own settlement */}
            {spots.cities.map((id) => {
              const v = vertexById[id];
              const hot = hoverSpot === `c${id}`;
              return (
                <g
                  key={`lc${id}`}
                  transform={`translate(${m.px(v.x)} ${m.py(v.y)})`}
                  className="cursor-pointer"
                  onClick={() => onVertex(id)}
                  onPointerEnter={() => setHoverSpot(`c${id}`)}
                  onPointerLeave={() => setHoverSpot(null)}
                >
                  <circle r="20" fill="rgba(255,246,201,0.18)" stroke="#fff6c9" strokeWidth="3" strokeDasharray={hot ? undefined : '5 4'} className="catan-pulse" />
                  {hot && <g opacity="0.9"><CityShape color={myColor} scale={1.05} /></g>}
                </g>
              );
            })}

            {/* Legal settlement spots */}
            {spots.settlements.map((id) => {
              const v = vertexById[id];
              const hot = hoverSpot === `v${id}`;
              const c = playerColor(myColor);
              return (
                <g
                  key={`ls${id}`}
                  transform={`translate(${m.px(v.x)} ${m.py(v.y)})`}
                  className="cursor-pointer"
                  onClick={() => onVertex(id)}
                  onPointerEnter={() => setHoverSpot(`v${id}`)}
                  onPointerLeave={() => setHoverSpot(null)}
                >
                  <circle r="16" fill="transparent" />
                  {hot ? (
                    <g opacity="0.92"><SettlementShape color={myColor} scale={1.1} /></g>
                  ) : (
                    <circle r="8" fill="#fffbe8" fillOpacity="0.9" stroke={c.fill} strokeWidth="3" className="catan-pulse" />
                  )}
                </g>
              );
            })}

            {/* The robber */}
            {robber && (
              <g transform={`translate(${m.px(robber.x) + 30} ${m.py(robber.y) + 4})`} pointerEvents="none" className="transition-transform duration-300">
                <RobberShape scale={1.25} />
              </g>
            )}
          </svg>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-full border border-white/12 bg-felt-800/90 p-1 shadow-lift backdrop-blur-md">
        <button
          type="button"
          onClick={() => zoomStep(1 / 1.3)}
          title={t('game.zoomOut')}
          aria-label={t('game.zoomOut')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch"
        >
          <Icon.minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => { touchedRef.current = false; fit(); }}
          title={t('game.fitBoard')}
          className="flex min-w-[3.4rem] items-center justify-center rounded-full px-2 py-1 text-[12px] font-bold text-parch/80 transition-colors hover:bg-white/10 hover:text-parch tnum"
        >
          {zoomPct}%
        </button>
        <button
          type="button"
          onClick={() => zoomStep(1.3)}
          title={t('game.zoomIn')}
          aria-label={t('game.zoomIn')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch"
        >
          <Icon.plus className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => { touchedRef.current = false; fit(); }}
          title={t('game.fitBoard')}
          aria-label={t('game.fitBoard')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch"
        >
          <Icon.fit className="h-4 w-4" />
        </button>
      </div>

      {!isPanning && !mode && <HexCard hover={hover} board={board} state={state} t={t} />}
    </div>
  );
}
