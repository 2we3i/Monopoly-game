// ModesSection.jsx
// Every game mode with its numbers - status, players, matches played and
// running, popularity, errors, version and last change - and its controls:
// switching it on, off or pausing it (administrators and the Creator), and
// for the Creator the mode constructor, settings, test runs, test matches
// and logs. Closing a mode never touches games already being played.

import { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatDate, formatDuration, percent } from '../../lib/api';
import { useCitadelsConfig } from '../../hooks/useCitadels';
import { navigate } from '../../lib/router';
import { armTestMatch, pathForMode } from '../../lib/testMatch';
import {
  Badge, Button, Card, DashIcon, Dialog, Drawer, ErrorState, GAME_COLORS, Segmented, Spinner, Table,
} from '../ui/dash';
import CitadelsStatsCard from '../ui/CitadelsStats';
import { gameName, modeName, stageTone } from '../ui/labels';
import SectionHeader from './SectionHeader';
import useAdminData, { adminAction } from './useAdminData';
import {
  NumberInput, SearchBox, creatorRequest, useAction, useCreator,
} from './kit';
import ModeEditor from './creator/ModeEditor';
import SimulationResult from './creator/SimulationResult';

const PAUSE_OPTIONS = [15, 60, 360, 1440];
const STATUS_TONE = { enabled: 'green', disabled: 'red', paused: 'amber' };

function pauseLabel(t, minutes) {
  return minutes < 60 ? t('admin.modes.minutesN', { n: minutes }) : t('admin.modes.hoursN', { n: minutes / 60 });
}

function modeLabel(t, language, mode) {
  return mode.label?.[language] || modeName(t, mode.id);
}

function Metric({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10.5px] uppercase tracking-wider text-zinc-500 4xl:text-[12px]">{label}</dt>
      <dd className={`truncate font-semibold tnum 4xl:text-[16px] ${tone || 'text-zinc-100'}`}>{value}</dd>
    </div>
  );
}

