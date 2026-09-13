// ActivityLog.jsx
// The running story of the game, docked over a corner of the board. It
// stays readable while collapsed (the last few lines) because "what just
// happened to me?" is the question players ask most often, and expands
// into the full scrollable history on demand.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { formatLogEntry } from '../i18n/logFormatter';
import Icon from './icons';

const ENTRY_STYLE = {
  PAID_RENT: { icon: Icon.cash, tone: 'text-rent-light' },
  PAID_TAX: { icon: Icon.tax, tone: 'text-rent-light' },
  BOUGHT_PROPERTY: { icon: Icon.bank, tone: 'text-brass-light' },
  DECLINED_PURCHASE: { icon: Icon.close, tone: 'text-parch/45' },
  COLLECTED_GO: { icon: Icon.go, tone: 'text-go-light' },
  FREE_PARKING_COLLECT: { icon: Icon.parking, tone: 'text-go-light' },
  SENT_TO_JAIL: { icon: Icon.police, tone: 'text-rent-light' },
  SPEEDING_TO_JAIL: { icon: Icon.police, tone: 'text-rent-light' },
  JAIL_DOUBLES_OUT: { icon: Icon.dice, tone: 'text-go-light' },
  JAIL_FAILED_ATTEMPT: { icon: Icon.jail, tone: 'text-parch/55' },
  PAID_JAIL_FINE: { icon: Icon.cash, tone: 'text-rent-light' },
  USED_JAIL_CARD: { icon: Icon.scroll, tone: 'text-go-light' },
  DREW_CARD: { icon: Icon.chance, tone: 'text-brass-light' },
  MORTGAGED: { icon: Icon.lock, tone: 'text-parch/60' },
  UNMORTGAGED: { icon: Icon.lock, tone: 'text-go-light' },
  BUILT_HOUSE: { icon: Icon.home, tone: 'text-go-light' },
  BUILT_HOTEL: { icon: Icon.hotel, tone: 'text-go-light' },
  SOLD_HOUSE: { icon: Icon.home, tone: 'text-rent-light' },
  DOUBLES_AGAIN: { icon: Icon.dice, tone: 'text-brass-light' },
  BANKRUPTCY: { icon: Icon.warning, tone: 'text-rent-light' },
  TRADE_PROPOSED: { icon: Icon.trade, tone: 'text-brass-light' },
  TRADE_ACCEPTED: { icon: Icon.trade, tone: 'text-go-light' },
  TRADE_DECLINED: { icon: Icon.trade, tone: 'text-rent-light' },
  TRADE_CANCELLED: { icon: Icon.trade, tone: 'text-parch/45' },
  CUSTOM_PRICE_SET: { icon: Icon.users, tone: 'text-brass-light' },
  CUSTOM_PRICE_CLEARED: { icon: Icon.users, tone: 'text-parch/45' },
  NEW_TURN: { icon: Icon.chevronRight, tone: 'text-parch/45' },
  GAME_STARTED: { icon: Icon.flag, tone: 'text-go-light' },
  WIN: { icon: Icon.crown, tone: 'text-brass-light' },
};

function LogRow({ entry, t, language, board }) {
  const style = ENTRY_STYLE[entry.type] || { icon: Icon.chevronRight, tone: 'text-parch/45' };
  const IconCmp = style.icon;
  return (
    <li className="flex items-start gap-2 py-[3px]">
      <IconCmp className={`mt-[2px] h-3.5 w-3.5 shrink-0 ${style.tone}`} />
      <span className="text-[11.5px] leading-snug text-parch/70">{formatLogEntry(entry, t, language, board)}</span>
    </li>
  );
}

export default function ActivityLog({ log, board }) {
  const { t, language } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // The log floats over the board, so it has to be able to get out of
  // the way completely - minimised it is just its own title bar.
  const [minimized, setMinimized] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (expanded && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [log.length, expanded]);

  const entries = expanded ? log.slice(-40) : log.slice(-3);
  if (log.length === 0) return null;

  return (
    <div className={`pointer-events-auto overflow-hidden rounded-xl border border-white/10 bg-felt-800/85 shadow-lift backdrop-blur-md transition-all ${minimized ? 'w-44' : 'w-full max-w-[22rem]'}`}>
      <div className={`flex items-center gap-1 px-2.5 py-1.5 ${minimized ? '' : 'border-b border-white/[0.07]'}`}>
        <Icon.scroll className="h-3.5 w-3.5 shrink-0 text-brass/70" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-[0.12em] text-parch/50">{t('log.title')}</span>
        {!minimized && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? t('log.collapse') : t('log.expand')}
            aria-label={expanded ? t('log.collapse') : t('log.expand')}
            className="rounded p-0.5 text-parch/40 transition-colors hover:bg-white/10 hover:text-parch"
          >
            {expanded ? <Icon.chevronDown className="h-3.5 w-3.5" /> : <Icon.chevronUp className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setMinimized((v) => !v); setExpanded(false); }}
          title={minimized ? t('log.show') : t('log.hide')}
          aria-label={minimized ? t('log.show') : t('log.hide')}
          className="rounded p-0.5 text-parch/40 transition-colors hover:bg-white/10 hover:text-parch"
        >
          {minimized ? <Icon.eye className="h-3.5 w-3.5" /> : <Icon.minus className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!minimized && (
        <ul
          ref={scrollRef}
          className={`scrollbar-thin px-3 py-1.5 ${expanded ? 'max-h-64 overflow-y-auto' : 'overflow-hidden'}`}
        >
          {entries.map((entry, i) => (
            <LogRow key={`${entry.ts}-${i}`} entry={entry} t={t} language={language} board={board} />
          ))}
        </ul>
      )}
    </div>
  );
}
