// ShopSection.jsx
// The shop as the Creator runs it: every item with its price, rarity,
// category, source, sales and owners; filters and search; editing (price,
// rarity, names, description, picture, on/off sale), resetting a built-in
// item, deleting (an owned item is retired, not taken away), and creating
// new items - including names for board squares with their own picture.

import { useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { RARITY_META, itemName } from '../../../lib/catalog';
import { formatDate } from '../../../lib/api';
import {
  Badge, Button, Card, Drawer, ErrorState, Segmented, Spinner, StatCard, Table,
} from '../../ui/dash';
import { ItemThumb, fieldTargetText } from '../../shop/ItemPreview';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  FieldRow, ImageField, LocalizedInputs, NumberInput, SearchBox, Select, TextArea, TextInput, Toggle, ValueDiff,
  creatorRequest, localizedText, useAction, useCreator,
} from '../kit';

function TileTargetFields({
  value, onChange, boards, groups,
}) {
  const { t, language } = useTranslation();
  const target = value || { layout: '*' };
  const kind = Number.isInteger(target.tileId) ? 'tile' : target.group ? 'group' : target.tileType ? 'type' : 'any';
  const setKind = (next) => {
    const base = { layout: target.layout || '*' };
    if (next === 'tile') onChange({ ...base, layout: base.layout === '*' ? (boards[0]?.id || 'classic') : base.layout, tileId: 1 });
    else if (next === 'group') onChange({ ...base, group: groups[0] });
    else if (next === 'type') onChange({ ...base, tileType: 'RAILROAD' });
    else onChange(base);
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[12px] font-medium text-zinc-300">{t('creator.shop.target')}</p>
      <Segmented
        value={kind}
        onChange={setKind}
        options={['tile', 'group', 'type', 'any'].map((k) => ({ value: k, label: t(`creator.shop.targetKind.${k}`) }))}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <FieldRow label={t('creator.shop.board')}>
          <Select
            value={target.layout || '*'}
            onChange={(layout) => onChange({ ...target, layout })}
            options={[...(kind === 'tile' ? [] : [{ value: '*', label: t('creator.shop.anyBoard') }]), ...boards.map((b) => ({ value: b.id, label: localizedText(b.label, language) }))]}
          />
        </FieldRow>
        {kind === 'tile' && <FieldRow label={t('creator.shop.square')}><NumberInput value={target.tileId} min={0} onChange={(v) => onChange({ ...target, tileId: v === '' ? 0 : v })} /></FieldRow>}
        {kind === 'group' && <FieldRow label={t('creator.fields.group')}><Select value={target.group} onChange={(group) => onChange({ ...target, group })} options={groups.map((g) => ({ value: g, label: g }))} /></FieldRow>}
        {kind === 'type' && (
          <FieldRow label={t('creator.fields.type')}>
            <Select value={target.tileType} onChange={(tileType) => onChange({ ...target, tileType })} options={['PROPERTY', 'RAILROAD', 'UTILITY'].map((v) => ({ value: v, label: t(`creator.fields.types.${v}`) }))} />
          </FieldRow>
        )}
      </div>
      <p className="text-[11.5px] text-zinc-500">{fieldTargetText({ visual: { target } }, t)}</p>
    </div>
  );
}

