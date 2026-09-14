// effects.jsx
// Short celebratory (or consoling) effects: confetti, fireworks, a coin
// shower, rain, a spotlight... Each is a few dozen absolutely positioned
// spans animated with transform/opacity only, removed when it finishes.
//
// playEffect() shows one full-screen; <EffectStage> plays one inside a
// box, for previews in the shop.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { useSettings } from '../settings/SettingsContext';

const DURATION_MS = 2800;
const listeners = new Set();
let seq = 0;

export function playEffect(visual) {
  if (!visual?.kind) return;
  seq += 1;
  const event = { id: seq, visual };
  listeners.forEach((fn) => fn(event));
}

// Deterministic pseudo-random numbers, so a particle keeps its path
// across re-renders of the same effect.
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function Particles({ visual, seed, contained }) {
  const { t } = useTranslation();
  const colors = visual.colors?.length ? visual.colors : ['#e3bb5c'];
  const fall = contained ? '118cqh' : '112vh';
  const nodes = useMemo(() => {
    const rand = rng(seed * 9973 + 17);
    const pick = (i) => colors[i % colors.length];
    const out = [];
    switch (visual.kind) {
      case 'confetti':
        for (let i = 0; i < (contained ? 26 : 60); i += 1) {
          out.push(
            <span
              key={i}
              className="fx-fall absolute top-0"
              style={{
                left: `${rand() * 100}%`,
                width: `${5 + rand() * 5}px`,
                height: `${8 + rand() * 8}px`,
                background: pick(i),
                borderRadius: '1px',
                '--fall': fall,
                '--drift': `${(rand() - 0.5) * 120}px`,
                '--rot': `${360 + rand() * 720}deg`,
                animationDuration: `${1.8 + rand() * 1}s`,
                animationDelay: `${rand() * 0.5}s`,
              }}
            />,
          );
        }
        break;
      case 'coins':
        for (let i = 0; i < (contained ? 18 : 40); i += 1) {
          const size = 10 + rand() * 12;
          out.push(
            <span
              key={i}
              className="fx-fall absolute top-0 rounded-full"
              style={{
                left: `${rand() * 100}%`,
                width: size,
                height: size,
                background: `radial-gradient(circle at 35% 30%, #fff6d5, ${pick(i)} 45%, #96701c)`,
                boxShadow: '0 0 6px rgba(227,187,92,0.6)',
                '--fall': fall,
                '--drift': `${(rand() - 0.5) * 60}px`,
                '--rot': `${rand() * 360}deg`,
                animationDuration: `${1.5 + rand() * 1}s`,
                animationDelay: `${rand() * 0.6}s`,
              }}
            />,
          );
        }
        break;
      case 'rain':
        for (let i = 0; i < (contained ? 26 : 70); i += 1) {
          out.push(
            <span
              key={i}
              className="fx-fall absolute top-0"
              style={{
                left: `${rand() * 100}%`,
                width: '1.5px',
                height: `${14 + rand() * 16}px`,
                background: `linear-gradient(${pick(i)}00, ${pick(i)})`,
                opacity: 0.55,
                '--fall': fall,
                '--drift': '-18px',
                '--rot': '0deg',
                animationDuration: `${0.9 + rand() * 0.6}s`,
                animationDelay: `${rand() * 1.4}s`,
              }}
            />,
          );
        }
        break;
      case 'ash':
        for (let i = 0; i < (contained ? 20 : 44); i += 1) {
          const size = 2 + rand() * 4;
          out.push(
            <span
              key={i}
              className="fx-drift absolute top-0 rounded-full"
              style={{
                left: `${rand() * 100}%`,
                width: size,
                height: size,
                background: pick(i),
                '--fall': fall,
                '--drift': `${(rand() - 0.5) * 140}px`,
                animationDuration: `${2.2 + rand() * 0.6}s`,
                animationDelay: `${rand() * 0.8}s`,
              }}
            />,
          );
        }
        break;
      case 'fireworks':
        for (let b = 0; b < 3; b += 1) {
          const cx = 20 + rand() * 60;
          const cy = 20 + rand() * 40;
          for (let i = 0; i < 14; i += 1) {
            const angle = (i / 14) * Math.PI * 2;
            const dist = contained ? 50 + rand() * 30 : 110 + rand() * 60;
            out.push(
              <span
                key={`${b}-${i}`}
                className="fx-burst absolute h-1.5 w-1.5 rounded-full"
                style={{
                  left: `${cx}%`,
                  top: `${cy}%`,
                  background: pick(b + i),
                  boxShadow: `0 0 8px ${pick(b + i)}`,
                  '--bx': `${Math.cos(angle) * dist}px`,
                  '--by': `${Math.sin(angle) * dist}px`,
                  animationDelay: `${b * 0.45}s`,
                }}
              />,
            );
          }
        }
        break;
      case 'shockwave':
        out.push(<span key="flash" className="fx-flash absolute inset-0" style={{ background: `radial-gradient(circle, ${colors[0]}66, transparent 60%)` }} />);
        for (let i = 0; i < 3; i += 1) {
          out.push(
            <span
              key={i}
              className="fx-ring absolute left-1/2 top-1/2 h-32 w-32 rounded-full"
              style={{ boxShadow: `0 0 0 3px ${pick(i)}, 0 0 30px ${pick(i)}`, animationDelay: `${i * 0.28}s`, '--s': contained ? 3 : 9 }}
            />,
          );
        }
        break;
      case 'spotlight':
        out.push(
          <span
            key="spot"
            className="fx-fade-inout absolute inset-0"
            style={{ background: `radial-gradient(ellipse 30% 55% at 50% 45%, ${colors[0]}55, transparent 70%), linear-gradient(180deg, ${colors[0]}22, transparent 60%)` }}
          />,
        );
        break;
      case 'sparkle':
        for (let i = 0; i < 16; i += 1) {
          out.push(
            <span
              key={i}
              className="fx-twinkle absolute text-[18px]"
              style={{
                left: `${25 + rand() * 50}%`, top: `${25 + rand() * 50}%`, color: pick(i), animationDelay: `${rand() * 1.2}s`,
              }}
            >
              ✦
            </span>,
          );
        }
        break;
      case 'portal':
        out.push(
          <span
            key="portal"
            className="fx-portal absolute left-1/2 top-1/2 h-40 w-40 rounded-full"
            style={{ background: `conic-gradient(${colors.join(', ')}, ${colors[0]})`, filter: 'blur(2px)' }}
          />,
        );
        break;
      case 'lightning':
        out.push(<span key="flash" className="fx-flash absolute inset-0" style={{ background: `${colors[0]}55` }} />);
        out.push(
          <svg key="bolt" viewBox="0 0 60 120" className="fx-flash absolute left-1/2 top-[8%] h-[70%] -translate-x-1/2" style={{ filter: `drop-shadow(0 0 10px ${colors[1] || colors[0]})` }}>
            <path d="M34 0L8 66h20L18 120l34-74H32z" fill={colors[0]} />
          </svg>,
        );
        break;
      case 'rise':
        out.push(
          <span key="rise" className="fx-rise absolute left-1/2 top-1/2 text-[64px] font-black" style={{ color: colors[0], textShadow: `0 0 18px ${colors[0]}` }}>
            ▲
          </span>,
        );
        break;
      case 'banner':
        out.push(
          <span
            key="banner"
            className="fx-banner absolute left-1/2 top-1/2 whitespace-nowrap rounded-2xl border px-6 py-3 font-display text-[28px] font-black"
            style={{ color: colors[0], borderColor: `${colors[0]}66`, background: 'rgba(10,11,13,0.85)' }}
          >
            {t('effects.goodGame')}
          </span>,
        );
        break;
      default:
        break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual, seed, contained]);
  return nodes;
}

export function EffectHost() {
  const { settings } = useSettings();
  const [active, setActive] = useState([]);
  useEffect(() => {
    const onEffect = (event) => {
      if (!settings.animations) return;
      setActive((list) => [...list.slice(-2), event]);
      setTimeout(() => setActive((list) => list.filter((e) => e.id !== event.id)), DURATION_MS + 900);
    };
    listeners.add(onEffect);
    return () => listeners.delete(onEffect);
  }, [settings.animations]);
  if (!active.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden" aria-hidden="true">
      {active.map((e) => <Particles key={e.id} visual={e.visual} seed={e.id} />)}
    </div>
  );
}

// An effect inside a box. Changing `playKey` replays it.
export function EffectStage({
  visual, playKey = 0, className = '', children,
}) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ containerType: 'size' }}>
      {children}
      {visual && (
        <div key={playKey} className="pointer-events-none absolute inset-0" aria-hidden="true">
          <Particles visual={visual} seed={playKey + 1} contained />
        </div>
      )}
    </div>
  );
}
