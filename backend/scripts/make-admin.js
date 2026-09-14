// make-admin.js
// Marks one account as the administrator and removes admin rights from
// every other account. Run on the server itself:
//
//   npm run make-admin -- <nickname>
//
// Where the database is not reachable from a shell (a hosted container),
// set ADMIN_ACCOUNT_ID to the account's id instead - it then overrides
// whatever this script stored.

const accounts = require('../src/db/accounts');
const { ADMIN_ACCOUNT_ID } = require('../src/config');

const nickname = process.argv.slice(2).join(' ').trim();
if (!nickname) {
  console.error('Usage: npm run make-admin -- <nickname>');
  process.exit(1);
}

const row = accounts.findByNickname(nickname);
if (!row) {
  console.error(`No account named "${nickname}". Register it first, then run this again.`);
  process.exit(1);
}

accounts.makeSoleAdmin(row.id);
accounts.close();
console.log(`"${row.nickname}" is now the only administrator.`);
console.log(`Account id: ${row.id}`);
if (ADMIN_ACCOUNT_ID && ADMIN_ACCOUNT_ID !== row.id) {
  console.log('Note: ADMIN_ACCOUNT_ID is set to a different account and takes precedence over this.');
}
