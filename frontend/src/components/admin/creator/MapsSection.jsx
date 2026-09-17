// MapsSection.jsx
// The game maps: every Monopoly board (built-in ones can be edited and
// reset, new ones can be added - copied from a board or generated at any
// size - and deleted), each board being its own game mode, plus the card
// decks and the maps of the other games.

import { useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import {
  Badge, Button, Card, Dialog, ErrorState, Segmented, Spinner,
} from '../../ui/dash';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  FieldRow, LocalizedInputs, NumberInput, Select, TextInput, creatorRequest, localizedText, useAction, useCreator,
} from '../kit';
import ModeEditor from './ModeEditor';

const TYPE_COLOR = {
  PROPERTY: '#d4a52c', RAILROAD: '#94a3b8', UTILITY: '#5f8a99', TAX: '#e0695c', CHANCE: '#60a5fa', CHEST: '#34d399',
};

function CreateBoardDialog({ boards, onClose, onCreated }) {
  const { t } = useTranslation();
  const { token } = useCreator();
  const [kind, setKind] = useState('copy');
  const [id, setId] = useState('');
  const [baseId, setBaseId] = useState(boards[0]?.id || 'classic');
  const [sideLength, setSideLength] = useState(10);
  const [label, setLabel] = useState({ ru: '', en: '' });
  const [busy, run] = useAction();
  const valid = /^[a-z0-9][a-z0-9-]{2,29}$/.test(id);
  const create = async () => {
    const out = await run(() => creatorRequest(token, '/api/admin/boards', {
      method: 'POST',
      body: {
        id, label, baseId: kind === 'copy' ? baseId : null, sideLength: kind === 'new' ? sideLength : null,
      },
    }), t('creator.maps.created'));
    if (out) onCreated(out.board);
  };
  return (
    <Dialog
      title={t('creator.maps.createTitle')}
      onClose={onClose}
      width="max-w-xl"
      footer={(
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button tone="primary" icon="plus" disabled={!valid || busy} onClick={create}>{t('creator.maps.create')}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'copy', label: t('creator.maps.copy') }, { value: 'new', label: t('creator.maps.generate') }]} />
        <FieldRow label={t('creator.maps.id')} hint={t('creator.maps.idHint')}>
          <TextInput value={id} onChange={(v) => setId(v.toLowerCase())} placeholder="my-city" />
        </FieldRow>
        <LocalizedInputs label={t('creator.maps.name')} value={label} onChange={setLabel} />
        {kind === 'copy' ? (
          <FieldRow label={t('creator.maps.base')}>
            <Select value={baseId} onChange={setBaseId} options={boards.map((b) => ({ value: b.id, label: `${b.label.en} (${b.tileCount})` }))} />
          </FieldRow>
        ) : (
          <FieldRow label={t('creator.maps.side')} hint={t('creator.maps.sideHint', { n: sideLength * 4 })}>
            <NumberInput value={sideLength} min={6} max={24} onChange={(v) => setSideLength(v || 10)} />
          </FieldRow>
        )}
        <p className="text-[12px] text-zinc-500">{t('creator.maps.createHint')}</p>
      </div>
    </Dialog>
  );
}

function BoardStrip({ board }) {
  const total = Object.values(board.counts).reduce((n, v) => n + v, 0);
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
      {Object.entries(board.counts).filter(([type]) => TYPE_COLOR[type]).map(([type, n]) => (
        <span key={type} title={`${type}: ${n}`} style={{ width: `${(n / total) * 100}%`, backgroundColor: TYPE_COLOR[type] }} />
      ))}
    </div>
  );
}

