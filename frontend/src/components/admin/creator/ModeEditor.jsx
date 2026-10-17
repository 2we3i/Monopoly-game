// ModeEditor.jsx
// The mode constructor: players and lobby, texts, the default settings a
// new room starts with (and which of them the host may not change), the
// Monopoly money rules and Chance / Community Chest cards, auto-move
// timers, a test run of the draft, and every saved version with restore.
//
// Saving asks twice and creates a new version on the server; only rooms
// created afterwards use it.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import {
  Badge, Button, Card, Drawer, Spinner, StatCard,
} from '../../ui/dash';
import { gameName } from '../../ui/labels';
import useAdminData from '../useAdminData';
import {
  FieldRow, Label, LocalizedInputs, NumberInput, Select, Tabs, TextArea, TextInput, Toggle, ValueDiff,
  creatorRequest, useAction, useCreator,
} from '../kit';
import SimulationResult from './SimulationResult';

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function setPath(obj, path, value) {
  const next = clone(obj) || {};
  const keys = path.split('.');
  let o = next;
  keys.slice(0, -1).forEach((k) => {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
  return next;
}

// One setting, drawn from the type of its default value.
function SettingControl({
  path, value, fallback, onChange, locked, onLock,
}) {
  const { t } = useTranslation();
  const label = path.split('.').slice(-1)[0];
  let control;
  if (typeof fallback === 'boolean') {
    control = <Toggle checked={!!value} onChange={onChange} />;
  } else if (typeof fallback === 'number') {
    control = <NumberInput value={value} onChange={(v) => onChange(v === '' ? fallback : v)} />;
  } else if (typeof fallback === 'string') {
    control = <TextInput value={value} onChange={onChange} />;
  } else {
    control = (
      <TextInput
        value={JSON.stringify(value)}
        onChange={(text) => {
          try {
            onChange(JSON.parse(text));
          } catch { /* keep typing */ }
        }}
        className="font-mono text-[12px]"
      />
    );
  }
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${locked ? 'border-amber-400/30 bg-amber-500/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-zinc-300" title={path}>{path.includes('.') ? path : label}</span>
        <button
          type="button"
          onClick={onLock}
          title={t('creator.mode.lockHint')}
          className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${locked ? 'bg-amber-500/20 text-amber-200' : 'bg-white/[0.06] text-zinc-500 hover:text-zinc-300'}`}
        >
          {locked ? t('creator.mode.locked') : t('creator.mode.lock')}
        </button>
      </div>
      {control}
      {JSON.stringify(value) !== JSON.stringify(fallback) && (
        <p className="mt-1 text-[10.5px] text-zinc-500">{t('creator.mode.defaultWas', { value: JSON.stringify(fallback) })}</p>
      )}
    </div>
  );
}

const CARD_FIELDS = {
  roleTile: 'select', steps: 'number', amount: 'number', perHouse: 'number', perHotel: 'number',
};

function DeckEditor({
  deck, onChange, cardTypes, roleTiles, title,
}) {
  const { t } = useTranslation();
  const update = (index, patch) => onChange(deck.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const setType = (index, type) => {
    const card = { text: deck[index].text, type };
    (cardTypes[type] || []).forEach((field) => {
      card[field] = field === 'roleTile' ? roleTiles[0] : field === 'steps' ? -3 : 50;
    });
    onChange(deck.map((c, i) => (i === index ? card : c)));
  };
  return (
    <Card
      title={title}
      subtitle={t('creator.cards.count', { n: deck.length })}
      action={<Button icon="plus" onClick={() => onChange([...deck, { type: 'COLLECT', amount: 50, text: { en: 'Collect $50.', ru: 'Получите $50.' } }])}>{t('creator.cards.add')}</Button>}
      bodyClass="p-0"
    >
      <ul className="divide-y divide-white/[0.05]">
        {deck.map((card, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} className="grid gap-2 px-4 py-3 xl:grid-cols-[180px,1fr,auto]">
            <div className="flex flex-col gap-2">
              <Select value={card.type} onChange={(type) => setType(i, type)} options={Object.keys(cardTypes).map((type) => ({ value: type, label: t(`creator.cards.type.${type}`) }))} />
              {(cardTypes[card.type] || []).map((field) => (
                <FieldRow key={field} label={t(`creator.cards.field.${field}`)}>
                  {CARD_FIELDS[field] === 'select'
                    ? <Select value={card[field]} onChange={(v) => update(i, { [field]: v })} options={roleTiles.map((r) => ({ value: r, label: t(`creator.cards.role.${r}`) }))} />
                    : <NumberInput value={card[field]} onChange={(v) => update(i, { [field]: v === '' ? 0 : v })} />}
                </FieldRow>
              ))}
            </div>
            <LocalizedInputs value={card.text} onChange={(text) => update(i, { text })} multiline rows={2} />
            <div className="flex items-start">
              <Button tone="subtle" icon="close" onClick={() => onChange(deck.filter((_, j) => j !== i))} disabled={deck.length <= 1} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ModeEditor({
  modeId, initialTab = 'general', onClose, onSaved,
}) {
  const { t, language } = useTranslation();
  const { token, ask, can } = useCreator();
  const { data, reload } = useAdminData(`/api/admin/modes/${encodeURIComponent(modeId)}/config`, token);
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [busy, run] = useAction();

  useEffect(() => {
    if (data && !draft) setDraft(clone(data.config));
  }, [data, draft]);

  const dirty = useMemo(() => data && draft && JSON.stringify(strip(draft)) !== JSON.stringify(strip(data.config)), [data, draft]);
  const editable = can('modes.edit');

  if (!data || !draft) {
    return (
      <Drawer title={modeId} onClose={onClose}>
        <Spinner block />
      </Drawer>
    );
  }

  const { mode, defaults, hardLimits } = data;
  const isMonopoly = mode.gameId === 'monopoly';
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleLock = (path) => set({ locked: draft.locked.includes(path) ? draft.locked.filter((p) => p !== path) : [...draft.locked, path] });

  const save = async () => {
    const ok = await ask({
      title: t('creator.mode.saveTitle', { mode: mode.id }),
      message: t('creator.mode.saveText', { version: data.config.version + 1 }),
      details: <ValueDiff before={strip(data.config)} after={strip(draft)} />,
      critical: true,
      tone: 'primary',
      confirmLabel: t('creator.mode.save'),
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/config`, {
      method: 'PUT', body: { config: strip(draft), note, confirm: true },
    }), t('creator.mode.saved'));
    if (out) {
      setNote('');
      setDraft(clone(out.config));
      reload();
      onSaved?.();
    }
  };

  const restore = async (version) => {
    const ok = await ask({
      title: t('creator.mode.restoreTitle', { version }),
      message: t('creator.mode.restoreText'),
      critical: true,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/config/restore`, { method: 'POST', body: { version, confirm: true } }), t('creator.mode.saved'));
    if (out) {
      setDraft(clone(out.config));
      reload();
      onSaved?.();
    }
  };

  const resetAll = async () => {
    const ok = await ask({ title: t('creator.mode.resetTitle'), message: t('creator.mode.resetText'), critical: true });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/config/reset`, { method: 'POST', body: { confirm: true } }), t('creator.mode.saved'));
    if (out) {
      setDraft(clone(out.config));
      reload();
      onSaved?.();
    }
  };

  const testDraft = async () => {
    setSimulation('running');
    const out = await run(() => creatorRequest(token, `/api/admin/modes/${encodeURIComponent(mode.id)}/simulate`, {
      method: 'POST', body: { games: 5, ...(dirty ? { config: strip(draft) } : {}) },
    }));
    setSimulation(out ? out.result : null);
  };

  const settingPaths = data.settingPaths || [];
  const tabs = [
    { value: 'general', label: t('creator.mode.tab.general'), icon: 'palette' },
    { value: 'players', label: t('creator.mode.tab.players'), icon: 'users' },
    ...(settingPaths.length ? [{ value: 'settings', label: t('creator.mode.tab.settings'), icon: 'filter', count: settingPaths.length }] : []),
    ...(isMonopoly ? [
      { value: 'rules', label: t('creator.mode.tab.rules'), icon: 'coin' },
      { value: 'cards', label: t('creator.mode.tab.cards'), icon: 'box' },
    ] : []),
    { value: 'bots', label: t('creator.mode.tab.bots'), icon: 'sparkles' },
    { value: 'test', label: t('creator.mode.tab.test'), icon: 'flag' },
    { value: 'history', label: t('creator.mode.tab.history'), icon: 'clock', count: data.history.length },
  ];

  const timerPaths = settingPaths.filter((p) => /sec$|Sec$|onTimeout/i.test(p));

  return (
    <Drawer
      wide
      title={`${gameName(t, mode.gameId)} · ${mode.label?.[language] || mode.id}`}
      subtitle={t('creator.mode.editorSubtitle', { id: mode.id, version: data.config.version })}
      onClose={onClose}
      footer={editable && (
        <>
          <TextInput value={note} onChange={setNote} placeholder={t('creator.mode.notePlaceholder')} className="max-w-xs" />
          <span className="flex-1" />
          <Button tone="subtle" onClick={() => setDraft(clone(data.config))} disabled={!dirty}>{t('creator.mode.discard')}</Button>
          <Button tone="primary" icon="check" disabled={!dirty || busy} onClick={save}>{t('creator.mode.save')}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">v{data.config.version}</Badge>
          {data.config.customized ? <Badge tone="violet">{t('creator.mode.customized')}</Badge> : <Badge>{t('creator.mode.shipped')}</Badge>}
          {dirty && <Badge tone="amber" dot>{t('creator.mode.unsaved')}</Badge>}
          {data.config.updatedAt && <span className="text-[11.5px] text-zinc-500">{t('creator.mode.updated', { date: formatDate(data.config.updatedAt, language), by: data.config.updatedBy || '—' })}</span>}
        </div>
        <p className="rounded-lg border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2 text-[12px] text-sky-100/90">{t('creator.mode.controlledNote')}</p>
        <Tabs value={tab} onChange={setTab} tabs={tabs} />

        {tab === 'general' && (
          <div className="flex flex-col gap-4">
            <LocalizedInputs label={t('creator.mode.label')} value={draft.label || {}} onChange={(label) => set({ label })} />
            <LocalizedInputs label={t('creator.mode.description')} value={draft.description || {}} onChange={(description) => set({ description })} multiline rows={3} />
            <FieldRow label={t('creator.mode.notes')}><TextArea value={draft.notes} onChange={(notes) => set({ notes })} rows={4} placeholder={t('creator.mode.notesPlaceholder')} /></FieldRow>
          </div>
        )}

        {tab === 'players' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldRow label={t('creator.mode.minPlayers')} hint={t('creator.mode.hardRange', { min: hardLimits.min, max: hardLimits.max })}>
                <NumberInput value={draft.minPlayers} min={hardLimits.min} max={hardLimits.max} onChange={(v) => set({ minPlayers: v === '' ? hardLimits.min : v })} />
              </FieldRow>
              <FieldRow label={t('creator.mode.maxPlayers')} hint={t('creator.mode.hardRange', { min: hardLimits.min, max: hardLimits.max })}>
                <NumberInput value={draft.maxPlayers} min={hardLimits.min} max={hardLimits.max} onChange={(v) => set({ maxPlayers: v === '' ? hardLimits.max : v })} />
              </FieldRow>
            </div>
            {draft.minPlayers > draft.maxPlayers && <p className="text-[12px] text-red-300">{t('creator.mode.minAboveMax')}</p>}
            <Toggle checked={draft.allowGuests} onChange={(allowGuests) => set({ allowGuests })} label={t('creator.mode.allowGuests')} hint={t('creator.mode.allowGuestsHint')} />
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-zinc-400">{t('creator.mode.settingsHint')}</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 3xl:grid-cols-3">
              {settingPaths.map((path) => (
                <SettingControl
                  key={path}
                  path={path}
                  value={getPath(draft.defaults, path)}
                  fallback={getPath(defaults.defaults, path)}
                  onChange={(v) => set({ defaults: setPath(draft.defaults, path, v) })}
                  locked={draft.locked.includes(path)}
                  onLock={() => toggleLock(path)}
                />
              ))}
            </div>
          </div>
        )}

        {tab === 'rules' && isMonopoly && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['startingMoney', 0, 1000000],
              ['goSalary', 0, 100000],
              ['jailFine', 0, 100000],
              ['maxJailTurns', 1, 10],
              ['mortgageRounds', 1, 100],
              ['auctionMs', 5000, 300000],
            ].map(([key, min, max]) => (
              <FieldRow key={key} label={t(`creator.rules.${key}`)} hint={t('creator.mode.defaultIs', { value: defaults.rules[key] })}>
                <NumberInput value={draft.rules[key]} min={min} max={max} onChange={(v) => set({ rules: { ...draft.rules, [key]: v === '' ? defaults.rules[key] : v } })} />
              </FieldRow>
            ))}
          </div>
        )}

        {tab === 'cards' && isMonopoly && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button tone="subtle" icon="refresh" onClick={() => set({ decks: clone(defaults.decks) })}>{t('creator.cards.resetDecks')}</Button>
            </div>
            {['chance', 'chest'].map((deckName) => (
              <DeckEditor
                key={deckName}
                title={t(`creator.cards.deck.${deckName}`)}
                deck={draft.decks[deckName]}
                cardTypes={data.cardTypes}
                roleTiles={data.roleTiles}
                onChange={(deck) => set({ decks: { ...draft.decks, [deckName]: deck } })}
              />
            ))}
          </div>
        )}

        {tab === 'bots' && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-zinc-400">{t('creator.bots.explain')}</p>
            {isMonopoly && (
              <FieldRow label={t('creator.bots.disconnectGrace')} hint={t('creator.bots.disconnectGraceHint')}>
                <NumberInput value={draft.bots?.disconnectGraceSec} min={10} max={3600} onChange={(v) => set({ bots: { ...(draft.bots || {}), disconnectGraceSec: v === '' ? 600 : v } })} />
              </FieldRow>
            )}
            {timerPaths.length ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {timerPaths.map((path) => (
                  <SettingControl
                    key={path}
                    path={path}
                    value={getPath(draft.defaults, path)}
                    fallback={getPath(defaults.defaults, path)}
                    onChange={(v) => set({ defaults: setPath(draft.defaults, path, v) })}
                    locked={draft.locked.includes(path)}
                    onLock={() => toggleLock(path)}
                  />
                ))}
              </div>
            ) : !isMonopoly && <p className="text-[12px] text-zinc-500">{t('creator.bots.noTimers')}</p>}
          </div>
        )}

        {tab === 'test' && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-zinc-400">{t('creator.mode.testDraftHint')}</p>
            <div>
              <Button tone="primary" icon="play" disabled={simulation === 'running' || !can('modes.test')} onClick={testDraft}>
                {dirty ? t('creator.mode.testDraft') : t('creator.mode.testSaved')}
              </Button>
            </div>
            {simulation === 'running' && <Spinner block />}
            {simulation && simulation !== 'running' && <SimulationResult result={simulation} />}
          </div>
        )}

        {tab === 'history' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label={t('creator.mode.currentVersion')} value={`v${data.config.version}`} icon="clock" />
              <StatCard label={t('creator.mode.savedVersions')} value={data.history.length} icon="box" accent="#a78bfa" />
            </div>
            {editable && data.config.customized && (
              <div><Button tone="danger" icon="refresh" onClick={resetAll}>{t('creator.mode.resetAll')}</Button></div>
            )}
            <ul className="flex flex-col gap-2">
              {data.config.version > 1 && !data.history.some((h) => h.version === 1) && (
                <li className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12.5px]">
                  <Badge>v1</Badge>
                  <span className="flex-1 text-zinc-400">{t('creator.mode.shippedVersion')}</span>
                  {editable && <Button onClick={() => restore(1)}>{t('creator.mode.restore')}</Button>}
                </li>
              )}
              {data.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12.5px]">
                  <Badge tone={h.version === data.config.version ? 'green' : 'zinc'}>v{h.version}</Badge>
                  <span className="min-w-0 flex-1 text-zinc-300">
                    {h.note || t('creator.mode.noNote')}
                    <span className="block text-[11px] text-zinc-500">{formatDate(h.createdAt, language)} · {h.createdBy || '—'}</span>
                  </span>
                  {editable && h.version !== data.config.version && <Button onClick={() => restore(h.version)}>{t('creator.mode.restore')}</Button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!editable && <Label>{t('creator.mode.readOnly')}</Label>}
      </div>
    </Drawer>
  );
}

// The fields the server stores (version and dates are its own).
function strip(config) {
  if (!config) return config;
  const {
    version, updatedAt, updatedBy, customized, ...rest
  } = config;
  return rest;
}
