// GameGuide.jsx
// The one rules panel every game uses.
//
// Three things live here, and they are meant to be used together:
//
//   <NowBar>       the compact "your action now" strip - what THIS player
//                  must do at this exact moment, always on screen
//   <RulesButton>  opens the panel without leaving the match
//   <RulesPanel>   the rules themselves, as a side sheet that covers part
//                  of the screen and closes on Escape, on a backdrop click
//                  or on its own button - never a full-screen takeover,
//                  because a player reads the rules to keep playing
//
// The panel has three tabs, in the order a confused player needs them:
// "What now?", "In short", "Full rules". The full rules are the same eight
// blocks for every game (see content/social.js), so the second game you
// open this in is already familiar.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import Icon from '../icons';
import { rulesFor } from './content';
import { nowAction, say } from './nowAction';

const UI = {
  en: {
    rules: 'Rules',
    howToPlay: 'How to play',
    tabNow: 'What now?',
    tabShort: 'In short',
    tabFull: 'Full rules',
    nowTitle: 'Your action now',
    goal: 'The goal',
    flow: 'How a round goes',
    ui: 'What the screen is telling you',
    win: 'How to win',
    actions: 'What you can do',
    special: 'Rules that surprise people',
    end: 'When the game ends',
    example: 'An example',
    close: 'Close',
    youAreHere: 'you are here',
    noRules: 'No rules have been written for this game yet.',
  },
  ru: {
    rules: 'Правила',
    howToPlay: 'Как играть',
    tabNow: 'Что делать сейчас?',
    tabShort: 'Кратко',
    tabFull: 'Полные правила',
    nowTitle: 'Ваше действие сейчас',
    goal: 'Цель игры',
    flow: 'Как проходит раунд',
    ui: 'Что означают элементы интерфейса',
    win: 'Как победить',
    actions: 'Какие действия вам доступны',
    special: 'Особые правила',
    end: 'Условия окончания игры',
    example: 'Пример',
    close: 'Закрыть',
    youAreHere: 'вы здесь',
    noRules: 'Правила для этой игры пока не описаны.',
  },
};

const TONE = {
  act: {
    ring: 'border-brass/45 bg-brass/[0.09]', dot: 'bg-brass-light', text: 'text-brass-light', glyph: '👉',
  },
  urgent: {
    ring: 'border-orange-400/50 bg-orange-500/[0.09]', dot: 'bg-orange-300', text: 'text-orange-200', glyph: '⏳',
  },
  wait: {
    ring: 'border-white/[0.10] bg-white/[0.03]', dot: 'bg-parch/35', text: 'text-parch/55', glyph: '⏸️',
  },
  info: {
    ring: 'border-sky-400/30 bg-sky-400/[0.06]', dot: 'bg-sky-300', text: 'text-sky-200', glyph: 'ℹ️',
  },
  over: {
    ring: 'border-go/35 bg-go/[0.07]', dot: 'bg-go-light', text: 'text-go-light', glyph: '🏁',
  },
};

function useUi() {
  const { language } = useTranslation();
  return { language, ui: UI[language] || UI.en };
}

// --- the button --------------------------------------------------------

export function RulesButton({ onClick, compact = false, className = '' }) {
  const { ui } = useUi();
  return (
    <button
      type="button"
      onClick={onClick}
      title={ui.howToPlay}
      className={`btn-ghost shrink-0 ${compact ? 'px-2.5 py-2 text-[12.5px]' : 'px-3 py-2 text-[13px]'} ${className}`}
    >
      <Icon.scroll className="h-4 w-4" />
      {!compact && ui.rules}
    </button>
  );
}

// --- the strip ---------------------------------------------------------

// The one line that says what to do. `extra` is for a game that wants to
// put its own control (a skip button, a counter) on the same row.
export function NowBar({
  gameId, state, ctx = {}, onOpenRules, extra = null, className = '',
}) {
  const { language, ui } = useUi();
  const action = useMemo(() => nowAction(gameId, state, { ...ctx, language }), [gameId, state, ctx, language]);
  if (!action) return null;
  const tone = TONE[action.tone] || TONE.info;

  return (
    <section
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 ${tone.ring} ${className}`}
      aria-live="polite"
    >
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${action.tone === 'act' || action.tone === 'urgent' ? 'animate-pulse' : ''}`} />
        <span className="section-label whitespace-nowrap">{ui.nowTitle}</span>
      </span>
      <p className="min-w-0 flex-1 basis-[min(100%,18rem)] text-[13.5px] leading-snug sm:basis-auto">
        <b className={`font-semibold ${tone.text}`}>{action.title}</b>
        {action.hint && <span className="ml-1.5 text-parch/45">{action.hint}</span>}
      </p>
      {extra}
      {onOpenRules && <RulesButton onClick={onOpenRules} compact className="ml-auto" />}
    </section>
  );
}

