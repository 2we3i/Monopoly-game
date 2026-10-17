// MemesSection.jsx
// Every Meme Hype card, pack by pack and by age rating: memes with a live
// preview and the situations they answer. Captions, emoji, background,
// picture (upload or replace), weight and switches are edited here; new
// memes and situations are added; cards are deleted, restored or reset.
// The server applies each change at once - the next card dealt shows it.

import { useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import {
  Badge, Button, Card, Dialog, Drawer, ErrorState, Segmented, Spinner,
} from '../../ui/dash';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  EmptyState, FieldRow, ImageField, NumberInput, SearchBox, Select, Tabs, TextArea, TextInput, Toggle,
  creatorRequest, localizedText, useAction, useCreator,
} from '../kit';

export function MemePreview({ meme, className = '' }) {
  const [from, to] = meme.colors || ['#555', '#222'];
  return (
    <div
      className={`relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-xl text-center font-black uppercase text-white shadow-lift ${className}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})`, textShadow: '0 2px 0 #000, 0 0 6px rgba(0,0,0,0.8)' }}
    >
      {meme.image
        ? <img src={meme.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        : <span className="absolute inset-0 flex items-center justify-center text-[56px] 4xl:text-[80px]">{meme.art}</span>}
      <span className="relative px-2 pt-2 text-[12px] leading-tight 4xl:text-[15px]">{meme.top}</span>
      <span className="relative px-2 pb-2 text-[12px] leading-tight 4xl:text-[15px]">{meme.bottom}</span>
    </div>
  );
}

