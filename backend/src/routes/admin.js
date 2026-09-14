// admin.js
// The admin panel's API. Every route sits behind requireAdmin, which
// re-reads the account on each request: a token alone is never enough,
// and an account that loses admin status (or is blocked) loses access on
// its very next call. Hiding the panel in the client is a convenience;
// this middleware is the actual lock.

const express = require('express');
const accountsDb = require('../db/accounts');
const platformDb = require('../db/platform');
const access = require('../platform/access');
const presence = require('../platform/presence');
const registry = require('../platform/registry');
const modes = require('../platform/modes');
const bans = require('../platform/bans');

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const row = access.accountFromToken(token);
  if (!row) return res.status(401).json({ error: 'Not logged in.' });
  if (accountsDb.isBlocked(row) || !accountsDb.isAdmin(row)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  req.admin = row;
  next();
}
router.use(requireAdmin);

function audit(req, action, target, details) {
  platformDb.audit({
    adminId: req.admin.id, adminName: req.admin.nickname, action, target, details,
  });
}

function withAge(room) {
  return { ...room, ageMs: Math.max(0, Date.now() - (room.createdAt || Date.now())) };
}

router.get('/me', (req, res) => {
  res.json({ admin: accountsDb.toPublicAccount(req.admin) });
});

// --- overview ------------------------------------------------------------

router.get('/overview', (req, res) => {
  const now = Date.now();
  const accounts = accountsDb.listAll();
  const onlineIds = presence.onlineAccountIds();
  const rooms = registry.listRooms();
  const totals = platformDb.platformTotals();

  // Online = every registered account with an open connection, plus every
  // connected guest seated in a room (a guest has no identity otherwise).
  const seatedOnline = new Set();
  let guestsInRooms = 0;
  rooms.forEach((room) => room.players.forEach((p) => {
    if (!p.connected) return;
    if (p.accountId) seatedOnline.add(`a:${p.accountId}`);
    else {
      guestsInRooms += 1;
      seatedOnline.add(`g:${room.code}:${p.id}`);
    }
  }));
  onlineIds.forEach((id) => seatedOnline.add(`a:${id}`));

  const catalog = modes.catalog();
  const labelOf = (modeId) => catalog.find((m) => m.id === modeId)?.label || null;

  res.json({
    generatedAt: now,
    users: {
      total: accounts.length,
      active: accounts.filter((a) => onlineIds.has(a.id) || (a.last_seen_at || a.last_login_at || 0) >= now - 7 * DAY).length,
      blocked: accounts.filter((a) => a.status === 'blocked').length,
      online: onlineIds.size,
      newThisWeek: accounts.filter((a) => a.created_at >= now - 7 * DAY).length,
    },
    guests: {
      inRooms: guestsInRooms,
      distinctAllTime: totals.distinctGuests,
      seatsAllTime: totals.guestSeats,
    },
    games: {
      total: totals.matchesTotal,
      active: rooms.filter((r) => r.stage === 'active').length,
      finished: totals.matchesFinished,
      aborted: totals.matchesAborted,
      today: totals.matchesToday,
      week: totals.matchesWeek,
      month: totals.matchesMonth,
      avgPlayers: totals.avgPlayers,
      avgDurationMs: totals.avgDurationMs,
    },
    lobbies: {
      total: totals.roomsCreated,
      active: rooms.filter((r) => r.stage === 'lobby').length,
      live: rooms.length,
    },
    playersOnline: seatedOnline.size,
    perDay: platformDb.matchesPerDay(30),
    popularity: platformDb.modePopularity().map((m) => ({ ...m, label: labelOf(m.modeId) })),
    citadels: platformDb.citadelsStats(null),
    recentMatches: platformDb.recentMatches(10),
    audit: platformDb.recentAudit(12),
  });
});

// --- lobbies -------------------------------------------------------------

router.get('/lobbies', (req, res) => {
  const rooms = registry.listRooms().map(withAge).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ lobbies: rooms });
});

router.get('/lobbies/:code', (req, res) => {
  const found = registry.find(req.params.code);
  if (!found) return res.status(404).json({ error: 'Lobby not found.' });
  res.json({ lobby: withAge(found.adapter.summary(found.room)) });
});

router.post('/lobbies/:code/close', (req, res) => {
  const found = registry.find(req.params.code);
  if (!found) return res.status(404).json({ error: 'Lobby not found.' });
  const summary = found.adapter.summary(found.room);
  found.adapter.close(found.code, 'closed_by_admin');
  audit(req, 'LOBBY_CLOSED', found.code, {
    gameType: summary.gameType, stage: summary.stage, players: summary.players.length,
  });
  res.json({ ok: true });
});

