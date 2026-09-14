// ProfilePeek.jsx
// A quick look at a player - opened from a mention, a chat name or a
// leaderboard row - with the ways onward: the full profile and a private
// message.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import { apiFetch, percent } from '../../lib/api';
import { navigate } from '../../lib/router';
import {
  BadgeStrip, StyledName, TitleTag, useLook,
} from '../../cosmetics/Cosmetics';
import { Button, Dialog, Spinner } from '../ui/dash';
import UserAvatar from './UserAvatar';

function PeekBody({ data, onClose }) {
  const { t } = useTranslation();
  const social = useSocial();
  const look = useLook(data.loadout);
  const { player, stats, ranks } = data;
  const isMe = social.myId === player.id;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <UserAvatar user={{ ...player, cosmetics: data.loadout }} look={look} size="lg" online={player.online} />
        <div className="min-w-0 flex-1">
          <p className="text-[19px] font-semibold text-zinc-50 4xl:text-[22px]">
            <StyledName nickname={player.nickname} look={look} intro />
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {look.title && <TitleTag item={look.title} />}
            <BadgeStrip items={look.badges} size="sm" />
            <span className={`text-[11.5px] ${player.online ? 'text-emerald-300' : 'text-zinc-500'}`}>{player.online ? t('social.online') : t('social.offline')}</span>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          [t('stats.played'), stats.played],
          [t('stats.wins'), stats.wins],
          [t('stats.winRate'), percent(stats.winRate)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/[0.07] bg-black/20 px-2 py-2">
            <dd className="text-[18px] font-semibold text-zinc-50 tnum 4xl:text-[21px]">{value}</dd>
            <dt className="text-[10.5px] text-zinc-500 4xl:text-[12px]">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-[12.5px] text-zinc-400">
        {ranks.season ? t('leaderboard.seasonRank', { rank: ranks.season.rank }) : t('leaderboard.unranked')}
        {data.streak.current > 1 && ` · 🔥 ${t('profile.streak', { n: data.streak.current })}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button icon="user" onClick={() => { onClose(); navigate(isMe ? '/profile' : `/u/${player.id}`); }}>
          {isMe ? t('profile.open') : t('social.openProfile')}
        </Button>
        {social.enabled && !isMe && !player.blocked && (
          <Button tone="primary" icon="mail" onClick={() => { onClose(); social.openMessenger({ recipientIds: [player.id] }); }}>
            {t('social.message')}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ProfilePeek() {
  const { t } = useTranslation();
  const social = useSocial();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const id = social.peekId;

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    setData(null);
    setError(null);
    apiFetch(`/api/social/users/${encodeURIComponent(id)}`).then((d) => { if (alive) setData(d); }).catch((err) => { if (alive) setError(err); });
    return () => { alive = false; };
  }, [id]);

  if (!id) return null;
  return (
    <Dialog title={t('social.playerCard')} onClose={social.closeProfile} width="max-w-md 4xl:max-w-lg">
      {error && <p className="py-6 text-center text-red-300">{error.message}</p>}
      {!error && !data && <Spinner block />}
      {data && <PeekBody data={data} onClose={social.closeProfile} />}
    </Dialog>
  );
}
