// Verifies the trading system works through the actual socket.io wire
// protocol, proving error surfacing and correct broadcast to both parties.

const { registerAccount } = require('./helpers/testEnv');

process.env.PORT = '4003';
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const apiRoutes = require('../src/routes/api');
const { registerSocketHandlers } = require('../src/socket/socketHandler');

const PORT = 4003;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
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
class StateTracker {
  constructor(socket) {
    this.version = 0;
    this.latest = null;
    socket.on('game:state', (s) => { this.latest = s; this.version += 1; });
  }
  async waitForUpdate(sinceVersion, timeoutMs = 4000) {
    const start = Date.now();
    while (this.version <= sinceVersion) {
      if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for game:state update');
      await new Promise((r) => setTimeout(r, 20));
    }
    return this.latest;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`trading socket test server up on ${PORT}`);

  const URL = `http://localhost:${PORT}`;
  const sAlice = ioClient(URL, { transports: ['websocket', 'polling'] });
  const sBob = ioClient(URL, { transports: ['websocket', 'polling'] });
  const tAlice = new StateTracker(sAlice);
  const tBob = new StateTracker(sBob);
  const aliceErrors = [];
  const bobErrors = [];
  sAlice.on('game:error', (e) => aliceErrors.push(e.message));
  sBob.on('game:error', (e) => bobErrors.push(e.message));

  await Promise.all([onceEvent(sAlice, 'connect'), onceEvent(sBob, 'connect')]);

  const alice = registerAccount('Alice');
  const ALICE_ID = alice.id;
  const createRes = await emitAck(sAlice, 'room:create', { token: alice.token });
  const roomCode = createRes.roomCode;
  await emitAck(sBob, 'room:join', { roomCode, nickname: 'Bob', playerId: 'p-bob' });

  let v = tAlice.version;
  sAlice.emit('room:start');
  let state = await tAlice.waitForUpdate(v);
  assert(state.phase === 'ROLLING', 'game should have started');
  console.log('[1] Game started with Alice and Bob');

  let aliceOwnsTile = null;

  // A passed square (or an expired mortgage) now goes to auction; this
  // simulation drops out of every auction so the game keeps moving.
  const settleAuction = async () => {
    while (state.auction && state.phase !== 'GAME_OVER') {
      const { auction } = state;
      const quitter = auction.participants.find((id) => !auction.withdrawn.includes(id)
        && id !== auction.highestBidderId && !state.players.find((p) => p.id === id).bankrupt);
      if (!quitter) break;
      const tracker = (quitter === ALICE_ID ? tAlice : tBob);
      const version = tracker.version;
      (quitter === ALICE_ID ? sAlice : sBob).emit('game:withdrawAuction', { auctionId: auction.id });
      state = await tracker.waitForUpdate(version);
    }
  };
  for (let turn = 0; turn < 80 && !aliceOwnsTile; turn++) {
    await settleAuction();
    const actorId = state.players[state.currentPlayerIndex].id;
    const actorSocket = actorId === ALICE_ID ? sAlice : sBob;
    const actorTracker = actorId === ALICE_ID ? tAlice : tBob;

    v = actorTracker.version;
    actorSocket.emit('game:rollDice');
    state = await actorTracker.waitForUpdate(v);

    if (state.pendingAction?.type === 'BUY_DECISION' && state.pendingAction.playerId === actorId) {
      const tile = state.board[state.pendingAction.tileId];
      const actor = state.players.find((p) => p.id === actorId);
      v = actorTracker.version;
      if (actor.money > tile.price) {
        actorSocket.emit('game:buyProperty', { tileId: state.pendingAction.tileId });
      } else {
        actorSocket.emit('game:declinePurchase', { tileId: state.pendingAction.tileId });
      }
      state = await actorTracker.waitForUpdate(v);
      await settleAuction();
    }
    if (state.pendingAction?.type === 'CARD_REVEAL' && state.pendingAction.playerId === actorId) {
      v = actorTracker.version;
      actorSocket.emit('game:acknowledgeCard');
      state = await actorTracker.waitForUpdate(v);
    }
    if (!state.pendingAction && state.phase === 'ACTION') {
      v = actorTracker.version;
      actorSocket.emit('game:endTurn');
      state = await actorTracker.waitForUpdate(v);
    }

    const owned = Object.entries(state.properties).find(([, p]) => p.ownerId === ALICE_ID);
    if (owned) aliceOwnsTile = Number(owned[0]);
  }
  assert(aliceOwnsTile != null, 'Alice should have bought at least one property within 80 turns');
  console.log(`[2] Alice owns tile ${aliceOwnsTile}, proceeding with trade test`);

  v = tBob.version;
  sAlice.emit('game:proposeTrade', { toPlayerId: 'p-bob', offerTileIds: [aliceOwnsTile], offerMoney: 0, requestMoney: 50 });
  state = await tBob.waitForUpdate(v);
  assert(state.trades.length === 1, 'trade should appear in broadcast state.trades');
  assert(state.trades[0].fromPlayerId === ALICE_ID && state.trades[0].toPlayerId === 'p-bob', 'trade parties should be correct');
  const tradeId = state.trades[0].id;
  console.log('[3] Trade proposed over the wire, visible to Bob via game:state broadcast');

  const errCountBefore = aliceErrors.length;
  sAlice.emit('game:acceptTrade', { tradeId });
  await new Promise((r) => setTimeout(r, 200));
  assert(aliceErrors.length > errCountBefore, 'Alice should get a game:error when trying to accept her own trade');
  assert(/only the recipient/i.test(aliceErrors[aliceErrors.length - 1]), `expected "only the recipient" error, got: ${aliceErrors[aliceErrors.length - 1]}`);
  console.log('[4] CONFIRMED over the wire: proposer accepting their own trade correctly surfaces a game:error');

  const bobMoneyBefore = state.players.find((p) => p.id === 'p-bob').money;
  const aliceMoneyBefore = state.players.find((p) => p.id === ALICE_ID).money;

  v = tAlice.version;
  const vBob = tBob.version;
  sBob.emit('game:acceptTrade', { tradeId });
  state = await tAlice.waitForUpdate(v);
  await tBob.waitForUpdate(vBob);

  assert(state.properties[aliceOwnsTile].ownerId === 'p-bob', 'property should now belong to Bob in the broadcast state');
  assert(state.trades.length === 0, 'resolved trade should be gone from broadcast state');
  const bobAfter = state.players.find((p) => p.id === 'p-bob').money;
  const aliceAfter = state.players.find((p) => p.id === ALICE_ID).money;
  assert(bobAfter === bobMoneyBefore - 50, `Bob should have paid $50, got money=${bobAfter} (was ${bobMoneyBefore})`);
  assert(aliceAfter === aliceMoneyBefore + 50, `Alice should have received $50, got money=${aliceAfter} (was ${aliceMoneyBefore})`);
  console.log('[5] Trade accepted over the wire: both clients received the updated state with correct property/money transfer');

  console.log('\n=== TRADING SOCKET.IO INTEGRATION TEST PASSED ===');
  sAlice.disconnect();
  sBob.disconnect();
  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
