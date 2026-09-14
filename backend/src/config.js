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

// The one account allowed into the admin panel. When set, it is the ONLY
// admin regardless of anything stored in the database - an id is a
// server-generated UUID, so nobody can register their way into it.
// Without it, the admin is whichever account `npm run make-admin` marked.
const ADMIN_ACCOUNT_ID = (process.env.ADMIN_ACCOUNT_ID || '').trim() || null;

module.exports = { DATA_DIR, ADMIN_ACCOUNT_ID };
