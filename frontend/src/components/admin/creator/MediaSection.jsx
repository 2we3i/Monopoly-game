// MediaSection.jsx
// The media library: every picture the games use (meme pictures, pictures
// on board squares, shop item pictures) and every upload, with search,
// filters and a large preview. Each picture can be renamed, described,
// linked to a mode, a board square or a meme, replaced with a new file, or
// deleted - the change shows in the game at once.

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { formatDate } from '../../../lib/api';
import {
  Badge, Button, CopyButton, Drawer, ErrorState, Segmented, Spinner,
} from '../../ui/dash';
import { gameName } from '../../ui/labels';
import SectionHeader from '../SectionHeader';
import useAdminData from '../useAdminData';
import {
  EmptyState, FieldRow, NumberInput, SearchBox, Select, TextArea, TextInput,
  creatorRequest, localizedText, uploadFile, useAction, useCreator,
} from '../kit';

const KIND_TONE = {
  meme: 'violet', tile: 'amber', item: 'blue', upload: 'green',
};

function MediaDrawer({
  entry, boards, modes, onClose, onChanged,
}) {
  const { t, language } = useTranslation();
  const { token, ask } = useCreator();
  const [title, setTitle] = useState(entry.title || '');
  const [description, setDescription] = useState(entry.description || '');
  const [modeId, setModeId] = useState(entry.modeId || '');
  const [layoutId, setLayoutId] = useState(entry.tile?.layoutId || '');
  const [tileId, setTileId] = useState(entry.tile?.tileId ?? '');
  const [memeId, setMemeId] = useState('');
  const [busy, run] = useAction();
  const fileInput = useRef(null);
  const [size, setSize] = useState(null);

  const save = async () => {
    const body = { title, description, modeId: modeId || null };
    if (layoutId !== (entry.tile?.layoutId || '') || tileId !== (entry.tile?.tileId ?? '')) {
      body.tile = layoutId && tileId !== '' ? { layoutId, tileId: Number(tileId) } : null;
    }
    if (memeId.trim()) body.memeId = memeId.trim();
    const out = await run(() => creatorRequest(token, `/api/admin/media/${encodeURIComponent(entry.id)}`, { method: 'PUT', body }), t('creator.media.saved'));
    if (out) onChanged();
  };

  const replace = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = await ask({
      title: t('creator.media.replaceTitle'),
      message: t('creator.media.replaceText', { name: file.name }),
      critical: entry.kind !== 'upload' || (entry.usages?.length || 0) > 0,
      tone: 'primary',
    });
    if (!ok) return;
    const out = await run(() => uploadFile(token, `/api/admin/media/${encodeURIComponent(entry.id)}/replace`, file), t('creator.media.replaced'));
    if (out) {
      onChanged();
      onClose();
    }
  };

  const remove = async () => {
    const inUse = entry.kind !== 'upload' || (entry.usages?.length || 0) > 0;
    const ok = await ask({
      title: t('creator.media.deleteTitle'),
      message: inUse ? t('creator.media.deleteUsed', { n: entry.usages?.length || 1 }) : t('creator.media.deleteText'),
      critical: true,
      details: <img src={entry.url} alt="" className="mx-auto max-h-40 rounded-lg" />,
    });
    if (!ok) return;
    const out = await run(() => creatorRequest(token, `/api/admin/media/${encodeURIComponent(entry.id)}`, { method: 'DELETE', body: { confirm: true, force: true } }), t('creator.media.deleted'));
    if (out) {
      onChanged();
      onClose();
    }
  };

  return (
    <Drawer
      wide
      title={entry.title || entry.id}
      subtitle={entry.id}
      onClose={onClose}
      footer={(
        <>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={replace} />
          <Button icon="refresh" disabled={busy} onClick={() => fileInput.current?.click()}>{t('creator.media.replace')}</Button>
          <Button tone="danger" icon="close" disabled={busy} onClick={remove}>{t('creator.media.delete')}</Button>
          <span className="flex-1" />
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button tone="primary" icon="check" disabled={busy} onClick={save}>{t('creator.media.save')}</Button>
        </>
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[repeating-conic-gradient(#1b1d22_0%_25%,#15171b_0%_50%)] bg-[length:24px_24px] p-3 4xl:min-h-[560px]">
            <img
              src={entry.url}
              alt={entry.title}
              className="max-h-[60vh] max-w-full object-contain"
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-400">
            <Badge tone={KIND_TONE[entry.kind]}>{t(`creator.media.kind.${entry.kind}`)}</Badge>
            {size && <span className="tnum">{size.w}×{size.h}</span>}
            {entry.size && <span className="tnum">{Math.round(entry.size / 1024)} KB</span>}
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{entry.url}</span>
            <CopyButton text={entry.url} label={t('common.copy')} copiedLabel={t('common.copied')} />
          </div>
          {entry.credit && <p className="text-[11.5px] text-zinc-500">© {entry.credit.author} · {entry.credit.license}</p>}
        </div>
        <div className="flex flex-col gap-4">
          <FieldRow label={t('creator.media.title')}><TextInput value={title} onChange={setTitle} maxLength={120} /></FieldRow>
          <FieldRow label={t('creator.media.description')}><TextArea value={description} onChange={setDescription} rows={3} /></FieldRow>
          <FieldRow label={t('creator.media.mode')}>
            <Select value={modeId} onChange={setModeId} options={[{ value: '', label: '—' }, ...modes.map((m) => ({ value: m.id, label: `${gameName(t, m.gameId)} · ${localizedText(m.label, language)}` }))]} />
          </FieldRow>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="mb-2 text-[12px] font-medium text-zinc-300">{t('creator.media.bindTile')}</p>
            <div className="grid grid-cols-[1fr,110px] gap-2">
              <Select value={layoutId} onChange={setLayoutId} options={[{ value: '', label: '—' }, ...boards.map((b) => ({ value: b.id, label: localizedText(b.label, language) }))]} />
              <NumberInput value={tileId} min={0} onChange={setTileId} placeholder="#" />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">{t('creator.media.bindTileHint')}</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="mb-2 text-[12px] font-medium text-zinc-300">{t('creator.media.bindMeme')}</p>
            <TextInput value={memeId} onChange={setMemeId} placeholder="animals.16.m9" />
            <p className="mt-1.5 text-[11px] text-zinc-500">{t('creator.media.bindMemeHint')}</p>
          </div>
          {entry.usages?.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('creator.media.usedIn')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {entry.usages.map((u) => <li key={`${u.kind}:${u.id}`}><Badge tone={KIND_TONE[u.kind]}>{t(`creator.media.kind.${u.kind}`)} · {u.id}</Badge></li>)}
              </ul>
            </div>
          )}
          {entry.updatedAt && <p className="text-[11px] text-zinc-500">{t('creator.media.updated', { date: formatDate(entry.updatedAt, language) })}</p>}
        </div>
      </div>
    </Drawer>
  );
}

export default function MediaSection({ token }) {
  const { t, language } = useTranslation();
  const { toast } = useCreator();
  const {
    data, error, loading, reload, updatedAt,
  } = useAdminData('/api/admin/media', token);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [mode, setMode] = useState('');
  const [sort, setSort] = useState('title');
  const [openId, setOpenId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef(null);

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const out = data.media
      .filter((m) => kind === 'all' || m.kind === kind)
      .filter((m) => !mode || m.modeId === mode)
      .filter((m) => !q || `${m.id} ${m.title} ${m.description} ${m.url} ${(m.tags || []).join(' ')}`.toLowerCase().includes(q));
    if (sort === 'title') out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    if (sort === 'recent') out.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return out;
  }, [data, query, kind, mode, sort]);

  if (!data) return error ? <ErrorState error={error} onRetry={reload} retryLabel={t('common.retry')} /> : <Spinner block />;

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      // eslint-disable-next-line no-restricted-syntax
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        await uploadFile(token, '/api/admin/media', file, { title: file.name.replace(/\.[^.]+$/, ''), modeId: mode || null });
      }
      toast(t('creator.media.uploadedN', { n: files.length }));
      reload();
    } catch (err) {
      toast(err.message, 'red');
    } finally {
      setUploading(false);
    }
  };

  const counts = data.media.reduce((acc, m) => ({ ...acc, [m.kind]: (acc[m.kind] || 0) + 1 }), {});
  const open = data.media.find((m) => m.id === openId);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('creator.media.titleSection', { n: data.media.length })} subtitle={t('creator.media.subtitle')} updatedAt={updatedAt} onRefresh={reload} loading={loading}>
        <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={upload} />
        <Button tone="primary" icon="plus" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? t('common.loading') : t('creator.media.uploadNew')}</Button>
      </SectionHeader>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder={t('creator.media.search')} className="sm:w-72" />
        <Segmented
          value={kind}
          onChange={setKind}
          options={['all', 'meme', 'tile', 'item', 'upload'].map((k) => ({ value: k, label: `${k === 'all' ? t('common.all') : t(`creator.media.kind.${k}`)}${k !== 'all' && counts[k] ? ` · ${counts[k]}` : ''}` }))}
        />
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#121418] px-2.5 text-[12.5px] text-zinc-200">
          <option value="">{t('creator.media.anyMode')}</option>
          {data.modes.map((m) => <option key={m.id} value={m.id}>{gameName(t, m.gameId)} · {localizedText(m.label, language)}</option>)}
        </select>
        <Segmented value={sort} onChange={setSort} options={[{ value: 'title', label: t('creator.media.sortTitle') }, { value: 'recent', label: t('creator.media.sortRecent') }]} />
      </div>

      {list.length === 0 ? <EmptyState icon="eye" title={t('creator.media.empty')} /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-10 5xl:grid-cols-12">
          {list.map((m) => (
            <button key={m.id} type="button" onClick={() => setOpenId(m.id)} className={`group flex flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#121418] text-left transition-all hover:-translate-y-0.5 hover:border-white/20 ${m.enabled === false ? 'opacity-50' : ''}`}>
              <span className="flex aspect-square items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#1b1d22_0%_25%,#15171b_0%_50%)] bg-[length:16px_16px]">
                <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </span>
              <span className="flex flex-col gap-1 p-2">
                <span className="truncate text-[12px] text-zinc-200">{m.title || m.id}</span>
                <span className="flex items-center gap-1">
                  <Badge tone={KIND_TONE[m.kind]}>{t(`creator.media.kind.${m.kind}`)}</Badge>
                  {m.modeId && <span className="truncate font-mono text-[10px] text-zinc-500">{m.modeId}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && <MediaDrawer key={open.id} entry={open} boards={data.boards} modes={data.modes} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}
