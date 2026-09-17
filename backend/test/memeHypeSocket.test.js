// memeHypeSocket.test.js
// A Meme Hype room driven over the real socket.io wire: a big screen (the
// table, not a player) and phones, plus a spectator.
//
// Covers the whole loop and what goes wrong around it: creating a room,
// packs and the 16+/18+ split, the 3-6 seat limits, dealing private hands,
// playing a meme, the anonymous vote, the count, several rounds, a phone
// that drops and comes back, one that does not, surrender, the timer's
// automatic pick, and the final table.

process.env.DISCONNECT_GRACE_MS = '600';

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { registerMemeHypeHandlers } = require('../src/socket/memeHypeHandler');
const roomManager = require('../src/game/RoomManager');
const registry = require('../src/platform/registry');
const content = require('../src/memehype/content');
const { MemeHypeGame } = require('../src/memehype/MemeHypeGame');

const PORT = 4023;
const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });
registerMemeHypeHandlers(io);

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
  constructor(name, id) {
    this.name = name;
    this.id = id;
    this.socket = ioClient(`http://localhost:${PORT}`, {
      transports: ['websocket'], reconnectionDelay: 30, reconnectionDelayMax: 60,
    });
    this.state = null;
    this.rejoin = null;
    this.socket.on('memehype:state', (s) => { this.state = s; });
    this.socket.on('connect', () => { if (this.rejoin) this.socket.emit('memehype:join', this.rejoin); });
  }

  ready() {
    return this.socket.connected ? Promise.resolve() : new Promise((r) => this.socket.once('connect', r));
  }

  join(roomCode) {
    this.rejoin = {
      roomCode, nickname: this.name, playerId: this.id, device: 'phone', guestKey: `${this.id}-secret-key-000`,
    };
    return emit(this.socket, 'memehype:join', this.rejoin);
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

  play() {
    return emit(this.socket, 'memehype:pick', { memeId: this.state.you.hand[0].id });
  }

  voteForSomeoneElse() {
    return emit(this.socket, 'memehype:vote', { pickId: this.state.cards.find((c) => !c.mine).id });
  }

  close() { this.rejoin = null; this.socket.close(); }
}

const seat = (s, id) => s.players.find((p) => p.id === id);

function engineChecks() {
  // eslint-disable-next-line no-console
  console.log('\nContent and settings');
  content.RATINGS.forEach((rating) => {
    const memes = content.memesFor(rating, content.PACK_IDS);
    const situations = content.situationsFor(rating, content.PACK_IDS);
    assert(memes.every((m) => m.rating === rating) && situations.every((s) => s.rating === rating),
      `${rating}+ decks hold only ${rating}+ cards`);
    assert(new Set(memes.map((m) => m.id)).size === memes.length, `${rating}+ meme ids are unique`);
  });
  const adult = content.memesFor('18', ['everyday'])[0];
  assert(content.memeById(adult.id, '16') === null, 'an 18+ meme cannot be looked up in a 16+ room');

  const g = new MemeHypeGame('TEST1', 'h', {});
  assert(g.settings.rating === '16', 'a room starts in 16+');
  g.settings = g.sanitizeSettings({ rating: '18' }, g.settings);
  assert(g.settings.rating === '16', '18+ is not switched on without the confirmation');
  g.settings = g.sanitizeSettings({ rating: '18', confirmAdult: true }, g.settings);
  assert(g.settings.rating === '18', '18+ is switched on once confirmed');
  g.settings = g.sanitizeSettings({ packs: ['nope'] }, g.settings);
  assert(g.settings.packs.length === 1, 'an unknown pack never empties the pack list');
  g.settings = g.sanitizeSettings({ maxPlayers: 9 }, g.settings);
  assert(g.settings.maxPlayers === 6, 'the table holds at most 6');
}

