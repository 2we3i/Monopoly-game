// platform.js
// Platform-wide history, kept apart from the live room store:
//
//   rooms_log      every room (lobby) ever created, and when it closed
//   matches        every game that actually started, and how it ended
//   match_players  who played each match and what they got out of it
//   game_modes     which modes the admin has enabled, disabled or paused
//   admin_actions  an audit trail of what the admin did
//
// Live rooms stay the source of truth for what is happening NOW; this
// file answers "what has happened" - the numbers behind profiles and the
// admin dashboard.

const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('../config');

const db = new Database(path.join(DATA_DIR, 'platform.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    game_type TEXT NOT NULL,
    mode_id TEXT,
    host_account_id TEXT,
    host_nickname TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    close_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS rooms_log_code ON rooms_log(room_code);
  CREATE INDEX IF NOT EXISTS rooms_log_host ON rooms_log(host_account_id);

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    game_type TEXT NOT NULL,
    mode_id TEXT,
    host_account_id TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    winner TEXT,
    duration_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS matches_code ON matches(room_code, status);
  CREATE INDEX IF NOT EXISTS matches_started ON matches(started_at);

  CREATE TABLE IF NOT EXISTS match_players (
    match_id INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    account_id TEXT,
    nickname TEXT,
    is_guest INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    role TEXT,
    score INTEGER,
    buildings INTEGER,
    gold_earned INTEGER,
    extra_json TEXT,
    PRIMARY KEY (match_id, player_id)
  );
  CREATE INDEX IF NOT EXISTS match_players_account ON match_players(account_id);

  CREATE TABLE IF NOT EXISTS game_modes (
    mode_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    paused_until INTEGER,
    updated_at INTEGER,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT,
    admin_name TEXT,
    action TEXT NOT NULL,
    target TEXT,
    details_json TEXT,
    created_at INTEGER NOT NULL
  );
`);

const DAY = 24 * 60 * 60 * 1000;

// --- rooms ---------------------------------------------------------------

const insertRoomStmt = db.prepare(`
  INSERT INTO rooms_log (room_code, game_type, mode_id, host_account_id, host_nickname, created_at)
  VALUES (@roomCode, @gameType, @modeId, @hostAccountId, @hostNickname, @createdAt)
`);
const closeRoomStmt = db.prepare(`
  UPDATE rooms_log SET closed_at = @closedAt, close_reason = @reason
  WHERE id = (SELECT id FROM rooms_log WHERE room_code = @roomCode AND closed_at IS NULL ORDER BY id DESC LIMIT 1)
`);

function logRoomCreated({ roomCode, gameType, modeId = null, hostAccountId = null, hostNickname = null, createdAt = Date.now() }) {
  insertRoomStmt.run({ roomCode, gameType, modeId, hostAccountId, hostNickname, createdAt });
}

function logRoomClosed(roomCode, reason = 'empty') {
  closeRoomStmt.run({ roomCode, reason, closedAt: Date.now() });
}

// --- matches ---------------------------------------------------------------

const insertMatchStmt = db.prepare(`
  INSERT INTO matches (room_code, game_type, mode_id, host_account_id, started_at, status, player_count)
  VALUES (@roomCode, @gameType, @modeId, @hostAccountId, @startedAt, 'active', @playerCount)
`);
const insertMatchPlayerStmt = db.prepare(`
  INSERT OR REPLACE INTO match_players (match_id, player_id, account_id, nickname, is_guest)
  VALUES (@matchId, @playerId, @accountId, @nickname, @isGuest)
`);
const activeMatchStmt = db.prepare("SELECT * FROM matches WHERE room_code = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
const endMatchStmt = db.prepare(`
  UPDATE matches SET status = @status, ended_at = @endedAt, winner = @winner,
    duration_ms = @endedAt - started_at
  WHERE id = @matchId AND status = 'active'
`);
const resultStmt = db.prepare(`
  UPDATE match_players SET result = @result, role = @role, score = @score, buildings = @buildings,
    gold_earned = @goldEarned, extra_json = @extraJson
  WHERE match_id = @matchId AND player_id = @playerId
`);

const startMatch = db.transaction(({ roomCode, gameType, modeId = null, hostAccountId = null, startedAt = Date.now(), players }) => {
  const { lastInsertRowid } = insertMatchStmt.run({
    roomCode, gameType, modeId, hostAccountId, startedAt, playerCount: players.length,
  });
  const matchId = Number(lastInsertRowid);
  players.forEach((p) => insertMatchPlayerStmt.run({
    matchId,
    playerId: p.playerId,
    accountId: p.accountId || null,
    nickname: p.nickname || null,
    isGuest: p.accountId ? 0 : 1,
  }));
  return matchId;
});

function findActiveMatch(roomCode) {
  return activeMatchStmt.get(roomCode) || null;
}

const finishMatch = db.transaction((matchId, { winner = null, players = [] }) => {
  endMatchStmt.run({ matchId, status: 'finished', endedAt: Date.now(), winner });
  players.forEach((p) => resultStmt.run({
    matchId,
    playerId: p.playerId,
    result: p.result || null,
    role: p.role || null,
    score: Number.isFinite(p.score) ? p.score : null,
    buildings: Number.isFinite(p.buildings) ? p.buildings : null,
    goldEarned: Number.isFinite(p.goldEarned) ? p.goldEarned : null,
    extraJson: p.extra ? JSON.stringify(p.extra) : null,
  }));
});

function abortMatch(matchId) {
  endMatchStmt.run({ matchId, status: 'aborted', endedAt: Date.now(), winner: null });
}

// --- modes -----------------------------------------------------------------

const getModeStmt = db.prepare('SELECT * FROM game_modes WHERE mode_id = ?');
const upsertModeStmt = db.prepare(`
  INSERT INTO game_modes (mode_id, status, paused_until, updated_at, updated_by)
  VALUES (@modeId, @status, @pausedUntil, @updatedAt, @updatedBy)
  ON CONFLICT(mode_id) DO UPDATE SET status = excluded.status, paused_until = excluded.paused_until,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by
`);

function getModeRow(modeId) {
  return getModeStmt.get(modeId) || null;
}

function setModeRow({ modeId, status, pausedUntil = null, updatedBy = null }) {
  upsertModeStmt.run({ modeId, status, pausedUntil, updatedAt: Date.now(), updatedBy });
}

// --- audit -----------------------------------------------------------------

const auditStmt = db.prepare(`
  INSERT INTO admin_actions (admin_id, admin_name, action, target, details_json, created_at)
  VALUES (@adminId, @adminName, @action, @target, @detailsJson, @createdAt)
`);
const recentAuditStmt = db.prepare('SELECT * FROM admin_actions ORDER BY id DESC LIMIT ?');

function audit({ adminId, adminName, action, target = null, details = null }) {
  auditStmt.run({
    adminId, adminName, action, target, detailsJson: details ? JSON.stringify(details) : null, createdAt: Date.now(),
  });
}

function recentAudit(limit = 20) {
  return recentAuditStmt.all(limit).map((r) => ({
    id: r.id,
    adminName: r.admin_name,
    action: r.action,
    target: r.target,
    details: r.details_json ? JSON.parse(r.details_json) : null,
    createdAt: r.created_at,
  }));
}

// --- queries: platform -----------------------------------------------------

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function platformTotals() {
  const now = Date.now();
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  return {
    roomsCreated: one('SELECT COUNT(*) n FROM rooms_log').n,
    matchesTotal: one('SELECT COUNT(*) n FROM matches').n,
    matchesActive: one("SELECT COUNT(*) n FROM matches WHERE status = 'active'").n,
    matchesFinished: one("SELECT COUNT(*) n FROM matches WHERE status = 'finished'").n,
    matchesAborted: one("SELECT COUNT(*) n FROM matches WHERE status = 'aborted'").n,
    matchesToday: one('SELECT COUNT(*) n FROM matches WHERE started_at >= ?', startOfToday()).n,
    matchesWeek: one('SELECT COUNT(*) n FROM matches WHERE started_at >= ?', now - 7 * DAY).n,
    matchesMonth: one('SELECT COUNT(*) n FROM matches WHERE started_at >= ?', now - 30 * DAY).n,
    avgPlayers: one('SELECT AVG(player_count) v FROM matches').v || 0,
    avgDurationMs: one("SELECT AVG(duration_ms) v FROM matches WHERE status = 'finished'").v || 0,
    guestSeats: one('SELECT COUNT(*) n FROM match_players WHERE is_guest = 1').n,
    distinctGuests: one('SELECT COUNT(DISTINCT player_id) n FROM match_players WHERE is_guest = 1').n,
  };
}

function modePopularity() {
  return db.prepare(`
    SELECT game_type gameType, mode_id modeId, COUNT(*) matches,
      SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) finished,
      AVG(player_count) avgPlayers,
      AVG(CASE WHEN status = 'finished' THEN duration_ms END) avgDurationMs
    FROM matches GROUP BY game_type, mode_id ORDER BY matches DESC
  `).all();
}

function modePlayerCounts() {
  return db.prepare(`
    SELECT m.mode_id modeId, COUNT(DISTINCT mp.player_id) players
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    GROUP BY m.mode_id
  `).all();
}

// Matches per day for the last `days` days, split by game.
function matchesPerDay(days = 30) {
  const since = startOfToday() - (days - 1) * DAY;
  const rows = db.prepare('SELECT game_type, started_at FROM matches WHERE started_at >= ?').all(since);
  const buckets = Array.from({ length: days }, (_, i) => ({ day: since + i * DAY, total: 0, byGame: {} }));
  rows.forEach((r) => {
    const i = Math.min(days - 1, Math.floor((r.started_at - since) / DAY));
    buckets[i].total += 1;
    buckets[i].byGame[r.game_type] = (buckets[i].byGame[r.game_type] || 0) + 1;
  });
  return buckets;
}

function recentMatches(limit = 12) {
  const matches = db.prepare('SELECT * FROM matches ORDER BY started_at DESC LIMIT ?').all(limit);
  return matches.map((m) => ({
    ...matchRow(m),
    players: db.prepare('SELECT nickname, result, is_guest FROM match_players WHERE match_id = ?').all(m.id)
      .map((p) => ({ nickname: p.nickname, result: p.result, isGuest: !!p.is_guest })),
  }));
}

function matchRow(m) {
  return {
    id: m.id,
    roomCode: m.room_code,
    gameType: m.game_type,
    modeId: m.mode_id,
    startedAt: m.started_at,
    endedAt: m.ended_at,
    status: m.status,
    playerCount: m.player_count,
    winner: m.winner,
    durationMs: m.duration_ms,
  };
}

// --- queries: per account --------------------------------------------------

function favourite(counts) {
  let best = null;
  Object.entries(counts).forEach(([key, n]) => { if (!best || n > best.count) best = { key, count: n }; });
  return best;
}

// Every number a profile or the admin's user table shows for one account,
// computed from the match history rather than stored counters, so it can
// never drift out of step with what actually happened.
function accountStats(accountId) {
  const rows = db.prepare(`
    SELECT mp.*, m.game_type, m.mode_id, m.started_at, m.ended_at, m.status, m.player_count, m.room_code
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.account_id = ?
    ORDER BY m.started_at DESC
  `).all(accountId);
  const created = db.prepare('SELECT COUNT(*) n FROM rooms_log WHERE host_account_id = ?').get(accountId).n;
  const now = Date.now();

  const byGame = {};
  const modeCounts = {};
  let wins = 0;
  let losses = 0;
  let finished = 0;
  let timeMs = 0;
  rows.forEach((r) => {
    const g = byGame[r.game_type] || (byGame[r.game_type] = { played: 0, wins: 0, losses: 0, finished: 0, timeMs: 0 });
    const duration = Math.max(0, (r.ended_at || (r.status === 'active' ? now : r.started_at)) - r.started_at);
    g.played += 1;
    g.timeMs += duration;
    timeMs += duration;
    modeCounts[`${r.game_type}:${r.mode_id || ''}`] = (modeCounts[`${r.game_type}:${r.mode_id || ''}`] || 0) + 1;
    if (r.status === 'finished') {
      finished += 1;
      g.finished += 1;
    }
    if (r.result === 'win') { wins += 1; g.wins += 1; }
    if (r.result === 'loss') { losses += 1; g.losses += 1; }
  });
  const fav = favourite(modeCounts);
  const decided = wins + losses;

  return {
    created,
    played: rows.length,
    wins,
    losses,
    winRate: decided ? wins / decided : 0,
    finished,
    unfinished: rows.length - finished,
    timeMs,
    favouriteMode: fav ? { gameType: fav.key.split(':')[0], modeId: fav.key.split(':')[1] || null, count: fav.count } : null,
    byGame,
    recent: rows.slice(0, 10).map((r) => ({
      matchId: r.match_id,
      roomCode: r.room_code,
      gameType: r.game_type,
      modeId: r.mode_id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      playerCount: r.player_count,
      result: r.result,
      role: r.role,
      score: r.score,
    })),
  };
}

// One pass over every account's history, for the admin's user table.
function allAccountStats() {
  const rows = db.prepare(`
    SELECT mp.account_id, mp.result, m.game_type, m.mode_id, m.status, m.started_at, m.ended_at
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.account_id IS NOT NULL
    ORDER BY m.started_at DESC
  `).all();
  const created = db.prepare('SELECT host_account_id id, COUNT(*) n FROM rooms_log WHERE host_account_id IS NOT NULL GROUP BY host_account_id').all();
  const now = Date.now();
  const out = {};
  const get = (id) => out[id] || (out[id] = {
    created: 0, played: 0, wins: 0, losses: 0, finished: 0, timeMs: 0, modes: {},
  });
  created.forEach((c) => { get(c.id).created = c.n; });
  rows.forEach((r) => {
    const s = get(r.account_id);
    s.played += 1;
    if (r.status === 'finished') s.finished += 1;
    if (r.result === 'win') s.wins += 1;
    if (r.result === 'loss') s.losses += 1;
    s.timeMs += Math.max(0, (r.ended_at || (r.status === 'active' ? now : r.started_at)) - r.started_at);
    const key = `${r.game_type}:${r.mode_id || ''}`;
    s.modes[key] = (s.modes[key] || 0) + 1;
  });
  Object.values(out).forEach((s) => {
    const fav = favourite(s.modes);
    s.favouriteMode = fav ? { gameType: fav.key.split(':')[0], modeId: fav.key.split(':')[1] || null } : null;
    s.unfinished = s.played - s.finished;
    const decided = s.wins + s.losses;
    s.winRate = decided ? s.wins / decided : 0;
    delete s.modes;
  });
  return out;
}

// --- queries: Citadels -----------------------------------------------------

// Citadels numbers for one account, or for everyone when accountId is
// null. Roles change every round, so a role's win rate is "games in which
// the player held that role at least once, and won".
function citadelsStats(accountId = null) {
  const rows = db.prepare(`
    SELECT mp.match_id, mp.result, mp.buildings, mp.gold_earned, mp.extra_json, mp.score,
      m.duration_ms, m.player_count, m.status
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE m.game_type = 'citadels' ${accountId ? 'AND mp.account_id = ?' : ''}
  `).all(...(accountId ? [accountId] : []));

  const finishedRows = rows.filter((r) => r.status === 'finished');
  // Game-level numbers (how many, how long, how many players) count each
  // match once; seat-level numbers (districts, gold, role win rates) count
  // every player in it. For one account the two are the same thing.
  const matchesById = new Map(rows.map((r) => [r.match_id, r]));
  const finishedMatches = [...new Map(finishedRows.map((r) => [r.match_id, r])).values()];
  const roleCounts = {};
  const roleGames = {};
  const roleWins = {};
  let buildingsSum = 0;
  let goldSum = 0;
  const durationSum = finishedMatches.reduce((n, m) => n + (m.duration_ms || 0), 0);
  const playersSum = finishedMatches.reduce((n, m) => n + (m.player_count || 0), 0);
  finishedRows.forEach((r) => {
    buildingsSum += r.buildings || 0;
    goldSum += r.gold_earned || 0;
    const roles = (() => { try { return JSON.parse(r.extra_json || '{}').roles || []; } catch { return []; } })();
    roles.forEach((role) => { roleCounts[role] = (roleCounts[role] || 0) + 1; });
    [...new Set(roles)].forEach((role) => {
      roleGames[role] = (roleGames[role] || 0) + 1;
      if (r.result === 'win') roleWins[role] = (roleWins[role] || 0) + 1;
    });
  });
  const seats = finishedRows.length;
  const games = finishedMatches.length;
  const fav = favourite(roleCounts);
  const wins = finishedRows.filter((r) => r.result === 'win').length;
  return {
    scope: accountId ? 'account' : 'global',
    played: matchesById.size,
    finished: games,
    wins,
    losses: seats - wins,
    winRate: seats ? wins / seats : 0,
    avgDurationMs: games ? durationSum / games : 0,
    avgPlayers: games ? playersSum / games : 0,
    avgBuildings: seats ? buildingsSum / seats : 0,
    avgGoldEarned: seats ? goldSum / seats : 0,
    mostPopularRole: fav ? { role: fav.key, picks: fav.count } : null,
    roles: Object.keys(roleGames).sort().map((role) => ({
      role,
      picks: roleCounts[role] || 0,
      games: roleGames[role],
      wins: roleWins[role] || 0,
      winRate: roleGames[role] ? (roleWins[role] || 0) / roleGames[role] : 0,
    })),
  };
}

function checkpoint() {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* non-fatal */ }
}

function close() {
  try {
    checkpoint();
    db.close();
  } catch { /* already closed */ }
}

module.exports = {
  logRoomCreated,
  logRoomClosed,
  startMatch,
  findActiveMatch,
  finishMatch,
  abortMatch,
  getModeRow,
  setModeRow,
  audit,
  recentAudit,
  platformTotals,
  modePopularity,
  modePlayerCounts,
  matchesPerDay,
  recentMatches,
  accountStats,
  allAccountStats,
  citadelsStats,
  close,
};
