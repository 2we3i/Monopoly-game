// accounts.js
// Persistence for registered player accounts: nickname, password (hashed
// - never stored/logged in plaintext), an optional avatar, and the
// account's standing: role (user/admin), block status and activity
// timestamps. No email, no personal information. Guests never get a row.

const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { DATA_DIR, ADMIN_ACCOUNT_IDS } = require('../config');

const DB_PATH = path.join(DATA_DIR, 'accounts.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    nickname_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    avatar_path TEXT,
    created_at INTEGER NOT NULL
  );
`);

// Additive migration: databases created before roles and blocking existed
// get the new columns with safe defaults, and nothing else is touched.
const MIGRATED_COLUMNS = [
  ['role', "TEXT NOT NULL DEFAULT 'user'"],
  ['status', "TEXT NOT NULL DEFAULT 'active'"],
  ['blocked_reason', 'TEXT'],
  ['blocked_at', 'INTEGER'],
  ['blocked_by', 'TEXT'],
  ['blocked_by_name', 'TEXT'],
  ['last_login_at', 'INTEGER'],
  ['last_seen_at', 'INTEGER'],
];
const existingColumns = new Set(db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name));
MIGRATED_COLUMNS.forEach(([name, type]) => {
  if (!existingColumns.has(name)) db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${type}`);
});

function checkpoint() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Accounts DB checkpoint failed (non-fatal):', err.message);
  }
}

function close() {
  try {
    checkpoint();
    db.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error closing accounts database:', err.message);
  }
}

const SCRYPT_KEYLEN = 64;
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

function verifyPassword(password, salt, storedHash) {
  const candidateHash = hashPassword(password, salt);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const insertStmt = db.prepare(`
  INSERT INTO accounts (id, nickname, nickname_lower, password_hash, password_salt, avatar_path, created_at, last_login_at)
  VALUES (@id, @nickname, @nicknameLower, @passwordHash, @passwordSalt, @avatarPath, @createdAt, @createdAt)
`);
const getByNicknameLowerStmt = db.prepare('SELECT * FROM accounts WHERE nickname_lower = ?');
const getByIdStmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
const getAllStmt = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC');
const updateAvatarStmt = db.prepare('UPDATE accounts SET avatar_path = ? WHERE id = ?');
const updateNicknameStmt = db.prepare('UPDATE accounts SET nickname = ?, nickname_lower = ? WHERE id = ?');
const updatePasswordStmt = db.prepare('UPDATE accounts SET password_hash = ?, password_salt = ? WHERE id = ?');
const touchLoginStmt = db.prepare('UPDATE accounts SET last_login_at = ?, last_seen_at = ? WHERE id = ?');
const touchSeenStmt = db.prepare('UPDATE accounts SET last_seen_at = ? WHERE id = ?');
const blockStmt = db.prepare(`
  UPDATE accounts SET status = 'blocked', blocked_reason = @reason, blocked_at = @at,
    blocked_by = @adminId, blocked_by_name = @adminName
  WHERE id = @id
`);
const unblockStmt = db.prepare(`
  UPDATE accounts SET status = 'active', blocked_reason = NULL, blocked_at = NULL,
    blocked_by = NULL, blocked_by_name = NULL
  WHERE id = ?
`);
const demoteAllStmt = db.prepare("UPDATE accounts SET role = 'user' WHERE role = 'admin'");
const promoteStmt = db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?");

// The single source of truth for "is this account the administrator".
function isAdmin(row) {
  if (!row) return false;
  if (ADMIN_ACCOUNT_IDS.length) return ADMIN_ACCOUNT_IDS.includes(row.id);
  return row.role === 'admin';
}

function isBlocked(row) {
  return !!row && row.status === 'blocked';
}

function toPublicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatarPath: row.avatar_path,
    createdAt: row.created_at,
    role: isAdmin(row) ? 'admin' : 'user',
    status: row.status || 'active',
  };
}

// Everything the admin panel is allowed to see about an account - never
// the password hash or salt.
function toAdminAccount(row) {
  if (!row) return null;
  return {
    ...toPublicAccount(row),
    lastLoginAt: row.last_login_at || null,
    lastSeenAt: row.last_seen_at || null,
    blockedReason: row.blocked_reason || null,
    blockedAt: row.blocked_at || null,
    blockedBy: row.blocked_by || null,
    blockedByName: row.blocked_by_name || null,
  };
}

function findByNickname(nickname) {
  return getByNicknameLowerStmt.get(nickname.toLowerCase());
}

function findById(id) {
  if (typeof id !== 'string' || !id) return null;
  return getByIdStmt.get(id);
}

function listAll() {
  return getAllStmt.all();
}

const searchStmt = db.prepare(`
  SELECT * FROM accounts WHERE nickname_lower LIKE ? ESCAPE '\\'
  ORDER BY CASE WHEN nickname_lower LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, last_seen_at DESC
  LIMIT ?
`);

// Nickname search for the messenger and mention pickers.
function searchByNickname(query, limit = 20) {
  const q = String(query || '').toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  return searchStmt.all(`%${q}%`, `${q}%`, Math.max(1, Math.min(50, limit)));
}

function createAccount({ id, nickname, password }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  insertStmt.run({
    id,
    nickname,
    nicknameLower: nickname.toLowerCase(),
    passwordHash,
    passwordSalt: salt,
    avatarPath: null,
    createdAt: Date.now(),
  });
  checkpoint();
  return toPublicAccount(findById(id));
}

function setAvatar(accountId, avatarPath) {
  updateAvatarStmt.run(avatarPath, accountId);
  checkpoint();
  return toPublicAccount(findById(accountId));
}

function changeNickname(accountId, newNickname) {
  updateNicknameStmt.run(newNickname, newNickname.toLowerCase(), accountId);
  checkpoint();
  return toPublicAccount(findById(accountId));
}

function changePassword(accountId, newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(newPassword, salt);
  updatePasswordStmt.run(passwordHash, salt, accountId);
  checkpoint();
}

function touchLogin(accountId) {
  const now = Date.now();
  touchLoginStmt.run(now, now, accountId);
}

function touchSeen(accountId) {
  touchSeenStmt.run(Date.now(), accountId);
}

function blockAccount(accountId, { reason, adminId, adminName }) {
  blockStmt.run({ id: accountId, reason, at: Date.now(), adminId, adminName });
  checkpoint();
  return findById(accountId);
}

function unblockAccount(accountId) {
  unblockStmt.run(accountId);
  checkpoint();
  return findById(accountId);
}

// Exactly one admin: promoting an account demotes every other one.
const makeSoleAdmin = db.transaction((accountId) => {
  demoteAllStmt.run();
  promoteStmt.run(accountId);
});

module.exports = {
  findByNickname,
  findById,
  listAll,
  searchByNickname,
  createAccount,
  setAvatar,
  changeNickname,
  changePassword,
  verifyPassword,
  toPublicAccount,
  toAdminAccount,
  isAdmin,
  isBlocked,
  touchLogin,
  touchSeen,
  blockAccount,
  unblockAccount,
  makeSoleAdmin,
  close,
};