function MemeDrawer({
  meme, palette, onClose, onChanged,
}) {
  const { t } = useTranslation();
  const { token, ask } = useCreator();
  const [draft, setDraft] = useState(() => ({
    top: meme.top, bottom: meme.bottom, art: meme.art, image: meme.image || '', enabled: meme.enabled, weight: meme.weight, title: meme.title || '', description: meme.description || '', bg: '',
  }));
  const [busy, run] = useAction();
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const preview = {
    ...meme, ...draft, image: draft.image || null, colors: draft.bg && palette[draft.bg] ? palette[draft.bg] : meme.colors,
  };

  const save = async () => {
    const body = { ...draft };
    if (!body.bg) delete body.bg;
    const out = await run(() => creatorRequest(token, `/api/admin/memes/${encodeURIComponent(meme.id)}`, { method: 'PUT', body }), t('creator.memes.saved'));
    if (out) onChanged();
  };
  const remove = async () => {
    const ok = await ask({
      title: t('creator.memes.deleteTitle'), message: t('creator.memes.deleteText'), critical: true, details: <div className="mx-auto w-40"><MemePreview meme={meme} /></div>,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/memes/${encodeURIComponent(meme.id)}`, { method: 'DELETE', body: { confirm: true } }), t('creator.memes.deleted'));
    if (out) {
      onChanged();
      onClose();
    }
  };
  const restore = async () => {
    const out = await run(() => creatorRequest(token, `/api/admin/memes/${encodeURIComponent(meme.id)}/restore`, { method: 'POST' }), t('creator.memes.restored'));
    if (out) onChanged();
  };
  const reset = async () => {
    const ok = await ask({ title: t('creator.memes.resetTitle'), message: t('creator.memes.resetText') });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/memes/${encodeURIComponent(meme.id)}/reset`, { method: 'POST', body: { confirm: true } }), t('creator.memes.saved'));
    if (out) {
      onChanged();
      onClose();
    }
  };

  return (
    <Drawer
      wide
      title={meme.title || `${meme.top} ${meme.bottom}`.trim() || meme.id}
      subtitle={meme.id}
      onClose={onClose}
      footer={(
        <>
          {meme.deleted
            ? (!meme.custom && <Button tone="success" icon="refresh" disabled={busy} onClick={restore}>{t('creator.memes.restore')}</Button>)
            : <Button tone="danger" icon="close" disabled={busy} onClick={remove}>{t('creator.memes.delete')}</Button>}
          {meme.overridden && !meme.custom && <Button tone="subtle" icon="refresh" onClick={reset}>{t('creator.memes.reset')}</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button tone="primary" icon="check" disabled={busy} onClick={save}>{t('creator.memes.save')}</Button>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px,1fr] 4xl:grid-cols-[360px,1fr]">
        <div className="flex flex-col gap-3">
          <MemePreview meme={preview} />
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={meme.rating === '18' ? 'red' : 'blue'}>{meme.rating}+</Badge>
            {meme.custom && <Badge tone="violet">{t('creator.memes.custom')}</Badge>}
            {meme.overridden && <Badge tone="amber">{t('creator.memes.edited')}</Badge>}
            {meme.deleted && <Badge tone="red">{t('creator.memes.deletedBadge')}</Badge>}
            {meme.imageSource && <Badge>{t(`creator.memes.source.${meme.imageSource}`)}</Badge>}
          </div>
          {meme.credit && <p className="text-[11px] text-zinc-500">© {meme.credit.author} · {meme.credit.license}</p>}
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldRow label={t('creator.memes.top')}><TextInput value={draft.top} onChange={(top) => set({ top })} maxLength={120} /></FieldRow>
            <FieldRow label={t('creator.memes.bottom')}><TextInput value={draft.bottom} onChange={(bottom) => set({ bottom })} maxLength={120} /></FieldRow>
            <FieldRow label={t('creator.memes.art')}><TextInput value={draft.art} onChange={(art) => set({ art })} maxLength={16} /></FieldRow>
            <FieldRow label={t('creator.memes.background')}>
              <Select value={draft.bg} onChange={(bg) => set({ bg })} options={[{ value: '', label: t('creator.memes.keepBackground') }, ...Object.keys(palette).map((k) => ({ value: k, label: k }))]} />
            </FieldRow>
          </div>
          <ImageField label={t('creator.memes.picture')} value={draft.image} onChange={(image) => set({ image })} title={meme.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldRow label={t('creator.memes.title')}><TextInput value={draft.title} onChange={(title) => set({ title })} maxLength={120} /></FieldRow>
            <FieldRow label={t('creator.memes.weight')} hint={t('creator.memes.weightHint')}><NumberInput value={draft.weight} min={0.1} max={10} step={0.1} onChange={(weight) => set({ weight })} /></FieldRow>
          </div>
          <FieldRow label={t('creator.memes.description')}><TextArea value={draft.description} onChange={(description) => set({ description })} rows={2} /></FieldRow>
          <Toggle checked={draft.enabled} onChange={(enabled) => set({ enabled })} label={t('creator.memes.enabled')} hint={t('creator.memes.enabledHint')} />
        </div>
      </div>
    </Drawer>
  );
}

function CreateDialog({ packs, onClose, onCreated }) {
  const { t, language } = useTranslation();
  const { token } = useCreator();
  const [kind, setKind] = useState('meme');
  const [draft, setDraft] = useState({
    pack: packs[0]?.id, rating: '16', top: '', bottom: '', art: '😂', image: '', bg: '', text: '', category: 'misc',
  });
  const [busy, run] = useAction();
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const pack = packs.find((p) => p.id === draft.pack);
  const create = async () => {
    const out = await run(() => creatorRequest(token, '/api/admin/memes', { method: 'POST', body: { ...draft, kind } }), t('creator.memes.created'));
    if (out) onCreated();
  };
  const colors = pack?.palette?.[draft.bg] || Object.values(pack?.palette || {})[0];
  return (
    <Dialog
      title={t('creator.memes.createTitle')}
      onClose={onClose}
      width="max-w-2xl"
      footer={(
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button tone="primary" icon="plus" disabled={busy} onClick={create}>{t('creator.memes.create')}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'meme', label: t('creator.memes.kindMeme') }, { value: 'situation', label: t('creator.memes.kindSituation') }]} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldRow label={t('creator.memes.pack')}><Select value={draft.pack} onChange={(p) => set({ pack: p, bg: '' })} options={packs.map((p) => ({ value: p.id, label: `${p.emoji} ${localizedText(p.title, language)}` }))} /></FieldRow>
          <FieldRow label={t('creator.memes.rating')}><Select value={draft.rating} onChange={(rating) => set({ rating })} options={[{ value: '16', label: '16+' }, { value: '18', label: '18+' }]} /></FieldRow>
        </div>
        {kind === 'meme' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px,1fr]">
            <MemePreview meme={{ ...draft, image: draft.image || null, colors }} />
            <div className="flex flex-col gap-3">
              <FieldRow label={t('creator.memes.top')}><TextInput value={draft.top} onChange={(top) => set({ top })} /></FieldRow>
              <FieldRow label={t('creator.memes.bottom')}><TextInput value={draft.bottom} onChange={(bottom) => set({ bottom })} /></FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label={t('creator.memes.art')}><TextInput value={draft.art} onChange={(art) => set({ art })} maxLength={16} /></FieldRow>
                <FieldRow label={t('creator.memes.background')}><Select value={draft.bg} onChange={(bg) => set({ bg })} options={[{ value: '', label: '—' }, ...Object.keys(pack?.palette || {}).map((k) => ({ value: k, label: k }))]} /></FieldRow>
              </div>
              <ImageField label={t('creator.memes.picture')} value={draft.image} onChange={(image) => set({ image })} />
            </div>
          </div>
        ) : (
          <>
            <FieldRow label={t('creator.memes.situationText')}><TextArea value={draft.text} onChange={(text) => set({ text })} rows={3} /></FieldRow>
            <FieldRow label={t('creator.memes.category')}><TextInput value={draft.category} onChange={(category) => set({ category })} /></FieldRow>
          </>
        )}
      </div>
    </Dialog>
  );
}

