// creator.js
// Storage for everything the Creator can change from the panel, kept in
// platform.db next to the match history and the economy:
//
//   platform_settings    economy numbers and other platform switches
//   mode_configs         the current rules/limits/texts of each mode (+ version)
//   mode_config_history  every saved version, for the journal and rollbacks
//   board_layouts        edited built-in Monopoly boards and new custom boards
//   shop_items           edits to catalogue items and items the Creator added
//   meme_overrides       edited captions / pictures / switches of existing memes
//   custom_memes         memes the Creator added
//   media_assets         uploaded pictures and the titles/links of every picture
//   error_log            server errors, for the panel
//   test_runs            simulations and test matches the Creator ran
//   test_rooms           rooms started as test matches (never recorded)
//
// Every table is additive: nothing here changes a table the game already
// had, and an empty table means "exactly as the code ships".

const { connection: db } = require('./platform');
// The inventory table (used to count an item's owners) lives there.
require('./community');

db.exec(`
  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS mode_configs (
    mode_id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    config_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS mode_config_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    config_json TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL,
    created_by TEXT
  );
  CREATE INDEX IF NOT EXISTS mode_config_history_mode ON mode_config_history(mode_id, version);

  CREATE TABLE IF NOT EXISTS board_layouts (
    id TEXT PRIMARY KEY,
    base_id TEXT,
    custom INTEGER NOT NULL DEFAULT 0,
    data_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY,
    custom INTEGER NOT NULL DEFAULT 0,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS meme_overrides (
    meme_id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_memes (
    id TEXT PRIMARY KEY,
    pack TEXT NOT NULL,
    rating TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    file TEXT,
    url TEXT,
    mime TEXT,
    size INTEGER,
    title TEXT,
    description TEXT,
    mode_id TEXT,
    tile_json TEXT,
    tags TEXT,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    source TEXT,
    game_type TEXT,
    message TEXT NOT NULL,
    stack TEXT,
    context_json TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS error_log_created ON error_log(created_at);

  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    params_json TEXT,
    result_json TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS test_rooms (
    room_code TEXT PRIMARY KEY,
    mode_id TEXT,
    account_id TEXT,
    created_at INTEGER NOT NULL
  );
`);

const now = () => Date.now();
const parse = (text, fallback = null) => {
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
};

// --- settings ------------------------------------------------------------------

function getSettings() {
  const out = {};
  db.prepare('SELECT * FROM platform_settings').all().forEach((r) => { out[r.key] = parse(r.value_json); });
  return out;
}

