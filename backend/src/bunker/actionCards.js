// actionCards.js
// The Bunker's action cards.
//
// A card here is a real game object, not a button: it declares WHEN it may
// be played, WHAT it needs to be pointed at, how long its effect lasts and
// how often it may be used, and it carries the function that actually
// changes the game. The engine never knows what any individual card does -
// it validates the declaration and then calls `apply`.
//
// Adding a card means adding an entry to CARDS. Turning one off, changing
// how many exist or how likely it is to be dealt is a setting, not a code
// change (see bunker/settings.js).

// When a card may be played.
const STAGES = ['REVEAL', 'DISCUSSION', 'VOTE', 'RESULT', 'ANY'];
// What a card is pointed at.
const TARGETS = {
  NONE: 'none', // no target at all
  SELF: 'self', // the player who played it
  PLAYER: 'player', // another living player
  ANY_PLAYER: 'anyPlayer', // any living player, including yourself
  OWN_CHARACTERISTIC: 'ownCharacteristic', // one of your own hidden cards
  PLAYER_CHARACTERISTIC: 'playerCharacteristic', // a named card of a named player
};
// How long an effect lasts once played.
const DURATIONS = {
  INSTANT: 'instant',
  ROUND: 'round', // until this round ends
  NEXT_VOTE: 'nextVote', // until the next vote is counted
  GAME: 'game',
};

function def(id, spec) {
  return {
    id,
    stage: 'DISCUSSION',
    target: TARGETS.NONE,
    duration: DURATIONS.INSTANT,
    // How many times ONE player may play this card in a single game.
    maxPerGame: 1,
    // How often it turns up when hands are dealt, relative to the others.
    weight: 10,
    ...spec,
  };
}

