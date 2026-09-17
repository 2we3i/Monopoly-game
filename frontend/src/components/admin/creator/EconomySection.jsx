// EconomySection.jsx
// The crown economy: totals, every wallet (select several to change their
// balances at once), the Creator's balance operations and the full ledger
// with filters. Every change needs a reason and is written to the journal.

import { useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import { itemName, useCatalog } from '../../../lib/catalog';
import {
  Badge, Button, Card, ErrorState, HBarList, Segmented, Spinner, StatCard, Table,
} from '../../ui/dash';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  FieldRow, NumberInput, SearchBox, Select, Tabs, TextInput, creatorRequest, useAction, useCreator,
} from '../kit';

const LEDGER_KINDS = ['', 'admin', 'match', 'purchase', 'achievement', 'streak', 'first_win_day'];

function BulkPanel({ selected, wallets, onDone, onClear }) {
  const { t } = useTranslation();
  const { token, ask } = useCreator();
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, run] = useAction();
  const names = wallets.filter((w) => selected.has(w.accountId)).map((w) => w.nickname);
  const valid = selected.size > 0 && reason.trim().length >= 3 && amount !== '' && (mode === 'set' || Number(amount) > 0);

  const submit = async () => {
    const ok = await ask({
      title: t('creator.economy.bulkTitle', { n: selected.size }),
      message: t(`creator.economy.bulkText.${mode}`, { amount: Number(amount).toLocaleString(), n: selected.size }),
      details: <p className="max-h-32 overflow-y-auto text-[12px] text-zinc-400">{names.join(', ')}</p>,
      critical: true,
      typeToConfirm: String(selected.size),
      confirmLabel: t('creator.crowns.apply'),
      tone: 'primary',
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, '/api/admin/economy/bulk', {
      method: 'POST',
      body: {
        accountIds: [...selected], mode, amount: Number(amount), reason: reason.trim(), confirm: true, confirmLarge: true,
      },
    }));
    if (out) {
      ask({
        title: t('creator.economy.bulkDone', { n: out.changed }),
        message: out.results.filter((r) => !r.ok).map((r) => `${r.accountId}: ${r.error}`).join('\n') || t('creator.economy.bulkAllOk'),
        tone: 'primary',
        confirmLabel: 'OK',
      });
      setAmount('');
      setReason('');
      onDone();
    }
  };

  return (
    <Card title={t('creator.economy.bulk')} subtitle={t('creator.economy.selected', { n: selected.size })} action={selected.size > 0 && <Button tone="subtle" onClick={onClear}>{t('creator.economy.clearSelection')}</Button>}>
      <div className="grid gap-3 lg:grid-cols-[auto,140px,1fr,auto] lg:items-end">
        <Segmented value={mode} onChange={setMode} options={['add', 'remove', 'set'].map((m) => ({ value: m, label: t(`creator.crowns.mode.${m}`) }))} />
        <FieldRow label={t('creator.crowns.amount')}><NumberInput value={amount} min={0} onChange={setAmount} /></FieldRow>
        <FieldRow label={t('creator.crowns.reason')}><TextInput value={reason} onChange={setReason} placeholder={t('creator.crowns.reasonPlaceholder')} /></FieldRow>
        <Button tone="primary" icon="coin" disabled={!valid || busy} onClick={submit}>{t('creator.economy.applyBulk')}</Button>
      </div>
      {selected.size === 0 && <p className="mt-2 text-[12px] text-zinc-500">{t('creator.economy.selectHint')}</p>}
    </Card>
  );
}

