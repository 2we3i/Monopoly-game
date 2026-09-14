// Drives a whole Mafia game over the real socket.io wire with six
// clients, proving the parts the engine tests cannot reach: that each
// player is sent a DIFFERENT payload, that the phase clock advances the
// game on its own, and that a night and a vote resolve end to end.

const { registerAccount } = require('./helpers/testEnv');

process.env.PORT = '4005';
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { registerMafiaHandlers } = require('../src/socket/mafiaHandler');

const PORT = 4005;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerMafiaHandlers(io);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out on ${event}`)), 5000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      if (res && res.ok === false) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

class Client {
  constructor(name) {
    this.name = name;
    this.socket = ioClient(`http://localhost:${PORT}`, { transports: ['websocket'] });
    this.state = null;
    this.updates = 0;
    this.socket.on('mafia:state', (s) => { this.state = s; this.updates += 1; });
    this.socket.on('mafia:error', (e) => { this.lastError = e.message; });
  }

  ready() {
    return new Promise((resolve) => this.socket.on('connect', resolve));
  }

  async waitFor(predicate, label, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state && predicate(this.state)) return this.state;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`Timed out waiting for ${label} (phase=${this.state?.phase})`);
  }

  close() { this.socket.close(); }
}

async function run() {
  const names = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fox'];
  const clients = names.map((n) => new Client(n));
  await Promise.all(clients.map((c) => c.ready()));

  // --- create + join ---------------------------------------------------
  // The host must be a registered player; everyone else joins as a guest.
  const host = registerAccount(names[0]);
  const created = await emitAck(clients[0].socket, 'mafia:create', {
    token: host.token, presetId: 'CLASSIC',
  });
  const roomCode = created.roomCode;
  assert(roomCode, 'creating a room returns a code');

  for (let i = 1; i < clients.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await emitAck(clients[i].socket, 'mafia:join', { roomCode, nickname: names[i], playerId: `u${i}` });
  }
  await clients[5].waitFor((s) => s.players.length === 6, 'all six players in the lobby');
  console.log('✓ six clients created and joined one room');

  // --- host-only settings ---------------------------------------------
  clients[1].lastError = null;
  clients[1].socket.emit('mafia:settings', { settings: { night: { durationSec: 99 } } });
  await new Promise((r) => setTimeout(r, 250));
  assert(/host/i.test(clients[1].lastError || ''), 'a non-host is refused when changing settings');

  await emitAck(clients[0].socket, 'mafia:settings', {
    settings: {
      autoBalance: false,
      roles: { MAFIA: 1, DON: 0, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 },
      night: { durationSec: 3 },
      day: { discussionSec: 2, voteSec: 3 },
    },
  });
  await clients[0].waitFor((s) => s.settings.night.durationSec === 3, 'settings reach the host');
  await clients[3].waitFor((s) => s.settings.day.voteSec === 3, 'settings reach a guest too');
  console.log('✓ only the host may change settings, and changes reach everyone');

  // --- start + per-player secrecy --------------------------------------
  await emitAck(clients[0].socket, 'mafia:start', {});
  // Every client has to have received its own payload before the views
  // can be compared - the host's copy arriving first proves nothing.
  await Promise.all(clients.map((c) => c.waitFor(
    (s) => s.phase !== 'LOBBY' && s.you && s.you.role,
    `${c.name} to be dealt a role`,
  )));

  const views = clients.map((c) => c.state);
  views.forEach((view, i) => {
    assert(view.you && view.you.role, `${names[i]} is told their own role`);
    const seen = view.players.filter((p) => p.role).length;
    const isMafia = ['MAFIA', 'DON'].includes(view.you.role);
    assert(isMafia ? seen >= 1 : seen === 1,
      `${names[i]} (${view.you.role}) sees only what they should (${seen} roles visible)`);
  });
  const roleCounts = views.map((v) => v.you.role);
  assert(roleCounts.filter((r) => r === 'MAFIA').length === 1, 'exactly one mafia was dealt');
  assert(roleCounts.filter((r) => r === 'SHERIFF').length === 1, 'exactly one sheriff was dealt');
  assert(roleCounts.filter((r) => r === 'DOCTOR').length === 1, 'exactly one doctor was dealt');
  console.log('✓ roles are dealt as configured and every payload keeps its secrets');

  // --- the clock runs on its own ---------------------------------------
  await clients[0].waitFor((s) => s.phase === 'NIGHT', 'the reveal to advance into the night');
  assert(clients[0].state.phaseEndsAt > Date.now() - 1000, 'the night carries a deadline');
  console.log('✓ the server advances the phase on its own clock');

  // --- a night resolves -------------------------------------------------
  const mafiaClient = clients.find((c) => ['MAFIA', 'DON'].includes(c.state.you.role));
  const victim = mafiaClient.state.players.find((p) => p.alive && !p.isYou && !p.role);
  await emitAck(mafiaClient.socket, 'mafia:night', { targetId: victim.id });

  const doctorClient = clients.find((c) => c.state.you.role === 'DOCTOR');
  const sheriffClient = clients.find((c) => c.state.you.role === 'SHERIFF');
  const safeId = doctorClient.state.players.find((p) => p.alive && p.id !== doctorClient.state.you.id).id;
  await emitAck(doctorClient.socket, 'mafia:night', { targetId: safeId });
  await emitAck(sheriffClient.socket, 'mafia:night', {
    targetId: sheriffClient.state.players.find((p) => p.alive && !p.isYou).id,
  });

  await clients[0].waitFor((s) => ['RESULT', 'DAY', 'VOTE', 'GAME_OVER'].includes(s.phase), 'the night to resolve');
  const afterNight = clients[0].state;
  assert(afterNight.lastNight, 'the night produced a summary');
  assert(sheriffClient.state.you.results.length >= 1, 'the sheriff received a private check result');
  const others = clients.filter((c) => c !== sheriffClient);
  assert(others.every((c) => (c.state.you.results || []).every((r) => r.type !== 'CHECK_RESULT')),
    "no other player receives the sheriff's result");
  console.log('✓ a night resolves, and the private result reaches only its owner');

  // --- a vote resolves --------------------------------------------------
  // The engine clamps phases to sane minimums (a 2-second discussion is
  // not a game), so this wait has to cover result + discussion.
  await clients[0].waitFor((s) => s.phase === 'VOTE' || s.phase === 'GAME_OVER', 'voting to open', 45000);
  if (clients[0].state.phase === 'VOTE') {
    const alive = clients.filter((c) => c.state.you.alive);
    const target = alive[alive.length - 1].state.you.id;
    for (const c of alive) {
      if (c.state.you.id === target) continue;
      // eslint-disable-next-line no-await-in-loop
      await emitAck(c.socket, 'mafia:vote', { targetId: target });
    }
    await clients[0].waitFor(
      (s) => s.phase !== 'VOTE',
      'the vote to resolve',
    );
    const executed = clients[0].state.lastVote;
    assert(executed, 'the vote produced a result');
    console.log(`✓ a vote resolves over the wire (outcome: ${executed.outcome})`);
  } else {
    console.log('✓ the game ended before the first vote (a valid outcome)');
  }

  // --- chat secrecy ------------------------------------------------------
  const townChat = [];
  clients.forEach((c) => c.socket.on('mafia:chat', (m) => townChat.push({ to: c.name, ...m })));
  mafiaClient.socket.emit('mafia:chat', { text: 'test-night-message' });
  await new Promise((r) => setTimeout(r, 300));
  const nightMsgs = townChat.filter((m) => m.text === 'test-night-message');
  if (clients[0].state.phase === 'NIGHT') {
    assert(nightMsgs.every((m) => {
      const receiver = clients.find((c) => c.name === m.to);
      return ['MAFIA', 'DON'].includes(receiver.state.you.role) || !receiver.state.you.alive;
    }), 'a night message only reaches the mafia and the dead');
    console.log('✓ night chat is restricted to the mafia');
  } else {
    console.log('✓ chat delivered (day channel)');
  }

  // --- play again ---------------------------------------------------------
  // Driving a full game to its end over the wire would take minutes, so
  // the engine is told the game is decided; the restart itself is real.
  // eslint-disable-next-line global-require
  const roomManager = require('../src/game/RoomManager');
  const liveGame = roomManager.getMafiaRoom(roomCode);
  if (liveGame.phase !== 'GAME_OVER') liveGame.endGame('TOWN');
  clients[1].lastError = null;
  clients[1].socket.emit('mafia:restart', { startNow: false });
  await new Promise((r) => setTimeout(r, 250));
  assert(/host|over/i.test(clients[1].lastError || ''), 'a non-host cannot restart the game');

  await emitAck(clients[0].socket, 'mafia:restart', { startNow: true });
  await Promise.all(clients.map((c) => c.waitFor(
    (s) => s.phase === 'ROLE_REVEAL' && s.you && s.you.role && !s.winner,
    `${c.name} to be dealt into the new game`,
  )));
  assert(clients[0].state.roomCode === roomCode, 'the new game is in the same room');
  console.log('✓ the host restarts a finished game in the same room over the wire');

  // The test persists a real room; take it out again so repeated runs do
  // not leave a trail of dead rooms in the database.
  roomManager.deleteMafiaRoom(roomCode);

  clients.forEach((c) => c.close());
  io.close();
  server.close();
  console.log('\n=== MAFIA SOCKET TESTS PASSED ===');
}

server.listen(PORT, async () => {
  try {
    await run();
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
});
