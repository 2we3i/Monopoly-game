// UsersSection.jsx
// Every registered account with its statistics, search and filters, and
// the account drawer where the admin blocks or unblocks a player. The
// Creator also sees crowns, changes roles, balances and items here.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatDate, formatDuration, percent } from '../../lib/api';
import { useCitadelsConfig } from '../../hooks/useCitadels';
import {
  Badge, Button, Card, CopyButton, Dialog, Drawer, ErrorState, Field, GAME_COLORS, Segmented, Spinner, StatCard, Table,
} from '../ui/dash';
import CitadelsStatsCard from '../ui/CitadelsStats';
import {
  gameName, modeName, resultTone, stageTone,
} from '../ui/labels';
import SectionHeader from './SectionHeader';
import useAdminData, { adminAction } from './useAdminData';
import { CrownsPanel, ItemsPanel, RolePanel } from './creator/UserCreatorTools';
import { Tabs, useCreator } from './kit';

function RoleBadge({ role }) {
  const { t } = useTranslation();
  if (role === 'creator') return <Badge tone="violet">{t('creator.role.creator')}</Badge>;
  if (role === 'admin') return <Badge tone="amber">{t('admin.roleAdmin')}</Badge>;
  return null;
}

function favourite(t, fav) {
  return fav ? `${gameName(t, fav.gameType)} · ${modeName(t, fav.modeId)}` : '—';
}

function BlockDialog({
  user, token, onClose, onDone,
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [removeFromRooms, setRemoveFromRooms] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const valid = reason.trim().length >= 3 && acknowledged;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminAction(`/api/admin/users/${user.id}/block`, token, { reason: reason.trim(), removeFromRooms });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('admin.user.blockTitle', { name: user.nickname })}
      onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button tone="danger" icon="ban" disabled={!valid || busy} onClick={submit}>{t('admin.user.block')}</Button>
        </>
      )}
    >
      <p className="text-zinc-400">{t('admin.user.blockText')}</p>
      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wider text-zinc-500" htmlFor="block-reason">{t('admin.user.reason')}</label>
      <textarea
        id="block-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        rows={3}
        placeholder={t('admin.user.reasonPlaceholder')}
        className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-red-400/50 focus:outline-none"
      />
      <p className="mt-0.5 text-right text-[10.5px] text-zinc-600 tnum">{reason.length}/300</p>
      <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12.5px] text-zinc-300">
        <input type="checkbox" checked={removeFromRooms} onChange={(e) => setRemoveFromRooms(e.target.checked)} className="mt-0.5 accent-red-400" />
        {t('admin.user.removeFromRooms')}
      </label>
      <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12.5px] text-zinc-300">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 accent-red-400" />
        {t('admin.user.confirmBlock', { name: user.nickname })}
      </label>
      {error && <p className="mt-3 text-red-300">{error}</p>}
    </Dialog>
  );
}

