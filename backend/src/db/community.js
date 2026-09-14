// community.js
// Storage for everything around the games: wallets and the crown ledger,
// owned and equipped cosmetics, favourites, notifications and private
// conversations. It shares platform.db with the match history, so a match
// result and the reward it pays can be written in one transaction.
//
// Only data access lives here. The rules (what a match pays, who may
// message whom) live in economy/ and social/.

const { connection: db } = require('./platform');

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    account_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    earned INTEGER NOT NULL DEFAULT 0,
    spent INTEGER NOT NULL DEFAULT 0,
    win_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER
  );

  -- Every change to a balance. (account, kind, ref) is unique, which is
  -- what makes a reward impossible to pay twice.
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    details_json TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (account_id, kind, ref)
  );
  CREATE INDEX IF NOT EXISTS ledger_account ON ledger(account_id, created_at);

  CREATE TABLE IF NOT EXISTS inventory (
    account_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    source TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS equipped (
    account_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    item_id TEXT NOT NULL,
    equipped_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, slot, position)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    account_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (account_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    type TEXT NOT NULL,
    group_key TEXT,
    payload_json TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    read_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notifications_account ON notifications(account_id, id);

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    member_key TEXT NOT NULL UNIQUE,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    last_message_id INTEGER,
    last_message_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    last_delivered_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS members_account ON conversation_members(account_id);

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    mentions_json TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
`);

const now = () => Date.now();

// --- wallets ---------------------------------------------------------------

const ensureWalletStmt = db.prepare('INSERT OR IGNORE INTO wallets (account_id, updated_at) VALUES (?, ?)');
const walletStmt = db.prepare('SELECT * FROM wallets WHERE account_id = ?');
const insertLedgerStmt = db.prepare(`
  INSERT OR IGNORE INTO ledger (account_id, amount, kind, ref, details_json, created_at)
  VALUES (@accountId, @amount, @kind, @ref, @detailsJson, @createdAt)
`);
const creditStmt = db.prepare(`
  UPDATE wallets SET balance = balance + @amount, earned = earned + @earned, spent = spent + @spent, updated_at = @at
  WHERE account_id = @accountId
`);
const setStreakStmt = db.prepare(`
  UPDATE wallets SET win_streak = @streak, best_streak = MAX(best_streak, @streak), updated_at = @at WHERE account_id = @accountId
`);
const ledgerForStmt = db.prepare('SELECT * FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT ?');
const ledgerHasStmt = db.prepare('SELECT 1 FROM ledger WHERE account_id = ? AND kind = ? AND ref = ?');
const ledgerCountSinceStmt = db.prepare('SELECT COUNT(*) n FROM ledger WHERE account_id = ? AND kind = ? AND created_at >= ?');

function ensureWallet(accountId) {
  ensureWalletStmt.run(accountId, now());
}

function wallet(accountId) {
  ensureWallet(accountId);
  const row = walletStmt.get(accountId);
  return {
    balance: row.balance,
    earned: row.earned,
    spent: row.spent,
    winStreak: row.win_streak,
    bestStreak: row.best_streak,
  };
}

// Applies one ledger entry. Returns false (and changes nothing) when an
// entry with the same (kind, ref) already exists, or when a debit would
// take the balance below zero. Must run inside a transaction when it is
// one step of a larger change.
function applyLedger({ accountId, amount, kind, ref, details = null }) {
  ensureWallet(accountId);
  if (amount < 0 && walletStmt.get(accountId).balance + amount < 0) return false;
  const { changes } = insertLedgerStmt.run({
    accountId, amount, kind, ref: String(ref), detailsJson: details ? JSON.stringify(details) : null, createdAt: now(),
  });
  if (!changes) return false;
  creditStmt.run({
    accountId, amount, earned: amount > 0 ? amount : 0, spent: amount < 0 ? -amount : 0, at: now(),
  });
  return true;
}

function setStreak(accountId, streak) {
  ensureWallet(accountId);
  setStreakStmt.run({ accountId, streak, at: now() });
}

function ledgerFor(accountId, limit = 30) {
  return ledgerForStmt.all(accountId, limit).map((r) => ({
    id: r.id,
    amount: r.amount,
    kind: r.kind,
    ref: r.ref,
    details: r.details_json ? JSON.parse(r.details_json) : null,
    createdAt: r.created_at,
  }));
}

function ledgerHas(accountId, kind, ref) {
  return !!ledgerHasStmt.get(accountId, kind, String(ref));
}

function ledgerCountSince(accountId, kind, since) {
  return ledgerCountSinceStmt.get(accountId, kind, since).n;
}

// --- inventory -------------------------------------------------------------

const ownStmt = db.prepare('INSERT OR IGNORE INTO inventory (account_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)');
const ownsStmt = db.prepare('SELECT 1 FROM inventory WHERE account_id = ? AND item_id = ?');
const inventoryStmt = db.prepare('SELECT * FROM inventory WHERE account_id = ? ORDER BY acquired_at DESC');
const equippedStmt = db.prepare('SELECT * FROM equipped WHERE account_id = ? ORDER BY slot, position');
const equipStmt = db.prepare(`
  INSERT INTO equipped (account_id, slot, position, item_id, equipped_at) VALUES (@accountId, @slot, @position, @itemId, @at)
  ON CONFLICT(account_id, slot, position) DO UPDATE SET item_id = excluded.item_id, equipped_at = excluded.equipped_at
`);
const unequipStmt = db.prepare('DELETE FROM equipped WHERE account_id = ? AND item_id = ?');
const favoritesStmt = db.prepare('SELECT item_id FROM favorites WHERE account_id = ?');
const addFavoriteStmt = db.prepare('INSERT OR IGNORE INTO favorites (account_id, item_id) VALUES (?, ?)');
const removeFavoriteStmt = db.prepare('DELETE FROM favorites WHERE account_id = ? AND item_id = ?');

function grantItem(accountId, itemId, source) {
  return ownStmt.run(accountId, itemId, source, now()).changes > 0;
}

function ownsItem(accountId, itemId) {
  return !!ownsStmt.get(accountId, itemId);
}

function inventory(accountId) {
  return inventoryStmt.all(accountId).map((r) => ({ itemId: r.item_id, source: r.source, acquiredAt: r.acquired_at }));
}

function equipped(accountId) {
  return equippedStmt.all(accountId).map((r) => ({
    slot: r.slot, position: r.position, itemId: r.item_id, equippedAt: r.equipped_at,
  }));
}

function equipAt(accountId, slot, position, itemId) {
  equipStmt.run({
    accountId, slot, position, itemId, at: now(),
  });
}

function unequip(accountId, itemId) {
  return unequipStmt.run(accountId, itemId).changes > 0;
}

// Several positions of one slot (badges, emotes) are compacted so the
// equipped list never has holes.
const compactSlot = db.transaction((accountId, slot) => {
  const rows = equippedStmt.all(accountId).filter((r) => r.slot === slot);
  db.prepare('DELETE FROM equipped WHERE account_id = ? AND slot = ?').run(accountId, slot);
  rows.forEach((r, i) => equipStmt.run({
    accountId, slot, position: i, itemId: r.item_id, at: r.equipped_at,
  }));
});

function favorites(accountId) {
  return favoritesStmt.all(accountId).map((r) => r.item_id);
}

function setFavorite(accountId, itemId, on) {
  if (on) addFavoriteStmt.run(accountId, itemId);
  else removeFavoriteStmt.run(accountId, itemId);
}

// --- notifications ---------------------------------------------------------

const insertNotificationStmt = db.prepare(`
  INSERT INTO notifications (account_id, type, group_key, payload_json, created_at)
  VALUES (@accountId, @type, @groupKey, @payloadJson, @createdAt)
`);
const unreadGroupStmt = db.prepare('SELECT * FROM notifications WHERE account_id = ? AND group_key = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1');
const bumpGroupStmt = db.prepare('UPDATE notifications SET payload_json = ?, count = count + 1, created_at = ? WHERE id = ?');
const notificationByIdStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
const listNotificationsStmt = db.prepare('SELECT * FROM notifications WHERE account_id = ? AND id < ? ORDER BY id DESC LIMIT ?');
const unreadCountStmt = db.prepare('SELECT COUNT(*) n FROM notifications WHERE account_id = ? AND read_at IS NULL');
const readOneStmt = db.prepare('UPDATE notifications SET read_at = ? WHERE account_id = ? AND id = ? AND read_at IS NULL');
const readAllStmt = db.prepare('UPDATE notifications SET read_at = ? WHERE account_id = ? AND read_at IS NULL');
const readGroupStmt = db.prepare('UPDATE notifications SET read_at = ? WHERE account_id = ? AND group_key = ? AND read_at IS NULL');
const clearStmt = db.prepare('DELETE FROM notifications WHERE account_id = ?');
const pruneStmt = db.prepare(`
  DELETE FROM notifications WHERE account_id = ? AND id NOT IN (
    SELECT id FROM notifications WHERE account_id = ? ORDER BY id DESC LIMIT 300
  )
`);

function notificationRow(r) {
  return {
    id: r.id,
    type: r.type,
    groupKey: r.group_key,
    payload: r.payload_json ? JSON.parse(r.payload_json) : {},
    count: r.count,
    read: !!r.read_at,
    createdAt: r.created_at,
  };
}

// A notification with a group key (for example "new messages in this
// conversation") is merged into the unread one already waiting, so a
// busy chat is one entry with a count rather than a flood.
const addNotification = db.transaction(({ accountId, type, groupKey = null, payload = {} }) => {
  const at = now();
  if (groupKey) {
    const existing = unreadGroupStmt.get(accountId, groupKey);
    if (existing) {
      bumpGroupStmt.run(JSON.stringify(payload), at, existing.id);
      return notificationRow(notificationByIdStmt.get(existing.id));
    }
  }
  const { lastInsertRowid } = insertNotificationStmt.run({
    accountId, type, groupKey, payloadJson: JSON.stringify(payload), createdAt: at,
  });
  pruneStmt.run(accountId, accountId);
  return notificationRow(notificationByIdStmt.get(Number(lastInsertRowid)));
});

function listNotifications(accountId, { before = Number.MAX_SAFE_INTEGER, limit = 30 } = {}) {
  return listNotificationsStmt.all(accountId, before, limit).map(notificationRow);
}

function unreadNotificationCount(accountId) {
  return unreadCountStmt.get(accountId).n;
}

function markNotificationRead(accountId, id) {
  return readOneStmt.run(now(), accountId, id).changes > 0;
}

function markAllNotificationsRead(accountId) {
  return readAllStmt.run(now(), accountId).changes;
}

function markGroupRead(accountId, groupKey) {
  return readGroupStmt.run(now(), accountId, groupKey).changes;
}

function clearNotifications(accountId) {
  return clearStmt.run(accountId).changes;
}

// --- conversations ---------------------------------------------------------

const conversationByKeyStmt = db.prepare('SELECT * FROM conversations WHERE member_key = ?');
const conversationByIdStmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
const insertConversationStmt = db.prepare(`
  INSERT INTO conversations (kind, member_key, created_by, created_at) VALUES (@kind, @memberKey, @createdBy, @createdAt)
`);
const insertMemberStmt = db.prepare(`
  INSERT OR IGNORE INTO conversation_members (conversation_id, account_id, joined_at) VALUES (?, ?, ?)
`);
const membersStmt = db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ?');
const memberStmt = db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND account_id = ?');
const insertMessageStmt = db.prepare(`
  INSERT INTO messages (conversation_id, sender_id, body, mentions_json, created_at)
  VALUES (@conversationId, @senderId, @body, @mentionsJson, @createdAt)
`);
const touchConversationStmt = db.prepare('UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?');
const messageByIdStmt = db.prepare('SELECT * FROM messages WHERE id = ?');
const messagesPageStmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT ?');
const conversationsForStmt = db.prepare(`
  SELECT c.*, cm.last_read_id, cm.last_delivered_id,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.id > cm.last_read_id AND m.sender_id != cm.account_id) unread
  FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
  WHERE cm.account_id = ? AND c.last_message_id IS NOT NULL
  ORDER BY c.last_message_at DESC
  LIMIT ?
`);
const unreadTotalStmt = db.prepare(`
  SELECT COUNT(*) n FROM conversation_members cm JOIN messages m ON m.conversation_id = cm.conversation_id
  WHERE cm.account_id = ? AND m.id > cm.last_read_id AND m.sender_id != cm.account_id
`);
const markReadStmt = db.prepare(`
  UPDATE conversation_members SET last_read_id = MAX(last_read_id, @upTo), last_delivered_id = MAX(last_delivered_id, @upTo)
  WHERE conversation_id = @conversationId AND account_id = @accountId
`);
const markDeliveredStmt = db.prepare(`
  UPDATE conversation_members SET last_delivered_id = MAX(last_delivered_id, @upTo)
  WHERE conversation_id = @conversationId AND account_id = @accountId
`);
const markDeliveredAllStmt = db.prepare(`
  UPDATE conversation_members SET last_delivered_id = COALESCE(
    (SELECT last_message_id FROM conversations c WHERE c.id = conversation_members.conversation_id), last_delivered_id)
  WHERE account_id = ?
`);

function memberKey(kind, accountIds) {
  return `${kind}:${[...new Set(accountIds)].sort().join(',')}`;
}

function conversationRow(c) {
  return c ? {
    id: c.id, kind: c.kind, createdBy: c.created_by, createdAt: c.created_at, lastMessageId: c.last_message_id, lastMessageAt: c.last_message_at,
  } : null;
}

const findOrCreateConversation = db.transaction((kind, accountIds, createdBy) => {
  const key = memberKey(kind, accountIds);
  let row = conversationByKeyStmt.get(key);
  if (!row) {
    const at = now();
    const { lastInsertRowid } = insertConversationStmt.run({
      kind, memberKey: key, createdBy, createdAt: at,
    });
    row = conversationByIdStmt.get(Number(lastInsertRowid));
    [...new Set(accountIds)].forEach((id) => insertMemberStmt.run(row.id, id, at));
  }
  return conversationRow(row);
});

function conversationById(id) {
  return conversationRow(conversationByIdStmt.get(id));
}

function members(conversationId) {
  return membersStmt.all(conversationId).map((m) => ({
    accountId: m.account_id, lastReadId: m.last_read_id, lastDeliveredId: m.last_delivered_id, joinedAt: m.joined_at,
  }));
}

function isMember(conversationId, accountId) {
  return !!memberStmt.get(conversationId, accountId);
}

function messageRow(m) {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    body: m.body,
    mentions: m.mentions_json ? JSON.parse(m.mentions_json) : [],
    createdAt: m.created_at,
  };
}

const addMessage = db.transaction(({ conversationId, senderId, body, mentions = [] }) => {
  const at = now();
  const { lastInsertRowid } = insertMessageStmt.run({
    conversationId, senderId, body, mentionsJson: mentions.length ? JSON.stringify(mentions) : null, createdAt: at,
  });
  const id = Number(lastInsertRowid);
  touchConversationStmt.run(id, at, conversationId);
  markReadStmt.run({ conversationId, accountId: senderId, upTo: id });
  return messageRow(messageByIdStmt.get(id));
});

function messagesPage(conversationId, { before = Number.MAX_SAFE_INTEGER, limit = 50 } = {}) {
  return messagesPageStmt.all(conversationId, before, limit).map(messageRow).reverse();
}

function messageById(id) {
  const m = messageByIdStmt.get(id);
  return m ? messageRow(m) : null;
}

function conversationsFor(accountId, limit = 100) {
  return conversationsForStmt.all(accountId, limit).map((c) => ({
    ...conversationRow(c),
    lastReadId: c.last_read_id,
    unread: c.unread,
  }));
}

function unreadMessageTotal(accountId) {
  return unreadTotalStmt.get(accountId).n;
}

function markConversationRead(conversationId, accountId, upTo) {
  markReadStmt.run({ conversationId, accountId, upTo });
}

function markConversationDelivered(conversationId, accountId, upTo) {
  markDeliveredStmt.run({ conversationId, accountId, upTo });
}

function markAllDelivered(accountId) {
  markDeliveredAllStmt.run(accountId);
}

module.exports = {
  transaction: (fn) => db.transaction(fn),
  // wallets
  ensureWallet,
  wallet,
  applyLedger,
  setStreak,
  ledgerFor,
  ledgerHas,
  ledgerCountSince,
  // inventory
  grantItem,
  ownsItem,
  inventory,
  equipped,
  equipAt,
  unequip,
  compactSlot,
  favorites,
  setFavorite,
  // notifications
  addNotification,
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  markGroupRead,
  clearNotifications,
  // conversations
  findOrCreateConversation,
  conversationById,
  members,
  isMember,
  addMessage,
  messagesPage,
  messageById,
  conversationsFor,
  unreadMessageTotal,
  markConversationRead,
  markConversationDelivered,
  markAllDelivered,
};
