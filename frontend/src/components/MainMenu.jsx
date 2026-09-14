// MainMenu.jsx
// The platform's front door. Everything below this screen is one game or
// another; this screen only answers "which game, and how do I get into a
// room". Games are listed from data rather than hard-coded markup, so a
// third mode is a new entry, not a new layout.

import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';
import ProfileMenu from './ProfileMenu';
import Icon from './icons';

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

const GAME_ART = { monopoly: MonopolyArt, mafia: MafiaArt };

function GameCard({ game, onPlay, onConfigure }) {
  const { t } = useTranslation();
  const Art = GAME_ART[game.id] || MonopolyArt;
  const accent = game.id === 'mafia' ? 'from-rent/25 to-transparent' : 'from-brass/25 to-transparent';

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-felt-700/70 shadow-glass backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-deep">
      <div className="relative h-36 w-full overflow-hidden sm:h-44">
        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
          <Art />
        </div>
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t ${accent}`} />
        <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold text-parch backdrop-blur-sm">
          {game.emoji} {t(`menu.${game.id}.badge`)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="font-display text-[22px] font-black leading-tight text-parch">{t(`menu.${game.id}.title`)}</h2>
          <p className="mt-1 text-[13px] leading-snug text-parch/50">{t(`menu.${game.id}.description`)}</p>
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
          <button type="button" onClick={() => onPlay(game)} className="btn-primary flex-1 py-3 text-[15px]">
            <Icon.chevronRight className="h-4 w-4" />
            {t('menu.play')}
          </button>
          <button
            type="button"
            onClick={() => onConfigure(game)}
            title={t('menu.configure')}
            aria-label={t('menu.configure')}
            className="btn-ghost px-3 py-3"
          >
            <Icon.settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function MainMenu({ auth, onPlay, onConfigure, onJoinCode, joinError, joining }) {
  const { t } = useTranslation();
  const [games, setGames] = useState([
    { id: 'monopoly', emoji: '🎲', minPlayers: 2, maxPlayers: 10 },
    { id: 'mafia', emoji: '🔪', minPlayers: 4, maxPlayers: 15 },
  ]);
  const [code, setCode] = useState('');

  // The catalogue is authoritative on the server; the list above is only
  // what to render before the first response arrives.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/games')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.games) return;
        const emoji = { monopoly: '🎲', mafia: '🔪' };
        setGames(data.games.map((g) => ({ ...g, emoji: emoji[g.id] || '🎮' })));
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
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brass-light to-brass-deep text-ink shadow-lift">
          <Icon.crown className="h-5 w-5" />
        </span>
        <h1 className="font-display text-[19px] font-black tracking-tight text-parch">{t('app.title')}</h1>
        <div className="flex-1" />
        <LanguageSwitcher variant="dark" />
        {auth?.isLoggedIn && <ProfileMenu auth={auth} />}
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16">
        <section className="mb-8 text-center">
          <h2 className="font-display text-[clamp(1.8rem,5vw,2.8rem)] font-black leading-tight text-parch">
            {t('menu.heading')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-parch/45">
            {t('menu.subheading')}
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {games.map((game) => (
            <GameCard key={game.id} game={game} onPlay={onPlay} onConfigure={onConfigure} />
          ))}
        </section>

        <section className="mx-auto mt-8 max-w-md">
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
