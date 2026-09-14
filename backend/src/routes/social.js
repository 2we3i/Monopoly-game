// social.js
// REST surface of the social layer: finding players, public profiles,
// private and group conversations, and the notification centre.
// Real-time delivery of the same data goes over the messenger socket
// (see platform/presence.js); these routes are what a screen loads.

const express = require('express');
const accounts = require('../db/accounts');
const platformDb = require('../db/platform');
const community = require('../db/community');
const sessionToken = require('../auth/sessionToken');
const presence = require('../platform/presence');
const economy = require('../economy/service');
const messages = require('../social/messages');
const { syncUnread } = require('../social/notify');
const { achievementsFor } = require('../economy/achievements');

const router = express.Router();

router.use((req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const accountId = token ? sessionToken.verify(token) : null;
  req.accountRow = accountId ? accounts.findById(accountId) : null;
  req.accountId = req.accountRow ? req.accountRow.id : null;
  next();
});

function requireAuth(req, res, next) {
  if (!req.accountRow) return res.status(401).json({ error: 'Log in to use messages.', code: 'AUTH_REQUIRED' });
  if (accounts.isBlocked(req.accountRow)) return res.status(403).json({ error: 'This account is blocked.', code: 'BLOCKED' });
  next();
}

function handle(fn) {
  return (req, res) => {
    try {
      res.json(fn(req, res));
    } catch (err) {
      if (err instanceof messages.SocialError) return res.status(err.status).json({ error: err.message, code: err.code });
      // eslint-disable-next-line no-console
      console.error('Social request failed:', err);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };
}

const idList = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice(0, 25) : []);

// --- people -------------------------------------------------------------------

router.get('/summary', requireAuth, handle((req) => ({
  unreadNotifications: community.unreadNotificationCount(req.accountId),
  unreadMessages: community.unreadMessageTotal(req.accountId),
  wallet: economy.walletView(req.accountId),
  loadout: economy.loadout(req.accountId),
})));

router.get('/users', requireAuth, handle((req) => ({ users: messages.searchUsers(req.query.q, req.accountId) })));

// A player's public profile. Anyone may look - a guest clicking a
// mention in a room included - but it contains nothing private: no
// block reason, no inventory beyond what is equipped, no message data.
router.get('/users/:id', handle((req, res) => {
  const row = accounts.findById(String(req.params.id));
  if (!row) {
    res.status(404);
    return { error: 'Player not found.', code: 'NOT_FOUND' };
  }
  const stats = platformDb.accountStats(row.id);
  const citadels = platformDb.citadelsStats(row.id);
  const wallet = community.wallet(row.id);
  const ranks = economy.ranksFor(row.id);
  return {
    player: {
      id: row.id,
      nickname: row.nickname,
      avatarPath: row.avatar_path || null,
      createdAt: row.created_at,
      online: presence.isOnline(row.id),
      blocked: accounts.isBlocked(row),
      role: accounts.isAdmin(row) ? 'admin' : 'user',
    },
    loadout: economy.cosmeticIds(row.id) || {},
    stats: {
      played: stats.played, wins: stats.wins, losses: stats.losses, winRate: stats.winRate, timeMs: stats.timeMs, byGame: stats.byGame,
    },
    achievements: achievementsFor(stats, citadels),
    streak: { current: wallet.winStreak, best: wallet.bestStreak },
    ranks: {
      season: ranks.season ? { rank: ranks.season.rank, points: ranks.season.points } : null,
      all: ranks.all ? { rank: ranks.all.rank, points: ranks.all.points } : null,
    },
    recentWins: platformDb.recentWins(row.id, 8),
  };
}));

// --- conversations ------------------------------------------------------------

router.get('/conversations', requireAuth, handle((req) => ({
  conversations: messages.listConversations(req.accountId),
  unreadMessages: community.unreadMessageTotal(req.accountId),
})));

router.post('/conversations', requireAuth, handle((req) => ({
  conversation: messages.openConversation(req.accountId, idList(req.body?.recipientIds)),
})));

router.get('/conversations/:id/messages', requireAuth, handle((req) => messages.messages(req.accountId, req.params.id, { before: req.query.before })));

router.post('/conversations/:id/messages', requireAuth, handle((req) => messages.send(req.accountId, req.params.id, req.body?.body)));

router.post('/conversations/:id/read', requireAuth, handle((req) => messages.markRead(req.accountId, req.params.id, req.body?.upTo)));

router.post('/group', requireAuth, handle((req) => messages.sendToGroup(req.accountId, idList(req.body?.recipientIds), req.body?.body)));

// --- notifications ------------------------------------------------------------

router.get('/notifications', requireAuth, handle((req) => ({
  notifications: community.listNotifications(req.accountId, {
    before: Number(req.query.before) > 0 ? Number(req.query.before) : undefined,
    limit: 30,
  }),
  unread: community.unreadNotificationCount(req.accountId),
})));

router.post('/notifications/read-all', requireAuth, handle((req) => {
  community.markAllNotificationsRead(req.accountId);
  syncUnread(req.accountId);
  return { unread: 0 };
}));

router.post('/notifications/:id/read', requireAuth, handle((req) => {
  community.markNotificationRead(req.accountId, Number(req.params.id));
  syncUnread(req.accountId);
  return { unread: community.unreadNotificationCount(req.accountId) };
}));

router.delete('/notifications', requireAuth, handle((req) => {
  community.clearNotifications(req.accountId);
  syncUnread(req.accountId);
  return { unread: 0 };
}));

module.exports = router;
