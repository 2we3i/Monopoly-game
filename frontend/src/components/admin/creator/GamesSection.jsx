// GamesSection.jsx
// Games being played right now and the match history. A game opens into
// its players with their live state (money, cards, status…), settings and
// the event log; the Creator can end any game (with confirmation).

import { useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate, formatDuration } from '../../../lib/api';
import {
  Badge, Button, Card, Drawer, ErrorState, Field, GAME_COLORS, Segmented, Spinner, StatCard, Table,
} from '../../ui/dash';
import {
  gameName, modeName, phaseName, stageTone,
} from '../../ui/labels';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  SearchBox, Tabs, creatorRequest, formatValue, useAction, useCreator,
} from '../kit';

const GAMES = ['monopoly', 'mafia', 'citadels', 'bunker', 'catan', 'cosmic', 'throne', 'chpok', 'memehype'];
const HIDDEN_KEYS = new Set(['id', 'nickname', 'avatarUrl', 'accountId', 'connected', 'isHost', 'color', 'cosmetics', 'ready']);

function logLine(entry) {
  if (!entry || typeof entry !== 'object') return String(entry);
  if (entry.message) return entry.message;
  const params = entry.params && typeof entry.params === 'object'
    ? Object.entries(entry.params).map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ')
    : '';
  return `${entry.type || entry.kind || 'event'}${params ? ` — ${params}` : ''}`;
}