// `ctx` is what the engine hands a card: the game, the player who played
// it, the resolved target, and helpers for the things cards commonly do.
// A card returns a small object describing what happened, which becomes
// the entry in the card history everyone can read.
const CARDS = [
  // --- information -------------------------------------------------
  def('peek_characteristic', {
    stage: 'ANY',
    target: TARGETS.PLAYER_CHARACTERISTIC,
    duration: DURATIONS.INSTANT,
    weight: 14,
    apply({ game, actor, targetPlayer, key }) {
      const value = targetPlayer.cards[key];
      game.tellPrivately(actor.id, 'PEEKED', { targetId: targetPlayer.id, key, card: value });
      return { public: { targetId: targetPlayer.id, key }, secret: true };
    },
  }),
  def('peek_baggage', {
    stage: 'ANY',
    target: TARGETS.PLAYER,
    weight: 12,
    apply({ game, actor, targetPlayer }) {
      const bags = game.baggageKeysInPlay()
        .map((key) => ({ key, card: targetPlayer.cards[key] }))
        .filter((b) => b.card);
      game.tellPrivately(actor.id, 'PEEKED_BAGGAGE', { targetId: targetPlayer.id, items: bags });
      return { public: { targetId: targetPlayer.id }, secret: true };
    },
  }),
  def('expose_secret', {
    stage: 'DISCUSSION',
    target: TARGETS.PLAYER,
    weight: 7,
    apply({ game, targetPlayer }) {
      const key = game.secretKeysInPlay().find((k) => targetPlayer.cards[k] && !targetPlayer.revealed.includes(k));
      if (!key) return { failed: 'nothingToExpose' };
      game.forceReveal(targetPlayer, key);
      return { public: { targetId: targetPlayer.id, key } };
    },
  }),
  def('inspect_item', {
    stage: 'ANY',
    target: TARGETS.PLAYER_CHARACTERISTIC,
    weight: 8,
    keyFilter: 'baggage',
    apply({ game, targetPlayer, key }) {
      const revealed = game.revealHiddenProperty(targetPlayer, key);
      if (!revealed) return { failed: 'noHiddenProperty' };
      return { public: { targetId: targetPlayer.id, key, property: revealed } };
    },
  }),

  // --- controlling what comes out ----------------------------------
  def('hide_characteristic', {
    stage: 'ANY',
    target: TARGETS.OWN_CHARACTERISTIC,
    duration: DURATIONS.GAME,
    weight: 12,
    requiresRevealed: true,
    apply({ game, actor, key }) {
      if (!actor.revealed.includes(key)) return { failed: 'notRevealed' };
      actor.revealed = actor.revealed.filter((k) => k !== key);
      game.markHiddenAgain(actor, key);
      return { public: { key } };
    },
  }),
  def('swap_characteristic', {
    stage: 'ANY',
    target: TARGETS.OWN_CHARACTERISTIC,
    weight: 9,
    apply({ game, actor, key }) {
      const fresh = game.drawReplacement(key, actor);
      if (!fresh) return { failed: 'deckEmpty' };
      const before = actor.cards[key];
      actor.cards[key] = fresh;
      game.tellPrivately(actor.id, 'SWAPPED', { key, from: before, to: fresh });
      // A card that was already on the table stays on the table - the
      // room sees the new value, not the old one.
      return { public: { key, wasRevealed: actor.revealed.includes(key) } };
    },
  }),
  def('block_reveal', {
    stage: 'ANY',
    target: TARGETS.PLAYER,
    duration: DURATIONS.ROUND,
    weight: 8,
    apply({ game, targetPlayer }) {
      game.addEffect('blockReveal', { playerId: targetPlayer.id }, DURATIONS.ROUND);
      return { public: { targetId: targetPlayer.id } };
    },
  }),
  def('demand_reveal', {
    stage: 'DISCUSSION',
    target: TARGETS.PLAYER_CHARACTERISTIC,
    weight: 11,
    apply({ game, targetPlayer, key }) {
      if (targetPlayer.revealed.includes(key)) return { failed: 'alreadyRevealed' };
      game.forceReveal(targetPlayer, key);
      return { public: { targetId: targetPlayer.id, key } };
    },
  }),
  def('extra_reveal', {
    stage: 'REVEAL',
    target: TARGETS.SELF,
    weight: 10,
    apply({ game, actor }) {
      game.addEffect('extraReveal', { playerId: actor.id }, DURATIONS.ROUND);
      return { public: {} };
    },
  }),

  // --- baggage ------------------------------------------------------
  def('swap_baggage', {
    stage: 'DISCUSSION',
    target: TARGETS.PLAYER,
    weight: 7,
    apply({ game, actor, targetPlayer }) {
      const key = game.baggageKeysInPlay()[0];
      if (!key) return { failed: 'noBaggage' };
      const mine = actor.cards[key];
      actor.cards[key] = targetPlayer.cards[key];
      targetPlayer.cards[key] = mine;
      // Whatever either of them had shown about that bag is no longer true.
      [actor, targetPlayer].forEach((p) => { p.revealed = p.revealed.filter((k) => k !== key); });
      return { public: { targetId: targetPlayer.id, key } };
    },
  }),

  // --- voting -------------------------------------------------------
  def('protect_player', {
    stage: 'ANY',
    target: TARGETS.ANY_PLAYER,
    duration: DURATIONS.NEXT_VOTE,
    weight: 9,
    apply({ game, targetPlayer }) {
      game.addEffect('protected', { playerId: targetPlayer.id }, DURATIONS.NEXT_VOTE);
      return { public: { targetId: targetPlayer.id } };
    },
  }),
  def('immunity', {
    stage: 'ANY',
    target: TARGETS.SELF,
    duration: DURATIONS.NEXT_VOTE,
    weight: 6,
    apply({ game, actor }) {
      game.addEffect('protected', { playerId: actor.id }, DURATIONS.NEXT_VOTE);
      return { public: {} };
    },
  }),
  def('double_vote', {
    stage: 'ANY',
    target: TARGETS.SELF,
    duration: DURATIONS.NEXT_VOTE,
    weight: 9,
    apply({ game, actor }) {
      game.addEffect('doubleVote', { playerId: actor.id }, DURATIONS.NEXT_VOTE);
      return { public: {} };
    },
  }),
  def('change_vote', {
    stage: 'VOTE',
    target: TARGETS.PLAYER,
    weight: 8,
    apply({ game, actor, targetPlayer }) {
      if (game.votes[actor.id] === undefined) return { failed: 'notVotedYet' };
      game.votes[actor.id] = targetPlayer.id;
      return { public: { targetId: targetPlayer.id } };
    },
  }),
  def('cancel_vote', {
    stage: 'VOTE',
    target: TARGETS.PLAYER,
    weight: 6,
    apply({ game, targetPlayer }) {
      const had = Object.entries(game.votes).filter(([, t]) => t === targetPlayer.id);
      if (!had.length) return { failed: 'noVotesToCancel' };
      // The single most recent ballot against them is torn up.
      delete game.votes[had[had.length - 1][0]];
      return { public: { targetId: targetPlayer.id } };
    },
  }),
  def('postpone_vote', {
    stage: 'DISCUSSION',
    target: TARGETS.NONE,
    weight: 4,
    apply({ game }) {
      game.addEffect('postponeVote', {}, DURATIONS.ROUND);
      return { public: {} };
    },
  }),

  // --- chaos --------------------------------------------------------
  def('random_event', {
    stage: 'DISCUSSION',
    target: TARGETS.NONE,
    weight: 6,
    apply({ game }) {
      const event = game.fireRandomEvent('card');
      if (!event) return { failed: 'noEvents' };
      return { public: { event: event.id } };
    },
  }),
  def('impersonate', {
    stage: 'DISCUSSION',
    target: TARGETS.PLAYER_CHARACTERISTIC,
    weight: 5,
    apply({ game, actor, targetPlayer, key }) {
      if (!targetPlayer.revealed.includes(key)) return { failed: 'notRevealed' };
      // Take a copy of what they showed. Yours becomes theirs on paper.
      actor.cards[key] = JSON.parse(JSON.stringify(targetPlayer.cards[key]));
      if (!actor.revealed.includes(key)) actor.revealed.push(key);
      game.noteRevealedThisRound(actor, key);
      return { public: { targetId: targetPlayer.id, key } };
    },
  }),
];

const BY_ID = new Map(CARDS.map((cardDef) => [cardDef.id, cardDef]));
const ALL_IDS = CARDS.map((cardDef) => cardDef.id);

function cardDef(id) {
  return BY_ID.get(id) || null;
}

// Which cards may legally be played in this phase.
function playableIn(phase, id) {
  const d = cardDef(id);
  if (!d) return false;
  return d.stage === 'ANY' || d.stage === phase;
}

// The catalogue the client and the admin panel read: everything about a
// card except the function that runs it.
function catalogue() {
  return CARDS.map((d) => ({
    id: d.id,
    stage: d.stage,
    target: d.target,
    duration: d.duration,
    maxPerGame: d.maxPerGame,
    weight: d.weight,
    keyFilter: d.keyFilter || null,
    requiresRevealed: !!d.requiresRevealed,
  }));
}

module.exports = {
  STAGES, TARGETS, DURATIONS, CARDS, ALL_IDS, cardDef, playableIn, catalogue,
};