function UserDrawer({
  id, token, onClose, onChanged,
}) {
  const { t, language } = useTranslation();
  const config = useCitadelsConfig();
  const {
    data, error, reload,
  } = useAdminData(`/api/admin/users/${encodeURIComponent(id)}`, token);
  const [dialog, setDialog] = useState(null); // 'block' | 'unblock'
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('profile');
  const creator = useCreator();
  const isCreator = creator?.me?.role === 'creator';

  const done = () => {
    setDialog(null);
    setBusy(false);
    reload();
    onChanged();
  };

  const unblock = async () => {
    setBusy(true);
    try {
      await adminAction(`/api/admin/users/${id}/unblock`, token);
      done();
    } catch {
      setBusy(false);
    }
  };

  const user = data?.user;
  const stats = data?.stats;

  return (
    <Drawer
      title={user ? user.nickname : '…'}
      subtitle={user ? user.id : null}
      onClose={onClose}
      footer={user && (
        <>
          {user.role === 'creator' || (user.role === 'admin' && !isCreator) ? (
            <p className="text-[12px] text-zinc-500">{t('admin.user.cannotBlockAdmin')}</p>
          ) : user.status === 'blocked' ? (
            <Button tone="success" icon="check" onClick={() => setDialog('unblock')}>{t('admin.user.unblock')}</Button>
          ) : (
            <Button tone="danger" icon="ban" onClick={() => setDialog('block')}>{t('admin.user.block')}</Button>
          )}
          <span className="flex-1" />
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      )}
    >
      {!data && (error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />)}
      {user && isCreator && (
        <div className="mb-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'profile', label: t('creator.user.tab.profile'), icon: 'user' },
              { value: 'crowns', label: t('creator.user.tab.crowns'), icon: 'coin' },
              { value: 'items', label: t('creator.user.tab.items'), icon: 'gift' },
              { value: 'role', label: t('creator.user.tab.role'), icon: 'lock' },
            ]}
          />
        </div>
      )}
      {user && isCreator && tab === 'crowns' && <CrownsPanel user={user} />}
      {user && isCreator && tab === 'items' && <ItemsPanel user={user} />}
      {user && isCreator && tab === 'role' && <RolePanel user={user} onChanged={() => { reload(); onChanged(); }} />}
      {user && tab === 'profile' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <Field label={t('admin.col.user')}>
              <span className="flex flex-wrap items-center gap-1.5">
                {user.nickname}
                <RoleBadge role={user.role} />
              </span>
            </Field>
            <Field label={t('admin.user.id')}>
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <span className="truncate">{user.id}</span>
                <CopyButton text={user.id} label="" copiedLabel="" />
              </span>
            </Field>
            <Field label={t('admin.col.registered')}>{formatDate(user.createdAt, language)}</Field>
            <Field label={t('admin.col.lastLogin')}>{user.lastLoginAt ? formatDate(user.lastLoginAt, language) : t('common.never')}</Field>
            <Field label={t('admin.user.lastSeen')}>{user.lastSeenAt ? formatDate(user.lastSeenAt, language) : t('common.never')}</Field>
            <Field label={t('admin.col.online')}>
              <Badge tone={user.online ? 'green' : 'zinc'} dot>{user.online ? t('admin.online') : t('admin.offline')}</Badge>
            </Field>
            <Field label={t('admin.col.accountStatus')}>
              <Badge tone={user.status === 'blocked' ? 'red' : 'green'}>{t(`admin.status.${user.status}`)}</Badge>
            </Field>
            <Field label={t('admin.col.favourite')}>{favourite(t, stats.favouriteMode)}</Field>
          </div>

          {user.status === 'blocked' && (
            <div className="rounded-xl border border-red-400/25 bg-red-500/[0.07] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-red-300">{t('admin.user.blockInfo')}</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label={t('admin.user.blockReason')}>{user.blockedReason}</Field>
                <Field label={t('admin.user.blockedAt')}>{formatDate(user.blockedAt, language)}</Field>
                <Field label={t('admin.user.blockedBy')}>{user.blockedByName}</Field>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label={t('stats.played')} value={stats.played} hint={t('stats.finishedHint', { finished: stats.finished, unfinished: stats.unfinished })} />
            <StatCard label={t('stats.wins')} value={stats.wins} accent="#34d399" hint={t('stats.lossesHint', { n: stats.losses, rate: percent(stats.winRate) })} />
            <StatCard label={t('stats.timePlayed')} value={formatDuration(stats.timeMs, t)} hint={t('stats.createdHint', { n: stats.created })} />
          </div>

          <Card title={t('admin.user.rooms')} bodyClass="p-3">
            {data.rooms.length === 0 ? <p className="text-center text-[12px] text-zinc-500">{t('admin.user.noRooms')}</p> : (
              <ul className="flex flex-col gap-1.5">
                {data.rooms.map((r) => (
                  <li key={r.code} className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAME_COLORS[r.gameType] }} />
                    <span className="font-mono text-zinc-100">{r.code}</span>
                    <span className="text-zinc-400">{gameName(t, r.gameType)}</span>
                    <Badge tone={stageTone(r.stage)}>{t(`admin.stage.${r.stage}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('admin.user.recent')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.matchId}
              rows={stats.recent}
              empty={t('profile.recentEmpty')}
              columns={[
                { key: 'game', label: t('stats.game'), render: (r) => `${gameName(t, r.gameType)} · ${modeName(t, r.modeId)}` },
                { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.startedAt, language) },
                { key: 'result', label: t('stats.result'), render: (r) => <Badge tone={resultTone(r.result, r.status)}>{t(`result.${r.result || r.status}`)}</Badge> },
              ]}
            />
          </Card>

          <CitadelsStatsCard stats={data.citadels} config={config} title={t('citadels.stats.userTitle')} />
        </div>
      )}

      {dialog === 'block' && user && <BlockDialog user={user} token={token} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'unblock' && user && (
        <Dialog
          title={t('admin.user.unblockTitle', { name: user.nickname })}
          onClose={() => setDialog(null)}
          footer={(
            <>
              <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button tone="success" disabled={busy} onClick={unblock}>{t('admin.user.unblock')}</Button>
            </>
          )}
        >
          {t('admin.user.unblockText')}
        </Dialog>
      )}
    </Drawer>
  );
}

export default function UsersSection({ token }) {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [activity, setActivity] = useState('all');
  const [role, setRole] = useState('all');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const path = `/api/admin/users?q=${encodeURIComponent(debounced)}&status=${status}&activity=${activity}&role=${role}`;
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData(path, token, 20000);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={data ? t('admin.users.count', { n: data.total }) : t('admin.nav.users')}
        updatedAt={updatedAt}
        onRefresh={reload}
        loading={loading}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.users.search')}
          className="h-9 min-w-[240px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-brass/60 focus:outline-none sm:flex-none"
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={['all', 'active', 'blocked'].map((v) => ({ value: v, label: t(`admin.users.status.${v}`) }))}
        />
        <select
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          className="h-9 rounded-lg border border-white/10 bg-[#121418] px-2.5 text-[12.5px] text-zinc-200 focus:border-brass/60 focus:outline-none"
          aria-label={t('admin.users.activityLabel')}
        >
          {['all', 'online', 'week', 'inactive', 'never'].map((v) => (
            <option key={v} value={v}>{t(`admin.users.activity.${v}`)}</option>
          ))}
        </select>
        <Segmented
          value={role}
          onChange={setRole}
          options={['all', 'user', 'admin', 'creator'].map((v) => ({ value: v, label: v === 'all' ? t('creator.role.any') : t(`creator.role.${v}`) }))}
        />
      </div>

      {!data ? (
        error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />
      ) : (
        <Card bodyClass="p-0">
          <Table
            rowKey={(u) => u.id}
            rows={data.users}
            onRowClick={(u) => setOpenId(u.id)}
            empty={t('admin.users.empty')}
            columns={[
              {
                key: 'user',
                label: t('admin.col.user'),
                render: (u) => (
                  <span className="flex items-center gap-2.5">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[12px] font-semibold text-zinc-200">
                      {u.nickname.slice(0, 1).toUpperCase()}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#121418] ${u.online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    </span>
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1.5 text-zinc-100">
                        {u.nickname}
                        <RoleBadge role={u.role} />
                      </span>
                      <span className="font-mono text-[10.5px] text-zinc-600">{u.id.slice(0, 13)}…</span>
                    </span>
                  </span>
                ),
              },
              { key: 'registered', label: t('admin.col.registered'), render: (u) => formatDate(u.createdAt, language, false) },
              { key: 'lastLogin', label: t('admin.col.lastLogin'), render: (u) => (u.lastLoginAt ? formatDate(u.lastLoginAt, language) : t('common.never')) },
              { key: 'status', label: t('admin.col.accountStatus'), render: (u) => <Badge tone={u.status === 'blocked' ? 'red' : 'green'}>{t(`admin.status.${u.status}`)}</Badge> },
              { key: 'online', label: t('admin.col.online'), render: (u) => <Badge tone={u.online ? 'green' : 'zinc'} dot>{u.online ? t('admin.online') : t('admin.offline')}</Badge> },
              ...(data.users.some((u) => u.balance !== undefined)
                ? [{ key: 'balance', label: t('creator.col.crowns'), align: 'right', render: (u) => <span className="font-semibold text-brass-light">{(u.balance || 0).toLocaleString()}</span> }]
                : []),
              { key: 'created', label: t('admin.col.gamesCreated'), align: 'right' },
              { key: 'played', label: t('admin.col.played'), align: 'right' },
              { key: 'wins', label: t('admin.col.wins'), align: 'right' },
              { key: 'losses', label: t('admin.col.losses'), align: 'right' },
              { key: 'winRate', label: t('admin.col.winRate'), align: 'right', render: (u) => percent(u.winRate) },
              { key: 'finished', label: t('admin.col.finished'), align: 'right', render: (u) => `${u.finished} / ${u.unfinished}` },
              { key: 'favourite', label: t('admin.col.favourite'), render: (u) => <span className="text-zinc-400">{favourite(t, u.favouriteMode)}</span> },
              { key: 'time', label: t('admin.col.time'), align: 'right', render: (u) => formatDuration(u.timeMs, t) },
            ]}
          />
        </Card>
      )}

      {openId && <UserDrawer id={openId} token={token} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}
