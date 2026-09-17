// Tests of everything the Bunker gained beyond its original loop:
// the settings system and its migration from the old flat shape, the
// scenarios, character generation with rarity and secrets, multiple
// baggage slots with hidden properties, action cards as real objects,
// random events, the voting variants, bots, and the round limit with its
// final decision. The original rules are covered by bunker.test.js; this
// file never re-tests them, it only proves the new parts work and that
// the old ones still hold underneath.

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const {
  BunkerGame, BunkerError, PHASES, DEFAULT_SETTINGS, sanitizeSettings,
} = require('../src/bunker/BunkerGame');
const settings = require('../src/bunker/settings');
const content = require('../src/bunker/content');
const actionCards = require('../src/bunker/actionCards');
const events = require('../src/bunker/events');
const scenarios = require('../src/bunker/scenarios');
const legacyCards = require('../src/bunker/cards');
const presence = require('../src/platform/presence');
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

function lobby(count, cfg) {
  const game = new BunkerGame('DEEP1', 'p1', { maxPlayers: Math.max(count, 4), ...cfg });
  for (let i = 1; i <= count; i += 1) {
    game.addPlayer({
      playerId: `p${i}`, socketId: `s${i}`, nickname: `Player ${i}`, accountId: i === 1 ? 'acc1' : null,
    });
  }
  return game;
}

function started(count, cfg) {
  const game = lobby(count, cfg);
  game.start('p1');
  return game;
}

// Plays out one whole reveal phase.
function revealRound(game) {
  let guard = 0;
  while (game.phase === PHASES.REVEAL && guard < 300) {
    const current = game.getPlayer(game.currentTurnId());
    if (!current) break;
    const hidden = game.hiddenKeys(current);
    if (!hidden.length) break;
    game.reveal(current.id, game.requiredKeyFor(current) || hidden[0]);
    guard += 1;
  }
}

// Gives one player a specific card in hand, so a test can play it.
function giveCard(game, playerId, cardId) {
  const player = game.getPlayer(playerId);
  player.hand.push({ id: cardId, usedAt: null });
  return player;
}

