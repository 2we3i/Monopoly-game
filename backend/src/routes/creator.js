// creator.js
// The Creator's API, mounted on the admin router (routes/admin.js), so the
// same lock applies: the account is re-read on every request, and each
// route below also names the permission it needs - administrators get a
// 403 from every one of them.
//
// Dangerous operations must carry `confirm: true` (the panel asks first,
// twice for critical ones); without it the server answers 428. Every change
// is written to the Creator's journal with who, when, what, the old value,
// the new value and the reason.

const path = require('path');
const multer = require('multer');
const accountsDb = require('../db/accounts');
const platformDb = require('../db/platform');
const community = require('../db/community');
const creatorDb = require('../db/creator');
const presence = require('../platform/presence');
const registry = require('../platform/registry');
const modes = require('../platform/modes');
const permissions = require('../platform/permissions');
const modeConfig = require('../platform/modeConfig');
const testing = require('../platform/testing');
const simulator = require('../platform/simulator');
const settings = require('../platform/settings');
const boards = require('../platform/boards');
const media = require('../platform/media');
const errorLog = require('../platform/errorLog');
const { AccessError } = require('../platform/access');
const economy = require('../economy/service');
const shopAdmin = require('../economy/shopAdmin');
const catalog = require('../economy/catalog');
const memeAdmin = require('../memehype/memeAdmin');
const layouts = require('../game/boardLayouts');

const DAY = 24 * 60 * 60 * 1000;
// Balance changes at least this large ask for a second confirmation.
const LARGE_BALANCE_CHANGE = 10000;

const upload = multer({
  storage: multer.diskStorage({
    destination: media.MEDIA_DIR,
    filename: (req, file, cb) => cb(null, media.newFileName(file.mimetype)),
  }),
  limits: { fileSize: media.MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!media.TYPES[file.mimetype]) {
      cb(new AccessError('A picture must be PNG, JPEG, WEBP or GIF.', 'BAD_MEDIA'));
      return;
    }
    cb(null, true);
  },
});

function withUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'The picture is larger than 8 MB.' : err.message;
    return res.status(400).json({ error: message, code: err.code || 'BAD_MEDIA' });
  });
}

