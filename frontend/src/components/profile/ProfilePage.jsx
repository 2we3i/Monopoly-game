// ProfilePage.jsx
// A registered player's own page: who they are and how they look, their
// crowns and ranks, how they play, what they have won and own, and what
// they have played recently. Every number comes from the server's match
// history and ledger (GET /api/auth/me/stats); nothing is counted here.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  apiFetch, formatDate, formatDuration, percent,
} from '../../lib/api';
import { navigate } from '../../lib/router';
import { itemName, useCatalog } from '../../lib/catalog';
import { useCitadelsConfig } from '../../hooks/useCitadels';
import { useSocial } from '../../social/SocialContext';
import { useLook } from '../../cosmetics/Cosmetics';
import PlatformShell, { LoginRequired } from '../platform/PlatformShell';
import {
  Badge, Button, Card, CopyButton, DashIcon, ErrorState, GAME_COLORS, ProgressBar, Spinner, StatCard, Table,
} from '../ui/dash';
import CitadelsStatsCard from '../ui/CitadelsStats';
import {
  citadelsRoleName, gameName, modeName, resultTone,
} from '../ui/labels';
import { ProfileHero, WinsTable } from '../social/PublicProfilePage';
import { CrownCoin } from '../social/SocialBar';
import { ItemThumb } from '../shop/ItemPreview';

const GAMES = ['monopoly', 'mafia', 'citadels'];
const ACHIEVEMENT_ICON = {
  FIRST_GAME: 'gamepad',
  FIRST_WIN: 'trophy',
  HOST: 'flag',
  VETERAN: 'shield',
  CHAMPION: 'star',
  ALL_GAMES: 'grid',
  CITADEL_LORD: 'castle',
  MASTER_BUILDER: 'castle',
};
const EQUIPPED_ORDER = ['title', 'badge', 'name_style', 'name_decor', 'name_intro', 'avatar_frame', 'token_shape', 'token_frame', 'token_aura', 'token_trail', 'token_victory', 'profile_bg', 'profile_card', 'effect_win', 'effect_podium', 'effect_loss', 'effect_reward', 'effect_rankup', 'effect_join', 'emote', 'sound_start', 'sound_win', 'sound_reward', 'sound_event'];

function resultLabel(t, row) {
  if (row.result) return t(`result.${row.result}`);
  return t(`result.${row.status}`);
}