async function run() {
  engineChecks();
  await new Promise((resolve) => server.listen(PORT, resolve));

  // eslint-disable-next-line no-console
  console.log('\nA room over the wire');
  const screen = new Client('Screen', 'screen-1');
  const phones = ['Аня', 'Боря', 'Вера', 'Гоша'].map((n, i) => new Client(n, `ph-${i}`));
  const [ann, bob, vera, gosha] = phones;
  const watcher = new Client('Watcher', 'watch-1');
  await Promise.all([screen, ...phones, watcher].map((c) => c.ready()));

  const guest = await emit(screen.socket, 'memehype:create', { nickname: 'X', playerId: 'screen-1' });
  assert(guest.ok === false && guest.code === 'GUEST_CANNOT_CREATE', 'a guest cannot open a room');

  const account = registerAccount('MemeHost');
  const created = await emit(screen.socket, 'memehype:create', {
    token: account.token, device: 'screen', settings: { rounds: 5, pickSec: 30, voteSec: 20 },
  });
  assert(created.ok, 'the big screen opens a Meme Hype room');
  const { roomCode } = created;
  screen.state = created.state;
  screen.rejoin = { roomCode, token: account.token, device: 'screen' };
  assert(roomManager.roomKind(roomCode) === 'memehype', 'the room manager knows it is a Meme Hype room');
  assert(seat(created.state, created.playerId).playing === false, 'the big screen is the table, not a player');

  // --- settings in the lobby -------------------------------------------
  await emit(screen.socket, 'memehype:settings', { settings: { packs: ['everyday', 'ussr', 'animals'] } });
  await screen.waitFor((s) => s.settings.packs.length === 3, 'three packs chosen');
  assert(screen.state.options.packs.length === 3, 'the lobby is offered every pack');
  await emit(screen.socket, 'memehype:settings', { settings: { rating: '18' } });
  assert(screen.state.settings.rating === '16', 'an unconfirmed switch to 18+ is refused');
  await emit(screen.socket, 'memehype:settings', { settings: { rating: '18', confirmAdult: true } });
  await screen.waitFor((s) => s.settings.rating === '18', 'the room is 18+ after confirmation');
  await emit(screen.socket, 'memehype:settings', { settings: { rating: '16' } });
  await screen.waitFor((s) => s.settings.rating === '16', 'and back to 16+');
  await emit(screen.socket, 'memehype:settings', { settings: { maxPlayers: 3 } });
  await screen.waitFor((s) => s.settings.maxPlayers === 3, 'the host limits the table to 3');

  const tooSoon = await emit(screen.socket, 'memehype:start', {});
  assert(tooSoon.ok === false, 'the game cannot start with fewer than 3 players');

  // --- phones join --------------------------------------------------------
  for (const phone of [ann, bob, vera]) {
    // eslint-disable-next-line no-await-in-loop
    const res = await phone.join(roomCode);
    assert(res.ok, `${phone.name} joins from a phone`);
  }
  const full = await gosha.join(roomCode);
  assert(full.ok === false, 'a fourth phone is refused when the table holds 3');
  await emit(screen.socket, 'memehype:settings', { settings: { maxPlayers: 4 } });
  await screen.waitFor((s) => s.settings.maxPlayers === 4, 'the table is opened to 4');
  const fourth = await gosha.join(roomCode);
  assert(fourth.ok, 'now the fourth phone gets a seat');
  await screen.waitFor((s) => s.players.filter((p) => p.playing).length === 4, 'the screen shows 4 players connected');
  assert(screen.state.players.filter((p) => p.playing).every((p) => p.status !== 'left'), 'every player has a status');

  await emit(ann.socket, 'memehype:ready', { ready: true });
  await screen.waitFor((s) => seat(s, 'ph-0').status === 'ready', 'a ready player shows as ready');

  // --- round 1 -------------------------------------------------------------
  const started = await emit(screen.socket, 'memehype:start', {});
  assert(started.ok, 'the host starts the game');
  await Promise.all(phones.map((p) => p.waitFor((s) => s.phase === 'PICK' && s.you.hand.length === 6, `${p.name} is dealt`)));
  assert(!!screen.state.situation?.text, 'the screen shows a situation');
  assert(screen.state.situation.rating === '16', 'the situation is from the 16+ deck');
  assert(screen.state.you.hand.length === 0, 'the table holds no hand');
  const hands = phones.map((p) => p.state.you.hand.map((m) => m.id));
  assert(new Set(hands.flat()).size === 24, 'no meme is dealt to two players at once');
  assert(phones.every((p) => p.state.you.hand.every((m) => m.rating === '16')), 'every dealt meme is 16+');
  assert(seat(screen.state, 'ph-0').status === 'picking', 'players show as choosing');

  const notMine = await emit(ann.socket, 'memehype:pick', { memeId: bob.state.you.hand[0].id });
  assert(notMine.ok === false, 'a phone cannot play a meme from someone else’s hand');
  const played = await ann.play();
  assert(played.ok, 'a phone plays a meme');
  const twice = await ann.play();
  assert(twice.ok === false, 'a second meme in the same round is refused');
  await screen.waitFor((s) => seat(s, 'ph-0').status === 'ready' && s.pickedCount === 1, 'the screen sees the pick at once');
  assert(screen.state.cards.length === 0, 'played memes stay hidden while others are choosing');

  await Promise.all([bob.play(), vera.play(), gosha.play()]);
  await screen.waitFor((s) => s.phase === 'VOTE', 'the vote starts as soon as everyone has played');
  assert(screen.state.cards.length === 4, 'all four memes are on the table');
  assert(screen.state.cards.every((c) => c.index >= 1 && c.meme && !('playerId' in c)), 'the table shows MEM #N without owners');
  assert(screen.state.roundResult === null, 'nobody is named before the count');
  await Promise.all(phones.map((p) => p.waitFor((s) => s.phase === 'VOTE', `${p.name} can vote`)));
  assert(ann.state.cards.filter((c) => c.mine).length === 1, 'a phone knows which meme is its own');
  const own = await emit(ann.socket, 'memehype:vote', { pickId: ann.state.cards.find((c) => c.mine).id });
  assert(own.ok === false, 'nobody may vote for their own meme');

  // Everyone votes for Bob's meme except Bob.
  const bobCard = bob.state.cards.find((c) => c.mine).id;
  await Promise.all([ann, vera, gosha].map((p) => emit(p.socket, 'memehype:vote', { pickId: bobCard })));
  await screen.waitFor((s) => seat(s, 'ph-0').status === 'ready', 'a voter shows as done');
  const bobTarget = bob.state.cards.find((c) => !c.mine).id;
  const bobVote = await emit(bob.socket, 'memehype:vote', { pickId: bobTarget });
  assert(bobVote.ok, 'the last voter votes');
  const again = await emit(bob.socket, 'memehype:vote', { pickId: bobTarget });
  assert(again.ok === false, 'a second vote is refused');

  await screen.waitFor((s) => s.phase === 'REVEAL', 'the result is shown as soon as everyone has voted');
  const result = screen.state.roundResult;
  const bobRow = result.entries.find((e) => e.playerId === 'ph-1');
  assert(bobRow.nickname === 'Боря' && bobRow.votes === 3, 'the author is revealed with their votes');
  assert(bobRow.points === 400 && bobRow.winner, 'three votes plus the round bonus is 400 points');
  assert(result.winners.length === 1, 'the round has one winner');
  assert(seat(screen.state, 'ph-1').score === 400 && seat(screen.state, 'ph-1').roundWins === 1, 'the scoreboard is updated');

  // --- round 2: a phone drops and comes back ---------------------------------
  await emit(screen.socket, 'memehype:skip', {});
  await Promise.all(phones.map((p) => p.waitFor((s) => s.phase === 'PICK' && s.round === 2, `${p.name} sees round 2`)));
  assert(phones.every((p) => p.state.you.hand.length === 6), 'hands are topped up to 6');
  const firstIds = new Set(hands.flat());
  const refill = ann.state.you.hand.filter((m) => !firstIds.has(m.id));
  assert(refill.length === 1, 'the new card is one the player has not held before');

  vera.socket.io.engine.close();
  await screen.waitFor((s) => seat(s, 'ph-2').dropsAt, 'the screen shows the 20-second countdown');
  await new Promise((r) => vera.socket.once('connect', r));
  await screen.waitFor((s) => seat(s, 'ph-2').connected && !seat(s, 'ph-2').dropsAt, 'the phone is back in time');
  await vera.waitFor((s) => s.you?.hand?.length === 6, 'the returning phone still has its hand');
  await Promise.all(phones.map((p) => p.play()));
  await Promise.all(phones.map((p) => p.waitFor((s) => s.phase === 'VOTE', `${p.name} votes in round 2`)));
  await Promise.all(phones.map((p) => p.voteForSomeoneElse()));
  await screen.waitFor((s) => s.phase === 'REVEAL' && s.round === 2, 'round 2 is counted');

  // --- a spectator ------------------------------------------------------
  const watching = await emit(watcher.socket, 'memehype:spectate', {
    roomCode, nickname: 'Watcher', playerId: 'watch-1', guestKey: 'watch-secret-key-00',
  });
  assert(watching.ok && watching.state.you === null, 'a spectator joins the game in progress with no seat');

  // --- round 3: the timer picks for a silent player; one phone leaves -------
  await emit(screen.socket, 'memehype:skip', {});
  await Promise.all(phones.map((p) => p.waitFor((s) => s.phase === 'PICK' && s.round === 3, `${p.name} sees round 3`)));
  await Promise.all([ann, bob, vera].map((p) => p.play()));
  gosha.close();
  await screen.waitFor((s) => seat(s, 'ph-3').left, 'a phone that stays away is out after the grace period');
  assert(seat(screen.state, 'ph-3').status === 'left' && seat(screen.state, 'ph-3').exitReason === 'timeout', 'the screen shows why');
  // Gosha's hand is gone, so the round was not waiting on him.
  await screen.waitFor((s) => s.phase === 'VOTE', 'the game carries on without the player who left');

  // --- surrender ---------------------------------------------------------
  await Promise.all([ann, bob].map((p) => p.waitFor((s) => s.phase === 'VOTE', `${p.name} can vote`)));
  const gave = await emit(vera.socket, 'memehype:surrender', {});
  assert(gave.ok, 'a player surrenders');
  await screen.waitFor((s) => seat(s, 'ph-2').surrendered, 'everyone sees the surrender');
  const back = await vera.join(roomCode);
  assert(back.ok === false && back.code === 'SEAT_GONE', 'a surrendered player cannot take the seat back');
  // Two players are left - below the minimum of three - so the game ends.
  await screen.waitFor((s) => s.phase === 'GAME_OVER', 'too few players ends the game');
  const final = screen.state.results;
  assert(final.reason === 'tooFew', 'the final table says why it ended');
  assert(final.standings.every((r) => 'roundWins' in r && 'votesReceived' in r), 'the final table has round wins and votes');
  const staying = final.standings.filter((r) => !r.left);
  assert(staying.every((r, i) => i === 0 || staying[i - 1].score >= r.score), 'the table is ordered by points');
  assert(final.standings.slice(staying.length).every((r) => r.left), 'players who left are listed last');
  const summary = registry.find(roomCode).adapter.summary(roomManager.getMemeHypeRoom(roomCode));
  assert(summary.gameType === 'memehype' && summary.stage === 'finished', 'the admin view describes the room');

  [screen, ...phones, watcher].forEach((c) => c.close());
  await wait(100);
  await fullGame();
  // eslint-disable-next-line no-console
  console.log(`\n=== MEME HYPE SOCKET TESTS PASSED (${passed} checks) ===`);
  process.exit(0);
}

