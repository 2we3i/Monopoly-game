// CosmicBoard.jsx
// The table in space: the warp in the middle (with the colony track and
// everyone's lost ships), each player's home system around it, ship
// stacks on the planets, and the hyperspace gate aimed at the target with
// the offense on it and the defense's allies beside the planet.
//
// Ships that change place between two states fly there, so a launch, a
// colonization or a trip to the warp is visible as movement, not a jump.

import {
  memo, useEffect, useMemo, useRef, useState,
} from 'react';
import Icon from '../icons';
import usePanZoom from './usePanZoom';
import { AlienPortrait, ShipGlyph, cosmicColor } from './cosmicArt';

const W = 1600;
const H = 1200;
const CX = W / 2;
const CY = H / 2;
const WARP_R = 150;
const PLANET_R = 34;

// --- layout ---------------------------------------------------------------

function systemAngle(index, count) {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

function useLayout(state) {
  return useMemo(() => {
    const seats = state.order?.length ? state.order : state.players.map((p) => p.id);
    const systems = {};
    const planets = {};
    seats.forEach((playerId, i) => {
      const a = systemAngle(i, seats.length);
      const sx = CX + Math.cos(a) * 590;
      const sy = CY + Math.sin(a) * 445;
      // Planets sit on an arc facing the warp.
      const tx = -Math.sin(a);
      const ty = Math.cos(a);
      const own = state.planets.filter((pl) => pl.ownerId === playerId).sort((x, y) => x.index - y.index);
      own.forEach((pl, k) => {
        const off = (k - 2) * 96;
        const bow = Math.abs(k - 2) * 22;
        planets[pl.id] = {
          x: sx + tx * off - Math.cos(a) * bow,
          y: sy + ty * off - Math.sin(a) * bow,
        };
      });
      systems[playerId] = {
        x: sx, y: sy, angle: a, labelX: CX + Math.cos(a) * 735, labelY: CY + Math.sin(a) * 560,
      };
    });
    return { systems, planets };
  }, [state.order, state.players, state.planets]);
}

function gatePosition(state, layout) {
  const target = state.encounter?.targetPlanetId && layout.planets[state.encounter.targetPlanetId];
  if (!target) return { x: CX, y: CY - WARP_R - 46, idle: true };
  return {
    x: CX + (target.x - CX) * 0.52,
    y: CY + (target.y - CY) * 0.52,
    idle: false,
  };
}

// Where one player's stack is drawn at a location.
function stackOffset(i, total, radius) {
  if (total <= 1) return { dx: 0, dy: radius };
  const a = Math.PI / 2 + ((i - (total - 1) / 2) * Math.PI) / 3.2;
  return { dx: Math.cos(a) * radius, dy: Math.sin(a) * radius };
}

function locationPoint(loc, playerId, state, layout, gate) {
  if (loc === 'warp') {
    const idx = Math.max(0, state.players.findIndex((p) => p.id === playerId));
    const a = systemAngle(idx, state.players.length) + Math.PI / 5;
    return { x: CX + Math.cos(a) * 70, y: CY + Math.sin(a) * 70 };
  }
  if (loc === 'gate') return { x: gate.x, y: gate.y };
  if (loc === 'defense') {
    const pt = layout.planets[state.encounter?.targetPlanetId];
    if (!pt) return { x: CX, y: CY };
    const len = Math.hypot(pt.x - CX, pt.y - CY) || 1;
    return { x: pt.x + ((pt.x - CX) / len) * 78, y: pt.y + ((pt.y - CY) / len) * 78 };
  }
  const pt = layout.planets[loc.slice(7)];
  return pt || { x: CX, y: CY };
}

function locationCounts(state) {
  const out = {};
  const add = (playerId, loc, n) => {
    if (!n) return;
    out[playerId] = out[playerId] || {};
    out[playerId][loc] = (out[playerId][loc] || 0) + n;
  };
  state.planets.forEach((pl) => Object.entries(pl.ships).forEach(([id, n]) => add(id, `planet:${pl.id}`, n)));
  Object.entries(state.warp || {}).forEach(([id, n]) => add(id, 'warp', n));
  Object.entries(state.encounter?.gate || {}).forEach(([id, n]) => add(id, 'gate', n));
  Object.entries(state.encounter?.defense || {}).forEach(([id, n]) => add(id, 'defense', n));
  return out;
}

// --- flying ships ------------------------------------------------------------

function useFlights(state, layout, enabled) {
  const prevRef = useRef(null);
  const [flights, setFlights] = useState([]);
  const colorOf = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p.color])), [state.players]);

  useEffect(() => {
    const gate = gatePosition(state, layout);
    const counts = locationCounts(state);
    const prev = prevRef.current;
    prevRef.current = { counts, gate, state, layout };
    if (!prev || !enabled) return undefined;
    const made = [];
    Object.keys({ ...counts, ...prev.counts }).forEach((playerId) => {
      const before = prev.counts[playerId] || {};
      const after = counts[playerId] || {};
      const sources = [];
      const targets = [];
      new Set([...Object.keys(before), ...Object.keys(after)]).forEach((loc) => {
        const d = (after[loc] || 0) - (before[loc] || 0);
        if (d < 0) sources.push({ loc, n: -d });
        if (d > 0) targets.push({ loc, n: d });
      });
      while (sources.length && targets.length) {
        const s = sources[0];
        const tg = targets[0];
        const n = Math.min(s.n, tg.n);
        made.push({
          id: `${Date.now()}-${playerId}-${made.length}`,
          color: colorOf[playerId],
          n,
          from: locationPoint(s.loc, playerId, prev.state, prev.layout, prev.gate),
          to: locationPoint(tg.loc, playerId, state, layout, gate),
        });
        s.n -= n;
        tg.n -= n;
        if (!s.n) sources.shift();
        if (!tg.n) targets.shift();
      }
    });
    if (!made.length) return undefined;
    setFlights((cur) => [...cur, ...made]);
    const ids = new Set(made.map((f) => f.id));
    const timer = setTimeout(() => setFlights((cur) => cur.filter((f) => !ids.has(f.id))), 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return flights;
}

function Flight({ flight }) {
  const ref = useRef(null);
  useEffect(() => {
    const start = performance.now();
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - start) / 750);
      const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
      const x = flight.from.x + (flight.to.x - flight.from.x) * e;
      const y = flight.from.y + (flight.to.y - flight.from.y) * e - Math.sin(Math.PI * e) * 40;
      if (ref.current) ref.current.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flight]);
  return (
    <g ref={ref} transform={`translate(${flight.from.x} ${flight.from.y})`} pointerEvents="none">
      <circle r="16" fill={cosmicColor(flight.color).glow} opacity="0.25" />
      <ShipGlyph color={flight.color} size={22} count={flight.n > 1 ? flight.n : null} />
    </g>
  );
}

