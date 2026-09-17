// The Bunker through the Creator's panel.
//
// Everything the mode gained is settings and data, which means the admin
// tools that already exist reach all of it: a Creator can change what a new
// Bunker room starts with, lock a setting so a host cannot move it, cap the
// table, close it to guests, and restore an earlier version - without any
// of that machinery knowing what an action card or a scenario is.
//
// These tests pin that down, because "prepared for the admin panel" is
// only true if the admin path actually bites.

const { registerAccount } = require('./helpers/testEnv');

const modeConfig = require('../src/platform/modeConfig');
const roomManager = require('../src/game/RoomManager');
const { BunkerGame, PHASES } = require('../src/bunker/BunkerGame');
const settings = require('../src/bunker/settings');
const actionCards = require('../src/bunker/actionCards');
const scenarios = require('../src/bunker/scenarios');
const events = require('../src/bunker/events');
const content = require('../src/bunker/content');

const MODE = 'bunker.classic';

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function seat(game, n) {
  for (let i = 1; i <= n; i += 1) {
    game.addPlayer({
      playerId: `p${i}`, socketId: `s${i}`, nickname: `P${i}`, accountId: i === 1 ? 'acc1' : null,
    });
  }
  return game;
}

function main() {
  console.log('\nBunker: the Creator\'s controls\n');
  const creator = registerAccount(`Creator_${Math.random().toString(36).slice(2, 8)}`);

  test('the mode config exposes every new setting as an editable leaf', () => {
    const base = modeConfig.baseConfig(MODE);
    assert(base.defaults, 'the mode ships its defaults to the panel');
    // Every section a host can change is in what the Creator can pre-set.
    ['scenario', 'players', 'characters', 'baggage', 'actionCards', 'rounds', 'voting', 'events']
      .forEach((k) => assert(base.defaults[k] !== undefined, `the panel can edit ${k}`));
    assert(base.minPlayers === settings.MIN_PLAYERS && base.maxPlayers === settings.MAX_PLAYERS,
      'the panel reads the engine\'s own limits');
  });

  test('a Creator can change what every new Bunker room starts with', () => {
    modeConfig.save(MODE, {
      defaults: {
        scenario: 'zombies',
        baggage: { count: 4 },
        characters: { secrets: 2 },
        actionCards: { enabled: true, perPlayer: 4, deck: ['immunity', 'double_vote', 'peek_baggage'] },
        events: { enabled: true, chance: 0.5 },
        voting: { mode: 'multi', votesPerPlayer: 3, secret: true },
        rounds: { total: 4 },
      },
    }, creator.id);

    const game = new BunkerGame('ADM1', 'p1', modeConfig.settingsForNewRoom(MODE, {}));
    assert(game.settings.scenario === 'zombies', 'a new room opens on the scenario the Creator chose');
    assert(game.settings.baggage.count === 4, 'and with four bags');
    assert(game.settings.characters.secrets === 2, 'and two secrets');
    assert(game.settings.actionCards.perPlayer === 4, 'and four cards in hand');
    assert(game.settings.actionCards.deck.length === 3, 'and only the three cards the Creator left in');
    assert(game.settings.voting.mode === 'multi' && game.settings.voting.secret, 'and the voting rules');
    assert(game.settings.rounds.total === 4, 'and the round limit');

    // And a room built on it deals exactly that.
    seat(game, 6).start('p1');
    assert(game.baggageKeysInPlay().length === 4, 'the table deals four bags');
    assert(game.secretKeysInPlay().length === 2, 'and two secrets');
    game.players.forEach((p) => {
      assert(p.hand.length === 4, 'every player holds four cards');
      p.hand.forEach((h) => assert(['immunity', 'double_vote', 'peek_baggage'].includes(h.id), 'from the Creator\'s deck only'));
    });
  });

  test('a locked setting cannot be moved by a host', () => {
    modeConfig.save(MODE, {
      defaults: { actionCards: { enabled: false }, events: { enabled: false } },
      locked: ['actionCards.enabled', 'events.enabled'],
    }, creator.id);

    const game = roomManager.createBunkerRoom('p1', {}, { accountId: 'acc1', nickname: 'Host' });
    seat(game, 5);
    assert(game.settings.actionCards.enabled === false, 'a new room starts with the cards switched off');

    // The host asks for them back; the lock puts them straight back off.
    game.updateSettings('p1', { actionCards: { enabled: true }, events: { enabled: true } });
    assert(game.settings.actionCards.enabled === false, 'the host cannot switch the locked setting on');
    assert(game.settings.events.enabled === false, 'nor the other one');

    // An unlocked setting in the same patch still applies.
    game.updateSettings('p1', { turnSec: 35, actionCards: { enabled: true } });
    assert(game.settings.turnSec === 35, 'an unlocked setting still moves');
    assert(game.settings.actionCards.enabled === false, 'while the locked one holds');
    roomManager.deleteBunkerRoom(game.roomCode, 'test');
  });

  test('a Creator can tighten the table and close it to guests', () => {
    modeConfig.save(MODE, { minPlayers: 5, maxPlayers: 8, allowGuests: false }, creator.id);

    let threw = null;
    try {
      modeConfig.assertCanSeat(MODE, 3, null);
    } catch (err) { threw = err; }
    assert(threw && threw.code === 'GUESTS_DISABLED', 'a guest is turned away');
    assert(!(() => { try { modeConfig.assertCanSeat(MODE, 3, 'acc1'); return false; } catch { return true; } })(),
      'an account is seated');

    let full = null;
    try { modeConfig.assertCanSeat(MODE, 8, 'acc1'); } catch (err) { full = err; }
    assert(full && full.code === 'ROOM_FULL', 'the tighter capacity is enforced');

    let short = null;
    try { modeConfig.assertCanStart(MODE, 4); } catch (err) { short = err; }
    assert(short && short.code === 'NOT_ENOUGH_PLAYERS', 'the higher minimum is enforced');
  });

  test('a bad config is refused rather than saved', () => {
    const bad = [
      { minPlayers: 99 },
      { maxPlayers: 1 },
      { minPlayers: 10, maxPlayers: 6 },
    ];
    bad.forEach((patch) => {
      let threw = false;
      try { modeConfig.save(MODE, patch, creator.id); } catch { threw = true; }
      assert(threw, `a config with ${JSON.stringify(patch)} is refused`);
    });
  });

  test('an earlier version can be restored, and a reset returns the shipped rules', () => {
    const history = modeConfig.history(MODE);
    assert(history.length >= 2, 'every save is a version in the history');
    modeConfig.reset(MODE, creator.id);
    const after = modeConfig.effective(MODE);
    // A reset writes the shipped configuration back as a new version, so
    // the mode still has a row - what matters is that its VALUES are the
    // ones the code ships.
    const shipped = modeConfig.baseConfig(MODE);
    assert(after.minPlayers === shipped.minPlayers && after.maxPlayers === shipped.maxPlayers,
      'a reset returns the shipped player limits');
    assert(after.allowGuests === shipped.allowGuests, 'and lets guests back in');
    assert(JSON.stringify(after.defaults) === JSON.stringify(shipped.defaults), 'and the shipped defaults');
    assert((after.locked || []).length === 0, 'and unlocks everything');
    const game = new BunkerGame('ADM2', 'p1', modeConfig.settingsForNewRoom(MODE, {}));
    assert(game.settings.scenario === 'classic', 'and a new room is the classic game again');
    assert(game.settings.actionCards.enabled === true, 'with the cards back on');
  });

  test('a room already running is never disturbed by a config change', () => {
    modeConfig.reset(MODE, creator.id);
    const game = roomManager.createBunkerRoom('p1', { baggage: { count: 3 } }, { accountId: 'acc1', nickname: 'Host' });
    seat(game, 6).start('p1');
    const before = JSON.stringify(game.settings);
    const sheet = game.categoriesInPlay().join(',');

    modeConfig.save(MODE, {
      defaults: { baggage: { count: 1 }, actionCards: { enabled: false } },
    }, creator.id);

    assert(JSON.stringify(game.settings) === before, 'the running room keeps the rules it started with');
    assert(game.categoriesInPlay().join(',') === sheet, 'and the character sheet it was dealt on');
    assert(game.phase === PHASES.REVEAL, 'and is still playing');
    modeConfig.reset(MODE, creator.id);
    roomManager.deleteBunkerRoom(game.roomCode, 'test');
  });

  test('every piece of content is addressable by id, so the panel can list and edit it', () => {
    // Nothing in the mode is anonymous: an admin tool can enumerate it all.
    assert(actionCards.catalogue().every((c) => c.id && c.stage && c.target && c.duration),
      'every action card is listed with its rules');
    assert(events.catalogue().every((e) => e.id), 'every event is listed');
    assert(scenarios.catalogue().every((s) => s.id && s.settings), 'every scenario is listed with the rules it sets');
    assert(content.ALL_CATEGORY_KEYS.every((k) => content.categoryDef(k)), 'every characteristic is defined');
    Object.entries(content.DECKS).forEach(([deck, cards]) => {
      assert(cards.length > 0, `${deck} has cards`);
      assert(cards.every((c) => c.id && c.en && c.ru), `every ${deck} card has an id and both names`);
      const ids = cards.map((c) => c.id);
      assert(new Set(ids).size === ids.length, `${deck} has no duplicate ids`);
    });
    // And the schema the panel would draw from covers all of it.
    const schema = settings.schema();
    assert(schema.actionCards.length === actionCards.ALL_IDS.length, 'the schema lists every action card');
    assert(schema.events.length === events.ALL_IDS.length, 'and every event');
    assert(schema.scenarios.length === scenarios.ids().length, 'and every scenario');
  });

  console.log(`\nBunker admin: ${passed} passed`);
  console.log('\n=== BUNKER ADMIN TESTS PASSED ===');
}

main();
