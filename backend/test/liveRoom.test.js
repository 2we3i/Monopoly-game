// liveRoom.test.js
// The three things every online room now shares, driven over the real
// socket.io wire: watching a match without a seat, the grace period after
// a disconnect, and giving up.
//
// The scenarios here are the ones a player actually hits:
//   - a reconnect mid-game keeps the seat and keeps the state flowing
//     (the bug that made a full Mafia lobby refuse to start);
//   - a spectator joins a game already in progress and sees no secrets;
//   - a player who drops and comes back inside the grace is untouched;
//   - a player who drops and stays away is out when the grace expires;
//   - surrendering is immediate, final, and leaves the player watching;
//   - a seat somebody left cannot be taken back.

process.env.DISCONNECT_GRACE_MS = '700';

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { registerMafiaHandlers } = require('../src/socket/mafiaHandler');
const { registerThroneHandlers } = require('../src/socket/throneHandler');
const roomManager = require('../src/game/RoomManager');
const drops = require('../src/platform/dropTimers');
const spectators = require('../src/platform/spectators');

const PORT = 4021;
const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });
registerMafiaHandlers(io);
registerThroneHandlers(io);

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${msg}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  constructor(stateEvent, joinEvent = null) {
    this.socket = ioClient(`http://localhost:${PORT}`, { transports: ['websocket'], reconnectionDelay: 30, reconnectionDelayMax: 60 });
    this.state = null;
    this.states = 0;
    this.rejoin = null;
    this.socket.on(stateEvent, (s) => {
      this.state = s;
      this.states += 1;
    });
    // What the browser hooks do through lib/roomSession: re-announce the
    // seat on EVERY connect, because a reconnect is a new server socket.
    this.socket.on('connect', () => {
      if (this.rejoin) this.socket.emit(joinEvent, this.rejoin);
    });
  }

  ready() {
    return this.socket.connected ? Promise.resolve() : new Promise((r) => this.socket.once('connect', r));
  }

  // A real transient drop: socket.io reconnects on its own with a NEW
  // server-side socket, which is exactly the case the room has to survive.
  async blip() {
    this.socket.io.engine.close();
    await new Promise((r) => this.socket.once('connect', r));
  }

  async waitFor(predicate, label, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state && predicate(this.state)) return this.state;
      // eslint-disable-next-line no-await-in-loop
      await wait(20);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  close() { this.socket.close(); }
}

const seatOf = (state, id) => state.players.find((p) => p.id === id);

