// LeaderboardPage.jsx
// The season (calendar month) and all-time rankings, scored from finished
// matches on the server, and the season's leaderboard rewards.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import { apiFetch } from '../../lib/api';
import { itemName, useCatalog } from '../../lib/catalog';
import PlatformShell from '../platform/PlatformShell';
import {
  Button, Card, DashIcon, ErrorState, Segmented, Spinner,
} from '../ui/dash';
import { RarityLabel, StyledName, TitleTag, useLook } from '../../cosmetics/Cosmetics';
import UserAvatar from './UserAvatar';
import { ItemThumb } from '../shop/ItemPreview';

const MEDAL = ['🥇', '🥈', '🥉'];

function Row({ row, me, onOpen }) {
  const { t } = useTranslation();
  const look = useLook(row.player.cosmetics);
  return (
    <li className={`cv-row grid grid-cols-[2.5rem,minmax(0,1fr),4.5rem] items-center gap-3 px-4 py-2.5 sm:grid-cols-[3rem,minmax(0,1fr),5rem,4rem,4rem,4rem] 4xl:grid-cols-[4rem,minmax(0,1fr),7rem,6rem,6rem,6rem] 4xl:py-3.5 ${me ? 'bg-brass/[0.07]' : ''}`}>
      <span className="text-center text-[15px] font-bold text-zinc-400 tnum 4xl:text-[19px]">{MEDAL[row.rank - 1] || row.rank}</span>
      <button type="button" onClick={() => onOpen(row.player.id)} className="flex min-w-0 items-center gap-2.5 text-left">
        <UserAvatar user={row.player} look={look} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-zinc-100 4xl:text-[16px]">
            <StyledName nickname={row.player.nickname} look={look} />
            {me && <span className="ml-1.5 text-[11px] font-normal text-brass-light">{t('sidebar.you')}</span>}
          </span>
          {look.title && <TitleTag item={look.title} size="xs" />}
        </span>
      </button>
      <span className="text-right text-[14px] font-semibold text-brass-light tnum 4xl:text-[17px]">{row.points}</span>
      <span className="hidden text-right text-[13px] text-zinc-300 tnum sm:block 4xl:text-[15px]">{row.wins}</span>
      <span className="hidden text-right text-[13px] text-zinc-300 tnum sm:block 4xl:text-[15px]">{row.podiums}</span>
      <span className="hidden text-right text-[13px] text-zinc-400 tnum sm:block 4xl:text-[15px]">{row.matches}</span>
    </li>
  );
}

