// FieldsSection.jsx
// The square editor. Pick a board, pick a square on its outline, and change
// anything about it: its kind, names, picture, description, price, rent,
// house cost, colour group or tax. The whole board is checked on the server
// before it is saved; games already running keep their board.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import {
  Badge, Button, Card, ErrorState, Spinner,
} from '../../ui/dash';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  FieldRow, ImageField, LocalizedInputs, NumberInput, SearchBox, Select, TextInput, ValueDiff,
  creatorRequest, localizedText, useAction, useCreator,
} from '../kit';

const GROUP_COLORS = {
  brown: '#7a5230', copper: '#7a5230', lightblue: '#a3d0e8', teal: '#3fa9a6', pink: '#d888b0', magenta: '#c14e9a', orange: '#e08a3c', amber: '#e0a83c', red: '#c4453a', crimson: '#a32d3f', yellow: '#e8cf4a', gold: '#d4af37', green: '#3f9463', emerald: '#2e8b57', blue: '#3a6ea8', indigo: '#4b5fa8', violet: '#7a5fb8', rose: '#c1567c', slate: '#5a6b7a', obsidian: '#3a3f47',
};
const TYPE_GLYPH = {
  GO: '🏁', JAIL: '🔒', FREE_PARKING: '🅿️', GO_TO_JAIL: '👮', PROPERTY: '🏠', RAILROAD: '🚉', UTILITY: '⚡', TAX: '💸', CHANCE: '❓', CHEST: '🎁',
};

function tileColor(tile) {
  if (tile.type === 'PROPERTY') return GROUP_COLORS[tile.group] || '#8a8b76';
  return { RAILROAD: '#37474f', UTILITY: '#5f8a99', TAX: '#a8342a', CHANCE: '#3a6ea8', CHEST: '#2e8b57' }[tile.type] || '#555';
}

// The board's outline, square by square, in play order around the edge.
function BoardOutline({ board, sideLength, selected, onSelect }) {
  const size = sideLength + 1;
  const cell = (id) => {
    const side = Math.floor(id / sideLength);
    const pos = id % sideLength;
    if (side === 0) return { row: size - 1, col: size - 1 - pos };
    if (side === 1) return { row: size - 1 - pos, col: 0 };
    if (side === 2) return { row: 0, col: pos };
    return { row: pos, col: size - 1 };
  };
  return (
    <div className="grid aspect-square w-full gap-[2px] rounded-xl bg-[#e6d7b9] p-1.5" style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)` }}>
      {board.map((tile) => {
        const { row, col } = cell(tile.id);
        const active = tile.id === selected;
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onSelect(tile.id)}
            title={`${tile.id} · ${tile.name}`}
            className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[3px] bg-[#faf4e6] text-[8px] leading-none text-[#1f2417] transition-transform ${active ? 'z-10 scale-110 ring-2 ring-violet-500' : 'hover:scale-105'}`}
            style={{ gridRow: row + 1, gridColumn: col + 1 }}
          >
            <span className="h-1/4 w-full shrink-0" style={{ backgroundColor: tile.type === 'PROPERTY' ? tileColor(tile) : 'transparent' }} />
            {tile.image
              ? <img src={tile.image} alt="" className="min-h-0 flex-1 object-cover" />
              : <span className="flex flex-1 items-center justify-center text-[11px]">{TYPE_GLYPH[tile.type]}</span>}
          </button>
        );
      })}
      <div className="flex items-center justify-center rounded-lg bg-[#f2e8d5]/60 text-center text-[11px] font-semibold uppercase tracking-widest text-[#4a4f3d]" style={{ gridRow: `2 / ${size}`, gridColumn: `2 / ${size}` }}>
        {board.length}
      </div>
    </div>
  );
}

