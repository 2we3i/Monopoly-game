// InventoryPage.jsx
// Everything the player owns: category, rarity, when and how it was
// obtained, whether it is equipped - with Equip, Unequip and Preview.
// The loadout at the top shows how the equipped pieces combine.

import { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import { itemName, useCatalog } from '../../lib/catalog';
import { formatDate } from '../../lib/api';
import { navigate } from '../../lib/router';
import PlatformShell, { LoginRequired } from '../platform/PlatformShell';
import {
  Button, Card, DashIcon, Drawer, Segmented, Spinner,
} from '../ui/dash';
import {
  BadgeStrip, RarityLabel, StyledName, TitleTag, useLook,
} from '../../cosmetics/Cosmetics';
import ItemPreview, { ItemThumb } from './ItemPreview';
import UserAvatar from '../social/UserAvatar';
import { isEquipped } from './ShopPage';

const LOADOUT_SLOTS = [
  'token_shape', 'token_frame', 'token_aura', 'token_trail', 'token_victory',
  'name_style', 'name_decor', 'name_intro', 'avatar_frame', 'title', 'badge',
  'profile_bg', 'profile_card', 'effect_join', 'effect_win', 'effect_loss', 'effect_reward', 'effect_rankup', 'effect_podium',
  'emote', 'sound_start', 'sound_win', 'sound_reward', 'sound_event', 'tile_name',
];

function Loadout({ auth, social, catalog, onPreview }) {
  const { t, language } = useTranslation();
  const look = useLook(social.loadout);
  const equipped = LOADOUT_SLOTS.flatMap((slot) => {
    const v = social.loadout[slot];
    return (Array.isArray(v) ? v : v ? [v] : []).map((id) => catalog.byId.get(id)).filter(Boolean);
  });
  return (
    <Card title={t('inventory.loadout')} subtitle={t('inventory.loadoutHint')}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1.4fr)] 4xl:gap-6">
        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4 4xl:p-6">
          <UserAvatar user={{ ...auth.account, cosmetics: social.loadout }} look={look} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-semibold text-zinc-50 4xl:text-[28px]"><StyledName nickname={auth.account.nickname} look={look} intro /></p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {look.title ? <TitleTag item={look.title} /> : <span className="text-[11.5px] text-zinc-500">{t('inventory.noTitle')}</span>}
              <BadgeStrip items={look.badges} size="sm" />
            </div>
            <p className="mt-2 text-[12px] text-zinc-500 4xl:text-[14px]">{t('inventory.equippedCount', { n: equipped.length })}</p>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5">
          {equipped.length === 0 && <li className="col-span-full py-6 text-center text-[12.5px] text-zinc-500">{t('inventory.nothingEquipped')}</li>}
          {equipped.map((item) => (
            <li key={`${item.slot}-${item.id}`}>
              <button type="button" onClick={() => onPreview(item)} className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5 text-left transition-colors hover:border-white/[0.14]">
                <span className="cos-static flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/20 [&_*]:!text-[14px] 4xl:h-12 4xl:w-14">
                  <ItemThumb item={item} nickname={auth.account.nickname.slice(0, 6)} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-medium text-zinc-200 4xl:text-[13.5px]">{itemName(item, language)}</span>
                  <span className="block truncate text-[10.5px] text-zinc-500 4xl:text-[12px]">{t(`slot.${item.slot}`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default function InventoryPage({ auth }) {
  const { t, language } = useTranslation();
  const social = useSocial();
  const catalog = useCatalog();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('all');
  const [sort, setSort] = useState('recent');
  const [equippedOnly, setEquippedOnly] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const rows = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return social.inventory
      .map((entry) => ({ ...entry, item: catalog.byId.get(entry.itemId) }))
      .filter((r) => r.item)
      .filter((r) => category === 'all' || r.item.category === category)
      .filter((r) => rarity === 'all' || r.item.rarity === rarity)
      .filter((r) => !equippedOnly || isEquipped(social.loadout, r.item))
      .filter((r) => !q || `${r.item.name.en} ${r.item.name.ru}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === 'rarity') return catalog.rarities.indexOf(b.item.rarity) - catalog.rarities.indexOf(a.item.rarity);
        if (sort === 'name') return itemName(a.item, language).localeCompare(itemName(b.item, language));
        return b.acquiredAt - a.acquiredAt;
      });
  }, [catalog, social.inventory, social.loadout, category, rarity, equippedOnly, query, sort, language]);

  if (!auth.isLoggedIn) {
    return <PlatformShell auth={auth} active="inventory"><LoginRequired text={t('inventory.loginRequired')} /></PlatformShell>;
  }

  const toggle = async (item) => {
    setBusyId(item.id);
    setError(null);
    try {
      if (isEquipped(social.loadout, item)) await social.unequip(item.id);
      else await social.equip(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const categoryCounts = {};
  social.inventory.forEach((e) => {
    const item = catalog?.byId.get(e.itemId);
    if (item) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });

  return (
    <PlatformShell auth={auth} active="inventory">
      {!catalog || !social.economyLoaded ? <Spinner block /> : (
        <div className="flex flex-col gap-4 4xl:gap-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50 4xl:text-[30px]">{t('inventory.title')}</h1>
              <p className="text-[12.5px] text-zinc-400 4xl:text-[15px]">{t('inventory.subtitle', { n: social.inventory.length, total: catalog.items.length })}</p>
            </div>
            <Button tone="primary" icon="bag" onClick={() => navigate('/shop')}>{t('nav.shop')}</Button>
          </div>

          <Loadout auth={auth} social={social} catalog={catalog} onPreview={setPreview} />

          <Card bodyClass="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-3 4xl:p-4">
              <div className="flex gap-1 overflow-x-auto scrollbar-thin">
                {['all', ...catalog.categories].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium 4xl:text-[14px] ${category === c ? 'bg-white/[0.09] text-zinc-50' : 'text-zinc-400 hover:bg-white/[0.04]'}`}
                  >
                    {t(`category.${c}`)}
                    {c !== 'all' && categoryCounts[c] ? <span className="ml-1 text-zinc-500 tnum">{categoryCounts[c]}</span> : null}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="relative">
                  <DashIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('shop.search')} className="field w-44 pl-8 text-[12.5px] 4xl:w-64 4xl:text-[14px]" />
                </div>
                <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="field w-auto py-2 text-[12.5px] 4xl:text-[14px]" aria-label={t('shop.rarity')}>
                  <option value="all" className="bg-[#16181d]">{t('shop.allRarities')}</option>
                  {catalog.rarities.map((r) => <option key={r} value={r} className="bg-[#16181d]">{t(`rarity.${r}`)}</option>)}
                </select>
                <Segmented value={sort} onChange={setSort} options={['recent', 'rarity', 'name'].map((v) => ({ value: v, label: t(`inventory.sort.${v}`) }))} />
                <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-300 4xl:text-[14px]">
                  <input type="checkbox" checked={equippedOnly} onChange={(e) => setEquippedOnly(e.target.checked)} className="accent-brass" />
                  {t('inventory.equippedOnly')}
                </label>
              </div>
            </div>
            {error && <p className="px-4 pt-3 text-[12.5px] text-red-300">{error}</p>}
            <div className="hidden grid-cols-[3.5rem,minmax(0,1.6fr),minmax(0,1fr),7rem,minmax(0,1fr),minmax(0,1fr),13rem] gap-3 border-b border-white/[0.05] px-4 py-2 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500 lg:grid 4xl:grid-cols-[4.5rem,minmax(0,1.6fr),minmax(0,1fr),9rem,minmax(0,1fr),minmax(0,1fr),16rem] 4xl:text-[12px]">
              <span />
              <span>{t('inventory.col.item')}</span>
              <span>{t('inventory.col.category')}</span>
              <span>{t('inventory.col.rarity')}</span>
              <span>{t('inventory.col.acquired')}</span>
              <span>{t('inventory.col.status')}</span>
              <span className="text-right">{t('inventory.col.actions')}</span>
            </div>
            <ul className="divide-y divide-white/[0.04]">
              {rows.length === 0 && (
                <li className="flex flex-col items-center gap-2 py-14 text-center">
                  <DashIcon name="box" className="h-8 w-8 text-zinc-600" />
                  <p className="text-[13px] text-zinc-400">{social.inventory.length ? t('shop.nothingFound') : t('inventory.empty')}</p>
                </li>
              )}
              {rows.map(({ item, acquiredAt, source }) => {
                const equipped = isEquipped(social.loadout, item);
                return (
                  <li key={item.id} className="cv-row grid grid-cols-[3.5rem,minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:grid-cols-[3.5rem,minmax(0,1.6fr),minmax(0,1fr),7rem,minmax(0,1fr),minmax(0,1fr),13rem] 4xl:grid-cols-[4.5rem,minmax(0,1.6fr),minmax(0,1fr),9rem,minmax(0,1fr),minmax(0,1fr),16rem] 4xl:py-3.5">
                    <span className="cos-static flex h-12 w-14 items-center justify-center overflow-hidden rounded-lg bg-black/20 [&_*]:max-w-full 4xl:h-14 4xl:w-[4.5rem]">
                      <ItemThumb item={item} nickname={auth.account.nickname.slice(0, 5)} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-zinc-100 4xl:text-[16px]">{itemName(item, language)}</p>
                      <p className="truncate text-[11.5px] text-zinc-500 4xl:text-[13px]">{t(`slot.${item.slot}`)} · {t(`notif.item.reason.${source}`)}</p>
                    </div>
                    <span className="col-start-2 text-[12px] text-zinc-400 lg:col-start-auto 4xl:text-[14px]">{t(`category.${item.category}`)}</span>
                    <span className="col-start-2 lg:col-start-auto"><RarityLabel rarity={item.rarity} /></span>
                    <span className="col-start-2 text-[12px] text-zinc-400 lg:col-start-auto 4xl:text-[14px]">{formatDate(acquiredAt, language)}</span>
                    <span className={`col-start-2 text-[12px] font-semibold lg:col-start-auto 4xl:text-[14px] ${equipped ? 'text-emerald-300' : 'text-zinc-500'}`}>
                      {equipped ? `● ${t('shop.equipped')}` : t('inventory.notEquipped')}
                    </span>
                    <div className="col-start-2 flex flex-wrap justify-start gap-1.5 lg:col-start-auto lg:justify-end">
                      <Button icon="eye" onClick={() => setPreview(item)}>{t('inventory.preview')}</Button>
                      <Button tone={equipped ? 'default' : 'success'} icon={equipped ? 'close' : 'check'} disabled={busyId === item.id} onClick={() => toggle(item)}>
                        {equipped ? t('inventory.unequip') : t('inventory.equip')}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {preview && (
        <Drawer
          title={itemName(preview, language)}
          subtitle={`${t(`category.${preview.category}`)} · ${t(`slot.${preview.slot}`)}`}
          onClose={() => setPreview(null)}
          footer={(
            <Button tone={isEquipped(social.loadout, preview) ? 'default' : 'success'} icon="check" onClick={() => toggle(preview)} disabled={busyId === preview.id}>
              {isEquipped(social.loadout, preview) ? t('inventory.unequip') : t('inventory.equip')}
            </Button>
          )}
        >
          <div className="mb-3"><RarityLabel rarity={preview.rarity} /></div>
          <ItemPreview item={preview} loadout={social.loadout} nickname={auth.account.nickname} avatarPath={auth.account.avatarPath} />
        </Drawer>
      )}
    </PlatformShell>
  );
}
