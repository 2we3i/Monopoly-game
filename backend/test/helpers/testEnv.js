// testEnv.js
// Require this FIRST in any test that touches the database: it points the
// server at a fresh throwaway data directory, so tests never read or write
// real accounts, rooms or history - and never collide with a previous run.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

if (!process.env.LANDMARK_TEST_DATA_DIR) {
  process.env.LANDMARK_TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'landmark-test-'));
}
process.env.DATA_DIR = process.env.LANDMARK_TEST_DATA_DIR;

// A registered account straight in the database, with a session token for
// it - the same token a real login would hand out.
function registerAccount(nickname) {
  // eslint-disable-next-line global-require
  const accounts = require('../../src/db/accounts');
  // eslint-disable-next-line global-require
  const sessionToken = require('../../src/auth/sessionToken');
  const id = crypto.randomUUID();
  const account = accounts.createAccount({ id, nickname, password: 'password123' });
  return { id, nickname: account.nickname, token: sessionToken.sign(id) };
}

module.exports = { registerAccount, dataDir: process.env.DATA_DIR };