function setSetting(key, value, by) {
  db.prepare(`
    INSERT INTO platform_settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(key, JSON.stringify(value), now(), by || null);
}

function deleteSetting(key) {
  db.prepare('DELETE FROM platform_settings WHERE key = ?').run(key);
}

// --- mode configs -----------------------------------------------------------------

function modeConfigRow(r) {
  return r ? {
    modeId: r.mode_id, version: r.version, config: parse(r.config_json, {}), updatedAt: r.updated_at, updatedBy: r.updated_by,
  } : null;
}

function getModeConfig(modeId) {
  return modeConfigRow(db.prepare('SELECT * FROM mode_configs WHERE mode_id = ?').get(modeId));
}

function allModeConfigs() {
  return db.prepare('SELECT * FROM mode_configs').all().map(modeConfigRow);
}

const saveModeConfig = db.transaction((modeId, config, by, note = null) => {
  const current = getModeConfig(modeId);
  const version = (current?.version || 1) + 1;
  const at = now();
  db.prepare(`
    INSERT INTO mode_configs (mode_id, version, config_json, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(mode_id) DO UPDATE SET version = excluded.version, config_json = excluded.config_json,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(modeId, version, JSON.stringify(config), at, by || null);
  db.prepare(`
    INSERT INTO mode_config_history (mode_id, version, config_json, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)
  `).run(modeId, version, JSON.stringify(config), note, at, by || null);
  return getModeConfig(modeId);
});

function modeConfigHistory(modeId, limit = 30) {
  return db.prepare('SELECT * FROM mode_config_history WHERE mode_id = ? ORDER BY id DESC LIMIT ?').all(modeId, limit).map((r) => ({
    id: r.id, version: r.version, config: parse(r.config_json, {}), note: r.note, createdAt: r.created_at, createdBy: r.created_by,
  }));
}

function modeConfigVersion(modeId, version) {
  const r = db.prepare('SELECT * FROM mode_config_history WHERE mode_id = ? AND version = ?').get(modeId, version);
  return r ? parse(r.config_json, {}) : null;
}

// --- board layouts ------------------------------------------------------------------

function layoutRow(r) {
  return r ? {
    id: r.id,
    baseId: r.base_id,
    custom: !!r.custom,
    data: parse(r.data_json, {}),
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    deletedAt: r.deleted_at,
  } : null;
}

function listLayouts({ includeDeleted = false } = {}) {
  return db.prepare(`SELECT * FROM board_layouts ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY created_at`).all().map(layoutRow);
}

function getLayoutRow(id) {
  return layoutRow(db.prepare('SELECT * FROM board_layouts WHERE id = ?').get(id));
}

function saveLayout({
  id, baseId = null, custom = false, data, by,
}) {
  const existing = getLayoutRow(id);
  const at = now();
  if (existing) {
    db.prepare('UPDATE board_layouts SET data_json = ?, version = version + 1, updated_at = ?, updated_by = ?, deleted_at = NULL WHERE id = ?')
      .run(JSON.stringify(data), at, by || null, id);
  } else {
    db.prepare(`
      INSERT INTO board_layouts (id, base_id, custom, data_json, version, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, baseId, custom ? 1 : 0, JSON.stringify(data), at, at, by || null);
  }
  return getLayoutRow(id);
}

function deleteLayout(id) {
  const row = getLayoutRow(id);
  if (!row) return false;
  if (row.custom) db.prepare('UPDATE board_layouts SET deleted_at = ? WHERE id = ?').run(now(), id);
  else db.prepare('DELETE FROM board_layouts WHERE id = ?').run(id);
  return true;
}

// --- shop items --------------------------------------------------------------------------

function shopRow(r) {
  return r ? {
    id: r.id, custom: !!r.custom, data: parse(r.data_json, {}), createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by, deletedAt: r.deleted_at,
  } : null;
}

function listShopRows() {
  return db.prepare('SELECT * FROM shop_items ORDER BY created_at').all().map(shopRow);
}

function getShopRow(id) {
  return shopRow(db.prepare('SELECT * FROM shop_items WHERE id = ?').get(id));
}

function saveShopRow({
  id, custom = false, data, by,
}) {
  const at = now();
  db.prepare(`
    INSERT INTO shop_items (id, custom, data_json, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted_at = NULL
  `).run(id, custom ? 1 : 0, JSON.stringify(data), at, at, by || null);
  return getShopRow(id);
}

function markShopRowDeleted(id, by) {
  db.prepare('UPDATE shop_items SET deleted_at = ?, updated_by = ? WHERE id = ?').run(now(), by || null, id);
}

function removeShopRow(id) {
  db.prepare('DELETE FROM shop_items WHERE id = ?').run(id);
}

function itemOwnerCount(itemId) {
  return db.prepare('SELECT COUNT(*) n FROM inventory WHERE item_id = ?').get(itemId).n;
}

// --- memes -------------------------------------------------------------------------------

function memeOverrides() {
  const out = {};
  db.prepare('SELECT * FROM meme_overrides').all().forEach((r) => { out[r.meme_id] = parse(r.data_json, {}); });
  return out;
}

function saveMemeOverride(memeId, data, by) {
  db.prepare(`
    INSERT INTO meme_overrides (meme_id, data_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(meme_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(memeId, JSON.stringify(data), now(), by || null);
}

function clearMemeOverride(memeId) {
  db.prepare('DELETE FROM meme_overrides WHERE meme_id = ?').run(memeId);
}

function customMemes({ includeDeleted = true } = {}) {
  return db.prepare(`SELECT * FROM custom_memes ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY pack, rating, seq`).all().map((r) => ({
    id: r.id, pack: r.pack, rating: r.rating, seq: r.seq, data: parse(r.data_json, {}), createdAt: r.created_at, createdBy: r.created_by, deletedAt: r.deleted_at,
  }));
}

const addCustomMeme = db.transaction(({
  pack, rating, data, by,
}) => {
  const seq = (db.prepare('SELECT MAX(seq) m FROM custom_memes WHERE pack = ? AND rating = ?').get(pack, rating).m || 0) + 1;
  const id = `${pack}.${rating}.c${seq}`;
  db.prepare('INSERT INTO custom_memes (id, pack, rating, seq, data_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, pack, rating, seq, JSON.stringify(data), now(), by || null);
  return id;
});

function updateCustomMeme(id, data) {
  db.prepare('UPDATE custom_memes SET data_json = ? WHERE id = ?').run(JSON.stringify(data), id);
}

function deleteCustomMeme(id) {
  db.prepare('UPDATE custom_memes SET deleted_at = ? WHERE id = ?').run(now(), id);
}

// --- media ---------------------------------------------------------------------------------

function mediaRow(r) {
  return r ? {
    id: r.id,
    kind: r.kind,
    file: r.file,
    url: r.url,
    mime: r.mime,
    size: r.size,
    title: r.title,
    description: r.description,
    modeId: r.mode_id,
    tile: parse(r.tile_json),
    tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  } : null;
}

function listMedia({ includeDeleted = false } = {}) {
  return db.prepare(`SELECT * FROM media_assets ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY updated_at DESC`).all().map(mediaRow);
}

function getMedia(id) {
  return mediaRow(db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id));
}

function saveMedia(asset, by) {
  const at = now();
  const existing = getMedia(asset.id);
  const row = {
    id: asset.id,
    kind: asset.kind || existing?.kind || 'upload',
    file: asset.file !== undefined ? asset.file : existing?.file ?? null,
    url: asset.url !== undefined ? asset.url : existing?.url ?? null,
    mime: asset.mime !== undefined ? asset.mime : existing?.mime ?? null,
    size: asset.size !== undefined ? asset.size : existing?.size ?? null,
    title: asset.title !== undefined ? asset.title : existing?.title ?? null,
    description: asset.description !== undefined ? asset.description : existing?.description ?? null,
    modeId: asset.modeId !== undefined ? asset.modeId : existing?.modeId ?? null,
    tileJson: asset.tile !== undefined ? (asset.tile ? JSON.stringify(asset.tile) : null) : (existing?.tile ? JSON.stringify(existing.tile) : null),
    tags: asset.tags !== undefined ? (asset.tags || []).join(',') : (existing?.tags || []).join(','),
  };
  db.prepare(`
    INSERT INTO media_assets (id, kind, file, url, mime, size, title, description, mode_id, tile_json, tags, created_at, created_by, updated_at)
    VALUES (@id, @kind, @file, @url, @mime, @size, @title, @description, @modeId, @tileJson, @tags, @at, @by, @at)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, file = excluded.file, url = excluded.url, mime = excluded.mime,
      size = excluded.size, title = excluded.title, description = excluded.description, mode_id = excluded.mode_id,
      tile_json = excluded.tile_json, tags = excluded.tags, updated_at = excluded.updated_at, deleted_at = NULL
  `).run({ ...row, at, by: by || null });
  return getMedia(asset.id);
}

function deleteMedia(id) {
  db.prepare('UPDATE media_assets SET deleted_at = ? WHERE id = ?').run(now(), id);
}

// --- errors ----------------------------------------------------------------------------------

const insertErrorStmt = db.prepare(`
  INSERT INTO error_log (level, source, game_type, message, stack, context_json, created_at)
  VALUES (@level, @source, @gameType, @message, @stack, @contextJson, @createdAt)
`);

function addError({
  level = 'error', source = null, gameType = null, message, stack = null, context = null,
}) {
  insertErrorStmt.run({
    level,
    source,
    gameType,
    message: String(message).slice(0, 2000),
    stack: stack ? String(stack).slice(0, 6000) : null,
    contextJson: context ? JSON.stringify(context).slice(0, 4000) : null,
    createdAt: now(),
  });
}

function pruneErrors(keep = 5000) {
  db.prepare('DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT ?)').run(keep);
}

function listErrors({
  gameType = '', q = '', since = 0, before = 0, limit = 200,
} = {}) {
  const where = [];
  const args = [];
  if (gameType) { where.push('game_type = ?'); args.push(gameType); }
  if (since) { where.push('created_at >= ?'); args.push(since); }
  if (before) { where.push('id < ?'); args.push(before); }
  if (q) { where.push('LOWER(message) LIKE ?'); args.push(`%${String(q).toLowerCase()}%`); }
  const sql = `SELECT * FROM error_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
  return db.prepare(sql).all(...args, Math.max(1, Math.min(1000, limit))).map((r) => ({
    id: r.id, level: r.level, source: r.source, gameType: r.game_type, message: r.message, stack: r.stack, context: parse(r.context_json), createdAt: r.created_at,
  }));
}

function errorCountsByGame(since = 0) {
  const out = {};
  db.prepare('SELECT game_type, COUNT(*) n FROM error_log WHERE created_at >= ? GROUP BY game_type').all(since)
    .forEach((r) => { out[r.game_type || ''] = r.n; });
  return out;
}

function clearErrors() {
  return db.prepare('DELETE FROM error_log').run().changes;
}

// --- tests ------------------------------------------------------------------------------------

function addTestRun({
  modeId, kind, params, by, byName,
}) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO test_runs (mode_id, kind, status, params_json, created_by, created_by_name, created_at) VALUES (?, ?, 'running', ?, ?, ?, ?)
  `).run(modeId, kind, JSON.stringify(params || {}), by || null, byName || null, now());
  return Number(lastInsertRowid);
}

function finishTestRun(id, status, result) {
  db.prepare('UPDATE test_runs SET status = ?, result_json = ?, finished_at = ? WHERE id = ?').run(status, JSON.stringify(result || {}), now(), id);
}

function listTestRuns({ modeId = '', limit = 50 } = {}) {
  const rows = modeId
    ? db.prepare('SELECT * FROM test_runs WHERE mode_id = ? ORDER BY id DESC LIMIT ?').all(modeId, limit)
    : db.prepare('SELECT * FROM test_runs ORDER BY id DESC LIMIT ?').all(limit);
  return rows.map((r) => ({
    id: r.id,
    modeId: r.mode_id,
    kind: r.kind,
    status: r.status,
    params: parse(r.params_json, {}),
    result: parse(r.result_json),
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  }));
}

function addTestRoom(roomCode, modeId, accountId) {
  db.prepare('INSERT OR REPLACE INTO test_rooms (room_code, mode_id, account_id, created_at) VALUES (?, ?, ?, ?)').run(roomCode, modeId, accountId, now());
}

function testRoomCodes() {
  return db.prepare('SELECT room_code FROM test_rooms').all().map((r) => r.room_code);
}

function removeTestRoom(roomCode) {
  db.prepare('DELETE FROM test_rooms WHERE room_code = ?').run(roomCode);
}

module.exports = {
  getSettings,
  setSetting,
  deleteSetting,
  getModeConfig,
  allModeConfigs,
  saveModeConfig,
  modeConfigHistory,
  modeConfigVersion,
  listLayouts,
  getLayoutRow,
  saveLayout,
  deleteLayout,
  listShopRows,
  getShopRow,
  saveShopRow,
  markShopRowDeleted,
  removeShopRow,
  itemOwnerCount,
  memeOverrides,
  saveMemeOverride,
  clearMemeOverride,
  customMemes,
  addCustomMeme,
  updateCustomMeme,
  deleteCustomMeme,
  listMedia,
  getMedia,
  saveMedia,
  deleteMedia,
  addError,
  pruneErrors,
  listErrors,
  errorCountsByGame,
  clearErrors,
  addTestRun,
  finishTestRun,
  listTestRuns,
  addTestRoom,
  testRoomCodes,
  removeTestRoom,
};
