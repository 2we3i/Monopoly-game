// ProfilePage.jsx
// A registered player's own page: who they are, how they play, and what
// they have played recently. Every number comes from the server's match
// history (GET /api/auth/me/stats); nothing here is counted in the client.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  apiFetch, formatDate, formatDuration, percent,
} from '../../lib/api';
import { navigate } from '../../lib/router';
import { useCitadelsConfig } from '../../hooks/useCitadels';
import LanguageSwitcher from '../LanguageSwitcher';
import {
  Badge, Button, Card, CopyButton, DashIcon, ErrorState, GAME_COLORS, ProgressBar, Spinner, StatCard, Table,
} from '../ui/dash';
import CitadelsStatsCard from '../ui/CitadelsStats';
import {
  citadelsRoleName, gameName, modeName, resultTone,
} from '../ui/labels';

const GAMES = ['monopoly', 'mafia', 'citadels'];
const ACHIEVEMENT_ICON = {
  FIRST_GAME: 'gamepad',
  FIRST_WIN: 'trophy',
  HOST: 'flag',
  VETERAN: 'shield',
  CHAMPION: 'star',
  ALL_GAMES: 'grid',
  CITADEL_LORD: 'castle',
  MASTER_BUILDER: 'castle',
};

function Shell({ auth, children }) {
  const { t } = useTranslation();
  return (
    <div className="dash-bg min-h-screen text-zinc-200">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0a0b0d]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Button tone="subtle" icon="arrowLeft" onClick={() => navigate('/')}>{t('menu.backToMenu')}</Button>
          <h1 className="flex-1 text-[15px] font-semibold text-zinc-100">{t('profile.title')}</h1>
          {auth.isAdmin && <Button icon="shield" onClick={() => navigate('/admin')}>{t('admin.open')}</Button>}
          <LanguageSwitcher variant="dark" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function resultLabel(t, row) {
  if (row.result) return t(`result.${row.result}`);
  return t(`result.${row.status}`);
}

export default function ProfilePage({ auth }) {
  const { t, language } = useTranslation();
  const config = useCitadelsConfig();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    apiFetch('/api/auth/me/stats', { token: auth.token }).then(setData).catch(setError);
  }, [auth.token]);

  useEffect(() => {
    if (auth.token) load();
  }, [auth.token, load]);

  if (!auth.isLoggedIn) {
    return (
      <Shell auth={auth}>
        <Card>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <DashIcon name="user" className="h-9 w-9 text-zinc-500" />
            <p className="max-w-sm text-[14px] text-zinc-300">{t('profile.loginRequired')}</p>
            <Button tone="primary" onClick={() => navigate('/')}>{t('menu.backToMenu')}</Button>
          </div>
        </Card>
      </Shell>
    );
  }
  if (error) return <Shell auth={auth}><ErrorState error={error} onRetry={load} retryLabel={t('common.retry')} /></Shell>;
  if (!data) return <Shell auth={auth}><Spinner block /></Shell>;

  const {
    account, stats, citadels, achievements,
  } = data;
  const unlocked = achievements.filter((a) => a.unlocked).length;

  const roleOf = (row) => {
    if (!row.role) return row.gameType === 'monopoly' && row.score != null ? t('profile.money', { n: row.score }) : '—';
    if (row.gameType === 'citadels') return citadelsRoleName(config, row.role, language);
    return t(`mafia.role.${row.role}`);
  };

  return (
    <Shell auth={auth}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#1b1710] via-[#131418] to-[#121418] p-5">
          {account.avatarPath ? (
            <img src={account.avatarPath} alt="" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/10" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brass/20 font-display text-[28px] font-black text-brass-light">
              {account.nickname.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[24px] font-semibold tracking-tight text-zinc-50">{account.nickname}</h2>
              {account.role === 'admin' && <Badge tone="amber">{t('admin.roleAdmin')}</Badge>}
            </div>
            <p className="mt-1 text-[12.5px] text-zinc-400">{t('profile.memberSince', { date: formatDate(account.createdAt, language, false) })}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[11.5px] text-zinc-500">
              ID <span className="font-mono text-zinc-400">{account.id}</span>
              <CopyButton text={account.id} label={t('common.copy')} copiedLabel={t('common.copied')} />
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
            <DashIcon name="trophy" className="h-5 w-5 text-brass-light" />
            <div>
              <p className="text-[18px] font-semibold leading-none text-zinc-50 tnum">{unlocked}/{achievements.length}</p>
              <p className="text-[11px] text-zinc-500">{t('profile.achievements')}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label={t('stats.played')} value={stats.played} icon="gamepad" hint={t('stats.finishedHint', { finished: stats.finished, unfinished: stats.unfinished })} />
          <StatCard label={t('stats.wins')} value={stats.wins} icon="trophy" accent="#34d399" />
          <StatCard label={t('stats.losses')} value={stats.losses} icon="flag" accent="#f87171" />
          <StatCard label={t('stats.winRate')} value={percent(stats.winRate)} icon="chart" accent="#60a5fa" />
          <StatCard label={t('stats.timePlayed')} value={formatDuration(stats.timeMs, t)} icon="clock" accent="#a78bfa" />
          <StatCard label={t('stats.created')} value={stats.created} icon="castle" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
          <Card title={t('profile.byGame')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.id}
              empty=""
              rows={GAMES.map((id) => ({
                id, played: 0, wins: 0, losses: 0, finished: 0, timeMs: 0, ...(stats.byGame[id] || {}),
              }))}
              columns={[
                {
                  key: 'id',
                  label: t('stats.game'),
                  render: (r) => (
                    <span className="flex items-center gap-2 text-zinc-100">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAME_COLORS[r.id] }} />
                      {gameName(t, r.id)}
                    </span>
                  ),
                },
                { key: 'played', label: t('stats.played'), align: 'right' },
                { key: 'wins', label: t('stats.wins'), align: 'right' },
                { key: 'losses', label: t('stats.losses'), align: 'right' },
                { key: 'rate', label: t('stats.winRate'), align: 'right', render: (r) => percent(r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0) },
                { key: 'time', label: t('stats.timePlayed'), align: 'right', render: (r) => formatDuration(r.timeMs, t) },
              ]}
            />
          </Card>
          <Card title={t('profile.favourite')}>
            {stats.favouriteMode ? (
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${GAME_COLORS[stats.favouriteMode.gameType]}22`, color: GAME_COLORS[stats.favouriteMode.gameType] }}>
                  <DashIcon name="star" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[16px] font-semibold text-zinc-100">{gameName(t, stats.favouriteMode.gameType)}</p>
                  <p className="text-[12px] text-zinc-500">{modeName(t, stats.favouriteMode.modeId)} · {t('profile.timesPlayed', { n: stats.favouriteMode.count })}</p>
                </div>
              </div>
            ) : <p className="py-4 text-center text-[12.5px] text-zinc-500">{t('profile.favouriteNone')}</p>}
            <div className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex justify-between"><span className="text-zinc-500">{t('stats.finished')}</span><span className="text-zinc-200 tnum">{stats.finished}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">{t('stats.unfinished')}</span><span className="text-zinc-200 tnum">{stats.unfinished}</span></div>
            </div>
          </Card>
        </div>

        <CitadelsStatsCard stats={citadels} config={config} title={t('citadels.stats.myTitle')} subtitle={t('citadels.stats.mySubtitle')} />

        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
          <Card title={t('profile.recent')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.matchId}
              empty={t('profile.recentEmpty')}
              rows={stats.recent}
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
                { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.startedAt, language) },
                { key: 'players', label: t('stats.players'), align: 'right', render: (r) => r.playerCount },
                { key: 'role', label: t('stats.details'), render: roleOf },
                { key: 'result', label: t('stats.result'), render: (r) => <Badge tone={resultTone(r.result, r.status)}>{resultLabel(t, r)}</Badge> },
              ]}
            />
          </Card>

          <Card title={t('profile.achievements')} subtitle={t('profile.achievementsHint')}>
            <ul className="flex flex-col gap-3">
              {achievements.map((a) => (
                <li key={a.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${a.unlocked ? 'border-brass/30 bg-brass/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.unlocked ? 'bg-brass/20 text-brass-light' : 'bg-white/[0.05] text-zinc-600'}`}>
                    <DashIcon name={ACHIEVEMENT_ICON[a.id] || 'star'} className="h-4.5 h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate text-[13px] font-semibold ${a.unlocked ? 'text-zinc-100' : 'text-zinc-400'}`}>{t(`achievement.${a.id}.title`)}</p>
                      {a.unlocked && <Badge tone="amber">{t('achievement.unlocked')}</Badge>}
                    </div>
                    <p className="text-[11.5px] text-zinc-500">{t(`achievement.${a.id}.desc`, { target: a.target })}</p>
                    {!a.unlocked && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1"><ProgressBar value={a.current} max={a.target} /></div>
                        <span className="text-[10.5px] text-zinc-500 tnum">{a.current}/{a.target}</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
