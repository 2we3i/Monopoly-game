// Dice.jsx
import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { useSettings } from '../settings/SettingsContext';

const PIP_LAYOUTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, rolling, size = 56 }) {
  const pips = PIP_LAYOUTS[value] || [];
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 rounded-[14px] ${rolling ? 'animate-tumble' : ''}`}
      style={{
        width: size,
        height: size,
        padding: size * 0.16,
        gap: size * 0.04,
        background: 'linear-gradient(160deg, #ffffff 0%, #f3ecdc 55%, #e2d6bd 100%)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 -2px 4px rgba(31,36,23,0.18) inset, 0 6px 14px -6px rgba(0,0,0,0.6)',
        border: '1px solid rgba(31,36,23,0.18)',
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className="m-auto rounded-full"
          style={{
            width: size * 0.155,
            height: size * 0.155,
            background: pips.includes(i) ? 'radial-gradient(circle at 35% 30%, #4a4f3d, #1f2417)' : 'transparent',
            boxShadow: pips.includes(i) ? '0 1px 1px rgba(255,255,255,0.5)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

export default function Dice({ lastRoll, size = 56, showTotal = true }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [rolling, setRolling] = useState(false);
  const [displayRoll, setDisplayRoll] = useState(lastRoll);

  useEffect(() => {
    if (!lastRoll) return undefined;
    if (!settings.animations) {
      setDisplayRoll(lastRoll);
      setRolling(false);
      return undefined;
    }
    setRolling(true);
    const timeoutId = setTimeout(() => {
      setDisplayRoll(lastRoll);
      setRolling(false);
    }, 420);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRoll?.d1, lastRoll?.d2, lastRoll?.playerId, settings.animations]);

  const roll = displayRoll;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center" style={{ gap: size * 0.18 }}>
        <Die value={roll?.d1 ?? 1} rolling={rolling} size={size} />
        <Die value={roll?.d2 ?? 1} rolling={rolling} size={size} />
      </div>
      {showTotal && roll && !rolling && (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ink/[0.08] px-2.5 py-0.5 text-[12px] font-bold text-ink-soft tnum">
            {roll.d1 + roll.d2}
          </span>
          {roll.isDouble && (
            <span className="animate-pop-in rounded-full bg-brass px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-ink">
              {t('game.doubles')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
