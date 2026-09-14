// notify.js
// The single way anything on the server tells a player that something
// happened to them: a message, a mention, a reward, a win, a purchase.
// The notification is stored (so it is waiting after a reload or on
// another device) and pushed to every open messenger connection of the
// account.

const community = require('../db/community');
const presence = require('../platform/presence');

const TYPES = new Set([
  'direct_message',
  'group_message',
  'mention',
  'reward',
  'win',
  'podium',
  'streak',
  'achievement',
  'purchase',
  'item_granted',
  'rank_up',
  'game_event',
]);

function notify(accountId, type, payload = {}, { groupKey = null } = {}) {
  if (!accountId || !TYPES.has(type)) return null;
  const notification = community.addNotification({
    accountId, type, groupKey, payload,
  });
  presence.emitToAccount(accountId, 'notification:new', {
    notification,
    unread: community.unreadNotificationCount(accountId),
  });
  return notification;
}

function syncUnread(accountId) {
  presence.emitToAccount(accountId, 'notification:sync', { unread: community.unreadNotificationCount(accountId) });
}

module.exports = { notify, syncUnread, TYPES };