function main() {
  console.log('\nBunker: settings, content and the new systems\n');

  // --- settings ------------------------------------------------------

  test('settings: anything at all sanitises into a complete, playable configuration', () => {
    const empty = sanitizeSettings({});
    ['scenario', 'maxPlayers', 'seats', 'turnSec', 'discussSec', 'voteSec',
      'players', 'characters', 'baggage', 'actionCards', 'rounds', 'voting', 'events']
      .forEach((k) => assert(empty[k] !== undefined, `a blank patch still has ${k}`));

    const junk = sanitizeSettings({
      maxPlayers: 9999,
      seats: -4,
      turnSec: 'nonsense',
      players: { botCount: 500, bots: 'yes' },
      characters: { secrets: 99, randomness: 'wild', categories: ['nope', 'profession'] },
      baggage: { count: 12, rarities: ['imaginary'] },
      actionCards: { perPlayer: -3, deck: ['not_a_card'], drawChance: 40 },
      rounds: { total: 900, firstVoteRound: 0 },
      voting: { mode: 'telepathy', votesPerPlayer: 80 },
      events: { chance: 9 },
      somethingInvented: true,
    });
    assert(junk.maxPlayers === settings.MAX_PLAYERS, 'an absurd capacity is clamped to the engine maximum');
    assert(junk.seats === 0, 'a negative seat count falls back to automatic');
    assert(junk.turnSec === DEFAULT_SETTINGS.turnSec, 'an unparseable number keeps the default');
    assert(junk.players.botCount <= settings.MAX_BOTS, 'the bot count is clamped');
    assert(junk.characters.randomness === 'balanced', 'an unknown randomness mode falls back');
    assert(junk.characters.secrets <= content.SECRET_KEYS.length, 'the secret count cannot exceed the slots that exist');
    assert(junk.baggage.rarities.length > 0, 'an all-invalid rarity list falls back rather than dealing nothing');
    assert(junk.actionCards.deck.every((id) => actionCards.ALL_IDS.includes(id)), 'unknown action cards are dropped');
    assert(junk.actionCards.drawChance <= 1, 'the draw chance is a probability');
    assert(junk.rounds.firstVoteRound >= 1, 'voting cannot start before round one');
    assert(junk.voting.mode === 'single', 'an unknown voting mode falls back');
    assert(junk.events.chance <= 1, 'the event chance is a probability');
    assert(junk.somethingInvented === undefined, 'a key the engine does not know is dropped');
  });

  test('settings: the old flat shape still works, and still means the same thing', () => {
    const old = { maxPlayers: 8, seats: 3, turnSec: 45, discussSec: 90, voteSec: 30 };
    assert(settings.isLegacyShape(old), 'the old shape is recognised');
    const s = sanitizeSettings(old);
    assert(s.maxPlayers === 8 && s.seats === 3 && s.turnSec === 45 && s.discussSec === 90 && s.voteSec === 30,
      'every old value survives untouched at the top level');
    // And a game built from it plays.
    const game = started(6, old);
    assert(game.seats === 3 && game.settings.turnSec === 45, 'an old-shape room deals and keeps its rules');
  });

  test('settings: a host editing one switch keeps everything else', () => {
    const game = lobby(5, { turnSec: 45 });
    game.updateSettings('p1', { voting: { secret: true } });
    assert(game.settings.turnSec === 45, 'the untouched setting is kept');
    assert(game.settings.voting.secret === true, 'the edited setting is applied');
    assert(game.settings.voting.tieRule === 'revote', 'a sibling setting is kept');
    expectError(() => game.updateSettings('p2', { turnSec: 20 }), /host/, 'only the host edits the rules');
  });

  test('scenarios: each one is a patch over the defaults, and picks its own catastrophes', () => {
    assert(scenarios.ids().length >= 10, 'there are at least ten scenarios');
    scenarios.ids().forEach((id) => {
      const s = sanitizeSettings({ scenario: id });
      assert(s.scenario === id, `${id} is kept`);
      assert(s.maxPlayers >= settings.MIN_PLAYERS, `${id} still has a workable capacity`);
      const def = scenarios.scenario(id);
      if (def.catastrophes) {
        def.catastrophes.forEach((c) => assert(legacyCards.CATASTROPHES.some((x) => x.id === c), `${id} names a real catastrophe: ${c}`));
      }
      // And a game of it actually deals.
      const game = started(6, { scenario: id });
      assert(game.phase === PHASES.REVEAL, `${id} deals and opens on the reveal phase`);
      if (def.catastrophes) {
        assert(def.catastrophes.includes(game.catastrophe.id), `${id} drew a catastrophe that fits it`);
      }
    });
  });

  test('scenarios: a host picking one gets its rules, and can then override them', () => {
    const game = lobby(5);
    game.updateSettings('p1', { scenario: 'zombies' });
    assert(game.settings.actionCards.perPlayer === 3, 'the scenario set the hand size');
    assert(game.settings.baggage.allowSteal === true, 'the scenario turned stealing on');
    game.updateSettings('p1', { actionCards: { perPlayer: 1 } });
    assert(game.settings.actionCards.perPlayer === 1, 'the host overrides the scenario');
    assert(game.settings.scenario === 'zombies', 'and the scenario is still the one chosen');
  });

  // --- characters ----------------------------------------------------

  test('characters: every category in play is dealt a known card, and nothing else is', () => {
    const game = started(8, { characters: { secrets: 2 }, baggage: { count: 4 } });
    const keys = game.categoriesInPlay();
    assert(keys.includes('skill') && keys.includes('secret') && keys.includes('secret2'), 'the new categories are in play');
    assert(keys.filter((k) => content.BAGGAGE_KEYS.includes(k)).length === 4, 'four baggage slots');
    game.players.forEach((p) => {
      keys.forEach((k) => assert(content.isKnownCard(k, p.cards[k]), `${p.id} holds a known ${k}`));
      // Nothing outside the table's own sheet.
      Object.keys(p.cards).forEach((k) => assert(keys.includes(k), `${p.id} holds nothing outside the sheet (${k})`));
      // And never the same item twice.
      const bags = game.baggageKeysInPlay().map((k) => p.cards[k].id);
      assert(new Set(bags).size === bags.length, `${p.id} holds four different items`);
      const secretsHeld = game.secretKeysInPlay().map((k) => p.cards[k].id);
      assert(new Set(secretsHeld).size === secretsHeld.length, `${p.id} holds two different secrets`);
    });
  });

  test('characters: a table can switch categories off, but never profession or biology', () => {
    const game = started(5, { characters: { categories: ['hobby'], secrets: 0 }, baggage: { count: 1 } });
    const keys = game.categoriesInPlay();
    assert(keys.includes('profession') && keys.includes('biology'), 'the opening cards are never switched off');
    assert(keys.includes('hobby'), 'the category the host asked for is in');
    assert(!keys.includes('secret'), 'no secrets when the table asked for none');
    assert(keys.filter((k) => content.BAGGAGE_KEYS.includes(k)).length === 1, 'one baggage slot');
    assert(!keys.includes('trait'), 'a category the host left out is out');
  });

  test('characters: balanced dealing avoids duplicates, chaotic dealing is free to repeat', () => {
    const balanced = started(10, { characters: { randomness: 'balanced' } });
    const professions = balanced.players.map((p) => p.cards.profession.id);
    assert(new Set(professions).size === professions.length, 'no two balanced players share a profession');

    // Chaotic dealing is allowed to repeat; over many tables it will.
    let sawRepeat = false;
    for (let i = 0; i < 40 && !sawRepeat; i += 1) {
      const chaotic = started(12, { characters: { randomness: 'chaotic' } });
      const ids = chaotic.players.map((p) => p.cards.trait.id);
      if (new Set(ids).size < ids.length) sawRepeat = true;
    }
    assert(sawRepeat, 'chaotic dealing produces duplicates across enough tables');
  });

  test('characters: rarity is respected, and a table can flatten or favour it', () => {
    const rarityOf = (id) => content.DECKS.baggage.find((x) => x.id === id)?.r || 'common';
    const sample = (cfg) => {
      const counts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
      for (let i = 0; i < 25; i += 1) {
        started(12, cfg).players.forEach((p) => { counts[rarityOf(p.cards.baggage.id)] += 1; });
      }
      return counts;
    };
    const normal = sample({ characters: { rarityBias: 'normal' } });
    assert(normal.common > normal.legendary * 3, `common items far outnumber legendary ones (${JSON.stringify(normal)})`);
    const biased = sample({ characters: { rarityBias: 'rare' } });
    const normalShare = (normal.rare + normal.legendary) / Object.values(normal).reduce((a, b) => a + b, 0);
    const biasedShare = (biased.rare + biased.legendary) / Object.values(biased).reduce((a, b) => a + b, 0);
    assert(biasedShare > normalShare, `favouring rarity deals more rare items (${normalShare.toFixed(3)} -> ${biasedShare.toFixed(3)})`);

    // A table that only allows common items gets only common items.
    const commonOnly = started(10, { baggage: { rarities: ['common'] } });
    commonOnly.players.forEach((p) => assert(rarityOf(p.cards.baggage.id) === 'common', 'only common items are dealt'));
  });

  test('characters: a random baggage count is rolled once, and every player gets the same number', () => {
    const seen = new Set();
    for (let i = 0; i < 30; i += 1) {
      const game = started(6, { baggage: { count: 'random' } });
      const n = game.baggageKeysInPlay().length;
      seen.add(n);
      assert(n >= 1 && n <= 4, 'between one and four bags');
      game.players.forEach((p) => {
        assert(game.baggageKeysInPlay().every((k) => p.cards[k]), 'every player holds every slot');
      });
    }
    assert(seen.size > 1, `the roll actually varies between games (saw ${[...seen].join(',')})`);
  });

  test('characters: cards dealt blind are hidden from their own owner until revealed', () => {
    const game = started(6, { characters: { hiddenFromOwner: 2 } });
    const me = game.getPlayer('p1');
    assert(me.blind.length === 2, 'two cards are dealt face down to their owner');
    assert(!me.blind.includes('profession'), 'never the profession - the first round would have nothing to open');
    const view = game.toClientJSON('p1');
    const self = view.players.find((p) => p.isYou);
    me.blind.forEach((k) => assert(self.cards[k] === null, `${k} is hidden from its own owner`));
    assert(view.you.blind.length === 2, 'the owner is told WHICH of their cards they cannot see');
    // Revealing it shows it to everyone, owner included.
    game.forceReveal(me, me.blind[0]);
    const after = game.toClientJSON('p1').players.find((p) => p.isYou);
    assert(Object.values(after.cards).filter(Boolean).length > 0, 'a revealed blind card becomes visible');
  });

  // --- baggage --------------------------------------------------------

  test('baggage: every item has a name, a picture, a rarity and a described hidden property', () => {
    content.DECKS.baggage.forEach((item) => {
      assert(item.en && item.ru, `${item.id} is named in both languages`);
      assert(item.g, `${item.id} has a picture`);
      assert(content.RARITIES.includes(item.r), `${item.id} has a real rarity`);
      if (item.hidden) assert(content.hiddenProperty(item.hidden), `${item.id}'s hidden property is described`);
    });
    assert(content.DECKS.baggage.length >= 40, 'the shelf is big enough for four slots at a full table');
    assert(content.RARITIES.every((r) => content.DECKS.baggage.some((i) => i.r === r)), 'every rarity exists on the shelf');
  });

  test('baggage: a hidden property stays sealed until something opens it, and then it scores', () => {
    const game = started(6, { baggage: { count: 4 } });
    // Find a player holding an item that has a hidden property.
    let holder = null;
    let key = null;
    game.players.forEach((p) => game.baggageKeysInPlay().forEach((k) => {
      if (!holder && p.cards[k].property) { holder = p; key = k; }
    }));
    assert(holder, 'somebody at a four-bag table holds an item with a sealed property');

    game.forceReveal(holder, key);
    const seen = game.toClientJSON('p1').players.find((p) => p.id === holder.id);
    assert(seen.cards[key] && !seen.cards[key].property, 'the item is on the table but its property is not in the payload');

    const before = content.cardScore(key, holder.cards[key]);
    const opened = game.revealHiddenProperty(holder, key);
    assert(opened, 'the property opens');
    const after = content.cardScore(key, holder.cards[key]);
    assert(after !== before, `opening the property changes what the item is worth (${before} -> ${after})`);
    const now = game.toClientJSON('p1').players.find((p) => p.id === holder.id);
    assert(now.cards[key].property === opened, 'and now everyone can see it');
    assert(game.revealHiddenProperty(holder, key) === null, 'a property already open does not open again');
  });

  test('baggage: turning special properties off deals items with nothing sealed inside', () => {
    const game = started(8, { baggage: { count: 4, specialProperties: false } });
    game.players.forEach((p) => game.baggageKeysInPlay().forEach((k) => {
      assert(!p.cards[k].property, 'no item carries a sealed property');
    }));
  });

  // --- action cards ---------------------------------------------------

  test('action cards: every card declares a stage, a target and a duration, and can be dealt', () => {
    actionCards.CARDS.forEach((def) => {
      assert(actionCards.STAGES.includes(def.stage), `${def.id} names a real stage`);
      assert(Object.values(actionCards.TARGETS).includes(def.target), `${def.id} names a real target`);
      assert(Object.values(actionCards.DURATIONS).includes(def.duration), `${def.id} names a real duration`);
      assert(typeof def.apply === 'function', `${def.id} actually does something`);
      assert(def.weight > 0, `${def.id} can be drawn`);
    });
    assert(actionCards.ALL_IDS.length >= 16, 'there are at least sixteen action cards');
  });

  test('action cards: hands are dealt, sized and limited by the settings', () => {
    const three = started(6, { actionCards: { enabled: true, perPlayer: 3, drawChance: 1 } });
    three.players.forEach((p) => assert(p.hand.length === 3, 'three cards each'));
    three.players.forEach((p) => p.hand.forEach((h) => assert(actionCards.cardDef(h.id), 'every dealt card is real')));

    const off = started(6, { actionCards: { enabled: false } });
    off.players.forEach((p) => assert(p.hand.length === 0, 'no cards at all when the system is off'));
    expectError(() => off.playCard('p1', { cardId: 'immunity' }), /without action cards/, 'playing a card is refused outright');

    // A restricted deck only ever deals from itself.
    const narrow = started(6, { actionCards: { deck: ['immunity', 'double_vote'], perPlayer: 3 } });
    narrow.players.forEach((p) => p.hand.forEach((h) => assert(['immunity', 'double_vote'].includes(h.id), 'only the chosen cards are dealt')));

    // A draw chance below one leaves some slots empty.
    let anyShort = false;
    for (let i = 0; i < 20 && !anyShort; i += 1) {
      const chancy = started(8, { actionCards: { perPlayer: 3, drawChance: 0.3 } });
      if (chancy.players.some((p) => p.hand.length < 3)) anyShort = true;
    }
    assert(anyShort, 'a draw chance below one actually leaves hands short');
  });

  test('action cards: a card may only be played in its own phase, once, and only by its holder', () => {
    const game = started(6, { actionCards: { perPlayer: 0 } });
    giveCard(game, 'p2', 'demand_reveal'); // DISCUSSION only
    assert(game.phase === PHASES.REVEAL, 'the game is in the reveal phase');
    expectError(() => game.playCard('p2', { cardId: 'demand_reveal', targetId: 'p3', key: 'health' }),
      /cannot be played in this phase/, 'a discussion card is refused during reveals');
    expectError(() => game.playCard('p3', { cardId: 'demand_reveal', targetId: 'p2', key: 'health' }),
      /do not have that card/, 'a player cannot play a card they do not hold');

    game.phase = PHASES.DISCUSSION;
    game.playCard('p2', { cardId: 'demand_reveal', targetId: 'p3', key: 'health' });
    assert(game.getPlayer('p3').revealed.includes('health'), 'the demanded card came out');
    expectError(() => game.playCard('p2', { cardId: 'demand_reveal', targetId: 'p4', key: 'health' }),
      /do not have that card/, 'a spent card cannot be played again');
  });

  test('action cards: the per-round and per-game limits are enforced', () => {
    const game = started(6, { actionCards: { perPlayer: 0, maxUsesPerRound: 1 } });
    giveCard(game, 'p2', 'immunity');
    giveCard(game, 'p2', 'double_vote');
    game.playCard('p2', { cardId: 'immunity' });
    expectError(() => game.playCard('p2', { cardId: 'double_vote' }), /already played a card this round/, 'one card a round');
    // A new round resets the round allowance.
    game.beginRound();
    game.playCard('p2', { cardId: 'double_vote' });
    assert(game.usesOf('p2').game === 2, 'the game total keeps counting');

    const capped = started(6, { actionCards: { perPlayer: 0, maxUsesPerRound: 0, maxUsesPerGame: 1 } });
    giveCard(capped, 'p2', 'immunity');
    giveCard(capped, 'p2', 'double_vote');
    capped.playCard('p2', { cardId: 'immunity' });
    expectError(() => capped.playCard('p2', { cardId: 'double_vote' }), /all the cards you may/, 'the game limit bites');
  });

  test('action cards: information cards tell only their owner', () => {
    const game = started(6, { actionCards: { perPlayer: 0 } });
    giveCard(game, 'p2', 'peek_characteristic');
    game.playCard('p2', { cardId: 'peek_characteristic', targetId: 'p3', key: 'secret' });

    const mine = game.toClientJSON('p2');
    const peek = mine.you.results.find((r) => r.type === 'PEEKED');
    assert(peek && peek.params.card.id === game.getPlayer('p3').cards.secret.id, 'the player who looked was told what they saw');

    const theirs = game.toClientJSON('p4');
    assert(!(theirs.you.results || []).some((r) => r.type === 'PEEKED'), 'nobody else was told');
    assert(theirs.players.find((p) => p.id === 'p3').cards.secret === null, 'and the card is still face down for everyone else');
    const entry = game.cardHistory[game.cardHistory.length - 1];
    assert(entry.secret === true, 'the history records that a look happened');
    assert(!JSON.stringify(entry).includes(game.getPlayer('p3').cards.secret.id), 'but never what was seen');
  });

  test('action cards: hiding, swapping and blocking change the table', () => {
    const game = started(6, { actionCards: { perPlayer: 0, maxUsesPerRound: 0 } });
    revealRound(game); // everyone shows a profession

    // Hide a card that is already on the table.
    giveCard(game, 'p2', 'hide_characteristic');
    assert(game.getPlayer('p2').revealed.includes('profession'), 'the profession is out');
    game.playCard('p2', { cardId: 'hide_characteristic', key: 'profession' });
    assert(!game.getPlayer('p2').revealed.includes('profession'), 'and now it is not');
    assert(game.toClientJSON('p3').players.find((p) => p.id === 'p2').cards.profession === null,
      'a hidden card leaves everyone else\'s payload');

    // Swap one of your own for a fresh draw.
    giveCard(game, 'p2', 'swap_characteristic');
    const before = game.getPlayer('p2').cards.hobby.id;
    game.playCard('p2', { cardId: 'swap_characteristic', key: 'hobby' });
    assert(game.getPlayer('p2').cards.hobby.id !== before, 'the swapped card is a different one');
    assert(content.isKnownCard('hobby', game.getPlayer('p2').cards.hobby), 'and a real one');

    // Block someone from revealing for the rest of the round.
    const blocked = started(6, { actionCards: { perPlayer: 0 } });
    const victim = blocked.getPlayer(blocked.currentTurnId());
    giveCard(blocked, victim.id === 'p2' ? 'p3' : 'p2', 'block_reveal');
    blocked.playCard(victim.id === 'p2' ? 'p3' : 'p2', { cardId: 'block_reveal', targetId: victim.id });
    // The silence takes their turn away, so the refusal they get is
    // "not your turn" - the payload is what tells them why it is not.
    expectError(() => blocked.reveal(victim.id, 'profession'), /not your turn|blocked you from revealing/, 'a blocked player cannot reveal');
    assert(blocked.toClientJSON(victim.id).you.blockedFromRevealing, 'and is told why');
    assert(blocked.toClientJSON(victim.id).you.canReveal === false, 'and is offered no reveal');
    // The block lifts with the round.
    blocked.beginRound();
    assert(!blocked.hasEffect('blockReveal', victim.id), 'a round-long effect ends with the round');
  });

  test('action cards: a silenced player really loses their turn, clock and all', () => {
    const game = started(6, { actionCards: { perPlayer: 0 } });
    const victim = game.getPlayer(game.currentTurnId());
    const caster = game.players.find((p) => p.id !== victim.id);
    giveCard(game, caster.id, 'block_reveal');
    game.playCard(caster.id, { cardId: 'block_reveal', targetId: victim.id });

    // Not their turn any more: the block moved the table on rather than
    // leaving them to be revealed for when their clock ran out.
    assert(game.currentTurnId() !== victim.id, 'a silenced player is skipped, not left to time out');
    assert(victim.revealed.length === 0, 'and has revealed nothing');

    // The clock can run out on every remaining turn of THIS round and
    // still open nothing of theirs.
    const round = game.round;
    for (let i = 0; i < 20 && game.phase === PHASES.REVEAL && game.round === round; i += 1) game.onTimeout();
    assert(victim.revealed.length === 0, 'the clock never reveals for a silenced player');

    // A fresh round gives them their voice back.
    let guard = 0;
    while ((game.phase !== PHASES.REVEAL || game.round === round) && guard < 40) { game.onTimeout(); guard += 1; }
    assert(!game.hasEffect('blockReveal', victim.id), 'the silence lifts with the round');
    assert(game.turnOrder.includes(victim.id), 'and they are back in the order');
  });

  test('bots: a bot that chooses a card is not logged as having run out of time', () => {
    const game = new BunkerGame('BOTLOG', 'p1', { players: { bots: true, botCount: 4 } });
    game.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Human', accountId: 'acc1' });
    game.syncBots();
    game.start('p1');
    // The round opens on the human, so the bots only move once they are
    // actually the ones being waited for.
    game.reveal('p1', 'profession');
    const botReveals = game.log.filter((e) => ['REVEALED', 'AUTO_REVEALED'].includes(e.type)
      && game.players.find((p) => p.nickname === e.params.name)?.isBot);
    assert(botReveals.length > 0, 'the bots revealed');
    assert(botReveals.every((e) => e.type === 'REVEALED'), 'a bot that picked its card is logged as having picked it');
  });

  test('action cards: protection, double votes and vote-changing decide a vote', () => {
    // Protection: the player everyone voted for cannot be excluded.
    const prot = started(4, { actionCards: { perPlayer: 0 }, rounds: { firstVoteRound: 1 } });
    prot.phase = PHASES.DISCUSSION;
    giveCard(prot, 'p1', 'protect_player');
    prot.playCard('p1', { cardId: 'protect_player', targetId: 'p2' });
    assert(prot.toClientJSON('p3').players.find((p) => p.id === 'p2').effects.includes('protected'),
      'everyone can see who is protected - that is what makes the card matter');
    prot.startVote();
    prot.vote('p1', 'p2');
    prot.vote('p3', 'p2');
    prot.vote('p4', 'p2');
    prot.vote('p2', 'p1');
    assert(prot.getPlayer('p2').status === 'alive', 'the protected player stays inside');
    assert(prot.lastVote.outcome === 'protected', 'and the result says why');
    assert(!prot.hasEffect('protected', 'p2'), 'the protection is spent');

    // A double vote counts twice.
    const dbl = started(4, { actionCards: { perPlayer: 0 } });
    dbl.phase = PHASES.DISCUSSION;
    giveCard(dbl, 'p1', 'double_vote');
    dbl.playCard('p1', { cardId: 'double_vote' });
    dbl.startVote();
    dbl.vote('p1', 'p2');
    dbl.vote('p2', 'p1');
    dbl.vote('p3', 'p1');
    dbl.vote('p4', 'p3');
    assert(dbl.lastVote.tally.find((r) => r.playerId === 'p2').votes === 2, 'one ballot counted for two');

    // Changing your vote after casting it.
    const chg = started(4, { actionCards: { perPlayer: 0 } });
    chg.phase = PHASES.DISCUSSION;
    giveCard(chg, 'p1', 'change_vote');
    chg.startVote();
    chg.vote('p1', 'p2');
    chg.playCard('p1', { cardId: 'change_vote', targetId: 'p3' });
    assert(chg.votes.p1 === 'p3', 'the ballot moved');
  });

  test('action cards: a card that cannot do anything is refused rather than wasted', () => {
    const game = started(6, { actionCards: { perPlayer: 0 } });
    game.phase = PHASES.DISCUSSION;
    // Nothing of p3's is on the table yet, so there is nothing to copy.
    giveCard(game, 'p2', 'impersonate');
    expectError(() => game.playCard('p2', { cardId: 'impersonate', targetId: 'p3', key: 'profession' }),
      /no effect/, 'a card with nothing to act on is refused');
    assert(game.getPlayer('p2').hand.every((h) => !h.usedAt), 'and the card is still in hand');

    // A card pointed at the wrong kind of thing is refused too.
    giveCard(game, 'p2', 'inspect_item');
    expectError(() => game.playCard('p2', { cardId: 'inspect_item', targetId: 'p3', key: 'health' }),
      /only works on baggage/, 'a baggage card is refused on a non-baggage card');
    expectError(() => game.playCard('p2', { cardId: 'inspect_item', targetId: 'p2', key: 'baggage' }),
      /pointed at someone else/, 'a card that needs another player is refused on yourself');
  });

  test('action cards: swapping baggage needs the table to allow it', () => {
    const closed = started(6, { actionCards: { perPlayer: 0 }, baggage: { allowTrade: false } });
    closed.phase = PHASES.DISCUSSION;
    giveCard(closed, 'p2', 'swap_baggage');
    expectError(() => closed.playCard('p2', { cardId: 'swap_baggage', targetId: 'p3' }),
      /change hands/, 'trading is refused when the table forbids it');

    const open = started(6, { actionCards: { perPlayer: 0 }, baggage: { allowTrade: true } });
    open.phase = PHASES.DISCUSSION;
    giveCard(open, 'p2', 'swap_baggage');
    const mine = open.getPlayer('p2').cards.baggage.id;
    const theirs = open.getPlayer('p3').cards.baggage.id;
    open.playCard('p2', { cardId: 'swap_baggage', targetId: 'p3' });
    assert(open.getPlayer('p2').cards.baggage.id === theirs && open.getPlayer('p3').cards.baggage.id === mine,
      'the bags changed hands');
  });

  test('action cards: the client is told what it may play and why not', () => {
    const game = started(6, { actionCards: { perPlayer: 0, maxUsesPerRound: 1 } });
    giveCard(game, 'p2', 'demand_reveal'); // discussion only
    giveCard(game, 'p2', 'peek_baggage'); // any phase
    const view = game.toClientJSON('p2');
    const byId = Object.fromEntries(view.you.playable.map((c) => [c.id, c]));
    assert(byId.demand_reveal.playable === false && byId.demand_reveal.reason === 'wrongPhase', 'the wrong phase is named');
    assert(byId.peek_baggage.playable === true, 'a card playable in any phase is offered');
    // Nobody else learns what is in that hand.
    const other = game.toClientJSON('p3');
    assert(other.players.find((p) => p.id === 'p2').cardsInHand === 2, 'others see HOW MANY cards a player holds');
    assert(!JSON.stringify(other.players).includes('demand_reveal'), 'but never which ones');
  });

  // --- events ---------------------------------------------------------

  test('events: every event either changes the shelter or declines to fire', () => {
    events.ALL_IDS.forEach((id) => {
      const game = started(8, { events: { enabled: true, deck: [id], chance: 1 }, actionCards: { perPlayer: 1 } });
      game.round = 3;
      const fired = game.fireRandomEvent('test');
      // Some events cannot apply at every moment; what matters is that
      // they never corrupt the game when they do.
      if (fired) {
        assert(fired.id === id, `${id} fired`);
        assert(game.eventLog.some((e) => e.id === id), `${id} is in the event log`);
      }
      assert(game.seats >= 1, `${id} never leaves the bunker with no places`);
      assert(game.seats < game.players.length, `${id} never leaves more places than people`);
      assert(game.bunker.foodMonths >= 1, `${id} never leaves the bunker with no food`);
      assert(game.bunker.area >= 20, `${id} never leaves the bunker with no space`);
    });
  });

  test('events: an event can make a characteristic stop counting for the verdict', () => {
    const game = started(6, { events: { enabled: true, deck: ['skill_useless'], chance: 1 } });
    game.round = 3;
    game.fireRandomEvent('test');
    assert(game.mutedCategories.length === 1, 'one category is now worthless');
    const muted = game.mutedCategories[0];
    game.players.slice(2).forEach((p) => game.excludePlayer(p, 'vote'));
    game.endGame();
    assert(game.results.mutedCategories.includes(muted), 'the end screen says which category stopped counting');
  });

  test('events: they are off by default and only fire from round two', () => {
    const off = started(6);
    assert(off.settings.events.enabled === false, 'events are off unless a table turns them on');
    assert(off.eventLog.length === 0, 'and nothing fires');

    const on = started(6, { events: { enabled: true, chance: 1 } });
    assert(on.round === 1 && on.eventLog.length === 0, 'nothing fires in the opening round');
    on.beginRound();
    assert(on.eventLog.length === 1, 'and one fires from round two');
  });

  // --- voting ---------------------------------------------------------

  test('voting: the multi-vote variant gives each player several ballots', () => {
    const game = started(6, { voting: { mode: 'multi', votesPerPlayer: 2 } });
    game.phase = PHASES.DISCUSSION;
    game.startVote();
    assert(game.toClientJSON('p1').you.votesLeft === 2, 'the player is told how many votes they have left');
    game.vote('p1', 'p2');
    assert(game.toClientJSON('p1').you.votesLeft === 1, 'one used');
    game.vote('p1', 'p3');
    assert(game.hasVoted('p1'), 'a full ballot counts as having voted');
    const view = game.toClientJSON('p1');
    assert(view.you.myVotes.length === 2, 'the player sees both of their votes');
    expectError(() => game.vote('p1', 'p4'), /used all of your votes/, 'a third vote is refused');
  });

  test('voting: a secret vote hides who voted for whom until it is counted', () => {
    const game = started(5, { voting: { secret: true } });
    game.phase = PHASES.DISCUSSION;
    game.startVote();
    game.vote('p1', 'p2');
    const view = game.toClientJSON('p3');
    assert(view.vote.secret === true, 'the table knows the vote is secret');
    assert(view.vote.live === null, 'and no running count is sent');
    assert(view.players.find((p) => p.id === 'p1').hasVoted === true, 'that somebody HAS voted is not a secret');
    assert(game.toClientJSON('p1').you.myVote === 'p2', 'a player always sees their own ballot');

    const open = started(5, { voting: { secret: false } });
    open.phase = PHASES.DISCUSSION;
    open.startVote();
    open.vote('p1', 'p2');
    assert(open.toClientJSON('p3').vote.live.find((r) => r.playerId === 'p2').votes === 1, 'an open vote shows the count as it goes');
  });

  test('voting: changing a vote is refused unless the table allows it', () => {
    const fixed = started(5, { voting: { allowChange: false } });
    fixed.phase = PHASES.DISCUSSION;
    fixed.startVote();
    fixed.vote('p1', 'p2');
    expectError(() => fixed.vote('p1', 'p3'), /already voted/, 'a second ballot is refused');

    const loose = started(5, { voting: { allowChange: true } });
    loose.phase = PHASES.DISCUSSION;
    loose.startVote();
    loose.vote('p1', 'p2');
    loose.vote('p1', 'p3');
    assert(loose.votes.p1 === 'p3', 'the ballot moved');
  });

  test('voting: every tie rule settles a tie its own way', () => {
    const tied = (tieRule, allowTie = true) => {
      const game = started(4, { voting: { tieRule, allowTie } });
      game.phase = PHASES.DISCUSSION;
      game.startVote();
      game.vote('p1', 'p2');
      game.vote('p3', 'p2');
      game.vote('p2', 'p1');
      game.vote('p4', 'p1');
      return game;
    };

    const revote = tied('revote');
    assert(revote.phase === PHASES.VOTE && revote.revote, 'revote opens a runoff');

    const random = tied('random');
    assert(random.lastVote.outcome === 'lot' && random.alivePlayers().length === 3, 'random draws lots at once');

    const none = tied('none');
    assert(none.alivePlayers().length === 4, 'none leaves everyone inside');

    const all = tied('all');
    // A four-player table has two places, so two can go at once.
    assert(all.lastVote.outcome === 'tieAll' && all.alivePlayers().length === 2, 'all excludes everyone tied');

    const noTies = tied('revote', false);
    assert(noTies.lastVote.outcome === 'lot', 'a table that forbids ties settles one immediately');
  });

  // --- rounds and the final decision -----------------------------------

  test('rounds: a table can ask for more than one reveal a round', () => {
    // firstVoteRound 1 so the round closes into a discussion instead of
    // rolling straight into another round of reveals.
    const game = started(6, { rounds: { revealPerRound: 2, firstVoteRound: 1 } });
    const first = game.getPlayer(game.turnOrder[0]);
    assert(game.turnOrder.length === 12, 'the order goes round the table twice');
    revealRound(game);
    assert(game.phase === PHASES.DISCUSSION, 'the round ended');
    assert(first.revealed.length === 2, `each player showed two cards (saw ${first.revealed.length})`);
    game.players.forEach((p) => assert(p.revealed.length === 2, `${p.id} showed two cards`));

    const one = started(6, { rounds: { revealPerRound: 1, firstVoteRound: 1 } });
    revealRound(one);
    one.players.forEach((p) => assert(p.revealed.length === 1, 'one reveal a round by default'));
  });

  test('rounds: a round limit ends the game with one final decision', () => {
    const game = started(8, { rounds: { total: 2, firstVoteRound: 2 }, seats: 3 });
    let guard = 0;
    while (game.phase !== PHASES.GAME_OVER && guard < 500) {
      if (game.phase === PHASES.REVEAL) revealRound(game);
      else if (game.phase === PHASES.DISCUSSION) game.startVote();
      else if (game.phase === PHASES.VOTE) {
        // Everyone points at the player above them, so there is a clear order.
        const alive = game.alivePlayers();
        alive.forEach((p, i) => {
          const target = alive[(i + 1) % alive.length];
          if (target.id !== p.id && game.voteCandidates.includes(target.id)) {
            try { game.vote(p.id, target.id); } catch { /* already settled */ }
          }
        });
        if (game.phase === PHASES.VOTE) game.resolveVote();
      } else if (game.phase === PHASES.RESULT) game.continueAfterResult();
      guard += 1;
    }
    assert(game.phase === PHASES.GAME_OVER, 'the game ended');
    assert(game.alivePlayers().length === 3, 'the final decision filled exactly the places available');
    assert(game.log.some((e) => e.type === 'FINAL_VOTE'), 'the final vote is recorded');
    assert(game.results.survivorIds.length === 3, 'three survivors');
  });

  // --- bots -------------------------------------------------------------

  test('bots: a table can fill itself, and the bots play their own turns', () => {
    const game = new BunkerGame('BOTS1', 'p1', {
      players: { bots: true, botCount: 4 },
      rounds: { firstVoteRound: 2 },
    });
    game.addPlayer({ playerId: 'p1', socketId: 's1', nickname: 'Human', accountId: 'acc1' });
    game.syncBots();
    assert(game.players.filter((p) => p.isBot).length === 4, 'four bots joined');
    assert(game.players.length === 5, 'a lone human plus four bots is a table');
    assert(game.getPlayer('p1').isHost, 'a bot never takes the host seat');

    game.start('p1');
    // The bots have already taken every turn before the human's.
    assert(game.phase === PHASES.REVEAL, 'the game is dealing');
    const waitingFor = game.getPlayer(game.currentTurnId());
    assert(!waitingFor || !waitingFor.isBot, 'the table is never left waiting on a bot');

    // Play the human's turns; the bots keep up on their own.
    let guard = 0;
    while (game.phase !== PHASES.GAME_OVER && guard < 400) {
      if (game.phase === PHASES.REVEAL) {
        const current = game.getPlayer(game.currentTurnId());
        if (!current) break;
        const hidden = game.hiddenKeys(current);
        if (!hidden.length) break;
        game.reveal(current.id, game.requiredKeyFor(current) || hidden[0]);
      } else if (game.phase === PHASES.DISCUSSION) {
        game.startVote();
      } else if (game.phase === PHASES.VOTE) {
        const human = game.getPlayer('p1');
        if (human.status === 'alive' && !game.hasVoted('p1')) {
          const target = game.voteCandidates.find((id) => id !== 'p1');
          if (target) game.vote('p1', target);
        }
        if (game.phase === PHASES.VOTE) game.resolveVote();
      } else if (game.phase === PHASES.RESULT) {
        game.continueAfterResult();
      }
      guard += 1;
    }
    assert(game.phase === PHASES.GAME_OVER, `a table of bots plays to the end (guard ${guard})`);
    assert(game.alivePlayers().length <= game.seats, 'and the places are filled');

    // Turning bots off empties their seats again.
    game.restart('p1');
    game.updateSettings('p1', { players: { bots: false } });
    assert(game.players.filter((p) => p.isBot).length === 0, 'the bots leave when the switch goes off');
  });

  // --- persistence -------------------------------------------------------

  test('persistence: a game with cards, effects and events survives a save and reload', () => {
    const game = started(6, {
      actionCards: { perPlayer: 2 }, baggage: { count: 3 }, characters: { secrets: 2 }, events: { enabled: true },
    });
    game.phase = PHASES.DISCUSSION;
    giveCard(game, 'p2', 'immunity');
    game.playCard('p2', { cardId: 'immunity' });
    game.fireRandomEvent('test');

    const back = BunkerGame.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
    assert(back.categoriesInPlay().join(',') === game.categoriesInPlay().join(','), 'the character sheet survives');
    assert(back.baggageCount === game.baggageCount, 'the baggage count survives');
    assert(back.hasEffect('protected', 'p2'), 'a live effect survives');
    assert(back.cardHistory.length === game.cardHistory.length, 'the card history survives');
    assert(back.eventLog.length === game.eventLog.length, 'the event log survives');
    assert(back.getPlayer('p2').hand.length === game.getPlayer('p2').hand.length, 'hands survive');
    // A reloaded room marks every seat offline until its socket comes
    // back, so that one field is expected to differ and nothing else is.
    const strip = (view) => JSON.stringify({ ...view, players: view.players.map(({ connected, ...rest }) => rest) });
    assert(strip(back.toClientJSON('p2')) === strip(game.toClientJSON('p2')), 'and every payload is otherwise identical');
    assert(back.toClientJSON('p2').players.every((p) => p.connected === false), 'a reloaded room starts with every seat offline');
  });

  test('persistence: a room saved before any of this existed still loads and plays', () => {
    // Exactly the shape the old engine wrote: five flat settings, seven
    // categories, no hands, no effects, no card history.
    const old = {
      gameType: 'bunker',
      roomCode: 'OLD1',
      hostId: 'p1',
      settings: { maxPlayers: 8, seats: 2, turnSec: 60, discussSec: 120, voteSec: 60 },
      phase: 'REVEAL',
      round: 1,
      seats: 2,
      catastrophe: { id: 'nuclear_war' },
      bunker: { area: 80, foodMonths: 12, rooms: ['well', 'greenhouse', 'workshop'] },
      turnOrder: ['p1', 'p2', 'p3', 'p4'],
      turnIndex: 0,
      revealedThisRound: {},
      votes: {},
      voteCandidates: [],
      revote: false,
      lastVote: null,
      results: null,
      log: [],
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: null,
      phaseEndsAt: Date.now() + 60000,
      players: [1, 2, 3, 4].map((i) => ({
        id: `p${i}`,
        socketId: null,
        nickname: `Old ${i}`,
        avatarUrl: null,
        accountId: i === 1 ? 'acc1' : null,
        connected: false,
        left: false,
        isHost: i === 1,
        ready: false,
        number: i,
        cards: {
          profession: { id: 'surgeon' },
          biology: { gender: 'male', age: 40 },
          health: { id: 'perfect' },
          hobby: { id: 'chess' },
          baggage: { id: 'medkit' },
          trait: { id: 'calm' },
          extra: { id: 'morse' },
        },
        revealed: [],
        status: 'alive',
        excludedRound: null,
        exclusionReason: null,
      })),
    };

    const game = BunkerGame.fromJSON(old);
    assert(game.categoriesInPlay().join(',') === legacyCards.CATEGORY_KEYS.join(','),
      'an old save keeps the seven-card sheet it was dealt on');
    assert(game.settings.maxPlayers === 8 && game.settings.seats === 2, 'its old settings are intact');
    assert(game.settings.actionCards !== undefined, 'and it gains the new sections with safe defaults');

    // And it still plays to the end.
    const view = game.toClientJSON('p1');
    assert(Object.keys(view.players[0].cards).length === 7, 'a payload for an old game has its seven cards');
    assert(view.you.hand.length === 0, 'with an empty hand');
    let guard = 0;
    while (game.phase !== PHASES.GAME_OVER && guard < 300) {
      game.onTimeout();
      if (game.phase === PHASES.VOTE) {
        const alive = game.alivePlayers();
        alive.forEach((p, i) => {
          const target = alive[(i + 1) % alive.length];
          if (target.id !== p.id) { try { game.vote(p.id, target.id); } catch { /* settled */ } }
        });
      }
      guard += 1;
    }
    assert(game.phase === PHASES.GAME_OVER, 'an old save plays through to the end');
    assert(game.results.survivorIds.length === 2, 'and fills its two places');
  });

  // --- the whole thing, many times ---------------------------------------

  test('500 random games across every scenario and setting always finish cleanly', () => {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    for (let n = 0; n < 500; n += 1) {
      const count = 4 + Math.floor(Math.random() * 13);
      const cfg = {
        scenario: pick(scenarios.ids()),
        maxPlayers: 16,
        seats: Math.random() < 0.5 ? 0 : 1 + Math.floor(Math.random() * 4),
        characters: {
          secrets: Math.floor(Math.random() * 3),
          randomness: pick(['balanced', 'chaotic']),
          rarityBias: pick(['normal', 'flat', 'rare']),
          hiddenFromOwner: Math.floor(Math.random() * 3),
        },
        baggage: { count: pick([1, 2, 3, 4, 'random']), specialProperties: Math.random() < 0.7 },
        actionCards: { enabled: Math.random() < 0.7, perPlayer: Math.floor(Math.random() * 4), maxUsesPerRound: Math.floor(Math.random() * 3) },
        rounds: { total: Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 4) : 0, revealPerRound: 1 + Math.floor(Math.random() * 2) },
        voting: {
          mode: pick(['single', 'multi']),
          votesPerPlayer: 2,
          secret: Math.random() < 0.3,
          allowChange: Math.random() < 0.5,
          allowTie: Math.random() < 0.8,
          tieRule: pick(['revote', 'random', 'none', 'all']),
        },
        events: { enabled: Math.random() < 0.6, chance: Math.random() },
      };
      const game = started(count, cfg);

      let guard = 0;
      while (game.phase !== PHASES.GAME_OVER && guard < 2000) {
        if (game.phase === PHASES.REVEAL) {
          const current = game.getPlayer(game.currentTurnId());
          if (!current) { game.advanceTurn(); guard += 1; continue; }
          const hidden = game.hiddenKeys(current);
          if (!hidden.length) { game.advanceTurn(); guard += 1; continue; }
          // Sometimes play a card first, to exercise them under real play.
          if (Math.random() < 0.15) {
            const playable = game.playableCards(current).filter((c) => c.playable);
            if (playable.length) {
              const choice = pick(playable);
              const other = game.alivePlayers().find((p) => p.id !== current.id);
              try {
                game.playCard(current.id, {
                  cardId: choice.id,
                  targetId: other?.id,
                  key: pick(game.categoriesInPlay()),
                });
              } catch (err) {
                assert(err instanceof BunkerError, `an illegal card play is a BunkerError, not ${err.stack}`);
              }
            }
          }
          if (game.phase !== PHASES.REVEAL) { guard += 1; continue; }
          const stillCurrent = game.getPlayer(game.currentTurnId());
          if (!stillCurrent) { guard += 1; continue; }
          const keys = game.hiddenKeys(stillCurrent);
          if (!keys.length) { game.advanceTurn(); guard += 1; continue; }
          try {
            game.reveal(stillCurrent.id, game.requiredKeyFor(stillCurrent) || pick(keys));
          } catch (err) {
            assert(err instanceof BunkerError, `a refused reveal is a BunkerError: ${err.stack}`);
            game.onTimeout();
          }
        } else if (game.phase === PHASES.DISCUSSION) {
          game.startVote();
        } else if (game.phase === PHASES.VOTE) {
          const alive = game.alivePlayers();
          alive.forEach((p) => {
            const options = game.voteCandidates.filter((id) => id !== p.id);
            if (!options.length) return;
            try { game.vote(p.id, pick(options)); } catch { /* the vote may already be settled */ }
          });
          if (game.phase === PHASES.VOTE) game.resolveVote();
        } else if (game.phase === PHASES.RESULT) {
          game.continueAfterResult();
        }
        guard += 1;

        // Invariants that must hold at every single step.
        assert(game.seats >= 1, 'the bunker always has at least one place');
        assert(game.alivePlayers().length >= 1, 'somebody is always inside');
        assert(game.players.every((p) => p.revealed.every((k) => game.categoriesInPlay().includes(k))),
          'nobody ever reveals a card that is not on the sheet');
      }

      assert(game.phase === PHASES.GAME_OVER, `game ${n} finished (guard ${guard}, ${count} players)`);
      assert(game.results.survivorIds.length >= 1, `game ${n} has survivors`);
      assert(game.results.survivorIds.length <= game.seats, `game ${n} never overfills the bunker`);
      // And every payload it can produce is sound.
      game.players.forEach((p) => {
        const view = game.toClientJSON(p.id);
        assert(view.phase === 'GAME_OVER' && view.results, 'every player is shown the result');
      });
    }
  });

  console.log(`\nBunker deep: ${passed} passed`);
}