function GameDrawer({ code, onClose, onEnded }) {
  const { t, language } = useTranslation();
  const { token, ask, can } = useCreator();
  const { data, error, reload } = useAdminData(`/api/admin/games/${encodeURIComponent(code)}`, token, 5000);
  const [tab, setTab] = useState('players');
  const [busy, run] = useAction();
  const game = data?.game;

  const end = async () => {
    const ok = await ask({
      title: t('creator.games.endTitle', { code }),
      message: t('creator.games.endText', { players: game.players.length }),
      critical: true,
      typeToConfirm: code,
      confirmLabel: t('creator.games.end'),
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/games/${encodeURIComponent(code)}/end`, { method: 'POST', body: { confirm: true } }), t('creator.games.ended'));
    if (out) onEnded();
  };

  const playerKeys = useMemo(() => {
    const keys = new Set();
    (game?.rawPlayers || []).forEach((p) => Object.entries(p).forEach(([k, v]) => {
      if (!HIDDEN_KEYS.has(k) && (v === null || ['string', 'number', 'boolean'].includes(typeof v) || Array.isArray(v))) keys.add(k);
    }));
    return [...keys].slice(0, 14);
  }, [game]);

  return (
    <Drawer
      wide
      title={game ? `${gameName(t, game.gameType)} · ${code}` : code}
      subtitle={game ? `${modeName(t, game.modeId)} · ${phaseName(t, game.gameType, game.phase)}` : null}
      onClose={onClose}
      footer={game && can('games.manage') && (
        <>
          <Button tone="danger" icon="power" disabled={busy} onClick={end}>{t('creator.games.end')}</Button>
          <span className="flex-1" />
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      )}
    >
      {!game ? (error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 md:grid-cols-4">
            <Field label={t('admin.col.status')}><Badge tone={stageTone(game.stage)} dot>{t(`admin.stage.${game.stage}`)}</Badge>{game.test && <Badge tone="violet">{t('creator.test.badge')}</Badge>}</Field>
            <Field label={t('admin.col.phase')}>{phaseName(t, game.gameType, game.phase)}</Field>
            <Field label={t('admin.col.creator')}>{game.hostNickname || '—'}</Field>
            <Field label={t('admin.col.age')}>{formatDuration(game.ageMs, t)}</Field>
            <Field label={t('admin.col.players')}>{game.players.length}/{game.maxPlayers}</Field>
            <Field label={t('creator.games.round')}>{game.round ?? '—'}</Field>
            <Field label={t('creator.games.current')}>{game.details?.currentPlayer || '—'}</Field>
            <Field label={t('admin.recent.winner')}>{game.details?.winner || '—'}</Field>
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'players', label: t('creator.games.players'), icon: 'users', count: game.players.length },
              { value: 'log', label: t('creator.games.log'), icon: 'filter', count: game.log.length },
              { value: 'settings', label: t('creator.games.settings'), icon: 'palette' },
            ]}
          />
          {tab === 'players' && (
            <Card bodyClass="p-0">
              <Table
                rowKey={(p) => p.id}
                rows={game.players.map((p) => ({ ...p, raw: game.rawPlayers.find((r) => r.id === p.id) || {} }))}
                empty="—"
                columns={[
                  {
                    key: 'name',
                    label: t('admin.col.user'),
                    render: (p) => (
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                        <span className="text-zinc-100">{p.nickname}</span>
                        {p.isHost && <Badge tone="amber">{t('admin.lobby.hostBadge')}</Badge>}
                        {p.isGuest && <Badge>{t('common.guest')}</Badge>}
                      </span>
                    ),
                  },
                  { key: 'status', label: t('admin.col.status'), render: (p) => p.status || '—' },
                  ...playerKeys.map((k) => ({ key: k, label: k, render: (p) => <span className="text-zinc-400">{formatValue(p.raw[k])}</span> })),
                ]}
              />
            </Card>
          )}
          {tab === 'log' && (
            <Card bodyClass="p-0">
              {game.log.length === 0 ? <p className="p-6 text-center text-[12px] text-zinc-500">{t('creator.games.noLog')}</p> : (
                <ol className="scrollbar-thin max-h-[60vh] divide-y divide-white/[0.04] overflow-y-auto font-mono text-[11.5px] 4xl:text-[13px]">
                  {[...game.log].reverse().map((entry, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i} className="flex gap-3 px-4 py-1.5">
                      <span className="shrink-0 text-zinc-600">{entry.ts ? new Date(entry.ts).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-GB') : ''}</span>
                      <span className="text-zinc-300">{logLine(entry)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
          {tab === 'settings' && (
            <pre className="scrollbar-thin max-h-[60vh] overflow-auto rounded-xl bg-black/40 p-4 text-[11.5px] text-zinc-300">{JSON.stringify(game.settings, null, 2)}</pre>
          )}
        </div>
      )}
    </Drawer>
  );
}

export default function GamesSection({ token }) {
  const { t, language } = useTranslation();
  const [status, setStatus] = useState('');
  const [game, setGame] = useState('all');
  const [stage, setStage] = useState('active');
  const [query, setQuery] = useState('');
  const [openCode, setOpenCode] = useState(null);
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData(`/api/admin/games?status=${status}&gameType=${game === 'all' ? '' : game}&limit=150`, token, 8000);

  const live = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.live || [])
      .filter((r) => stage === 'all' || r.stage === stage)
      .filter((r) => game === 'all' || r.gameType === game)
      .filter((r) => !q || r.code.toLowerCase().includes(q) || r.players.some((p) => p.nickname.toLowerCase().includes(q)));
  }, [data, stage, game, query]);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;
  const counts = {
    active: data.live.filter((r) => r.stage === 'active').length,
    lobby: data.live.filter((r) => r.stage === 'lobby').length,
    finished: data.live.filter((r) => r.stage === 'finished').length,
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.games.title')} subtitle={t('creator.games.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t('admin.stat.gamesActive')} value={counts.active} icon="play" accent="#34d399" />
        <StatCard label={t('creator.games.waiting')} value={counts.lobby} icon="grid" accent="#60a5fa" />
        <StatCard label={t('admin.stage.finished')} value={counts.finished} icon="flag" />
        <StatCard label={t('admin.stat.gamesTotal')} value={data.totals.matchesTotal} icon="castle" accent="#a78bfa" />
        <StatCard label={t('admin.stat.gamesFinished')} value={data.totals.matchesFinished} icon="check" accent="#34d399" />
        <StatCard label={t('creator.games.aborted')} value={data.totals.matchesAborted} icon="ban" accent="#f87171" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder={t('admin.lobbies.search')} className="sm:w-64" />
        <Segmented value={stage} onChange={setStage} options={['active', 'lobby', 'finished', 'all'].map((s) => ({ value: s, label: s === 'all' ? t('common.all') : t(`admin.stage.${s}`) }))} />
        <select value={game} onChange={(e) => setGame(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#121418] px-2.5 text-[12.5px] text-zinc-200">
          <option value="all">{t('common.all')}</option>
          {GAMES.map((g) => <option key={g} value={g}>{gameName(t, g)}</option>)}
        </select>
      </div>

      <Card title={t('creator.games.live')} subtitle={t('creator.games.liveHint')} bodyClass="p-0">
        <Table
          rowKey={(r) => r.code}
          rows={live}
          onRowClick={(r) => setOpenCode(r.code)}
          empty={t('creator.games.noLive')}
          columns={[
            { key: 'code', label: t('admin.col.code'), render: (r) => <span className="font-mono font-semibold text-zinc-100">{r.code}</span> },
            {
              key: 'game',
              label: t('admin.col.game'),
              render: (r) => (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAME_COLORS[r.gameType] }} />
                  {gameName(t, r.gameType)}
                  <span className="text-zinc-500">{modeName(t, r.modeId)}</span>
                  {r.test && <Badge tone="violet">{t('creator.test.badge')}</Badge>}
                </span>
              ),
            },
            { key: 'stage', label: t('admin.col.status'), render: (r) => <Badge tone={stageTone(r.stage)} dot>{t(`admin.stage.${r.stage}`)}</Badge> },
            { key: 'phase', label: t('admin.col.phase'), render: (r) => phaseName(t, r.gameType, r.phase) },
            { key: 'players', label: t('admin.col.players'), render: (r) => <span title={r.players.map((p) => p.nickname).join(', ')}>{r.players.length}/{r.maxPlayers} · {r.players.slice(0, 3).map((p) => p.nickname).join(', ')}</span> },
            { key: 'current', label: t('creator.games.current'), render: (r) => r.details?.currentPlayer || '—' },
            { key: 'age', label: t('admin.col.age'), align: 'right', render: (r) => formatDuration(r.ageMs, t) },
          ]}
        />
      </Card>

      <Card
        title={t('creator.games.history')}
        action={<Segmented value={status} onChange={setStatus} options={['', 'active', 'finished', 'aborted'].map((s) => ({ value: s, label: s ? t(`result.${s}`) : t('common.all') }))} />}
        bodyClass="p-0"
      >
        <Table
          rowKey={(r) => r.id}
          rows={data.matches}
          empty={t('admin.recent.empty')}
          columns={[
            { key: 'id', label: '#', render: (r) => <span className="text-zinc-500">{r.id}</span> },
            { key: 'game', label: t('admin.col.game'), render: (r) => `${gameName(t, r.gameType)} · ${modeName(t, r.modeId)}` },
            { key: 'room', label: t('admin.col.code'), render: (r) => <span className="font-mono">{r.roomCode}</span> },
            { key: 'players', label: t('admin.col.players'), render: (r) => `${r.playerCount} · ${r.players.map((p) => p.nickname).slice(0, 4).join(', ')}` },
            { key: 'winner', label: t('admin.recent.winner'), render: (r) => r.winner || '—' },
            { key: 'started', label: t('stats.date'), render: (r) => formatDate(r.startedAt, language) },
            { key: 'duration', label: t('admin.stat.avgDuration'), align: 'right', render: (r) => (r.durationMs ? formatDuration(r.durationMs, t) : '—') },
            { key: 'status', label: t('admin.col.status'), render: (r) => <Badge tone={{ finished: 'green', aborted: 'red', active: 'blue' }[r.status]}>{t(`result.${r.status}`)}</Badge> },
          ]}
        />
      </Card>

      {openCode && <GameDrawer code={openCode} onClose={() => setOpenCode(null)} onEnded={() => { setOpenCode(null); reload(); }} />}
    </div>
  );
}
