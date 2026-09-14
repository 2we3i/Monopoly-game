// Deterministic tests of the Mafia engine.
//
// The engine deals roles at random, so these tests do what a referee
// would: set up a game, then FORCE the roles they want to reason about
// before driving the phases. Everything after that - night resolution,
// vote counting, secrecy, win conditions - is the real code path.

const { MafiaGame, MafiaError, PHASES } = require('../src/mafia/MafiaGame');
const { presetSettings, balancedRoles, clampRoles, randomSettings, MIN_PLAYERS, MAX_PLAYERS } = require('../src/mafia/settings');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertThrows(fn, pattern, msg) {
  let threw = false;
  let errMsg = '';
  try {
    fn();
  } catch (e) {
    threw = e instanceof MafiaError;
    errMsg = e.message;
  }
  assert(threw, `${msg} (expected a MafiaError, none was thrown)`);
  if (pattern) assert(pattern.test(errMsg), `${msg} (message "${errMsg}" did not match ${pattern})`);
}

function gameWith(count, settings) {
  const game = new MafiaGame('TEST', 'p1', settings);
  for (let i = 1; i <= count; i += 1) {
    game.addPlayer({ playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}` });
  }
  return game;
}

// Deal exact roles so a test can reason about the outcome.
function forceRoles(game, mapping) {
  Object.entries(mapping).forEach(([id, role]) => {
    const player = game.getPlayer(id);
    assert(player, `forceRoles: no player ${id}`);
    player.role = role;
  });
}

// --- role tables -------------------------------------------------------

(function roleBalancing() {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n += 1) {
    const roles = balancedRoles(n, {});
    const mafia = roles.MAFIA + roles.DON;
    const special = Object.values(roles).reduce((a, b) => a + b, 0);
    assert(mafia >= 1, `${n} players: there must always be at least one mafia`);
    assert(mafia < n - mafia, `${n} players: mafia (${mafia}) must not start at or above parity`);
    assert(special <= n - 1, `${n} players: at least one civilian seat must remain (special=${special})`);
  }
  // A host who over-fills the table gets trimmed, not a broken game.
  const greedy = clampRoles({ MAFIA: 20, DON: 5, SHERIFF: 5, DOCTOR: 5, MANIAC: 5 }, 6);
  const total = Object.values(greedy).reduce((a, b) => a + b, 0);
  assert(total <= 5, `over-filled role table must be trimmed to fit 6 players, got ${total}`);
  assert(greedy.MAFIA + greedy.DON >= 1, 'trimming must never remove the mafia entirely');
  console.log('✓ role tables stay playable for every supported player count');
}());

(function minimumPlayers() {
  const game = gameWith(3);
  assertThrows(() => game.start('p1'), /at least/i, 'a 3-player game cannot start');
  console.log('✓ a game below the minimum player count refuses to start');
}());

(function onlyHostControls() {
  const game = gameWith(6);
  assertThrows(() => game.updateSettings('p2', { night: { durationSec: 5 } }), /host/i, 'non-host cannot change settings');
  assertThrows(() => game.start('p3'), /host/i, 'non-host cannot start the game');
  console.log('✓ only the host can change settings or start the game');
}());

// --- night resolution --------------------------------------------------

(function mafiaKillsUnlessHealed() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, {
    p1: 'MAFIA', p2: 'DOCTOR', p3: 'SHERIFF', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN',
  });
  game.advance(); // ROLE_REVEAL -> NIGHT
  assert(game.phase === PHASES.NIGHT, 'reveal advances into the night');

  game.submitNightAction('p1', 'p5'); // mafia shoots P5
  game.submitNightAction('p2', 'p5'); // doctor covers P5
  game.submitNightAction('p3', 'p1'); // sheriff checks the mafia
  game.advance(); // resolve

  assert(game.getPlayer('p5').alive, 'a healed target survives the night');
  const check = (game.privateResults.p3 || []).find((r) => r.type === 'CHECK_RESULT');
  assert(check && check.params.isMafia === true, 'the sheriff learns their target is mafia');
  console.log('✓ the doctor saves the mafia target, and the sheriff gets a real result');
}());

(function mafiaKillLands() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 1, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, {
    p1: 'MAFIA', p2: 'DOCTOR', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN',
  });
  game.advance();
  game.submitNightAction('p1', 'p5');
  game.submitNightAction('p2', 'p3'); // doctor guards someone else
  game.advance();
  assert(!game.getPlayer('p5').alive, 'an unhealed target dies');
  assert(game.getPlayer('p5').deathCause === 'MAFIA', 'the death records its cause');
  assert(game.lastNight.deaths.length === 1, 'the night summary lists exactly one death');
  console.log('✓ an unprotected mafia target dies and the night is summarised');
}());

(function donBreaksTheTie() {
  const game = gameWith(8, { roles: { MAFIA: 2, DON: 1, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, {
    p1: 'DON', p2: 'MAFIA', p3: 'MAFIA', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN', p7: 'CIVILIAN', p8: 'CIVILIAN',
  });
  game.advance();
  game.submitNightAction('p2', 'p5');
  game.submitNightAction('p3', 'p6'); // rank and file disagree
  game.submitNightAction('p1', 'p6'); // the Don sides with P6
  game.advance();
  assert(!game.getPlayer('p6').alive, "a tied mafia vote is settled by the Don's own pick");
  console.log('✓ the Don breaks a tied mafia vote');
}());

(function selfTargetingIsBlocked() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 1, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'DOCTOR', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.advance();
  assertThrows(() => game.submitNightAction('p2', 'p2'), /yourself/i, 'the doctor cannot self-heal by default');

  const funGame = gameWith(6, {
    roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 1, MANIAC: 0 },
    autoBalance: false,
    fun: { enabled: true, modifiers: { doctorSelfHeal: true } },
  });
  funGame.start('p1');
  forceRoles(funGame, { p1: 'MAFIA', p2: 'DOCTOR', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  funGame.advance();
  funGame.submitNightAction('p2', 'p2');
  funGame.submitNightAction('p1', 'p2');
  funGame.advance();
  assert(funGame.getPlayer('p2').alive, 'with the self-heal modifier on, the doctor can cover themselves');
  console.log('✓ self-targeting follows the doctorSelfHeal modifier, and the modifier really changes play');
}());

// --- voting ------------------------------------------------------------

(function votingExecutesAndTiesObeySettings() {
  const game = gameWith(6, {
    roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 },
    autoBalance: false,
    day: { tieResolution: 'NO_EXECUTION' },
  });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'CIVILIAN', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.advance();            // NIGHT
  game.submitNightAction('p1', 'p6');
  game.advance();            // resolve -> RESULT
  game.advance();            // -> DAY
  assert(game.phase === PHASES.DAY, 'the game reaches the day');
  game.advance();            // -> VOTE
  assert(game.phase === PHASES.VOTE, 'the day leads into a vote');

  game.castVote('p2', 'p1');
  game.castVote('p3', 'p1');
  game.castVote('p4', 'p5');
  game.castVote('p5', 'p1');
  game.castVote('p1', 'p2');
  game.advance();            // resolve
  assert(!game.getPlayer('p1').alive, 'the player with the most votes is executed');
  assert(game.lastVote.outcome === 'EXECUTED', 'the vote outcome is recorded');
  console.log('✓ a plurality vote executes the right player');
}());

(function tiedVoteSpares() {
  const game = gameWith(6, {
    roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 },
    autoBalance: false,
    day: { tieResolution: 'NO_EXECUTION' },
  });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'CIVILIAN', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.phase = PHASES.VOTE;
  game.votes = {};
  game.castVote('p1', 'p2');
  game.castVote('p3', 'p2');
  game.castVote('p4', 'p5');
  game.castVote('p6', 'p5');
  game.resolveVote();
  assert(game.alivePlayers.length === 6, 'with NO_EXECUTION, a tie kills nobody');
  assert(game.lastVote.outcome === 'TIE', 'the tie is reported as a tie');
  console.log('✓ a tied vote respects the tie-resolution setting');
}());

(function abstainAndVoteChangeRules() {
  const strict = gameWith(6, {
    roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 },
    autoBalance: false,
    day: { allowAbstain: false, allowVoteChange: false },
  });
  strict.start('p1');
  strict.phase = PHASES.VOTE;
  assertThrows(() => strict.castVote('p2', 'SKIP'), /abstain/i, 'abstaining can be switched off');
  strict.castVote('p2', 'p3');
  assertThrows(() => strict.castVote('p2', 'p4'), /change/i, 'vote changing can be switched off');
  console.log('✓ abstain and vote-change settings are enforced');
}());

(function doubleVoteModifierCounts() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  game.doubleVoteId = 'p2';
  game.phase = PHASES.VOTE;
  game.votes = {};
  game.castVote('p2', 'p4');
  game.castVote('p3', 'p5');
  const tally = game.voteTally();
  assert(tally.p4 === 2 && tally.p5 === 1, `the double-vote player counts twice (got ${JSON.stringify(tally)})`);
  console.log('✓ the double-vote modifier really doubles a vote');
}());

// --- win conditions ----------------------------------------------------

(function townWinsWhenMafiaGone() {
  const game = gameWith(5, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'CIVILIAN', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN' });
  game.kill(game.getPlayer('p1'), 'VOTE', null);
  assert(game.checkWin() === 'TOWN', 'the town wins once the last mafia is gone');
  assert(game.phase === PHASES.GAME_OVER, 'a win ends the game');
  console.log('✓ the town wins when the mafia is eliminated');
}());

(function mafiaWinsAtParity() {
  const game = gameWith(6, { roles: { MAFIA: 2, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'MAFIA', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  ['p3', 'p4'].forEach((id) => game.kill(game.getPlayer(id), 'MAFIA', null));
  assert(game.checkWin() === 'MAFIA', 'two mafia against two civilians is a mafia win');
  console.log('✓ the mafia win on parity');
}());

(function maniacBlocksAndWinsAlone() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 1 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'MANIAC', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.kill(game.getPlayer('p1'), 'VOTE', null);
  assert(game.checkWin() === null, 'a living maniac keeps the town from winning');
  ['p3', 'p4', 'p5', 'p6'].forEach((id) => game.kill(game.getPlayer(id), 'MANIAC', null));
  assert(game.checkWin() === 'MANIAC', 'the last player standing wins as the maniac');
  console.log('✓ the maniac blocks a town win and wins alone');
}());

// --- secrecy -----------------------------------------------------------

(function payloadsKeepSecrets() {
  const game = gameWith(7, { roles: { MAFIA: 2, DON: 0, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, {
    p1: 'MAFIA', p2: 'MAFIA', p3: 'SHERIFF', p4: 'DOCTOR', p5: 'CIVILIAN', p6: 'CIVILIAN', p7: 'CIVILIAN',
  });

  const civilianView = game.toClientJSON('p5');
  const rolesVisible = civilianView.players.filter((p) => p.role !== null).map((p) => p.id);
  assert(rolesVisible.length === 1 && rolesVisible[0] === 'p5',
    `a civilian may only see their own role (saw ${JSON.stringify(rolesVisible)})`);
  assert(civilianView.you.teammates.length === 0, 'a civilian has no teammates list');
  assert(civilianView.reveal === null, 'no full role table before the game ends');

  const mafiaView = game.toClientJSON('p1');
  const mafiaSeen = mafiaView.players.filter((p) => p.role !== null).map((p) => p.id).sort();
  assert(JSON.stringify(mafiaSeen) === JSON.stringify(['p1', 'p2']), 'the mafia see each other and nobody else');
  assert(mafiaView.you.teammates.length === 2, 'the mafia get their team roster');

  const sheriffView = game.toClientJSON('p3');
  assert(sheriffView.you.role === 'SHERIFF' && sheriffView.you.action === 'INVESTIGATE',
    'the sheriff is told their own role and action');

  // A private check result belongs to the sheriff alone.
  game.pushPrivate('p3', 'CHECK_RESULT', { targetId: 'p1', isMafia: true });
  assert(game.toClientJSON('p5').you.results.length === 0, 'private results do not leak to other players');
  assert(game.toClientJSON('p3').you.results.length === 1, 'private results reach their owner');
  console.log('✓ per-player payloads never leak a role or a private result');
}());

(function rolesRevealAtGameOver() {
  const game = gameWith(5, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'CIVILIAN', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN' });
  game.kill(game.getPlayer('p1'), 'VOTE', null);
  game.checkWin();
  const view = game.toClientJSON('p4');
  assert(view.reveal && view.reveal.length === 5, 'the full role table appears once the game is over');
  assert(view.players.every((p) => p.role !== null), 'every role is visible after the game');
  console.log('✓ every role is revealed once the game is decided');
}());

// --- persistence -------------------------------------------------------

(function survivesARestart() {
  const game = gameWith(7);
  game.start('p1');
  game.advance();
  game.submitNightAction(game.alivePlayers.find((p) => p.role === 'MAFIA' || p.role === 'DON').id, 'p7');
  const restored = MafiaGame.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert(restored.phase === game.phase, 'the phase survives a round trip');
  assert(restored.players.length === game.players.length, 'players survive a round trip');
  assert(JSON.stringify(restored.nightActions) === JSON.stringify(game.nightActions), 'night actions survive a round trip');
  assert(restored.players.every((p) => !p.connected), 'restored players start disconnected');
  console.log('✓ a game in progress survives being persisted and restored');
}());

// --- presets and random ------------------------------------------------

(function presetsAndRandomStayValid() {
  ['CLASSIC', 'FAST', 'BIG_PARTY', 'WITH_MANIAC', 'CHAOS', 'FUN'].forEach((id) => {
    const settings = presetSettings(id);
    assert(settings.roles && typeof settings.night.durationSec === 'number', `preset ${id} produces a full settings object`);
    const game = gameWith(9, settings);
    game.start('p1');
    assert(game.players.every((p) => p.role), `preset ${id} deals a role to everyone`);
    assert(game.players.some((p) => ['MAFIA', 'DON'].includes(p.role)), `preset ${id} always deals a mafia`);
  });
  for (let i = 0; i < 30; i += 1) {
    const count = MIN_PLAYERS + Math.floor(Math.random() * (MAX_PLAYERS - MIN_PLAYERS + 1));
    const game = gameWith(count, randomSettings(count));
    game.start('p1');
    const mafia = game.players.filter((p) => ['MAFIA', 'DON'].includes(p.role)).length;
    assert(mafia >= 1, `random settings for ${count} players must still deal a mafia`);
    assert(game.players.every((p) => p.role), 'random settings deal a role to everyone');
  }
  console.log('✓ every preset and 30 random configurations produce a dealable game');
}());

// --- a full game -------------------------------------------------------

(function playsToAConclusion() {
  const game = gameWith(7, { roles: { MAFIA: 2, DON: 0, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  let guard = 0;
  while (game.phase !== PHASES.GAME_OVER && guard < 60) {
    guard += 1;
    if (game.phase === PHASES.NIGHT) {
      game.alivePlayers.forEach((p) => {
        if (!game.canActAtNight(p)) return;
        const target = game.alivePlayers.find((t) => t.id !== p.id);
        if (target) {
          try { game.submitNightAction(p.id, target.id); } catch { /* already acted */ }
        }
      });
    } else if (game.phase === PHASES.VOTE) {
      const alive = game.alivePlayers;
      const target = alive[0];
      alive.forEach((p) => {
        if (p.id === target.id) return;
        try { game.castVote(p.id, target.id); } catch { /* cannot vote */ }
      });
    }
    game.advance();
  }
  assert(game.phase === PHASES.GAME_OVER, `a driven game reaches a conclusion (stopped after ${guard} steps)`);
  assert(['TOWN', 'MAFIA', 'MANIAC', 'NOBODY'].includes(game.winner), `a winner is declared (got ${game.winner})`);
  assert(game.history.some((h) => h.type === 'GAME_OVER'), 'the history records the end of the game');
  console.log(`✓ a full game plays through to a winner (${game.winner})`);
}());

// --- settings that must actually bite -----------------------------------

(function showOwnResultOffSilencesActors() {
  const game = gameWith(8, {
    roles: { MAFIA: 1, DON: 1, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 },
    autoBalance: false,
    night: { showOwnResult: false },
  });
  game.start('p1');
  forceRoles(game, {
    p1: 'MAFIA', p2: 'DON', p3: 'SHERIFF', p4: 'DOCTOR', p5: 'CIVILIAN', p6: 'CIVILIAN', p7: 'CIVILIAN', p8: 'CIVILIAN',
  });
  game.advance();
  game.submitNightAction('p1', 'p5');
  game.submitNightAction('p2', 'p5');
  game.submitNightAction('p2', 'p3', { secondary: true });
  game.submitNightAction('p3', 'p1');
  game.submitNightAction('p4', 'p5');
  game.advance();
  assert(game.getPlayer('p5').alive, 'the save still happens with results hidden');
  ['p2', 'p3', 'p4'].forEach((id) => {
    assert(!(game.privateResults[id] || []).length, `${id} is told nothing when showOwnResult is off`);
  });
  console.log('✓ showOwnResult=false really hides check and save results');
}());

(function deathCauseFollowsSetting() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false, info: { showDeathCause: false } });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'CIVILIAN', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.kill(game.getPlayer('p6'), 'MAFIA', ['p1']);
  assert(game.toClientJSON('p2').players.find((p) => p.id === 'p6').deathCause === null, 'the cause is hidden when showDeathCause is off');
  game.settings.info.showDeathCause = true;
  assert(game.toClientJSON('p2').players.find((p) => p.id === 'p6').deathCause === 'MAFIA', 'and shown when it is on');
  console.log('✓ showDeathCause gates the cause of death');
}());

// --- the Don's sheriff check --------------------------------------------

(function donChecksForTheSheriff() {
  const game = gameWith(8, { roles: { MAFIA: 1, DON: 1, SHERIFF: 1, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, {
    p1: 'DON', p2: 'MAFIA', p3: 'SHERIFF', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN', p7: 'CIVILIAN', p8: 'CIVILIAN',
  });
  game.advance();
  assertThrows(() => game.submitNightAction('p2', 'p3', { secondary: true }), /second action/i, 'plain mafia have no sheriff check');
  assertThrows(() => game.submitNightAction('p1', 'p1', { secondary: true }), /yourself/i, 'the Don cannot check himself');

  game.submitNightAction('p1', 'p5');
  game.submitNightAction('p2', 'p5');
  game.submitNightAction('p3', 'p4');
  assert(!game.everyoneActed(), 'the night waits for the Don\'s check as well as his shot');
  game.submitNightAction('p1', 'p3', { secondary: true });
  assert(game.nightActions.p1.targetId === 'p5', 'the check does not overwrite the shot');
  assert(game.everyoneActed(), 'with both picks in, everyone has acted');

  const donView = game.toClientJSON('p1');
  assert(donView.you.myNightSecondary === 'p3' && donView.you.secondaryAction === 'CHECK_SHERIFF', 'the Don sees his own check');
  assert(game.toClientJSON('p2').you.myNightSecondary === null, 'the check is private to the Don');

  game.advance();
  const result = (game.privateResults.p1 || []).find((r) => r.type === 'DON_CHECK_RESULT');
  assert(result && result.params.isSheriff === true, 'the Don learns that his target is the sheriff');
  console.log('✓ the Don can check for the sheriff, and the night waits for it');
}());

// --- who killed whom, and stats -------------------------------------------

(function killersAndStatsAreRecorded() {
  const game = gameWith(6, { roles: { MAFIA: 2, DON: 0, SHERIFF: 1, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'MAFIA', p3: 'SHERIFF', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.advance();
  game.submitNightAction('p1', 'p6');
  game.submitNightAction('p2', 'p6');
  game.submitNightAction('p3', 'p1');
  game.advance(); // resolve
  assert(JSON.stringify(game.getPlayer('p6').killedBy) === JSON.stringify(['p1', 'p2']), 'both shooters are recorded');
  assert(game.getPlayer('p3').stats.mafiaFound === 1, 'the sheriff is credited with finding the mafia');
  assert(game.getPlayer('p1').stats.kills === 1, 'a shooter is credited with the kill');

  game.advance(); // DAY
  game.advance(); // VOTE
  game.castVote('p3', 'p1');
  game.castVote('p4', 'p1');
  game.castVote('p5', 'p1');
  game.castVote('p1', 'p4');
  game.castVote('p2', 'SKIP');
  game.advance();
  const executed = game.getPlayer('p1');
  assert(executed.deathCause === 'VOTE', 'the mafia member is executed');
  assert(JSON.stringify(executed.killedBy) === JSON.stringify(['p3', 'p4', 'p5']), 'the voters are recorded as the executioners');
  assert(game.getPlayer('p3').stats.votesOnMafia === 1 && game.getPlayer('p4').stats.votesReceived === 1, 'vote stats are counted');
  assert(game.getPlayer('p2').stats.votes === 0, 'an abstention is not a vote');

  // End the game and read the reveal.
  game.kill(game.getPlayer('p2'), 'VOTE', ['p3']);
  game.checkWin();
  const reveal = game.toClientJSON('p4').reveal;
  const p6 = reveal.find((p) => p.id === 'p6');
  assert(JSON.stringify(p6.killedBy) === JSON.stringify(['P1', 'P2']), 'the final screen names the killers');
  assert(p6.stats && typeof p6.stats.votes === 'number', 'stats are sent when showPlayerStats is on');
  game.settings.info.showPlayerStats = false;
  assert(game.toClientJSON('p4').reveal.every((p) => p.stats === null), 'and withheld when it is off');
  console.log('✓ killers and per-player stats are recorded and revealed at the end');
}());

(function killersStaySecretDuringPlay() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false });
  game.start('p1');
  forceRoles(game, { p1: 'MAFIA', p2: 'CIVILIAN', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.kill(game.getPlayer('p6'), 'MAFIA', ['p1']);
  const view = JSON.stringify(game.toClientJSON('p2'));
  assert(!view.includes('killedBy'), 'nobody learns who shot whom before the game ends');
  console.log('✓ the killer is not leaked while the game is running');
}());

// --- playing again -------------------------------------------------------

(function restartKeepsTheTable() {
  const game = gameWith(6, { roles: { MAFIA: 1, DON: 0, SHERIFF: 0, DOCTOR: 0, MANIAC: 0 }, autoBalance: false, night: { durationSec: 25 } });
  game.start('p1');
  assertThrows(() => game.restart('p1'), /over/i, 'a running game cannot be restarted');
  forceRoles(game, { p1: 'MAFIA', p2: 'CIVILIAN', p3: 'CIVILIAN', p4: 'CIVILIAN', p5: 'CIVILIAN', p6: 'CIVILIAN' });
  game.removePlayer('p6'); // walks out mid-game
  game.kill(game.getPlayer('p1'), 'VOTE', ['p2']);
  game.checkWin();
  assert(game.phase === PHASES.GAME_OVER, 'the game is over');
  assertThrows(() => game.restart('p2'), /host/i, 'only the host restarts');

  game.restart('p1');
  assert(game.phase === PHASES.LOBBY, 'restart returns to the lobby');
  assert(game.players.length === 5 && !game.getPlayer('p6'), 'a player who left does not come back');
  assert(game.players.every((p) => p.alive && !p.role && !p.killedBy && p.stats.votes === 0), 'every seat is reset');
  assert(game.settings.night.durationSec === 25, 'the rules are kept');
  assert(game.history.length === 0 && game.winner === null && game.dayNumber === 0, 'the old game is wiped');
  game.start('p1');
  assert(game.phase === PHASES.ROLE_REVEAL && game.players.every((p) => p.role), 'the same room can deal a new game');
  console.log('✓ a finished game restarts in the same room with the same rules');
}());

(function hostLeavingMidGameHandsOver() {
  const game = gameWith(6);
  game.start('p1');
  game.removePlayer('p1');
  assert(game.hostId !== 'p1' && game.getPlayer(game.hostId).isHost, 'the host role passes to a remaining player');
  assert(!game.getPlayer('p1').isHost, 'the leaver is no longer host');
  console.log('✓ a host who leaves mid-game hands over the room');
}());

console.log('\n=== MAFIA ENGINE TESTS PASSED ===');
