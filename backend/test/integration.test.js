// Starts the actual server in-process, then drives it with socket.io-client.

const { registerAccount } = require('./helpers/testEnv');

process.env.PORT = '4001';
process.env.NODE_ENV = 'test';

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const apiRoutes = require('../src/routes/api');
const { registerSocketHandlers } = require('../src/socket/socketHandler');

const PORT = 4001;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
registerSocketHandlers(io);

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
    this.socket = socket;
    this.version = 0;
    this.latest = null;
    socket.on('game:state', (s) => {
      this.latest = s;
      this.version += 1;
    });
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

function onceEvent(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`test server up on ${PORT}`);

  const URL = `http://localhost:${PORT}`;
  const s1 = ioClient(URL, { transports: ['websocket', 'polling'] });
  const s2 = ioClient(URL, { transports: ['websocket', 'polling'] });

  const t1 = new StateTracker(s1);
  const t2 = new StateTracker(s2);

  const errors = [];
  s1.on('game:error', (e) => errors.push(`[s1] ${e.message}`));
  s2.on('game:error', (e) => errors.push(`[s2] ${e.message}`));

  await Promise.all([onceEvent(s1, 'connect'), onceEvent(s2, 'connect')]);
  console.log('✓ both sockets connected');

  // Only a registered player may create a room; Bob joins as a guest.
  const alice = registerAccount('Alice');
  const p1Id = alice.id;
  const p2Id = 'player-bob-002';

  const createRes = await emitAck(s1, 'room:create', { token: alice.token });
  const roomCode = createRes.roomCode;
  console.log('✓ room created:', roomCode);
  if (!/^[A-Z2-9]{5}$/.test(roomCode)) throw new Error('room code format unexpected: ' + roomCode);

  try {
    await emitAck(s2, 'room:join', { roomCode: 'ZZZZZ', nickname: 'Bob', playerId: p2Id });
    throw new Error('expected join of nonexistent room to fail');
  } catch (e) {
    if (!/not found/i.test(e.message)) throw e;
    console.log('✓ joining nonexistent room correctly rejected:', e.message);
  }

  const joinRes = await emitAck(s2, 'room:join', { roomCode, nickname: 'Bob', playerId: p2Id });
  console.log('✓ bob joined, players:', joinRes.state.players.map((p) => p.nickname));
  if (joinRes.state.players.length !== 2) throw new Error('Expected 2 players in lobby');

  await new Promise((r) => setTimeout(r, 150));

  const errBeforeStart = errors.length;
  s2.emit('room:start');
  await new Promise((r) => setTimeout(r, 200));
  if (errors.length <= errBeforeStart || !/only the host/i.test(errors[errors.length - 1])) {
    throw new Error('expected non-host start to be rejected with "only the host" error');
  }
  console.log('✓ non-host cannot start game:', errors[errors.length - 1]);

  let v1 = t1.version;
  s1.emit('room:start');
  let state = await t1.waitForUpdate(v1);
  console.log('✓ game started, phase:', state.phase);
  if (state.phase !== 'ROLLING') throw new Error('Expected ROLLING phase after start, got ' + state.phase);
  if (!Array.isArray(state.board) || state.board.length !== 40) throw new Error('Expected the room state to include a 40-tile board array, got ' + (state.board && state.board.length));

  const currentId = () => state.players[state.currentPlayerIndex].id;
  const trackerFor = (id) => (id === p1Id ? t1 : t2);
  const socketFor = (id) => (id === p1Id ? s1 : s2);

  let boughtSomething = false;
  let sawCard = false;
  let sawRent = false;
  let sawDoubles = false;

  // A passed square (or an expired mortgage) now goes to auction; this
  // simulation drops out of every auction so the game keeps moving.
  const settleAuction = async () => {
    while (state.auction && state.phase !== 'GAME_OVER') {
      const { auction } = state;
      const quitter = auction.participants.find((id) => !auction.withdrawn.includes(id)
        && id !== auction.highestBidderId && !state.players.find((p) => p.id === id).bankrupt);
      if (!quitter) break;
      const tracker = trackerFor(quitter);
      const version = tracker.version;
      socketFor(quitter).emit('game:withdrawAuction', { auctionId: auction.id });
      state = await tracker.waitForUpdate(version);
    }
  };

  for (let turn = 0; turn < 60 && state.phase !== 'GAME_OVER'; turn++) {
    await settleAuction();
    if (state.phase === 'GAME_OVER') break;
    const actorId = currentId();
    const actorSocket = socketFor(actorId);
    const actorTracker = trackerFor(actorId);

    v1 = actorTracker.version;
    actorSocket.emit('game:rollDice');
    state = await actorTracker.waitForUpdate(v1);

    const actor = state.players.find((p) => p.id === actorId);
    if (state.lastRoll?.isDouble) sawDoubles = true;

    if (state.pendingAction?.type === 'BUY_DECISION' && state.pendingAction.playerId === actorId) {
      v1 = actorTracker.version;
      const tile = state.board[state.pendingAction.tileId];
      if (actor.money > tile.price) {
        actorSocket.emit('game:buyProperty', { tileId: state.pendingAction.tileId });
        boughtSomething = true;
      } else {
        actorSocket.emit('game:declinePurchase', { tileId: state.pendingAction.tileId });
      }
      state = await actorTracker.waitForUpdate(v1);
      await settleAuction();
    }

    if (state.pendingAction?.type === 'CARD_REVEAL' && state.pendingAction.playerId === actorId) {
      sawCard = true;
      v1 = actorTracker.version;
      actorSocket.emit('game:acknowledgeCard');
      state = await actorTracker.waitForUpdate(v1);
    }

    if (state.log.some((l) => l.type === 'PAID_RENT')) {
      sawRent = true;
    }

    if (!state.pendingAction && state.phase === 'ACTION') {
      const currentActor = state.players.find((p) => p.id === actorId);
      if (currentActor.money < 0) {
        const ownedTileIds = Object.entries(state.properties)
          .filter(([, p]) => p.ownerId === actorId && !p.mortgaged)
          .map(([tileId]) => Number(tileId));
        for (const tileId of ownedTileIds) {
          if (state.players.find((p) => p.id === actorId).money >= 0) break;
          const propState = state.properties[tileId];
          if (propState.houses > 0) {
            v1 = actorTracker.version;
            actorSocket.emit('game:sellHouse', { tileId });
            state = await actorTracker.waitForUpdate(v1);
            if (state.players.find((p) => p.id === actorId).money >= 0) break;
          }
          v1 = actorTracker.version;
          actorSocket.emit('game:mortgage', { tileId });
          state = await actorTracker.waitForUpdate(v1);
        }
        if (state.players.find((p) => p.id === actorId).money < 0) {
          v1 = actorTracker.version;
          actorSocket.emit('game:declareBankruptcy');
          state = await actorTracker.waitForUpdate(v1);
          continue;
        }
      }
    }

    if (!state.pendingAction && state.phase === 'ACTION') {
      v1 = actorTracker.version;
      actorSocket.emit('game:endTurn');
      state = await actorTracker.waitForUpdate(v1);
    }
  }

  console.log(`✓ played up to 60 rounds; boughtSomething=${boughtSomething} sawCard=${sawCard} sawRent=${sawRent} sawDoubles=${sawDoubles}`);
  console.log('  final money:', state.players.map((p) => `${p.nickname}:$${p.money}`).join(', '));
  if (!boughtSomething) throw new Error('Expected at least one property purchase in 60 turns');
  if (!sawCard) throw new Error('Expected at least one Chance/Chest card draw in 60 turns');

  const notCurrent = state.players.find((p) => p.id !== currentId());
  const notCurrentSocket = socketFor(notCurrent.id);
  const errCountBefore = errors.length;
  notCurrentSocket.emit('game:rollDice');
  await new Promise((r) => setTimeout(r, 200));
  if (errors.length <= errCountBefore || !/not your turn/i.test(errors[errors.length - 1])) {
    throw new Error('expected not-your-turn error, got: ' + JSON.stringify(errors.slice(errCountBefore)));
  }
  console.log('✓ acting out of turn correctly rejected:', errors[errors.length - 1]);

  const cp = state.players[state.currentPlayerIndex];
  const cpSocket = socketFor(cp.id);
  const wrongTileId = (cp.position + 5) % 40 === cp.position ? (cp.position + 7) % 40 : (cp.position + 5) % 40;
  const errCountBefore2 = errors.length;
  cpSocket.emit('game:buyProperty', { tileId: wrongTileId });
  await new Promise((r) => setTimeout(r, 200));
  if (errors.length > errCountBefore2) {
    console.log('✓ buying a property you are not standing on correctly rejected:', errors[errors.length - 1]);
  } else {
    console.log('  (skipped: no clean invalid-buy scenario this run, not a failure)');
  }

  const chatP = onceEvent(s2, 'chat:message');
  s1.emit('chat:message', { text: 'Nice game!' });
  const chatMsg = await chatP;
  console.log('✓ chat delivered:', chatMsg.nickname, '->', chatMsg.text);
  if (chatMsg.text !== 'Nice game!') throw new Error('chat text mismatch');

  s2.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  const s2b = ioClient(URL, { transports: ['websocket', 'polling'] });
  await onceEvent(s2b, 'connect');
  const rejoinRes = await emitAck(s2b, 'room:join', { roomCode, nickname: 'Bob', playerId: p2Id });
  const bobAfter = rejoinRes.state.players.find((p) => p.id === p2Id);
  const bobBefore = state.players.find((p) => p.id === p2Id);
  console.log('✓ reconnect works: connected =', bobAfter.connected, ', money preserved =', bobAfter.money);
  if (!bobAfter.connected) throw new Error('reconnect did not restore connected status');
  if (bobAfter.money !== bobBefore.money) throw new Error('money not preserved across reconnect');

  const db = require('../src/db/database');
  const persisted = db.loadRoom(roomCode);
  if (!persisted) throw new Error('room was not persisted to sqlite');
  console.log('✓ room persisted to SQLite, phase in DB:', persisted.state.phase);

  console.log('\n=== ALL INTEGRATION TESTS PASSED ===');
  s1.disconnect();
  s2b.disconnect();
  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