// --- over the wire -------------------------------------------------------

async function wire() {
  const PORT = 4031;
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  presence.attach(io);
  registerBunkerHandlers(io);
  await new Promise((r) => server.listen(PORT, r));

  const ack = (socket, event, payload, ms = 6000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out on ${event}`)), ms);
    socket.emit(event, payload, (res) => { clearTimeout(t); resolve(res); });
  });

  const clients = [];
  const make = () => {
    const socket = ioClient(`http://localhost:${PORT}`, { transports: ['websocket'] });
    const c = { socket, state: null, errors: [] };
    socket.on('bunker:state', (s) => { c.state = s; });
    socket.on('bunker:error', (e) => { c.errors.push(e.message); });
    clients.push(c);
    return c;
  };
  for (let i = 0; i < 5; i += 1) make();
  await Promise.all(clients.map((c) => new Promise((r) => c.socket.on('connect', r))));
  const accounts = clients.map((_, i) => registerAccount(`BW${i}_${Math.random().toString(36).slice(2, 7)}`));

  const created = await ack(clients[0].socket, 'bunker:create', {
    token: accounts[0].token,
    settings: {
      scenario: 'zombies',
      actionCards: { enabled: true, perPlayer: 3, maxUsesPerRound: 0 },
      baggage: { count: 3, allowTrade: true },
      characters: { secrets: 2 },
      players: { allowSpectators: false },
    },
  });
  assert(created.ok, `create over the wire: ${created.error}`);
  const { roomCode } = created;
  for (let i = 1; i < clients.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await ack(clients[i].socket, 'bunker:join', { roomCode, token: accounts[i].token });
    assert(res.ok, `join ${i}: ${res.error}`);
  }
  await new Promise((r) => setTimeout(r, 200));

  // A table that closed its gallery refuses watchers.
  const watcher = make();
  await new Promise((r) => watcher.socket.on('connect', r));
  const watch = await ack(watcher.socket, 'bunker:spectate', { roomCode, nickname: 'Nosy', playerId: 'nosy-1' });
  assert(!watch.ok && /not open to spectators/.test(watch.error), `a closed gallery refuses watchers: ${watch.error}`);

  const start = await ack(clients[0].socket, 'bunker:start', {});
  assert(start.ok, `start over the wire: ${start.error}`);
  await new Promise((r) => setTimeout(r, 200));

  const me = clients[0].state;
  assert(me.categories.includes('secret2') && me.baggageKeys.length === 3, 'the table is playing the settings it asked for');
  assert(me.you.hand.length === 3, 'three action cards in hand');
  assert(me.scenario === 'zombies', 'the scenario travels to the client');

  // Play a card over the wire: peek at somebody's baggage.
  const peekable = me.you.playable.find((c) => c.id === 'peek_baggage' && c.playable);
  if (peekable) {
    const other = me.players.find((p) => !p.isYou);
    const res = await ack(clients[0].socket, 'bunker:playCard', { cardId: 'peek_baggage', targetId: other.id });
    assert(res.ok, `a card is played over the wire: ${res.error}`);
    await new Promise((r) => setTimeout(r, 150));
    assert(clients[0].state.you.results.some((x) => x.type === 'PEEKED_BAGGAGE'), 'the player who looked was told');
    assert(!(clients[2].state.you.results || []).some((x) => x.type === 'PEEKED_BAGGAGE'), 'and nobody else was');
    assert(clients[2].state.cardHistory.some((h) => h.cardId === 'peek_baggage'), 'but the table knows a card was played');
  }

  // A card somebody does not hold is refused, with a reason.
  const bogus = await ack(clients[1].socket, 'bunker:playCard', { cardId: 'immunity', targetId: null });
  if (!bogus.ok) assert(/do not have that card|cannot be played/.test(bogus.error), `a bogus card play is refused: ${bogus.error}`);

  clients.forEach((c) => c.socket.close());
  watcher.socket.close();
  await new Promise((r) => setTimeout(r, 150));
  server.close();
  console.log('  ✓ the extended Bunker runs over the wire: settings, hands, private card results, closed gallery');
}

main();
wire().then(() => {
  console.log('\n=== BUNKER DEEP TESTS PASSED ===');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
