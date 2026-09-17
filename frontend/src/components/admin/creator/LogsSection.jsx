// LogsSection.jsx
// The Creator's journal - every administrative action with who did it, in
// which role, when, on what, the value before and after, and why - with
// search and filters; and the server error log per game.

import { Fragment, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import {
  Badge, Button, Card, ErrorState, Segmented, Spinner,
} from '../../ui/dash';
import { gameName } from '../../ui/labels';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  SearchBox, Select, Tabs, ValueDiff, creatorRequest, useAction, useCreator, useDebounced,
} from '../kit';

const TARGET_TYPES = ['', 'user', 'mode', 'item', 'board', 'field', 'meme', 'meme-pack', 'media', 'game', 'lobby', 'settings', 'logs'];
const GAMES = ['', 'monopoly', 'mafia', 'citadels', 'bunker', 'catan', 'cosmic', 'throne', 'chpok', 'memehype'];

function Journal({ token }) {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [critical, setCritical] = useState('all');
  const [open, setOpen] = useState(null);
  const q = useDebounced(query);
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData(`/api/admin/logs/audit?q=${encodeURIComponent(q)}&action=${action}&targetType=${targetType}&critical=${critical === 'critical' ? 1 : 0}&limit=300`, token, 20000);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title={t('creator.logs.journal')} subtitle={t('creator.logs.journalHint')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder={t('creator.logs.search')} className="sm:w-72" />
        <div className="w-56">
          <Select value={action} onChange={setAction} options={[{ value: '', label: t('creator.logs.anyAction') }, ...(data?.actions || []).map((a) => ({ value: a.action, label: `${t(`creator.action.${a.action}`)} (${a.n})` }))]} />
        </div>
        <div className="w-48">
          <Select value={targetType} onChange={setTargetType} options={TARGET_TYPES.map((v) => ({ value: v, label: v ? t(`creator.target.${v}`) : t('creator.logs.anyTarget') }))} />
        </div>
        <Segmented value={critical} onChange={setCritical} options={[{ value: 'all', label: t('common.all') }, { value: 'critical', label: t('creator.logs.criticalOnly') }]} />
      </div>
      {!data ? (error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />) : (
        <Card bodyClass="p-0">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full text-left text-[12.5px] 4xl:text-[14.5px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10.5px] uppercase tracking-wider text-zinc-500">
                  <th className="px-3 py-2.5 font-medium">{t('creator.logs.when')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('creator.logs.who')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('creator.logs.action')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('creator.logs.target')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('creator.logs.change')}</th>
                  <th className="px-3 py-2.5 font-medium">{t('creator.logs.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-zinc-500">{t('admin.audit.empty')}</td></tr>}
                {data.entries.map((e) => (
                  <Fragment key={e.id}>
                    <tr onClick={() => setOpen(open === e.id ? null : e.id)} className="cursor-pointer border-b border-white/[0.04] align-top hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{formatDate(e.createdAt, language)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="text-zinc-100">{e.adminName}</span>
                        {e.adminRole && <span className="ml-1.5"><Badge tone={e.adminRole === 'creator' ? 'violet' : 'amber'}>{t(`creator.role.${e.adminRole}`)}</Badge></span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2"><Badge tone={e.critical ? 'red' : 'zinc'} dot={e.critical}>{t(`creator.action.${e.action}`)}</Badge></td>
                      <td className="px-3 py-2 text-zinc-300">
                        {e.targetType && <span className="mr-1 text-[10.5px] uppercase text-zinc-500">{t(`creator.target.${e.targetType}`)}</span>}
                        {e.targetLabel || e.details?.nickname || e.target || '—'}
                      </td>
                      <td className="max-w-[340px] px-3 py-2 text-zinc-400">
                        {e.oldValue?.balance !== undefined || e.newValue?.balance !== undefined
                          ? `${(e.oldValue?.balance ?? '—').toLocaleString()} → ${(e.newValue?.balance ?? '—').toLocaleString()}`
                          : e.oldValue?.role || e.newValue?.role
                            ? `${e.oldValue?.role || '—'} → ${e.newValue?.role || '—'}`
                            : (e.oldValue || e.newValue ? t('creator.logs.expand') : '—')}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{e.reason || '—'}</td>
                    </tr>
                    {open === e.id && (
                      <tr className="border-b border-white/[0.04] bg-black/20">
                        <td colSpan={6} className="px-3 py-3">
                          <ValueDiff before={e.oldValue} after={e.newValue} />
                          {e.details && <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/30 p-2 text-[11px] text-zinc-400">{JSON.stringify(e.details, null, 2)}</pre>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Errors({ token }) {
  const { t, language } = useTranslation();
  const { ask } = useCreator();
  const [game, setGame] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const q = useDebounced(query);
  const [, run] = useAction();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData(`/api/admin/logs/errors?gameType=${game}&q=${encodeURIComponent(q)}&limit=300`, token, 20000);

  const clear = async () => {
    const ok = await ask({ title: t('creator.errors.clearTitle'), message: t('creator.errors.clearText'), critical: true });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, '/api/admin/logs/errors', { method: 'DELETE', body: { confirm: true } }), t('creator.errors.cleared'));
    if (out) reload();
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title={t('creator.errors.title')} subtitle={t('creator.errors.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading}>
        <Button tone="danger" icon="close" onClick={clear}>{t('creator.errors.clear')}</Button>
      </SectionHeader>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder={t('creator.errors.search')} className="sm:w-72" />
        <div className="w-52">
          <Select value={game} onChange={setGame} options={GAMES.map((g) => ({ value: g, label: g ? `${gameName(t, g)}${data?.counts?.[g] ? ` (${data.counts[g]})` : ''}` : t('creator.errors.anyGame') }))} />
        </div>
      </div>
      {!data ? (error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />) : (
        <Card bodyClass="p-0">
          {data.entries.length === 0 ? <p className="py-10 text-center text-[12.5px] text-zinc-500">{t('creator.errors.empty')}</p> : (
            <ul className="divide-y divide-white/[0.05]">
              {data.entries.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]">
                    <Badge tone={e.level === 'fatal' ? 'red' : 'amber'}>{e.level}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[12.5px] text-red-100">{e.message}</span>
                      <span className="block text-[11px] text-zinc-500">{formatDate(e.createdAt, language)} · {e.source}{e.gameType ? ` · ${gameName(t, e.gameType)}` : ''}</span>
                    </span>
                  </button>
                  {open === e.id && (e.stack || e.context) && (
                    <pre className="scrollbar-thin mx-4 mb-3 max-h-72 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-zinc-300">{e.stack}{e.context ? `\n\n${JSON.stringify(e.context, null, 2)}` : ''}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

export default function LogsSection({ token }) {
  const { t } = useTranslation();
  const { can } = useCreator();
  const [tab, setTab] = useState('journal');
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'journal', label: t('creator.logs.journal'), icon: 'shield' },
          ...(can('errors.view') ? [{ value: 'errors', label: t('creator.errors.title'), icon: 'flag' }] : []),
        ]}
      />
      {tab === 'journal' ? <Journal token={token} /> : <Errors token={token} />}
    </div>
  );
}
