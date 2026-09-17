// SettingsSection.jsx
// Platform settings: what games pay (participation, places, team wins,
// first win of the day, streaks, achievements, the daily cap, the minimum
// game length, the weekend festival), whether registration and the shop
// are open, and an announcement everybody sees.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import {
  Badge, Button, Card, ErrorState, Segmented, Spinner,
} from '../../ui/dash';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  FieldRow, LocalizedInputs, NumberInput, TextInput, Toggle, ValueDiff, creatorRequest, useAction, useCreator,
} from '../kit';

const ECONOMY_FIELDS = [
  ['participation', 0, 100000],
  ['place1', 0, 100000],
  ['place2', 0, 100000],
  ['place3', 0, 100000],
  ['teamWin', 0, 100000],
  ['firstWinOfDay', 0, 100000],
  ['streak3', 0, 100000],
  ['streak5', 0, 100000],
  ['streak10', 0, 100000],
  ['dailyRewardedMatches', 0, 1000],
  ['minMatchSeconds', 0, 3600],
];

export default function SettingsSection({ token }) {
  const { t } = useTranslation();
  const { ask } = useCreator();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/settings', token);
  const [draft, setDraft] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, run] = useAction();

  useEffect(() => {
    if (data) setDraft(JSON.parse(JSON.stringify(data.settings)));
  }, [data]);

  if (!data || !draft) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const setEconomy = (patch) => setDraft((d) => ({ ...d, economy: { ...d.economy, ...patch } }));
  const setPlatform = (patch) => setDraft((d) => ({ ...d, platform: { ...d.platform, ...patch } }));

  const save = async () => {
    const ok = await ask({
      title: t('creator.settings.saveTitle'),
      message: t('creator.settings.saveText'),
      details: <ValueDiff before={data.settings} after={draft} />,
      critical: true,
      tone: 'primary',
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, '/api/admin/settings', { method: 'PUT', body: { settings: draft, reason, confirm: true } }), t('creator.settings.saved'));
    if (out) {
      setReason('');
      reload();
    }
  };

  const reset = async (section) => {
    const ok = await ask({ title: t('creator.settings.resetTitle'), message: t(`creator.settings.resetText.${section}`), critical: true });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, '/api/admin/settings/reset', { method: 'POST', body: { section, confirm: true } }), t('creator.settings.saved'));
    if (out) reload();
  };

  const d = data.defaults;
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.settings.title')} subtitle={t('creator.settings.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />

      <Card
        title={t('creator.settings.platform')}
        subtitle={t('creator.settings.platformHint')}
        action={<Button tone="subtle" icon="refresh" onClick={() => reset('platform')}>{t('creator.settings.reset')}</Button>}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Toggle checked={draft.platform.registrationOpen} onChange={(registrationOpen) => setPlatform({ registrationOpen })} label={t('creator.settings.registrationOpen')} hint={t('creator.settings.registrationOpenHint')} />
            <Toggle checked={draft.platform.shopOpen} onChange={(shopOpen) => setPlatform({ shopOpen })} label={t('creator.settings.shopOpen')} hint={t('creator.settings.shopOpenHint')} />
          </div>
          <div className="flex flex-col gap-3">
            <LocalizedInputs label={t('creator.settings.announcement')} value={draft.platform.announcement} onChange={(announcement) => setPlatform({ announcement })} multiline rows={2} />
            <Segmented value={draft.platform.announcementTone} onChange={(announcementTone) => setPlatform({ announcementTone })} options={['info', 'warning', 'success'].map((v) => ({ value: v, label: t(`creator.settings.tone.${v}`) }))} />
          </div>
        </div>
      </Card>

      <Card
        title={t('creator.settings.economy')}
        subtitle={t('creator.settings.economyHint')}
        action={<Button tone="subtle" icon="refresh" onClick={() => reset('economy')}>{t('creator.settings.reset')}</Button>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {ECONOMY_FIELDS.map(([key, min, max]) => (
            <FieldRow key={key} label={t(`creator.settings.field.${key}`)} hint={t('creator.mode.defaultIs', { value: d.economy[key] })}>
              <NumberInput value={draft.economy[key]} min={min} max={max} onChange={(v) => setEconomy({ [key]: v === '' ? d.economy[key] : v })} disabled={key === 'minMatchSeconds' && data.environment.minMatchFromEnv} />
            </FieldRow>
          ))}
          <FieldRow label={t('creator.settings.field.festivalMultiplier')} hint={t('creator.mode.defaultIs', { value: d.economy.festivalMultiplier })}>
            <NumberInput value={draft.economy.festivalMultiplier} min={1} max={5} step={0.05} onChange={(v) => setEconomy({ festivalMultiplier: v === '' ? d.economy.festivalMultiplier : v })} />
          </FieldRow>
        </div>
        <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('creator.settings.achievements')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.keys(draft.economy.achievements).map((id) => (
            <FieldRow key={id} label={t(`achievement.${id}.title`)} hint={String(d.economy.achievements[id])}>
              <NumberInput value={draft.economy.achievements[id]} min={0} onChange={(v) => setEconomy({ achievements: { ...draft.economy.achievements, [id]: v === '' ? 0 : v } })} />
            </FieldRow>
          ))}
        </div>
      </Card>

      <Card title={t('creator.settings.environment')} subtitle={t('creator.settings.environmentHint')}>
        <div className="flex flex-wrap gap-2 text-[12px]">
          <Badge>NODE_ENV: {data.environment.nodeEnv}</Badge>
          <Badge>{t('creator.settings.uptime', { h: Math.floor(data.environment.uptimeSec / 3600), m: Math.floor((data.environment.uptimeSec % 3600) / 60) })}</Badge>
          <Badge tone={data.environment.creatorFromEnv ? 'violet' : 'zinc'}>CREATOR_ACCOUNT_ID: {data.environment.creatorFromEnv ? '✓' : '—'}</Badge>
          <Badge tone={data.environment.adminFromEnv ? 'amber' : 'zinc'}>ADMIN_ACCOUNT_ID: {data.environment.adminFromEnv ? '✓' : '—'}</Badge>
          {data.environment.minMatchFromEnv && <Badge tone="amber">ECONOMY_MIN_MATCH_MS</Badge>}
        </div>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#16181d]/95 p-3 shadow-deep backdrop-blur">
        {dirty ? <Badge tone="amber" dot>{t('creator.mode.unsaved')}</Badge> : <Badge tone="green">{t('creator.fields.inSync')}</Badge>}
        <TextInput value={reason} onChange={setReason} placeholder={t('creator.settings.reason')} className="max-w-sm" />
        <span className="flex-1" />
        <Button onClick={() => setDraft(JSON.parse(JSON.stringify(data.settings)))} disabled={!dirty}>{t('creator.mode.discard')}</Button>
        <Button tone="primary" icon="check" disabled={!dirty || busy} onClick={save}>{t('creator.settings.save')}</Button>
      </div>
    </div>
  );
}