router.post('/lobbies/:code/kick', (req, res) => {
  const found = registry.find(req.params.code);
  if (!found) return res.status(404).json({ error: 'Lobby not found.' });
  const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId : null;
  const player = playerId && found.adapter.summary(found.room).players.find((p) => p.id === playerId);
  if (!player) return res.status(404).json({ error: 'Player not found in this lobby.' });
  bans.ban(found.code, playerId);
  found.adapter.kick(found.code, playerId, 'kicked_by_admin');
  audit(req, 'PLAYER_KICKED', found.code, { playerId, nickname: player.nickname });
  res.json({ ok: true });
});

// --- users ---------------------------------------------------------------

function userRow(row, stats, onlineIds) {
  const s = stats[row.id] || {};
  return {
    ...accountsDb.toAdminAccount(row),
    online: onlineIds.has(row.id),
    created: s.created || 0,
    played: s.played || 0,
    wins: s.wins || 0,
    losses: s.losses || 0,
    winRate: s.winRate || 0,
    finished: s.finished || 0,
    unfinished: s.unfinished || 0,
    timeMs: s.timeMs || 0,
    favouriteMode: s.favouriteMode || null,
  };
}

router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || 'all');
  const activity = String(req.query.activity || 'all');
  const now = Date.now();
  const onlineIds = presence.onlineAccountIds();
  const stats = platformDb.allAccountStats();

  const users = accountsDb.listAll()
    .map((row) => userRow(row, stats, onlineIds))
    .filter((u) => !q || u.nickname.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    .filter((u) => status === 'all' || u.status === status)
    .filter((u) => {
      const seen = u.lastSeenAt || u.lastLoginAt || 0;
      if (activity === 'online') return u.online;
      if (activity === 'week') return u.online || seen >= now - 7 * DAY;
      if (activity === 'inactive') return !u.online && seen < now - 30 * DAY;
      if (activity === 'never') return u.played === 0;
      return true;
    });
  res.json({ users, total: users.length });
});

router.get('/users/:id', (req, res) => {
  const row = accountsDb.findById(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  res.json({
    user: {
      ...accountsDb.toAdminAccount(row),
      online: presence.onlineAccountIds().has(row.id),
    },
    stats: platformDb.accountStats(row.id),
    citadels: platformDb.citadelsStats(row.id),
    rooms: registry.roomsWithAccount(row.id).map(withAge),
  });
});

router.post('/users/:id/block', (req, res) => {
  const row = accountsDb.findById(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  if (row.id === req.admin.id || accountsDb.isAdmin(row)) {
    return res.status(400).json({ error: 'The administrator account cannot be blocked.' });
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) {
    return res.status(400).json({ error: 'Give a reason between 3 and 300 characters.' });
  }
  accountsDb.blockAccount(row.id, { reason, adminId: req.admin.id, adminName: req.admin.nickname });

  const removed = [];
  if (req.body?.removeFromRooms) {
    registry.roomsWithAccount(row.id).forEach((room) => {
      const found = registry.find(room.code);
      if (found && found.adapter.kick(room.code, row.id, 'blocked')) removed.push(room.code);
    });
  }
  const disconnected = presence.disconnectAccount(row.id, reason);
  audit(req, 'USER_BLOCKED', row.id, {
    nickname: row.nickname, reason, removedFrom: removed, disconnected,
  });
  res.json({ ok: true, user: accountsDb.toAdminAccount(accountsDb.findById(row.id)), removedFrom: removed });
});

router.post('/users/:id/unblock', (req, res) => {
  const row = accountsDb.findById(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  accountsDb.unblockAccount(row.id);
  audit(req, 'USER_UNBLOCKED', row.id, { nickname: row.nickname });
  res.json({ ok: true, user: accountsDb.toAdminAccount(accountsDb.findById(row.id)) });
});

// --- game modes ----------------------------------------------------------

router.get('/modes', (req, res) => {
  const popularity = platformDb.modePopularity();
  const players = platformDb.modePlayerCounts();
  const rooms = registry.listRooms();
  res.json({
    modes: modes.listWithStatus().map((m) => {
      const pop = popularity.find((p) => p.modeId === m.id) || {};
      return {
        ...m,
        matches: pop.matches || 0,
        finished: pop.finished || 0,
        avgPlayers: pop.avgPlayers || 0,
        avgDurationMs: pop.avgDurationMs || 0,
        players: players.find((p) => p.modeId === m.id)?.players || 0,
        liveRooms: rooms.filter((r) => r.modeId === m.id).length,
        livePlayers: rooms.filter((r) => r.modeId === m.id).reduce((n, r) => n + r.players.length, 0),
      };
    }),
    citadels: platformDb.citadelsStats(null),
  });
});

router.put('/modes/:id', (req, res) => {
  try {
    const status = String(req.body?.status || '');
    const result = modes.setStatus(req.params.id, status, {
      pauseMinutes: req.body?.pauseMinutes, updatedBy: req.admin.nickname,
    });
    audit(req, 'MODE_STATUS', req.params.id, { status, pauseMinutes: req.body?.pauseMinutes || null });
    res.json({ ok: true, mode: { id: req.params.id, ...result } });
  } catch (err) {
    if (err instanceof access.AccessError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

module.exports = router;