function ItemEditor({
  item, meta, onClose, onChanged,
}) {
  const { t, language } = useTranslation();
  const { token, ask } = useCreator();
  const creating = !item;
  const [draft, setDraft] = useState(() => (item ? {
    price: item.price ?? '',
    rarity: item.rarity,
    name: item.name,
    description: item.description || { ru: '', en: '' },
    image: item.image || '',
    enabled: item.enabled !== false,
    visual: item.visual || {},
    source: item.source,
  } : {
    id: '',
    slot: 'tile_name',
    rarity: 'rare',
    source: 'shop',
    price: 600,
    name: { ru: '', en: '' },
    description: { ru: '', en: '' },
    image: '',
    enabled: true,
    visual: { target: { layout: meta.boards[0]?.id || 'classic', tileId: 1 }, glyph: '🏷️', colors: ['#e3bb5c', '#3d2e0f'] },
  }));
  const [busy, run] = useAction();
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const slot = creating ? draft.slot : item.slot;
  const band = meta.priceBands[draft.rarity];
  const outOfBand = draft.source === 'shop' && draft.price !== '' && band && (draft.price < band[0] || draft.price > band[1]);
  const preview = {
    ...(item || {}), ...draft, id: draft.id || item?.id || 'preview', slot, category: meta.slots[slot]?.category, image: draft.image || null,
  };
  if (slot === 'tile_name') preview.visual = { ...draft.visual, names: draft.name };

  const submit = async () => {
    const body = { ...draft, price: draft.price === '' ? null : draft.price };
    if (slot === 'tile_name') body.visual = { ...draft.visual, names: draft.name };
    if (creating) {
      const out = await run(() => creatorRequest(token, '/api/admin/shop/items', { method: 'POST', body }), t('creator.shop.created'));
      if (out) {
        onChanged();
        onClose();
      }
      return;
    }
    const priceChanged = item.price !== body.price;
    if (priceChanged || item.enabled !== body.enabled) {
      const ok = await ask({
        title: t('creator.shop.saveTitle', { name: itemName(item, language) }),
        message: priceChanged ? t('creator.shop.priceChange', { from: item.price ?? '—', to: body.price ?? '—' }) : t('creator.shop.saleChange'),
        details: <ValueDiff before={{ price: item.price, enabled: item.enabled !== false }} after={{ price: body.price, enabled: body.enabled }} />,
        tone: 'primary',
      });
      if (!ok) return;
    }
    if (item.source !== 'shop' && !item.custom) delete body.price;
    if (!item.custom) {
      delete body.visual;
      delete body.source;
    }
    const out = await run(() => creatorRequest(token, `/api/admin/shop/items/${encodeURIComponent(item.id)}`, { method: 'PUT', body }), t('creator.shop.saved'));
    if (out) onChanged();
  };

  const remove = async () => {
    const ok = await ask({
      title: t('creator.shop.deleteTitle', { name: itemName(item, language) }),
      message: item.custom
        ? (item.owners ? t('creator.shop.deleteRetire', { n: item.owners }) : t('creator.shop.deleteErase'))
        : t('creator.shop.deleteBuiltIn'),
      critical: true,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/shop/items/${encodeURIComponent(item.id)}`, { method: 'DELETE', body: { confirm: true } }), t('creator.shop.deleted'));
    if (out) {
      onChanged();
      onClose();
    }
  };

  const reset = async () => {
    const ok = await ask({ title: t('creator.shop.resetTitle'), message: t('creator.shop.resetText'), critical: true });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/shop/items/${encodeURIComponent(item.id)}/reset`, { method: 'POST', body: { confirm: true } }), t('creator.shop.saved'));
    if (out) {
      onChanged();
      onClose();
    }
  };

  return (
    <Drawer
      wide
      title={creating ? t('creator.shop.newItem') : itemName(item, language)}
      subtitle={creating ? null : `${item.id} · ${t(`slot.${item.slot}`)}`}
      onClose={onClose}
      footer={(
        <>
          {!creating && <Button tone="danger" icon="close" disabled={busy} onClick={remove}>{t('creator.shop.delete')}</Button>}
          {!creating && item.edited && <Button tone="subtle" icon="refresh" onClick={reset}>{t('creator.shop.reset')}</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button tone="primary" icon="check" disabled={busy} onClick={submit}>{creating ? t('creator.shop.create') : t('creator.shop.save')}</Button>
        </>
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[260px,1fr] 4xl:grid-cols-[360px,1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-44 w-full items-center justify-center rounded-2xl border border-white/[0.07] bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.07),transparent_70%)]">
            <ItemThumb item={preview} nickname="Player" />
          </div>
          {!creating && (
            <div className="grid w-full grid-cols-2 gap-2">
              <StatCard label={t('creator.shop.owners')} value={item.owners} icon="users" />
              <StatCard label={t('creator.shop.status')} value={item.forSale ? t('creator.shop.onSale') : t('creator.shop.offSale')} icon="bag" accent={item.forSale ? '#34d399' : '#f87171'} />
            </div>
          )}
          {!creating && item.updatedAt && <p className="text-[11px] text-zinc-500">{t('creator.mode.updated', { date: formatDate(item.updatedAt, language), by: item.updatedBy || '—' })}</p>}
        </div>
        <div className="flex flex-col gap-4">
          {creating && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label={t('creator.shop.id')} hint={t('creator.shop.idHint')}><TextInput value={draft.id} onChange={(id) => set({ id: id.toLowerCase() })} placeholder="tile_name_my_street" /></FieldRow>
              <FieldRow label={t('creator.shop.slot')}>
                <Select value={draft.slot} onChange={(s) => set({ slot: s, visual: s === 'tile_name' ? draft.visual : {} })} options={Object.keys(meta.slots).map((s) => ({ value: s, label: `${t(`category.${meta.slots[s].category}`)} · ${t(`slot.${s}`)}` }))} />
              </FieldRow>
            </div>
          )}
          <LocalizedInputs label={slot === 'tile_name' ? t('creator.shop.squareName') : t('creator.shop.name')} value={draft.name} onChange={(name) => set({ name })} />
          <LocalizedInputs label={t('creator.shop.description')} value={draft.description} onChange={(description) => set({ description })} multiline rows={2} />
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldRow label={t('creator.shop.rarity')}>
              <Select value={draft.rarity} onChange={(rarity) => set({ rarity })} options={meta.rarities.map((r) => ({ value: r, label: t(`rarity.${r}`) }))} />
            </FieldRow>
            {(creating || item.custom) && (
              <FieldRow label={t('creator.shop.source')}>
                <Select value={draft.source} onChange={(source) => set({ source })} options={meta.sources.map((s) => ({ value: s, label: t(`creator.shop.sources.${s}`) }))} />
              </FieldRow>
            )}
            {draft.source === 'shop' && (
              <FieldRow label={t('creator.shop.price')} hint={band ? `${band[0]}–${band[1]}` : null}>
                <NumberInput value={draft.price} min={1} onChange={(price) => set({ price })} />
              </FieldRow>
            )}
          </div>
          {outOfBand && <p className="text-[12px] text-amber-300">{t('creator.shop.outOfBand', { from: band[0], to: band[1] })}</p>}
          <ImageField label={t('creator.shop.image')} value={draft.image} onChange={(image) => set({ image })} title={draft.name?.en || draft.id} />
          {slot === 'tile_name' && (creating || item.custom) && (
            <>
              <TileTargetFields value={draft.visual.target} onChange={(target) => set({ visual: { ...draft.visual, target } })} boards={meta.boards} groups={meta.groups} />
              <div className="grid gap-3 sm:grid-cols-3">
                <FieldRow label={t('creator.shop.glyph')}><TextInput value={draft.visual.glyph} onChange={(glyph) => set({ visual: { ...draft.visual, glyph } })} maxLength={8} /></FieldRow>
                <FieldRow label={t('creator.shop.colorFrom')}><input type="color" value={draft.visual.colors?.[0] || '#e3bb5c'} onChange={(e) => set({ visual: { ...draft.visual, colors: [e.target.value, draft.visual.colors?.[1] || '#3d2e0f'] } })} className="h-9 w-full rounded-lg border border-white/10 bg-black/30" /></FieldRow>
                <FieldRow label={t('creator.shop.colorTo')}><input type="color" value={draft.visual.colors?.[1] || '#3d2e0f'} onChange={(e) => set({ visual: { ...draft.visual, colors: [draft.visual.colors?.[0] || '#e3bb5c', e.target.value] } })} className="h-9 w-full rounded-lg border border-white/10 bg-black/30" /></FieldRow>
              </div>
            </>
          )}
          {slot !== 'tile_name' && (creating || item.custom) && (
            <FieldRow label={t('creator.shop.visual')} hint={t('creator.shop.visualHint')}>
              <TextArea
                value={JSON.stringify(draft.visual, null, 2)}
                rows={5}
                className="font-mono text-[12px]"
                onChange={(text) => {
                  try {
                    set({ visual: JSON.parse(text) });
                  } catch { /* keep typing */ }
                }}
              />
            </FieldRow>
          )}
          <Toggle checked={draft.enabled} onChange={(enabled) => set({ enabled })} label={t('creator.shop.enabled')} hint={t('creator.shop.enabledHint')} />
        </div>
      </div>
    </Drawer>
  );
}