export default function ProfilePage({ auth }) {
  const { t, language } = useTranslation();
  const config = useCitadelsConfig();
  const catalog = useCatalog();
  const social = useSocial();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const look = useLook(social.economyLoaded ? social.loadout : data?.economy?.loadout);

  const load = useCallback(() => {
    setError(null);
    apiFetch('/api/auth/me/stats', { token: auth.token }).then(setData).catch(setError);
  }, [auth.token]);

  useEffect(() => {
    if (auth.token) load();
  }, [auth.token, load]);

  if (!auth.isLoggedIn) {
    return <PlatformShell auth={auth} active="profile"><LoginRequired text={t('profile.loginRequired')} /></PlatformShell>;
  }
  if (error) return <PlatformShell auth={auth} active="profile"><ErrorState error={error} onRetry={load} retryLabel={t('common.retry')} /></PlatformShell>;
  if (!data) return <PlatformShell auth={auth} active="profile"><Spinner block /></PlatformShell>;

  const {
    account, stats, citadels, achievements, ranks, recentWins,
  } = data;
  const wallet = social.wallet || data.economy.wallet;
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const loadout = social.economyLoaded ? social.loadout : data.economy.loadout;
  const equipped = catalog ? EQUIPPED_ORDER.flatMap((slot) => {
    const v = loadout[slot];
    return (Array.isArray(v) ? v : v ? [v] : []).map((id) => catalog.byId.get(id)).filter(Boolean);
  }) : [];
  const recentItems = catalog ? (social.economyLoaded ? social.inventory.slice(0, 8) : data.economy.recentInventory)
    .map((e) => ({ ...e, item: catalog.byId.get(e.itemId) })).filter((e) => e.item) : [];
  const inventoryCount = social.economyLoaded ? social.inventory.length : data.economy.inventoryCount;
  const ledger = social.economyLoaded && social.ledger.length ? social.ledger.slice(0, 10) : data.economy.ledger;

  const roleOf = (row) => {
    if (!row.role) return row.gameType === 'monopoly' && row.score != null ? t('profile.money', { n: row.score }) : '—';
    if (row.gameType === 'citadels') return citadelsRoleName(config, row.role, language);
    return t(`mafia.role.${row.role}`);
  };

  return (
    <PlatformShell auth={auth} active="profile">
      <div className="flex flex-col gap-5 4xl:gap-7">
        <ProfileHero
          player={{ ...account, online: true }}
          loadout={loadout}
          look={look}
          subtitle={(
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {t('profile.memberSince', { date: formatDate(account.createdAt, language, false) })}
              <span className="flex items-center gap-1 text-[11.5px] text-zinc-500">
                ID <span className="font-mono text-zinc-400">{account.id}</span>
                <CopyButton text={account.id} label={t('common.copy')} copiedLabel={t('common.copied')} />
              </span>
            </span>
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-brass/25 bg-black/30 px-3.5 py-2">
              <p className="text-[10.5px] uppercase tracking-wider text-zinc-500 4xl:text-[12px]">{t('wallet.balance')}</p>
              <p className="flex items-center gap-1.5 text-[22px] font-bold leading-tight text-brass-light tnum 4xl:text-[30px]">
                <CrownCoin className="h-5 w-5 4xl:h-7 4xl:w-7" />
                {wallet.balance.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2">
              <p className="text-[18px] font-semibold leading-none text-zinc-50 tnum 4xl:text-[24px]">{unlocked}/{achievements.length}</p>
              <p className="text-[11px] text-zinc-500 4xl:text-[12.5px]">{t('profile.achievements')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button tone="primary" icon="bag" onClick={() => navigate('/shop')}>{t('nav.shop')}</Button>
              <Button icon="palette" onClick={() => navigate('/inventory')}>{t('profile.customize')}</Button>
            </div>
          </div>
        </ProfileHero>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 4xl:gap-4">
          <StatCard label={t('stats.played')} value={stats.played} icon="gamepad" hint={t('stats.finishedHint', { finished: stats.finished, unfinished: stats.unfinished })} />
          <StatCard label={t('stats.wins')} value={stats.wins} icon="trophy" accent="#34d399" />
          <StatCard label={t('stats.losses')} value={stats.losses} icon="flag" accent="#f87171" />
          <StatCard label={t('stats.winRate')} value={percent(stats.winRate)} icon="chart" accent="#60a5fa" />
          <StatCard label={t('stats.timePlayed')} value={formatDuration(stats.timeMs, t)} icon="clock" accent="#a78bfa" />
          <StatCard label={t('stats.created')} value={stats.created} icon="castle" />
          <StatCard label={t('wallet.earned')} value={wallet.earned.toLocaleString()} icon="coin" hint={t('wallet.spentHint', { n: wallet.spent.toLocaleString() })} />
          <StatCard label={t('leaderboard.season')} value={ranks.season ? `#${ranks.season.rank}` : '—'} icon="arrowUp" accent="#fbbf24" hint={ranks.season ? t('leaderboard.pointsN', { n: ranks.season.points }) : t('leaderboard.unranked')} />
          <StatCard label={t('leaderboard.allTime')} value={ranks.all ? `#${ranks.all.rank}` : '—'} icon="trophy" accent="#f0d79a" hint={ranks.all ? t('leaderboard.pointsN', { n: ranks.all.points }) : t('leaderboard.unranked')} />
          <StatCard label={t('profile.currentStreak')} value={wallet.winStreak} icon="flame" accent="#fb923c" hint={t('profile.bestStreakHint', { n: wallet.bestStreak })} />
          <StatCard label={t('profile.items')} value={inventoryCount} icon="box" accent="#c084fc" hint={catalog ? t('profile.itemsHint', { total: catalog.items.length }) : ''} />
          <StatCard label={t('profile.equipped')} value={equipped.length} icon="palette" accent="#f472b6" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr] 4xl:gap-6">
          <Card title={t('profile.victories')} subtitle={t('profile.victoriesHint')} bodyClass="p-0">
            <WinsTable rows={recentWins} />
          </Card>
          <Card
            title={t('profile.equippedTitle')}
            action={<Button tone="subtle" icon="palette" onClick={() => navigate('/inventory')}>{t('profile.customize')}</Button>}
          >
            {equipped.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-[12.5px] text-zinc-500">{t('inventory.nothingEquipped')}</p>
                <Button tone="primary" icon="bag" onClick={() => navigate('/shop')}>{t('nav.shop')}</Button>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 3xl:grid-cols-4">
                {equipped.map((item) => (
                  <li key={`${item.slot}-${item.id}`} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5" title={itemName(item, language)}>
                    <span className="cos-static flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/25 4xl:h-12 4xl:w-14">
                      <ItemThumb item={item} nickname={account.nickname.slice(0, 5)} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-medium text-zinc-200 4xl:text-[13.5px]">{itemName(item, language)}</span>
                      <span className="block truncate text-[10.5px] text-zinc-500 4xl:text-[12px]">{t(`slot.${item.slot}`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr] 4xl:gap-6">
          <Card title={t('profile.byGame')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.id}
              empty=""
              rows={GAMES.map((id) => ({
                id, played: 0, wins: 0, losses: 0, finished: 0, timeMs: 0, ...(stats.byGame[id] || {}),
              }))}
              columns={[
                {
                  key: 'id',
                  label: t('stats.game'),
                  render: (r) => (
                    <span className="flex items-center gap-2 text-zinc-100">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAME_COLORS[r.id] }} />
                      {gameName(t, r.id)}
                    </span>
                  ),
                },
                { key: 'played', label: t('stats.played'), align: 'right' },
                { key: 'wins', label: t('stats.wins'), align: 'right' },
                { key: 'losses', label: t('stats.losses'), align: 'right' },
                { key: 'rate', label: t('stats.winRate'), align: 'right', render: (r) => percent(r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0) },
                { key: 'time', label: t('stats.timePlayed'), align: 'right', render: (r) => formatDuration(r.timeMs, t) },
              ]}
            />
          </Card>
          <Card title={t('profile.favourite')}>
            {stats.favouriteMode ? (
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${GAME_COLORS[stats.favouriteMode.gameType]}22`, color: GAME_COLORS[stats.favouriteMode.gameType] }}>
                  <DashIcon name="star" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[16px] font-semibold text-zinc-100">{gameName(t, stats.favouriteMode.gameType)}</p>
                  <p className="text-[12px] text-zinc-500">{modeName(t, stats.favouriteMode.modeId)} · {t('profile.timesPlayed', { n: stats.favouriteMode.count })}</p>
                </div>
              </div>
            ) : <p className="py-4 text-center text-[12.5px] text-zinc-500">{t('profile.favouriteNone')}</p>}
            <div className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex justify-between"><span className="text-zinc-500">{t('stats.finished')}</span><span className="text-zinc-200 tnum">{stats.finished}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">{t('stats.unfinished')}</span><span className="text-zinc-200 tnum">{stats.unfinished}</span></div>
            </div>
          </Card>
        </div>

        <CitadelsStatsCard stats={citadels} config={config} title={t('citadels.stats.myTitle')} subtitle={t('citadels.stats.mySubtitle')} />

        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr] 4xl:gap-6">
          <Card title={t('profile.recent')} bodyClass="p-0">
            <Table
              rowKey={(r) => r.matchId}
              empty={t('profile.recentEmpty')}
              rows={stats.recent}
              columns={[
                {
                  key: 'game',
                  label: t('stats.game'),
                  render: (r) => (
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GAME_COLORS[r.gameType] }} />
                      <span className="text-zinc-100">{gameName(t, r.gameType)}</span>
                      <span className="text-zinc-500">{modeName(t, r.modeId)}</span>
                    </span>
                  ),
                },
                { key: 'date', label: t('stats.date'), render: (r) => formatDate(r.startedAt, language) },
                { key: 'players', label: t('stats.players'), align: 'right', render: (r) => r.playerCount },
                { key: 'role', label: t('stats.details'), render: roleOf },
                { key: 'result', label: t('stats.result'), render: (r) => <Badge tone={resultTone(r.result, r.status)}>{resultLabel(t, r)}</Badge> },
              ]}
            />
          </Card>

          <Card title={t('profile.achievements')} subtitle={t('profile.achievementsHint')}>
            <ul className="flex flex-col gap-3">
              {achievements.map((a) => (
                <li key={a.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${a.unlocked ? 'border-brass/30 bg-brass/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.unlocked ? 'bg-brass/20 text-brass-light' : 'bg-white/[0.05] text-zinc-600'}`}>
                    <DashIcon name={ACHIEVEMENT_ICON[a.id] || 'star'} className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate text-[13px] font-semibold 4xl:text-[15px] ${a.unlocked ? 'text-zinc-100' : 'text-zinc-400'}`}>{t(`achievement.${a.id}.title`)}</p>
                      {a.unlocked && <Badge tone="amber">{t('achievement.unlocked')}</Badge>}
                      {catalog?.rules?.achievements?.[a.id] ? (
                        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brass-light/80 tnum"><CrownCoin className="h-3 w-3" />{catalog.rules.achievements[a.id]}</span>
                      ) : null}
                    </div>
                    <p className="text-[11.5px] text-zinc-500 4xl:text-[13px]">{t(`achievement.${a.id}.desc`, { target: a.target })}</p>
                    {!a.unlocked && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1"><ProgressBar value={a.current} max={a.target} /></div>
                        <span className="text-[10.5px] text-zinc-500 tnum">{a.current}/{a.target}</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 4xl:gap-6">
          <Card title={t('profile.crownHistory')} bodyClass="p-0">
            <ul className="divide-y divide-white/[0.04]">
              {ledger.length === 0 && <li className="py-8 text-center text-[12.5px] text-zinc-500">{t('profile.crownHistoryEmpty')}</li>}
              {ledger.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px] 4xl:text-[14.5px]">
                  <span className="min-w-0 flex-1 truncate text-zinc-300">
                    {t(`ledger.${entry.kind}`)}
                    {entry.details?.gameType && <span className="text-zinc-500"> · {gameName(t, entry.details.gameType)}</span>}
                    {entry.kind === 'purchase' && catalog?.byId.get(entry.ref) && <span className="text-zinc-500"> · {itemName(catalog.byId.get(entry.ref), language)}</span>}
                    {entry.kind === 'achievement' && <span className="text-zinc-500"> · {t(`achievement.${entry.ref}.title`)}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-500">{formatDate(entry.createdAt, language)}</span>
                  <span className={`w-16 shrink-0 text-right font-semibold tnum ${entry.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card
            title={t('profile.recentItems')}
            subtitle={t('profile.itemsHint', { total: catalog?.items.length || 0 })}
            action={<Button tone="subtle" icon="box" onClick={() => navigate('/inventory')}>{t('nav.inventory')}</Button>}
          >
            {recentItems.length === 0 ? <p className="py-6 text-center text-[12.5px] text-zinc-500">{t('inventory.empty')}</p> : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {recentItems.map(({ item, acquiredAt }) => (
                  <li key={item.id} className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-center" title={itemName(item, language)}>
                    <span className="cos-static flex h-12 w-full items-center justify-center overflow-hidden"><ItemThumb item={item} nickname={account.nickname.slice(0, 5)} /></span>
                    <span className="w-full truncate text-[11px] text-zinc-300 4xl:text-[13px]">{itemName(item, language)}</span>
                    <span className="text-[10px] text-zinc-500">{formatDate(acquiredAt, language, false)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </PlatformShell>
  );
}
