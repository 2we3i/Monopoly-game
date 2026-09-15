// Auctions over the real socket.io wire: every client sees the same
// auction, bids are applied for everyone, and the SERVER's timer closes it.

process.env.MONOPOLY_AUCTION_MS = '1200';
const { registerAccount } = require('./helpers/testEnv');

process.env.NODE_ENV = 'test';

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const { registerSocketHandlers } = require('../src/socket/socketHandler');
const roomManager = require('../src/game/RoomManager');

const PORT = 4019;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerSocketHandlers(io);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => {
      if (res && res.ok === false) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

class StateTracker {
  constructor(socket) {
    this.version = 0;
    this.latest = null;
    this.errors = [];
    socket.on('game:state', (s) => { this.latest = s; this.version += 1; });
    socket.on('game:error', (e) => this.errors.push(e.message));
  }

  async waitFor(predicate, timeoutMs = 5000) {
    const start = Date.now();
    while (!this.latest || !predicate(this.latest)) {
      if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for the expected game:state');
      await sleep(20);
    }
    return this.latest;
  }
}

function openDecision(mgr, tileId) {
  const cp = mgr.state.currentPlayer;
  cp.position = tileId;
  mgr.state.phase = 'ACTION';
  mgr.state.lastRoll = { d1: 2, d2: 3, isDouble: false, playerId: cp.id };
  mgr.state.pendingAction = { type: 'BUY_DECISION', tileId, playerId: cp.id };
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const URL = `http://localhost:${PORT}`;
  const sAlice = ioClient(URL, { transports: ['websocket'] });
  const sBob = ioClient(URL, { transports: ['websocket'] });
  const tAlice = new StateTracker(sAlice);
  const tBob = new StateTracker(sBob);
  await Promise.all([new Promise((r) => sAlice.once('connect', r)), new Promise((r) => sBob.once('connect', r))]);

  const alice = registerAccount('AuctionAlice');
  const { roomCode } = await emitAck(sAlice, 'room:create', { token: alice.token });
  await emitAck(sBob, 'room:join', { roomCode, nickname: 'Bob', playerId: 'p-bob-auction' });
  sAlice.emit('room:start');
  await tAlice.waitFor((s) => s.phase === 'ROLLING');

  const mgr = roomManager.getRoom(roomCode);
  assert(mgr.state.currentPlayer.id === alice.id, 'Alice moves first');
  const free = () => mgr.state.layout.board.filter((t) => t.type === 'PROPERTY' && !mgr.state.properties[t.id].ownerId);

  // 1. Alice passes: both players see the same auction.
  const tile = free()[0];
  openDecision(mgr, tile.id);
  sAlice.emit('game:declinePurchase', { tileId: tile.id });
  let state = await tBob.waitFor((s) => s.auction?.tileId === tile.id);
  assert(typeof state.serverTime === 'number', 'the state carries the server clock for synced countdowns');
  const aliceView = await tAlice.waitFor((s) => s.auction?.tileId === tile.id);
  assert(aliceView.auction.id === state.auction.id && aliceView.auction.endsAt === state.auction.endsAt, 'both clients count down to the same deadline');
  console.log('✓ a pass starts an auction that every player sees with the same deadline');

  // 2. A second pass on the same square does not create a second auction.
  sAlice.emit('game:declinePurchase', { tileId: tile.id });
  await sleep(200);
  assert(/No pending/i.test(tAlice.errors[tAlice.errors.length - 1] || ''), 'the duplicate pass is refused');
  assert(mgr.state.auction.id === state.auction.id && mgr.state.auctionQueue.length === 0, 'still exactly one auction');
  console.log('✓ a duplicate pass cannot start a duplicate auction');

  // 3. Bob bids; Alice cannot roll meanwhile; the server's timer closes it.
  const bobBefore = state.players.find((p) => p.id === 'p-bob-auction').money;
  sBob.emit('game:placeBid', { auctionId: state.auction.id, amount: 10 });
  state = await tAlice.waitFor((s) => s.auction?.highestBidderId === 'p-bob-auction');
  assert(state.auction.highestBid === 10, 'Alice sees Bob\'s bid');
  sAlice.emit('game:endTurn');
  await sleep(150);
  assert(/auction/i.test(tAlice.errors[tAlice.errors.length - 1] || ''), 'ending the turn during the auction is refused');

  state = await tAlice.waitFor((s) => !s.auction && s.properties[tile.id].ownerId === 'p-bob-auction');
  assert(state.players.find((p) => p.id === 'p-bob-auction').money === bobBefore - 10, 'Bob paid his bid');
  assert(state.lastAuctionResult?.winnerId === 'p-bob-auction', 'the result is broadcast');
  console.log('✓ bids reach every client and the server timer awards the square to the highest bidder');

  // 4. No bids: the timer closes it and the square stays with the bank.
  const tile2 = free()[0];
  openDecision(mgr, tile2.id);
  sAlice.emit('game:declinePurchase', { tileId: tile2.id });
  await tBob.waitFor((s) => s.auction?.tileId === tile2.id);
  state = await tBob.waitFor((s) => !s.auction && s.lastAuctionResult?.tileId === tile2.id);
  assert(state.properties[tile2.id].ownerId === null, 'an auction without bids leaves the square unowned');
  console.log('✓ an auction without bids closes on the server timer');

  // 5. With the auction over, the turn goes on.
  sAlice.emit('game:endTurn');
  state = await tBob.waitFor((s) => s.players[s.currentPlayerIndex].id === 'p-bob-auction');
  console.log('✓ the turn can end once the auction is over');

  console.log('\n=== AUCTION SOCKET TEST PASSED ===');
  sAlice.disconnect();
  sBob.disconnect();
  server.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
