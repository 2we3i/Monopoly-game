// ThroneMap.jsx
// The board of the Iron Throne: Westeros drawn as an old campaign map -
// parchment lands tinted by their lords, a cold sea, the Wall, and on every
// territory its name, fortification, garrison, control marker and army.
//
// The camera is the platform's existing pan/zoom hook (the one the Cosmic
// Encounter board uses): the wheel zooms smoothly around the cursor, a left
// drag anywhere pans (a small threshold keeps clicks and drags apart, so a
// drag never selects a territory), two fingers pinch. Nothing on the map is
// marked data-interactive, so the whole board can be grabbed.

import { memo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import Icon from '../../icons';
import usePanZoom from '../../cosmic/usePanZoom';
import { HOUSES, structureOf, throneHolder } from './engine';
import {
  BEYOND_PATH, ISLAND_PATHS, LAND_BORDERS, MAINLAND_PATH, MAP_H, MAP_W, SEA_BORDERS, SEAS, THRONE_SPOT,
  TERRITORIES, WALL_X, WALL_Y,
} from './westeros';
import {
  CrownGlyph, IronThroneShape, PortGlyph, SigilMark, StructureGlyph, SupplyGlyph, TerrainGlyph,
} from './throneArt';

const REGION_TONE = {
  north: '#c8c6b6', neck: '#b8b596', river: '#cbbd90', vale: '#c6c1aa', west: '#cfb382',
  crown: '#ccb994', storm: '#bdb196', reach: '#c7c38f', dorne: '#dbbf8c', islands: '#aeab9d',
};

export const TARGET_TONE = {
  move: '#8fc1dd', capture: '#e8c262', attack: '#e3624f', card: '#c9a0f2', site: '#8fd6a0',
};

const SERIF = 'Fraunces, Georgia, serif';

function ArmyToken({
  x, y, house, f, k,
}) {
  const h = HOUSES[house];
  const label = k ? `${f}·${k}` : `${f}`;
  const w = 22 + label.length * 9;
  return (
    <g filter="url(#tok-shadow)">
      <SigilMark house={house} x={x} y={y - 6} size={40} />
      <rect x={x - w / 2} y={y + 13} width={w} height={19} rx="4" fill={h.deep} stroke="#0c0b09" strokeWidth="2" />
      <text x={x} y={y + 27} textAnchor="middle" fontSize="14" fontWeight="800" fill="#f4ecdc" fontFamily="Inter, system-ui, sans-serif">
        {f}
        {k > 0 && <tspan fill="#e8c262">{`·${k}`}</tspan>}
      </text>
    </g>
  );
}

function GarrisonToken({ x, y, n }) {
  return (
    <g filter="url(#tok-shadow)">
      <path d={`M${x - 15} ${y - 20} H${x + 15} V${y - 2} Q${x + 15} ${y + 12} ${x} ${y + 18} Q${x - 15} ${y + 12} ${x - 15} ${y - 2} Z`} fill="#55524a" stroke="#0c0b09" strokeWidth="2.2" />
      <text x={x} y={y + 5} textAnchor="middle" fontSize="17" fontWeight="900" fill="#e9e1cc" fontFamily="Inter, system-ui, sans-serif">{n}</text>
    </g>
  );
}

const Territory = memo(({
  t, land, idx, selected, target, hovered, onClick, onHover,
}) => {
  const owner = land.owner ? HOUSES[land.owner] : null;
  const tone = TARGET_TONE[target];
  return (
    <g
      onClick={() => onClick(t.id)}
      onPointerEnter={() => onHover(t.id)}
      onPointerLeave={() => onHover(null)}
      className="cursor-pointer"
    >
      {t.paths.map((d, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <g key={i}>
          <path d={d} fill={REGION_TONE[t.region]} />
          {idx % 3 !== 1 && <path d={d} fill={idx % 3 ? '#ffffff' : '#000000'} opacity="0.06" />}
          <path d={d} fill="url(#parch-grain)" opacity="0.5" />
          {owner && <path d={d} fill={owner.color} opacity="0.46" style={{ mixBlendMode: 'multiply' }} />}
          {tone && <path d={d} fill={tone} opacity={hovered ? 0.34 : 0.2} />}
          {!tone && hovered && <path d={d} fill="#fff6d8" opacity="0.14" />}
        </g>
      ))}
    </g>
  );
});

function TerritoryEdge({ t, land, selected, target }) {
  const owner = land.owner ? HOUSES[land.owner] : null;
  if (!owner && !selected && !target) return null;
  return (
    <g clipPath={`url(#tc-${t.id})`} pointerEvents="none">
      {t.paths.map((d, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <g key={i}>
          {owner && <path d={d} fill="none" stroke={owner.color} strokeWidth="14" opacity="0.85" />}
          {target && <path d={d} fill="none" stroke={TARGET_TONE[target]} strokeWidth="12" strokeDasharray="18 10" className="throne-march" />}
          {selected && <path d={d} fill="none" stroke="#f3d27a" strokeWidth="16" />}
        </g>
      ))}
    </g>
  );
}

function TerritoryPieces({
  t, land, s, name,
}) {
  const [ax, ay] = t.anchor;
  const st = structureOf(s, t.id);
  const units = land.f + land.k;
  const tokenX = st ? ax + 22 : ax;
  const icons = [t.port && 'port', t.supply > 0 && 'supply', t.crown > 0 && 'crown'].filter(Boolean);
  return (
    <g pointerEvents="none">
      <text
        x={ax}
        y={ay - 36}
        textAnchor="middle"
        fontSize={name.length > 16 ? 16 : 19}
        fontWeight="700"
        fill="#24190d"
        stroke="#efe3c2"
        strokeWidth="4"
        paintOrder="stroke"
        letterSpacing="0.6"
        fontFamily={SERIF}
        style={{ fontVariant: 'small-caps' }}
      >
        {name}
      </text>
      {st && (
        <g transform={`translate(${ax - (units || land.garrison ? 26 : 0)} ${ay + 2}) scale(${st === 'fort' ? 0.9 : 1.05})`}>
          <StructureGlyph type={st} />
          {land.walls && <path d="M-24 22 H24" stroke="#e8c262" strokeWidth="4" strokeDasharray="5 3" />}
        </g>
      )}
      {!st && land.walls && <path d={`M${ax - 24} ${ay + 26} H${ax + 24}`} stroke="#e8c262" strokeWidth="4" strokeDasharray="5 3" />}
      {icons.map((icon, i) => (
        <g key={icon} transform={`translate(${ax - ((icons.length - 1) * 22) / 2 + i * 22} ${ay + 50}) scale(0.78)`}>
          <circle r="13" fill="#efe3c2" stroke="#3a2a18" strokeWidth="1.6" opacity="0.92" />
          {icon === 'port' && <PortGlyph />}
          {icon === 'supply' && <SupplyGlyph />}
          {icon === 'crown' && <CrownGlyph />}
        </g>
      ))}
      {units > 0 && land.owner && <ArmyToken x={tokenX} y={ay} house={land.owner} f={land.f} k={land.k} />}
      {!land.owner && land.garrison > 0 && <GarrisonToken x={st ? ax + 20 : ax} y={ay + 4} n={land.garrison} />}
      {land.marker && land.owner && (
        <g filter="url(#tok-shadow)">
          <SigilMark house={land.owner} x={units ? tokenX + 30 : ax + (st ? 22 : 0)} y={units ? ay - 14 : ay + 2} size={units ? 22 : 30} shape="round" />
        </g>
      )}
    </g>
  );
}

function Compass({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity="0.75" pointerEvents="none">
      <circle r="62" fill="none" stroke="#8d7f63" strokeWidth="2" />
      <circle r="48" fill="none" stroke="#8d7f63" strokeWidth="1" strokeDasharray="3 4" />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d="M0 -76 L10 -10 L0 0 L-10 -10 Z" fill={a === 0 ? '#b8a47a' : '#6f6450'} stroke="#1b140c" strokeWidth="1.2" transform={`rotate(${a})`} />
      ))}
      {[45, 135, 225, 315].map((a) => (
        <path key={a} d="M0 -46 L6 -6 L0 0 L-6 -6 Z" fill="#4c4536" transform={`rotate(${a})`} />
      ))}
      <text y="-84" textAnchor="middle" fontSize="20" fontWeight="700" fill="#b8a47a" fontFamily={SERIF}>N</text>
    </g>
  );
}