export default function EconomySection({ token }) {
  const { t, language } = useTranslation();
  const catalog = useCatalog();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/economy', token, 30000);
  const [tab, setTab] = useState('wallets');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [kind, setKind] = useState('');
  const ledger = useAdminData(tab === 'ledger' ? `/api/admin/economy/ledger?kind=${kind}&limit=300` : null, token);

  const wallets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.wallets || []).filter((w) => !q || w.nickname.toLowerCase().includes(q) || w.accountId.includes(q));
  }, [data, query]);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;
  const { totals } = data;

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allVisible = wallets.length > 0 && wallets.every((w) => selected.has(w.accountId));
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s);
    wallets.forEach((w) => (allVisible ? next.delete(w.accountId) : next.add(w.accountId)));
    return next;
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.economy.title')} subtitle={t('creator.economy.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t('creator.economy.circulation')} value={totals.circulation.toLocaleString()} icon="coin" />
        <StatCard label={t('creator.economy.earned')} value={totals.earned.toLocaleString()} icon="trophy" accent="#34d399" />
        <StatCard label={t('creator.economy.spent')} value={totals.spent.toLocaleString()} icon="bag" accent="#f472b6" />
        <StatCard label={t('creator.economy.adminAdded')} value={`+${totals.adminAdded.toLocaleString()}`} icon="plus" accent="#a78bfa" />
        <StatCard label={t('creator.economy.adminRemoved')} value={`−${totals.adminRemoved.toLocaleString()}`} icon="close" accent="#f87171" />
        <StatCard label={t('creator.economy.purchases')} value={totals.purchases} hint={t('creator.economy.itemsOwned', { n: totals.itemsOwned })} icon="box" accent="#60a5fa" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'wallets', label: t('creator.economy.wallets'), icon: 'users', count: data.wallets.length },
          { value: 'operations', label: t('creator.economy.operations'), icon: 'shield', count: data.adminOperations.length },
          { value: 'ledger', label: t('creator.economy.ledger'), icon: 'filter' },
          { value: 'breakdown', label: t('creator.economy.breakdown'), icon: 'chart' },
        ]}
      />

      {tab === 'wallets' && (
        <>
          <BulkPanel selected={selected} wallets={data.wallets} onDone={reload} onClear={() => setSelected(new Set())} />
          <SearchBox value={query} onChange={setQuery} placeholder={t('admin.users.search')} className="sm:w-72" />
          <Card bodyClass="p-0">
            <Table
              rowKey={(w) => w.accountId}
              rows={wallets}
              onRowClick={(w) => toggle(w.accountId)}
              empty={t('admin.users.empty')}
              columns={[
                { key: 'sel', label: <input type="checkbox" checked={allVisible} onChange={toggleAll} onClick={(e) => e.stopPropagation()} className="accent-brass" />, render: (w) => <input type="checkbox" checked={selected.has(w.accountId)} readOnly className="accent-brass" /> },
                {
                  key: 'user',
                  label: t('admin.col.user'),
                  render: (w) => (
                    <span className="flex items-center gap-2">
                      <span className="text-zinc-100">{w.nickname}</span>
                      {w.status === 'blocked' && <Badge tone="red">{t('admin.status.blocked')}</Badge>}
                    </span>
                  ),
                },
                { key: 'balance', label: t('creator.col.crowns'), align: 'right', render: (w) => <span className="font-semibold text-brass-light">{w.balance.toLocaleString()}</span> },
                { key: 'earned', label: t('creator.crowns.earned'), align: 'right', render: (w) => w.earned.toLocaleString() },
                { key: 'spent', label: t('creator.crowns.spent'), align: 'right', render: (w) => w.spent.toLocaleString() },
                { key: 'streak', label: t('creator.crowns.streak'), align: 'right', render: (w) => `${w.winStreak} / ${w.bestStreak}` },
                { key: 'updated', label: t('creator.economy.updated'), render: (w) => (w.updatedAt ? formatDate(w.updatedAt, language) : '—') },
              ]}
            />
          </Card>
        </>
      )}

      {tab === 'operations' && (
        <Card bodyClass="p-0">
          <Table
            rowKey={(e) => e.id}
            rows={data.adminOperations}
            empty={t('creator.crowns.noHistory')}
            columns={[
              { key: 'date', label: t('stats.date'), render: (e) => formatDate(e.createdAt, language) },
              { key: 'user', label: t('admin.col.user'), render: (e) => e.nickname || e.accountId },
              { key: 'mode', label: t('creator.economy.operation'), render: (e) => <Badge tone="violet">{t(`creator.crowns.mode.${e.details?.mode || 'add'}`)}</Badge> },
              { key: 'amount', label: t('creator.crowns.amount'), align: 'right', render: (e) => <span className={e.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}>{e.amount > 0 ? '+' : ''}{e.amount.toLocaleString()}</span> },
              { key: 'balance', label: t('creator.economy.balanceChange'), render: (e) => `${(e.details?.before ?? 0).toLocaleString()} → ${(e.details?.after ?? 0).toLocaleString()}` },
              { key: 'reason', label: t('creator.crowns.reason'), render: (e) => <span className="text-zinc-400">{e.details?.reason}</span> },
              { key: 'by', label: t('creator.logs.who'), render: (e) => e.details?.byName || '—' },
            ]}
          />
        </Card>
      )}

      {tab === 'ledger' && (
        <>
          <div className="w-60">
            <Select value={kind} onChange={setKind} options={LEDGER_KINDS.map((k) => ({ value: k, label: k ? t(`creator.ledger.${k}`) : t('common.all') }))} />
          </div>
          <Card bodyClass="p-0">
            {!ledger.data ? <Spinner block /> : (
              <Table
                rowKey={(e) => e.id}
                rows={ledger.data.entries}
                empty={t('creator.crowns.noHistory')}
                columns={[
                  { key: 'date', label: t('stats.date'), render: (e) => formatDate(e.createdAt, language) },
                  { key: 'user', label: t('admin.col.user'), render: (e) => e.nickname || e.accountId },
                  { key: 'kind', label: t('creator.crowns.kind'), render: (e) => <Badge tone={e.kind === 'admin' ? 'violet' : 'zinc'}>{t(`creator.ledger.${e.kind}`)}</Badge> },
                  { key: 'amount', label: t('creator.crowns.amount'), align: 'right', render: (e) => <span className={e.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}>{e.amount > 0 ? '+' : ''}{e.amount.toLocaleString()}</span> },
                  {
                    key: 'ref',
                    label: t('creator.crowns.detail'),
                    render: (e) => (
                      <span className="text-zinc-400">
                        {e.kind === 'purchase' && catalog ? itemName(catalog.byId.get(e.ref), language) || e.ref : e.kind === 'admin' ? e.details?.reason : e.ref}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      {tab === 'breakdown' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={t('creator.economy.byKind')}>
            <HBarList
              items={totals.byKind.map((k) => ({
                key: k.kind, label: t(`creator.ledger.${k.kind}`), value: k.n, color: k.kind === 'admin' ? '#a78bfa' : '#d4a52c', sub: t('creator.economy.kindSum', { total: k.total.toLocaleString() }),
              }))}
              emptyText={t('admin.chart.empty')}
            />
          </Card>
          <Card title={t('creator.economy.topItems')}>
            <HBarList
              items={totals.topItems.map((i) => ({
                key: i.itemId, label: catalog ? itemName(catalog.byId.get(i.itemId), language) || i.itemId : i.itemId, value: i.n, color: '#f472b6', sub: t('creator.economy.itemCrowns', { n: i.crowns.toLocaleString() }),
              }))}
              emptyText={t('admin.chart.empty')}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
