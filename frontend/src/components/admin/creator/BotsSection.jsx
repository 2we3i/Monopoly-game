// BotsSection.jsx
// The platform's bots: the automatic moves the server makes when a player
// runs out of time or drops out (their timers are part of each mode's
// settings), and the bots that play whole games in test runs. Each mode's
// timers and bot parameters open in the mode constructor.

import { useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import {
  Badge, Button, Card, ErrorState, GAME_COLORS, Spinner, Table,
} from '../../ui/dash';
import { gameName } from '../../ui/labels';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import { formatValue, localizedText } from '../kit';
import ModeEditor from './ModeEditor';

export default function BotsSection({ token }) {
  const { t, language } = useTranslation();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/bots', token);
  const [editing, setEditing] = useState(null);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.bots.title')} subtitle={t('creator.bots.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        {data.modes.map((mode) => (
          <section key={mode.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#121418] p-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GAME_COLORS[mode.gameId] }} />
              <p className="flex-1 truncate text-[14px] font-semibold text-zinc-100">{gameName(t, mode.gameId)} · {localizedText(mode.label, language)}</p>
              <Badge tone="blue">v{mode.version}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={mode.simulator ? 'green' : 'zinc'}>{mode.simulator ? t('creator.bots.simulatorYes') : t('creator.bots.simulatorNo')}</Badge>
              <Badge tone="violet">{t(`creator.bots.kind.${mode.gameId}`)}</Badge>
            </div>
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {mode.bots?.disconnectGraceSec != null && (
                <li className="flex justify-between gap-2"><span className="text-zinc-400">{t('creator.bots.disconnectGrace')}</span><span className="text-zinc-100 tnum">{mode.bots.disconnectGraceSec} s</span></li>
              )}
              {mode.timers.map((timer) => (
                <li key={timer.path} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-[11.5px] text-zinc-400">{timer.path}</span>
                  <span className="flex items-center gap-1 text-zinc-100 tnum">
                    {formatValue(timer.value)}
                    {timer.locked && <Badge tone="amber">{t('creator.mode.locked')}</Badge>}
                  </span>
                </li>
              ))}
              {!mode.timers.length && mode.bots?.disconnectGraceSec == null && <li className="text-zinc-500">{t('creator.bots.noTimers')}</li>}
            </ul>
            <div className="mt-auto pt-1">
              <Button icon="palette" onClick={() => setEditing(mode.id)}>{t('creator.bots.configure')}</Button>
            </div>
          </section>
        ))}
      </div>

      <Card title={t('creator.bots.recentRuns')} bodyClass="p-0">
        <Table
          rowKey={(r) => r.id}
          rows={data.runs}
          empty={t('creator.test.noRuns')}
          columns={[
            { key: 'mode', label: t('admin.lobby.mode'), render: (r) => <span className="font-mono">{r.modeId}</span> },
            { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.createdAt, language) },
            { key: 'status', label: t('admin.col.status'), render: (r) => <Badge tone={{ passed: 'green', warning: 'amber', failed: 'red' }[r.status] || 'zinc'}>{t(`creator.test.status.${r.status}`)}</Badge> },
            { key: 'games', label: t('creator.test.finished'), align: 'right', render: (r) => (r.result ? `${r.result.finished}/${r.result.played}` : '—') },
            { key: 'steps', label: t('creator.test.avgSteps'), align: 'right', render: (r) => r.result?.avgSteps ?? '—' },
          ]}
        />
      </Card>

      {editing && <ModeEditor modeId={editing} initialTab="bots" onClose={() => { setEditing(null); reload(); }} onSaved={reload} />}
    </div>
  );
}
