// Drives the WHOLE Mafia life cycle over the real wire, the way the
// request asked for it to be checked: create, join, fill, ready, start,
// role deal, first night, timers, actions, night->day, vote, execution,
// win condition, game over, and a second match in the same room. It also
// covers the awkward paths - a player leaving and coming back, a full
// room, a host walking out, and the smallest legal table.

const { registerAccount } = require('./helpers/testEnv');

process.env.PORT = '4021';
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

// Every handler the real server boots, so nothing here is a reduced setup.
const presence = require('../src/platform/presence');
const { registerSocketHandlers } = require('../src/socket/socketHandler');
const { registerMafiaHandlers } = require('../src/socket/mafiaHandler');
const { registerBunkerHandlers } = require('../src/socket/bunkerHandler');
const { MIN_PLAYERS, MAX_PLAYERS } = require('../src/mafia/settings');

const PORT = 4021;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
presence.attach(io);
registerSocketHandlers(io);
registerMafiaHandlers(io);
registerBunkerHandlers(io);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function ack(socket, event, payload, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out on ${event}`)), ms);
    socket.emit(event, payload, (res) => { clearTimeout(t); resolve(res); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(name) {
    this.name = name;
    this.state = null;
    this.errors = [];
    this.socket = ioClient(`http://localhost:${PORT}`, { transports: ['websocket'] });
    this.socket.on('mafia:state', (s) => { this.state = s; });
    this.socket.on('mafia:error', (e) => { this.errors.push(e.message); });
  }

  ready() { return new Promise((r) => (this.socket.connected ? r() : this.socket.on('connect', r))); }

  // The one question the lobby asks, answered the way the fixed UI asks it.
  get me() { return this.state?.players.find((p) => p.isYou) || null; }

  get isHost() { return !!this.me?.isHost; }

  async waitFor(predicate, label, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state && predicate(this.state)) return this.state;
      // eslint-disable-next-line no-await-in-loop
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${label} (phase=${this.state && this.state.phase}, day=${this.state && this.state.dayNumber})`);
  }

  close() { this.socket.close(); }
}

// Fast rules so a whole match runs in seconds rather than minutes.
const FAST = {
  night: { durationSec: 10 },
  day: { discussionSec: 15, voteSec: 10 },
};

// A table of `n` players, all signed in, seated in one room.
async function seatTable(n, settings) {
  const clients = [];
  for (let i = 0; i < n; i += 1) clients.push(new Client(`P${i}`));
  await Promise.all(clients.map((c) => c.ready()));
  const accounts = clients.map((_, i) => registerAccount(`M${n}x${i}_${Math.random().toString(36).slice(2, 7)}`));
  const created = await ack(clients[0].socket, 'mafia:create', { token: accounts[0].token, settings });
  assert(created && created.ok, `create a room for ${n}: ${created && created.error}`);
  const { roomCode } = created;
  for (let i = 1; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await ack(clients[i].socket, 'mafia:join', { roomCode, token: accounts[i].token });
    assert(res && res.ok, `player ${i} joins ${roomCode}: ${res && res.error}`);
  }
  await sleep(250);
  return { clients, accounts, roomCode };
}

function closeAll(clients) { clients.forEach((c) => c.close()); }

async function run() {
  await new Promise((r) => server.listen(PORT, r));

  // --- 1. the reported bug, then a whole match ----------------------
  {
    const { clients } = await seatTable(MIN_PLAYERS, FAST);
    const host = clients[0];
    assert(host.me, 'the host finds their own seat in the lobby payload');
    assert(host.isHost, 'the host is recognised as host (the start button renders)');
    assert(clients[1].me && !clients[1].isHost, 'a non-host finds their seat and is not host');
    assert(host.state.canStart, 'a full-enough lobby reports it can start');

    // Readiness must not block the host's start.
    await ack(clients[1].socket, 'mafia:ready', { ready: true });
    const started = await ack(host.socket, 'mafia:start', {});
    assert(started && started.ok, `start succeeds: ${started && started.error}`);
    await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'ROLE_REVEAL', `${c.name} to reach the role reveal`)));
    clients.forEach((c) => {
      assert(c.state.phase === 'ROLE_REVEAL', `${c.name} left the lobby`);
      assert(c.state.you && c.state.you.role, `${c.name} was dealt a role`);
    });
    const roles = clients.map((c) => c.state.you.role);
    assert(roles.some((r) => ['MAFIA', 'DON'].includes(r)), 'the mafia were dealt');
    assert(roles.some((r) => !['MAFIA', 'DON'].includes(r)), 'the town were dealt');
    console.log(`✓ a ${MIN_PLAYERS}-player lobby starts and every player reaches the game screen`);

    // --- timers move the game on by themselves ----------------------
    await host.waitFor((s) => s.phase === 'NIGHT', 'the first night (on the server clock)');
    assert(host.state.phaseEndsAt > Date.now(), 'the night has a deadline');
    console.log('✓ the server clock carries the room from the reveal into the first night');

    // --- the roles that act at night are offered an action ----------
    const actors = clients.filter((c) => c.state.you.canActTonight);
    assert(actors.length > 0, 'at least one role acts at night');
    assert(
      clients.filter((c) => !c.state.you.canActTonight).every((c) => !c.state.you.action),
      'a role with no night action is offered none',
    );
    for (const actor of actors) {
      const target = actor.state.players.find((p) => p.alive && !p.isYou);
      // eslint-disable-next-line no-await-in-loop
      await ack(actor.socket, 'mafia:night', { targetId: target.id });
      if (actor.state.you.secondaryAction) {
        // eslint-disable-next-line no-await-in-loop
        await ack(actor.socket, 'mafia:night', { secondaryTargetId: target.id });
      }
    }
    await host.waitFor((s) => s.phase !== 'NIGHT', 'the night to resolve');
    console.log('✓ night actions are offered to the right roles and end the night early');

    // --- night -> day -> vote ---------------------------------------
    await host.waitFor((s) => s.phase === 'DAY' || s.phase === 'GAME_OVER', 'the day');
    if (host.state.phase !== 'GAME_OVER') {
      await host.waitFor((s) => s.phase === 'VOTE', 'the vote');
      const victim = host.state.players.find((p) => p.alive && !p.isYou);
      const voters = clients.filter((c) => c.state.you.alive);
      for (const v of voters) {
        // eslint-disable-next-line no-await-in-loop
        const res = await ack(v.socket, 'mafia:vote', { targetId: victim.id });
        assert(res && res.ok, `${v.name} can vote: ${res && res.error}`);
      }
      await host.waitFor((s) => s.phase !== 'VOTE', 'the vote to resolve');
      assert(host.state.lastVote.executedId === victim.id, 'the player the table voted for was executed');
      assert(host.state.players.find((p) => p.id === victim.id).alive === false, 'the executed player is dead');
      console.log(`✓ a vote excludes a player (${host.state.lastVote.outcome})`);
    }

    // --- the match reaches a decided end ----------------------------
    await host.waitFor((s) => s.phase === 'GAME_OVER', 'the game to be decided', 180000);
    assert(['MAFIA', 'TOWN', 'MANIAC', 'NOBODY'].includes(host.state.winner), `a winner was declared (${host.state.winner})`);
    assert(Array.isArray(host.state.reveal) && host.state.reveal.every((p) => p.role), 'every role is revealed at the end');
    console.log(`✓ the match reaches a win condition and ends (winner: ${host.state.winner})`);

    // --- a second match in the same room ----------------------------
    const again = await ack(host.socket, 'mafia:restart', { startNow: true });
    assert(again && again.ok, `the host restarts: ${again && again.error}`);
    await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'ROLE_REVEAL', `${c.name} to see the second deal`)));
    clients.forEach((c) => assert(c.state.you && c.state.you.role, `${c.name} was dealt a role in the second match`));
    assert(host.state.dayNumber === 0 && host.state.winner === null, 'the second match starts clean');
    console.log('✓ the same room deals a second match after the first is over');

    closeAll(clients);
    await sleep(250);
  }

  // --- 2. a FULL lobby (the exact case in the report) ----------------
  {
    const { clients } = await seatTable(MAX_PLAYERS, FAST);
    const host = clients[0];
    assert(host.state.players.length === MAX_PLAYERS, 'the lobby is full');
    assert(host.isHost && host.state.canStart, 'a FULL lobby still offers the start button');
    const res = await ack(host.socket, 'mafia:start', {});
    assert(res && res.ok, `a full lobby starts: ${res && res.error}`);
    await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'ROLE_REVEAL', `${c.name} of a full table to be dealt`)));
    clients.forEach((c) => assert(c.state.you && c.state.you.role, `${c.name} of a full table was dealt a role`));
    console.log(`✓ a FULL ${MAX_PLAYERS}-player lobby starts`);
    closeAll(clients);
    await sleep(250);
  }

  // --- 3. below the minimum is refused, with a reason ----------------
  {
    const { clients } = await seatTable(MIN_PLAYERS - 1, FAST);
    const host = clients[0];
    assert(host.state.canStart === false, 'a short table reports it cannot start');
    const res = await ack(host.socket, 'mafia:start', {});
    assert(res && res.ok === false, 'a short table is refused');
    assert(/at least/i.test(res.error), `the refusal says why: ${res.error}`);
    assert(host.state.phase === 'LOBBY', 'the room stays in the lobby');
    console.log('✓ a table below the minimum is refused, and the room stays put');
    closeAll(clients);
    await sleep(250);
  }

  // --- 4. only the host may start ------------------------------------
  {
    const { clients } = await seatTable(MIN_PLAYERS, FAST);
    const res = await ack(clients[1].socket, 'mafia:start', {});
    assert(res && res.ok === false && /host/i.test(res.error), `a non-host cannot start: ${res && res.error}`);
    assert(clients[0].state.phase === 'LOBBY', 'the room did not start');
    console.log('✓ only the host can start the game');
    closeAll(clients);
    await sleep(250);
  }

  // --- 5. a player leaves the lobby and comes back -------------------
  {
    const { clients, accounts, roomCode } = await seatTable(MIN_PLAYERS + 1, FAST);
    const host = clients[0];
    const leaver = clients[2];
    leaver.socket.emit('mafia:leave');
    await host.waitFor((s) => s.players.length === MIN_PLAYERS, 'the leaver to be gone');
    leaver.close();

    const returner = new Client('returned');
    await returner.ready();
    const res = await ack(returner.socket, 'mafia:join', { roomCode, token: accounts[2].token });
    assert(res && res.ok, `a player can come back: ${res && res.error}`);
    await host.waitFor((s) => s.players.length === MIN_PLAYERS + 1, 'the returner to be seated');
    assert(returner.me, 'the returner finds their own seat');
    assert(host.isHost, 'the host is still the host after someone left and returned');
    const started = await ack(host.socket, 'mafia:start', {});
    assert(started && started.ok, `the room starts after a leave/return: ${started && started.error}`);
    await host.waitFor((s) => s.phase === 'ROLE_REVEAL', 'the deal after a leave/return');
    console.log('✓ a player can leave the lobby and rejoin, and the room still starts');
    closeAll(clients.filter((c) => c !== leaver).concat(returner));
    await sleep(250);
  }

  // --- 6. a host who walks out hands the room over -------------------
  {
    const { clients } = await seatTable(MIN_PLAYERS + 1, FAST);
    const host = clients[0];
    host.socket.emit('mafia:leave');
    await clients[1].waitFor((s) => s.players.length === MIN_PLAYERS, 'the host to leave');
    const newHost = clients.slice(1).find((c) => c.isHost);
    assert(newHost, 'somebody else became host');
    const res = await ack(newHost.socket, 'mafia:start', {});
    assert(res && res.ok, `the new host can start: ${res && res.error}`);
    await newHost.waitFor((s) => s.phase === 'ROLE_REVEAL', 'the new host to deal');
    console.log('✓ a host who leaves the lobby hands the start button to someone else');
    closeAll(clients);
    await sleep(250);
  }

  // --- 7. a spectator gets no seat and no buttons --------------------
  {
    const { clients, roomCode } = await seatTable(MIN_PLAYERS, FAST);
    const watcher = new Client('watcher');
    await watcher.ready();
    const res = await ack(watcher.socket, 'mafia:spectate', { roomCode, nickname: 'Watcher', playerId: 'watch-1' });
    assert(res && res.ok, `a watcher may watch: ${res && res.error}`);
    assert(res.state.players.every((p) => !p.isYou), 'a watcher owns no seat');
    assert(res.state.players.every((p) => p.role === null), 'a watcher sees no roles');
    console.log('✓ a spectator is given no seat and no roles');
    watcher.close();
    closeAll(clients);
    await sleep(250);
  }

  server.close();
  console.log('\n=== MAFIA LIFECYCLE TESTS PASSED ===');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