// --- static backdrop -------------------------------------------------------------

const Backdrop = memo(function Backdrop() {
  const stars = useMemo(() => Array.from({ length: 140 }, (_, i) => ({
    x: (i * 733) % W, y: (i * 389 + 97) % H, r: (i % 5) * 0.35 + 0.5, o: ((i * 37) % 70) / 100 + 0.2,
  })), []);
  return (
    <g>
      <defs>
        <radialGradient id="cosmic-space" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#1b1545" />
          <stop offset="60%" stopColor="#0b0a22" />
          <stop offset="100%" stopColor="#040410" />
        </radialGradient>
        <radialGradient id="cosmic-warp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff4c8" />
          <stop offset="18%" stopColor="#d6b4ff" />
          <stop offset="55%" stopColor="#5b2fb8" />
          <stop offset="100%" stopColor="#140a3a" />
        </radialGradient>
        <linearGradient id="cosmic-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff2a8" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#fff2a8" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="40" fill="url(#cosmic-space)" />
      {stars.map((s) => <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}
      <circle cx={CX} cy={CY} r={WARP_R + 30} fill="#6b3fd0" opacity="0.12" />
      <circle cx={CX} cy={CY} r={WARP_R} fill="url(#cosmic-warp)" />
      {[0.9, 0.7, 0.5, 0.3].map((k, i) => (
        <circle
          key={k}
          cx={CX}
          cy={CY}
          r={WARP_R * k}
          fill="none"
          stroke="#f1e6ff"
          strokeOpacity={0.12 + i * 0.05}
          strokeWidth="2"
          strokeDasharray={`${14 - i * 3} ${10 + i * 2}`}
          className="cosmic-spin"
          style={{ transformOrigin: `${CX}px ${CY}px`, animationDuration: `${40 - i * 8}s` }}
        />
      ))}
    </g>
  );
});

// --- the board -------------------------------------------------------------------

export default function CosmicBoard({
  state, t, clickablePlanets = [], selection = {}, stackClickable = false, onPlanet, onStack, animate = true,
}) {
  const layout = useLayout(state);
  const cam = usePanZoom({ width: W, height: H });
  const flights = useFlights(state, layout, animate);
  const enc = state.encounter;
  const gate = gatePosition(state, layout);
  const target = enc?.targetPlanetId ? layout.planets[enc.targetPlanetId] : null;
  const playerById = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p])), [state.players]);
  const youId = state.you?.id;
  const clickable = new Set(clickablePlanets);
  const [hover, setHover] = useState(null);

  // Hide a stack's arrival until its flight lands, so a ship is never in two places.
  const flyingInto = useMemo(() => {
    const set = new Set();
    flights.forEach((f) => set.add(`${Math.round(f.to.x)},${Math.round(f.to.y)}`));
    return set;
  }, [flights]);

  const trackPlayers = state.players;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#05050f] shadow-[inset_0_2px_30px_rgba(0,0,0,0.7)]">
      <div
        ref={cam.viewportRef}
        {...cam.handlers}
        onPointerLeave={() => setHover(null)}
        className={`no-drag absolute inset-0 overflow-hidden ${cam.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div ref={cam.stageRef} className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ width: W, height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block select-none" aria-label={t('cosmic.boardLabel')}>
            <Backdrop />

            {/* Colony track around the warp: one marker per player. */}
            {Array.from({ length: 6 }).map((_, n) => {
              const a = Math.PI + (n / 5) * Math.PI;
              const x = CX + Math.cos(a) * (WARP_R + 34);
              const y = CY + Math.sin(a) * (WARP_R + 34);
              return (
                <g key={`track${n}`}>
                  <circle cx={x} cy={y} r="17" fill="#0b0a22" stroke={n === 5 ? '#ffe27a' : '#8c7bd6'} strokeWidth={n === 5 ? 3 : 1.5} />
                  <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="900" fill={n === 5 ? '#ffe27a' : '#cfc4ff'} fontFamily="Inter, system-ui, sans-serif">{n}</text>
                </g>
              );
            })}
            {trackPlayers.map((p, i) => {
              const n = Math.min(5, p.foreignColonies);
              const a = Math.PI + (n / 5) * Math.PI;
              const same = trackPlayers.filter((q) => Math.min(5, q.foreignColonies) === n);
              const k = same.findIndex((q) => q.id === p.id);
              const r = WARP_R + 64 + k * 20;
              return (
                <g key={`marker${p.id}`} transform={`translate(${CX + Math.cos(a) * r} ${CY + Math.sin(a) * r})`} className="transition-transform duration-700">
                  <title>{`${p.nickname}: ${p.foreignColonies}/5`}</title>
                  <circle r="9" fill={cosmicColor(p.color).fill} stroke="#fff" strokeWidth="2" />
                  {i === -1 && null}
                </g>
              );
            })}
            <text x={CX} y={CY - WARP_R - 92} textAnchor="middle" fontSize="15" fontWeight="800" fill="#cfc4ff" opacity="0.85" fontFamily="Inter, system-ui, sans-serif">
              {t('cosmic.colonyTrack')}
            </text>

            {/* Ships in the warp, one stack per player. */}
            <text x={CX} y={CY - 96} textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" opacity="0.9" fontFamily="Fraunces, Georgia, serif">{t('cosmic.warp')}</text>
            {state.players.map((p) => {
              const n = state.warp?.[p.id] || 0;
              if (!n) return null;
              const pt = locationPoint('warp', p.id, state, layout, gate);
              return (
                <g key={`warp${p.id}`}>
                  <title>{t('cosmic.inWarp', { name: p.nickname, n })}</title>
                  <ShipGlyph color={p.color} x={pt.x} y={pt.y} size={26} count={n} />
                </g>
              );
            })}

            {/* The hyperspace gate and its beam to the target. */}
            {target && (
              <polygon
                points={`${gate.x - 18},${gate.y} ${gate.x + 18},${gate.y} ${target.x},${target.y}`}
                fill="url(#cosmic-beam)"
                transform={`rotate(${(Math.atan2(target.y - gate.y, target.x - gate.x) * 180) / Math.PI - 90} ${gate.x} ${gate.y})`}
                opacity="0.9"
                style={{ transformBox: 'view-box' }}
              />
            )}
            {target && <line x1={gate.x} y1={gate.y} x2={target.x} y2={target.y} stroke="#fff2a8" strokeWidth="3" strokeDasharray="10 8" className="cosmic-dash" />}
            <g transform={`translate(${gate.x} ${gate.y})`} opacity={gate.idle ? 0.45 : 1}>
              <title>{t('cosmic.gate')}</title>
              <ellipse rx="44" ry="18" fill="#140a3a" stroke="#fff2a8" strokeWidth="3" />
              <ellipse rx="32" ry="11" fill="none" stroke="#b48bff" strokeWidth="2" strokeDasharray="6 5" className="cosmic-dash" />
              {gate.idle && <text y="36" textAnchor="middle" fontSize="12" fill="#cfc4ff" fontFamily="Inter, system-ui, sans-serif">{t('cosmic.gate')}</text>}
            </g>
            {Object.entries(enc?.gate || {}).map(([id, n], i, arr) => {
              const off = stackOffset(i, arr.length, arr.length > 1 ? 34 : 0);
              const pt = { x: gate.x + off.dx, y: gate.y - 6 + (arr.length > 1 ? off.dy - 20 : 0) };
              if (flyingInto.has(`${Math.round(gate.x)},${Math.round(gate.y)}`)) return null;
              return (
                <g key={`gate${id}`}>
                  <title>{`${playerById[id]?.nickname}: ${n}`}</title>
                  <ShipGlyph color={playerById[id]?.color} x={pt.x} y={pt.y} size={26} count={n} />
                </g>
              );
            })}
            {target && Object.entries(enc?.defense || {}).map(([id, n], i, arr) => {
              const base = locationPoint('defense', id, state, layout, gate);
              const off = stackOffset(i, arr.length, arr.length > 1 ? 30 : 0);
              if (flyingInto.has(`${Math.round(base.x)},${Math.round(base.y)}`)) return null;
              return (
                <g key={`def${id}`}>
                  <title>{`${playerById[id]?.nickname}: ${n}`}</title>
                  <circle cx={base.x + off.dx} cy={base.y + (arr.length > 1 ? off.dy - 15 : 0)} r="22" fill="#e2463a" opacity="0.12" />
                  <ShipGlyph color={playerById[id]?.color} x={base.x + off.dx} y={base.y + (arr.length > 1 ? off.dy - 15 : 0)} size={24} count={n} />
                </g>
              );
            })}

            {/* Systems: label, alien portrait marker, planets and colonies. */}
            {Object.entries(layout.systems).map(([playerId, sys]) => {
              const p = playerById[playerId];
              if (!p) return null;
              const c = cosmicColor(p.color);
              const role = enc && enc.aggressorId === playerId ? 'offense' : enc && enc.defenderId === playerId ? 'defense' : null;
              return (
                <g key={`sys${playerId}`}>
                  <g transform={`translate(${sys.labelX} ${sys.labelY})`}>
                    <rect
                      x="-112"
                      y="-24"
                      width="224"
                      height="48"
                      rx="24"
                      fill="#0b0a22"
                      stroke={role === 'offense' ? '#ffe27a' : role === 'defense' ? '#ff7a6b' : c.fill}
                      strokeWidth={role ? 4 : 2}
                      opacity="0.92"
                    />
                    <circle cx="-86" cy="0" r="14" fill={c.fill} stroke="#fff" strokeWidth="2" />
                    <text x="-64" y="-3" fontSize="16" fontWeight="800" fill="#fff" fontFamily="Inter, system-ui, sans-serif">
                      {p.nickname.length > 14 ? `${p.nickname.slice(0, 13)}…` : p.nickname}
                      {p.id === youId ? ` (${t('waiting.you')})` : ''}
                    </text>
                    <text x="-64" y="15" fontSize="12.5" fill={c.text} fontFamily="Inter, system-ui, sans-serif">
                      {p.alienId ? t(`cosmic.alien.${p.alienId}.name`) : t('cosmic.alienHidden')}
                      {role ? ` · ${t(`cosmic.role.${role}`)}` : enc?.allies?.[playerId] ? ` · ${t(`cosmic.role.ally.${enc.allies[playerId]}`)}` : ''}
                    </text>
                  </g>
                  {state.planets.filter((pl) => pl.ownerId === playerId).map((pl) => {
                    const pt = layout.planets[pl.id];
                    const isTarget = enc?.targetPlanetId === pl.id;
                    const canClick = clickable.has(pl.id);
                    const mineHome = pl.ownerId === youId;
                    const stacks = Object.entries(pl.ships).sort((x, y) => (x[0] === pl.ownerId ? -1 : y[0] === pl.ownerId ? 1 : 0));
                    return (
                      <g key={pl.id}>
                        {isTarget && <circle cx={pt.x} cy={pt.y} r={PLANET_R + 18} fill="none" stroke="#ffe27a" strokeWidth="4" className="catan-pulse" />}
                        {canClick && <circle cx={pt.x} cy={pt.y} r={PLANET_R + 12} fill="none" stroke="#9ef0ff" strokeWidth="3" strokeDasharray="7 5" className="cosmic-dash" />}
                        <g
                          data-interactive={canClick ? 'true' : undefined}
                          className={canClick ? 'cursor-pointer' : ''}
                          onClick={canClick ? () => onPlanet?.(pl.id) : undefined}
                          onPointerEnter={() => setHover(pl.id)}
                          onPointerLeave={() => setHover((h) => (h === pl.id ? null : h))}
                        >
                          <circle cx={pt.x} cy={pt.y} r={PLANET_R + 6} fill={c.fill} opacity={hover === pl.id || canClick ? 0.3 : 0.12} />
                          <circle cx={pt.x} cy={pt.y} r={PLANET_R} fill={c.deep} stroke={mineHome ? '#ffffff' : c.fill} strokeWidth={mineHome ? 3.5 : 2} />
                          <circle cx={pt.x - 9} cy={pt.y - 10} r={PLANET_R * 0.55} fill={c.fill} opacity="0.55" />
                          <ellipse cx={pt.x} cy={pt.y + 4} rx={PLANET_R + 12} ry="7" fill="none" stroke={c.glow} strokeOpacity="0.45" strokeWidth="2" />
                          <text x={pt.x} y={pt.y + 6} textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" fontFamily="Inter, system-ui, sans-serif">{pl.index + 1}</text>
                          {mineHome && <text x={pt.x} y={pt.y - PLANET_R - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" opacity="0.8" fontFamily="Inter, system-ui, sans-serif">{t('cosmic.homeShort')}</text>}
                        </g>
                        {stacks.map(([id, n], i) => {
                          const off = stackOffset(i, stacks.length, PLANET_R + 18);
                          const x = pt.x + off.dx;
                          const y = pt.y + off.dy;
                          const selected = id === youId ? selection[pl.id] || 0 : 0;
                          const canStack = stackClickable && id === youId && n - selected > 0;
                          const foreign = id !== pl.ownerId;
                          return (
                            <g
                              key={`${pl.id}-${id}`}
                              data-interactive={canStack ? 'true' : undefined}
                              className={canStack ? 'cursor-pointer' : ''}
                              onClick={canStack ? (e) => { e.stopPropagation(); onStack?.(pl.id); } : undefined}
                            >
                              <title>{`${playerById[id]?.nickname}: ${n}${foreign ? ` · ${t('cosmic.foreignColony')}` : ''}`}</title>
                              {canStack && <circle cx={x} cy={y} r="17" fill="#9ef0ff" opacity="0.22" />}
                              {foreign && <circle cx={x} cy={y} r="15" fill="none" stroke={cosmicColor(playerById[id]?.color).glow} strokeWidth="1.5" strokeDasharray="3 3" />}
                              <ShipGlyph color={playerById[id]?.color} x={x} y={y} size={20} count={n - selected} dim={selected > 0 && n - selected === 0} />
                              {selected > 0 && (
                                <g transform={`translate(${x - 14} ${y - 14})`}>
                                  <circle r="9" fill="#ffe27a" stroke="#0b0a22" strokeWidth="1.5" />
                                  <text y="4" textAnchor="middle" fontSize="11" fontWeight="900" fill="#0b0a22" fontFamily="Inter, system-ui, sans-serif">{`−${selected}`}</text>
                                </g>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                  {p.alienId && (
                    <foreignObject x={sys.labelX + 116} y={sys.labelY - 22} width="44" height="44">
                      <AlienPortrait id={p.alienId} className="h-11 w-11" rounded="rounded-full" />
                    </foreignObject>
                  )}
                </g>
              );
            })}

            {flights.map((f) => <Flight key={f.id} flight={f} />)}
          </svg>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-full border border-white/12 bg-[#0b0a22]/90 p-1 shadow-lift backdrop-blur-md">
        <button type="button" onClick={() => cam.zoomStep(1 / 1.3)} title={t('game.zoomOut')} aria-label={t('game.zoomOut')} className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch">
          <Icon.minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={cam.resetView} title={t('game.fitBoard')} className="flex min-w-[3.4rem] items-center justify-center rounded-full px-2 py-1 text-[12px] font-bold text-parch/80 transition-colors hover:bg-white/10 hover:text-parch tnum">
          {cam.zoomPct}%
        </button>
        <button type="button" onClick={() => cam.zoomStep(1.3)} title={t('game.zoomIn')} aria-label={t('game.zoomIn')} className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch">
          <Icon.plus className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        <button type="button" onClick={cam.resetView} title={t('game.fitBoard')} aria-label={t('game.fitBoard')} className="flex h-8 w-8 items-center justify-center rounded-full text-parch/70 transition-colors hover:bg-white/10 hover:text-parch">
          <Icon.fit className="h-4 w-4" />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-black/40 px-3 py-1 text-[11px] text-parch/50 md:block">{t('cosmic.cameraHint')}</p>
    </div>
  );
}
