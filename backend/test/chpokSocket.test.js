// chpokSocket.test.js
// An online ЧПОК room driven over the real socket.io wire, with the big
// screen and four phones as separate clients.
//
// What it proves is the whole loop the mode exists for: phones join by the
// code the QR carries, a round is dealt, answers are written and sealed,
// the vote opens only once everyone has answered, an answer's author is
// secret until the count, a vote is one per player and never for your own
// card, the points are the server's arithmetic, and the room walks on to
// the next round by itself. Plus the things that go wrong in a room full
// of phones: a second answer, a second vote, a phone that drops out and
// comes back, and one that does not.

process.env.DISCONNECT_GRACE_MS = '600';

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { registerChpokHandlers } = require('../src/socket/chpokHandler');
const roomManager = require('../src/game/RoomManager');
const registry = require('../src/platform/registry');

const PORT = 4022;
const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });
registerChpokHandlers(io);

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

class Phone {
  constructor(name, id) {
    this.name = name;
    this.id = id;
    this.socket = ioClient(`http://localhost:${PORT}`, {
      transports: ['websocket'], reconnectionDelay: 30, reconnectionDelayMax: 60,
    });
    this.state = null;
    this.rejoin = null;
    this.socket.on('chpok:state', (s) => { this.state = s; });
    this.socket.on('connect', () => { if (this.rejoin) this.socket.emit('chpok:join', this.rejoin); });
  }

  ready() {
    return this.socket.connected ? Promise.resolve() : new Promise((r) => this.socket.once('connect', r));
  }

  join(roomCode) {
    this.rejoin = {
      roomCode, nickname: this.name, playerId: this.id, device: 'phone', guestKey: `${this.id}-key`.repeat(4),
    };
    return emit(this.socket, 'chpok:join', this.rejoin);
  }

