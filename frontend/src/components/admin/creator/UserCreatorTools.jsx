// UserCreatorTools.jsx
// The Creator's part of a user's drawer: role, crowns (add / remove / set
// with a reason and the balance history) and items (give / take away).

import { useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import { itemName, useCatalog } from '../../../lib/catalog';
import {
  Badge, Button, Card, Segmented, Spinner, Table,
} from '../../ui/dash';
import useAdminData from '../useAdminData';
import {
  FieldRow, NumberInput, SearchBox, Select, TextInput, creatorRequest, useAction, useCreator,
} from '../kit';

const LARGE = 10000;

export function RolePanel({ user, onChanged }) {
  const { t } = useTranslation();
  const { token, ask, can } = useCreator();
  const [role, setRole] = useState(user.role);
  const [busy, run] = useAction();
  if (!can('users.roles')) return null;

  const save = async () => {
    const ok = await ask({
      title: t('creator.role.confirmTitle', { name: user.nickname }),
      message: t('creator.role.confirmText', { from: t(`creator.role.${user.role}`), to: t(`creator.role.${role}`) }),
      critical: true,
      typeToConfirm: role === 'creator' ? user.nickname : null,
      confirmLabel: t('creator.role.apply'),
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/users/${user.id}/role`, { method: 'PUT', body: { role, confirm: true } }), t('creator.role.changed'));
    if (out) onChanged();
  };

  return (
    <Card title={t('creator.role.title')} subtitle={t('creator.role.subtitle')}>
      {user.roleLocked ? (
        <p className="text-[12.5px] text-zinc-400">{t('creator.role.locked')}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            value={role}
            onChange={setRole}
            options={['user', 'admin', 'creator'].map((r) => ({ value: r, label: t(`creator.role.${r}`) }))}
          />
          <Button tone="primary" disabled={busy || role === user.role} onClick={save}>{t('creator.role.apply')}</Button>
        </div>
      )}
    </Card>
  );
}

export function CrownsPanel({ user }) {
  const { t, language } = useTranslation();
  const { token, ask, can } = useCreator();
  const { data, reload } = useAdminData(can('economy.view') ? `/api/admin/users/${encodeURIComponent(user.id)}/economy` : null, token);
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, run] = useAction();
  if (!can('economy.view')) return null;
  if (!data) return <Spinner block />;

  const balance = data.wallet.balance;
  const value = Number(amount) || 0;
  const target = mode === 'set' ? value : mode === 'add' ? balance + value : Math.max(0, balance - value);
  const valid = reason.trim().length >= 3 && amount !== '' && (mode === 'set' || value > 0);

  const submit = async () => {
    const large = Math.abs(target - balance) >= LARGE;
    const ok = await ask({
      title: t('creator.crowns.confirmTitle'),
      message: t('creator.crowns.confirmText', { name: user.nickname, from: balance.toLocaleString(), to: target.toLocaleString() }),
      critical: large || mode === 'set',
      confirmLabel: t('creator.crowns.apply'),
      tone: 'primary',
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/users/${user.id}/balance`, {
      method: 'POST',
      body: {
        mode, amount: value, reason: reason.trim(), confirm: true, confirmLarge: large,
      },
    }), t('creator.crowns.done', { balance: target.toLocaleString() }));
    if (out) {
      setAmount('');
      setReason('');
      reload();
    }
  };

  return (
    <Card title={t('creator.crowns.title')} subtitle={t('creator.crowns.balance', { n: balance.toLocaleString() })} bodyClass="p-0">
      <div className="grid gap-3 p-4 sm:grid-cols-[auto,140px,1fr,auto] sm:items-end">
        <Segmented
          value={mode}
          onChange={setMode}
          options={['add', 'remove', 'set'].map((m) => ({ value: m, label: t(`creator.crowns.mode.${m}`) }))}
        />
        <FieldRow label={t('creator.crowns.amount')}><NumberInput value={amount} min={0} onChange={setAmount} /></FieldRow>
        <FieldRow label={t('creator.crowns.reason')}><TextInput value={reason} onChange={setReason} placeholder={t('creator.crowns.reasonPlaceholder')} maxLength={300} /></FieldRow>
        <Button tone="primary" icon="coin" disabled={!valid || busy} onClick={submit}>{t('creator.crowns.apply')}</Button>
      </div>
      {amount !== '' && (
        <p className="px-4 pb-3 text-[12px] text-zinc-400">
          {t('creator.crowns.preview', { from: balance.toLocaleString(), to: target.toLocaleString() })}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] px-4 py-3 text-[12px]">
        <span className="text-zinc-500">{t('creator.crowns.earned')}: <b className="text-zinc-200 tnum">{data.wallet.earned.toLocaleString()}</b></span>
        <span className="text-zinc-500">{t('creator.crowns.spent')}: <b className="text-zinc-200 tnum">{data.wallet.spent.toLocaleString()}</b></span>
        <span className="text-zinc-500">{t('creator.crowns.streak')}: <b className="text-zinc-200 tnum">{data.wallet.winStreak}</b></span>
      </div>
      <div className="max-h-80 overflow-y-auto border-t border-white/[0.06]">
        <Table
          rowKey={(r) => r.id}
          rows={data.ledger}
          empty={t('creator.crowns.noHistory')}
          columns={[
            { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.createdAt, language) },
            { key: 'kind', label: t('creator.crowns.kind'), render: (r) => <Badge tone={r.kind === 'admin' ? 'violet' : 'zinc'}>{t(`creator.ledger.${r.kind}`)}</Badge> },
            {
              key: 'amount', label: t('creator.crowns.amount'), align: 'right', render: (r) => <span className={r.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}>{r.amount > 0 ? '+' : ''}{r.amount.toLocaleString()}</span>,
            },
            {
              key: 'detail',
              label: t('creator.crowns.detail'),
              render: (r) => (
                <span className="text-zinc-400">
                  {r.kind === 'admin' ? `${r.details?.reason || ''} · ${r.details?.byName || ''} (${(r.details?.before ?? 0).toLocaleString()} → ${(r.details?.after ?? 0).toLocaleString()})` : r.ref}
                </span>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
}

export function ItemsPanel({ user }) {
  const { t, language } = useTranslation();
  const { token, ask, can } = useCreator();
  const catalog = useCatalog();
  const { data, reload } = useAdminData(can('economy.view') ? `/api/admin/users/${encodeURIComponent(user.id)}/economy` : null, token);
  const [query, setQuery] = useState('');
  const [itemId, setItemId] = useState('');
  const [busy, run] = useAction();
  const owned = useMemo(() => new Set((data?.inventory || []).map((i) => i.itemId)), [data]);
  const options = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.items
      .filter((i) => !owned.has(i.id))
      .filter((i) => !q || `${i.id} ${i.name.en} ${i.name.ru}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [catalog, owned, query]);
  if (!can('items.grant') || !can('economy.view')) return null;
  if (!data || !catalog) return <Spinner block />;

  const grant = async () => {
    const out = await run(() => creatorRequest(token, `/api/admin/users/${user.id}/items`, { method: 'POST', body: { itemId } }), t('creator.items.granted'));
    if (out) {
      setItemId('');
      reload();
    }
  };
  const revoke = async (id) => {
    const item = catalog.byId.get(id);
    const ok = await ask({
      title: t('creator.items.revokeTitle'),
      message: t('creator.items.revokeText', { item: itemName(item, language) || id, name: user.nickname }),
      critical: true,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/users/${user.id}/items/${encodeURIComponent(id)}`, { method: 'DELETE', body: { confirm: true } }), t('creator.items.revoked'));
    if (out) reload();
  };

  return (
    <Card title={t('creator.items.title')} subtitle={t('creator.items.count', { n: data.inventory.length })} bodyClass="p-0">
      <div className="grid gap-2 p-4 sm:grid-cols-[1fr,1.4fr,auto] sm:items-end">
        <FieldRow label={t('common.search')}><SearchBox value={query} onChange={setQuery} placeholder={t('creator.items.search')} /></FieldRow>
        <FieldRow label={t('creator.items.item')}>
          <Select
            value={itemId}
            onChange={setItemId}
            options={[{ value: '', label: '—' }, ...options.map((i) => ({ value: i.id, label: `${itemName(i, language)} · ${t(`slot.${i.slot}`)} · ${i.rarity}` }))]}
          />
        </FieldRow>
        <Button tone="primary" icon="gift" disabled={!itemId || busy} onClick={grant}>{t('creator.items.grant')}</Button>
      </div>
      <ul className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto border-t border-white/[0.06]">
        {data.inventory.map((row) => {
          const item = catalog.byId.get(row.itemId);
          return (
            <li key={row.itemId} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-zinc-100">{itemName(item, language) || row.itemId}</span>
                <span className="block truncate text-[11px] text-zinc-500">{item ? t(`slot.${item.slot}`) : row.itemId} · {t(`notif.item.reason.${row.source}`)} · {formatDate(row.acquiredAt, language)}</span>
              </span>
              {row.source !== 'starter' && <Button tone="danger" icon="close" onClick={() => revoke(row.itemId)}>{t('creator.items.revoke')}</Button>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
