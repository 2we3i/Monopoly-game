// notificationText.js
// How each notification type reads, which icon it wears, and what
// clicking it does.

import { itemName } from '../../lib/catalog';
import { navigate } from '../../lib/router';
import { gameName } from '../ui/labels';

export const NOTIFICATION_ICON = {
  direct_message: 'mail',
  group_message: 'users',
  mention: 'at',
  reward: 'coin',
  win: 'trophy',
  podium: 'medal',
  streak: 'flame',
  achievement: 'star',
  purchase: 'bag',
  item_granted: 'gift',
  rank_up: 'arrowUp',
  game_event: 'flag',
  balance_adjusted: 'coin',
};

export const NOTIFICATION_TONE = {
  direct_message: '#60a5fa',
  group_message: '#a78bfa',
  mention: '#e3bb5c',
  reward: '#e3bb5c',
  win: '#34d399',
  podium: '#fbbf24',
  streak: '#fb923c',
  achievement: '#f0d79a',
  purchase: '#f472b6',
  item_granted: '#c084fc',
  rank_up: '#34d399',
  game_event: '#94a3b8',
  balance_adjusted: '#e3bb5c',
};

export function describeNotification(n, { t, language, catalog }) {
  const p = n.payload || {};
  const from = p.from?.nickname || '?';
  const game = p.gameType ? gameName(t, p.gameType) : '';
  const item = p.itemId && catalog ? catalog.byId.get(p.itemId) : null;
  switch (n.type) {
    case 'direct_message':
      return { title: from, body: n.count > 1 ? `${t('notif.dm.count', { n: n.count })} · ${p.excerpt}` : p.excerpt };
    case 'group_message':
      return { title: t('notif.group.title', { name: from }), body: n.count > 1 ? `${t('notif.dm.count', { n: n.count })} · ${p.excerpt}` : p.excerpt };
    case 'mention': {
      const where = p.context?.kind === 'room' ? t('notif.mention.inRoom', { game: gameName(t, p.context.gameType) }) : t('notif.mention.inMessages');
      const times = n.count > 1 ? ` · ${t('notif.mention.times', { n: n.count })}` : '';
      return { title: `${t('notif.mention.title', { name: from })}${times}`, body: `${where}: ${p.excerpt}` };
    }
    case 'reward':
      return { title: t('notif.reward.title', { amount: p.amount }), body: t('notif.reward.body', { game }) };
    case 'win':
      return { title: t('notif.win.title'), body: t('notif.win.body', { game }) };
    case 'podium':
      return { title: t('notif.podium.title', { place: t(`place.${p.place}`) }), body: t('notif.win.body', { game }) };
    case 'streak':
      return { title: t('notif.streak.title', { n: p.streak }), body: t('notif.streak.body', { crowns: p.crowns }) };
    case 'achievement':
      return { title: t('notif.achievement.title'), body: `${t(`achievement.${p.achievement}.title`)}${p.crowns ? ` · +${p.crowns} ${t('wallet.crownsShort')}` : ''}` };
    case 'purchase':
      return { title: t('notif.purchase.title'), body: `${itemName(item, language) || p.itemId} · ${p.price} ${t('wallet.crownsShort')}` };
    case 'item_granted':
      return { title: t('notif.item.title'), body: `${itemName(item, language) || p.itemId} · ${t(`notif.item.reason.${p.reason}`)}` };
    case 'balance_adjusted':
      return {
        title: t('notif.balance.title', { sign: p.delta > 0 ? '+' : '−', amount: Math.abs(p.delta || 0).toLocaleString() }),
        body: t('notif.balance.body', { balance: (p.balance ?? 0).toLocaleString(), reason: p.reason || '' }),
      };
    case 'rank_up':
      return { title: t('notif.rank.title', { rank: p.to }), body: t('notif.rank.body') };
    default:
      return { title: t('notif.generic'), body: '' };
  }
}

export function runNotificationAction(n, social) {
  const p = n.payload || {};
  switch (n.type) {
    case 'direct_message':
    case 'group_message':
      social.openMessenger({ conversationId: p.conversationId });
      break;
    case 'mention':
      if (p.context?.kind === 'conversation') social.openMessenger({ conversationId: p.context.conversationId });
      else if (p.from?.id) social.openProfile(p.from.id);
      break;
    case 'purchase':
    case 'item_granted':
      navigate('/inventory');
      break;
    case 'rank_up':
      navigate('/leaderboard');
      break;
    default:
      navigate('/profile');
  }
}
