// TabletopPage.jsx
// The board-games section: party games a group plays around one shared
// device instead of in an online room. Both ЧПОК boxes are rated 18+, so
// nothing in here - not even the game descriptions - renders before the
// visitor confirms their age for this browser session.

import { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { navigate } from '../../lib/router';
import PlatformShell from '../platform/PlatformShell';
import { GameCard } from '../MainMenu';
import { DashIcon } from '../ui/dash';
import AgeGate, { confirmAge, isAgeConfirmed } from './AgeGate';
import ChpokGame from './chpok/ChpokGame';
import { GAMES, MAX_PLAYERS, MIN_PLAYERS } from './chpok/engine';

// Two versions of one series, in box order.
const SERIES = ['chpok', 'chpok2'].map((id) => ({ id, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS }));

function gameFromPath(pathname) {
  const slug = pathname.split('/')[2];
  return Object.values(GAMES).find((game) => game.slug === slug)?.id || null;
}

export default function TabletopPage({ auth, pathname }) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(isAgeConfirmed);
  const gameId = gameFromPath(pathname);

  if (!confirmed) {
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
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[clamp(1.7rem,4.5vw,2.5rem)] font-black leading-tight text-parch 4xl:text-[3.2rem]">{t('tabletop.seriesTitle')}</h1>
          <span className="rounded-full bg-rent/85 px-2.5 py-1 text-[11px] font-black text-white">18+</span>
        </div>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-parch/55 4xl:max-w-3xl 4xl:text-[17px]">{t('tabletop.seriesText')}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 4xl:gap-8">
        {SERIES.map((game) => (
          <GameCard key={game.id} game={game} onPlay={() => navigate(`/tabletop/${GAMES[game.id].slug}`)} />
        ))}
      </section>

      <p className="mt-5 flex items-center gap-2 text-[12.5px] text-zinc-500 4xl:text-[14px]">
        <DashIcon name="users" className="h-4 w-4 shrink-0" />
        {t('tabletop.localHint')}
      </p>
    </PlatformShell>
  );
}
