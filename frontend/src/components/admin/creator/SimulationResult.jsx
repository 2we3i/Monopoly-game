// SimulationResult.jsx
// What a test run of a mode found: finished games, errors with their
// stack, steps, time, winners and invariant checks.

import { useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { Badge, StatCard, Table } from '../../ui/dash';

const STATUS_TONE = { passed: 'green', warning: 'amber', failed: 'red' };

export default function SimulationResult({ result }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(null);
  if (!result) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[result.status]} dot>{t(`creator.test.status.${result.status}`)}</Badge>
        <span className="text-[12px] text-zinc-400">{t('creator.test.summary', { played: result.played, players: result.players, ms: result.totalMs })}</span>
        {result.usedDraft && <Badge tone="violet">{t('creator.test.draft')}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatCard label={t('creator.test.finished')} value={`${result.finished}/${result.played}`} icon="flag" accent="#34d399" />
        <StatCard label={t('creator.test.unfinished')} value={result.unfinished} icon="clock" accent="#fbbf24" />
        <StatCard label={t('creator.test.errors')} value={result.errors} icon="ban" accent="#f87171" />
        <StatCard label={t('creator.test.avgSteps')} value={result.avgSteps.toLocaleString()} icon="refresh" />
        <StatCard label={t('creator.test.avgMs')} value={`${result.avgMs} ms`} icon="clock" accent="#a78bfa" />
      </div>
      {result.unfinished > 0 && <p className="text-[12px] text-amber-200/80">{t('creator.test.unfinishedHint')}</p>}
      {result.checks?.length > 0 && (
        <ul className="rounded-lg border border-red-400/25 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-200">
          {result.checks.map((c) => <li key={c}>⚠ {c}</li>)}
        </ul>
      )}
      <Table
        rowKey={(g) => g.index}
        rows={result.games}
        onRowClick={(g) => setOpen(open === g.index ? null : g.index)}
        empty="—"
        columns={[
          { key: 'index', label: '#', render: (g) => g.index },
          { key: 'status', label: t('admin.col.status'), render: (g) => (g.ok ? <Badge tone={g.finished ? 'green' : 'amber'}>{g.finished ? t('creator.test.gameFinished') : t('creator.test.gameCut')}</Badge> : <Badge tone="red">{t('creator.test.gameError')}</Badge>) },
          { key: 'steps', label: t('creator.test.steps'), align: 'right', render: (g) => (g.steps ?? '—') },
          { key: 'winner', label: t('admin.recent.winner'), render: (g) => g.winner || '—' },
          { key: 'ms', label: 'ms', align: 'right', render: (g) => g.ms },
          { key: 'error', label: t('creator.test.error'), render: (g) => <span className="text-red-300">{g.error || ''}</span> },
        ]}
      />
      {open != null && result.games.find((g) => g.index === open)?.stack && (
        <pre className="scrollbar-thin max-h-60 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-red-200">{result.games.find((g) => g.index === open).stack}</pre>
      )}
    </div>
  );
}