function TestDialog({ mode, onClose }) {
  const { t, language } = useTranslation();
  const { token } = useCreator();
  const [games, setGames] = useState(5);
  const [players, setPlayers] = useState('');
  const [result, setResult] = useState(null);
  const [busy, run] = useAction();
  const start = async () => {
    setResult(null);
    const out = await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/simulate`, {
      method: 'POST', body: { games, players: players || null },
    }));
    if (out) setResult(out.result);
  };
  return (
    <Dialog
      title={t('creator.test.dialogTitle', { mode: `${gameName(t, mode.gameId)} · ${modeLabel(t, language, mode)}` })}
      onClose={onClose}
      width="max-w-3xl"
      footer={(
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button tone="primary" icon="play" disabled={busy} onClick={start}>{busy ? t('creator.test.running') : t('creator.test.run')}</Button>
        </>
      )}
    >
      <p className="text-zinc-400">{t('creator.test.explain')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">{t('creator.test.games')}</span>
          <NumberInput value={games} min={1} max={50} onChange={(v) => setGames(v || 1)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">{t('creator.test.players')}</span>
          <NumberInput value={players} min={mode.minPlayers} max={mode.maxPlayers} placeholder={t('creator.test.auto')} onChange={setPlayers} />
        </label>
      </div>
      {busy && <Spinner block />}
      {result && <div className="mt-4"><SimulationResult result={result} /></div>}
    </Dialog>
  );
}

function LogsDrawer({ mode, onClose }) {
  const { t, language } = useTranslation();
  const { token } = useCreator();
  const { data, error, reload } = useAdminData(`/api/admin/modes/${encodeURIComponent(mode.id)}/logs`, token);
  return (
    <Drawer wide title={t('creator.modeLogs.title', { mode: `${gameName(t, mode.gameId)} · ${modeLabel(t, language, mode)}` })} subtitle={mode.id} onClose={onClose}>
      {!data ? (error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />) : (
        <div className="flex flex-col gap-4">
          <Card title={t('creator.modeLogs.changes')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.id}
              rows={data.audit}
              empty={t('admin.audit.empty')}
              columns={[
                { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.createdAt, language) },
                { key: 'who', label: t('creator.logs.who'), render: (r) => r.adminName },
                { key: 'action', label: t('creator.logs.action'), render: (r) => <Badge tone={r.critical ? 'amber' : 'zinc'}>{t(`creator.action.${r.action}`)}</Badge> },
                { key: 'reason', label: t('creator.logs.reason'), render: (r) => <span className="text-zinc-400">{[r.details?.version ? `v${r.details.version}` : '', r.reason || ''].filter(Boolean).join(' · ') || '—'}</span> },
              ]}
            />
          </Card>
          <Card title={t('creator.modeLogs.errors')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.id}
              rows={data.errors}
              empty={t('creator.errors.empty')}
              columns={[
                { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.createdAt, language) },
                { key: 'message', label: t('creator.errors.message'), render: (r) => <span className="whitespace-normal text-red-200">{r.message}</span> },
              ]}
            />
          </Card>
          <Card title={t('creator.modeLogs.matches')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.id}
              rows={data.matches}
              empty={t('admin.recent.empty')}
              columns={[
                { key: 'room', label: t('admin.col.code'), render: (r) => <span className="font-mono">{r.roomCode}</span> },
                { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.startedAt, language) },
                { key: 'players', label: t('admin.col.players'), align: 'right', render: (r) => r.playerCount },
                { key: 'winner', label: t('admin.recent.winner'), render: (r) => r.winner || '—' },
                { key: 'status', label: t('admin.col.status'), render: (r) => <Badge>{t(`result.${r.status}`)}</Badge> },
              ]}
            />
          </Card>
          <Card title={t('creator.modeLogs.tests')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.id}
              rows={data.tests}
              empty={t('creator.test.noRuns')}
              columns={[
                { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.createdAt, language) },
                { key: 'who', label: t('creator.logs.who'), render: (r) => r.createdByName },
                { key: 'status', label: t('admin.col.status'), render: (r) => <Badge tone={{ passed: 'green', warning: 'amber', failed: 'red' }[r.status] || 'zinc'}>{t(`creator.test.status.${r.status}`)}</Badge> },
                { key: 'result', label: t('creator.test.finished'), render: (r) => (r.result ? `${r.result.finished}/${r.result.played} · ${r.result.errors} ${t('creator.test.errors').toLowerCase()}` : '—') },
              ]}
            />
          </Card>
          <Card title={t('creator.modeLogs.rooms')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.code}
              rows={data.rooms}
              empty={t('admin.lobbies.empty')}
              columns={[
                { key: 'code', label: t('admin.col.code'), render: (r) => <span className="font-mono">{r.code}</span> },
                { key: 'stage', label: t('admin.col.status'), render: (r) => <Badge tone={stageTone(r.stage)}>{t(`admin.stage.${r.stage}`)}</Badge> },
                { key: 'players', label: t('admin.col.players'), align: 'right', render: (r) => `${r.players.length}/${r.maxPlayers}` },
                { key: 'test', label: '', render: (r) => (r.test ? <Badge tone="violet">{t('creator.test.badge')}</Badge> : null) },
              ]}
            />
          </Card>
        </div>
      )}
    </Drawer>
  );
}

function ModeCard({
  mode, token, onChanged, onOpen,
}) {
  const { t, language } = useTranslation();
  const creator = useCreator();
  const can = creator?.can || (() => false);
  const [pending, setPending] = useState(null);
  const [pauseMinutes, setPauseMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const apply = async (status, minutes) => {
    if (status === 'disabled' && creator?.ask) {
      const ok = await creator.ask({
        title: t('creator.mode.disableTitle', { mode: modeLabel(t, language, mode) }),
        message: t('creator.mode.disableText', { live: mode.liveRooms }),
        critical: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminAction(`/api/admin/modes/${mode.id}`, token, { status, pauseMinutes: minutes }, 'PUT');
      setPending(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const testMatch = async () => {
    const ok = await creator.ask({
      title: t('creator.test.matchTitle'),
      message: t('creator.test.matchText', { mode: modeLabel(t, language, mode) }),
      tone: 'primary',
      confirmLabel: t('creator.test.matchGo'),
    });
    if (!ok) return;
    try {
      const { armed } = await creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/test-match`, { method: 'POST' });
      armTestMatch(armed);
      navigate(pathForMode(mode.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const color = GAME_COLORS[mode.gameId];
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#121418] transition-colors hover:border-white/[0.12]">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="flex flex-1 flex-col gap-4 p-4 4xl:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1f`, color }}>
            <DashIcon name={{ citadels: 'castle', bunker: 'shield', catan: 'grid', cosmic: 'star', throne: 'flag', memehype: 'heart', chpok: 'sparkles' }[mode.gameId] || 'gamepad'} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-zinc-100 4xl:text-[18px]">{gameName(t, mode.gameId)}</p>
            <p className="truncate text-[12px] text-zinc-500">{modeLabel(t, language, mode)} · <span className="font-mono">{mode.id}</span></p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={STATUS_TONE[mode.status]} dot>{t(`admin.modes.status.${mode.status}`)}</Badge>
            {mode.version != null && <Badge tone={mode.customized ? 'violet' : 'zinc'}>v{mode.version}</Badge>}
          </div>
        </div>

        {mode.status === 'paused' && mode.pausedUntil && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            {t('admin.modes.pausedUntil', { date: formatDate(mode.pausedUntil, language) })}
          </p>
        )}

        <dl className="grid grid-cols-3 gap-x-4 gap-y-2.5 text-[12.5px]">
          <Metric label={t('admin.modes.players')} value={mode.players} />
          <Metric label={t('admin.modes.matches')} value={mode.matches} />
          <Metric label={t('creator.modes.active')} value={mode.activeMatches ?? mode.liveRooms} tone={mode.activeMatches ? 'text-emerald-300' : undefined} />
          <Metric label={t('creator.modes.popularity')} value={mode.share != null ? percent(mode.share) : '—'} />
          <Metric label={t('creator.modes.errors')} value={mode.errors7d ?? '—'} tone={mode.errors7d ? 'text-red-300' : undefined} />
          <Metric label={t('creator.modes.limits')} value={mode.minPlayers != null ? `${mode.minPlayers}–${mode.maxPlayers}` : '—'} />
          <Metric label={t('admin.modes.avgDuration')} value={formatDuration(mode.avgDurationMs, t)} />
          <Metric label={t('admin.modes.liveLabel')} value={t('admin.modes.live', { rooms: mode.liveRooms, players: mode.livePlayers })} />
          <Metric label={t('creator.modes.changed')} value={mode.lastChangedAt ? formatDate(mode.lastChangedAt, language, false) : '—'} />
        </dl>

        <div className="mt-auto flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          <div className="flex flex-wrap gap-1.5">
            {mode.status !== 'enabled' && <Button tone="success" icon="power" disabled={busy} onClick={() => apply('enabled')}>{t('admin.modes.enable')}</Button>}
            {mode.status !== 'disabled' && <Button tone="danger" icon="power" disabled={busy} onClick={() => apply('disabled')}>{t('admin.modes.disable')}</Button>}
            {mode.status !== 'paused' && <Button icon="clock" disabled={busy} onClick={() => setPending('paused')}>{t('admin.modes.pause')}</Button>}
          </div>
          {can('modes.view') && creator?.me?.role === 'creator' && (
            <div className="flex flex-wrap gap-1.5">
              {can('modes.edit') && <Button tone="primary" icon="palette" onClick={() => onOpen('edit', mode)}>{t('creator.modes.edit')}</Button>}
              {can('modes.edit') && <Button icon="filter" onClick={() => onOpen('settings', mode)}>{t('creator.modes.settings')}</Button>}
              {can('modes.test') && <Button icon="flag" onClick={() => onOpen('test', mode)}>{t('creator.modes.test')}</Button>}
              {can('modes.test') && <Button icon="play" onClick={testMatch}>{t('creator.modes.testMatch')}</Button>}
              {can('logs.view') && <Button tone="subtle" icon="eye" onClick={() => onOpen('logs', mode)}>{t('creator.modes.logs')}</Button>}
            </div>
          )}
          {pending === 'paused' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-zinc-400">{t('admin.modes.pauseFor')}</span>
              <select
                value={pauseMinutes}
                onChange={(e) => setPauseMinutes(Number(e.target.value))}
                className="h-8 rounded-lg border border-white/10 bg-[#0d0e11] px-2 text-[12.5px] text-zinc-200"
              >
                {PAUSE_OPTIONS.map((m) => <option key={m} value={m}>{pauseLabel(t, m)}</option>)}
              </select>
              <Button tone="primary" disabled={busy} onClick={() => apply('paused', pauseMinutes)}>{t('admin.modes.apply')}</Button>
              <Button tone="subtle" onClick={() => setPending(null)}>{t('common.cancel')}</Button>
            </div>
          )}
          {error && <p className="text-[12px] text-red-300">{error}</p>}
        </div>
      </div>
    </section>
  );
}