function SituationRow({ situation, onChanged }) {
  const { t } = useTranslation();
  const { token, ask } = useCreator();
  const [text, setText] = useState(situation.text);
  const [busy, run] = useAction();
  const save = (patch) => run(() => creatorRequest(token, `/api/admin/memes/${encodeURIComponent(situation.id)}`, { method: 'PUT', body: patch }), t('creator.memes.saved')).then((out) => out && onChanged());
  const remove = async () => {
    const ok = await ask({ title: t('creator.memes.deleteSituationTitle'), message: situation.text, critical: true });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/memes/${encodeURIComponent(situation.id)}`, { method: 'DELETE', body: { confirm: true } }), t('creator.memes.deleted'));
    if (out) onChanged();
  };
  return (
    <li className={`flex flex-wrap items-center gap-2 px-4 py-2 ${situation.enabled ? '' : 'opacity-50'}`}>
      <span className="w-28 shrink-0 truncate font-mono text-[10.5px] text-zinc-500">{situation.id}</span>
      <Badge>{situation.category}</Badge>
      <TextInput value={text} onChange={setText} className="min-w-[240px] flex-1" />
      <Toggle checked={situation.enabled} onChange={(enabled) => save({ enabled })} />
      <Button disabled={busy || text === situation.text} onClick={() => save({ text })}>{t('creator.memes.save')}</Button>
      {!situation.deleted && <Button tone="subtle" icon="close" onClick={remove} />}
    </li>
  );
}

export default function MemesSection({ token }) {
  const { t, language } = useTranslation();
  const { ask } = useCreator();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/memes', token);
  const [packId, setPackId] = useState('all');
  const [rating, setRating] = useState('16');
  const [tab, setTab] = useState('memes');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [, run] = useAction();

  const all = useMemo(() => {
    if (!data) return { memes: [], situations: [] };
    const packs = data.packs.filter((p) => packId === 'all' || p.id === packId);
    return {
      memes: packs.flatMap((p) => p.byRating[rating].memes.map((m) => ({ ...m, palette: p.palette }))),
      situations: packs.flatMap((p) => p.byRating[rating].situations),
    };
  }, [data, packId, rating]);

  const memes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.memes
      .filter((m) => !q || `${m.id} ${m.top} ${m.bottom} ${m.art} ${m.title || ''}`.toLowerCase().includes(q))
      .filter((m) => {
        if (filter === 'picture') return !!m.image;
        if (filter === 'emoji') return !m.image;
        if (filter === 'edited') return m.overridden || m.custom;
        if (filter === 'off') return !m.enabled;
        return filter === 'all' ? !m.deleted : true;
      });
  }, [all, query, filter]);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  const situations = all.situations.filter((s) => !query || s.text.toLowerCase().includes(query.trim().toLowerCase()));
  const open = all.memes.find((m) => m.id === openId);

  const togglePack = async (pack) => {
    const ok = await ask({
      title: pack.enabled ? t('creator.memes.packOffTitle') : t('creator.memes.packOnTitle'),
      message: localizedText(pack.title, language),
      critical: pack.enabled,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/memes/packs/${pack.id}`, { method: 'PUT', body: { enabled: !pack.enabled, confirm: true } }), t('creator.memes.saved'));
    if (out) reload();
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.memes.sectionTitle')} subtitle={t('creator.memes.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading}>
        <Button tone="primary" icon="plus" onClick={() => setCreating(true)}>{t('creator.memes.new')}</Button>
      </SectionHeader>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {data.packs.map((pack) => (
          <div key={pack.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${packId === pack.id ? 'border-brass/50 bg-brass/[0.06]' : 'border-white/[0.07] bg-[#121418]'}`}>
            <button type="button" onClick={() => setPackId(packId === pack.id ? 'all' : pack.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="text-[28px]">{pack.emoji}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-zinc-100">{localizedText(pack.title, language)}</span>
                <span className="block text-[11.5px] text-zinc-500">
                  {t('creator.memes.packCounts', { memes: pack.byRating[rating].memes.length, situations: pack.byRating[rating].situations.length })}
                </span>
                {/* A pack built from an outside source says when it was
                    last brought in line with it. */}
                {pack.source?.syncedAt && (
                  <span className="block truncate text-[11px] text-zinc-600">
                    {t('creator.memes.packSynced', { date: new Date(pack.source.syncedAt).toLocaleDateString() })}
                  </span>
                )}
              </span>
            </button>
            <Toggle checked={pack.enabled} onChange={() => togglePack(pack)} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={rating} onChange={setRating} options={data.ratings.map((r) => ({ value: r, label: `${r}+` }))} />
        <SearchBox value={query} onChange={setQuery} placeholder={t('creator.memes.search')} className="sm:w-72" />
        {tab === 'memes' && (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={['all', 'picture', 'emoji', 'edited', 'off'].map((f) => ({ value: f, label: t(`creator.memes.filter.${f}`) }))}
          />
        )}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'memes', label: t('creator.memes.memes'), count: memes.length, icon: 'heart' }, { value: 'situations', label: t('creator.memes.situations'), count: situations.length, icon: 'filter' }]} />

      {tab === 'memes' && (memes.length === 0 ? <EmptyState icon="heart" title={t('creator.memes.empty')} /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-10">
          {memes.map((meme) => (
            <button key={meme.id} type="button" onClick={() => setOpenId(meme.id)} className={`group flex flex-col gap-1.5 text-left ${meme.enabled ? '' : 'opacity-45'}`}>
              <MemePreview meme={meme} className="transition-transform group-hover:-translate-y-0.5" />
              <span className="flex items-center gap-1">
                <span className="flex-1 truncate font-mono text-[10.5px] text-zinc-500">{meme.id}</span>
                {(meme.overridden || meme.custom) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
              </span>
            </button>
          ))}
        </div>
      ))}

      {tab === 'situations' && (
        <Card bodyClass="p-0">
          <ul className="divide-y divide-white/[0.05]">
            {situations.map((s) => <SituationRow key={s.id} situation={s} onChanged={reload} />)}
          </ul>
        </Card>
      )}

      {open && <MemeDrawer key={open.id} meme={open} palette={open.palette} onClose={() => setOpenId(null)} onChanged={reload} />}
      {creating && <CreateDialog packs={data.packs} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
    </div>
  );
}