async function mafiaScenarios() {
  // eslint-disable-next-line no-console
  console.log('\nMafia rooms');
  const host = new Client('mafia:state', 'mafia:join');
  const guests = [0, 1, 2].map(() => new Client('mafia:state', 'mafia:join'));
  const watcher = new Client('mafia:state', 'mafia:join');
  await Promise.all([host, ...guests, watcher].map((c) => c.ready()));

  const account = registerAccount('Ann');
  const created = await emit(host.socket, 'mafia:create', { token: account.token, presetId: 'CLASSIC' });
  const { roomCode } = created;
  const hostId = created.playerId;
  host.rejoin = { roomCode, token: account.token };

  await Promise.all(guests.map((g, i) => {
    g.rejoin = {
      roomCode, nickname: `G${i}`, playerId: `guest-${i}`, guestKey: `k${i}`.repeat(20),
    };
    return emit(g.socket, 'mafia:join', g.rejoin);
  }));
  await host.waitFor((s) => s.players.length === 4, 'four players in the lobby');

  // --- the reconnect that used to lose the room --------------------------
  await host.blip();
  await host.waitFor((s) => s.players.length === 4 && seatOf(s, hostId)?.connected, 'the host is connected again');
  const start = await emit(host.socket, 'mafia:start', {});
  assert(start.ok === true, 'the host can still start the game after a reconnect');

  await host.waitFor((s) => s.phase !== 'LOBBY', 'the game left the lobby');
  await guests[0].waitFor((s) => s.phase !== 'LOBBY', 'every player was moved into the game');
  assert(guests[0].state.phase !== 'LOBBY', 'every player was moved into the game');

  // --- a spectator joins a game already running --------------------------
  const watching = await emit(watcher.socket, 'mafia:spectate', {
    roomCode, nickname: 'Watcher', playerId: 'watcher-1', guestKey: 'w'.repeat(40),
  });
  assert(watching.ok && watching.spectator === true, 'a spectator joins a game in progress');
  assert(watching.state.players.every((p) => p.role === null), 'no living role is in the spectator payload');
  assert(watching.state.you === null, 'a spectator has no seat in their own payload');
  await host.waitFor((s) => s.spectatorCount === 1, 'players are told a spectator arrived');
  assert(host.state.spectators[0].nickname === 'Watcher', 'the spectator is named in the room state');

  const beforeSpectatorStates = watcher.states;
  await emit(host.socket, 'mafia:skipPhase', {});
  await watcher.waitFor(() => watcher.states > beforeSpectatorStates, 'the spectator receives live updates');
  assert(true, 'a spectator keeps receiving state as the game moves on');

  // A spectator has no events with which to act on the game.
  const cannotVote = await emit(watcher.socket, 'mafia:vote', { targetId: hostId });
  assert(cannotVote.ok === false, 'a spectator cannot act in the game');

  // --- a drop inside the grace period ------------------------------------
  const rejoiner = guests[0];
  rejoiner.socket.io.engine.close();
  await host.waitFor((s) => seatOf(s, 'guest-0') && !seatOf(s, 'guest-0').connected, 'the table sees the drop');
  const dropsAt = seatOf(host.state, 'guest-0').dropsAt;
  assert(typeof dropsAt === 'number' && dropsAt > Date.now(), 'the table is given the moment the seat empties');
  assert(host.state.graceMs === 700, 'the grace period is part of the room state');

  await new Promise((r) => rejoiner.socket.once('connect', r));
  await host.waitFor((s) => seatOf(s, 'guest-0')?.connected, 'the player is back');
  assert(seatOf(host.state, 'guest-0').dropsAt === null, 'coming back in time clears the countdown');
  assert(seatOf(host.state, 'guest-0').alive === true, 'a short disconnect costs the player nothing');
  assert(drops.deadlineOf(roomCode, 'guest-0') === null, 'the timer is disarmed');

  // --- a drop that outlasts the grace period -----------------------------
  guests[1].rejoin = null;
  guests[1].close();
  await host.waitFor((s) => seatOf(s, 'guest-1')?.left === true, 'the seat empties once the grace runs out');
  assert(seatOf(host.state, 'guest-1').exitReason === 'timeout', 'the table is told why the seat emptied');
  assert(seatOf(host.state, 'guest-1').alive === false, 'a player who never came back is out of the game');

  // --- surrender ---------------------------------------------------------
  const quitter = guests[2];
  quitter.rejoin = null;
  const gave = await emit(quitter.socket, 'mafia:surrender', {});
  assert(gave.ok === true, 'a player may give up');
  await host.waitFor((s) => seatOf(s, 'guest-2')?.surrendered === true, 'everyone sees the surrender at once');
  assert(seatOf(host.state, 'guest-2').exitReason === 'surrender', 'surrender is recorded as a surrender, not a timeout');
  assert(seatOf(host.state, 'guest-2').alive === false, 'a player who gave up is out of the game');
  await quitter.waitFor((s) => s.spectating === true, 'the player who gave up is moved to the gallery');

  const again = await emit(quitter.socket, 'mafia:surrender', {});
  assert(again.ok === false, 'giving up twice does nothing the second time');

  // --- a seat that is gone stays gone ------------------------------------
  const retake = await emit(quitter.socket, 'mafia:join', {
    roomCode, nickname: 'G2', playerId: 'guest-2', guestKey: 'k2'.repeat(20),
  });
  assert(retake.ok === false && retake.code === 'SEAT_GONE', 'a surrendered seat cannot be taken back');

  const watchInstead = await emit(quitter.socket, 'mafia:spectate', {
    roomCode, nickname: 'G2', playerId: 'guest-2', guestKey: 'k2'.repeat(20),
  });
  assert(watchInstead.ok === true, 'but the room is still open to watch');

  [host, ...guests, watcher].forEach((c) => c.close());
  await wait(150);
  assert(spectators.count(roomCode) === 0, 'closing a spectator tab empties the gallery');
}

async function throneScenarios() {
  // eslint-disable-next-line no-console
  console.log('\nIron Throne rooms');
  const host = new Client('throne:state', 'throne:join');
  const lord = new Client('throne:state', 'throne:join');
  const watcher = new Client('throne:state', 'throne:join');
  await Promise.all([host, lord, watcher].map((c) => c.ready()));

  const account = registerAccount('Robert');
  const created = await emit(host.socket, 'throne:create', { token: account.token, settings: { turnSec: 0 } });
  const { roomCode } = created;
  await emit(lord.socket, 'throne:join', {
    roomCode, nickname: 'Ned', playerId: 'lord-ned', guestKey: 'n'.repeat(40),
  });
  await host.waitFor((s) => s.players.length === 2, 'two lords in the lobby');
  await emit(host.socket, 'throne:start', {});
  await host.waitFor((s) => s.phase === 'PLAY', 'the war begins');

  const watching = await emit(watcher.socket, 'throne:spectate', {
    roomCode, nickname: 'Maester', playerId: 'maester-1', guestKey: 'm'.repeat(40),
  });
  assert(watching.ok === true, 'a spectator joins the war in progress');
  assert(watching.state.game && !watching.state.game.rng, 'the dice seed is not in the spectator payload');
  assert(Object.values(watching.state.game.houses).every((h) => h.hand.length === 0), 'no tactic cards reach a spectator');
  assert(watching.state.you === null, 'a spectator leads no house');

  const gave = await emit(lord.socket, 'throne:surrender', {});
  assert(gave.ok === true, 'a lord may give up');
  await host.waitFor((s) => s.players.find((p) => p.id === 'lord-ned')?.surrendered === true, 'the council sees the surrender');
  const state = host.state;
  assert(state.game.houses[state.players.find((p) => p.id === 'lord-ned').house].control === 'ai', 'the computer takes the abandoned house');

  [host, lord, watcher].forEach((c) => c.close());
}

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  await mafiaScenarios();
  await throneScenarios();
  await wait(100);
  // eslint-disable-next-line no-console
  console.log(`\n=== LIVE ROOM TESTS PASSED (${passed} checks) ===`);
  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