export default function ModesSection({ token }) {
  const { t, language } = useTranslation();
  const config = useCitadelsConfig();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/modes', token, 20000);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // { kind, mode }

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  const q = query.trim().toLowerCase();
  const list = data.modes
    .filter((m) => status === 'all' || m.status === status)
    .filter((m) => !q || `${m.id} ${gameName(t, m.gameId)} ${modeLabel(t, language, m)}`.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={t('admin.modes.title')} subtitle={t('admin.modes.note')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder={t('creator.modes.search')} className="sm:w-72" />
        <Segmented
          value={status}
          onChange={setStatus}
          options={['all', 'enabled', 'disabled', 'paused'].map((s) => ({ value: s, label: s === 'all' ? t('common.all') : t(`admin.modes.status.${s}`) }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 5xl:grid-cols-5">
        {list.map((mode) => <ModeCard key={mode.id} mode={mode} token={token} onChanged={reload} onOpen={(kind, m) => setOpen({ kind, mode: m })} />)}
      </div>
      <CitadelsStatsCard stats={data.citadels} config={config} title={t('citadels.stats.globalTitle')} subtitle={t('citadels.stats.globalSubtitle')} />
      <Card title={t('admin.modes.howTitle')}>
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-zinc-400">
          <li>{t('admin.modes.how1')}</li>
          <li>{t('admin.modes.how2')}</li>
          <li>{t('admin.modes.how3')}</li>
        </ul>
      </Card>

      {open && (open.kind === 'edit' || open.kind === 'settings') && (
        <ModeEditor modeId={open.mode.id} initialTab={open.kind === 'settings' ? 'players' : 'general'} onClose={() => setOpen(null)} onSaved={reload} />
      )}
      {open?.kind === 'test' && <TestDialog mode={open.mode} onClose={() => setOpen(null)} />}
      {open?.kind === 'logs' && <LogsDrawer mode={open.mode} onClose={() => setOpen(null)} />}
    </div>
  );
}
