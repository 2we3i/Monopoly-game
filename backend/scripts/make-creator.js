// make-creator.js
// Makes one account the Creator - the owner of the platform, with full
// control from the panel. Run on the server itself:
//
//   npm run make-creator -- <nickname>
//
// Other creators keep their role (appoint or remove them from the panel).
// Where the database is not reachable from a shell, set CREATOR_ACCOUNT_ID
// to the account's id (or several, comma-separated) instead.

const accounts = require('../src/db/accounts');

const nickname = process.argv.slice(2).join(' ').trim();
if (!nickname) {
  console.error('Usage: npm run make-creator -- <nickname>');
  process.exit(1);
}

const row = accounts.findByNickname(nickname);
if (!row) {
  console.error(`No account named "${nickname}". Register it first, then run this again.`);
  process.exit(1);
}

accounts.setRole(row.id, 'creator', 'make-creator');
accounts.close();
console.log(`"${row.nickname}" is now the Creator.`);
console.log(`Account id: ${row.id}`);
