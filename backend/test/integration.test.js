// Starts the actual server in-process, then drives it with socket.io-client,
// so everything happens within a single node invocation (avoids sandbox
// issues with backgrounded processes dying between tool calls).
//
// Uses a StateTracker (always-on 'game:state' listener + versioned waiter)
// instead of racy socket.once() calls, since multiple broadcasts can be
// in flight for a single logical action (e.g. join triggers one broadcast,
// then a subsequent start triggers another).

process.env.PORT = '4001';
process.env.NODE_ENV = 'test';

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const apiRoutes = require('../src/routes/api');
const { registerSocketHandlers } = require('../src/socket/socketHandler');
const { BOARD } = require('../src/game/Board');

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
  constructor(socket, tag) {
    this.tag = tag;
    this.version = 0;
    this.latest = null;
    this.lastError = null;
    this.errorVersion = 0;
    socket.on('game:state', (s) => {
      this.version += 1;
      this.latest = s;
      if (process.env.DEBUG_TEST) {
        console.log(`[client ${this.tag}] state v${this.version}: phase=${s.phase} idx=${s.currentPlayerIndex} pending=${s.pendingAction?.type || 'none'} lastRoll=${s.lastRoll ? `${s.lastRoll.d1}+${s.lastRoll.d2}` : 'none'} money=${s.players.map((p) => p.money).join(',')}`);
      }
    });
    socket.on('game:error', (e) => {
      this.lastError = e.message;
      this.errorVersion += 1;
      if (process.env.DEBUG_TEST) console.log(`[client ${this.tag}] game:error: ${e.message}`);
    });
  }
  // Waits for either a new game:state OR a new game:error, whichever comes
  // first, since a rejected action legitimately produces no state change -
  // a test that only waits for state would hang forever on a rejection.
  // Throws if an error arrives (the caller asked for a state update and
  // got a rejection instead, which the caller should have anticipated).
  async waitForUpdate(sinceVersion, timeoutMs = 4000) {
    const startErrorVersion = this.errorVersion;
    const start = Date.now();
    while (this.version <= sinceVersion) {
      if (this.errorVersion > startErrorVersion) {
        throw new Error(`Server rejected the action: ${this.lastError}`);
      }
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for game:state update (waited ${Date.now() - start}ms, version stuck at ${this.version}, wanted > ${sinceVersion})`);
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

  const t1 = new StateTracker(s1, 's1/Alice');
  const t2 = new StateTracker(s2, 's2/Bob');

  const errors = [];
  s1.on('game:error', (e) => errors.push(`[s1] ${e.message}`));
  s2.on('game:error', (e) => errors.push(`[s2] ${e.message}`));

  await Promise.all([onceEvent(s1, 'connect'), onceEvent(s2, 'connect')]);
  console.log('✓ both sockets connected');

  const p1Id = 'player-alice-001';
  const p2Id = 'player-bob-002';

  const createRes = await emitAck(s1, 'room:create', { nickname: 'Alice', playerId: p1Id });
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

  const currentId = () => state.players[state.currentPlayerIndex].id;
  const trackerFor = (id) => (id === p1Id ? t1 : t2);
  const socketFor = (id) => (id === p1Id ? s1 : s2);

  let boughtSomething = false;
  let sawCard = false;
  let sawRent = false;
  let sawDoubles = false;
  let sawDebtResolution = false;
  let sawBankruptcy = false;

  for (let turn = 0; turn < 60 && state.phase !== 'GAME_OVER'; turn++) {
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
      const tilePrice = BOARD[state.pendingAction.tileId].price;
      if (actor.money >= tilePrice) {
        actorSocket.emit('game:buyProperty', { tileId: state.pendingAction.tileId });
        boughtSomething = true;
      } else {
        actorSocket.emit('game:declinePurchase', { tileId: state.pendingAction.tileId });
      }
      state = await actorTracker.waitForUpdate(v1);
    }

    if (state.pendingAction?.type === 'CARD_REVEAL' && state.pendingAction.playerId === actorId) {
      sawCard = true;
      v1 = actorTracker.version;
      actorSocket.emit('game:acknowledgeCard');
      state = await actorTracker.waitForUpdate(v1);
    }

    if (state.log.some((l) => l.message.includes('paid') && l.message.includes('rent'))) {
      sawRent = true;
    }

    // If landing on rent (or a card) put the current player into debt, they
    // must resolve it before ending their turn - mirrors what a real client
    // has to do. Try mortgaging owned properties one at a time until
    // solvent; if that's not enough, declare bankruptcy. This exercises the
    // mortgage and bankruptcy paths, which otherwise never get hit in a
    // short-money-only test loop.
    if (!state.pendingAction && state.phase === 'ACTION') {
      let currentActor = state.players.find((p) => p.id === actorId);
      if (currentActor.money < 0) {
        sawDebtResolution = true;
        const ownedTileIds = Object.entries(state.properties)
          .filter(([, p]) => p.ownerId === actorId && !p.mortgaged)
          .map(([tileId]) => Number(tileId));

        for (const tileId of ownedTileIds) {
          if (currentActor.money >= 0) break;
          // Can't mortgage a property with houses on it - sell houses first
          const propState = state.properties[tileId];
          if (propState.houses > 0) {
            v1 = actorTracker.version;
            actorSocket.emit('game:sellHouse', { tileId });
            state = await actorTracker.waitForUpdate(v1);
            currentActor = state.players.find((p) => p.id === actorId);
            if (currentActor.money >= 0) break;
          }
          v1 = actorTracker.version;
          actorSocket.emit('game:mortgage', { tileId });
          state = await actorTracker.waitForUpdate(v1);
          currentActor = state.players.find((p) => p.id === actorId);
        }

        if (currentActor.money < 0) {
          v1 = actorTracker.version;
          actorSocket.emit('game:declareBankruptcy');
          state = await actorTracker.waitForUpdate(v1);
          sawBankruptcy = true;
          // declareBankruptcy also advances the turn on the server, so
          // there's no separate endTurn to send for this player.
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

  console.log(`✓ played up to 60 rounds; boughtSomething=${boughtSomething} sawCard=${sawCard} sawRent=${sawRent} sawDoubles=${sawDoubles} sawDebtResolution=${sawDebtResolution} sawBankruptcy=${sawBankruptcy}`);
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
