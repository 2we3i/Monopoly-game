// PhoneGame.jsx
// The frame every game's phone layout is built on. A desktop table can put
// the board, the players, the log and the chat side by side; a phone
// cannot, and stacking them turns the game into scrolling past everything
// to find the one button that matters. So on a phone every game is the
// same shape:
//
//   header   the game, the phase, the clock, and one line saying what YOU
//            have to do right now - always on screen; tap it for the rules
//   tabs     the game's own panels, one at a time, switched from a bar
//            along the bottom edge where the thumb already is
//   menu     the room code, the social buttons, the rules, giving up and
//            leaving - everything that does not need to be on screen
//
// When the game starts needing this player (their turn, their vote) the
// screen goes to the tab where that happens by itself - unless they are in
// the chat, where a strip above the tab bar says so instead of pulling the
// keyboard away - and the phone vibrates.
//
// The frame only lays things out. Every panel inside it is the game's own,
// fed by the same payload and sending the same actions as on a desktop.

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useNow } from '../../hooks/useNow';
import Icon from '../icons';
import SocialBar from '../social/SocialBar';
import { SurrenderButton } from '../room/RoomStatus';
import { RulesPanel } from '../rules/GameGuide';
import { nowAction } from '../rules/nowAction';

// The "what to do now" line, coloured the same way as on every screen.
const NOW_TONE = {
  act: { box: 'border-brass/45 bg-brass/[0.10]', dot: 'animate-pulse bg-brass-light', text: 'text-brass-light' },
  urgent: { box: 'border-orange-400/50 bg-orange-500/[0.10]', dot: 'animate-pulse bg-orange-300', text: 'text-orange-200' },
  wait: { box: 'border-white/[0.08] bg-white/[0.03]', dot: 'bg-parch/35', text: 'text-parch/80' },
  info: { box: 'border-sky-400/30 bg-sky-400/[0.06]', dot: 'bg-sky-300', text: 'text-sky-200' },
  over: { box: 'border-go/35 bg-go/[0.07]', dot: 'bg-go-light', text: 'text-go-light' },
};

const svg = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
};

