// MainMenu.jsx
// The platform's front door. Everything below this screen is one game or
// another; this screen only answers "which game, and how do I get into a
// room". Games are listed from data rather than hard-coded markup, so a
// new game is a new entry, not a new layout.

import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';
import ProfileMenu from './ProfileMenu';
import Icon from './icons';
import SocialBar from './social/SocialBar';
import { DashIcon } from './ui/dash';
import { navigate } from '../lib/router';
import { BunkerArt } from './bunker/bunkerText';
import { ChpokArt, Chpok2Art } from './tabletop/chpokArt';
import { CatanArt } from './catan/catanArt';

function MonopolyArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="mono-board" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7efdd" />
          <stop offset="100%" stopColor="#e6d7b9" />
        </linearGradient>
      </defs>
      <rect x="18" y="8" width="84" height="64" rx="6" fill="url(#mono-board)" stroke="rgba(31,36,23,0.25)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={`t${i}`} x={26 + i * 12} y="8" width="11" height="7" rx="1.5" fill={['#c4453a', '#e08a3c', '#e8cf4a', '#3f9463', '#3a6ea8', '#7a5fb8'][i]} opacity="0.9" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={`b${i}`} x={26 + i * 12} y="65" width="11" height="7" rx="1.5" fill={['#7a5230', '#a3d0e8', '#d888b0', '#c14e9a', '#2e8b57', '#d4af37'][i]} opacity="0.9" />
      ))}
      <rect x="18" y="20" width="7" height="40" rx="1.5" fill="#c4453a" opacity="0.75" />
      <rect x="95" y="20" width="7" height="40" rx="1.5" fill="#3a6ea8" opacity="0.75" />
      <g transform="translate(46 30)">
        <rect width="14" height="14" rx="3.5" fill="#fff" stroke="rgba(31,36,23,0.3)" />
        <circle cx="4.5" cy="4.5" r="1.6" fill="#1f2417" />
        <circle cx="9.5" cy="9.5" r="1.6" fill="#1f2417" />
        <rect x="17" y="4" width="14" height="14" rx="3.5" fill="#fff" stroke="rgba(31,36,23,0.3)" />
        <circle cx="21.5" cy="8.5" r="1.6" fill="#1f2417" />
        <circle cx="26.5" cy="13.5" r="1.6" fill="#1f2417" />
        <circle cx="24" cy="11" r="1.6" fill="#1f2417" />
      </g>
    </svg>
  );
}

function MafiaArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="mafia-sky" cx="50%" cy="20%" r="80%">
          <stop offset="0%" stopColor="#2b2545" />
          <stop offset="100%" stopColor="#0a0a12" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" rx="6" fill="url(#mafia-sky)" />
      <circle cx="92" cy="20" r="11" fill="#e8e2c8" opacity="0.85" />
      <circle cx="87" cy="17" r="11" fill="#0a0a12" opacity="0.9" />
      {[[14, 14], [30, 9], [50, 18], [66, 11], [104, 40], [22, 34]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="#fff" opacity="0.6" />
      ))}
      {/* A row of silhouettes: the town, one of them not what they seem. */}
      {[18, 38, 58, 78, 98].map((x, i) => (
        <g key={x} transform={`translate(${x} 44)`} opacity={i === 2 ? 1 : 0.5}>
          <circle cx="0" cy="0" r="6" fill={i === 2 ? '#a8342a' : '#3a3f52'} />
          <path d="M-9 30v-14a9 9 0 0118 0v14z" fill={i === 2 ? '#a8342a' : '#3a3f52'} />
        </g>
      ))}
      <path d="M52 40h12v3a6 6 0 01-12 0z" fill="#0a0a12" opacity="0.55" />
    </svg>
  );
}

function CitadelsArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="citadels-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b2a57" />
          <stop offset="100%" stopColor="#140f1c" />
        </linearGradient>
      </defs>
      <rect width="120" height="80" rx="6" fill="url(#citadels-sky)" />
      <circle cx="97" cy="17" r="7" fill="#f3d27a" opacity="0.85" />
      <g fill="#1f1729">
        <rect x="12" y="42" width="16" height="38" />
        <path d="M10 42l10-13 10 13z" />
        <rect x="32" y="30" width="20" height="50" />
        <path d="M30 30l12-15 12 15z" />
        <rect x="56" y="46" width="16" height="34" />
        <path d="M56 46v-5h3v2h3v-2h4v2h3v-2h3v5z" />
        <rect x="76" y="34" width="26" height="46" />
        <path d="M76 34v-6h4v3h4v-3h4v3h4v-3h4v3h6v3z" />
      </g>
      <g fill="#f3d27a" opacity="0.85">
        <rect x="18" y="53" width="3" height="5" rx="1" />
        <rect x="40" y="43" width="4" height="6" rx="1.5" />
        <rect x="62" y="57" width="3" height="5" rx="1" />
        <rect x="87" y="47" width="4" height="6" rx="1.5" />
      </g>
      {['#d4a52c', '#4f7fd6', '#3fa36b', '#c94a3c', '#9a6ad6'].map((c, i) => (
        <rect key={c} x={24 + i * 15} y="71" width="12" height="4" rx="1.5" fill={c} />
      ))}
    </svg>
  );
}

