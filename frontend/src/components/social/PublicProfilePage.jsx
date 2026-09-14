// PublicProfilePage.jsx
// Another player's profile: how they look, how they play, where they
// rank, what they have won - and a button to write to them.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import {
  apiFetch, formatDate, formatDuration, percent,
} from '../../lib/api';
import { navigate } from '../../lib/router';
import PlatformShell from '../platform/PlatformShell';
import {
  Badge, Button, Card, DashIcon, ErrorState, GAME_COLORS, Spinner, StatCard, Table,
} from '../ui/dash';
import {
  BadgeStrip, StyledName, TitleTag, profileBackdropStyle, profileCardStyle, useLook,
} from '../../cosmetics/Cosmetics';
import UserAvatar from './UserAvatar';
import { gameName, modeName } from '../ui/labels';

export function ProfileHero({
  player, loadout, look, children, subtitle,
}) {
  const { t } = useTranslation();
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-white/[0.07] ${look.profileBg?.visual?.animated ? 'cos-gradient-anim cos-anim' : ''}`}
      style={{
        ...(look.profileBg ? profileBackdropStyle(look.profileBg) : { backgroundImage: 'linear-gradient(135deg,#1b1710,#131418 55%,#121418)' }),
        ...profileCardStyle(look.profileCard),
      }}
    >
      {look.profileCard?.visual?.corners && (
        <>
          <span className="pointer-events-none absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2" style={{ borderColor: look.profileCard.visual.accent }} />
          <span className="pointer-events-none absolute right-2 top-2 h-5 w-5 border-r-2 border-t-2" style={{ borderColor: look.profileCard.visual.accent }} />
          <span className="pointer-events-none absolute bottom-2 left-2 h-5 w-5 border-b-2 border-l-2" style={{ borderColor: look.profileCard.visual.accent }} />
          <span className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2" style={{ borderColor: look.profileCard.visual.accent }} />
        </>
      )}
      <div className="relative flex flex-wrap items-center gap-4 bg-black/10 p-5 4xl:gap-6 4xl:p-8">
        <UserAvatar user={{ ...player, cosmetics: loadout }} look={look} size="xl" online={player.online ?? null} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-zinc-50 4xl:text-[36px]">
            <StyledName nickname={player.nickname} look={look} intro />
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {look.title && <TitleTag item={look.title} size="md" />}
            <BadgeStrip items={look.badges} size="sm" />
            {player.role === 'admin' && <Badge tone="amber">{t('admin.roleAdmin')}</Badge>}
          </div>
          {subtitle && <p className="mt-1.5 text-[12.5px] text-zinc-400 4xl:text-[15px]">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function WinsTable({ rows }) {
  const { t, language } = useTranslation();
  return (
    <Table
      rowKey={(r) => r.matchId}
      empty={t('profile.winsEmpty')}
      rows={rows}
      columns={[
        {
          key: 'game',
          label: t('stats.game'),
          render: (r) => (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAME_COLORS[r.gameType] }} />
              <span className="text-zinc-100">{gameName(t, r.gameType)}</span>
              <span className="text-zinc-500">{modeName(t, r.modeId)}</span>
            </span>
          ),
        },
        { key: 'date', label: t('profile.wonAt'), render: (r) => formatDate(r.endedAt, language) },
        { key: 'players', label: t('stats.players'), align: 'right', render: (r) => r.playerCount },
        { key: 'place', label: t('profile.place'), render: (r) => <Badge tone="green">{r.place ? t(`place.${r.place}`) : t('result.win')}</Badge> },
      ]}
    />
  );
}

export default function PublicProfilePage({ auth, userId }) {
  const { t, language } = useTranslation();
  const social = useSocial();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const look = useLook(data?.loadout);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    apiFetch(`/api/social/users/${encodeURIComponent(userId)}`).then(setData).catch(setError);
  }, [userId]);

  useEffect(() => {
    if (userId && userId === social.myId) {
      navigate('/profile');
      return;
    }
    load();
  }, [userId, social.myId, load]);

  return (
    <PlatformShell auth={auth} active={null}>
      {error && <ErrorState error={error} onRetry={load} retryLabel={t('common.retry')} />}
      {!data && !error && <Spinner block />}
      {data && (
        <div className="flex flex-col gap-4 4xl:gap-6">
          <ProfileHero
            player={data.player}
            loadout={data.loadout}
            look={look}
            subtitle={`${t('profile.memberSince', { date: formatDate(data.player.createdAt, language, false) })} · ${data.player.online ? t('social.online') : t('social.offline')}`}
          >
            {social.enabled && !data.player.blocked && (
              <Button tone="primary" icon="mail" onClick={() => social.openMessenger({ recipientIds: [data.player.id] })}>{t('social.message')}</Button>
            )}
          </ProfileHero>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 4xl:gap-4">
            <StatCard label={t('stats.played')} value={data.stats.played} icon="gamepad" />
            <StatCard label={t('stats.wins')} value={data.stats.wins} icon="trophy" accent="#34d399" />
            <StatCard label={t('stats.winRate')} value={percent(data.stats.winRate)} icon="chart" accent="#60a5fa" />
            <StatCard label={t('stats.timePlayed')} value={formatDuration(data.stats.timeMs, t)} icon="clock" accent="#a78bfa" />
            <StatCard label={t('leaderboard.season')} value={data.ranks.season ? `#${data.ranks.season.rank}` : '—'} icon="arrowUp" accent="#fbbf24" hint={data.ranks.season ? t('leaderboard.pointsN', { n: data.ranks.season.points }) : t('leaderboard.unranked')} />
            <StatCard label={t('profile.bestStreak')} value={data.streak.best} icon="flame" accent="#fb923c" hint={t('profile.streak', { n: data.streak.current })} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr] 4xl:gap-6">
            <Card title={t('profile.victories')} bodyClass="p-0"><WinsTable rows={data.recentWins} /></Card>
            <Card title={t('profile.achievements')}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.achievements.map((a) => (
                  <li key={a.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${a.unlocked ? 'border-brass/30 bg-brass/[0.06]' : 'border-white/[0.06] opacity-60'}`}>
                    <DashIcon name={a.unlocked ? 'trophy' : 'lock'} className={`h-4 w-4 shrink-0 ${a.unlocked ? 'text-brass-light' : 'text-zinc-600'}`} />
                    <span className="truncate text-[12.5px] text-zinc-200 4xl:text-[14.5px]">{t(`achievement.${a.id}.title`)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </PlatformShell>
  );
}
