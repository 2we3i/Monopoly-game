// OverviewSection.jsx
// The admin's home page: people, games, lobbies and activity at a glance.

import { useTranslation } from '../../i18n/LanguageContext';
import { formatDate, formatDuration } from '../../lib/api';
import { useCitadelsConfig } from '../../hooks/useCitadels';
import {
  Badge, BarChart, Card, ErrorState, GAME_COLORS, HBarList, Spinner, StatCard, Table,
} from '../ui/dash';
import CitadelsStatsCard from '../ui/CitadelsStats';
import {
  gameName, modeName, resultTone,
} from '../ui/labels';
import SectionHeader from './SectionHeader';
import useAdminData from './useAdminData';

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(GAME_COLORS).map(([id, color]) => (
        <span key={id} className="flex items-center gap-1.5 text-[11.5px] text-zinc-400">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
          {gameName(t, id)}
        </span>
      ))}
    </div>
  );
}

export default function OverviewSection({ token }) {
  const { t, language } = useTranslation();
  const config = useCitadelsConfig();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/overview', token, 15000);

  if (!data) {
    return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;
  }

  const {
    users, guests, games, lobbies,
  } = data;
  const locale = language === 'ru' ? 'ru-RU' : 'en-GB';
  const perDay = data.perDay.map((d) => ({
    key: d.day,
    label: new Date(d.day).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
    total: d.total,
    parts: d.byGame,
  }));
  const popularity = data.popularity.map((m) => ({
    key: `${m.gameType}:${m.modeId}`,
    label: `${gameName(t, m.gameType)} · ${modeName(t, m.modeId)}`,
    value: m.matches,
    color: GAME_COLORS[m.gameType],
    sub: t('admin.chart.popularitySub', {
      finished: m.finished,
      players: (m.avgPlayers || 0).toFixed(1),
      duration: formatDuration(m.avgDurationMs, t),
    }),
  }));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t('admin.overview.people')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label={t('admin.stat.users')} value={users.total} hint={t('admin.stat.newThisWeek', { n: users.newThisWeek })} icon="users" />
        <StatCard label={t('admin.stat.activeUsers')} value={users.active} hint={t('admin.stat.activeHint')} icon="power" accent="#34d399" />
        <StatCard label={t('admin.stat.blocked')} value={users.blocked} icon="ban" accent="#f87171" />
        <StatCard label={t('admin.stat.guests')} value={guests.inRooms} hint={t('admin.stat.guestsHint', { n: guests.distinctAllTime })} icon="user" accent="#60a5fa" />
        <StatCard label={t('admin.stat.online')} value={data.playersOnline} hint={t('admin.stat.onlineHint', { n: users.online })} icon="gamepad" accent="#a78bfa" />
      </div>

      <SectionHeader title={t('admin.overview.games')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label={t('admin.stat.gamesTotal')} value={games.total} hint={t('admin.stat.gamesTotalHint')} icon="castle" />
        <StatCard label={t('admin.stat.gamesActive')} value={games.active} icon="power" accent="#34d399" />
        <StatCard label={t('admin.stat.gamesFinished')} value={games.finished} hint={t('admin.stat.gamesFinishedHint', { n: games.aborted })} icon="flag" accent="#60a5fa" />
        <StatCard label={t('admin.stat.lobbiesTotal')} value={lobbies.total} icon="grid" accent="#a78bfa" />
        <StatCard label={t('admin.stat.lobbiesActive')} value={lobbies.active} hint={t('admin.stat.lobbiesActiveHint', { n: lobbies.live })} icon="grid" accent="#fbbf24" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label={t('admin.stat.today')} value={games.today} icon="clock" />
        <StatCard label={t('admin.stat.week')} value={games.week} icon="clock" />
        <StatCard label={t('admin.stat.month')} value={games.month} icon="clock" />
        <StatCard label={t('admin.stat.avgPlayers')} value={(games.avgPlayers || 0).toFixed(1)} icon="users" accent="#60a5fa" />
        <StatCard label={t('admin.stat.avgDuration')} value={formatDuration(games.avgDurationMs, t)} icon="clock" accent="#a78bfa" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr,1fr]">
        <Card title={t('admin.chart.perDay')} subtitle={t('admin.chart.last30')} action={<Legend />}>
          <BarChart data={perDay} colors={GAME_COLORS} emptyText={t('admin.chart.empty')} />
        </Card>
        <Card title={t('admin.chart.popularity')} subtitle={t('admin.chart.popularityHint')}>
          <HBarList items={popularity} emptyText={t('admin.chart.empty')} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr,1fr]">
        <Card title={t('admin.recent.title')} bodyClass="p-0">
          <Table
            rowKey={(r) => r.id}
            rows={data.recentMatches}
            empty={t('admin.recent.empty')}
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
              { key: 'room', label: t('admin.col.code'), render: (r) => <span className="font-mono text-zinc-400">{r.roomCode}</span> },
              {
                key: 'players',
                label: t('admin.col.players'),
                render: (r) => (
                  <span className="text-zinc-400" title={r.players.map((p) => p.nickname).join(', ')}>
                    {r.playerCount} · {r.players.slice(0, 3).map((p) => p.nickname).join(', ')}{r.players.length > 3 ? '…' : ''}
                  </span>
                ),
              },
              { key: 'winner', label: t('admin.recent.winner'), render: (r) => r.winner || '—' },
              { key: 'started', label: t('stats.date'), render: (r) => formatDate(r.startedAt, language) },
              { key: 'duration', label: t('admin.stat.avgDuration'), align: 'right', render: (r) => (r.durationMs ? formatDuration(r.durationMs, t) : '—') },
              { key: 'status', label: t('admin.col.status'), render: (r) => <Badge tone={resultTone(null, r.status)}>{t(`result.${r.status}`)}</Badge> },
            ]}
          />
        </Card>
        <Card title={t('admin.audit.title')}>
          {data.audit.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-zinc-500">{t('admin.audit.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.audit.map((a) => (
                <li key={a.id} className="flex gap-2.5 text-[12.5px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brass-light" />
                  <div className="min-w-0">
                    <p className="text-zinc-200">
                      {t(`admin.audit.${a.action}`) === `admin.audit.${a.action}`
                        ? `${t(`creator.action.${a.action}`)} · ${a.targetLabel || a.details?.nickname || a.target || ''}`
                        : t(`admin.audit.${a.action}`, {
                          target: a.details?.nickname || a.target, status: a.details?.status ? t(`admin.modes.status.${a.details.status}`) : '',
                        })}
                    </p>
                    <p className="text-[11px] text-zinc-500">{a.adminName} · {formatDate(a.createdAt, language)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <CitadelsStatsCard stats={data.citadels} config={config} title={t('citadels.stats.globalTitle')} subtitle={t('citadels.stats.globalSubtitle')} />
    </div>
  );
}