export default function MapsSection({ token, go }) {
  const { t, language } = useTranslation();
  const { ask } = useCreator();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/boards', token);
  const [creating, setCreating] = useState(false);
  const [decksFor, setDecksFor] = useState(null);
  const [, run] = useAction();

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  const remove = async (board) => {
    const ok = await ask({
      title: t('creator.maps.deleteTitle', { name: localizedText(board.label, language) }),
      message: t('creator.maps.deleteText'),
      critical: true,
      typeToConfirm: board.id,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/boards/${board.id}`, { method: 'DELETE', body: { confirm: true } }), t('creator.maps.deleted'));
    if (out) reload();
  };

  const reset = async (board) => {
    const ok = await ask({
      title: t('creator.maps.resetTitle', { name: localizedText(board.label, language) }),
      message: t('creator.maps.resetText'),
      critical: true,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/boards/${board.id}/reset`, { method: 'POST', body: { confirm: true } }), t('creator.maps.resetDone'));
    if (out) reload();
  };

  const openFields = (board) => {
    try {
      sessionStorage.setItem('landmark_fields_board', board.id);
    } catch { /* ignore */ }
    go('fields');
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.maps.title')} subtitle={t('creator.maps.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading}>
        <Button tone="primary" icon="plus" onClick={() => setCreating(true)}>{t('creator.maps.new')}</Button>
      </SectionHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        {data.boards.map((board) => (
          <section key={board.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#121418] p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass/15 text-[18px]">🎲</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-zinc-100">{localizedText(board.label, language)}</p>
                <p className="truncate font-mono text-[11.5px] text-zinc-500">{board.modeId}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {board.custom ? <Badge tone="violet">{t('creator.maps.custom')}</Badge> : <Badge>{t('creator.maps.builtIn')}</Badge>}
                {board.edited && <Badge tone="amber">{t('creator.maps.edited')}</Badge>}
              </div>
            </div>
            <p className="line-clamp-2 min-h-[2.5em] text-[12px] text-zinc-400">{localizedText(board.description, language) || '—'}</p>
            <BoardStrip board={board} />
            <dl className="grid grid-cols-3 gap-2 text-[12px]">
              <div><dt className="text-zinc-500">{t('creator.maps.tiles')}</dt><dd className="font-semibold text-zinc-100 tnum">{board.tileCount}</dd></div>
              <div><dt className="text-zinc-500">{t('creator.maps.groups')}</dt><dd className="font-semibold text-zinc-100 tnum">{board.groups.length}</dd></div>
              <div><dt className="text-zinc-500">{t('creator.maps.pictures')}</dt><dd className="font-semibold text-zinc-100 tnum">{board.images}</dd></div>
            </dl>
            {board.updatedAt && <p className="text-[11px] text-zinc-500">{t('creator.mode.updated', { date: formatDate(board.updatedAt, language), by: board.updatedBy || '—' })}</p>}
            <div className="mt-auto flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
              <Button tone="primary" icon="box" onClick={() => openFields(board)}>{t('creator.maps.editFields')}</Button>
              <Button icon="filter" onClick={() => setDecksFor(board.modeId)}>{t('creator.maps.cards')}</Button>
              {board.edited && <Button tone="subtle" icon="refresh" onClick={() => reset(board)}>{t('creator.maps.reset')}</Button>}
              {board.custom && <Button tone="danger" icon="close" onClick={() => remove(board)}>{t('creator.maps.delete')}</Button>}
            </div>
          </section>
        ))}
      </div>

      <Card title={t('creator.maps.otherTitle')} subtitle={t('creator.maps.otherHint')}>
        <ul className="grid gap-3 md:grid-cols-3">
          {['catan', 'cosmic', 'throne'].map((game) => (
            <li key={game} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[13.5px] font-semibold text-zinc-100">{t(`menu.${game}.title`)}</p>
              <p className="mt-1 text-[12px] text-zinc-400">{t(`creator.maps.other.${game}`)}</p>
            </li>
          ))}
        </ul>
      </Card>

      {creating && <CreateBoardDialog boards={data.boards} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
      {decksFor && <ModeEditor modeId={decksFor} initialTab="cards" onClose={() => setDecksFor(null)} />}
    </div>
  );
}