export default function ThroneMap({
  state: s, selected, targets, onLand, onSea, onThrone, children,
}) {
  const { t } = useTranslation();
  const cam = usePanZoom({ width: MAP_W, height: MAP_H, maxScale: 2.2, minFactor: 0.8 });
  const [hover, setHover] = useState(null);
  const king = throneHolder(s);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-black/60 bg-[#0b1115] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)]">
      <div
        ref={cam.viewportRef}
        {...cam.handlers}
        className={`no-drag absolute inset-0 overflow-hidden ${cam.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div ref={cam.stageRef} className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ width: MAP_W, height: MAP_H }}>
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W} height={MAP_H} className="block" role="img" aria-label={t('throne.westeros')}>
            <defs>
              <linearGradient id="sea-deep" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1c2b33" />
                <stop offset="100%" stopColor="#0e171c" />
              </linearGradient>
              <pattern id="sea-waves" width="46" height="26" patternUnits="userSpaceOnUse">
                <path d="M2 16 Q12 8 22 16 T42 16" fill="none" stroke="#6f8b99" strokeWidth="1.3" opacity="0.18" />
              </pattern>
              <pattern id="parch-grain" width="9" height="9" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="3" r="0.9" fill="#5b4a30" opacity="0.35" />
                <circle cx="7" cy="7" r="0.6" fill="#ffffff" opacity="0.4" />
              </pattern>
              <radialGradient id="map-vignette" cx="50%" cy="50%" r="72%">
                <stop offset="60%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
              </radialGradient>
              <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#eef3f6" />
                <stop offset="100%" stopColor="#9fb1bb" />
              </linearGradient>
              <filter id="tok-shadow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.55" />
              </filter>
              <clipPath id="clip-mainland"><path d={MAINLAND_PATH} /></clipPath>
              {TERRITORIES.map((tt) => (
                <clipPath key={tt.id} id={`tc-${tt.id}`}>
                  {tt.paths.map((d, i) => <path key={i} d={d} />)}
                </clipPath>
              ))}
            </defs>

            {/* The sea */}
            <rect width={MAP_W} height={MAP_H} fill="url(#sea-deep)" />
            {SEAS.map((sea, i) => (
              <g key={sea.id} onClick={() => onSea?.(sea.id)} onPointerEnter={() => setHover(sea.id)} onPointerLeave={() => setHover(null)}>
                {sea.paths.map((d, k) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <path key={k} d={d} fill={i % 2 ? '#20323b' : '#1a2a32'} opacity={hover === sea.id || selected === sea.id ? 1 : 0.7} />
                ))}
                {selected === sea.id && sea.paths.map((d, k) => <path key={`s${k}`} d={d} fill="#8fc1dd" opacity="0.12" />)}
              </g>
            ))}
            <rect width={MAP_W} height={MAP_H} fill="url(#sea-waves)" pointerEvents="none" />
            <g pointerEvents="none">
              {SEA_BORDERS.map(([p, q], i) => (
                // eslint-disable-next-line react/no-array-index-key
                <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#8aa6b3" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" opacity="0.45" />
              ))}
              {SEAS.map((sea) => (
                <text
                  key={sea.id}
                  x={sea.label[0]}
                  y={sea.label[1]}
                  transform={sea.rotate ? `rotate(${sea.rotate} ${sea.label[0]} ${sea.label[1]})` : undefined}
                  textAnchor="middle"
                  fontSize="21"
                  fontStyle="italic"
                  letterSpacing="3"
                  fill="#9fb8c4"
                  opacity="0.8"
                  fontFamily={SERIF}
                >
                  {t(`throne.sea.${sea.id}`)}
                </text>
              ))}
            </g>

            {/* Beyond the Wall */}
            <path d={BEYOND_PATH} fill="url(#ice)" opacity="0.9" pointerEvents="none" />
            <path d={BEYOND_PATH} fill="url(#parch-grain)" opacity="0.4" pointerEvents="none" />
            <text x={(WALL_X[0] + WALL_X[1]) / 2} y={150} textAnchor="middle" fontSize="30" letterSpacing="8" fill="#4f5d66" fontFamily={SERIF} fontStyle="italic" pointerEvents="none">
              {t('throne.beyondWall')}
            </text>

            {/* Land */}
            <path d={MAINLAND_PATH} fill="none" stroke="#0a0f12" strokeWidth="22" opacity="0.55" pointerEvents="none" />
            {Object.values(ISLAND_PATHS).map((d) => <path key={d} d={d} fill="none" stroke="#0a0f12" strokeWidth="18" opacity="0.55" pointerEvents="none" />)}
            <g clipPath="url(#clip-mainland)">
              {TERRITORIES.filter((tt) => !tt.island).map((tt, i) => (
                <Territory
                  key={tt.id}
                  t={tt}
                  idx={i}
                  land={s.lands[tt.id]}
                  selected={selected === tt.id}
                  target={targets.get(tt.id)}
                  hovered={hover === tt.id}
                  onClick={onLand}
                  onHover={setHover}
                />
              ))}
              <g pointerEvents="none">
                {LAND_BORDERS.map(([p, q], i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#3b2a17" strokeWidth="3.2" strokeLinecap="round" opacity="0.8" />
                ))}
              </g>
            </g>
            {TERRITORIES.filter((tt) => tt.island).map((tt, i) => (
              <Territory
                key={tt.id}
                t={tt}
                idx={i + 1}
                land={s.lands[tt.id]}
                selected={selected === tt.id}
                target={targets.get(tt.id)}
                hovered={hover === tt.id}
                onClick={onLand}
                onHover={setHover}
              />
            ))}
            {TERRITORIES.map((tt) => (
              <TerritoryEdge key={tt.id} t={tt} land={s.lands[tt.id]} selected={selected === tt.id} target={targets.get(tt.id)} />
            ))}
            <g pointerEvents="none">
              <path d={MAINLAND_PATH} fill="none" stroke="#2a1d10" strokeWidth="4" />
              <path d={MAINLAND_PATH} fill="none" stroke="#e4d6b0" strokeWidth="1.4" opacity="0.5" transform="translate(-3 -3)" />
              {Object.values(ISLAND_PATHS).map((d) => <path key={d} d={d} fill="none" stroke="#2a1d10" strokeWidth="4" />)}
              <path d={`M${WALL_X[0]} ${WALL_Y} H${WALL_X[1]}`} stroke="#0e1418" strokeWidth="20" strokeLinecap="round" />
              <path d={`M${WALL_X[0]} ${WALL_Y} H${WALL_X[1]}`} stroke="url(#ice)" strokeWidth="13" strokeLinecap="round" />
              <text x={(WALL_X[0] + WALL_X[1]) / 2} y={WALL_Y - 16} textAnchor="middle" fontSize="18" letterSpacing="10" fill="#22303a" fontFamily={SERIF} fontWeight="700">
                {t('throne.theWall').toUpperCase()}
              </text>
              {TERRITORIES.map((tt) => tt.decor.map((d, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <TerrainGlyph key={`${tt.id}-${i}`} type={d.type} x={d.x} y={d.y} />
              )))}
            </g>

            {TERRITORIES.map((tt) => (
              <TerritoryPieces key={tt.id} t={tt} land={s.lands[tt.id]} s={s} name={t(`throne.t.${tt.id}`)} />
            ))}

            {/* The Iron Throne */}
            <g transform={`translate(${THRONE_SPOT[0] - 95} ${THRONE_SPOT[1] - 120})`} onClick={onThrone} className="cursor-pointer">
              <rect x="-6" y="-14" width="202" height="286" rx="14" fill="#0d0f11" opacity="0.72" stroke={selected === 'throne' ? '#f3d27a' : '#6e5a2c'} strokeWidth={selected === 'throne' ? 5 : 2.5} />
              <IronThroneShape id="map-throne" />
              <text x="95" y="228" textAnchor="middle" fontSize="19" fontWeight="700" letterSpacing="1.5" fill="#e3bb5c" fontFamily={SERIF} style={{ fontVariant: 'small-caps' }}>
                {t('throne.ui.ironThrone')}
              </text>
              <text x="95" y="254" textAnchor="middle" fontSize="15" fill="#cfc4ae" fontFamily="Inter, system-ui, sans-serif">
                {king ? t(`throne.house.${king}`) : t('throne.ui.throneEmpty')}
              </text>
              {king && <SigilMark house={king} x={95} y={-14} size={44} />}
            </g>

            <Compass x={1450} y={150} />
            <g pointerEvents="none">
              <text x="1450" y="300" textAnchor="middle" fontSize="42" fontWeight="700" letterSpacing="10" fill="#b8a47a" opacity="0.7" fontFamily={SERIF} style={{ fontVariant: 'small-caps' }}>
                {t('throne.westeros')}
              </text>
              <rect width={MAP_W} height={MAP_H} fill="url(#map-vignette)" />
              <rect x="10" y="10" width={MAP_W - 20} height={MAP_H - 20} fill="none" stroke="#6e5a2c" strokeWidth="6" />
              <rect x="24" y="24" width={MAP_W - 48} height={MAP_H - 48} fill="none" stroke="#3b3120" strokeWidth="2" />
              {[[24, 24], [MAP_W - 24, 24], [24, MAP_H - 24], [MAP_W - 24, MAP_H - 24]].map(([x, y]) => (
                <path key={`${x}-${y}`} d={`M${x - 16} ${y} L${x} ${y - 16} L${x + 16} ${y} L${x} ${y + 16} Z`} fill="#6e5a2c" stroke="#1b140c" strokeWidth="2" />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {children}

      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-full border border-[#6e5a2c]/60 bg-[#12100d]/90 p-1 shadow-lift backdrop-blur-md">
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
      <p className="pointer-events-none absolute bottom-3 left-3 z-20 hidden rounded-full bg-black/55 px-3 py-1 text-[11px] text-parch/60 md:block">{t('throne.ui.cameraHint')}</p>
    </div>
  );
}
