// AccessSection.jsx
// Who runs the platform: the staff (Creators and administrators), the
// permission matrix exactly as the server enforces it, and appointing or
// removing roles (with a double confirmation).

import { useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import {
  Badge, Button, Card, ErrorState, Segmented, Spinner, Table,
} from '../../ui/dash';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  SearchBox, creatorRequest, useAction, useCreator, useDebounced,
} from '../kit';

export default function AccessSection({ token, admin }) {
  const { t, language } = useTranslation();
  const { ask } = useCreator();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/access', token);
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const users = useAdminData(q.length >= 2 ? `/api/admin/users?q=${encodeURIComponent(q)}` : null, token);
  const [, run] = useAction();

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  const setRole = async (user, role) => {
    if (user.role === role) return;
    const ok = await ask({
      title: t('creator.role.confirmTitle', { name: user.nickname }),
      message: t('creator.role.confirmText', { from: t(`creator.role.${user.role}`), to: t(`creator.role.${role}`) }),
      critical: true,
      typeToConfirm: role === 'creator' || user.role === 'creator' ? user.nickname : null,
      confirmLabel: t('creator.role.apply'),
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/users/${user.id}/role`, { method: 'PUT', body: { role, confirm: true } }), t('creator.role.changed'));
    if (out) {
      reload();
      users.reload();
    }
  };

  const RoleSwitch = ({ user }) => (
    user.roleLocked || user.id === admin.id
      ? <Badge>{user.id === admin.id ? t('creator.access.you') : t('creator.access.envLocked')}</Badge>
      : <Segmented value={user.role} onChange={(role) => setRole(user, role)} options={['user', 'admin', 'creator'].map((r) => ({ value: r, label: t(`creator.role.${r}`) }))} />
  );

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.access.title')} subtitle={t('creator.access.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      {!data.creatorDesignated && <p className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-4 py-3 text-[12.5px] text-amber-100">{t('creator.access.bootstrap')}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
        <Card title={t('creator.access.staff')} bodyClass="p-0">
          <Table
            rowKey={(u) => u.id}
            rows={data.staff}
            empty="—"
            columns={[
              {
                key: 'user',
                label: t('admin.col.user'),
                render: (u) => (
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${u.online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className="text-zinc-100">{u.nickname}</span>
                    <Badge tone={u.role === 'creator' ? 'violet' : 'amber'}>{t(`creator.role.${u.role}`)}</Badge>
                  </span>
                ),
              },
              { key: 'since', label: t('creator.access.since'), render: (u) => (u.roleSetAt ? formatDate(u.roleSetAt, language) : t('creator.access.fromConfig')) },
              { key: 'role', label: t('creator.access.role'), render: (u) => <RoleSwitch user={u} /> },
            ]}
          />
        </Card>
        <Card title={t('creator.access.appoint')} subtitle={t('creator.access.appointHint')}>
          <SearchBox value={query} onChange={setQuery} placeholder={t('admin.users.search')} />
          <ul className="mt-3 flex flex-col gap-2">
            {(users.data?.users || []).slice(0, 12).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">{u.nickname}</span>
                <RoleSwitch user={u} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={t('creator.access.matrix')} subtitle={t('creator.access.matrixHint')} bodyClass="p-0">
        <Table
          rowKey={(p) => p}
          rows={data.permissions}
          empty="—"
          columns={[
            { key: 'perm', label: t('creator.access.permission'), render: (p) => <span><span className="text-zinc-100">{t(`creator.perm.${p}`)}</span> <span className="font-mono text-[10.5px] text-zinc-600">{p}</span></span> },
            ...data.roles.map((role) => ({
              key: role,
              label: t(`creator.role.${role}`),
              align: 'right',
              render: (p) => (data.matrix[role].includes(p) ? <span className="text-emerald-300">✓</span> : <span className="text-zinc-700">—</span>),
            })),
          ]}
        />
      </Card>
    </div>
  );
}