// A whole 18+ match on the timer: nobody touches their phone in the pick
// phase, so every meme is chosen automatically, and the game still reaches
// its final table after the last round.
async function fullGame() {
  // eslint-disable-next-line no-console
  console.log('\nA full 18+ game on the clock');
  const screen = new Client('Screen2', 'screen-2');
  const phones = ['P1', 'P2', 'P3'].map((n, i) => new Client(n, `q-${i}`));
  await Promise.all([screen, ...phones].map((c) => c.ready()));
  const account = registerAccount('MemeHost2');
  const created = await emit(screen.socket, 'memehype:create', {
    token: account.token, device: 'screen',
    settings: { rating: '18', confirmAdult: true, packs: ['animals'], rounds: 5 },
  });
  const { roomCode } = created;
  assert(created.state.settings.rating === '18', 'an 18+ room is opened with confirmation');
  await Promise.all(phones.map((p) => p.join(roomCode)));
  await emit(screen.socket, 'memehype:start', {});
  await Promise.all(phones.map((p) => p.waitFor((s) => s.phase === 'PICK', `${p.name} is dealt`)));
  assert(phones.every((p) => p.state.you.hand.every((m) => m.rating === '18' && m.pack === 'animals')), '18+ hands come only from the chosen 18+ pack');

  const game = roomManager.getMemeHypeRoom(roomCode);
  for (let round = 1; round <= 5; round += 1) {
    // Run the clock out instead of waiting 45 seconds.
    game.advance(); // PICK -> VOTE (automatic picks)
    assert(Object.values(game.picks).length === 3 && Object.values(game.picks).every((p) => p.auto), `round ${round}: silent players get an automatic meme`);
    game.advance(); // VOTE -> REVEAL (nobody voted)
    assert(game.roundResult.entries.every((e) => e.points === 0), `round ${round}: no votes, no points`);
    game.advance(); // REVEAL -> next round or the end
  }
  assert(game.phase === 'GAME_OVER' && game.results.reason === 'rounds', 'the game ends after the last round');
  assert(game.results.winnerIds.length === 0, 'a game nobody scored in has no winner');
  assert(new Set(game.usedSituations).size === 5, 'no situation came up twice');
  [screen, ...phones].forEach((c) => c.close());
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
