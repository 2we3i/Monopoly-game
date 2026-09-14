// ModesSection.jsx
// Every game mode, its numbers, and the switch that opens or closes it for
// new games. Closing a mode never touches games already being played.

import { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatDate, formatDuration } from '../../lib/api';
import { useCitadelsConfig } from '../../hooks/useCitadels';
import {
  Badge, Button, Card, DashIcon, ErrorState, GAME_COLORS, Segmented, Spinner,
} from '../ui/dash';
import CitadelsStatsCard from '../ui/CitadelsStats';
import { gameName, modeName } from '../ui/labels';
import SectionHeader from './SectionHeader';
import useAdminData, { adminAction } from './useAdminData';

const PAUSE_OPTIONS = [15, 60, 360, 1440];
const STATUS_TONE = { enabled: 'green', disabled: 'red', paused: 'amber' };

function pauseLabel(t, minutes) {
  return minutes < 60 ? t('admin.modes.minutesN', { n: minutes }) : t('admin.modes.hoursN', { n: minutes / 60 });
}

function ModeCard({ mode, token, onChanged }) {
  const { t, language } = useTranslation();
  const [pending, setPending] = useState(null);
  const [pauseMinutes, setPauseMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const apply = async (status, minutes) => {
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

  const choose = (status) => {
    if (status === 'paused') setPending('paused');
    else apply(status);
  };

  const color = GAME_COLORS[mode.gameId];
  const stats = [
    [t('admin.modes.players'), mode.players],
    [t('admin.modes.matches'), mode.matches],
    [t('admin.modes.finished'), mode.finished],
    [t('admin.modes.avgPlayers'), (mode.avgPlayers || 0).toFixed(1)],
    [t('admin.modes.avgDuration'), formatDuration(mode.avgDurationMs, t)],
  ];

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#121418]">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1f`, color }}>
            <DashIcon name={mode.gameId === 'citadels' ? 'castle' : 'gamepad'} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-zinc-100">{gameName(t, mode.gameId)}</p>
            <p className="text-[12px] text-zinc-500">{modeName(t, mode.id)} · <span className="font-mono">{mode.id}</span></p>
          </div>
          <Badge tone={STATUS_TONE[mode.status]} dot>{t(`admin.modes.status.${mode.status}`)}</Badge>
        </div>

        {mode.status === 'paused' && mode.pausedUntil && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            {t('admin.modes.pausedUntil', { date: formatDate(mode.pausedUntil, language) })}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-zinc-500">{label}</dt>
              <dd className="font-semibold text-zinc-100 tnum">{value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-[11px] text-zinc-500">{t('admin.modes.liveLabel')}</dt>
            <dd className="font-semibold text-zinc-100 tnum">{t('admin.modes.live', { rooms: mode.liveRooms, players: mode.livePlayers })}</dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          <Segmented
            value={pending || mode.status}
            disabled={busy}
            onChange={choose}
            options={[
              { value: 'enabled', label: t('admin.modes.enable') },
              { value: 'disabled', label: t('admin.modes.disable') },
              { value: 'paused', label: t('admin.modes.pause') },
            ]}
          />
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
  const { t } = useTranslation();
  const config = useCitadelsConfig();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/modes', token, 20000);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={t('admin.modes.title')} subtitle={t('admin.modes.note')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.modes.map((mode) => <ModeCard key={mode.id} mode={mode} token={token} onChanged={reload} />)}
      </div>
      <CitadelsStatsCard stats={data.citadels} config={config} title={t('citadels.stats.globalTitle')} subtitle={t('citadels.stats.globalSubtitle')} />
      <Card title={t('admin.modes.howTitle')}>
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-zinc-400">
          <li>{t('admin.modes.how1')}</li>
          <li>{t('admin.modes.how2')}</li>
          <li>{t('admin.modes.how3')}</li>
        </ul>
      </Card>
    </div>
  );
}
