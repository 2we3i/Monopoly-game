// accounts.js
// Persistence for registered player accounts: nickname, password (hashed
// - never stored/logged in plaintext), and an optional avatar. No email,
// no personal information. Guests never get a row here.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
  INSERT INTO accounts (id, nickname, nickname_lower, password_hash, password_salt, avatar_path, created_at)
  VALUES (@id, @nickname, @nicknameLower, @passwordHash, @passwordSalt, @avatarPath, @createdAt)
`);
const getByNicknameLowerStmt = db.prepare('SELECT * FROM accounts WHERE nickname_lower = ?');
const getByIdStmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
const updateAvatarStmt = db.prepare('UPDATE accounts SET avatar_path = ? WHERE id = ?');
const updateNicknameStmt = db.prepare('UPDATE accounts SET nickname = ?, nickname_lower = ? WHERE id = ?');
const updatePasswordStmt = db.prepare('UPDATE accounts SET password_hash = ?, password_salt = ? WHERE id = ?');

function toPublicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatarPath: row.avatar_path,
    createdAt: row.created_at,
  };
}

function findByNickname(nickname) {
  return getByNicknameLowerStmt.get(nickname.toLowerCase());
}

function findById(id) {
  return getByIdStmt.get(id);
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

module.exports = {
  findByNickname,
  findById,
  createAccount,
  setAvatar,
  changeNickname,
  changePassword,
  verifyPassword,
  toPublicAccount,
  close,
};
