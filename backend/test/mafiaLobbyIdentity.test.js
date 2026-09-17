// Regression test for the bug that stopped Mafia starting at all.
//
// The lobby decides whether to show the START button by finding "me" in
// the player list. It used to look for the id the BROWSER generates and
// keeps in localStorage - but a signed-in player's seat is keyed by their
// ACCOUNT id, and only a signed-in player can create a room. The lookup
// therefore found nobody, `isHost` was false for the host, the start
// button was never rendered, and no amount of filling the lobby helped.
//
// The payload the server builds per viewer already answers the question:
// `isYou` is stamped on the seat the payload was built for. These tests
// pin that down, along with the seat limits the lobby reads from state.

const { registerAccount } = require('./helpers/testEnv');
const { MafiaGame, PHASES } = require('../src/mafia/MafiaGame');
const { MIN_PLAYERS, MAX_PLAYERS } = require('../src/mafia/settings');
const access = require('../src/platform/access');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// Exactly what MafiaLobby.jsx now does to find the local player.
function lobbyMe(view) {
  return view.players.find((p) => p.isYou) || null;
}

(function registeredHostSeesTheStartButton() {
  const account = registerAccount(`Host_${Math.random().toString(36).slice(2, 8)}`);
  // The browser sends BOTH its own local id and the account token; the
  // token wins, so the seat is keyed by the account id.
  const browserLocalId = 'local-browser-uuid-that-is-not-an-account';
  const identity = access.resolveIdentity({
    token: account.token, playerId: browserLocalId, nickname: account.nickname,
  });
  assert(identity.playerId === account.id, 'a token-bearing caller is seated under their account id');
  assert(identity.playerId !== browserLocalId, 'the seat id is NOT the browser-local id');

  const game = new MafiaGame('LOBBY1', identity.playerId, {});
  game.addPlayer({ ...identity, socketId: 's1' });
  for (let i = 2; i <= MIN_PLAYERS; i += 1) {
    game.addPlayer({ playerId: `g${i}`, socketId: `s${i}`, nickname: `Guest${i}` });
  }

  const view = game.toClientJSON(identity.playerId);

  // The old lookup - the actual bug.
  assert(
    !view.players.find((p) => p.id === browserLocalId),
    'the browser-local id matches no seat (this is why the old lookup failed)',
  );
  // The fixed lookup.
  const me = lobbyMe(view);
  assert(me, 'the viewer finds their own seat through isYou');
  assert(me.id === account.id, 'isYou is stamped on the account seat');
  assert(me.isHost === true, 'the host is recognised as host, so the start button renders');
  console.log('✓ a signed-in host finds their own seat in the payload built for them');
}());

(function everySeatSeesExactlyOneSelf() {
  const game = new MafiaGame('LOBBY2', 'p1', {});
  for (let i = 1; i <= 6; i += 1) game.addPlayer({ playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}` });
  game.players.forEach((seat) => {
    const view = game.toClientJSON(seat.id);
    const mine = view.players.filter((p) => p.isYou);
    assert(mine.length === 1, `${seat.id} sees exactly one seat marked as themselves`);
    assert(mine[0].id === seat.id, `${seat.id} is marked on their own seat`);
  });
  // A watcher has no seat at all, and must not be handed anyone else's.
  const watcher = game.toClientJSON(null);
  assert(watcher.players.every((p) => !p.isYou), 'a spectator owns no seat in the payload');
  assert(lobbyMe(watcher) === null, 'a spectator gets neither the start nor the ready button');
  console.log('✓ every seat sees exactly one self, and a spectator sees none');
}());

(function theLobbyReadsItsLimitsFromTheState() {
  const game = new MafiaGame('LOBBY3', 'p1', {});
  game.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'P1' });
  const small = game.toClientJSON('p1');
  assert(small.minPlayers === MIN_PLAYERS, 'the payload carries the engine minimum');
  assert(small.maxPlayers === MAX_PLAYERS, 'the payload carries the engine maximum');
  assert(small.canStart === false, 'a room below the minimum cannot start');

  for (let i = 2; i <= MIN_PLAYERS; i += 1) game.addPlayer({ playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}` });
  assert(game.toClientJSON('p1').canStart === true, 'a room at the minimum can start');
  console.log('✓ the seat limits and the start gate travel with the state');
}());

(function theHostCanActuallyStartAtEverySize() {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n += 1) {
    const game = new MafiaGame(`SIZE${n}`, 'p1', {});
    for (let i = 1; i <= n; i += 1) game.addPlayer({ playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}` });
    const me = lobbyMe(game.toClientJSON('p1'));
    assert(me?.isHost, `n=${n}: the host is recognised`);
    assert(game.toClientJSON('p1').canStart, `n=${n}: the lobby offers the start button`);
    game.start('p1');
    assert(game.phase === PHASES.ROLE_REVEAL, `n=${n}: pressing start leaves the lobby`);
    assert(game.players.every((p) => p.role), `n=${n}: every player was dealt a role`);
    assert(game.players.some((p) => ['MAFIA', 'DON'].includes(p.role)), `n=${n}: the mafia exist`);
    // Every player's own payload now routes them to the game screen.
    game.players.forEach((seat) => {
      const view = game.toClientJSON(seat.id);
      assert(view.phase !== 'LOBBY', `n=${n}: ${seat.id} is sent to the game screen`);
      assert(view.you && view.you.role, `n=${n}: ${seat.id} is told their own role`);
    });
  }
  console.log(`✓ a full lobby starts at every size from ${MIN_PLAYERS} to ${MAX_PLAYERS}`);
}());

console.log('\n=== MAFIA LOBBY IDENTITY TESTS PASSED ===');
