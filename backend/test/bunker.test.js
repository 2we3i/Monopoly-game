// Tests of the Bunker: the engine's rules (dealing, secrecy, turn order and
// reveals, discussion, voting with runoffs and lots, exclusions, seats, the
// end of the game, restarts, leaving, persistence), hundreds of random
// games played to the end, and the game over the real socket.io wire.

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const {
  BunkerGame, BunkerError, PHASES, seatsFor, FIRST_VOTE_ROUND,
} = require('../src/bunker/BunkerGame');
const {
  CATEGORY_KEYS, dealCharacteristics, isKnownCard, DECKS,
} = require('../src/bunker/cards');
const presence = require('../src/platform/presence');
const apiRoutes = require('../src/routes/api');
const { registerBunkerHandlers } = require('../src/socket/bunkerHandler');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function expectError(fn, pattern, msg) {
  try {
    fn();
  } catch (err) {
    assert(err instanceof BunkerError, `${msg}: expected a BunkerError, got ${err.message}`);
    if (pattern) assert(pattern.test(err.message), `${msg}: unexpected message "${err.message}"`);
    return;
  }
  throw new Error(`ASSERTION FAILED: ${msg}: expected an error`);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function lobby(count, settings) {
  const game = new BunkerGame('TEST1', 'p1', { maxPlayers: Math.max(count, 4), ...settings });
  for (let i = 1; i <= count; i += 1) {
    game.addPlayer({ playerId: `p${i}`, socketId: `s${i}`, nickname: `Player ${i}`, accountId: i === 1 ? 'acc1' : null });
  }
  return game;
}

function started(count, settings) {
  const game = lobby(count, settings);
  game.start('p1');
  return game;
}

// Plays every reveal of the current round (the required key, or the first
// hidden one).
function revealRound(game) {
  const round = game.round;
  let guard = 0;
  while (game.phase === PHASES.REVEAL && game.round === round && guard < 100) {
    const player = game.getPlayer(game.currentTurnId());
    game.reveal(player.id, game.requiredKeyFor(player) || game.hiddenKeys(player)[0]);
    guard += 1;
  }
}

function voteAllFor(game, targetId, fallbackId) {
  game.alivePlayers().forEach((p) => {
    if (game.phase !== PHASES.VOTE || game.votes[p.id] !== undefined) return;
    const target = p.id === targetId ? fallbackId : targetId;
    game.vote(p.id, target);
  });
}

function main() {
  console.log('Bunker engine tests');

  test('the lobby enforces the player count, capacity and host powers', () => {
    const small = lobby(3);
    expectError(() => small.start('p1'), /at least 4/, 'three players cannot start');
    expectError(() => small.start('p2'), /host/, 'only the host starts');
    const capped = lobby(4, { maxPlayers: 4 });
    expectError(() => capped.addPlayer({ playerId: 'p5', socketId: 's5', nickname: 'Late' }), /at most 4/, 'capacity');
    expectError(() => capped.updateSettings('p2', { turnSec: 90 }), /host/, 'only the host changes settings');
    const five = lobby(5, { maxPlayers: 8 });
    expectError(() => five.updateSettings('p1', { maxPlayers: 4 }), /more players/, 'capacity cannot drop below the players');
    const game = started(4);
    expectError(() => game.addPlayer({ playerId: 'p9', socketId: 's9', nickname: 'Late' }), /already started/, 'no joining a running game');
    assert(game.players.map((p) => p.number).join(',') === '1,2,3,4', 'players are numbered');
    const left = lobby(5);
    left.removePlayer('p2');
    assert(left.players.map((p) => p.number).join(',') === '1,2,3,4', 'numbers close up when someone leaves the lobby');
  });

  test('characteristics: seven known cards each, no duplicates within a game', () => {
    const hands = dealCharacteristics(16);
    hands.forEach((hand) => CATEGORY_KEYS.forEach((k) => assert(isKnownCard(k, hand[k]), `known ${k} card`)));
    Object.keys(DECKS).forEach((k) => {
      const ids = hands.map((h) => h[k].id);
      assert(new Set(ids).size === ids.length, `no duplicate ${k} among 16 players`);
    });
    hands.forEach((h) => assert(h.biology.age >= 18 && h.biology.age <= 82, 'adult age'));
    const game = started(6);
    assert(game.catastrophe && game.bunker && game.bunker.rooms.length === 3, 'catastrophe and bunker dealt');
  });

  test('bunker places: half the players by default, or the host\'s choice below the player count', () => {
    assert(seatsFor(4, 0) === 2 && seatsFor(5, 0) === 2 && seatsFor(9, 0) === 4 && seatsFor(16, 0) === 8, 'default seats');
    assert(seatsFor(6, 3) === 3, 'custom seats');
    assert(seatsFor(6, 9) === 5, 'custom seats never reach the player count');
    assert(started(8, { seats: 5 }).seats === 5, 'seats applied at start');
  });

  test('hidden cards never reach another player, own and revealed cards do', () => {
    const game = started(5);
    const viewer = game.toClientJSON('p2');
    const other = viewer.players.find((p) => p.id === 'p3');
    const self = viewer.players.find((p) => p.id === 'p2');
    assert(CATEGORY_KEYS.every((k) => other.cards[k] === null), 'another player\'s cards are hidden');
    assert(CATEGORY_KEYS.every((k) => self.cards[k] !== null), 'own cards are visible');
    const secret = game.getPlayer('p3').cards.health.id;
    const raw = JSON.stringify(viewer);
    assert(!raw.includes(`"${secret}"`) || Object.values(game.getPlayer('p2').cards).some((card) => card.id === secret), 'a hidden card id is not in the payload');
    const first = game.getPlayer(game.currentTurnId());
    game.reveal(first.id, 'profession');
    const after = game.toClientJSON(first.id === 'p2' ? 'p3' : 'p2').players.find((p) => p.id === first.id);
    assert(after.cards.profession && after.cards.profession.id === first.cards.profession.id, 'a revealed card is public');
    assert(after.cards.health === null, 'the rest stays hidden');
  });

  test('reveals: only on your turn, profession first, one card per turn, rounds rotate', () => {
    const game = started(4);
    assert(game.phase === PHASES.REVEAL && game.round === 1, 'the game opens with reveals');
    const current = game.getPlayer(game.currentTurnId());
    const someoneElse = game.players.find((p) => p.id !== current.id);
    expectError(() => game.reveal(someoneElse.id, 'profession'), /not your turn/, 'not your turn');
    expectError(() => game.reveal(current.id, 'health'), /profession/, 'profession first');
    expectError(() => game.reveal(current.id, 'bogus'), null, 'unknown characteristic');
    game.reveal(current.id, 'profession');
    assert(game.currentTurnId() !== current.id, 'the turn moves on');
    revealRound(game);
    assert(game.round === 2 && game.phase === PHASES.REVEAL, `no vote before round ${FIRST_VOTE_ROUND}`);
    const opener = game.currentTurnId();
    assert(opener !== current.id, 'the opening speaker rotates');
    const p = game.getPlayer(opener);
    expectError(() => game.reveal(p.id, 'profession'), /already revealed/, 'a revealed card cannot be revealed again');
    game.reveal(p.id, 'hobby');
    revealRound(game);
    assert(game.phase === PHASES.DISCUSSION, 'round 2 reveals lead to discussion');
    expectError(() => game.reveal(p.id, 'trait'), /reveal phase/, 'no reveals during discussion');
  });

  test('discussion and phases: only the host skips, and only discussion or results', () => {
    const game = started(4);
    expectError(() => game.skipPhase('p1'), /cannot be skipped/, 'reveals cannot be skipped');
    revealRound(game);
    revealRound(game);
    expectError(() => game.skipPhase('p2'), /host/, 'a non-host cannot skip');
    game.skipPhase('p1');
    assert(game.phase === PHASES.VOTE, 'the host moves discussion to the vote');
    expectError(() => game.skipPhase('p1'), /cannot be skipped/, 'a vote cannot be skipped');
  });

  test('voting: no self-vote, no double vote, only candidates, and an exclusion updates the bunker', () => {
    const game = started(5);
    revealRound(game);
    revealRound(game);
    game.skipPhase('p1');
    expectError(() => game.vote('p1', 'p1'), /yourself/, 'no self-vote');
    game.vote('p1', 'p3');
    expectError(() => game.vote('p1', 'p4'), /already voted/, 'no double vote');
    expectError(() => game.vote('p2', 'ghost'), /cannot be voted/, 'unknown target');
    const view = game.toClientJSON('p2');
    assert(view.you.myVote === null && view.vote.votedCount === 1, 'other votes stay secret while voting');
    assert(game.toClientJSON('p1').you.myVote === 'p3', 'your own vote is visible to you');
    voteAllFor(game, 'p3', 'p2');
    assert(game.phase === PHASES.RESULT, 'the vote resolves once everyone has voted');
    assert(game.lastVote.outcome === 'excluded' && game.lastVote.excludedId === 'p3', 'the most-voted player is excluded');
    assert(game.getPlayer('p3').status === 'excluded' && game.alivePlayers().length === 4, 'one fewer inside');
    const seen = game.toClientJSON('p2').players.find((p) => p.id === 'p3');
    assert(CATEGORY_KEYS.every((k) => seen.cards[k] !== null), 'an excluded player\'s cards are all shown');
    game.onTimeout();
    assert(game.phase === PHASES.REVEAL && game.round === 3, 'the result leads into the next round');
    expectError(() => game.reveal('p3', 'trait'), null, 'an excluded player does not reveal');
    revealRound(game);
    game.skipPhase('p1');
    expectError(() => game.vote('p3', 'p1'), /still in the bunker/, 'an excluded player cannot vote');
  });

  test('ties: a runoff between the tied players, then no exclusion; a vote nobody casts excludes nobody', () => {
    const game = started(4);
    revealRound(game);
    revealRound(game);
    game.skipPhase('p1');
    game.vote('p1', 'p2');
    game.vote('p2', 'p1');
    game.vote('p3', 'p1');
    game.vote('p4', 'p2');
    assert(game.phase === PHASES.VOTE && game.revote && game.voteCandidates.sort().join(',') === 'p1,p2', 'a tie opens a runoff');
    expectError(() => game.vote('p3', 'p4'), /cannot be voted/, 'only tied players in the runoff');
    game.vote('p1', 'p2');
    game.vote('p2', 'p1');
    game.vote('p3', 'p1');
    game.vote('p4', 'p2');
    assert(game.phase === PHASES.RESULT && game.lastVote.outcome === 'tieAgain', 'a second tie excludes nobody');
    assert(game.alivePlayers().length === 4, 'everyone is still inside');
    game.onTimeout();
    revealRound(game);
    game.skipPhase('p1');
    game.onTimeout();
    assert(game.lastVote.outcome === 'noVotes' && game.alivePlayers().length === 4, 'no votes, no exclusion');
  });

  test('a deadlock with every card revealed is settled by lot', () => {
    const game = started(4);
    game.players.forEach((p) => { p.revealed = [...CATEGORY_KEYS]; });
    game.phase = PHASES.DISCUSSION;
    game.skipPhase('p1');
    game.vote('p1', 'p2');
    game.vote('p2', 'p1');
    game.vote('p3', 'p1');
    game.vote('p4', 'p2');
    game.vote('p1', 'p2');
    game.vote('p2', 'p1');
    game.vote('p3', 'p1');
    game.vote('p4', 'p2');
    assert(game.lastVote.outcome === 'lot' && ['p1', 'p2'].includes(game.lastVote.excludedId), 'lots between the tied players');
  });

  test('timeouts: an auto-reveal, discussion ends, a vote closes with the votes cast', () => {
    const game = started(4);
    const first = game.getPlayer(game.currentTurnId());
    game.onTimeout();
    assert(first.revealed.includes('profession'), 'a missed first-round turn reveals the profession');
    assert(game.log.some((e) => e.type === 'AUTO_REVEALED'), 'the auto-reveal is logged');
    revealRound(game);
    while (game.phase === PHASES.REVEAL) game.onTimeout();
    assert(game.phase === PHASES.DISCUSSION, 'reveals finish by the clock too');
    game.onTimeout();
    assert(game.phase === PHASES.VOTE, 'discussion ends on time');
    game.vote('p1', 'p2');
    game.onTimeout();
    assert(game.lastVote.outcome === 'excluded' && game.lastVote.excludedId === 'p2', 'the votes cast decide');
  });

  test('the game ends when no more people remain than places; survivors, verdict and a restart', () => {
    const game = started(4);
    let guard = 0;
    while (game.phase !== PHASES.GAME_OVER && guard < 200) {
      if (game.phase === PHASES.REVEAL) revealRound(game);
      else if (game.phase === PHASES.DISCUSSION) game.skipPhase('p1');
      else if (game.phase === PHASES.VOTE) {
        const alive = game.alivePlayers();
        const target = alive.find((p) => p.id !== 'p1');
        voteAllFor(game, target.id, 'p1');
      } else if (game.phase === PHASES.RESULT) game.skipPhase('p1');
      guard += 1;
    }
    assert(game.phase === PHASES.GAME_OVER, 'the game ends');
    assert(game.results.survivorIds.length === game.seats && game.results.survivorIds.includes('p1'), 'exactly the places are filled');
    assert(game.results.excluded.length === 2, 'the excluded are listed');
    assert(['thrive', 'survive', 'struggle', 'doomed'].includes(game.results.verdict), 'a verdict');
    const final = game.toClientJSON('p2');
    assert(final.players.every((p) => CATEGORY_KEYS.every((k) => p.cards[k] !== null)), 'every card is shown at the end');
    expectError(() => game.vote('p1', 'p2'), /not open/, 'nothing happens after the end');
    expectError(() => game.restart('p2'), /host/, 'only the host restarts');
    game.restart('p1');
    assert(game.phase === PHASES.LOBBY && game.players.every((p) => p.status === 'alive' && !p.revealed.length), 'back to a clean lobby');
    game.start('p1');
    assert(game.phase === PHASES.REVEAL && game.round === 1, 'a new game starts');
  });

  test('leaving mid-game counts as leaving the bunker, and can end the game', () => {
    const game = started(5);
    const current = game.currentTurnId();
    game.removePlayer(current);
    assert(game.getPlayer(current).status === 'excluded' && game.getPlayer(current).exclusionReason === 'left', 'the leaver is out');
    assert(game.currentTurnId() !== current && game.phase === PHASES.REVEAL, 'the turn passes on');
    const host = game.getPlayer('p1');
    if (current === 'p1') assert(!host.isHost && game.hostId !== 'p1', 'the host role is handed over');
    const small = started(4);
    small.removePlayer('p2');
    small.removePlayer('p3');
    assert(small.phase === PHASES.GAME_OVER && small.results.survivorIds.length === 2, 'the game ends when the places are enough');
  });

  test('a game in progress survives being saved and restored', () => {
    const game = started(6);
    revealRound(game);
    const copy = BunkerGame.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
    assert(copy.phase === game.phase && copy.round === game.round && copy.currentTurnId() === game.currentTurnId(), 'phase and turn restored');
    const view = copy.toClientJSON('p2').players.find((p) => p.id === 'p4');
    assert(view.cards.health === null && view.cards.profession !== null, 'secrecy restored too');
  });

  test('300 random games with 4-16 players always end with the places filled', () => {
    for (let n = 0; n < 300; n += 1) {
      const count = 4 + (n % 13);
      const game = started(count, { seats: n % 5 === 0 ? 1 + (n % (count - 1)) : 0 });
      let guard = 0;
      while (game.phase !== PHASES.GAME_OVER && guard < 5000) {
        const roll = Math.random();
        if (roll < 0.08) {
          game.onTimeout();
        } else if (game.phase === PHASES.REVEAL) {
          const p = game.getPlayer(game.currentTurnId());
          const keys = game.requiredKeyFor(p) ? ['profession'] : game.hiddenKeys(p);
          game.reveal(p.id, keys[Math.floor(Math.random() * keys.length)]);
        } else if (game.phase === PHASES.VOTE) {
          game.alivePlayers().forEach((p) => {
            if (game.phase !== PHASES.VOTE || game.votes[p.id] !== undefined || Math.random() < 0.05) return;
            const options = game.voteCandidates.filter((id) => id !== p.id);
            if (options.length) game.vote(p.id, options[Math.floor(Math.random() * options.length)]);
          });
          if (game.phase === PHASES.VOTE) game.onTimeout();
        } else if (game.phase === PHASES.DISCUSSION || game.phase === PHASES.RESULT) {
          game.onTimeout();
        }
        if (Math.random() < 0.004 && game.phase !== PHASES.GAME_OVER) {
          const leaver = game.alivePlayers()[Math.floor(Math.random() * game.alivePlayers().length)];
          if (leaver) game.removePlayer(leaver.id);
        }
        guard += 1;
      }
      assert(game.phase === PHASES.GAME_OVER, `game ${n} (${count} players) ended (phase ${game.phase}, round ${game.round})`);
      assert(game.results.survivorIds.length >= 1 && game.results.survivorIds.length <= game.seats, `game ${n}: survivors fit the places`);
      assert(game.round < 60, `game ${n}: finished in a sane number of rounds (${game.round})`);
    }
  });

  console.log(`Bunker engine: ${passed} passed`);
}

// --- over the wire -----------------------------------------------------------

async function wire() {
  const PORT = 4013;
  const URL = `http://localhost:${PORT}`;
  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);
  const server = http.createServer(app);
  const io = new Server(server);
  presence.attach(io);
  registerBunkerHandlers(io);
  await new Promise((r) => server.listen(PORT, r));

  const connect = (auth = {}) => new Promise((resolve) => {
    const s = ioClient(URL, { transports: ['websocket'], auth });
    s.latest = null;
    s.on('bunker:state', (state) => { s.latest = state; });
    s.on('connect', () => resolve(s));
  });
  const emit = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const host = registerAccount('Bunker Host');
  const sockets = [];
  try {
    const guest0 = await connect();
    sockets.push(guest0);
    const guestCreate = await emit(guest0, 'bunker:create', { nickname: 'Sneaky', playerId: 'guest-0', guestKey: 'g'.repeat(32) });
    assert(!guestCreate.ok && guestCreate.code === 'GUEST_CANNOT_CREATE', 'a guest cannot create a Bunker room');

    const hostSock = await connect({ token: host.token });
    sockets.push(hostSock);
    const created = await emit(hostSock, 'bunker:create', { token: host.token, settings: { maxPlayers: 6 } });
    assert(created.ok, `the host creates a room (${created.error})`);
    const code = created.roomCode;

    const exists = await fetch(`${URL}/api/rooms/${code}/exists`).then((r) => r.json());
    assert(exists.exists && exists.gameType === 'bunker', 'the room code resolves to the Bunker');
    const games = await fetch(`${URL}/api/games`).then((r) => r.json());
    assert(games.games.some((g) => g.id === 'bunker' && g.available), 'the Bunker is in the game catalogue');
    const config = await fetch(`${URL}/api/bunker/config`).then((r) => r.json());
    assert(config.categories.length === 7 && config.cards.profession.length > 16 && !JSON.stringify(config).includes('"s":'), 'config has names, not scores');

    const guests = [];
    for (let i = 1; i <= 3; i += 1) {
      const s = await connect();
      sockets.push(s);
      const joined = await emit(s, 'bunker:join', {
        roomCode: code, nickname: `Guest ${i}`, playerId: `guest-${i}`, guestKey: `${i}`.repeat(32),
      });
      assert(joined.ok, `guest ${i} joins (${joined.error})`);
      guests.push(s);
    }
    const guestStart = await emit(guests[0], 'bunker:start', {});
    assert(!guestStart.ok, 'a guest cannot start the game');
    const started2 = await emit(hostSock, 'bunker:start', {});
    assert(started2.ok, `the host starts (${started2.error})`);
    await sleep(200);

    const all = [hostSock, ...guests];
    all.forEach((s) => {
      const st = s.latest;
      const me = st.players.find((p) => p.isYou);
      assert(Object.values(me.cards).every(Boolean), 'each player sees their own cards');
      assert(st.players.filter((p) => !p.isYou).every((p) => Object.values(p.cards).every((card) => card === null)), 'and nobody else\'s');
    });

    const bySeat = (id) => all.find((s) => s.latest.players.find((p) => p.isYou).id === id);
    const currentId = hostSock.latest.turn.playerId;
    const notCurrent = all.find((s) => s.latest.players.find((p) => p.isYou).id !== currentId);
    const early = await emit(notCurrent, 'bunker:reveal', { key: 'profession' });
    assert(!early.ok && /not your turn/.test(early.error), 'a reveal out of turn is refused over the wire');

    // Two rounds of reveals, driven by whoever the server says is next.
    let guard = 0;
    while (hostSock.latest.phase === 'REVEAL' && guard < 20) {
      const turnId = hostSock.latest.turn.playerId;
      const seat = bySeat(turnId);
      const you = seat.latest.players.find((p) => p.isYou);
      const key = seat.latest.you.requiredKey || Object.keys(you.cards).find((k) => !you.revealed.includes(k));
      const res = await emit(seat, 'bunker:reveal', { key });
      assert(res.ok, `reveal ${key} (${res.error})`);
      await sleep(60);
      guard += 1;
    }
    assert(hostSock.latest.phase === 'DISCUSSION', 'reveals lead to the discussion over the wire');
    const someone = guests[0].latest.players.find((p) => p.id === currentId);
    assert(someone.cards.profession, 'revealed professions are public');

    const guestSkip = await emit(guests[1], 'bunker:skip', {});
    assert(!guestSkip.ok, 'a guest cannot skip the discussion');
    await emit(hostSock, 'bunker:skip', {});
    await sleep(100);
    assert(hostSock.latest.phase === 'VOTE', 'the host opens the vote');

    const target = guests[2].latest.players.find((p) => p.isYou).id;
    const first = await emit(hostSock, 'bunker:vote', { targetId: target });
    assert(first.ok, 'a vote is accepted');
    const twice = await emit(hostSock, 'bunker:vote', { targetId: target });
    assert(!twice.ok && /already voted/.test(twice.error), 'a second vote is refused over the wire');
    await sleep(80);
    assert(guests[0].latest.you.myVote === null && guests[0].latest.vote.votedCount === 1, 'votes stay secret');
    await emit(guests[0], 'bunker:vote', { targetId: target });
    await emit(guests[1], 'bunker:vote', { targetId: target });
    await emit(guests[2], 'bunker:vote', { targetId: guests[0].latest.players.find((p) => p.isYou).id });
    await sleep(150);
    assert(hostSock.latest.phase === 'RESULT' && hostSock.latest.lastVote.excludedId === target, 'the vote excludes the chosen player');
    assert(hostSock.latest.aliveCount === 3, 'three remain inside');

    const chatSeen = new Promise((resolve) => guests[0].once('bunker:chat', resolve));
    hostSock.emit('bunker:chat', { text: 'Hello @Guest 1' });
    const msg = await chatSeen;
    assert(msg.mentions.length === 1 && msg.number === 1, 'room chat with mentions and seat numbers');
    console.log('  ✓ the Bunker runs over the wire: guests blocked from creating/starting, private cards, turns, runoff-proof votes, chat');
  } finally {
    sockets.forEach((s) => s.close());
    io.close();
    server.close();
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}

wire()
  .then(() => {
    console.log('=== BUNKER TESTS PASSED ===');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
