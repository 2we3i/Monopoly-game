// TabletopPage.jsx
// The board-games section: games a group plays around one shared device
// instead of in an online room. The Iron Throne strategy game is open to
// everyone; both ЧПОК boxes are rated 18+, so nothing of theirs - not even
// the game descriptions - renders before the visitor confirms their age
// for this browser session.

import { lazy, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { navigate } from '../../lib/router';
import PlatformShell from '../platform/PlatformShell';
import { GameCard } from '../MainMenu';
import { DashIcon } from '../ui/dash';
import AgeGate, { confirmAge, isAgeConfirmed } from './AgeGate';
import ChpokGame from './chpok/ChpokGame';
import { GAMES, MAX_PLAYERS, MIN_PLAYERS } from './chpok/engine';

// The strategy game carries the map of Westeros, so it loads on demand.
const ThroneGame = lazy(() => import('./throne/ThroneGame'));

const THRONE_SLUG = 'iron-throne';
const THRONE = { id: 'throne', minPlayers: 2, maxPlayers: 6 };

// Two versions of one series, in box order.
const SERIES = ['chpok', 'chpok2'].map((id) => ({ id, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS }));

function gameFromPath(pathname) {
  const slug = pathname.split('/')[2];
  return Object.values(GAMES).find((game) => game.slug === slug)?.id || null;
}

export default function TabletopPage({ auth, pathname, onPlayOnline, creating = false }) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(isAgeConfirmed);
  const [asking, setAsking] = useState(false);
  const gameId = gameFromPath(pathname);

  if (pathname.split('/')[2] === THRONE_SLUG) return <ThroneGame />;

  if (gameId && !confirmed) {
    return (
      <PlatformShell auth={auth}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#121418] px-6 py-12 text-center">
          <DashIcon name="lock" className="h-9 w-9 text-zinc-500" />
          <p className="text-[14px] text-zinc-300 4xl:text-[16px]">{t('tabletop.age.locked')}</p>
        </div>
        <AgeGate
          onConfirm={() => { confirmAge(); setConfirmed(true); }}
          onDecline={() => navigate('/')}
        />
      </PlatformShell>
    );
  }

  if (gameId) return <ChpokGame key={gameId} gameId={gameId} />;

  return (
    <PlatformShell auth={auth}>
      <section className="mb-6 4xl:mb-10">
        <p className="section-label">{t('tabletop.section')}</p>
        <h1 className="mt-1 font-display text-[clamp(1.7rem,4.5vw,2.5rem)] font-black leading-tight text-parch 4xl:text-[3.2rem]">{t('tabletop.strategyTitle')}</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-parch/55 4xl:max-w-3xl 4xl:text-[17px]">{t('tabletop.strategyText')}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 4xl:gap-8">
        <GameCard game={THRONE} onPlay={() => navigate(`/tabletop/${THRONE_SLUG}`)} />
      </section>

      <section className="mb-6 mt-10 4xl:mb-10 4xl:mt-14">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-[clamp(1.5rem,4vw,2.2rem)] font-black leading-tight text-parch 4xl:text-[2.8rem]">{t('tabletop.seriesTitle')}</h2>
          <span className="rounded-full bg-rent/85 px-2.5 py-1 text-[11px] font-black text-white">18+</span>
        </div>
        {confirmed && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-parch/55 4xl:max-w-3xl 4xl:text-[17px]">{t('tabletop.seriesText')}</p>}
      </section>

      {confirmed ? (
        <>
          {/* One box, two ways to play it: around a single screen, or with
              a phone each. The online room is the same decks, dealt by the
              server, with the answers written and voted on from phones. */}
          {onPlayOnline && (
            <section className="mb-4 flex flex-col items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] px-5 py-5 sm:flex-row sm:items-center 4xl:mb-8">
              <DashIcon name="gamepad" className="h-8 w-8 shrink-0 text-rose-300" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-parch 4xl:text-[18px]">{t('chpok.onlineTitle')}</h3>
                <p className="mt-0.5 text-[13px] leading-snug text-parch/55 4xl:text-[15px]">{t('chpok.onlineText')}</p>
              </div>
              <button type="button" onClick={onPlayOnline} disabled={creating} className="btn-primary shrink-0 px-5 py-3 text-[14px]">
                {creating ? t('landing.creatingRoom') : t('chpok.onlineStart')}
              </button>
            </section>
          )}
          <section className="grid gap-4 md:grid-cols-2 4xl:gap-8">
            {SERIES.map((game) => (
              <GameCard key={game.id} game={game} onPlay={() => navigate(`/tabletop/${GAMES[game.id].slug}`)} />
            ))}
          </section>
        </>
      ) : (
        <div className="flex max-w-2xl flex-col items-start gap-3 rounded-2xl border border-white/[0.07] bg-[#121418] px-5 py-5 sm:flex-row sm:items-center">
          <DashIcon name="lock" className="h-7 w-7 shrink-0 text-zinc-500" />
          <p className="flex-1 text-[14px] text-zinc-300 4xl:text-[16px]">{t('tabletop.chpokLocked')}</p>
          <button type="button" onClick={() => setAsking(true)} className="btn-ghost shrink-0 px-4 py-2">{t('tabletop.chpokUnlock')}</button>
        </div>
      )}

      <p className="mt-5 flex items-center gap-2 text-[12.5px] text-zinc-500 4xl:text-[14px]">
        <DashIcon name="users" className="h-4 w-4 shrink-0" />
        {t('tabletop.localHint')}
      </p>

      {asking && !confirmed && (
        <AgeGate
          onConfirm={() => { confirmAge(); setConfirmed(true); setAsking(false); }}
          onDecline={() => setAsking(false)}
        />
      )}
    </PlatformShell>
  );
}
