// Drives a Catan game over the real socket.io wire with three clients:
// a registered host and two guests. Proves what the engine tests cannot
// reach - that guests cannot start, that each player receives a different
// payload (their own hand, nobody else's), that the opening placement,
// the dice and the turn order work end to end, and that a leaving player
// keeps the room alive.

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { registerCatanHandlers } = require('../src/socket/catanHandler');
const roomManager = require('../src/game/RoomManager');

const PORT = 4017;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerCatanHandlers(io);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out on ${event}`)), 5000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

class Client {
  constructor(name) {
    this.name = name;
    this.socket = ioClient(`http://localhost:${PORT}`, { transports: ['websocket'] });
    this.state = null;
    this.socket.on('catan:state', (s) => { this.state = s; });
    this.socket.on('catan:error', (e) => { this.lastError = e.message; });
  }

  ready() {
    return new Promise((resolve) => this.socket.on('connect', resolve));
  }

  async waitFor(predicate, label, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state && predicate(this.state)) return this.state;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`Timed out waiting for ${label} (phase=${this.state?.phase})`);
  }

  close() { this.socket.close(); }
}

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const names = ['Ann', 'Bob', 'Cy'];
  const clients = names.map((n) => new Client(n));
  await Promise.all(clients.map((c) => c.ready()));
  const [host, bob, cy] = clients;

  const guestCreate = await emit(bob.socket, 'catan:create', { nickname: 'Bob', playerId: 'g-bob' });
  assert(guestCreate.ok === false && guestCreate.code === 'GUEST_CANNOT_CREATE', 'a guest cannot create a Catan room');

  const account = registerAccount('Ann');
  const created = await emit(host.socket, 'catan:create', { token: account.token, settings: { victoryPoints: 10, turnSec: 0 } });
  assert(created.ok && created.roomCode, 'the registered host creates a room');
  const { roomCode } = created;
  host.state = created.state;
  assert(roomManager.roomKind(roomCode) === 'catan', 'the room manager knows the code is a Catan room');

  const joinB = await emit(bob.socket, 'catan:join', { roomCode, nickname: 'Bob', playerId: 'g-bob', guestKey: 'k'.repeat(64) });
  const joinC = await emit(cy.socket, 'catan:join', { roomCode, nickname: 'Cy', playerId: 'g-cy', guestKey: 'c'.repeat(64) });
  assert(joinB.ok && joinC.ok, 'guests join by code');
  bob.state = joinB.state;
  cy.state = joinC.state;
  await host.waitFor((s) => s.players.length === 3, 'three players in the lobby');

  const guestStart = await emit(bob.socket, 'catan:start', {});
  assert(guestStart.ok === false, 'a guest cannot start the game');
  const settings = await emit(host.socket, 'catan:settings', { settings: { victoryPoints: 8 } });
  assert(settings.ok, 'the host changes the target score');
  const started = await emit(host.socket, 'catan:start', {});
  assert(started.ok, 'the host starts the game');
  await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'SETUP', `${c.name} sees the setup`)));
  assert(host.state.settings.victoryPoints === 8, 'settings carried into the game');
  assert(host.state.board && host.state.board.hexes.length === 19, 'the island is in the payload');

  const byId = {};
  clients.forEach((c) => { byId[c.state.you.id] = c; });

  // Out of turn placement is refused over the wire.
  const actorId = host.state.setup.playerId;
  const idle = clients.find((c) => c.state.you.id !== actorId);
  const refused = await emit(idle.socket, 'catan:buildSettlement', { vertexId: 0 });
  assert(refused.ok === false && /not your turn/.test(refused.error), 'placing out of turn is refused');

  // Opening placement, each client using the legal spots in its own payload.
  const placed = (s) => s.buildings.length + s.roads.length;
  for (let step = 0; step < 12; step += 1) {
    // eslint-disable-next-line no-await-in-loop
    await host.waitFor((s) => placed(s) === step, `placement ${step} to be visible`);
    const actor = byId[host.state.setup.playerId];
    const kind = step % 2 === 0 ? 'SETTLEMENT' : 'ROAD';
    // eslint-disable-next-line no-await-in-loop
    await actor.waitFor((s) => s.you.setupTurn && placed(s) === step && s.setup.step === kind, `${actor.name}'s placement turn`);
    const { legal } = actor.state.you;
    const res = kind === 'SETTLEMENT'
      // eslint-disable-next-line no-await-in-loop
      ? await emit(actor.socket, 'catan:buildSettlement', { vertexId: legal.settlements[0] })
      // eslint-disable-next-line no-await-in-loop
      : await emit(actor.socket, 'catan:buildRoad', { edgeId: legal.roads[0] });
    assert(res.ok, `placement step ${step} accepted (${res.error || ''})`);
  }
  await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'PLAY', `${c.name} sees play begin`)));
  assert(host.state.buildings.length === 6 && host.state.roads.length === 6, 'six settlements and six roads on the island');

  // Each payload carries only its own hand.
  clients.forEach((c) => {
    assert(c.state.you.resources && typeof c.state.you.resources.wood === 'number', `${c.name} sees their own hand`);
    assert(c.state.players.every((p) => p.resources === undefined), `${c.name} never sees another hand`);
  });
  const total = (s) => Object.values(s.you.resources).reduce((a, b) => a + b, 0);
  clients.forEach((c) => {
    const row = host.state.players.find((p) => p.id === c.state.you.id);
    assert(row.resourceCount === total(c.state), 'the public card count matches the private hand');
  });

  // Roll, then end the turn; the next player in order is up.
  const first = byId[host.state.turn.playerId];
  const endEarly = await emit(first.socket, 'catan:endTurn', {});
  assert(endEarly.ok === false && /Roll/.test(endEarly.error), 'the turn cannot end before rolling');
  const rolled = await emit(first.socket, 'catan:roll', {});
  assert(rolled.ok, 'the current player rolls');
  await first.waitFor((s) => s.lastRoll && s.lastRoll.total >= 2, 'the roll to arrive');
  const roll = first.state.lastRoll;
  assert(roll.dice[0] + roll.dice[1] === roll.total, 'two dice make the total');

  // Resolve a seven if one came up, then end the turn.
  for (let guard = 0; guard < 10; guard += 1) {
    const s = first.state;
    if (s.turn.step === 'MAIN') break;
    if (s.turn.step === 'DISCARD') {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(Object.entries(s.turn.discards).map(async ([pid, count]) => {
        const c = byId[pid];
        const chosen = {};
        let left = count;
        Object.entries(c.state.you.resources).forEach(([r, n]) => {
          const take = Math.min(n, left);
          if (take) chosen[r] = take;
          left -= take;
        });
        await emit(c.socket, 'catan:discard', { resources: chosen });
      }));
    } else if (s.turn.step === 'ROBBER') {
      // eslint-disable-next-line no-await-in-loop
      await emit(first.socket, 'catan:moveRobber', { hexId: s.you.legal.robberHexes[0] });
    } else if (s.turn.step === 'STEAL') {
      // eslint-disable-next-line no-await-in-loop
      await emit(first.socket, 'catan:steal', { victimId: s.turn.stealFrom[0] });
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 80));
  }
  assert(first.state.turn.step === 'MAIN', 'the turn reaches its main step');

  const bank = await emit(first.socket, 'catan:bankTrade', { give: 'wood', get: 'ore', amount: 5 });
  assert(bank.ok === false, 'a bank trade without the cards is refused');

  const ended = await emit(first.socket, 'catan:endTurn', {});
  assert(ended.ok, 'the turn ends');
  const order = host.state.order;
  const expectedNext = order[(order.indexOf(first.state.you.id) + 1) % order.length];
  await host.waitFor((s) => s.turn.playerId === expectedNext && s.turn.step === 'ROLL', 'the next player to be up');

  // A guest leaving mid-game keeps the room; the seat stays.
  cy.socket.emit('catan:leave');
  await host.waitFor((s) => s.players.find((p) => p.nickname === 'Cy')?.left, 'Cy to be marked as left');
  assert(roomManager.getCatanRoom(roomCode), 'the room survives a player leaving');

  // Chat reaches the room.
  const chatSeen = new Promise((resolve) => bob.socket.once('catan:chat', resolve));
  host.socket.emit('catan:chat', { text: 'Wood for sheep?' });
  const msg = await chatSeen;
  assert(msg.text === 'Wood for sheep?', 'room chat is delivered');

  clients.forEach((c) => c.close());
  io.close();
  server.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Catan socket test passed');
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