function TileForm({
  tile, groups, edgeTypes, onChange, corner,
}) {
  const { t } = useTranslation();
  const set = (patch) => onChange({ ...tile, ...patch });
  const setType = (type) => {
    const next = {
      type, name: tile.name, nameRu: tile.nameRu, image: tile.image, description: tile.description, id: tile.id,
    };
    if (type === 'PROPERTY') Object.assign(next, { group: groups[0], price: tile.price || 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] });
    if (type === 'RAILROAD') Object.assign(next, { price: tile.price || 200, rent: [25, 50, 100, 200] });
    if (type === 'UTILITY') Object.assign(next, { price: tile.price || 150 });
    if (type === 'TAX') Object.assign(next, { amount: 100 });
    onChange(next);
  };
  const setRent = (i, v) => set({ rent: tile.rent.map((r, j) => (j === i ? (v === '' ? 0 : v) : r)) });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldRow label={t('creator.fields.type')} hint={corner ? t('creator.fields.cornerFixed') : null}>
          <Select
            value={tile.type}
            onChange={setType}
            disabled={corner}
            options={(corner ? [tile.type] : edgeTypes).map((type) => ({ value: type, label: `${TYPE_GLYPH[type]} ${t(`creator.fields.types.${type}`)}` }))}
          />
        </FieldRow>
        {tile.type === 'PROPERTY' && (
          <FieldRow label={t('creator.fields.group')}>
            <Select value={tile.group} onChange={(group) => set({ group })} options={groups.map((g) => ({ value: g, label: g }))} />
          </FieldRow>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldRow label={t('creator.fields.nameRu')}><TextInput value={tile.nameRu} onChange={(nameRu) => set({ nameRu })} maxLength={60} /></FieldRow>
        <FieldRow label={t('creator.fields.nameEn')}><TextInput value={tile.name} onChange={(name) => set({ name })} maxLength={60} /></FieldRow>
      </div>
      <LocalizedInputs label={t('creator.fields.description')} value={tile.description || {}} onChange={(description) => set({ description })} multiline rows={2} />
      <ImageField label={t('creator.fields.image')} value={tile.image || ''} onChange={(image) => set({ image })} title={tile.name} />
      {['PROPERTY', 'RAILROAD', 'UTILITY'].includes(tile.type) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldRow label={t('creator.fields.price')}><NumberInput value={tile.price} min={1} onChange={(price) => set({ price })} /></FieldRow>
          {tile.type === 'PROPERTY' && <FieldRow label={t('creator.fields.houseCost')}><NumberInput value={tile.houseCost} min={1} onChange={(houseCost) => set({ houseCost })} /></FieldRow>}
        </div>
      )}
      {tile.type === 'PROPERTY' && (
        <FieldRow label={t('creator.fields.rent')} hint={t('creator.fields.rentHint')}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {tile.rent.map((r, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <NumberInput key={i} value={r} min={0} onChange={(v) => setRent(i, v)} title={t(`creator.fields.rentLevel.${i}`)} />
            ))}
          </div>
        </FieldRow>
      )}
      {tile.type === 'RAILROAD' && (
        <FieldRow label={t('creator.fields.rent')} hint={t('creator.fields.stationRentHint')}>
          <div className="grid grid-cols-4 gap-2">
            {tile.rent.map((r, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <NumberInput key={i} value={r} min={0} onChange={(v) => setRent(i, v)} />
            ))}
          </div>
        </FieldRow>
      )}
      {tile.type === 'TAX' && (
        <FieldRow label={t('creator.fields.tax')}><NumberInput value={tile.amount} min={0} onChange={(amount) => set({ amount: amount === '' ? 0 : amount })} /></FieldRow>
      )}
    </div>
  );
}

