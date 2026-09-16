// Drives an Iron Throne room over the real socket.io wire with three
// clients: a registered host and two guests. Proves what the room tests
// cannot reach - that guests cannot create or start, that each lord
// receives a different payload (their own tactic cards, nobody else's, and
// never the dice seed), that turns, alliance offers and computer houses
// work end to end, and that a leaving lord hands their house to the
// computer while the room lives on.

process.env.THRONE_AI_STEP_MS = '40';
process.env.THRONE_AI_BATTLE_MS = '60';

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { registerThroneHandlers } = require('../src/socket/throneHandler');
const roomManager = require('../src/game/RoomManager');
const registry = require('../src/platform/registry');

const PORT = 4018;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerThroneHandlers(io);

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
    this.socket.on('throne:state', (s) => { this.state = s; });
  }

  ready() {
    return new Promise((resolve) => this.socket.on('connect', resolve));
  }

  async waitFor(predicate, label, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state && predicate(this.state)) return this.state;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`Timed out waiting for ${label} (phase=${this.state?.phase})`);
  }

  act(action) {
    return emit(this.socket, 'throne:act', { action });
  }

  close() { this.socket.close(); }
}

const turnOf = (s) => s.game.order[s.game.turn];

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const clients = ['Ann', 'Bob', 'Cy'].map((n) => new Client(n));
  await Promise.all(clients.map((c) => c.ready()));
  const [host, bob, cy] = clients;

  const guestCreate = await emit(bob.socket, 'throne:create', { nickname: 'Bob', playerId: 'g-bob' });
  assert(guestCreate.ok === false && guestCreate.code === 'GUEST_CANNOT_CREATE', 'a guest cannot create a room');

  const account = registerAccount('Ann');
  const created = await emit(host.socket, 'throne:create', { token: account.token, settings: { target: 7, turnSec: 0 } });
  assert(created.ok && created.roomCode, 'the registered host creates a room');
  const { roomCode } = created;
  host.state = created.state;
  assert(roomManager.roomKind(roomCode) === 'throne', 'the room manager knows the code is an Iron Throne room');

  const joinB = await emit(bob.socket, 'throne:join', { roomCode, nickname: 'Bob', playerId: 'g-bob', guestKey: 'b'.repeat(64) });
  const joinC = await emit(cy.socket, 'throne:join', { roomCode, nickname: 'Cy', playerId: 'g-cy', guestKey: 'c'.repeat(64) });
  assert(joinB.ok && joinC.ok, 'guests join by code');
  bob.state = joinB.state;
  cy.state = joinC.state;
  await host.waitFor((s) => s.players.length === 3, 'three lords in the lobby');
  const houses = host.state.players.map((p) => p.house);
  assert(new Set(houses).size === 3, 'every lord leads a different house');

  const taken = await emit(bob.socket, 'throne:house', { house: host.state.you.house });
  assert(taken.ok === false && /already leads/.test(taken.error), 'a house held by another lord cannot be taken');
  const moved = await emit(bob.socket, 'throne:house', { house: 'martell' });
  assert(moved.ok, 'a lord picks a free house');
  const aiByGuest = await emit(bob.socket, 'throne:ai', { house: 'tyrell', on: true });
  assert(aiByGuest.ok === false, 'a guest cannot seat the computer');
  const freeHouse = ['stark', 'lannister', 'baratheon', 'greyjoy', 'tyrell'].find((h) => !host.state.players.some((p) => p.house === h) && h !== 'martell');
  const ai = await emit(host.socket, 'throne:ai', { house: freeHouse, on: true });
  assert(ai.ok, 'the host gives a free house to the computer');

  const guestStart = await emit(bob.socket, 'throne:start', {});
  assert(guestStart.ok === false, 'a guest cannot start the game');
  const started = await emit(host.socket, 'throne:start', {});
  assert(started.ok, 'the host starts the game');
  await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'PLAY' && s.game, `${c.name} sees the war begin`)));
  assert(host.state.game.order.length === 4, 'three lords and one computer house take part');
  assert(host.state.game.houses[freeHouse].control === 'ai', 'the computer house is AI-controlled');

  // Each payload carries only its own tactic cards and never the dice seed.
  clients.forEach((c) => {
    const g = c.state.game;
    assert(g.rng === undefined && g.cardDeck.length === 0, `${c.name} never receives the seed or the deck order`);
    assert(g.houses[c.state.you.house].hand.length === 1, `${c.name} sees their own card`);
    Object.values(g.houses).filter((h) => h.id !== c.state.you.house).forEach((h) => {
      assert(h.hand.length === 0 && h.handCount === 1, `${c.name} sees other hands only as counts`);
    });
  });

  const byHouse = {};
  clients.forEach((c) => { byHouse[c.state.you.house] = c; });

  // Out of turn is refused; the current lord acts and passes the turn.
  const firstHouse = turnOf(host.state);
  const firstLord = byHouse[firstHouse];
  const idle = clients.find((c) => c !== firstLord);
  const refused = await idle.act({ type: 'endTurn' });
  assert(refused.ok === false && /not your turn/.test(refused.error), 'acting out of turn is refused');
  const bogus = await firstLord.act({ type: 'recruit', territory: 'nowhere', unit: 'z' });
  assert(bogus.ok === false, 'a malformed action is refused');

  const seat = { stark: 'winterfell', lannister: 'lannisport', baratheon: 'storms_end', greyjoy: 'pyke', tyrell: 'highgarden', martell: 'sunspear' }[firstHouse];
  const recruited = await firstLord.act({ type: 'recruit', territory: seat, unit: 'f' });
  assert(recruited.ok, `the current lord raises troops (${recruited.error || ''})`);
  await host.waitFor((s) => s.game.lands[seat].f === 3, 'the new footman is visible to everyone');

  // An alliance offer waits for the other lord, who answers over the wire.
  const partner = clients.find((c) => c !== firstLord);
  const offered = await firstLord.act({ type: 'propose', to: partner.state.you.house });
  assert(offered.ok, 'the current lord offers an alliance');
  await partner.waitFor((s) => s.game.proposal?.to === s.you.house, 'the offer to reach its target');
  const answered = await partner.act({ type: 'respond', accept: true });
  assert(answered.ok, 'the target answers the offer');
  await host.waitFor((s) => s.game.alliances.length === 1, 'the alliance to be visible');

  // Everyone ends their turn; the computer house plays by itself.
  const round = host.state.game.round;
  for (let guard = 0; guard < 30; guard += 1) {
    const s = host.state;
    if (s.game.round > round && turnOf(s) === firstHouse) break;
    // A computer house may offer an alliance to a lord mid-turn, and the
    // room waits on that lord until they answer (or the offer times out
    // 45 s later). A real client shows the offer and the player answers
    // it, so the test does the same rather than sitting out the clock.
    if (s.game.proposal && byHouse[s.game.proposal.to]) {
      // eslint-disable-next-line no-await-in-loop
      await byHouse[s.game.proposal.to].act({ type: 'respond', accept: false });
      // eslint-disable-next-line no-await-in-loop
      await host.waitFor((next) => !next.game.proposal, 'the offer to be answered');
      continue; // eslint-disable-line no-continue
    }
    const house = turnOf(s);
    if (s.game.houses[house].control === 'human') {
      const res = await byHouse[house].act({ type: 'endTurn' }); // eslint-disable-line no-await-in-loop
      assert(res.ok, `${house} ends the turn (${res.error || ''})`);
    }
    // eslint-disable-next-line no-await-in-loop
    await host.waitFor((next) => next.game.turnNo > s.game.turnNo || next.game.proposal, `the turn after ${house}`);
  }
  assert(host.state.game.round === round + 1, 'a full round passed, the computer house included');
  assert(host.state.game.log.some((e) => e.house === freeHouse && e.key === 'turnStart'), 'the computer house took its turn');

  // Chat reaches the room.
  const chatSeen = new Promise((resolve) => bob.socket.once('throne:chat', resolve));
  host.socket.emit('throne:chat', { text: 'Winter is coming' });
  const msg = await chatSeen;
  assert(msg.text === 'Winter is coming', 'room chat is delivered');

  // A lord who leaves hands the house to the computer; the room lives on.
  const cyHouse = cy.state.you.house;
  cy.socket.emit('throne:leave');
  await host.waitFor((s) => s.game.houses[cyHouse].control === 'ai' && s.players.find((p) => p.nickname === 'Cy')?.left, 'Cy\'s house to pass to the computer');
  assert(roomManager.getThroneRoom(roomCode), 'the room survives a lord leaving');
  const summary = registry.find(roomCode).adapter.summary(roomManager.getThroneRoom(roomCode));
  assert(summary.gameType === 'throne' && summary.stage === 'active' && summary.players.length === 3, 'the admin view describes the room');

  clients.forEach((c) => c.close());
  io.close();
  server.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Iron Throne socket test passed');
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