export default function ShopSection({ token }) {
  const { t, language } = useTranslation();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/shop', token);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [sale, setSale] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items
      .filter((i) => category === 'all' || i.category === category)
      .filter((i) => rarity === 'all' || i.rarity === rarity)
      .filter((i) => {
        if (sale === 'on') return i.forSale;
        if (sale === 'off') return i.source === 'shop' && !i.forSale;
        if (sale === 'earned') return i.source !== 'shop';
        if (sale === 'custom') return i.custom;
        if (sale === 'edited') return i.edited;
        return true;
      })
      .filter((i) => !q || `${i.id} ${i.name.en} ${i.name.ru}`.toLowerCase().includes(q));
  }, [data, query, category, rarity, sale]);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;
  const open = data.items.find((i) => i.id === openId);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.shop.title', { n: data.items.length })} subtitle={data.shopOpen ? t('creator.shop.subtitle') : t('creator.shop.closedNote')} updatedAt={updatedAt} onRefresh={reload} loading={loading}>
        <Button tone="primary" icon="plus" onClick={() => setCreating(true)}>{t('creator.shop.newItem')}</Button>
      </SectionHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t('creator.shop.onSale')} value={data.items.filter((i) => i.forSale).length} icon="bag" accent="#34d399" />
        <StatCard label={t('creator.shop.offSale')} value={data.items.filter((i) => i.source === 'shop' && !i.forSale).length} icon="ban" accent="#f87171" />
        <StatCard label={t('creator.shop.customCount')} value={data.items.filter((i) => i.custom).length} icon="sparkles" accent="#a78bfa" />
        <StatCard label={t('creator.shop.fieldNames')} value={data.items.filter((i) => i.slot === 'tile_name').length} icon="box" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder={t('shop.search')} className="sm:w-64" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#121418] px-2.5 text-[12.5px] text-zinc-200">
          <option value="all">{t('category.all')}</option>
          {data.categories.map((c) => <option key={c} value={c}>{t(`category.${c}`)}</option>)}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#121418] px-2.5 text-[12.5px] text-zinc-200">
          <option value="all">{t('creator.shop.anyRarity')}</option>
          {data.rarities.map((r) => <option key={r} value={r}>{t(`rarity.${r}`)}</option>)}
        </select>
        <Segmented value={sale} onChange={setSale} options={['all', 'on', 'off', 'earned', 'custom', 'edited'].map((s) => ({ value: s, label: t(`creator.shop.filter.${s}`) }))} />
      </div>

      <Card bodyClass="p-0">
        <Table
          rowKey={(i) => i.id}
          rows={rows}
          onRowClick={(i) => setOpenId(i.id)}
          empty={t('creator.shop.empty')}
          columns={[
            {
              key: 'item',
              label: t('creator.shop.item'),
              render: (i) => (
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-12 shrink-0 scale-75 items-center justify-center">{i.slot === 'tile_name' || i.image ? <ItemThumb item={i} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RARITY_META[i.rarity]?.color }} />}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-zinc-100">{itemName(i, language)}</span>
                    <span className="truncate font-mono text-[10.5px] text-zinc-500">{i.id}</span>
                  </span>
                </span>
              ),
            },
            { key: 'category', label: t('inventory.col.category'), render: (i) => `${t(`category.${i.category}`)} · ${t(`slot.${i.slot}`)}` },
            { key: 'rarity', label: t('creator.shop.rarity'), render: (i) => <span style={{ color: RARITY_META[i.rarity]?.color }}>{t(`rarity.${i.rarity}`)}</span> },
            { key: 'price', label: t('creator.shop.price'), align: 'right', render: (i) => (i.price ? i.price.toLocaleString() : '—') },
            { key: 'source', label: t('creator.shop.source'), render: (i) => t(`creator.shop.sources.${i.source}`) },
            { key: 'owners', label: t('creator.shop.owners'), align: 'right' },
            {
              key: 'state',
              label: t('admin.col.status'),
              render: (i) => (
                <span className="flex gap-1">
                  {i.source === 'shop' && <Badge tone={i.forSale ? 'green' : 'red'}>{i.forSale ? t('creator.shop.onSale') : t('creator.shop.offSale')}</Badge>}
                  {i.custom && <Badge tone="violet">{t('creator.shop.customBadge')}</Badge>}
                  {i.edited && <Badge tone="amber">{t('creator.shop.editedBadge')}</Badge>}
                  {i.retired && <Badge>{t('creator.shop.retired')}</Badge>}
                </span>
              ),
            },
          ]}
        />
      </Card>

      {(open || creating) && (
        <ItemEditor key={open?.id || 'new'} item={creating ? null : open} meta={data} onClose={() => { setOpenId(null); setCreating(false); }} onChanged={reload} />
      )}
    </div>
  );
}
