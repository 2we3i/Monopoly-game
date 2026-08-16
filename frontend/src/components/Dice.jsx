// Dice.jsx
// Renders two dice with a tumble animation that plays whenever a new roll
// arrives. Pip layout is drawn with a simple 3x3 grid so no image assets
// are needed.

import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

const PIP_LAYOUTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, rolling }) {
  const pips = PIP_LAYOUTS[value] || [];
  return (
    <div
      className={`grid h-14 w-14 grid-cols-3 grid-rows-3 gap-1 rounded-xl border-2 border-brass-deep bg-board-tile p-2 shadow-tile sm:h-16 sm:w-16 ${
        rolling ? 'animate-dice-tumble' : ''
      }`}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={`m-auto h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${pips.includes(i) ? 'bg-ink' : 'bg-transparent'}`}
        />
      ))}
    </div>
  );
}

export default function Dice({ lastRoll }) {
  const { t } = useTranslation();
  const [rolling, setRolling] = useState(false);
  const [displayRoll, setDisplayRoll] = useState(lastRoll);

  useEffect(() => {
    if (!lastRoll) return undefined;
    setRolling(true);
    const timeoutId = setTimeout(() => {
      setDisplayRoll(lastRoll);
      setRolling(false);
    }, 380);
    return () => clearTimeout(timeoutId);
  }, [lastRoll?.d1, lastRoll?.d2, lastRoll?.playerId]);

  if (!displayRoll) {
    return (
      <div className="flex gap-2">
        <Die value={1} rolling={false} />
        <Die value={1} rolling={false} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <Die value={displayRoll.d1} rolling={rolling} />
        <Die value={displayRoll.d2} rolling={rolling} />
      </div>
      {displayRoll.isDouble && !rolling && (
        <p className="animate-pop-in text-xs font-bold uppercase tracking-wide text-brass-light">{t('game.doubles')}</p>
      )}
    </div>
  );
}