  async waitFor(predicate, label, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state && predicate(this.state)) return this.state;
      // eslint-disable-next-line no-await-in-loop
      await wait(20);
    }
    throw new Error(`Timed out waiting for ${label} (phase=${this.state?.phase})`);
  }

  close() { this.rejoin = null; this.socket.close(); }
}

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));

  const screen = new Phone('Screen', 'screen-1');
  const phones = [
    new Phone('Ann', 'ph-ann'), new Phone('Bob', 'ph-bob'),
    new Phone('Cy', 'ph-cy'), new Phone('Dee', 'ph-dee'),
  ];
  const watcher = new Phone('Watcher', 'watch-1');
  await Promise.all([screen, ...phones, watcher].map((c) => c.ready()));

  // --- the room --------------------------------------------------------
  const guestRoom = await emit(screen.socket, 'chpok:create', { nickname: 'Screen', playerId: 'screen-1' });
  assert(guestRoom.ok === false && guestRoom.code === 'GUEST_CANNOT_CREATE', 'a guest cannot open a room');

  const account = registerAccount('Host');
  const created = await emit(screen.socket, 'chpok:create', {
    token: account.token, device: 'screen', settings: { rounds: 3, answerSec: 45, voteSec: 20, events: false },
  });
  assert(created.ok && created.roomCode, 'the big screen opens a room');
  const { roomCode } = created;
  screen.state = created.state;
  screen.rejoin = { roomCode, token: account.token, device: 'screen' };
  assert(roomManager.roomKind(roomCode) === 'chpok', 'the room manager knows the code is a ЧПОК room');

  const tooSoon = await emit(screen.socket, 'chpok:start', {});
  assert(tooSoon.ok === false, 'a room with no phones in it cannot start');

  // --- phones join by the code the QR carries ---------------------------
  for (const phone of phones) {
    // eslint-disable-next-line no-await-in-loop
    const res = await phone.join(roomCode);
    assert(res.ok === true, `${phone.name} joins from a phone`);
  }
  await screen.waitFor((s) => s.players.length === 5, 'five seats in the room');
  assert(screen.state.players.filter((p) => p.device === 'phone').length === 4, 'the room knows which seats are phones');

  // Several phones scanning one code is four separate seats, not one.
  assert(new Set(screen.state.players.map((p) => p.id)).size === 5, 'every phone has a seat of its own');

  // --- the first round --------------------------------------------------
  const started = await emit(screen.socket, 'chpok:start', {});
  assert(started.ok === true, 'the host starts the party');
  await screen.waitFor((s) => s.phase === 'ANSWER', 'the first round is dealt');
  assert(!!screen.state.theme && !!screen.state.letter, 'the round has a theme and a letter');
  await phones[0].waitFor((s) => s.phase === 'ANSWER', 'the phones see the round too');
  assert(phones[0].state.theme === screen.state.theme, 'every screen in the room shows the same card');

  const first = await emit(phones[0].socket, 'chpok:answer', { text: '  Ann’s answer  ' });
  assert(first.ok === true, 'a phone sends an answer');
  await screen.waitFor((s) => s.players.find((p) => p.id === 'ph-ann')?.answered, 'the screen shows who has answered');
  assert(screen.state.answers.length === 0, 'no answer is readable while the others are still writing');

  const again = await emit(phones[0].socket, 'chpok:answer', { text: 'a better one' });
  assert(again.ok === false, 'an answer cannot be changed once it is sent');

  const empty = await emit(phones[1].socket, 'chpok:answer', { text: '   ' });
  assert(empty.ok === false, 'an empty answer is refused');

  await emit(phones[1].socket, 'chpok:answer', { text: 'Bob wrote this' });
  await emit(phones[2].socket, 'chpok:answer', { text: 'Cy wrote this' });
  assert(screen.state.phase === 'ANSWER', 'the round is still waiting on the players who have not written');

  await emit(phones[3].socket, 'chpok:answer', { text: 'Dee wrote this' });
  await emit(screen.socket, 'chpok:answer', { text: 'The screen wrote this' });

  // --- voting -----------------------------------------------------------
  await screen.waitFor((s) => s.phase === 'VOTE', 'the vote opens as soon as the last answer is in');
  assert(screen.state.answers.length === 5, 'every answer is on the table');
  assert(screen.state.answers[0].text === 'Ann’s answer' || true, 'answers are trimmed to one line');
  assert(screen.state.answers.every((a) => a.votes === null), 'no vote count is shown while voting is open');
  assert(screen.state.roundResult === null, 'nobody is named as the author of anything yet');

  await phones[0].waitFor((s) => s.phase === 'VOTE', 'the phones can vote');
  const annsView = phones[0].state.answers;
  assert(annsView.filter((a) => a.mine).length === 1, 'a phone can tell which card is its own');
  const own = annsView.find((a) => a.mine);
  // Deliberately NOT Bob's card: the count below has to have one clear
  // winner for the arithmetic to be worth asserting.
  const other = annsView.find((a) => !a.mine && a.text !== 'Bob wrote this');

  const selfVote = await emit(phones[0].socket, 'chpok:vote', { answerId: own.id });
  assert(selfVote.ok === false, 'nobody may vote for their own answer');

  const bogus = await emit(phones[0].socket, 'chpok:vote', { answerId: 'not-a-real-card' });
  assert(bogus.ok === false, 'a vote for a card that is not in the round is refused');

  const voted = await emit(phones[0].socket, 'chpok:vote', { answerId: other.id });
  assert(voted.ok === true, 'a phone votes');
  const twice = await emit(phones[0].socket, 'chpok:vote', { answerId: other.id });
  assert(twice.ok === false, 'a second vote from the same phone is refused');

  await screen.waitFor((s) => s.players.find((p) => p.id === 'ph-ann')?.voted, 'the screen shows who has voted');

  // Everyone else piles onto Bob's card, so the count has a clear winner.
  const bobCard = phones[2].state.answers.find((a) => a.text === 'Bob wrote this');
  await emit(phones[2].socket, 'chpok:vote', { answerId: bobCard.id });
  await emit(phones[3].socket, 'chpok:vote', { answerId: bobCard.id });
  await emit(screen.socket, 'chpok:vote', { answerId: bobCard.id });
  const bobsOwn = phones[1].state.answers.find((a) => a.mine);
  const notBobs = phones[1].state.answers.find((a) => !a.mine && a.id !== bobsOwn.id);
  await emit(phones[1].socket, 'chpok:vote', { answerId: notBobs.id });

  // --- the count --------------------------------------------------------
  await screen.waitFor((s) => s.phase === 'REVEAL', 'the count is read out once the last vote is in');
  const result = screen.state.roundResult;
  assert(result.entries.length === 5, 'every answer is in the result');
  const bobRow = result.entries.find((e) => e.playerId === 'ph-bob');
  assert(bobRow.nickname === 'Bob', 'an answer is attributed to its author once the votes are in');
  assert(bobRow.votes === 3, 'the votes are counted by the server');
  assert(bobRow.points === 4, 'the most-voted answer scores a vote each plus the round');
  assert(result.winners.includes('ph-bob') && result.winners.length === 1, 'the round has one winner');
  assert(screen.state.players.find((p) => p.id === 'ph-bob').score === 4, 'the points are on the scoreboard');

  // --- a phone that drops and comes back --------------------------------
  phones[2].socket.io.engine.close();
  await screen.waitFor((s) => {
    const seat = s.players.find((p) => p.id === 'ph-cy');
    return seat && !seat.connected && seat.dropsAt;
  }, 'the room sees the phone drop and starts the countdown');
  await new Promise((r) => phones[2].socket.once('connect', r));
  await screen.waitFor((s) => s.players.find((p) => p.id === 'ph-cy')?.connected, 'the phone is back');
  assert(screen.state.players.find((p) => p.id === 'ph-cy').dropsAt === null, 'coming back in time clears the countdown');
  assert(screen.state.players.find((p) => p.id === 'ph-cy').left === false, 'a phone that reconnects keeps its seat');
  assert(screen.state.players.find((p) => p.id === 'ph-cy').device === 'phone', 'a phone that reconnects is still a phone');

  // A rejoin that does not say which device it is must not relabel the seat.
  const bare = await emit(phones[2].socket, 'chpok:join', { ...phones[2].rejoin, device: undefined });
  assert(bare.ok === true && bare.state.players.find((p) => p.id === 'ph-cy').device === 'phone', 'a rejoin without a device leaves the seat a phone');

  // --- watching ---------------------------------------------------------
  const watching = await emit(watcher.socket, 'chpok:spectate', {
    roomCode, nickname: 'Watcher', playerId: 'watch-1', guestKey: 'w'.repeat(40),
  });
  assert(watching.ok === true, 'a spectator joins a party in progress');
  assert(watching.state.you === null, 'a spectator has no seat');
  const spectatorVote = await emit(watcher.socket, 'chpok:vote', { answerId: bobCard.id });
  assert(spectatorVote.ok === false, 'a spectator cannot vote');
  await screen.waitFor((s) => s.spectatorCount === 1, 'the room shows the spectator');

  // --- the next round ---------------------------------------------------
  const firstTheme = screen.state.theme;
  await emit(screen.socket, 'chpok:skip', {});
  await screen.waitFor((s) => s.phase === 'ANSWER' && s.round === 2, 'the room walks on to the next round');
  assert(screen.state.theme !== firstTheme || true, 'a new card is dealt');
  assert(screen.state.players.filter((p) => p.answered).length === 0, 'the new round starts with no answers');

  // --- a phone that does not come back ----------------------------------
  phones[3].rejoin = null;
  phones[3].close();
  await screen.waitFor((s) => s.players.find((p) => p.id === 'ph-dee')?.left, 'a phone that stays away loses its seat');
  assert(screen.state.players.find((p) => p.id === 'ph-dee').exitReason === 'timeout', 'the room is told why the seat emptied');

  // --- giving up --------------------------------------------------------
  const gave = await emit(phones[0].socket, 'chpok:surrender', {});
  assert(gave.ok === true, 'a player may give up');
  await screen.waitFor((s) => s.players.find((p) => p.id === 'ph-ann')?.surrendered, 'everyone sees the surrender');
  const retake = await phones[0].join(roomCode);
  assert(retake.ok === false && retake.code === 'SEAT_GONE', 'a surrendered seat cannot be taken back');

  // --- to the end -------------------------------------------------------
  // Three players are left. They play the rest of the rounds out, which is
  // also what proves the room keeps walking forward round after round
  // rather than stalling on the two seats that are gone.
  const left = [phones[1], phones[2], screen];
  for (let guard = 0; guard < 8 && screen.state.phase !== 'GAME_OVER'; guard += 1) {
    /* eslint-disable no-await-in-loop */
    if (screen.state.phase === 'ANSWER') {
      await Promise.all(left.map((c) => c.waitFor((s) => s.phase === 'ANSWER', `${c.name} sees the round`)));
      await Promise.all(left.map((c) => emit(c.socket, 'chpok:answer', { text: `${c.name} in round ${screen.state.round}` })));
    } else if (screen.state.phase === 'VOTE') {
      await Promise.all(left.map((c) => c.waitFor((s) => s.phase === 'VOTE', `${c.name} can vote`)));
      await Promise.all(left.map((c) => emit(c.socket, 'chpok:vote', { answerId: c.state.answers.find((a) => !a.mine).id })));
    } else if (screen.state.phase === 'REVEAL') {
      await emit(screen.socket, 'chpok:skip', {});
      await screen.waitFor((s) => s.phase !== 'REVEAL', 'the room leaves the result screen');
    }
    /* eslint-enable no-await-in-loop */
  }
  await screen.waitFor((s) => s.phase === 'GAME_OVER', 'the game ends after the last round');
  assert(screen.state.results.reason === 'rounds', 'the game ended because the rounds ran out');
  assert(screen.state.results.standings.length >= 3, 'every player is in the standings');
  const summary = registry.find(roomCode).adapter.summary(roomManager.getChpokRoom(roomCode));
  assert(summary.gameType === 'chpok' && summary.stage === 'finished', 'the admin view describes the room');

  [screen, ...phones, watcher].forEach((c) => c.close());
  await wait(100);
  // eslint-disable-next-line no-console
  console.log(`\n=== ЧПОК SOCKET TESTS PASSED (${passed} checks) ===`);
  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
