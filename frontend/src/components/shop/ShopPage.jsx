// ShopPage.jsx
// The cosmetics shop: categories, search, sorting, rarity / price /
// ownership / favourite filters, a live preview of the selected item on
// the player's own look, and a confirmed purchase. The server checks the
// price, the balance and ownership again on every purchase.

import { useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import { RARITY_META, itemName, useCatalog } from '../../lib/catalog';
import { navigate } from '../../lib/router';
import PlatformShell from '../platform/PlatformShell';
import {
  Button, Card, DashIcon, Dialog, Drawer, Segmented, Spinner,
} from '../ui/dash';
import { RarityLabel } from '../../cosmetics/Cosmetics';
import { CrownCoin } from '../social/SocialBar';
import ItemPreview, { ItemThumb } from './ItemPreview';

const SORTS = ['featured', 'priceAsc', 'priceDesc', 'rarity', 'newest', 'name'];

export function isEquipped(loadout, item) {
  const value = loadout?.[item.slot];
  return Array.isArray(value) ? value.includes(item.id) : value === item.id;
}

export function requirementText(item, t) {
  const r = item.requirement || {};
  switch (item.source) {
    case 'starter': return t('shop.earn.starter');
    case 'achievement': return t('shop.earn.achievement', { name: t(`achievement.${r.achievement}.title`) });
    case 'streak': return t('shop.earn.streak', { n: r.streak });
    case 'event': return t('shop.earn.event');
    case 'season': return t('shop.earn.season', { season: t(`season.${r.season}`), n: r.matches });
    case 'leaderboard': return t('shop.earn.leaderboard', { n: r.top });
    default: return '';
  }
}

function Price({ value, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-brass-light tnum ${className}`}>
      <CrownCoin className="h-4 w-4 4xl:h-5 4xl:w-5" />
      {value.toLocaleString()}
    </span>
  );
}

function ItemCard({
  item, owned, equipped, favorite, selected, onSelect, onFavorite, canFavorite, nickname,
}) {
  const { t, language } = useTranslation();
  const meta = RARITY_META[item.rarity];
  return (
    <article
      className={`cv-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-[#121418] transition-all hover:-translate-y-0.5 ${selected ? 'ring-2 ring-brass-light/70' : ''}`}
      style={{ borderColor: `${meta.color}${selected ? '99' : '38'}`, boxShadow: selected ? `0 12px 30px -16px ${meta.glow}` : undefined }}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item.id); } }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      {item.rarity === 'mythic' && <span className="cos-gradient-anim cos-anim absolute inset-x-0 top-0 h-0.5" style={{ backgroundImage: meta.gradient }} />}
      <div className="cos-static relative flex h-28 items-center justify-center overflow-hidden px-2 4xl:h-36" style={{ background: `radial-gradient(circle at 50% 45%, ${meta.soft}, transparent 72%)` }}>
        <ItemThumb item={item} nickname={nickname} />
        {(owned || equipped) && (
          <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide 4xl:text-[11.5px] ${equipped ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-zinc-300'}`}>
            {equipped ? t('shop.equipped') : t('shop.owned')}
          </span>
        )}
        {canFavorite && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFavorite(item.id); }}
            aria-pressed={favorite}
            aria-label={favorite ? t('shop.unfavorite') : t('shop.favorite')}
            className={`absolute right-1.5 top-1.5 rounded-lg p-1.5 transition-colors ${favorite ? 'text-rose-400' : 'text-zinc-600 opacity-0 hover:text-zinc-300 group-hover:opacity-100 focus:opacity-100'}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z" /></svg>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-white/[0.05] p-3 4xl:p-4">
        <p className="truncate text-[13px] font-semibold text-zinc-100 4xl:text-[15.5px]" title={itemName(item, language)}>{itemName(item, language)}</p>
        <div className="flex items-center justify-between gap-2">
          <RarityLabel rarity={item.rarity} />
          <span className="truncate text-[10.5px] text-zinc-500 4xl:text-[12px]">{t(`slot.${item.slot}`)}</span>
        </div>
        <div className="mt-auto pt-1">
          {owned ? (
            <span className={`text-[12px] font-semibold 4xl:text-[14px] ${equipped ? 'text-emerald-300' : 'text-zinc-400'}`}>{equipped ? t('shop.equipped') : t('shop.owned')}</span>
          ) : item.price ? (
            <Price value={item.price} className="text-[13.5px] 4xl:text-[16px]" />
          ) : (
            <span className="line-clamp-2 text-[11.5px] leading-snug text-violet-300 4xl:text-[13px]">🏅 {requirementText(item, t)}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function DetailPanel({
  item, social, onBuy, nickname, avatarPath,
}) {
  const { t, language } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!item) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-zinc-500">
        <DashIcon name="eye" className="h-8 w-8" />
        <p className="text-[13px] 4xl:text-[15px]">{t('shop.pickToPreview')}</p>
      </div>
    );
  }
  const owned = social.ownedIds.has(item.id);
  const equipped = isEquipped(social.loadout, item);
  const toggleEquip = async () => {
    setBusy(true);
    setError(null);
    try {
      if (equipped) await social.unequip(item.id);
      else await social.equip(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-[18px] font-semibold leading-tight text-zinc-50 4xl:text-[23px]">{itemName(item, language)}</h2>
          <RarityLabel rarity={item.rarity} />
        </div>
        <p className="mt-1 text-[12px] text-zinc-500 4xl:text-[14px]">{t(`category.${item.category}`)} · {t(`slot.${item.slot}`)}</p>
      </div>
      <ItemPreview item={item} loadout={social.loadout} nickname={nickname} avatarPath={avatarPath} />
      <p className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-[12px] leading-snug text-zinc-400 4xl:text-[13.5px]">
        <DashIcon name="shield" className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />
        {t('shop.cosmeticOnly')}
      </p>
      {error && <p className="text-[12.5px] text-red-300">{error}</p>}
      {!social.enabled ? (
        <Button tone="primary" icon="lock" onClick={() => window.dispatchEvent(new CustomEvent('landmark:auth', { detail: 'login' }))}>{t('shop.loginToBuy')}</Button>
      ) : owned ? (
        <div className="flex flex-wrap gap-2">
          <Button tone={equipped ? 'default' : 'success'} icon={equipped ? 'close' : 'check'} disabled={busy} onClick={toggleEquip} className="flex-1">
            {equipped ? t('inventory.unequip') : t('inventory.equip')}
          </Button>
          <Button icon="box" onClick={() => navigate('/inventory')}>{t('nav.inventory')}</Button>
        </div>
      ) : item.forSale === false && item.source === 'shop' ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[12.5px] text-zinc-400">{t('shop.notOnSale')}</p>
      ) : item.price ? (
        <Button tone="primary" icon="bag" onClick={() => onBuy(item)} className="py-2.5 text-[14px] 4xl:text-[16px]">
          {t('shop.buyFor', { price: item.price.toLocaleString() })}
        </Button>
      ) : (
        <p className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2.5 text-[12.5px] text-violet-200">🏅 {requirementText(item, t)}</p>
      )}
    </div>
  );
}

function PurchaseDialog({
  item, social, onClose, nickname,
}) {
  const { t, language } = useTranslation();
  const [state, setState] = useState('confirm');
  const [error, setError] = useState(null);
  const balance = social.wallet?.balance ?? 0;
  const after = balance - item.price;

  const buy = async () => {
    setState('busy');
    setError(null);
    try {
      await social.buy(item.id);
      setState('done');
    } catch (err) {
      setError(err.message);
      setState('confirm');
    }
  };
  const equipNow = async () => {
    try {
      await social.equip(item.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Dialog
      title={state === 'done' ? t('shop.purchased') : t('shop.confirmTitle')}
      onClose={onClose}
      footer={state === 'done' ? (
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button tone="success" icon="check" onClick={equipNow}>{t('shop.equipNow')}</Button>
        </>
      ) : (
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button tone="primary" icon="bag" disabled={after < 0 || state === 'busy'} onClick={buy}>
            {state === 'busy' ? t('common.loading') : t('shop.confirmBuy')}
          </Button>
        </>
      )}
    >
      <div className="flex items-center gap-3">
        <span className="cos-static flex h-20 w-24 shrink-0 items-center justify-center rounded-xl" style={{ background: `radial-gradient(circle, ${RARITY_META[item.rarity].soft}, transparent 75%)` }}>
          <ItemThumb item={item} nickname={nickname} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-zinc-100">{itemName(item, language)}</p>
          <RarityLabel rarity={item.rarity} className="mt-1" />
        </div>
      </div>
      {state === 'done' ? (
        <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-emerald-200">{t('shop.addedToInventory')}</p>
      ) : (
        <dl className="mt-4 space-y-1.5">
          <div className="flex justify-between"><dt className="text-zinc-500">{t('shop.price')}</dt><dd><Price value={item.price} /></dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">{t('shop.balance')}</dt><dd className="tnum text-zinc-200">{balance.toLocaleString()}</dd></div>
          <div className="flex justify-between border-t border-white/[0.06] pt-1.5"><dt className="text-zinc-500">{t('shop.after')}</dt><dd className={`tnum font-semibold ${after < 0 ? 'text-red-300' : 'text-zinc-100'}`}>{after.toLocaleString()}</dd></div>
        </dl>
      )}
      {after < 0 && state !== 'done' && <p className="mt-3 text-[12.5px] text-red-300">{t('shop.notEnough', { n: (-after).toLocaleString() })}</p>}
      {error && <p className="mt-3 text-[12.5px] text-red-300">{error}</p>}
    </Dialog>
  );
}

function EarnCard({ catalog }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rules = catalog?.rules;
  if (!rules) return null;
  return (
    <Card>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <DashIcon name="sparkles" className="h-4 w-4 text-brass-light" />
        <span className="flex-1 text-[13px] font-semibold text-zinc-100 4xl:text-[15px]">{t('shop.howToEarn')}</span>
        <DashIcon name={open ? 'close' : 'plus'} className="h-4 w-4 text-zinc-500" />
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5 text-[12px] leading-snug text-zinc-400 4xl:text-[13.5px]">
          <li>🥇 {t('shop.rule.places', { first: rules.match.place[1], second: rules.match.place[2], third: rules.match.place[3] })}</li>
          <li>🤝 {t('shop.rule.team', { n: rules.match.teamWin })}</li>
          <li>🎲 {t('shop.rule.participation', { n: rules.match.participation })}</li>
          <li>☀️ {t('shop.rule.firstWin', { n: rules.match.firstWinOfDay })}</li>
          <li>🔥 {t('shop.rule.streaks', { list: rules.streaks.map((s) => `${s.streak}→${s.crowns}`).join(', ') })}</li>
          <li>🏆 {t('shop.rule.achievements')}</li>
          <li>🎪 {t('shop.rule.festival')}</li>
          <li className="text-zinc-500">⚖️ {t('shop.rule.fair', { minutes: rules.minMatchMinutes, cap: rules.dailyRewardedMatches })}</li>
        </ul>
      )}
    </Card>
  );
}

export default function ShopPage({ auth }) {
  const { t, language } = useTranslation();
  const social = useSocial();
  const catalog = useCatalog();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [rarities, setRarities] = useState([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [ownership, setOwnership] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [drawer, setDrawer] = useState(false);

  const nickname = auth.account?.nickname || t('preview.samplePlayer');
  const favorites = useMemo(() => new Set(social.favorites), [social.favorites]);

  const counts = useMemo(() => {
    const out = { all: catalog?.items.length || 0 };
    (catalog?.items || []).forEach((i) => { out[i.category] = (out[i.category] || 0) + 1; });
    return out;
  }, [catalog]);

  const items = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const rank = (i) => catalog.rarities.indexOf(i.rarity);
    const min = minPrice === '' ? null : Number(minPrice);
    const max = maxPrice === '' ? null : Number(maxPrice);
    const list = catalog.items.filter((i) => {
      // Items the Creator took off sale stay visible only to their owners.
      if ((i.enabled === false || i.retired) && !social.ownedIds.has(i.id)) return false;
      if (category !== 'all' && i.category !== category) return false;
      if (rarities.length && !rarities.includes(i.rarity)) return false;
      if ((min != null || max != null) && !i.price) return false;
      if (min != null && i.price < min) return false;
      if (max != null && i.price > max) return false;
      const owned = social.ownedIds.has(i.id);
      if (ownership === 'owned' && !owned) return false;
      if (ownership === 'notOwned' && owned) return false;
      if (favoritesOnly && !favorites.has(i.id)) return false;
      if (q && !`${i.name.en} ${i.name.ru} ${t(`slot.${i.slot}`)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const priceOf = (i, dir) => (i.price == null ? (dir > 0 ? Infinity : -Infinity) : i.price);
    const sorters = {
      featured: (a, b) => catalog.categories.indexOf(a.category) - catalog.categories.indexOf(b.category) || rank(a) - rank(b) || (a.price || 0) - (b.price || 0),
      priceAsc: (a, b) => priceOf(a, 1) - priceOf(b, 1),
      priceDesc: (a, b) => priceOf(b, -1) - priceOf(a, -1),
      rarity: (a, b) => rank(b) - rank(a) || (b.price || 0) - (a.price || 0),
      newest: (a, b) => b.order - a.order,
      name: (a, b) => itemName(a, language).localeCompare(itemName(b, language)),
    };
    return list.sort(sorters[sort]);
  }, [catalog, query, category, rarities, minPrice, maxPrice, ownership, favoritesOnly, favorites, sort, social.ownedIds, language, t]);

  const selected = selectedId && catalog ? catalog.byId.get(selectedId) : null;
  const select = (id) => {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 1279px)').matches) setDrawer(true);
  };
  const filtersActive = rarities.length || minPrice !== '' || maxPrice !== '' || ownership !== 'all' || favoritesOnly || query;
  const events = social.wallet?.events || [];

  return (
    <PlatformShell auth={auth} active="shop">
      <div className="flex flex-col gap-4 4xl:gap-6">
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-brass/20 bg-gradient-to-br from-[#211a0d] via-[#131418] to-[#121418] p-4 4xl:p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brass/15 4xl:h-16 4xl:w-16"><CrownCoin className="h-8 w-8 4xl:h-10 4xl:w-10" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50 4xl:text-[30px]">{t('shop.title')}</h1>
            <p className="text-[12.5px] text-zinc-400 4xl:text-[15px]">{t('shop.subtitle')}</p>
          </div>
          {social.enabled ? (
            <div className="flex flex-wrap items-center gap-3">
              {events.length > 0 && (
                <span className="rounded-xl border border-pink-400/30 bg-pink-500/10 px-3 py-2 text-[12px] font-semibold text-pink-200 4xl:text-[14px]">🎪 {t('shop.festivalActive')}</span>
              )}
              {social.wallet?.winStreak > 1 && (
                <span className="rounded-xl border border-orange-400/25 bg-orange-500/10 px-3 py-2 text-[12px] font-semibold text-orange-200 4xl:text-[14px]">🔥 {t('profile.streak', { n: social.wallet.winStreak })}</span>
              )}
              <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2 text-right">
                <p className="text-[10.5px] uppercase tracking-wider text-zinc-500 4xl:text-[12px]">{t('wallet.balance')}</p>
                <Price value={social.wallet?.balance ?? 0} className="text-[22px] 4xl:text-[28px]" />
              </div>
            </div>
          ) : (
            <Button tone="primary" onClick={() => window.dispatchEvent(new CustomEvent('landmark:auth', { detail: 'register' }))}>{t('shop.registerToEarn')}</Button>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-[230px,minmax(0,1fr),340px] 3xl:grid-cols-[250px,minmax(0,1fr),400px] 4xl:grid-cols-[300px,minmax(0,1fr),540px] 4xl:gap-6">
          {/* Filters ------------------------------------------------------ */}
          <aside className="flex flex-col gap-3">
            <Card bodyClass="p-2">
              <ul className="flex gap-1 overflow-x-auto scrollbar-thin xl:flex-col">
                {['all', ...(catalog?.categories || [])].map((c) => (
                  <li key={c} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors 4xl:py-2.5 4xl:text-[15px] ${category === c ? 'bg-white/[0.09] text-zinc-50' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'}`}
                    >
                      <span className="flex-1 whitespace-nowrap">{t(`category.${c}`)}</span>
                      <span className="text-[11px] text-zinc-500 tnum">{counts[c] || 0}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={t('shop.filters')} action={filtersActive ? <button type="button" className="text-[11.5px] text-zinc-400 hover:text-zinc-100" onClick={() => { setRarities([]); setMinPrice(''); setMaxPrice(''); setOwnership('all'); setFavoritesOnly(false); setQuery(''); }}>{t('shop.reset')}</button> : null}>
              <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">{t('shop.rarity')}</p>
              <div className="flex flex-wrap gap-1">
                {(catalog?.rarities || []).map((r) => {
                  const on = rarities.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRarities((l) => (on ? l.filter((x) => x !== r) : [...l, r]))}
                      className="rounded-md px-2 py-1 text-[11px] font-semibold transition-colors 4xl:text-[13px]"
                      style={{ color: RARITY_META[r].color, backgroundColor: on ? RARITY_META[r].soft : 'transparent', boxShadow: `inset 0 0 0 1px ${RARITY_META[r].color}${on ? '80' : '30'}` }}
                    >
                      {t(`rarity.${r}`)}
                    </button>
                  );
                })}
              </div>
              <p className="mb-1.5 mt-3 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">{t('shop.priceRange')}</p>
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder={t('shop.min')} className="field py-1.5 text-[12.5px]" aria-label={t('shop.min')} />
                <span className="text-zinc-600">–</span>
                <input type="number" min="0" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder={t('shop.max')} className="field py-1.5 text-[12.5px]" aria-label={t('shop.max')} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {[[0, 150], [150, 800], [800, 3600], [3600, '']].map(([lo, hi]) => (
                  <button key={`${lo}-${hi}`} type="button" onClick={() => { setMinPrice(String(lo)); setMaxPrice(String(hi)); }} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 tnum">
                    {hi === '' ? `${lo}+` : `${lo}–${hi}`}
                  </button>
                ))}
              </div>
              {social.enabled && (
                <>
                  <p className="mb-1.5 mt-3 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">{t('shop.ownership')}</p>
                  <Segmented value={ownership} onChange={setOwnership} options={['all', 'owned', 'notOwned'].map((v) => ({ value: v, label: t(`shop.own.${v}`) }))} />
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-zinc-300 4xl:text-[14px]">
                    <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} className="accent-brass" />
                    {t('shop.favoritesOnly')}
                    <span className="ml-auto text-[11px] text-zinc-500 tnum">{favorites.size}</span>
                  </label>
                </>
              )}
            </Card>
            <EarnCard catalog={catalog} />
          </aside>

          {/* Items -------------------------------------------------------- */}
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <DashIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('shop.search')} className="field pl-8 text-[13px] 4xl:py-2.5 4xl:text-[15px]" />
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-zinc-500 4xl:text-[14px]">
                <DashIcon name="sort" className="h-4 w-4" />
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="field w-auto py-2 pr-7 text-[12.5px] 4xl:text-[14px]" aria-label={t('shop.sort')}>
                  {SORTS.map((s) => <option key={s} value={s} className="bg-[#16181d]">{t(`shop.sort.${s}`)}</option>)}
                </select>
              </label>
              <span className="text-[12px] text-zinc-500 tnum 4xl:text-[14px]">{t('shop.count', { n: items.length })}</span>
            </div>
            {!catalog ? <Spinner block /> : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#121418] py-16 text-center">
                <DashIcon name="search" className="h-8 w-8 text-zinc-600" />
                <p className="text-[13px] text-zinc-400">{t('shop.nothingFound')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 4xl:gap-4 5xl:grid-cols-8">
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    nickname={nickname}
                    owned={social.ownedIds.has(item.id)}
                    equipped={isEquipped(social.loadout, item)}
                    favorite={favorites.has(item.id)}
                    canFavorite={social.enabled}
                    selected={item.id === selectedId}
                    onSelect={select}
                    onFavorite={social.toggleFavorite}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Preview ------------------------------------------------------ */}
          <aside className="hidden xl:block">
            <div className="sticky top-20">
              <Card title={t('shop.preview')}>
                <DetailPanel item={selected} social={social} onBuy={setPurchase} nickname={nickname} avatarPath={auth.account?.avatarPath} />
              </Card>
            </div>
          </aside>
        </div>
      </div>

      {drawer && selected && (
        <Drawer title={itemName(selected, language)} subtitle={t(`category.${selected.category}`)} onClose={() => setDrawer(false)}>
          <DetailPanel item={selected} social={social} onBuy={setPurchase} nickname={nickname} avatarPath={auth.account?.avatarPath} />
        </Drawer>
      )}
      {purchase && <PurchaseDialog item={purchase} social={social} onClose={() => setPurchase(null)} nickname={nickname} />}
    </PlatformShell>
  );
}
