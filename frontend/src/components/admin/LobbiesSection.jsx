// LobbiesSection.jsx
// Every live room across every game, with the admin's controls: inspect,
// remove a player, close the room.

import { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatDate, formatDuration } from '../../lib/api';
import {
  Badge, Button, Card, CopyButton, Dialog, Drawer, ErrorState, Field, GAME_COLORS, Segmented, Spinner, Table,
} from '../ui/dash';
import {
  gameName, modeName, phaseName, stageTone,
} from '../ui/labels';
import SectionHeader from './SectionHeader';
import useAdminData, { adminAction } from './useAdminData';

function inviteLink(code) {
  return `${window.location.origin}/?room=${code}`;
}

function playerStatus(t, status) {
  const key = `admin.playerStatus.${status}`;
  return t(key) === key ? status : t(key);
}

export default function LobbiesSection({ token }) {
  const { t, language } = useTranslation();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/lobbies', token, 10000);
  const [game, setGame] = useState('all');
  const [stage, setStage] = useState('all');
  const [query, setQuery] = useState('');
  const [openCode, setOpenCode] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'close' | 'kick', code, player }
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const lobbies = data?.lobbies || [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lobbies
      .filter((l) => game === 'all' || l.gameType === game)
      .filter((l) => stage === 'all' || l.stage === stage)
      .filter((l) => !q || l.code.toLowerCase().includes(q) || (l.hostNickname || '').toLowerCase().includes(q)
        || l.players.some((p) => p.nickname.toLowerCase().includes(q)));
  }, [lobbies, game, stage, query]);
  const open = lobbies.find((l) => l.code === openCode);
  const counts = {
    lobby: lobbies.filter((l) => l.stage === 'lobby').length,
    active: lobbies.filter((l) => l.stage === 'active').length,
    finished: lobbies.filter((l) => l.stage === 'finished').length,
  };

  const run = async () => {
    setBusy(true);
    setActionError(null);
    try {
      if (confirm.kind === 'close') {
        await adminAction(`/api/admin/lobbies/${confirm.code}/close`, token);
        setOpenCode(null);
      } else {
        await adminAction(`/api/admin/lobbies/${confirm.code}/kick`, token, { playerId: confirm.player.id });
      }
      setConfirm(null);
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t('admin.lobbies.count', { n: lobbies.length })}
        subtitle={t('admin.lobbies.summary', counts)}
        updatedAt={updatedAt}
        onRefresh={reload}
        loading={loading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.lobbies.search')}
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-brass/60 focus:outline-none sm:flex-none"
        />
        <Segmented
          value={game}
          onChange={setGame}
          options={[
            { value: 'all', label: t('common.all') },
            ...['monopoly', 'mafia', 'citadels', 'bunker', 'catan', 'cosmic', 'throne'].map((id) => ({ value: id, label: gameName(t, id) })),
          ]}
        />
        <Segmented
          value={stage}
          onChange={setStage}
          options={[
            { value: 'all', label: t('common.all') },
            ...['lobby', 'active', 'finished'].map((id) => ({ value: id, label: t(`admin.stage.${id}`) })),
          ]}
        />
      </div>

      <Card bodyClass="p-0">
        <Table
          rowKey={(r) => r.code}
          rows={rows}
          onRowClick={(r) => setOpenCode(r.code)}
          empty={t('admin.lobbies.empty')}
          columns={[
            {
              key: 'code',
              label: t('admin.col.code'),
              render: (r) => (
                <span className="flex items-center gap-1">
                  <span className="font-mono font-semibold tracking-wider text-zinc-100">{r.code}</span>
                  <CopyButton text={inviteLink(r.code)} label="" copiedLabel="" />
                </span>
              ),
            },
            {
              key: 'game',
              label: t('admin.col.game'),
              render: (r) => (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAME_COLORS[r.gameType] }} />
                  <span className="text-zinc-100">{gameName(t, r.gameType)}</span>
                  <span className="text-zinc-500">{modeName(t, r.modeId)}</span>
                </span>
              ),
            },
            {
              key: 'creator',
              label: t('admin.col.creator'),
              render: (r) => (
                <span className="flex flex-col">
                  <span className="text-zinc-200">{r.hostNickname || '—'}</span>
                  <span className="font-mono text-[10.5px] text-zinc-600">{r.hostAccountId ? `${r.hostAccountId.slice(0, 8)}…` : t('common.guest')}</span>
                </span>
              ),
            },
            { key: 'players', label: t('admin.col.players'), align: 'right', render: (r) => `${r.players.length}/${r.maxPlayers}` },
            { key: 'stage', label: t('admin.col.status'), render: (r) => <Badge tone={stageTone(r.stage)} dot>{t(`admin.stage.${r.stage}`)}</Badge> },
            { key: 'phase', label: t('admin.col.phase'), render: (r) => <span className="text-zinc-400">{phaseName(t, r.gameType, r.phase)}</span> },
            { key: 'created', label: t('admin.col.created'), render: (r) => formatDate(r.createdAt, language) },
            { key: 'age', label: t('admin.col.age'), align: 'right', render: (r) => formatDuration(r.ageMs, t) },
            { key: 'access', label: t('admin.col.access'), render: () => <Badge tone="violet">{t('admin.access.code')}</Badge> },
          ]}
        />
      </Card>

      {open && (
        <Drawer
          title={`${gameName(t, open.gameType)} · ${open.code}`}
          subtitle={t('admin.lobby.subtitle', { host: open.hostNickname || '—', age: formatDuration(open.ageMs, t) })}
          onClose={() => setOpenCode(null)}
          footer={(
            <>
              <Button tone="danger" icon="power" onClick={() => setConfirm({ kind: 'close', code: open.code })}>{t('admin.lobby.close')}</Button>
              <span className="flex-1" />
              <Button onClick={() => setOpenCode(null)}>{t('common.close')}</Button>
            </>
          )}
        >
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <Field label={t('admin.lobby.id')}><span className="font-mono">{open.code}</span></Field>
            <Field label={t('admin.lobby.invite')}>
              <span className="flex items-center gap-1 text-[12px] text-zinc-400">
                <span className="truncate">{inviteLink(open.code)}</span>
                <CopyButton text={inviteLink(open.code)} label={t('common.copy')} copiedLabel={t('common.copied')} />
              </span>
            </Field>
            <Field label={t('admin.col.creator')}>{open.hostNickname || '—'}</Field>
            <Field label={t('admin.lobby.creatorId')}><span className="font-mono text-[11.5px]">{open.hostAccountId || t('common.guest')}</span></Field>
            <Field label={t('admin.col.game')}>{gameName(t, open.gameType)}</Field>
            <Field label={t('admin.lobby.mode')}>{modeName(t, open.modeId)}</Field>
            <Field label={t('admin.col.created')}>{formatDate(open.createdAt, language)}</Field>
            <Field label={t('admin.col.age')}>{formatDuration(open.ageMs, t)}</Field>
            <Field label={t('admin.col.status')}><Badge tone={stageTone(open.stage)} dot>{t(`admin.stage.${open.stage}`)}</Badge></Field>
            <Field label={t('admin.col.phase')}>{phaseName(t, open.gameType, open.phase)}</Field>
            <Field label={t('admin.col.access')}>{t('admin.access.codeLong')}</Field>
            <Field label={t('admin.col.players')}>{open.players.length}/{open.maxPlayers}</Field>
          </div>

          <h3 className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">{t('admin.lobby.playerList')}</h3>
          <ul className="flex flex-col gap-1.5">
            {open.players.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} title={p.connected ? t('admin.online') : t('admin.offline')} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-100">
                    {p.nickname}
                    {p.isHost && <Badge tone="amber">{t('admin.lobby.hostBadge')}</Badge>}
                    {p.isGuest ? <Badge>{t('common.guest')}</Badge> : <Badge tone="blue">{t('admin.lobby.registered')}</Badge>}
                  </p>
                  <p className="truncate font-mono text-[10.5px] text-zinc-600">{p.id} · {playerStatus(t, p.status)}</p>
                </div>
                <Button tone="danger" icon="ban" onClick={() => setConfirm({ kind: 'kick', code: open.code, player: p })}>{t('admin.lobby.kick')}</Button>
              </li>
            ))}
          </ul>
        </Drawer>
      )}

      {confirm && (
        <Dialog
          title={confirm.kind === 'close' ? t('admin.lobby.closeTitle', { code: confirm.code }) : t('admin.lobby.kickTitle', { name: confirm.player.nickname })}
          onClose={() => { setConfirm(null); setActionError(null); }}
          footer={(
            <>
              <Button onClick={() => { setConfirm(null); setActionError(null); }}>{t('common.cancel')}</Button>
              <Button tone="danger" disabled={busy} onClick={run}>
                {confirm.kind === 'close' ? t('admin.lobby.close') : t('admin.lobby.kick')}
              </Button>
            </>
          )}
        >
          <p>{confirm.kind === 'close' ? t('admin.lobby.closeText') : t('admin.lobby.kickText')}</p>
          {actionError && <p className="mt-3 text-red-300">{actionError}</p>}
        </Dialog>
      )}
    </div>
  );
}