// The few pictures the shared icon set does not have.
export const PhoneIcon = {
  more: (p) => <svg {...svg} {...p}><circle cx="12" cy="5.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18.5" r="1.2" fill="currentColor" /></svg>,
  exit: (p) => <svg {...svg} {...p}><path d="M14 4.5h3.5a2 2 0 012 2v11a2 2 0 01-2 2H14" /><path d="M10 16l4-4-4-4M14 12H4.5" /></svg>,
  person: (p) => <svg {...svg} {...p}><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20.5c.8-4 3.6-6.5 7-6.5s6.2 2.5 7 6.5" /></svg>,
  board: (p) => <svg {...svg} {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 8.5h17M3.5 15.5h17M8.5 3.5v17M15.5 3.5v17" /></svg>,
  map: (p) => <svg {...svg} {...p}><path d="M9 4.5l-5 2v13l5-2 6 2 5-2v-13l-5 2z" /><path d="M9 4.5v13M15 6.5v13" /></svg>,
  cards: (p) => <svg {...svg} {...p}><rect x="7" y="4" width="11" height="15" rx="2" /><path d="M4.5 7.5v11a2 2 0 002 2h8" /></svg>,
  log: (p) => <svg {...svg} {...p}><path d="M6 4.5h12M6 9.5h12M6 14.5h8M6 19.5h5" /></svg>,
  hatch: (p) => <svg {...svg} {...p}><path d="M3.5 20.5h17" /><path d="M5.5 20.5V11a6.5 6.5 0 0113 0v9.5" /><circle cx="12" cy="13" r="2.6" /><path d="M12 7.5v2.9M12 15.6v2.4M6.5 13h2.9M14.6 13h2.9" /></svg>,
  city: (p) => <svg {...svg} {...p}><path d="M3.5 20.5h17" /><path d="M5 20.5v-9l3-2.5 3 2.5v9M11 20.5V8l4-3.5L19 8v12.5" /><path d="M14 11h2M14 14.5h2" /></svg>,
  share: (p) => <svg {...svg} {...p}><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8" /><path d="M5 12.5v6a2 2 0 002 2h10a2 2 0 002-2v-6" /></svg>,
};

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

// A sheet that slides up from the bottom edge - where a thumb already is.
// Used for every confirmation and every menu on a phone.
export function Sheet({
  title, onClose, children, footer, z = 'z-50',
}) {
  const { t } = useTranslation();
  useEscape(onClose);
  return (
    <div
      className={`fixed inset-0 ${z} flex items-end bg-black/65 backdrop-blur-sm`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[88vh] w-full animate-slide-up flex-col rounded-t-2xl border border-b-0 border-white/10 bg-[#1a1c1f] text-parch shadow-deep">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15" aria-hidden="true" />
        <header className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-2">
          <h2 className="min-w-0 flex-1 truncate font-display text-[18px] font-black leading-tight text-parch">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('phone.close')}
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-parch/50 active:bg-white/10"
          >
            <Icon.close className="h-5 w-5" />
          </button>
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">{children}</div>
        {footer
          ? <footer className="shrink-0 border-t border-white/[0.07] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{footer}</footer>
          : <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>
  );
}

// The phase clock, counting down to the deadline the server set.
export function PhoneTimer({ endsAt, warnAt = 10 }) {
  const { t } = useTranslation();
  const now = useNow(!!endsAt, 250);
  if (!endsAt) return null;
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const warn = seconds <= warnAt;
  return (
    <div
      role="timer"
      aria-label={t('phone.timer')}
      className={`flex h-10 shrink-0 items-center rounded-xl border px-2.5 font-mono text-[20px] font-bold tnum ${
        warn ? 'border-orange-400/50 bg-orange-500/15 text-orange-200 shadow-[0_0_18px_-6px_rgba(251,146,60,0.7)]' : 'border-white/10 bg-black/40 text-parch'
      }`}
    >
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </div>
  );
}

// Messages that arrived while the chat tab was not open. Counted from the
// last message seen rather than from the list's length, because a chat
// list is capped and stops growing once it is full.
export function useUnread(chat, active, myId) {
  const [unread, setUnread] = useState(0);
  const lastSeen = useRef(chat[chat.length - 1] || null);
  useEffect(() => {
    const last = chat[chat.length - 1] || null;
    if (active) {
      setUnread(0);
      lastSeen.current = last;
      return;
    }
    if (last === lastSeen.current) return;
    const from = lastSeen.current ? chat.lastIndexOf(lastSeen.current) + 1 : 0;
    const fresh = chat.slice(from).filter((m) => !m.system && m.playerId !== myId).length;
    if (fresh) setUnread((n) => n + fresh);
    lastSeen.current = last;
  }, [chat, active, myId]);
  return unread;
}

function Header({
  kicker, title, endsAt, extra, onMenu, action,
}) {
  const { t } = useTranslation();
  const tone = NOW_TONE[action?.tone] || NOW_TONE.info;
  return (
    <header className="z-20 shrink-0 border-b border-white/[0.07] bg-black/55 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <div key={title} className="min-w-0 flex-1 animate-fade-in pl-0.5">
          {kicker && <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-parch/45">{kicker}</p>}
          <h1 className="line-clamp-2 font-display text-[18px] font-black leading-tight text-parch">{title}</h1>
        </div>
        {extra}
        <PhoneTimer endsAt={endsAt} />
        <button
          type="button"
          onClick={onMenu}
          aria-label={t('phone.menu')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-parch/80 active:bg-white/10"
        >
          <PhoneIcon.more className="h-5 w-5" />
        </button>
      </div>
      {/* What THIS player has to do right now. Tapping it opens the rules
          on their "What now?" tab. */}
      {action && (
        <button
          type="button"
          onClick={action.onTap}
          aria-live="polite"
          className={`mt-2 flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left ${tone.box}`}
        >
          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
          <span className="min-w-0 flex-1">
            <b className={`block text-[14px] font-semibold leading-snug ${tone.text}`}>{action.title}</b>
            {/* A phone held sideways has no height to spare for the why. */}
            {action.hint && <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-parch/50 [@media(max-height:500px)]:hidden">{action.hint}</span>}
          </span>
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-[12px] font-bold text-parch/50" aria-hidden="true">?</span>
        </button>
      )}
    </header>
  );
}

function TabBar({ tabs, tab, onTab }) {
  const { t } = useTranslation();
  return (
    <nav className="z-20 shrink-0 border-t border-white/[0.08] bg-black/60 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label={t('phone.menu')}>
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ id, label, icon, badge }) => {
          const active = tab === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
                  active ? 'text-brass-light' : 'text-parch/45 active:text-parch/80'
                }`}
              >
                {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brass-light" aria-hidden="true" />}
                <span className="flex h-[22px] w-[22px] items-center justify-center [&>svg]:h-[22px] [&>svg]:w-[22px]">{icon}</span>
                <span className="max-w-full truncate px-0.5">{label}</span>
                {badge === 'dot' && (
                  <span className="absolute left-[calc(50%+7px)] top-2 h-2.5 w-2.5 animate-pulse rounded-full bg-orange-400 ring-2 ring-black/60" aria-hidden="true" />
                )}
                {typeof badge === 'number' && badge > 0 && (
                  <span className="absolute left-[calc(50%+5px)] top-1 min-w-[1.15rem] rounded-full bg-rent px-1 text-center text-[10px] font-bold leading-[1.15rem] text-white tnum">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Shown above the tab bar when the game needs this player and they are
// looking at something else.
function Nudge({ text, onGo }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onGo}
      className="z-20 flex shrink-0 items-center gap-2.5 border-t border-orange-400/40 bg-gradient-to-r from-orange-500/25 to-brass/20 px-4 py-2.5 text-left backdrop-blur-xl"
    >
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-orange-300" />
      <span className="min-w-0 flex-1 text-[14px] font-bold text-parch">{text}</span>
      <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-brass-light">
        {t('phone.go')}
        <Icon.chevronRight className="h-4 w-4" />
      </span>
    </button>
  );
}

// One line in the menu sheet.
export function MenuItem({
  icon, label, hint, onClick, tone = 'text-brass-light',
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-3 text-left active:bg-white/[0.08]">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5 ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-parch">{label}</span>
        {hint && <span className="block text-[12px] leading-snug text-parch/45">{hint}</span>}
      </span>
      <Icon.chevronRight className="h-4 w-4 shrink-0 text-parch/35" />
    </button>
  );
}

function MenuSheet({
  roomCode, items, onRules, onSurrender, onLeave, leaveHint, onClose,
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* the code is on screen anyway */ }
  };
  return (
    <Sheet title={t('phone.menu')} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        {roomCode && (
          <button type="button" onClick={copy} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-left">
            <span className="min-w-0 flex-1 text-[13px] text-parch/55">{copied ? t('waiting.copied') : t('waiting.roomCode')}</span>
            <span className="font-mono text-[20px] font-black tracking-[0.2em] text-parch">{roomCode}</span>
            {copied ? <Icon.check className="h-4 w-4 text-go-light" /> : <Icon.scroll className="h-4 w-4 text-parch/35" />}
          </button>
        )}
        <SocialBar className="justify-end" />
        {onRules && <MenuItem icon={<Icon.scroll />} label={t('phone.rules')} hint={t('phone.rulesHint')} onClick={onRules} />}
        {(items || []).map((item) => (
          <MenuItem key={item.id} icon={item.icon} label={item.label} hint={item.hint} tone={item.tone} onClick={() => { onClose(); item.onClick(); }} />
        ))}
        {/* Giving up asks for its own confirmation and is final. */}
        {onSurrender && <SurrenderButton onSurrender={onSurrender} className="btn-danger w-full py-3 text-[14px]" />}
        <button type="button" onClick={onLeave} className="btn-ghost w-full py-3 text-[14px]">
          <PhoneIcon.exit className="h-4 w-4" />
          {t('phone.leave')}
        </button>
        {leaveHint && <p className="px-1 text-center text-[12px] leading-snug text-parch/40">{leaveHint}</p>}
      </div>
    </Sheet>
  );
}

// The page of a tab that scrolls: the panels one under another with the
// same gutter everywhere.
export function PhoneStack({ children, className = '' }) {
  return <div className={`flex flex-col gap-3 px-3 py-3 ${className}`}>{children}</div>;
}

// A heading inside a tab.
export function PhoneSection({ title, right = null, children, className = '' }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <h2 className="min-w-0 flex-1 text-[12px] font-bold uppercase tracking-[0.12em] text-parch/50">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * The phone frame.
 *
 *   gameId, state, ctx   what the "what to do now" line and the rules read
 *   theme                the game's table background class
 *   kicker, title        the small line and the big line of the header
 *   endsAt               the phase deadline, if the game has one
 *   headerExtra          something of the game's own beside the clock
 *   tabs                 [{ id, label, icon, badge, content, fill, keep, footer }]
 *                        fill: the content takes the whole height and does
 *                        not scroll (a board, the chat); keep: stays
 *                        mounted while hidden (a board keeps its zoom);
 *                        footer: pinned under the content on that tab
 *   tab, onTab           which tab is open (the game owns it, so it can
 *                        switch tabs itself - "open the trades")
 *   act                  { tab, active, text }: the tab where this player
 *                        is needed, whether they are needed now, and what
 *                        the strip above the tab bar says when they are
 *                        looking elsewhere
 *   resetKey             a change of phase or round: the action tab goes
 *                        back to its top, where the new panel is
 *   roomCode, onLeave, onSurrender, leaveHint   the menu
 *   menuItems            [{ id, icon, label, hint, onClick }]: the game's
 *                        own lines in the menu (its settings, say)
 *   onRules              a game with its own rules dialog opens that one
 *   children             overlays: dialogs, the end screen
 */
export default function PhoneGame({
  gameId, state, ctx, theme = 'table-felt', kicker, title, endsAt, headerExtra = null,
  tabs, tab, onTab, act = null, resetKey = null,
  roomCode, onLeave, onSurrender = null, leaveHint = null, menuItems = null, onRules = null,
  children,
}) {
  const { language } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const mainRef = useRef(null);
  const scrolls = useRef({});
  const current = tabs.find((x) => x.id === tab) || tabs[0];

  const openRules = useCallback(() => {
    if (onRules) onRules();
    else setRulesOpen(true);
  }, [onRules]);

  const action = useMemo(() => {
    const a = gameId ? nowAction(gameId, state, { ...(ctx || {}), language }) : null;
    return a ? { ...a, onTap: openRules } : null;
  }, [gameId, state, ctx, language, openRules]);

  // Each tab keeps its own scroll position; tapping the tab you are on
  // goes back to its top.
  const goTab = useCallback((next) => {
    const el = mainRef.current;
    if (next === current.id) {
      el?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (el && !current.fill) scrolls.current[current.id] = el.scrollTop;
    onTab(next);
  }, [current, onTab]);
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = current.fill ? 0 : (scrolls.current[current.id] || 0);
  }, [current.id, current.fill]);

  // Needed: the tab where it happens comes to the player, scrolled to its
  // top - unless they are typing in the chat.
  const needed = !!act?.active;
  useEffect(() => {
    if (!needed || !act) return;
    try { navigator.vibrate?.(120); } catch { /* not every phone vibrates */ }
    if (current.id === 'chat') return;
    scrolls.current[act.tab] = 0;
    if (current.id === act.tab) {
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (mainRef.current && !current.fill) scrolls.current[current.id] = mainRef.current.scrollTop;
    onTab(act.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed]);

  // A new phase puts its panel at the top of the action tab.
  useEffect(() => {
    if (resetKey == null) return;
    const home = act?.tab || tabs[0].id;
    scrolls.current[home] = 0;
    if (current.id === home && !current.fill) mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const badges = tabs.map((x) => ({ ...x, badge: x.badge ?? (needed && act?.tab === x.id ? 'dot' : null) }));

  return (
    <div className={`${theme} phone-frame flex flex-col overflow-hidden`}>
      <Header
        kicker={kicker}
        title={title}
        endsAt={endsAt}
        extra={headerExtra}
        onMenu={() => setMenuOpen(true)}
        action={action}
      />

      <main
        ref={mainRef}
        className={`relative min-h-0 flex-1 ${current.fill ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overscroll-contain'}`}
      >
        {tabs.map((x) => {
          const active = x.id === current.id;
          if (!active && !x.keep) return null;
          return (
            <div
              key={x.id}
              className={`${active ? '' : 'hidden'} ${x.fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}
            >
              {x.content}
            </div>
          );
        })}
      </main>

      {current.footer && <div className="z-20 shrink-0">{current.footer}</div>}
      {needed && act.text && current.id !== act.tab && <Nudge text={act.text} onGo={() => { scrolls.current[act.tab] = 0; goTab(act.tab); }} />}

      <TabBar tabs={badges} tab={current.id} onTab={goTab} />

      {menuOpen && (
        <MenuSheet
          roomCode={roomCode}
          items={menuItems}
          onRules={() => { setMenuOpen(false); openRules(); }}
          onSurrender={onSurrender}
          onLeave={() => { setMenuOpen(false); onLeave(); }}
          leaveHint={leaveHint}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {rulesOpen && gameId && <RulesPanel gameId={gameId} state={state} ctx={ctx} onClose={() => setRulesOpen(false)} />}

      {children}
    </div>
  );
}