export default function FieldsSection({ token }) {
  const { t, language } = useTranslation();
  const { ask } = useCreator();
  const boards = useAdminData('/api/admin/boards', token);
  const [boardId, setBoardId] = useState(() => {
    try {
      return sessionStorage.getItem('landmark_fields_board') || 'classic';
    } catch {
      return 'classic';
    }
  });
  const { data, error, reload } = useAdminData(`/api/admin/boards/${encodeURIComponent(boardId)}`, token);
  const [selected, setSelected] = useState(1);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, run] = useAction();

  const board = data?.board;
  const original = board?.board?.[selected];
  useEffect(() => {
    setDraft(original ? JSON.parse(JSON.stringify(original)) : null);
  }, [original]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!board || !q) return [];
    return board.board.filter((tile) => `${tile.id} ${tile.name} ${tile.nameRu} ${tile.group || ''}`.toLowerCase().includes(q)).slice(0, 12);
  }, [board, query]);

  if (!boards.data || !data) {
    const err = boards.error || error;
    return err ? <ErrorState error={err} onRetry={() => { boards.reload(); reload(); }} retryLabel={t('common.retry')} /> : <Spinner block />;
  }

  const dirty = draft && original && JSON.stringify(draft) !== JSON.stringify(original);
  const corner = draft && draft.id % board.sideLength === 0;
  const defaultTile = board.defaultBoard?.[selected] || null;

  const save = async () => {
    const out = await run(() => creatorRequest(token, `/api/admin/boards/${encodeURIComponent(boardId)}/tiles/${selected}`, {
      method: 'PUT', body: { tile: draft },
    }), t('creator.fields.saved'));
    if (out) reload();
  };

  const resetTile = async () => {
    const ok = await ask({
      title: t('creator.fields.resetTitle', { name: original.name }),
      message: t('creator.fields.resetText'),
      details: <ValueDiff before={original} after={defaultTile} />,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/boards/${encodeURIComponent(boardId)}/tiles/${selected}/reset`, { method: 'POST', body: { confirm: true } }), t('creator.fields.saved'));
    if (out) reload();
  };

  const selectBoard = (id) => {
    setBoardId(id);
    setSelected(1);
    try {
      sessionStorage.setItem('landmark_fields_board', id);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.fields.title')} subtitle={t('creator.fields.subtitle')} onRefresh={reload}>
        <div className="w-56">
          <Select value={boardId} onChange={selectBoard} options={boards.data.boards.map((b) => ({ value: b.id, label: `${localizedText(b.label, language)} · ${b.tileCount}` }))} />
        </div>
      </SectionHeader>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,0.9fr),1.3fr] 4xl:grid-cols-[1fr,1.4fr]">
        <div className="flex flex-col gap-3">
          <Card bodyClass="p-3">
            <BoardOutline board={board.board} sideLength={board.sideLength} selected={selected} onSelect={setSelected} />
          </Card>
          <SearchBox value={query} onChange={setQuery} placeholder={t('creator.fields.search')} />
          {matches.length > 0 && (
            <ul className="flex flex-col gap-1">
              {matches.map((tile) => (
                <li key={tile.id}>
                  <button type="button" onClick={() => { setSelected(tile.id); setQuery(''); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-white/[0.05]">
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: tileColor(tile) }} />
                    <span className="text-zinc-500 tnum">{tile.id}</span>
                    <span className="flex-1 truncate text-zinc-200">{language === 'ru' ? tile.nameRu : tile.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {draft && (
          <Card
            title={(
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: tileColor(draft) }} />
                {t('creator.fields.square', { id: draft.id })} · {language === 'ru' ? original.nameRu : original.name}
              </span>
            )}
            subtitle={t(`creator.fields.types.${original.type}`)}
            action={(
              <div className="flex flex-wrap gap-2">
                <Button tone="subtle" icon="arrowLeft" onClick={() => setSelected((selected - 1 + board.board.length) % board.board.length)} />
                <Button tone="subtle" icon="arrowUp" onClick={() => setSelected((selected + 1) % board.board.length)} />
              </div>
            )}
          >
            <TileForm tile={draft} groups={data.groups} edgeTypes={data.edgeTypes} corner={corner} onChange={setDraft} />
            {dirty && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('creator.fields.changes')}</p>
                <ValueDiff before={original} after={draft} />
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
              {dirty ? <Badge tone="amber" dot>{t('creator.mode.unsaved')}</Badge> : <Badge tone="green">{t('creator.fields.inSync')}</Badge>}
              <span className="flex-1" />
              {defaultTile && JSON.stringify(defaultTile) !== JSON.stringify(original) && <Button tone="subtle" icon="refresh" onClick={resetTile}>{t('creator.fields.reset')}</Button>}
              <Button onClick={() => setDraft(JSON.parse(JSON.stringify(original)))} disabled={!dirty}>{t('creator.mode.discard')}</Button>
              <Button tone="primary" icon="check" disabled={!dirty || busy} onClick={save}>{t('creator.fields.save')}</Button>
            </div>
            <p className="mt-2 text-[11.5px] text-zinc-500">{t('creator.fields.runningNote')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
