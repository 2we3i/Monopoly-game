// End-to-end tests of the platform rules, over the real HTTP API and the
// real socket.io wire: who may create and start games, seat security,
// the admin API's lock, blocking, game-mode switches, match statistics,
// and the admin's lobby controls.

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const apiRoutes = require('../src/routes/api');
const adminRoutes = require('../src/routes/admin');
const { router: authRoutes } = require('../src/routes/authRoutes');
const presence = require('../src/platform/presence');
const { registerSocketHandlers } = require('../src/socket/socketHandler');
const { registerMafiaHandlers } = require('../src/socket/mafiaHandler');
const { registerCitadelsHandlers } = require('../src/socket/citadelsHandler');
const accountsDb = require('../src/db/accounts');
const roomManager = require('../src/game/RoomManager');

const PORT = 4011;
const URL = `http://localhost:${PORT}`;
const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
const server = http.createServer(app);
const io = new Server(server);
presence.attach(io);
registerSocketHandlers(io);
registerMafiaHandlers(io);
registerCitadelsHandlers(io);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function connect(token) {
  return new Promise((resolve) => {
    const s = ioClient(URL, { transports: ['websocket'], auth: token ? { token } : {} });
    s.on('connect', () => resolve(s));
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function once(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (p) => { clearTimeout(t); resolve(p); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function run() {
  const admin = registerAccount('TheAdmin');
  const alice = registerAccount('Alice');
  const bob = registerAccount('Bob');
  accountsDb.makeSoleAdmin(admin.id);
  const sockets = [];
  const track = async (token) => { const s = await connect(token); sockets.push(s); return s; };

  // --- guests cannot create or start --------------------------------------
  const guest = await track();
  for (const [event, extra] of [['room:create', {}], ['mafia:create', { presetId: 'CLASSIC' }], ['citadels:create', {}]]) {
    // eslint-disable-next-line no-await-in-loop
    const res = await emit(guest, event, { nickname: 'Guesty', playerId: 'guest-1', ...extra });
    assert(res.ok === false && res.code === 'GUEST_CANNOT_CREATE', `a guest is refused on ${event} (got ${JSON.stringify(res)})`);
  }
  console.log('✓ a guest cannot create a Monopoly, Mafia or Citadels room, even with a direct socket call');

  const aliceSock = await track(alice.token);
  const created = await emit(aliceSock, 'room:create', { token: alice.token, modeId: 'classic' });
  assert(created.ok, `a registered player creates a room (${created.error})`);
  const code = created.roomCode;

  const joined = await emit(guest, 'room:join', {
    roomCode: code, nickname: 'Guesty', playerId: 'guest-1', guestKey: 'k'.repeat(32),
  });
  assert(joined.ok, `a guest joins by code (${joined.error})`);
  assert(joined.state.players.every((p) => p.guestKeyHash === undefined), 'the guest key hash is never broadcast');
  assert(joined.state.players.find((p) => p.id === 'guest-1').isGuest, 'guests are marked as guests');
  console.log('✓ a guest can join an existing room by code');

  // --- identity and seat security -----------------------------------------
  const spoofer = await track();
  const spoof = await emit(spoofer, 'room:join', { roomCode: code, nickname: 'Fake', playerId: alice.id });
  assert(spoof.ok === false && spoof.code === 'IDENTITY_TAKEN', 'a guest cannot use a registered account id');
  const hijack = await emit(spoofer, 'room:join', {
    roomCode: code, nickname: 'Fake', playerId: 'guest-1', guestKey: 'x'.repeat(32),
  });
  assert(hijack.ok === false && hijack.code === 'SEAT_TAKEN', 'a guest seat cannot be claimed without its key');
  const back = await emit(guest, 'room:join', {
    roomCode: code, nickname: 'Guesty', playerId: 'guest-1', guestKey: 'k'.repeat(32),
  });
  assert(back.ok, 'the rightful guest reconnects with their key');
  console.log('✓ nobody can take a registered identity or another guest\'s seat');

  // A guest who somehow holds the host seat still cannot start: leaving
  // Alice's lobby hands the host role to the only player left - the guest.
  const soloCode = (await emit(aliceSock, 'room:create', { token: alice.token, modeId: 'classic' })).roomCode;
  const soloGuest = await track();
  await emit(soloGuest, 'room:join', { roomCode: soloCode, nickname: 'Solo', playerId: 'guest-solo', guestKey: 's'.repeat(32) });
  aliceSock.emit('room:leave');
  await sleep(150);
  const startRefused = once(soloGuest, 'game:error');
  soloGuest.emit('room:start');
  assert(/registered/i.test((await startRefused).message), 'a guest host cannot start the game');
  await emit(aliceSock, 'room:join', { roomCode: code, token: alice.token });
  console.log('✓ a guest cannot start a game even when holding the host seat');

  // --- modes ---------------------------------------------------------------
  const noAuth = await api('GET', '/api/admin/overview');
  assert(noAuth.status === 401, 'the admin API refuses anonymous calls');
  const notAdmin = await api('GET', '/api/admin/overview', { token: alice.token });
  assert(notAdmin.status === 403, 'the admin API refuses a normal user');
  const asAdmin = await api('GET', '/api/admin/overview', { token: admin.token });
  assert(asAdmin.status === 200 && asAdmin.body.users.total === 3, 'the admin gets the overview');
  const forged = await api('PUT', '/api/admin/modes/monopoly.classic', { token: bob.token, body: { status: 'disabled' } });
  assert(forged.status === 403, 'a normal user cannot switch modes through the API');
  console.log('✓ the admin API is locked to the administrator account');

  const disabled = await api('PUT', '/api/admin/modes/monopoly.classic', { token: admin.token, body: { status: 'disabled' } });
  assert(disabled.status === 200, 'the admin disables a mode');
  const catalogue = await api('GET', '/api/games');
  const classic = catalogue.body.games.find((g) => g.id === 'monopoly').modes.find((m) => m.id === 'classic');
  assert(classic.available === false, 'a disabled mode is marked unavailable in the catalogue');
  const refused = await emit(aliceSock, 'room:create', { token: alice.token, modeId: 'classic' });
  assert(refused.ok === false && refused.code === 'MODE_UNAVAILABLE', 'new games in a disabled mode are refused');

  // A game that was already running is not affected.
  const bobSock = await track(bob.token);
  const running = await emit(bobSock, 'room:create', { token: bob.token, modeId: 'metropolis' });
  await api('PUT', '/api/admin/modes/monopoly.classic', { token: admin.token, body: { status: 'enabled' } });
  const game2 = await emit(bobSock, 'room:create', { token: bob.token, modeId: 'classic' });
  const aliceJoin = await emit(aliceSock, 'room:join', { roomCode: game2.roomCode, token: alice.token });
  assert(game2.ok && aliceJoin.ok, 'a second room is set up');
  bobSock.emit('room:start');
  await sleep(150);
  await api('PUT', '/api/admin/modes/monopoly.classic', { token: admin.token, body: { status: 'paused', pauseMinutes: 5 } });
  bobSock.emit('game:rollDice');
  const afterRoll = await once(bobSock, 'game:state');
  assert(afterRoll.lastRoll, 'a game already in progress keeps playing when its mode is paused');
  await api('PUT', '/api/admin/modes/monopoly.classic', { token: admin.token, body: { status: 'enabled' } });
  assert(running.ok, 'other modes were unaffected');
  console.log('✓ disabling or pausing a mode stops new games but never breaks a running one');

  // --- statistics ------------------------------------------------------------
  aliceSock.emit('game:declareBankruptcy');
  await sleep(300);
  const bobStats = await api('GET', '/api/auth/me/stats', { token: bob.token });
  const aliceStats = await api('GET', '/api/auth/me/stats', { token: alice.token });
  assert(bobStats.body.stats.played === 1 && bobStats.body.stats.wins === 1, `the winner's statistics record the win (${JSON.stringify(bobStats.body.stats)})`);
  assert(aliceStats.body.stats.losses === 1 && aliceStats.body.stats.finished === 1, 'the loser\'s statistics record the loss');
  assert(bobStats.body.stats.created >= 2, 'created games are counted');
  assert(bobStats.body.achievements.find((a) => a.id === 'FIRST_WIN').unlocked, 'achievements follow the history');
  const overview = await api('GET', '/api/admin/overview', { token: admin.token });
  assert(overview.body.games.finished === 1 && overview.body.games.today >= 1, 'the admin overview counts the finished game');
  console.log('✓ a finished game is saved to both players\' statistics and the admin overview');

  // --- lobbies: kick and close ---------------------------------------------
  const lobbies = await api('GET', '/api/admin/lobbies', { token: admin.token });
  assert(lobbies.body.lobbies.some((l) => l.code === code && l.players.length === 2), 'the admin sees every lobby with its players');

  const kickedEvent = once(guest, 'room:removed');
  const kick = await api('POST', `/api/admin/lobbies/${code}/kick`, { token: admin.token, body: { playerId: 'guest-1' } });
  assert(kick.status === 200, 'the admin removes a player');
  assert((await kickedEvent).reason === 'kicked_by_admin', 'the removed player is told');
  const rejoin = await emit(guest, 'room:join', {
    roomCode: code, nickname: 'Guesty', playerId: 'guest-1', guestKey: 'k'.repeat(32),
  });
  assert(rejoin.ok === false && rejoin.code === 'BANNED', 'a removed player cannot rejoin with the same code');

  const closedEvent = once(aliceSock, 'room:removed');
  const close = await api('POST', `/api/admin/lobbies/${code}/close`, { token: admin.token });
  assert(close.status === 200 && (await closedEvent).reason === 'closed_by_admin', 'closing a lobby notifies its players');
  assert(!roomManager.getRoom(code), 'a closed lobby is gone');
  console.log('✓ the admin can remove a player and close a lobby');

  // --- blocking ----------------------------------------------------------------
  const selfBlock = await api('POST', `/api/admin/users/${admin.id}/block`, { token: admin.token, body: { reason: 'oops' } });
  assert(selfBlock.status === 400, 'the admin cannot block the admin account');
  const noReason = await api('POST', `/api/admin/users/${bob.id}/block`, { token: admin.token, body: {} });
  assert(noReason.status === 400, 'a block needs a reason');

  const blockedEvent = once(bobSock, 'account:blocked');
  const block = await api('POST', `/api/admin/users/${bob.id}/block`, {
    token: admin.token, body: { reason: 'Cheating in chat', removeFromRooms: true },
  });
  assert(block.status === 200 && block.body.user.status === 'blocked', 'the admin blocks a user');
  assert(block.body.user.blockedByName === 'TheAdmin' && block.body.user.blockedAt, 'who blocked and when is stored');
  assert((await blockedEvent).reason === 'Cheating in chat', 'the blocked user is told why');

  const login = await api('POST', '/api/auth/login', { body: { nickname: 'Bob', password: 'password123' } });
  assert(login.status === 403 && login.body.code === 'BLOCKED' && login.body.reason === 'Cheating in chat', 'a blocked user cannot log in');
  const me = await api('GET', '/api/auth/me', { token: bob.token });
  assert(me.status === 403, 'an old token of a blocked user stops working');
  const bobAgain = await track(bob.token);
  const blockedCreate = await emit(bobAgain, 'citadels:create', { token: bob.token });
  assert(blockedCreate.ok === false && blockedCreate.code === 'BLOCKED', 'a blocked user cannot create games');
  const citadelsRoom = await emit(aliceSock, 'citadels:create', { token: alice.token });
  const blockedJoin = await emit(bobAgain, 'citadels:join', { roomCode: citadelsRoom.roomCode, token: bob.token });
  assert(blockedJoin.ok === false && blockedJoin.code === 'BLOCKED', 'a blocked user cannot join lobbies');

  const unblock = await api('POST', `/api/admin/users/${bob.id}/unblock`, { token: admin.token });
  assert(unblock.status === 200, 'the admin unblocks');
  const loginAgain = await api('POST', '/api/auth/login', { body: { nickname: 'Bob', password: 'password123' } });
  assert(loginAgain.status === 200, 'an unblocked user logs in again');
  const users = await api('GET', '/api/admin/users?q=bob', { token: admin.token });
  assert(users.body.users.length === 1 && users.body.users[0].played === 1, 'the user list searches and shows statistics');
  console.log('✓ blocking stops login, creating and joining, is recorded, and can be undone');

  // --- Citadels over the wire ------------------------------------------------------
  const c = citadelsRoom.roomCode;
  const g1 = await track();
  const guestJoin = await emit(g1, 'citadels:join', {
    roomCode: c, nickname: 'Visitor', playerId: 'guest-c', guestKey: 'g'.repeat(32),
  });
  assert(guestJoin.ok, 'a guest joins a Citadels lobby');
  const guestStartC = await emit(g1, 'citadels:start', {});
  assert(guestStartC.ok === false, 'a guest cannot start the Citadels game');
  const aliceState = once(aliceSock, 'citadels:state');
  const guestState = once(g1, 'citadels:state');
  const startC = await emit(aliceSock, 'citadels:start', {});
  assert(startC.ok, `the registered host starts Citadels (${startC.error})`);
  const [sa, sg] = await Promise.all([aliceState, guestState]);
  assert(sa.you.hand.length === 4 && sg.you.hand.length === 4, 'each player receives their own hand');
  const hostPayload = JSON.stringify(sa);
  assert(sg.you.hand.every((c) => !hostPayload.includes(`"${c.uid}"`)), 'the host\'s payload holds none of the guest\'s cards');
  const picker = sa.you.canPick ? aliceSock : g1;
  const pickerState = sa.you.canPick ? sa : sg;
  const cheat = await emit(picker === aliceSock ? g1 : aliceSock, 'citadels:pick', { roleId: pickerState.you.draftOptions[0] });
  assert(cheat.ok === false, 'a player cannot pick out of turn');
  const goldCheat = await emit(picker, 'citadels:gold', {});
  assert(goldCheat.ok === false, 'nobody can take gold during the draft');
  console.log('✓ Citadels runs over the wire with private payloads and server-side validation');

  sockets.forEach((s) => s.close());
  io.close();
  server.close();
  console.log('\n=== PLATFORM TESTS PASSED ===');
}

server.listen(PORT, async () => {
  try {
    await run();
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
});
