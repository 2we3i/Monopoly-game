// config.js
// Process-wide settings read from the environment in one place.

const path = require('path');
const fs = require('fs');

// Where the SQLite files and uploaded avatars live. Overridable so tests
// and local tooling can run against a throwaway directory instead of the
// real data.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// The accounts allowed into the admin panel. When set, they are the ONLY
// admins regardless of anything stored in the database - an id is a
// server-generated UUID, so nobody can register their way into it.
// Several ids are separated by commas (spaces or semicolons work too), and
// stray quotes around them are ignored:
//   ADMIN_ACCOUNT_ID=8c8ca55b-...,6633b1ba-...
// Without it, the admin is whichever account `npm run make-admin` marked.
function parseAdminIds(value) {
  return [...new Set(String(value || '')
    .split(/[\s,;]+/)
    .map((id) => id.replace(/^["'\\]+|["'\\]+$/g, ''))
    .filter(Boolean))];
}

const ADMIN_ACCOUNT_IDS = parseAdminIds(process.env.ADMIN_ACCOUNT_ID);
// Kept for older callers: the first configured admin, or null.
const ADMIN_ACCOUNT_ID = ADMIN_ACCOUNT_IDS[0] || null;

module.exports = {
  DATA_DIR, ADMIN_ACCOUNT_ID, ADMIN_ACCOUNT_IDS, parseAdminIds,
};
