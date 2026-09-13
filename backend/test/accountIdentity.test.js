// Verifies that a REGISTERED account can create and join a room via a
// session token, and that the account's nickname/avatar - never a
// client-supplied value - end up on the player object in the live game
// state, even when a malicious client actively tries to spoof another
// identity.

process.env.PORT = '4002';
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const apiRoutes = require('../src/routes/api');
const { router: authRoutes } = require('../src/routes/authRoutes');
const { registerSocketHandlers } = require('../src/socket/socketHandler');
const accountsDb = require('../src/db/accounts');

const PORT = 4002;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
registerSocketHandlers(io);

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => (res && res.ok === false ? reject(new Error(res.error)) : resolve(res)));
  });
}
function onceEvent(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function httpPost(path, body) {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`test server up on ${PORT}`);

  const { status: s1, body: aliceReg } = await httpPost('/api/auth/register', { nickname: 'RegAlice', password: 'password1' });
  assert(s1 === 201, `Alice registration should succeed, got ${s1}`);
  const { status: s2, body: bobReg } = await httpPost('/api/auth/register', { nickname: 'RegBob', password: 'password2' });
  assert(s2 === 201, `Bob registration should succeed, got ${s2}`);

  accountsDb.setAvatar(aliceReg.account.id, '/avatars/fake-alice-avatar.png');

  const URL = `http://localhost:${PORT}`;
  const sAlice = ioClient(URL, { transports: ['websocket', 'polling'] });
  const sBob = ioClient(URL, { transports: ['websocket', 'polling'] });
  await Promise.all([onceEvent(sAlice, 'connect'), onceEvent(sBob, 'connect')]);

  const createRes = await emitAck(sAlice, 'room:create', {
    nickname: 'NOT ALICE AT ALL',
    playerId: 'some-spoofed-id',
    token: aliceReg.token,
  });
  console.log('room created:', createRes.roomCode);
  assert(createRes.playerId === aliceReg.account.id, `expected playerId to be Alice's real account id, got ${createRes.playerId}`);

  const alicePlayer = createRes.state.players.find((p) => p.id === aliceReg.account.id);
  assert(alicePlayer, 'Alice should appear in the room state under her real account id');
  assert(alicePlayer.nickname === 'RegAlice', `expected Alice's real registered nickname, got "${alicePlayer.nickname}"`);
  assert(alicePlayer.avatarUrl === '/avatars/fake-alice-avatar.png', `expected Alice's real avatar URL, got ${alicePlayer.avatarUrl}`);
  assert(alicePlayer.accountId === aliceReg.account.id, 'player.accountId should be set for a logged-in player');
  console.log("✓ Alice's room-state player object uses her verified account nickname/avatar/id, ignoring the spoofed values she sent");

  const joinRes = await emitAck(sBob, 'room:join', {
    roomCode: createRes.roomCode,
    nickname: 'DEFINITELY NOT BOB',
    playerId: 'another-spoofed-id',
    token: bobReg.token,
  });
  const bobPlayer = joinRes.state.players.find((p) => p.id === bobReg.account.id);
  assert(bobPlayer, 'Bob should appear in the room state under his real account id');
  assert(bobPlayer.nickname === 'RegBob', `expected Bob's real registered nickname, got "${bobPlayer.nickname}"`);
  assert(bobPlayer.accountId === bobReg.account.id, "player.accountId should be Bob's real id");
  console.log("✓ Bob's room-state player object uses his verified account identity, ignoring spoofed values");

  const sGuest = ioClient(URL, { transports: ['websocket', 'polling'] });
  await onceEvent(sGuest, 'connect');
  const guestJoin = await emitAck(sGuest, 'room:join', {
    roomCode: createRes.roomCode,
    nickname: 'GuestCharlie',
    playerId: 'guest-uuid-12345',
  });
  const guestPlayer = guestJoin.state.players.find((p) => p.id === 'guest-uuid-12345');
  assert(guestPlayer, 'guest should join under their own client-generated id, since there is no token to override it');
  assert(guestPlayer.nickname === 'GuestCharlie', 'guest nickname should be exactly what they typed');
  assert(guestPlayer.accountId === null, 'guest player.accountId must be null');
  assert(guestPlayer.avatarUrl === null, 'guest player.avatarUrl must be null');
  console.log('✓ Guest (no token) still joins normally with client-supplied nickname/id, accountId/avatarUrl both null');

  const tAlice = { version: 0, latest: null };
  sAlice.on('game:state', (s) => { tAlice.latest = s; tAlice.version += 1; });
  const v0 = tAlice.version;
  sAlice.emit('room:start');
  const start = Date.now();
  while (tAlice.version <= v0 && Date.now() - start < 4000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 20));
  }
  assert(tAlice.latest && tAlice.latest.phase === 'ROLLING', 'game should start normally with a mix of registered accounts and a guest');
  console.log('✓ Game starts normally with a mix of registered accounts and a guest player');

  console.log('\n=== ACCOUNT-TO-GAMEPLAY INTEGRATION TEST PASSED ===');
  sAlice.disconnect();
  sBob.disconnect();
  sGuest.disconnect();
  server.close();
  accountsDb.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