// --- the panel ---------------------------------------------------------

function Block({ label, children }) {
  return (
    <section className="mb-5">
      <h3 className="section-label mb-2">{label}</h3>
      {children}
    </section>
  );
}

function Step({
  item, index, active, language, ui,
}) {
  return (
    <li className={`relative flex gap-3 rounded-xl border px-3 py-2.5 ${active ? 'border-brass/45 bg-brass/[0.08]' : 'border-white/[0.07] bg-black/20'}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/40 text-[17px]" aria-hidden="true">{item.glyph || index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] font-semibold ${active ? 'text-brass-light' : 'text-parch'}`}>
          {say(item.title, language)}
          {active && <span className="ml-1.5 rounded bg-brass/25 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brass-light">{ui.youAreHere}</span>}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-parch/55">{say(item.text, language)}</p>
      </div>
    </li>
  );
}

function Cards({ items, language }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <li key={i} className="flex gap-2.5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <span className="text-[16px] leading-none" aria-hidden="true">{item.glyph || '•'}</span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-parch">{say(item.title, language)}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-parch/55">{say(item.text, language)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RulesPanel({
  gameId, state, ctx = {}, onClose,
}) {
  const { language, ui } = useUi();
  const rules = rulesFor(gameId);
  const action = useMemo(() => nowAction(gameId, state, { ...ctx, language }), [gameId, state, ctx, language]);
  const [tab, setTab] = useState('now');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tone = TONE[action?.tone] || TONE.info;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/55 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label={ui.howToPlay}
    >
      {/* A side sheet, not a full-screen dialog: the table stays visible
          on the left so reading the rules never means losing the game. */}
      <div className="flex h-full w-full max-w-[34rem] animate-slide-in-right flex-col border-l border-white/10 bg-felt-700/97 shadow-deep backdrop-blur-2xl 4xl:max-w-[44rem]">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brass/15 text-[18px]" aria-hidden="true">{rules?.emoji || '📖'}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[17px] font-bold leading-tight text-parch">
              {rules ? say(rules.title, language) : ui.howToPlay}
            </h2>
            {rules?.tagline && <p className="truncate text-[12px] text-parch/45">{say(rules.tagline, language)}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui.close}
            className="shrink-0 rounded-lg p-1.5 text-parch/40 transition-colors hover:bg-white/10 hover:text-parch"
          >
            <Icon.close className="h-5 w-5" />
          </button>
        </header>

        {/* On a phone the three tabs would wrap onto two lines; they scroll
            sideways instead, so the row stays one line tall. */}
        <nav className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.08] px-3 py-2">
          {[['now', ui.tabNow], ['short', ui.tabShort], ['full', ui.tabFull]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tab === id ? 'bg-white/[0.10] text-parch' : 'text-parch/50 hover:bg-white/[0.05] hover:text-parch/80'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {tab === 'now' && (
            <>
              {action && (
                <div className={`mb-5 rounded-xl border px-4 py-3.5 ${tone.ring}`}>
                  <p className="section-label mb-1">{ui.nowTitle}</p>
                  <p className={`text-[16px] font-bold leading-snug ${tone.text}`}>
                    <span className="mr-1.5" aria-hidden="true">{tone.glyph}</span>
                    {action.title}
                  </p>
                  {action.hint && <p className="mt-1 text-[13px] leading-snug text-parch/60">{action.hint}</p>}
                </div>
              )}
              {rules ? (
                <>
                  <Block label={ui.goal}>
                    <p className="text-[13.5px] leading-relaxed text-parch/75">{say(rules.goal, language)}</p>
                  </Block>
                  <Block label={ui.flow}>
                    <ol className="flex flex-col gap-2">
                      {rules.flow.map((item, i) => (
                        <Step key={item.id || i} item={item} index={i} active={!!action?.step && action.step === item.id} language={language} ui={ui} />
                      ))}
                    </ol>
                  </Block>
                </>
              ) : (
                <p className="text-[13px] text-parch/50">{ui.noRules}</p>
              )}
            </>
          )}

          {tab === 'short' && (rules ? (
            <>
              <Block label={ui.goal}>
                <p className="text-[13.5px] leading-relaxed text-parch/75">{say(rules.goal, language)}</p>
              </Block>
              <Block label={ui.tabShort}>
                <ol className="flex flex-col gap-2">
                  {rules.short.map((line, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-parch/75">
                      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brass/20 text-[11px] font-bold text-brass-light tnum">{i + 1}</span>
                      <span className="min-w-0">{say(line, language)}</span>
                    </li>
                  ))}
                </ol>
              </Block>
              <Block label={ui.win}>
                <p className="rounded-xl border border-go/25 bg-go/[0.06] px-3.5 py-3 text-[13.5px] leading-relaxed text-parch/80">
                  🏆 {say(rules.win, language)}
                </p>
              </Block>
            </>
          ) : <p className="text-[13px] text-parch/50">{ui.noRules}</p>)}

          {tab === 'full' && (rules ? (
            <>
              <Block label={ui.goal}>
                <p className="text-[13.5px] leading-relaxed text-parch/75">{say(rules.goal, language)}</p>
              </Block>
              <Block label={ui.flow}>
                <ol className="flex flex-col gap-2">
                  {rules.flow.map((item, i) => (
                    <Step key={item.id || i} item={item} index={i} active={!!action?.step && action.step === item.id} language={language} ui={ui} />
                  ))}
                </ol>
              </Block>
              <Block label={ui.ui}><Cards items={rules.ui} language={language} /></Block>
              <Block label={ui.win}>
                <p className="rounded-xl border border-go/25 bg-go/[0.06] px-3.5 py-3 text-[13.5px] leading-relaxed text-parch/80">
                  🏆 {say(rules.win, language)}
                </p>
              </Block>
              <Block label={ui.actions}><Cards items={rules.actions} language={language} /></Block>
              <Block label={ui.special}>
                <ul className="flex flex-col gap-2">
                  {rules.special.map((item, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i} className="rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-2.5">
                      <p className="text-[13px] font-semibold text-parch">⚠ {say(item.title, language)}</p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-parch/55">{say(item.text, language)}</p>
                    </li>
                  ))}
                </ul>
              </Block>
              <Block label={ui.end}>
                <ul className="flex flex-col gap-2">
                  {rules.end.map((item, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i} className="flex gap-2.5 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-2.5">
                      <span aria-hidden="true">🏁</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-parch">{say(item.title, language)}</p>
                        <p className="mt-0.5 text-[12.5px] leading-snug text-parch/55">{say(item.text, language)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
              {rules.example && (
                <Block label={ui.example}>
                  <p className="rounded-xl border border-sky-400/25 bg-sky-400/[0.05] px-3.5 py-3 text-[13px] leading-relaxed text-parch/70">
                    {say(rules.example.text, language)}
                  </p>
                </Block>
              )}
            </>
          ) : <p className="text-[13px] text-parch/50">{ui.noRules}</p>)}
        </div>
      </div>
    </div>
  );
}

// --- both at once ------------------------------------------------------

// The whole system in one component: the strip, the button, and the panel
// it opens. A screen that wants them apart can import the three pieces.
export default function GameGuide({
  gameId, state, ctx = {}, extra = null, className = '', bar = true,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {bar && (
        <NowBar
          gameId={gameId}
          state={state}
          ctx={ctx}
          extra={extra}
          onOpenRules={() => setOpen(true)}
          className={className}
        />
      )}
      {open && <RulesPanel gameId={gameId} state={state} ctx={ctx} onClose={() => setOpen(false)} />}
    </>
  );
}

// A rules button on its own, for a game header that already has a status
// line of its own.
export function RulesLauncher({ gameId, state, ctx = {}, compact = true }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RulesButton onClick={() => setOpen(true)} compact={compact} />
      {open && <RulesPanel gameId={gameId} state={state} ctx={ctx} onClose={() => setOpen(false)} />}
    </>
  );
}
