// Tests of the economy and the social layer: the catalogue's sanity,
// mention parsing (@ and @@), wallets, the shop and equipping, match
// rewards (places, streaks, achievements, idempotency, anti-farming),
// private and group conversations, notifications, room chat emotes and
// mentions, the REST locks, and delivery over the messenger socket.

process.env.ECONOMY_MIN_MATCH_MS = '0';
const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const catalog = require('../src/economy/catalog');
const rules = require('../src/economy/rules');
const economy = require('../src/economy/service');
const community = require('../src/db/community');
const platformDb = require('../src/db/platform');
const accountsDb = require('../src/db/accounts');
const messages = require('../src/social/messages');
const roomChat = require('../src/social/roomChat');
const { findMentions } = require('../src/social/mentions');
const presence = require('../src/platform/presence');
const economyRoutes = require('../src/routes/economy');
const socialRoutes = require('../src/routes/social');
const { router: authRoutes } = require('../src/routes/authRoutes');
const { registerSocketHandlers } = require('../src/socket/socketHandler');

const PORT = 4012;
const URL = `http://localhost:${PORT}`;

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function expectThrow(fn, code, msg) {
  try {
    await fn();
  } catch (err) {
    assert(err.code === code, `${msg}: expected ${code}, got ${err.code} (${err.message})`);
    return;
  }
  throw new Error(`ASSERTION FAILED: ${msg}: expected an error ${code}`);
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function credit(accountId, amount, ref) {
  community.applyLedger({ accountId, amount, kind: 'test_grant', ref });
}

// A finished match written the same way the recorder writes one.
let roomSeq = 0;
function playMatch({ gameType = 'monopoly', seats }) {
  roomSeq += 1;
  const roomCode = `T${roomSeq}`;
  const players = seats.map((s, i) => ({ playerId: s.playerId || s.accountId || `guest-${roomSeq}-${i}`, accountId: s.accountId || null, nickname: s.nickname || `p${i}` }));
  const matchId = platformDb.startMatch({
    roomCode, gameType, modeId: `${gameType}.classic`, startedAt: Date.now() - 5 * 60 * 1000, players,
  });
  const results = {
    winner: players[0].nickname,
    players: players.map((p, i) => ({
      playerId: p.playerId, result: seats[i].result || (i === 0 ? 'win' : 'loss'), place: seats[i].place ?? null,
    })),
  };
  platformDb.finishMatch(matchId, results);
  return economy.onMatchFinished(matchId, { players, results });
}

function eventFactor() {
  return rules.activeEvents().reduce((m, e) => m * e.multiplier, 1);
}

function matchCrowns(base) {
  const f = eventFactor();
  return base + (f > 1 ? Math.round(base * (f - 1)) : 0);
}

async function main() {
  console.log('Community tests');

  // --- catalogue ------------------------------------------------------------
  await test('catalogue: unique ids, valid slots, prices inside rarity bands', async () => {
    const ids = new Set();
    catalog.ITEMS.forEach((item) => {
      assert(!ids.has(item.id), `duplicate id ${item.id}`);
      ids.add(item.id);
      assert(catalog.SLOTS[item.slot], `bad slot ${item.slot}`);
      assert(catalog.RARITIES.includes(item.rarity), `bad rarity ${item.rarity}`);
      assert(item.name.en && item.name.ru, `names for ${item.id}`);
      if (item.source === 'shop') {
        const [lo, hi] = catalog.PRICE_BANDS[item.rarity];
        assert(item.price >= lo && item.price <= hi, `${item.id} price ${item.price} outside ${item.rarity} band`);
      } else {
        assert(item.price === null, `earned item ${item.id} must not have a price`);
        assert(item.source === 'starter' || item.requirement, `earned item ${item.id} needs a requirement`);
      }
    });
    catalog.CATEGORIES.forEach((c) => assert(catalog.ITEMS.some((i) => i.category === c), `category ${c} has items`));
    catalog.RARITIES.forEach((r) => assert(catalog.ITEMS.some((i) => i.rarity === r && i.source === 'shop'), `rarity ${r} sold in shop`));
  });

  // --- mentions ---------------------------------------------------------------
  await test('mentions: @name matches whole names, longest first, never @@', async () => {
    const people = [
      { accountId: 'a', nickname: 'Anna' },
      { accountId: 'b', nickname: 'Anna Maria' },
      { accountId: 'c', nickname: 'Bob' },
    ];
    const ids = (text) => findMentions(text, people).map((m) => m.accountId).sort().join(',');
    assert(ids('hi @Anna Maria!') === 'b', 'longest name wins');
    assert(ids('@anna and @BOB') === 'a,c', 'case-insensitive, several mentions');
    assert(ids('mail@Anna.com') === '', 'not inside a word');
    assert(ids('@Annabelle') === '', 'not a prefix of a longer word');
    assert(ids('@@Bob hello') === '', '@@ is group syntax, not a mention');
    assert(ids('no mention here') === '', 'no @ at all');
  });

  const alice = registerAccount('Alice');
  const bob = registerAccount('Bobby');
  const carol = registerAccount('Carol');
  const dave = registerAccount('Dave');

  // --- wallet and shop ----------------------------------------------------------
  await test('shop: starter items owned, buying checks balance, ownership and sale status', async () => {
    const own = economy.accountEconomy(alice.id);
    assert(own.wallet.balance === 0, 'new wallet is empty');
    assert(own.inventory.some((i) => i.itemId === 'emote_wave'), 'starter emote granted');
    await expectThrow(() => economy.buy(alice.id, 'badge_clover'), 'INSUFFICIENT_FUNDS', 'cannot buy without crowns');
    assert(!community.ownsItem(alice.id, 'badge_clover'), 'failed purchase grants nothing');
    assert(community.wallet(alice.id).balance === 0, 'failed purchase charges nothing');

    credit(alice.id, 1000, 'shop-1');
    const res = economy.buy(alice.id, 'badge_clover');
    assert(res.wallet.balance === 1000 - 80, 'price deducted');
    assert(community.ownsItem(alice.id, 'badge_clover'), 'item in inventory');
    await expectThrow(() => economy.buy(alice.id, 'badge_clover'), 'ALREADY_OWNED', 'cannot buy twice');
    await expectThrow(() => economy.buy(alice.id, 'title_champion'), 'NOT_FOR_SALE', 'earned items are not sold');
    await expectThrow(() => economy.buy(alice.id, 'nope'), 'UNKNOWN_ITEM', 'unknown item');
    const purchase = community.listNotifications(alice.id).find((n) => n.type === 'purchase');
    assert(purchase && purchase.payload.itemId === 'badge_clover', 'purchase notification');
  });

  await test('equip: must own, single slots replace, badges hold three', async () => {
    await expectThrow(() => economy.equip(alice.id, 'badge_gem'), 'NOT_OWNED', 'cannot equip unowned');
    credit(alice.id, 5000, 'equip-1');
    ['badge_target', 'badge_moon', 'badge_gem', 'name_style_brass', 'name_style_emerald'].forEach((id) => economy.buy(alice.id, id));
    economy.equip(alice.id, 'name_style_brass');
    economy.equip(alice.id, 'name_style_emerald');
    assert(economy.loadout(alice.id).name_style === 'name_style_emerald', 'single slot replaced');
    ['badge_clover', 'badge_target', 'badge_moon'].forEach((id) => economy.equip(alice.id, id));
    assert(economy.loadout(alice.id).badge.length === 3, 'three badges');
    economy.equip(alice.id, 'badge_gem');
    const badges = economy.loadout(alice.id).badge;
    assert(badges.length === 3 && badges.includes('badge_gem') && !badges.includes('badge_clover'), 'oldest badge dropped');
    economy.unequip(alice.id, 'badge_moon');
    assert(economy.loadout(alice.id).badge.length === 2, 'unequip removes');
    assert(economy.cosmeticIds(alice.id).name_style === 'name_style_emerald', 'visible cosmetics');
    economy.equip(alice.id, 'emote_wave');
    assert(!economy.cosmeticIds(alice.id).emote, 'emotes are not broadcast as looks');
  });

  // --- rewards ------------------------------------------------------------------
  await test('rewards: places pay by table size, guests earn nothing, paid once', async () => {
    const before = (id) => community.wallet(id).balance;
    const b0 = before(bob.id);
    const c0 = before(carol.id);
    const d0 = before(dave.id);
    const out = playMatch({
      seats: [
        { accountId: bob.id, place: 1 },
        { accountId: carol.id, place: 2 },
        { accountId: dave.id, place: 3 },
        { place: 4 },
      ],
    });
    assert(out.length === 3, 'three registered seats rewarded');
    const R = rules.MATCH_REWARDS;
    // First win of the day and first-game/first-win achievements come on top.
    const bobMatch = matchCrowns(R.participation + R.place[1]);
    const bobReward = out.find((o) => o.accountId === bob.id).reward;
    assert(bobReward.amount === bobMatch + R.firstWinOfDay, `winner reward ${bobReward.amount}`);
    assert(out.find((o) => o.accountId === carol.id).reward.amount === matchCrowns(R.participation + R.place[2]), 'second place');
    assert(out.find((o) => o.accountId === dave.id).reward.amount === matchCrowns(R.participation + R.place[3]), 'third place');
    const bobAch = out.find((o) => o.accountId === bob.id).achievements.map((a) => a.id).sort().join(',');
    assert(bobAch === 'FIRST_GAME,FIRST_WIN', `achievements paid: ${bobAch}`);
    const expectedBob = bobMatch + R.firstWinOfDay + rules.ACHIEVEMENT_REWARDS.FIRST_GAME + rules.ACHIEVEMENT_REWARDS.FIRST_WIN;
    assert(before(bob.id) - b0 === expectedBob, `bob balance +${before(bob.id) - b0} expected +${expectedBob}`);
    assert(community.ownsItem(bob.id, 'title_winner'), 'FIRST_WIN grants the Winner title');
    assert(community.ownsItem(bob.id, 'badge_first_game'), 'FIRST_GAME grants a badge');
    assert(before(carol.id) > c0 && before(dave.id) > d0, 'podium paid');
    const types = community.listNotifications(bob.id).map((n) => n.type);
    ['reward', 'win', 'achievement', 'item_granted'].forEach((t) => assert(types.includes(t), `bob notified: ${t}`));
    assert(community.listNotifications(carol.id).some((n) => n.type === 'podium' && n.payload.place === 2), 'carol podium notification');

    // Recording the same match again pays nothing more.
    const matchId = Number(community.ledgerFor(bob.id, 50).find((l) => l.kind === 'match').ref);
    const again = economy.onMatchFinished(matchId, { players: [{ playerId: bob.id, accountId: bob.id }], results: { players: [{ playerId: bob.id, place: 1 }] } });
    assert(again[0].reward === null, 'no second reward for one match');
  });

  await test('rewards: two-player tables pay less, fourth place is not a podium', async () => {
    const R = rules.MATCH_REWARDS;
    const out = playMatch({ seats: [{ accountId: carol.id, place: 1 }, { accountId: dave.id, place: 2 }] });
    const carolReward = out.find((o) => o.accountId === carol.id).reward;
    assert(carolReward.breakdown.place === Math.round(R.place[1] * 0.6), 'two-player multiplier');
    assert(out.find((o) => o.accountId === dave.id).reward.breakdown.place === undefined, 'second of two is not a podium');
    assert(rules.podiumPlace(4, 8) === null && rules.podiumPlace(3, 3) === null && rules.podiumPlace(3, 4) === 3, 'podium rules');
  });

  await test('rewards: team wins, win streaks and streak items', async () => {
    const streakPlayer = registerAccount('Streaker');
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(playMatch({ gameType: 'mafia', seats: [{ accountId: streakPlayer.id, result: 'win' }, { result: 'loss' }, { result: 'loss' }, { result: 'loss' }] })[0]);
    }
    assert(results[0].reward.breakdown.win === rules.MATCH_REWARDS.teamWin, 'team win reward');
    assert(results[2].streak && results[2].streak.streak === 3, 'three-win streak bonus');
    assert(results[4].streak && results[4].streak.streak === 5, 'five-win streak bonus');
    assert(community.ownsItem(streakPlayer.id, 'badge_streak_3'), 'streak 3 badge');
    assert(community.ownsItem(streakPlayer.id, 'title_unstoppable') && community.ownsItem(streakPlayer.id, 'badge_on_fire'), 'streak 5 items');
    assert(!community.ownsItem(streakPlayer.id, 'name_style_inferno'), 'streak 10 item not yet');
    playMatch({ gameType: 'mafia', seats: [{ accountId: streakPlayer.id, result: 'loss' }, { result: 'win' }] });
    assert(community.wallet(streakPlayer.id).winStreak === 0, 'a loss resets the streak');
    assert(community.wallet(streakPlayer.id).bestStreak === 5, 'best streak kept');
  });

  await test('rewards: short matches and the daily cap pay no match crowns', async () => {
    const farmer = registerAccount('Farmer');
    const saved = rules.MIN_MATCH_MS;
    rules.MIN_MATCH_MS = 10 * 60 * 1000;
    const short = playMatch({ seats: [{ accountId: farmer.id, place: 1 }, { place: 2 }, { place: 3 }] })[0];
    rules.MIN_MATCH_MS = saved;
    assert(short.skipped === 'too_short' && short.reward === null, 'too short');
    for (let i = 0; i < rules.DAILY_REWARDED_MATCHES; i += 1) credit(farmer.id, 0, `noop-${i}`);
    for (let i = 0; i < rules.DAILY_REWARDED_MATCHES; i += 1) {
      community.applyLedger({ accountId: farmer.id, amount: 1, kind: 'match', ref: `fake-${i}` });
    }
    const capped = playMatch({ seats: [{ accountId: farmer.id, place: 1 }, { place: 2 }, { place: 3 }] })[0];
    assert(capped.skipped === 'daily_cap' && capped.reward === null, 'daily cap');
  });

  await test('leaderboard: season ranking, claim needs enough games', async () => {
    const board = economy.leaderboard('season', bob.id);
    assert(board.rows.length > 0 && board.rows[0].rank === 1, 'ranked rows');
    assert(board.rows.every((r, i) => i === 0 || board.rows[i - 1].points >= r.points), 'sorted by points');
    assert(board.me && board.me.accountId === bob.id, 'viewer row');
    await expectThrow(() => economy.claimLeaderboardRewards(dave.id), 'NOT_ELIGIBLE', 'claim needs five games');
  });

  // --- room chat --------------------------------------------------------------
  await test('room chat: mentions resolve to room players, emotes must be owned', async () => {
    const players = [
      { id: alice.id, accountId: alice.id, nickname: 'Alice' },
      { id: bob.id, accountId: bob.id, nickname: 'Bobby' },
      { id: 'guest-1', accountId: null, nickname: 'Guesty' },
    ];
    const msg = roomChat.prepareRoomMessage({ text: 'gg @Bobby and @Guesty', sender: players[0], players });
    assert(msg.mentions.length === 2, 'two mentions');
    assert(msg.cosmetics && msg.cosmetics.name_style === 'name_style_emerald', 'sender name style attached');
    const before = community.listNotifications(bob.id).filter((n) => n.type === 'mention').length;
    roomChat.notifyMentions(msg, { players, context: { kind: 'room', gameType: 'monopoly', roomCode: 'X' } });
    const after = community.listNotifications(bob.id).filter((n) => n.type === 'mention');
    assert(after.length === before + 1 && after[0].payload.from.nickname === 'Alice', 'mentioned account notified');
    roomChat.notifyMentions(msg, { players, context: {} });
    assert(community.listNotifications(bob.id).filter((n) => n.type === 'mention').length === before + 1, 'mention cooldown');

    const secret = roomChat.prepareRoomMessage({ text: '@Bobby shh', sender: { ...players[0], id: 'other-sender' }, players });
    roomChat.notifyMentions(secret, { players, canRead: () => false, context: {} });
    assert(community.listNotifications(bob.id).filter((n) => n.type === 'mention').length === before + 1, 'no notification when the target cannot read');

    assert(roomChat.prepareRoomMessage({ text: '', emote: 'emote_wave', sender: players[0], players }).emote === 'emote_wave', 'starter emote allowed');
    assert(roomChat.prepareRoomMessage({ text: '', emote: 'emote_dragon', sender: players[0], players }) === null, 'unowned emote dropped');
    assert(roomChat.prepareRoomMessage({ text: '', emote: 'emote_wave', sender: players[2], players }) === null, 'guests have no emotes');
  });

  // --- conversations ------------------------------------------------------------
  await test('messages: direct and group conversations, members only, receipts, unread', async () => {
    const direct = messages.openConversation(alice.id, [bob.id]);
    assert(direct.kind === 'direct' && direct.members.length === 2, 'direct conversation');
    assert(messages.openConversation(bob.id, [alice.id]).id === direct.id, 'same pair, same conversation');
    await expectThrow(() => messages.openConversation(alice.id, [alice.id]), 'NO_RECIPIENTS', 'cannot message only yourself');
    await expectThrow(() => messages.openConversation(alice.id, ['missing']), 'UNKNOWN_USER', 'unknown recipient');

    const sent = messages.send(alice.id, direct.id, '  Hello @Bobby!  ');
    assert(sent.message.body === 'Hello @Bobby!', 'body cleaned');
    assert(sent.message.mentions.length === 1 && sent.message.mentions[0].accountId === bob.id, 'mention stored');
    await expectThrow(() => messages.messages(carol.id, direct.id), 'NOT_FOUND', 'non-members cannot read');
    await expectThrow(() => messages.send(carol.id, direct.id, 'hi'), 'NOT_FOUND', 'non-members cannot write');
    await expectThrow(() => messages.send(alice.id, direct.id, '   '), 'EMPTY', 'empty message');

    assert(community.unreadMessageTotal(bob.id) === 1, 'bob has one unread');
    const bobNotes = community.listNotifications(bob.id);
    assert(bobNotes.some((n) => n.type === 'direct_message') && bobNotes.some((n) => n.type === 'mention' && n.payload.context.kind === 'conversation'), 'dm + mention notifications');
    messages.send(alice.id, direct.id, 'second');
    const grouped = community.listNotifications(bob.id).filter((n) => n.type === 'direct_message' && !n.read);
    assert(grouped.length === 1 && grouped[0].count === 2, 'dm notifications grouped per conversation');

    const page = messages.messages(bob.id, direct.id);
    assert(page.messages.length === 2 && page.messages[0].body === 'Hello @Bobby!', 'history in order');
    messages.markRead(bob.id, direct.id, page.messages[1].id);
    assert(community.unreadMessageTotal(bob.id) === 0, 'read clears unread');
    assert(!community.listNotifications(bob.id).some((n) => n.type === 'direct_message' && !n.read), 'read clears the dm notification');
    const aliceView = messages.listConversations(alice.id).find((c) => c.id === direct.id);
    assert(aliceView.members.find((m) => m.id === bob.id).lastReadId === page.messages[1].id, 'read receipt visible to sender');

    const group = messages.sendToGroup(alice.id, [bob.id, carol.id], 'team meeting');
    assert(group.conversation.kind === 'group' && group.conversation.members.length === 3, 'group conversation');
    assert(messages.sendToGroup(alice.id, [carol.id, bob.id], 'again').conversation.id === group.conversation.id, 'same set reuses group');
    assert(community.listNotifications(carol.id).some((n) => n.type === 'group_message'), 'group notification');

    const blockedRow = registerAccount('Blocked One');
    accountsDb.blockAccount(blockedRow.id, { reason: 'test', adminId: 'x', adminName: 'x' });
    await expectThrow(() => messages.openConversation(alice.id, [blockedRow.id]), 'USER_BLOCKED', 'blocked players receive nothing');
    assert(!messages.searchUsers('Blocked', alice.id).length, 'blocked players hidden from search');
    assert(messages.searchUsers('bob', alice.id)[0].id === bob.id, 'search by nickname');
  });

  // --- HTTP and sockets ---------------------------------------------------------
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/economy', economyRoutes);
  app.use('/api/social', socialRoutes);
  const server = http.createServer(app);
  const io = new Server(server);
  presence.attach(io);
  registerSocketHandlers(io);
  await new Promise((r) => server.listen(PORT, r));

  const api = async (path, { method = 'GET', token, body } = {}) => {
    const res = await fetch(`${URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  try {
    await test('http: locks, catalogue, public profile, notification centre', async () => {
      assert((await api('/api/economy/buy', { method: 'POST', body: { itemId: 'badge_gem' } })).status === 401, 'buy needs login');
      assert((await api('/api/social/conversations')).status === 401, 'messages need login');
      assert((await api('/api/social/notifications')).status === 401, 'notifications need login');
      const cat = await api('/api/economy/catalog');
      assert(cat.status === 200 && cat.data.items.length === catalog.ITEMS.length, 'public catalogue');

      const buy = await api('/api/economy/buy', { method: 'POST', token: carol.token, body: { itemId: 'badge_dragon' } });
      assert(buy.status === 402 && buy.data.code === 'INSUFFICIENT_FUNDS', 'server checks balance');
      const equip = await api('/api/economy/equip', { method: 'POST', token: carol.token, body: { itemId: 'avatar_frame_phoenix' } });
      assert(equip.status === 403 && equip.data.code === 'NOT_OWNED', 'server checks ownership');

      const profile = await api(`/api/social/users/${alice.id}`);
      assert(profile.status === 200 && profile.data.player.nickname === 'Alice', 'public profile');
      assert(profile.data.loadout.name_style === 'name_style_emerald', 'profile shows equipped looks');
      const raw = JSON.stringify(profile.data);
      ['password', 'blocked_reason', 'ledger', 'inventory', 'favorites'].forEach((k) => assert(!raw.includes(k), `profile must not contain ${k}`));

      const stats = await api('/api/auth/me/stats', { token: bob.token });
      assert(stats.status === 200 && stats.data.economy.wallet.balance === community.wallet(bob.id).balance, 'profile stats include wallet');
      assert(stats.data.recentWins.length >= 1, 'win history');

      const list = await api('/api/social/notifications', { token: bob.token });
      assert(list.status === 200 && list.data.notifications.length > 0, 'notification list');
      const one = list.data.notifications.find((n) => !n.read);
      if (one) await api(`/api/social/notifications/${one.id}/read`, { method: 'POST', token: bob.token });
      const all = await api('/api/social/notifications/read-all', { method: 'POST', token: bob.token });
      assert(all.data.unread === 0 && community.unreadNotificationCount(bob.id) === 0, 'read all');
      await api('/api/social/notifications', { method: 'DELETE', token: bob.token });
      assert(community.listNotifications(bob.id).length === 0, 'clear all');

      const other = await api(`/api/social/conversations/${messages.openConversation(alice.id, [bob.id]).id}/messages`, { token: carol.token });
      assert(other.status === 404, 'a stranger cannot open a conversation by id');
    });

    await test('socket: messenger channel receives messages, receipts and notifications live', async () => {
      const social = ioClient(URL, { transports: ['websocket'], auth: { token: dave.token, channel: 'social' } });
      const game = ioClient(URL, { transports: ['websocket'], auth: { token: carol.token } });
      await Promise.all([social, game].map((s) => new Promise((r) => s.on('connect', r))));
      let gameSocketGotDm = false;
      game.on('dm:message', () => { gameSocketGotDm = true; });
      const got = new Promise((resolve) => social.on('dm:message', resolve));
      const note = new Promise((resolve) => social.on('notification:new', resolve));
      const res = await api('/api/social/group', { method: 'POST', token: alice.token, body: { recipientIds: [dave.id, carol.id], body: 'live @Dave' } });
      assert(res.status === 200, 'group send over http');
      const payload = await got;
      assert(payload.message.body === 'live @Dave', 'message delivered live');
      const n = await note;
      assert(['group_message', 'mention'].includes(n.notification.type) && n.unread > 0, 'notification pushed');
      const conv = messages.listConversations(alice.id).find((c) => c.id === payload.conversation.id);
      assert(conv.members.find((m) => m.id === dave.id).lastDeliveredId === payload.message.id, 'delivered to an open messenger');
      assert(conv.members.find((m) => m.id === carol.id).lastDeliveredId < payload.message.id, 'not delivered without a messenger');
      assert(!gameSocketGotDm, 'game sockets do not carry messenger traffic');
      social.close();
      game.close();
    });

    await test('socket: Monopoly room chat carries mentions, emotes and cosmetics', async () => {
      const host = ioClient(URL, { transports: ['websocket'], auth: { token: alice.token } });
      const guest = ioClient(URL, { transports: ['websocket'] });
      await Promise.all([host, guest].map((s) => new Promise((r) => s.on('connect', r))));
      const created = await new Promise((r) => host.emit('room:create', { nickname: 'Alice', token: alice.token, modeId: 'classic' }, r));
      assert(created.ok, `room created: ${created.error}`);
      assert(created.state.players[0].cosmetics.name_style === 'name_style_emerald', 'cosmetics in room state');
      const joined = await new Promise((r) => guest.emit('room:join', {
        roomCode: created.roomCode, nickname: 'Visitor', playerId: 'guest-visitor-1', guestKey: 'k'.repeat(32),
      }, r));
      assert(joined.ok, `guest joined: ${joined.error}`);
      const received = new Promise((resolve) => guest.on('chat:message', resolve));
      host.emit('chat:message', { text: 'welcome @Visitor', emote: 'emote_wave' });
      const msg = await received;
      assert(msg.mentions.length === 1 && msg.mentions[0].playerId === 'guest-visitor-1', 'guest mention resolved');
      assert(msg.emote === 'emote_wave' && msg.accountId === alice.id, 'emote and sender account');
      const spoof = new Promise((resolve) => guest.once('chat:message', resolve));
      guest.emit('chat:message', { text: 'fake', emote: 'emote_wave' });
      assert((await spoof).emote === null, 'a guest cannot send an emote');
      host.close();
      guest.close();
    });
  } finally {
    io.close();
    server.close();
  }

  console.log(`\nCommunity tests: ${passed} passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
