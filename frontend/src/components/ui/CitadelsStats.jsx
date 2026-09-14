// CitadelsStats.jsx
// Citadels numbers - for one player on their profile, for everyone in the
// admin panel. Same shape from the server either way.

import { useTranslation } from '../../i18n/LanguageContext';
import { formatDuration, percent } from '../../lib/api';
import {
  Card, StatCard, Table, ProgressBar,
} from './dash';
import { citadelsRoleName } from './labels';
import { ROLE_GLYPH } from '../citadels/citadelsArt';

export default function CitadelsStatsCard({ stats, config, title, subtitle }) {
  const { t, language } = useTranslation();
  if (!stats) return null;
  const roles = [...(stats.roles || [])].sort((a, b) => b.picks - a.picks);

  return (
    <Card title={title} subtitle={subtitle} bodyClass="p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t('citadels.stats.played')} value={stats.played} hint={t('citadels.stats.finishedHint', { n: stats.finished })} icon="castle" accent="#a57ae0" />
        {stats.scope === 'global' ? (
          <StatCard label={t('citadels.stats.finishedGames')} value={stats.finished} hint={t('citadels.stats.unfinishedHint', { n: stats.played - stats.finished })} icon="flag" accent="#34d399" />
        ) : (
          <StatCard label={t('citadels.stats.wins')} value={stats.wins} hint={t('citadels.stats.lossesHint', { n: stats.losses, rate: percent(stats.winRate) })} icon="trophy" accent="#34d399" />
        )}
        <StatCard label={t('citadels.stats.avgDuration')} value={formatDuration(stats.avgDurationMs, t)} hint={t('citadels.stats.avgPlayersHint', { n: (stats.avgPlayers || 0).toFixed(1) })} icon="clock" accent="#60a5fa" />
        <StatCard
          label={t('citadels.stats.popularRole')}
          value={stats.mostPopularRole ? `${ROLE_GLYPH[stats.mostPopularRole.role] || ''} ${citadelsRoleName(config, stats.mostPopularRole.role, language)}` : '—'}
          hint={stats.mostPopularRole ? t('citadels.stats.picks', { n: stats.mostPopularRole.picks }) : null}
          icon="star"
        />
        <StatCard label={t('citadels.stats.avgBuildings')} value={(stats.avgBuildings || 0).toFixed(1)} icon="castle" accent="#d4a52c" />
        <StatCard label={t('citadels.stats.avgGold')} value={(stats.avgGoldEarned || 0).toFixed(1)} icon="coin" accent="#d4a52c" />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06]">
        <Table
          rowKey={(r) => r.role}
          empty={t('citadels.stats.noRoles')}
          rows={roles}
          columns={[
            {
              key: 'role',
              label: t('citadels.stats.role'),
              render: (r) => <span className="text-zinc-100">{ROLE_GLYPH[r.role]} {citadelsRoleName(config, r.role, language)}</span>,
            },
            { key: 'picks', label: t('citadels.stats.pickCount'), align: 'right' },
            { key: 'games', label: t('citadels.stats.gamesWithRole'), align: 'right' },
            { key: 'wins', label: t('citadels.stats.wins'), align: 'right' },
            {
              key: 'winRate',
              label: t('citadels.stats.roleWinRate'),
              render: (r) => (
                <div className="flex min-w-[120px] items-center gap-2">
                  <div className="flex-1"><ProgressBar value={r.winRate} color="#34d399" /></div>
                  <span className="w-9 text-right text-[11.5px] text-zinc-400 tnum">{percent(r.winRate)}</span>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
}
