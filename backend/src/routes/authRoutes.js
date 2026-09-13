// authRoutes.js
// REST endpoints for account registration, login, and profile
// management.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const accounts = require('../db/accounts');
const sessionToken = require('../auth/sessionToken');

const router = express.Router();

const NICKNAME_MIN = 2;
const NICKNAME_MAX = 20;
const NICKNAME_PATTERN = /^[\p{L}\p{N} _.'-]+$/u;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 200;

function validateNickname(nickname) {
  if (typeof nickname !== 'string') return 'Nickname is required.';
  const trimmed = nickname.trim();
  if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
    return `Nickname must be between ${NICKNAME_MIN} and ${NICKNAME_MAX} characters.`;
  }
  if (!NICKNAME_PATTERN.test(trimmed)) {
    return 'Nickname can only contain letters, numbers, spaces, and . _ - \'';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  return null;
}

const AVATAR_DIR = path.join(__dirname, '..', '..', 'data', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const AVATAR_EXT_BY_TYPE = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => {
      const ext = AVATAR_EXT_BY_TYPE[file.mimetype] || '.bin';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
      cb(new Error('Avatar must be a PNG, JPEG, WEBP, or GIF image.'));
      return;
    }
    cb(null, true);
  },
});

function attachAccount(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.accountId = token ? sessionToken.verify(token) : null;
  next();
}
router.use(attachAccount);

function requireAuth(req, res, next) {
  if (!req.accountId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

router.post('/register', (req, res) => {
  const { nickname, password } = req.body || {};
  const nicknameError = validateNickname(nickname);
  if (nicknameError) return res.status(400).json({ error: nicknameError });
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const trimmedNickname = nickname.trim();
  if (accounts.findByNickname(trimmedNickname)) {
    return res.status(409).json({ error: 'That nickname is already taken.' });
  }

  const id = crypto.randomUUID();
  const account = accounts.createAccount({ id, nickname: trimmedNickname, password });
  const token = sessionToken.sign(id);
  res.status(201).json({ account, token });
});

router.post('/login', (req, res) => {
  const { nickname, password } = req.body || {};
  if (typeof nickname !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Nickname and password are required.' });
  }
  const row = accounts.findByNickname(nickname.trim());
  const invalidMsg = { error: 'Incorrect nickname or password.' };
  if (!row) return res.status(401).json(invalidMsg);
  if (!accounts.verifyPassword(password, row.password_salt, row.password_hash)) {
    return res.status(401).json(invalidMsg);
  }
  const token = sessionToken.sign(row.id);
  res.json({ account: accounts.toPublicAccount(row), token });
});

router.get('/me', requireAuth, (req, res) => {
  const row = accounts.findById(req.accountId);
  if (!row) return res.status(404).json({ error: 'Account not found.' });
  res.json({ account: accounts.toPublicAccount(row) });
});

router.post('/me/avatar', requireAuth, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const publicPath = `/avatars/${req.file.filename}`;
    const account = accounts.setAvatar(req.accountId, publicPath);
    res.json({ account });
  });
});

router.put('/me/nickname', requireAuth, (req, res) => {
  const { nickname } = req.body || {};
  const nicknameError = validateNickname(nickname);
  if (nicknameError) return res.status(400).json({ error: nicknameError });
  const trimmed = nickname.trim();
  const existing = accounts.findByNickname(trimmed);
  if (existing && existing.id !== req.accountId) {
    return res.status(409).json({ error: 'That nickname is already taken.' });
  }
  const account = accounts.changeNickname(req.accountId, trimmed);
  res.json({ account });
});

router.put('/me/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const row = accounts.findById(req.accountId);
  if (!row) return res.status(404).json({ error: 'Account not found.' });
  if (typeof currentPassword !== 'string' || !accounts.verifyPassword(currentPassword, row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  accounts.changePassword(req.accountId, newPassword);
  res.json({ ok: true });
});

module.exports = { router, AVATAR_DIR };