module.exports = function mountCreatorRoutes(router, { need, audit }) {
  // Runs a handler and turns known errors into clean JSON answers.
  const handle = (fn) => (req, res) => {
    try {
      const out = fn(req, res);
      if (!res.headersSent) res.json(out === undefined ? { ok: true } : out);
    } catch (err) {
      if (err instanceof AccessError || err instanceof economy.EconomyError || err instanceof layouts.LayoutError) {
        return res.status(err.status && err.status >= 400 ? err.status : 400).json({ error: err.message, code: err.code || null });
      }
      errorLog.record({
        source: 'creator-api', message: err.message, stack: err.stack, context: { path: req.path, method: req.method },
      });
      // eslint-disable-next-line no-console
      console.warn('Creator request failed:', err);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };

  const requireConfirm = (req) => {
    if (req.body?.confirm !== true) {
      throw Object.assign(new AccessError('Please confirm this action.', 'CONFIRMATION_REQUIRED'), { status: 428 });
    }
  };

  const by = (req) => req.admin.nickname;
  const nicknameOf = (id) => accountsDb.findById(id)?.nickname || null;
  const record = (req, action, target, extra = {}) => audit(req, action, target, extra.details || null, extra);

  // --- access -------------------------------------------------------------------------

  router.get('/access', need('access.manage'), handle(() => ({
    roles: ['user', 'admin', 'creator'],
    permissions: permissions.PERMISSIONS,
    matrix: permissions.ROLE_PERMISSIONS,
    staff: accountsDb.listByRole().map((row) => ({ ...accountsDb.toAdminAccount(row), online: presence.isOnline(row.id) })),
    creatorDesignated: accountsDb.creatorDesignated(),
    envCreators: !!process.env.CREATOR_ACCOUNT_ID,
    envAdmins: !!process.env.ADMIN_ACCOUNT_ID,
  })));

  router.put('/users/:id/role', need('users.roles'), handle((req) => {
    requireConfirm(req);
    const row = accountsDb.findById(req.params.id);
    if (!row) throw new AccessError('User not found.', 'UNKNOWN_USER');
    const role = String(req.body?.role || '');
    if (!accountsDb.ROLES.includes(role)) throw new AccessError('Unknown role.', 'BAD_ROLE');
    if (row.id === req.admin.id && role !== 'creator') throw new AccessError('You cannot take the Creator role away from yourself.', 'SELF_DEMOTE');
    if (accountsDb.roleLockedByConfig(row)) throw new AccessError('This account\'s role is set by the server configuration (CREATOR_ACCOUNT_ID / ADMIN_ACCOUNT_ID).', 'ROLE_LOCKED');
    const before = accountsDb.roleOf(row);
    if (before === role) return { ok: true, role };
    // The acting Creator may be one only because nobody was appointed yet
    // (every administrator acts as the Creator then). The first role change
    // appoints them for real, so a new administrator is just that.
    if (!accountsDb.creatorDesignated()) {
      accountsDb.setRole(req.admin.id, 'creator', req.admin.id);
    }
    accountsDb.setRole(row.id, role, req.admin.id);
    const after = accountsDb.roleOf(accountsDb.findById(row.id));
    record(req, 'USER_ROLE_CHANGED', row.id, {
      targetType: 'user', targetLabel: row.nickname, oldValue: { role: before }, newValue: { role: after }, reason: req.body?.reason || null, critical: true, details: { nickname: row.nickname },
    });
    return { ok: true, role: after, user: accountsDb.toAdminAccount(accountsDb.findById(row.id)) };
  }));

  // --- users: crowns and items ----------------------------------------------------------

  router.get('/users/:id/economy', need('economy.view'), handle((req) => {
    const row = accountsDb.findById(req.params.id);
    if (!row) throw new AccessError('User not found.', 'UNKNOWN_USER');
    return economy.accountEconomyForCreator(row.id);
  }));

  function changeBalance(req, accountId, { mode, amount, reason }) {
    const row = accountsDb.findById(accountId);
    if (!row) throw new AccessError('User not found.', 'UNKNOWN_USER');
    const result = economy.adjustBalance({
      accountId, mode, amount: Number(amount), reason, by: req.admin.id, byName: req.admin.nickname,
    });
    record(req, 'BALANCE_CHANGED', accountId, {
      targetType: 'user',
      targetLabel: row.nickname,
      oldValue: { balance: result.before },
      newValue: { balance: result.after },
      reason,
      critical: true,
      details: { nickname: row.nickname, mode, requested: result.requested, delta: result.delta },
    });
    return result;
  }

  router.post('/users/:id/balance', need('economy.manage'), handle((req) => {
    requireConfirm(req);
    const { mode, amount, reason } = req.body || {};
    const current = community.wallet(req.params.id).balance;
    const target = mode === 'set' ? Number(amount) : mode === 'add' ? current + Number(amount) : current - Number(amount);
    if (Math.abs(target - current) >= LARGE_BALANCE_CHANGE && req.body?.confirmLarge !== true) {
      throw Object.assign(new AccessError('A large balance change needs a second confirmation.', 'CONFIRMATION_REQUIRED'), { status: 428 });
    }
    return changeBalance(req, req.params.id, { mode, amount, reason });
  }));

  router.post('/users/:id/items', need('items.grant'), handle((req) => {
    const row = accountsDb.findById(req.params.id);
    if (!row) throw new AccessError('User not found.', 'UNKNOWN_USER');
    const itemId = String(req.body?.itemId || '');
    const out = economy.grantItemByCreator(row.id, itemId, { by: req.admin.id, byName: req.admin.nickname, reason: req.body?.reason || null });
    record(req, 'ITEM_GRANTED', row.id, {
      targetType: 'user', targetLabel: row.nickname, newValue: { itemId }, reason: req.body?.reason || null, details: { nickname: row.nickname, itemId },
    });
    return out;
  }));

  router.delete('/users/:id/items/:itemId', need('items.grant'), handle((req) => {
    requireConfirm(req);
    const row = accountsDb.findById(req.params.id);
    if (!row) throw new AccessError('User not found.', 'UNKNOWN_USER');
    const out = economy.revokeItem(row.id, req.params.itemId);
    record(req, 'ITEM_REVOKED', row.id, {
      targetType: 'user', targetLabel: row.nickname, oldValue: { itemId: req.params.itemId }, reason: req.body?.reason || null, critical: true, details: { nickname: row.nickname, itemId: req.params.itemId },
    });
    return out;
  }));

  // --- economy ------------------------------------------------------------------------------

  router.get('/economy', need('economy.view'), handle(() => {
    const wallets = community.allWallets();
    const accounts = new Map(accountsDb.listAll().map((r) => [r.id, r]));
    return {
      totals: community.economyTotals(),
      wallets: wallets
        .filter((w) => accounts.has(w.accountId))
        .map((w) => ({ ...w, nickname: accounts.get(w.accountId).nickname, status: accounts.get(w.accountId).status || 'active' }))
        .sort((a, b) => b.balance - a.balance),
      adminOperations: community.ledgerSearch({ kind: 'admin', limit: 50 }).map((e) => ({ ...e, nickname: nicknameOf(e.accountId) })),
      settings: settings.get().economy,
    };
  }));

  router.get('/economy/ledger', need('economy.view'), handle((req) => ({
    entries: community.ledgerSearch({
      accountId: String(req.query.accountId || ''),
      kind: String(req.query.kind || ''),
      before: Number(req.query.before) || 0,
      limit: Number(req.query.limit) || 100,
    }).map((e) => ({ ...e, nickname: nicknameOf(e.accountId) })),
  })));

  router.post('/economy/bulk', need('economy.manage'), handle((req) => {
    requireConfirm(req);
    if (req.body?.confirmLarge !== true) {
      throw Object.assign(new AccessError('Changing several balances at once needs a second confirmation.', 'CONFIRMATION_REQUIRED'), { status: 428 });
    }
    const ids = Array.isArray(req.body?.accountIds) ? [...new Set(req.body.accountIds.map(String))].slice(0, 1000) : [];
    if (!ids.length) throw new AccessError('Choose at least one user.', 'NO_USERS');
    const results = ids.map((id) => {
      try {
        return { accountId: id, ok: true, ...changeBalance(req, id, req.body) };
      } catch (err) {
        return { accountId: id, ok: false, error: err.message };
      }
    });
    return { results, changed: results.filter((r) => r.ok).length };
  }));

  // --- shop ------------------------------------------------------------------------------------

  router.get('/shop', need('shop.manage'), handle(() => ({
    items: shopAdmin.listForCreator(),
    slots: catalog.SLOTS,
    rarities: catalog.RARITIES,
    categories: catalog.CATEGORIES,
    priceBands: catalog.PRICE_BANDS,
    sources: shopAdmin.SOURCES,
    boards: layouts.LAYOUT_OPTIONS,
    groups: layouts.GROUPS,
    shopOpen: settings.get().platform.shopOpen,
  })));

  router.post('/shop/items', need('shop.manage'), handle((req) => {
    const item = shopAdmin.create(req.body, by(req));
    record(req, 'SHOP_ITEM_CREATED', item.id, {
      targetType: 'item', targetLabel: item.name?.en, newValue: item,
    });
    return { item };
  }));

  router.put('/shop/items/:id', need('shop.manage'), handle((req) => {
    const { before, after } = shopAdmin.update(req.params.id, req.body, by(req));
    const priceChanged = before.price !== after.price;
    record(req, 'SHOP_ITEM_UPDATED', after.id, {
      targetType: 'item', targetLabel: after.name?.en, oldValue: before, newValue: after, critical: priceChanged || before.enabled !== after.enabled,
    });
    return { item: after };
  }));

  router.post('/shop/items/:id/reset', need('shop.manage'), handle((req) => {
    requireConfirm(req);
    const { before, after } = shopAdmin.reset(req.params.id);
    record(req, 'SHOP_ITEM_RESET', after.id, {
      targetType: 'item', targetLabel: after.name?.en, oldValue: before, newValue: after,
    });
    return { item: after };
  }));

  router.delete('/shop/items/:id', need('shop.manage'), handle((req) => {
    requireConfirm(req);
    const { before, result } = shopAdmin.remove(req.params.id, by(req));
    record(req, 'SHOP_ITEM_DELETED', req.params.id, {
      targetType: 'item', targetLabel: before.name?.en, oldValue: before, newValue: { result }, critical: true,
    });
    return { result };
  }));

  // --- game modes: config, tests, logs -----------------------------------------------------------

  const knownMode = (id) => {
    const mode = modes.catalog().find((m) => m.id === id);
    if (!mode) throw new AccessError('Unknown game mode.', 'UNKNOWN_MODE');
    return mode;
  };

  router.get('/modes/:id/config', need('modes.view'), handle((req) => {
    const mode = knownMode(req.params.id);
    const base = modeConfig.baseConfig(mode.id);
    return {
      mode,
      config: modeConfig.effective(mode.id),
      defaults: base,
      hardLimits: modeConfig.hardLimits(mode.gameId),
      settingPaths: modeConfig.leafPaths(base.defaults),
      cardTypes: modeConfig.CARD_TYPES,
      roleTiles: modeConfig.ROLE_TILES,
      history: modeConfig.history(mode.id),
      status: modes.statusOf(mode.id),
    };
  }));

  router.put('/modes/:id/config', need('modes.edit'), handle((req) => {
    requireConfirm(req);
    const mode = knownMode(req.params.id);
    const before = modeConfig.effective(mode.id);
    const after = modeConfig.save(mode.id, req.body?.config || {}, by(req), typeof req.body?.note === 'string' ? req.body.note.slice(0, 300) : null);
    record(req, 'MODE_CONFIG_SAVED', mode.id, {
      targetType: 'mode', targetLabel: mode.id, oldValue: before, newValue: after, reason: req.body?.note || null, critical: true, details: { version: after.version },
    });
    return { config: after };
  }));

  router.post('/modes/:id/config/restore', need('modes.edit'), handle((req) => {
    requireConfirm(req);
    const mode = knownMode(req.params.id);
    const before = modeConfig.effective(mode.id);
    const after = modeConfig.restoreVersion(mode.id, req.body?.version, by(req));
    record(req, 'MODE_CONFIG_RESTORED', mode.id, {
      targetType: 'mode', targetLabel: mode.id, oldValue: before, newValue: after, critical: true, details: { restored: req.body?.version, version: after.version },
    });
    return { config: after };
  }));

  router.post('/modes/:id/config/reset', need('modes.edit'), handle((req) => {
    requireConfirm(req);
    const mode = knownMode(req.params.id);
    const before = modeConfig.effective(mode.id);
    const after = modeConfig.reset(mode.id, by(req));
    record(req, 'MODE_CONFIG_RESET', mode.id, {
      targetType: 'mode', targetLabel: mode.id, oldValue: before, newValue: after, critical: true,
    });
    return { config: after };
  }));

  router.get('/modes/:id/logs', need('logs.view'), handle((req) => {
    const mode = knownMode(req.params.id);
    const matches = platformDb.recentMatches(200).filter((m) => m.modeId === mode.id).slice(0, 30);
    return {
      audit: platformDb.searchAudit({ target: mode.id, limit: 100 }),
      errors: creatorDb.listErrors({ gameType: mode.gameId, limit: 100 }),
      matches,
      tests: creatorDb.listTestRuns({ modeId: mode.id, limit: 20 }),
      rooms: registry.listRooms().filter((r) => r.modeId === mode.id),
    };
  }));

  router.post('/modes/:id/simulate', need('modes.test'), handle((req) => {
    const mode = knownMode(req.params.id);
    const params = {
      games: Math.max(1, Math.min(50, Number(req.body?.games) || 5)),
      players: req.body?.players ? Number(req.body.players) : null,
      draft: !!req.body?.config,
    };
    const runId = creatorDb.addTestRun({
      modeId: mode.id, kind: 'simulation', params, by: req.admin.id, byName: req.admin.nickname,
    });
    let result;
    try {
      result = simulator.run(mode.id, { ...params, config: req.body?.config || null });
    } catch (err) {
      creatorDb.finishTestRun(runId, 'failed', { error: err.message });
      throw new AccessError(err.message, 'SIMULATION_FAILED');
    }
    creatorDb.finishTestRun(runId, result.status, result);
    record(req, 'MODE_TESTED', mode.id, {
      targetType: 'mode', targetLabel: mode.id, newValue: { status: result.status, finished: result.finished, played: result.played, errors: result.errors }, details: { runId },
    });
    return { runId, result };
  }));

  router.post('/modes/:id/test-match', need('modes.test'), handle((req) => {
    const mode = knownMode(req.params.id);
    const armed = testing.arm(req.admin.id, mode.id);
    record(req, 'TEST_MATCH_ARMED', mode.id, { targetType: 'mode', targetLabel: mode.id, details: { expiresAt: armed.expiresAt } });
    return { armed };
  }));

  router.delete('/modes/:id/test-match', need('modes.test'), handle((req) => {
    testing.disarm(req.admin.id);
    return { ok: true };
  }));

  router.get('/testing', need('modes.test'), handle((req) => ({
    armed: testing.armedFor(req.admin.id),
    runs: creatorDb.listTestRuns({ limit: 50 }),
    testRooms: registry.listRooms().filter((r) => r.test),
    modes: modes.listWithStatus(),
  })));

  // --- live games ------------------------------------------------------------------------------

  const scrub = (value, depth = 0) => {
    if (value === null || typeof value !== 'object') return value;
    if (depth > 3) return Array.isArray(value) ? `[${value.length}]` : '{…}';
    if (Array.isArray(value)) return value.length > 40 ? `[${value.length} items]` : value.map((v) => scrub(v, depth + 1));
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      if (['socketId', 'guestKeyHash', 'token'].includes(k)) return;
      out[k] = scrub(v, depth + 1);
    });
    return out;
  };

  function roomDetail(found) {
    const summary = found.adapter.summary(found.room);
    const { room } = found;
    const source = room.state && Array.isArray(room.state.players) ? room.state : room;
    const log = Array.isArray(source.log) ? source.log : (Array.isArray(room.events) ? room.events : (Array.isArray(room.history) ? room.history : []));
    return {
      ...summary,
      test: testing.isTestRoom(summary.code),
      ageMs: Math.max(0, Date.now() - (summary.createdAt || Date.now())),
      rawPlayers: (source.players || []).map((p) => scrub(p)),
      log: log.slice(-150).map((e) => scrub(e)),
      settings: scrub(room.settings || source.rules || null),
      phaseEndsAt: room.phaseEndsAt || null,
      round: source.round || room.round || null,
    };
  }

  router.get('/games', need('games.view'), handle((req) => {
    const status = String(req.query.status || '');
    const gameType = String(req.query.gameType || '');
    const rooms = registry.listRooms()
      .map((r) => ({ ...r, ageMs: Math.max(0, Date.now() - (r.createdAt || Date.now())) }))
      .sort((a, b) => b.createdAt - a.createdAt);
    const matches = platformDb.recentMatches(Math.max(10, Math.min(300, Number(req.query.limit) || 100)))
      .filter((m) => (!status || m.status === status) && (!gameType || m.gameType === gameType));
    return {
      live: rooms,
      matches,
      totals: platformDb.platformTotals(),
    };
  }));

  router.get('/games/:code', need('games.view'), handle((req) => {
    const found = registry.find(req.params.code);
    if (!found) throw new AccessError('Game not found.', 'UNKNOWN_ROOM');
    return { game: roomDetail(found) };
  }));

  router.post('/games/:code/end', need('games.manage'), handle((req) => {
    requireConfirm(req);
    const found = registry.find(req.params.code);
    if (!found) throw new AccessError('Game not found.', 'UNKNOWN_ROOM');
    const summary = found.adapter.summary(found.room);
    found.adapter.close(found.code, 'closed_by_admin');
    record(req, 'GAME_ENDED', found.code, {
      targetType: 'game',
      targetLabel: `${summary.gameType} ${found.code}`,
      oldValue: { stage: summary.stage, phase: summary.phase, players: summary.players.map((p) => p.nickname) },
      newValue: { stage: 'closed' },
      reason: req.body?.reason || null,
      critical: true,
    });
    return { ok: true };
  }));

  // --- boards (maps) and squares (fields) --------------------------------------------------------

  router.get('/boards', need('maps.manage'), handle(() => ({
    boards: boards.list(),
    groups: layouts.GROUPS,
    edgeTypes: layouts.EDGE_TYPES,
    minSide: layouts.MIN_SIDE,
    maxSide: layouts.MAX_SIDE,
  })));

  router.get('/boards/:id', need('fields.manage'), handle((req) => ({ board: boards.get(req.params.id), groups: layouts.GROUPS, edgeTypes: layouts.EDGE_TYPES })));

  router.post('/boards', need('maps.manage'), handle((req) => {
    const board = boards.create(req.body || {}, by(req));
    record(req, 'BOARD_CREATED', board.id, { targetType: 'board', targetLabel: board.label?.en, newValue: board });
    return { board };
  }));

  router.put('/boards/:id', need('fields.manage'), handle((req) => {
    requireConfirm(req);
    const { before, after } = boards.save(req.params.id, req.body || {}, by(req));
    record(req, 'BOARD_SAVED', req.params.id, {
      targetType: 'board', targetLabel: after.label?.en, oldValue: before, newValue: after, critical: true,
    });
    return { board: boards.get(req.params.id) };
  }));

  router.post('/boards/:id/reset', need('maps.manage'), handle((req) => {
    requireConfirm(req);
    const { before, after } = boards.reset(req.params.id);
    record(req, 'BOARD_RESET', req.params.id, {
      targetType: 'board', targetLabel: after.label?.en, oldValue: before, newValue: after, critical: true,
    });
    return { board: boards.get(req.params.id) };
  }));

  router.delete('/boards/:id', need('maps.manage'), handle((req) => {
    requireConfirm(req);
    const before = boards.remove(req.params.id);
    record(req, 'BOARD_DELETED', req.params.id, {
      targetType: 'board', targetLabel: before.label?.en, oldValue: before, critical: true,
    });
    return { ok: true };
  }));

  router.put('/boards/:id/tiles/:tileId', need('fields.manage'), handle((req) => {
    const { before, after } = boards.saveTile(req.params.id, req.params.tileId, req.body?.tile || {}, by(req));
    record(req, 'FIELD_UPDATED', `${req.params.id}:${req.params.tileId}`, {
      targetType: 'field', targetLabel: `${req.params.id} · ${after.name}`, oldValue: before, newValue: after,
    });
    return { tile: after, board: boards.get(req.params.id) };
  }));

  router.post('/boards/:id/tiles/:tileId/reset', need('fields.manage'), handle((req) => {
    requireConfirm(req);
    const { before, after } = boards.resetTile(req.params.id, req.params.tileId, by(req));
    record(req, 'FIELD_RESET', `${req.params.id}:${req.params.tileId}`, {
      targetType: 'field', targetLabel: `${req.params.id} · ${after.name}`, oldValue: before, newValue: after,
    });
    return { tile: after, board: boards.get(req.params.id) };
  }));

  // --- memes ---------------------------------------------------------------------------------------

  router.get('/memes', need('memes.manage'), handle(() => memeAdmin.list()));

  router.post('/memes', need('memes.manage'), handle((req) => {
    const card = memeAdmin.create(req.body || {}, by(req));
    record(req, 'MEME_CREATED', card.id, { targetType: 'meme', targetLabel: card.top || card.text || card.id, newValue: card });
    return { card };
  }));

  router.put('/memes/packs/:packId', need('memes.manage'), handle((req) => {
    requireConfirm(req);
    const enabled = memeAdmin.setPackEnabled(req.params.packId, req.body?.enabled !== false, by(req));
    record(req, 'MEME_PACK_SWITCHED', req.params.packId, {
      targetType: 'meme-pack', targetLabel: req.params.packId, oldValue: { enabled: !enabled }, newValue: { enabled }, critical: !enabled,
    });
    return { enabled };
  }));

  router.put('/memes/:id', need('memes.manage'), handle((req) => {
    const { before, after } = memeAdmin.update(req.params.id, req.body || {}, by(req));
    record(req, 'MEME_UPDATED', req.params.id, {
      targetType: 'meme', targetLabel: after.top || after.text || after.id, oldValue: before, newValue: after,
    });
    return { card: after };
  }));

  router.post('/memes/:id/reset', need('memes.manage'), handle((req) => {
    requireConfirm(req);
    const { before, after } = memeAdmin.reset(req.params.id);
    record(req, 'MEME_RESET', req.params.id, {
      targetType: 'meme', targetLabel: after.top || after.text || after.id, oldValue: before, newValue: after,
    });
    return { card: after };
  }));

  router.post('/memes/:id/restore', need('memes.manage'), handle((req) => {
    const card = memeAdmin.restore(req.params.id, by(req));
    record(req, 'MEME_RESTORED', req.params.id, { targetType: 'meme', targetLabel: card.top || card.text || card.id, newValue: card });
    return { card };
  }));

  router.delete('/memes/:id', need('memes.manage'), handle((req) => {
    requireConfirm(req);
    const before = memeAdmin.remove(req.params.id, by(req));
    record(req, 'MEME_DELETED', req.params.id, {
      targetType: 'meme', targetLabel: before.top || before.text || before.id, oldValue: before, critical: true,
    });
    return { ok: true };
  }));

  // --- media ---------------------------------------------------------------------------------------

  router.get('/media', need('media.manage'), handle(() => ({
    media: media.list(),
    boards: layouts.LAYOUT_OPTIONS,
    modes: modes.catalog().map((m) => ({ id: m.id, gameId: m.gameId, label: m.label })),
  })));

  router.post('/media', need('media.manage'), withUpload, handle((req) => {
    const asset = media.upload(req.file, req.body || {}, by(req));
    record(req, 'MEDIA_UPLOADED', asset.id, {
      targetType: 'media', targetLabel: asset.title, newValue: { url: asset.url, size: asset.size, mime: asset.mime },
    });
    return { asset };
  }));

  router.post('/media/:id/replace', need('media.manage'), withUpload, handle((req) => {
    const { before, after } = media.replace(req.params.id, req.file, by(req));
    record(req, 'MEDIA_REPLACED', req.params.id, {
      targetType: 'media', targetLabel: req.params.id, oldValue: before, newValue: after, critical: true,
    });
    return { ok: true, url: after.url };
  }));

  router.put('/media/:id', need('media.manage'), handle((req) => {
    const { before, after } = media.update(req.params.id, req.body || {}, by(req));
    record(req, 'MEDIA_UPDATED', req.params.id, {
      targetType: 'media', targetLabel: after.title || req.params.id, oldValue: before, newValue: after,
    });
    return { ok: true };
  }));

  router.delete('/media/:id', need('media.manage'), handle((req) => {
    requireConfirm(req);
    const { entry, usages } = media.remove(req.params.id, { force: req.body?.force === true }, by(req));
    record(req, 'MEDIA_DELETED', req.params.id, {
      targetType: 'media', targetLabel: entry.title, oldValue: { url: entry.url, usages }, critical: true,
    });
    return { ok: true };
  }));

  // --- bots -----------------------------------------------------------------------------------------

  router.get('/bots', need('bots.manage'), handle(() => ({
    modes: modes.catalog().map((m) => {
      const cfg = modeConfig.effective(m.id);
      const timers = modeConfig.leafPaths(cfg.defaults || {})
        .filter((p) => /sec$|Sec$|onTimeout|timeout/i.test(p))
        .map((p) => ({ path: p, value: p.split('.').reduce((o, k) => (o ? o[k] : undefined), cfg.defaults), locked: cfg.locked.includes(p) }));
      return {
        id: m.id,
        gameId: m.gameId,
        label: m.label,
        simulator: !!simulator.DRIVERS[m.gameId],
        timers,
        bots: cfg.bots || null,
        version: cfg.version,
      };
    }),
    runs: creatorDb.listTestRuns({ limit: 20 }),
  })));

  // --- statistics -------------------------------------------------------------------------------------

  router.get('/stats', need('stats.view'), handle(() => {
    const now = Date.now();
    const accounts = accountsDb.listAll();
    const registrations = Array.from({ length: 30 }, (_, i) => {
      const start = new Date(now - (29 - i) * DAY);
      start.setHours(0, 0, 0, 0);
      const end = start.getTime() + DAY;
      return { day: start.getTime(), total: accounts.filter((a) => a.created_at >= start.getTime() && a.created_at < end).length };
    });
    const allStats = platformDb.allAccountStats();
    const top = accounts
      .map((a) => ({
        id: a.id, nickname: a.nickname, ...(allStats[a.id] || { played: 0, wins: 0, timeMs: 0 }),
      }))
      .sort((a, b) => (b.played || 0) - (a.played || 0))
      .slice(0, 15);
    return {
      totals: platformDb.platformTotals(),
      perDay: platformDb.matchesPerDay(30),
      popularity: platformDb.modePopularity(),
      registrations,
      roles: {
        creators: accounts.filter((a) => accountsDb.roleOf(a) === 'creator').length,
        admins: accounts.filter((a) => accountsDb.roleOf(a) === 'admin').length,
        users: accounts.length,
        blocked: accounts.filter((a) => a.status === 'blocked').length,
      },
      economy: community.economyTotals(),
      errors: creatorDb.errorCountsByGame(now - 7 * DAY),
      topPlayers: top,
      online: presence.onlineAccountIds().size,
      liveRooms: registry.listRooms().length,
    };
  }));

  // --- logs ------------------------------------------------------------------------------------------------

  router.get('/logs/audit', need('logs.view'), handle((req) => ({
    entries: platformDb.searchAudit({
      q: String(req.query.q || ''),
      action: String(req.query.action || ''),
      targetType: String(req.query.targetType || ''),
      adminId: String(req.query.adminId || ''),
      target: String(req.query.target || ''),
      critical: req.query.critical === '1',
      since: Number(req.query.since) || 0,
      before: Number(req.query.before) || 0,
      limit: Number(req.query.limit) || 100,
    }),
    actions: platformDb.auditActions(),
  })));

  router.get('/logs/errors', need('errors.view'), handle((req) => ({
    entries: creatorDb.listErrors({
      gameType: String(req.query.gameType || ''),
      q: String(req.query.q || ''),
      before: Number(req.query.before) || 0,
      limit: Number(req.query.limit) || 200,
    }),
    counts: creatorDb.errorCountsByGame(0),
  })));

  router.delete('/logs/errors', need('errors.view'), handle((req) => {
    requireConfirm(req);
    const removed = creatorDb.clearErrors();
    record(req, 'ERRORS_CLEARED', 'error_log', { targetType: 'logs', oldValue: { entries: removed }, critical: true });
    return { removed };
  }));

  // --- settings ----------------------------------------------------------------------------------------------

  router.get('/settings', need('settings.manage'), handle(() => ({
    settings: settings.get(),
    defaults: settings.DEFAULTS,
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      dataDir: path.basename(require('../config').DATA_DIR), // eslint-disable-line global-require
      creatorFromEnv: !!process.env.CREATOR_ACCOUNT_ID,
      adminFromEnv: !!process.env.ADMIN_ACCOUNT_ID,
      minMatchFromEnv: !!process.env.ECONOMY_MIN_MATCH_MS,
      uptimeSec: Math.round(process.uptime()),
    },
  })));

  router.put('/settings', need('settings.manage'), handle((req) => {
    requireConfirm(req);
    const before = settings.get();
    const after = settings.save(req.body?.settings || {}, by(req));
    record(req, 'SETTINGS_SAVED', 'platform', {
      targetType: 'settings', targetLabel: 'platform', oldValue: before, newValue: after, reason: req.body?.reason || null, critical: true,
    });
    return { settings: after };
  }));

  router.post('/settings/reset', need('settings.manage'), handle((req) => {
    requireConfirm(req);
    const section = req.body?.section === 'platform' ? 'platform' : 'economy';
    const before = settings.get();
    const after = settings.reset(section, by(req));
    record(req, 'SETTINGS_RESET', section, {
      targetType: 'settings', targetLabel: section, oldValue: before[section], newValue: after[section], critical: true,
    });
    return { settings: after };
  }));
};
