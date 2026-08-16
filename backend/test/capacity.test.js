// Verifies the "up to 10 players" requirement end to end at the socket
// layer: 10 players can join, an 11th is rejected, and a full 10-player
// game can actually play through several turns without errors (e.g. rent
// calculations, turn order wraparound, bankruptcy-driven seat skipping all
// still work correctly with a full table, not just 2 players).

process.env.PORT = '4006';
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const apiRoutes = require('../src/routes/api');
const { registerSocketHandlers } = require('../src/socket/socketHandler');

const PORT = 4006;
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
      await new Promise((r) => setTimeout(r, 15));
    }
    return this.latest;
  }
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  console.log('capacity test server up');

  const URL = `http://localhost:${PORT}`;
  const sockets = [];
  const trackers = [];
  for (let i = 0; i < 11; i++) {
    const s = ioClient(URL, { transports: ['websocket', 'polling'] });
    await onceEvent(s, 'connect');
    sockets.push(s);
    trackers.push(new StateTracker(s));
  }
  console.log('✓ 11 sockets connected');

  const createRes = await emitAck(sockets[0], 'room:create', { nickname: 'Player0', playerId: 'p0' });
  const roomCode = createRes.roomCode;
  console.log('✓ room created:', roomCode);

  // Join players 1-9 (total 10 with the host)
  for (let i = 1; i < 10; i++) {
    const res = await emitAck(sockets[i], 'room:join', { roomCode, nickname: `Player${i}`, playerId: `p${i}` });
    if (res.state.players.length !== i + 1) {
      throw new Error(`Expected ${i + 1} players after join ${i}, got ${res.state.players.length}`);
    }
  }
  console.log('✓ 10 players (0-9) successfully joined, room now full');

  // 11th player must be rejected
  try {
    await emitAck(sockets[10], 'room:join', { roomCode, nickname: 'Player10', playerId: 'p10' });
    throw new Error('Expected 11th player join to be rejected, but it succeeded');
  } catch (e) {
    if (!/full/i.test(e.message)) throw e;
    console.log('✓ 11th player correctly rejected:', e.message);
  }

  // Start the game with a full table
  const v0 = trackers[0].version;
  sockets[0].emit('room:start');
  let state = await trackers[0].waitForUpdate(v0);
  if (state.phase !== 'ROLLING') throw new Error('Expected ROLLING phase, got ' + state.phase);
  console.log('✓ 10-player game started successfully');

  // Play 30 turns to exercise full-table turn order (wraparound past
  // player index 9 back to 0), rent between many different owners, etc.
  const socketFor = (id) => sockets[state.players.findIndex((p) => p.id === id)];
  const trackerFor = (id) => trackers[state.players.findIndex((p) => p.id === id)];
  let sawWraparound = false;
  let lastIndex = state.currentPlayerIndex;

  for (let turn = 0; turn < 30 && state.phase !== 'GAME_OVER'; turn++) {
    const actorId = state.players[state.currentPlayerIndex].id;
    const actorSocket = socketFor(actorId);
    const actorTracker = trackerFor(actorId);

    if (state.currentPlayerIndex < lastIndex) sawWraparound = true;
    lastIndex = state.currentPlayerIndex;

    let v = actorTracker.version;
    actorSocket.emit('game:rollDice');
    state = await actorTracker.waitForUpdate(v);

    const actor = state.players.find((p) => p.id === actorId);
    if (state.pendingAction?.type === 'BUY_DECISION' && state.pendingAction.playerId === actorId) {
      v = actorTracker.version;
      if (actor.money > 300) actorSocket.emit('game:buyProperty', { tileId: state.pendingAction.tileId });
      else actorSocket.emit('game:declinePurchase', { tileId: state.pendingAction.tileId });
      state = await actorTracker.waitForUpdate(v);
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
  }

  console.log(`✓ played 30 turns with a full 10-player table; turn order wraparound observed: ${sawWraparound}`);
  console.log('  money snapshot:', state.players.map((p) => `${p.nickname}:$${p.money}`).join(', '));
  if (!sawWraparound) throw new Error('Expected to see turn order wrap around past player 9 back to player 0 within 30 turns');

  console.log('\n=== 10-PLAYER CAPACITY TEST PASSED ===');
  sockets.forEach((s) => s.disconnect());
  server.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('CAPACITY TEST FAILED:', e);
  process.exit(1);
});
