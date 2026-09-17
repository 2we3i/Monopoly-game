// TestingSection.jsx
// Testing without touching real data: bot simulations of any mode (every
// game played in memory on the server, nothing recorded), test matches the
// Creator plays in a real room that never enters the history (even in a
// mode switched off for everyone), and the history of every run.

import { useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import { navigate } from '../../../lib/router';
import { armTestMatch, clearTestMatch, pathForMode } from '../../../lib/testMatch';
import {
  Badge, Button, Card, ErrorState, Spinner, Table,
} from '../../ui/dash';
import { gameName, modeName, stageTone } from '../../ui/labels';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  FieldRow, NumberInput, Select, creatorRequest, useAction, useCreator,
} from '../kit';
import SimulationResult from './SimulationResult';

const STATUS_TONE = {
  passed: 'green', warning: 'amber', failed: 'red', running: 'blue',
};

export default function TestingSection({ token }) {
  const { t, language } = useTranslation();
  const { ask } = useCreator();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/testing', token, 10000);
  const [modeId, setModeId] = useState('monopoly.classic');
  const [games, setGames] = useState(5);
  const [players, setPlayers] = useState('');
  const [result, setResult] = useState(null);
  const [openRun, setOpenRun] = useState(null);
  const [busy, run] = useAction();
  const [allBusy, setAllBusy] = useState(false);
  const [allResults, setAllResults] = useState([]);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;
  const mode = data.modes.find((m) => m.id === modeId) || data.modes[0];

  const simulate = async () => {
    setResult(null);
    const out = await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/simulate`, {
      method: 'POST', body: { games, players: players || null },
    }));
    if (out) {
      setResult(out.result);
      reload();
    }
  };

  // Every mode, a few games each - a quick health check of the platform.
  const simulateAll = async () => {
    setAllBusy(true);
    setAllResults([]);
    const results = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const m of data.modes) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const out = await creatorRequest(token, `/api/admin/modes/${encodeURIComponent(m.id)}/simulate`, { method: 'POST', body: { games: 2 } });
        results.push({ modeId: m.id, gameId: m.gameId, ...out.result });
      } catch (err) {
        results.push({
          modeId: m.id, gameId: m.gameId, status: 'failed', error: err.message, played: 0, finished: 0, errors: 1,
        });
      }
      setAllResults([...results]);
    }
    setAllBusy(false);
    reload();
  };

  const testMatch = async () => {
    const ok = await ask({
      title: t('creator.test.matchTitle'),
      message: t('creator.test.matchText', { mode: `${gameName(t, mode.gameId)} · ${modeName(t, mode.id)}` }),
      tone: 'primary',
      confirmLabel: t('creator.test.matchGo'),
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/test-match`, { method: 'POST' }));
    if (out) {
      armTestMatch(out.armed);
      navigate(pathForMode(mode.id));
    }
  };

  const disarm = async () => {
    await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(data.armed.modeId)}/test-match`, { method: 'DELETE' }));
    clearTestMatch();
    reload();
  };

  const runDetails = data.runs.find((r) => r.id === openRun);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.testing.title')} subtitle={t('creator.testing.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />

      <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
        <Card title={t('creator.testing.simulation')} subtitle={t('creator.test.explain')}>
          <div className="grid gap-3 sm:grid-cols-[1.4fr,110px,110px,auto] sm:items-end">
            <FieldRow label={t('admin.lobby.mode')}>
              <Select
                value={mode.id}
                onChange={setModeId}
                options={data.modes.map((m) => ({ value: m.id, label: `${gameName(t, m.gameId)} · ${m.label?.[language] || modeName(t, m.id)}${m.status !== 'enabled' ? ` (${t(`admin.modes.status.${m.status}`)})` : ''}` }))}
              />
            </FieldRow>
            <FieldRow label={t('creator.test.games')}><NumberInput value={games} min={1} max={50} onChange={(v) => setGames(v || 1)} /></FieldRow>
            <FieldRow label={t('creator.test.players')}><NumberInput value={players} min={1} max={16} placeholder={t('creator.test.auto')} onChange={setPlayers} /></FieldRow>
            <Button tone="primary" icon="play" disabled={busy} onClick={simulate}>{busy ? t('creator.test.running') : t('creator.test.run')}</Button>
          </div>
          <div className="mt-4">
            {busy && !result && <Spinner block />}
            {result && <SimulationResult result={result} />}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title={t('creator.testing.match')} subtitle={t('creator.testing.matchHint')}>
            {data.armed ? (
              <div className="flex flex-col gap-3">
                <p className="rounded-lg bg-violet-500/10 px-3 py-2 text-[12.5px] text-violet-200">
                  {t('creator.testing.armed', { mode: data.armed.modeId, time: formatDate(data.armed.expiresAt, language) })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button tone="primary" icon="play" onClick={() => navigate(pathForMode(data.armed.modeId))}>{t('creator.test.matchGo')}</Button>
                  <Button tone="subtle" icon="close" onClick={disarm}>{t('creator.testing.disarm')}</Button>
                </div>
              </div>
            ) : (
              <Button tone="primary" icon="flag" disabled={busy} onClick={testMatch}>{t('creator.testing.armFor', { mode: mode.id })}</Button>
            )}
          </Card>
          <Card title={t('creator.testing.healthCheck')} subtitle={t('creator.testing.healthCheckHint')}>
            <Button icon="refresh" disabled={allBusy} onClick={simulateAll}>{allBusy ? t('creator.test.running') : t('creator.testing.runAll')}</Button>
            {allResults.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {allResults.map((r) => (
                  <li key={r.modeId} className="flex items-center gap-2 text-[12.5px]">
                    <Badge tone={STATUS_TONE[r.status]} dot>{t(`creator.test.status.${r.status}`)}</Badge>
                    <span className="flex-1 truncate text-zinc-200">{gameName(t, r.gameId)} · <span className="font-mono text-zinc-500">{r.modeId}</span></span>
                    <span className="text-zinc-400 tnum">{r.finished}/{r.played}{r.errors ? ` · ${r.errors}⚠` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title={t('creator.testing.testRooms')} subtitle={t('creator.testing.testRoomsHint')} bodyClass="p-0">
        <Table
          rowKey={(r) => r.code}
          rows={data.testRooms}
          empty={t('creator.testing.noTestRooms')}
          columns={[
            { key: 'code', label: t('admin.col.code'), render: (r) => <span className="font-mono">{r.code}</span> },
            { key: 'game', label: t('admin.col.game'), render: (r) => `${gameName(t, r.gameType)} · ${modeName(t, r.modeId)}` },
            { key: 'stage', label: t('admin.col.status'), render: (r) => <Badge tone={stageTone(r.stage)}>{t(`admin.stage.${r.stage}`)}</Badge> },
            { key: 'players', label: t('admin.col.players'), align: 'right', render: (r) => r.players.length },
          ]}
        />
      </Card>

      <Card title={t('creator.testing.history')} bodyClass="p-0">
        <Table
          rowKey={(r) => r.id}
          rows={data.runs}
          onRowClick={(r) => setOpenRun(openRun === r.id ? null : r.id)}
          empty={t('creator.test.noRuns')}
          columns={[
            { key: 'id', label: '#', render: (r) => r.id },
            { key: 'mode', label: t('admin.lobby.mode'), render: (r) => <span className="font-mono">{r.modeId}</span> },
            { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.createdAt, language) },
            { key: 'who', label: t('creator.logs.who'), render: (r) => r.createdByName || '—' },
            { key: 'status', label: t('admin.col.status'), render: (r) => <Badge tone={STATUS_TONE[r.status] || 'zinc'}>{t(`creator.test.status.${r.status}`)}</Badge> },
            { key: 'result', label: t('creator.test.finished'), align: 'right', render: (r) => (r.result?.played != null ? `${r.result.finished}/${r.result.played}` : '—') },
            { key: 'errors', label: t('creator.test.errors'), align: 'right', render: (r) => (r.result?.errors ?? '—') },
          ]}
        />
        {runDetails?.result?.games && <div className="border-t border-white/[0.06] p-4"><SimulationResult result={runDetails.result} /></div>}
      </Card>
    </div>
  );
}
