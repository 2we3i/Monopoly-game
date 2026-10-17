// StatsSection.jsx
// Platform statistics in depth: games per day by game, registrations,
// mode popularity, the economy, errors by game and the most active players.

import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDuration, percent } from '../../../lib/api';
import { itemName, useCatalog } from '../../../lib/catalog';
import {
  BarChart, Card, ErrorState, GAME_COLORS, HBarList, Spinner, StatCard, Table,
} from '../../ui/dash';
import { gameName, modeName } from '../../ui/labels';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';

export default function StatsSection({ token }) {
  const { t, language } = useTranslation();
  const catalog = useCatalog();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/stats', token, 60000);
  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  const locale = language === 'ru' ? 'ru-RU' : 'en-GB';
  const perDay = data.perDay.map((d) => ({
    key: d.day, label: new Date(d.day).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }), total: d.total, parts: d.byGame,
  }));
  const registrations = data.registrations.map((d) => ({
    key: d.day, label: new Date(d.day).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }), total: d.total, parts: { users: d.total },
  }));
  const { totals, economy } = data;
  const errorsTotal = Object.values(data.errors).reduce((n, v) => n + v, 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.stats.title')} subtitle={t('creator.stats.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label={t('admin.stat.users')} value={data.roles.users} icon="users" />
        <StatCard label={t('admin.stat.online')} value={data.online} icon="power" accent="#34d399" />
        <StatCard label={t('creator.stats.staff')} value={data.roles.creators + data.roles.admins} hint={t('creator.stats.staffHint', { c: data.roles.creators, a: data.roles.admins })} icon="shield" accent="#a78bfa" />
        <StatCard label={t('admin.stat.blocked')} value={data.roles.blocked} icon="ban" accent="#f87171" />
        <StatCard label={t('admin.stat.gamesTotal')} value={totals.matchesTotal} icon="castle" />
        <StatCard label={t('admin.stat.avgDuration')} value={formatDuration(totals.avgDurationMs, t)} icon="clock" accent="#60a5fa" />
        <StatCard label={t('creator.economy.circulation')} value={economy.circulation.toLocaleString()} icon="coin" />
        <StatCard label={t('creator.stats.errors7d')} value={errorsTotal} icon="flag" accent="#f87171" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title={t('admin.chart.perDay')} subtitle={t('admin.chart.last30')}>
          <BarChart data={perDay} colors={GAME_COLORS} emptyText={t('admin.chart.empty')} />
        </Card>
        <Card title={t('creator.stats.registrations')} subtitle={t('admin.chart.last30')}>
          <BarChart data={registrations} colors={{ users: '#a78bfa' }} emptyText={t('admin.chart.empty')} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title={t('admin.chart.popularity')}>
          <HBarList
            items={data.popularity.map((m) => ({
              key: `${m.gameType}:${m.modeId}`, label: `${gameName(t, m.gameType)} · ${modeName(t, m.modeId)}`, value: m.matches, color: GAME_COLORS[m.gameType], sub: `${m.finished} · ${(m.avgPlayers || 0).toFixed(1)} · ${formatDuration(m.avgDurationMs, t)}`,
            }))}
            emptyText={t('admin.chart.empty')}
          />
        </Card>
        <Card title={t('creator.economy.topItems')}>
          <HBarList
            items={economy.topItems.map((i) => ({
              key: i.itemId, label: catalog ? itemName(catalog.byId.get(i.itemId), language) || i.itemId : i.itemId, value: i.n, color: '#f472b6',
            }))}
            emptyText={t('admin.chart.empty')}
          />
        </Card>
        <Card title={t('creator.stats.errorsByGame')}>
          <HBarList
            items={Object.entries(data.errors).map(([game, n]) => ({
              key: game || 'other', label: game ? gameName(t, game) : t('creator.stats.platform'), value: n, color: GAME_COLORS[game] || '#f87171',
            }))}
            emptyText={t('creator.errors.empty')}
          />
        </Card>
      </div>

      <Card title={t('creator.stats.topPlayers')} bodyClass="p-0">
        <Table
          rowKey={(p) => p.id}
          rows={data.topPlayers}
          empty={t('admin.users.empty')}
          columns={[
            { key: 'nickname', label: t('admin.col.user'), render: (p) => <span className="text-zinc-100">{p.nickname}</span> },
            { key: 'played', label: t('admin.col.played'), align: 'right', render: (p) => p.played || 0 },
            { key: 'wins', label: t('admin.col.wins'), align: 'right', render: (p) => p.wins || 0 },
            { key: 'rate', label: t('admin.col.winRate'), align: 'right', render: (p) => percent(p.winRate || 0) },
            { key: 'time', label: t('admin.col.time'), align: 'right', render: (p) => formatDuration(p.timeMs || 0, t) },
          ]}
        />
      </Card>
    </div>
  );
}