const GAME_ART = {
  monopoly: MonopolyArt, mafia: MafiaArt, citadels: CitadelsArt, bunker: BunkerArt, catan: CatanArt, chpok: ChpokArt, chpok2: Chpok2Art,
};
const GAME_ACCENT = {
  monopoly: 'from-brass/25 to-transparent',
  mafia: 'from-rent/25 to-transparent',
  citadels: 'from-violet-500/25 to-transparent',
  bunker: 'from-orange-500/15 to-transparent',
  catan: 'from-sky-500/20 to-transparent',
  chpok: 'from-rose-500/20 to-transparent',
  chpok2: 'from-fuchsia-500/15 to-transparent',
};
const GAME_EMOJI = {
  monopoly: '🎲', mafia: '🔪', citadels: '🏰', bunker: '☢️', catan: '🏝️', chpok: '🔞', chpok2: '🔞',
};

// Also used by the board-games section, which has nothing to configure.
export function GameCard({ game, onPlay, onConfigure, isGuest }) {
  const { t } = useTranslation();
  const Art = GAME_ART[game.id] || MonopolyArt;
  const unavailable = game.available === false;

  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-felt-700/70 shadow-glass backdrop-blur-xl transition-all duration-300 ${
      unavailable ? 'opacity-70' : 'hover:-translate-y-1 hover:border-white/20 hover:shadow-deep'
    }`}
    >
      <div className="relative h-36 w-full overflow-hidden sm:h-40 3xl:h-48 4xl:h-64">
        <div className={`absolute inset-0 transition-transform duration-500 ${unavailable ? 'grayscale' : 'group-hover:scale-[1.04]'}`}>
          <Art />
        </div>
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t ${GAME_ACCENT[game.id] || GAME_ACCENT.monopoly}`} />
        <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold text-parch backdrop-blur-sm">
          {GAME_EMOJI[game.id] || '🎮'} {t(`menu.${game.id}.badge`)}
        </span>
        {unavailable && (
          <span className="absolute right-3 top-3 rounded-full bg-rent/80 px-2.5 py-1 text-[11px] font-bold text-white">
            {t('menu.unavailable')}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="font-display text-[22px] font-black leading-tight text-parch 4xl:text-[32px]">{t(`menu.${game.id}.title`)}</h2>
          <p className="mt-1 text-[13px] leading-snug text-parch/50 4xl:text-[16.5px]">{t(`menu.${game.id}.description`)}</p>
        </div>

        <ul className="flex flex-wrap gap-1.5">
          <li className="pill bg-white/[0.06] text-parch/70">
            <Icon.users className="h-3 w-3" />
            {t('menu.playerRange', { min: game.minPlayers, max: game.maxPlayers })}
          </li>
          {(t(`menu.${game.id}.tags`) || '').split('|').filter(Boolean).map((tag) => (
            <li key={tag} className="pill bg-white/[0.06] text-parch/70">{tag}</li>
          ))}
        </ul>

        <div className="mt-auto flex gap-2 pt-1">
          <button type="button" disabled={unavailable} onClick={() => onPlay(game)} className="btn-primary flex-1 py-3 text-[15px] 4xl:py-4 4xl:text-[18px]">
            {isGuest ? <Icon.lock className="h-4 w-4" /> : <Icon.chevronRight className="h-4 w-4" />}
            {isGuest ? t('menu.createNeedsAccount') : t('menu.play')}
          </button>
          {onConfigure && (
            <button
              type="button"
              disabled={unavailable}
              onClick={() => onConfigure(game)}
              title={t('menu.configure')}
              aria-label={t('menu.configure')}
              className="btn-ghost px-3 py-3"
            >
              <Icon.settings className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MainMenu({
  auth, onPlay, onConfigure, onJoinCode, joinError, joining, onAuth,
}) {
  const { t } = useTranslation();
  const [games, setGames] = useState([
    { id: 'monopoly', minPlayers: 2, maxPlayers: 10 },
    { id: 'mafia', minPlayers: 4, maxPlayers: 15 },
    { id: 'citadels', minPlayers: 2, maxPlayers: 7 },
    { id: 'bunker', minPlayers: 4, maxPlayers: 16 },
    { id: 'catan', minPlayers: 2, maxPlayers: 4 },
  ]);
  const [code, setCode] = useState('');
  const isGuest = !auth?.isLoggedIn;

  // The catalogue is authoritative on the server; the list above is only
  // what to render before the first response arrives.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/games')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.games) setGames(data.games);
      })
      .catch(() => { /* the built-in list is a fine fallback */ });
    return () => { cancelled = true; };
  }, []);

  const submitCode = (e) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length >= 4) onJoinCode(clean);
  };

  return (
    <div className="table-felt min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 3xl:max-w-[1500px] 4xl:max-w-[2100px] 4xl:px-10 4xl:py-6 5xl:max-w-[2800px]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brass-light to-brass-deep text-ink shadow-lift 4xl:h-12 4xl:w-12">
          <Icon.crown className="h-5 w-5 4xl:h-7 4xl:w-7" />
        </span>
        <h1 className="font-display text-[19px] font-black tracking-tight text-parch 4xl:text-[26px]">{t('app.title')}</h1>
        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label={t('nav.pages')}>
          {[['tabletop', 'gamepad'], ['shop', 'bag'], ['leaderboard', 'trophy'], ...(auth?.isLoggedIn ? [['inventory', 'box']] : [])].map(([id, icon]) => (
            <button key={id} type="button" onClick={() => navigate(`/${id}`)} className="btn-quiet px-2.5 py-1.5 text-[13px] 4xl:px-3.5 4xl:text-[16px]">
              <DashIcon name={icon} className="h-4 w-4" />
              {t(`nav.${id}`)}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <SocialBar />
        <LanguageSwitcher variant="dark" />
        {auth?.isLoggedIn ? (
          <ProfileMenu auth={auth} onSwitchIdentity={auth.logout} />
        ) : (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => onAuth('login')} className="btn-quiet px-3 py-1.5 text-[13px]">{t('auth.login')}</button>
            <button type="button" onClick={() => onAuth('register')} className="btn-primary px-3 py-1.5 text-[13px]">{t('auth.register')}</button>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 3xl:max-w-[1500px] 4xl:max-w-[2100px] 4xl:px-10 5xl:max-w-[2800px]">
        <section className="mb-7 text-center 4xl:mb-12 4xl:mt-6">
          <h2 className="font-display text-[clamp(1.8rem,5vw,2.8rem)] font-black leading-tight text-parch 4xl:text-[4rem]">
            {t('menu.heading')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-parch/45 4xl:max-w-3xl 4xl:text-[18px]">
            {t('menu.subheading')}
          </p>
          {isGuest && (
            <p className="mx-auto mt-4 inline-flex max-w-xl items-center gap-2 rounded-full border border-brass/25 bg-brass/10 px-4 py-1.5 text-[12.5px] text-brass-light">
              <Icon.lock className="h-3.5 w-3.5" />
              {t('menu.guestNotice')}
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 4xl:gap-8">
          {games.map((game) => (
            <GameCard key={game.id} game={game} onPlay={onPlay} onConfigure={onConfigure} isGuest={isGuest} />
          ))}
        </section>

        {/* Board games played around one device. The teaser stays neutral:
            the 18+ descriptions live behind the age question. */}
        <section className="mt-8 4xl:mt-12">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[22px] font-black leading-tight text-parch 4xl:text-[30px]">{t('tabletop.section')}</h2>
            <span className="rounded-full bg-rent/85 px-2 py-0.5 text-[11px] font-black text-white">18+</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/tabletop')}
            className="group flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-felt-700/70 text-left shadow-glass backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-deep sm:flex-row"
          >
            <div className="relative h-32 w-full shrink-0 overflow-hidden sm:h-auto sm:w-64 4xl:w-96">
              <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
                <ChpokArt />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 p-4 4xl:p-6">
              <div>
                <p className="section-label">{t('tabletop.seriesTitle')}</p>
                <p className="mt-1 text-[13px] leading-snug text-parch/55 4xl:text-[16.5px]">{t('tabletop.menuTeaser')}</p>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {['chpok', 'chpok2'].map((id) => (
                  <li key={id} className="pill bg-white/[0.06] text-parch/75">{t(`menu.${id}.title`)}</li>
                ))}
              </ul>
              <span className="mt-auto inline-flex items-center gap-1.5 text-[14px] font-semibold text-brass-light 4xl:text-[17px]">
                {t('tabletop.open')}
                <Icon.chevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        </section>

        <section className="mx-auto mt-8 max-w-md 4xl:mt-12 4xl:max-w-xl">
          <div className="panel p-4">
            <p className="section-label mb-2">{t('menu.joinByCode')}</p>
            <form onSubmit={submitCode} className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder={t('landing.roomCodePlaceholder')}
                className="field flex-1 text-center font-mono text-[15px] font-bold tracking-[0.3em]"
              />
              <button type="submit" disabled={joining || code.trim().length < 4} className="btn-primary px-5">
                {joining ? t('landing.joiningRoom') : t('menu.join')}
              </button>
            </form>
            <p className="mt-2 text-[11.5px] leading-snug text-parch/35">{t('menu.joinHint')}</p>
            {joinError && <p className="mt-2 text-[12px] font-semibold text-rent-light">{joinError}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