export default function LeaderboardPage({ auth }) {
  const { t, language } = useTranslation();
  const social = useSocial();
  const catalog = useCatalog();
  const [scope, setScope] = useState('season');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [claim, setClaim] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    apiFetch(`/api/economy/leaderboard?scope=${scope}`, { token: auth.token }).then(setData).catch(setError);
  }, [scope, auth.token]);
  useEffect(() => { load(); }, [load]);

  const rewards = (catalog?.items || []).filter((i) => i.source === 'leaderboard').sort((a, b) => a.requirement.top - b.requirement.top);

  const claimRewards = async () => {
    setClaim({ busy: true });
    try {
      const res = await apiFetch('/api/economy/leaderboard/claim', { method: 'POST', token: auth.token });
      setClaim({ result: res });
      social.refreshEconomy();
    } catch (err) {
      setClaim({ error: err.message });
    }
  };

  return (
    <PlatformShell auth={auth} active="leaderboard">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),320px] 3xl:grid-cols-[minmax(0,1fr),380px] 4xl:grid-cols-[minmax(0,1fr),520px] 4xl:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50 4xl:text-[30px]">{t('leaderboard.title')}</h1>
              <p className="text-[12.5px] text-zinc-400 4xl:text-[15px]">{scope === 'season' && data ? t('leaderboard.seasonOf', { season: data.season.id }) : t('leaderboard.allTimeHint')}</p>
            </div>
            <Segmented value={scope} onChange={setScope} options={[{ value: 'season', label: t('leaderboard.season') }, { value: 'all', label: t('leaderboard.allTime') }]} />
          </div>
          <Card bodyClass="p-0">
            <div className="hidden grid-cols-[3rem,minmax(0,1fr),5rem,4rem,4rem,4rem] gap-3 border-b border-white/[0.06] px-4 py-2 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500 sm:grid 4xl:grid-cols-[4rem,minmax(0,1fr),7rem,6rem,6rem,6rem] 4xl:text-[12px]">
              <span className="text-center">#</span>
              <span>{t('leaderboard.player')}</span>
              <span className="text-right">{t('leaderboard.points')}</span>
              <span className="text-right">{t('stats.wins')}</span>
              <span className="text-right">{t('leaderboard.podiums')}</span>
              <span className="text-right">{t('leaderboard.games')}</span>
            </div>
            {error && <div className="p-4"><ErrorState error={error} onRetry={load} retryLabel={t('common.retry')} /></div>}
            {!data && !error && <Spinner block />}
            {data && data.rows.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <DashIcon name="trophy" className="h-8 w-8 text-zinc-600" />
                <p className="text-[13px] text-zinc-400">{t('leaderboard.empty')}</p>
              </div>
            )}
            {data && (
              <ul className="divide-y divide-white/[0.04]">
                {data.rows.map((row) => <Row key={row.accountId} row={row} me={row.accountId === social.myId} onOpen={social.openProfile} />)}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card title={t('leaderboard.you')}>
            {!auth.isLoggedIn ? <p className="text-[12.5px] text-zinc-500">{t('leaderboard.loginToRank')}</p> : data?.me ? (
              <div className="flex items-center gap-3">
                <span className="text-[30px] font-bold text-brass-light tnum 4xl:text-[40px]">#{data.me.rank}</span>
                <div className="text-[12.5px] text-zinc-400 4xl:text-[14.5px]">
                  <p>{t('leaderboard.pointsN', { n: data.me.points })}</p>
                  <p>{t('leaderboard.gamesN', { n: data.me.matches })} · {t('leaderboard.winsN', { n: data.me.wins })}</p>
                </div>
              </div>
            ) : <p className="text-[12.5px] text-zinc-500">{t('leaderboard.unranked')}</p>}
            <p className="mt-3 text-[11.5px] leading-snug text-zinc-500 4xl:text-[13px]">{t('leaderboard.scoring')}</p>
          </Card>
          <Card title={t('leaderboard.rewards')} subtitle={t('leaderboard.rewardsHint', { n: data?.minMatches ?? 5 })}>
            <ul className="flex flex-col gap-2">
              {rewards.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                  <span className="cos-static flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/25"><ItemThumb item={item} nickname="A" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-zinc-100 4xl:text-[15px]">{itemName(item, language)}</span>
                    <span className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                      {t('leaderboard.topN', { n: item.requirement.top })}
                      <RarityLabel rarity={item.rarity} />
                    </span>
                  </span>
                  {social.ownedIds.has(item.id) && <DashIcon name="check" className="h-4 w-4 text-emerald-400" />}
                </li>
              ))}
            </ul>
            {auth.isLoggedIn && scope === 'season' && (
              <div className="mt-3">
                <Button tone="primary" icon="gift" className="w-full" disabled={claim?.busy} onClick={claimRewards}>{t('leaderboard.claim')}</Button>
                {claim?.error && <p className="mt-2 text-[12px] text-red-300">{claim.error}</p>}
                {claim?.result && (
                  <p className="mt-2 text-[12px] text-emerald-300">
                    {claim.result.granted.length ? t('leaderboard.claimed', { n: claim.result.granted.length }) : t('leaderboard.nothingNew', { rank: claim.result.rank })}
                  </p>
                )}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </PlatformShell>
  );
}
