// settings.js
// Everything a Bunker table can be configured to do.
//
// The old mode had five flat numbers (maxPlayers, seats, turnSec,
// discussSec, voteSec). Those five still work exactly as they did: a patch
// in the old shape is recognised and folded into the new one, and the new
// settings object still carries all five at the top level, so an old saved
// room, an old client and an old Creator config all keep working.
//
// `sanitize` is the only way settings are ever built. It is total: it takes
// anything at all and returns a complete, playable configuration, clamping
// every number and dropping every key it does not know. Nothing downstream
// has to check a setting again.

const content = require('./content');
const actionCards = require('./actionCards');
const events = require('./events');
const scenarios = require('./scenarios');

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 16;
const MAX_BOTS = 12;

// The original five, kept at the top level for compatibility.
const LEGACY_KEYS = ['maxPlayers', 'seats', 'turnSec', 'discussSec', 'voteSec'];

const VOTE_MODES = ['single', 'multi'];
const TIE_RULES = ['revote', 'random', 'none', 'all'];
const RANDOMNESS = ['balanced', 'chaotic'];
const BAGGAGE_COUNTS = [1, 2, 3, 4, 'random'];

const DEFAULTS = {
  scenario: 'classic',

  // --- the original five, still where they were --------------------
  maxPlayers: 12,
  seats: 0, // 0 = half the table, rounded down
  turnSec: 60,
  discussSec: 120,
  voteSec: 60,

  players: {
    min: MIN_PLAYERS,
    bots: false,
    botCount: 0,
    allowSpectators: true,
  },

  characters: {
    // Which characteristics this table plays with.
    categories: [...content.DEFAULT_CATEGORY_KEYS],
    // How many secret cards each character gets (0, 1 or 2).
    secrets: 1,
    // Cards the owner does not see either until they are revealed.
    hiddenFromOwner: 0,
    // 'balanced' deals one of each card per table; 'chaotic' deals freely,
    // so two people can hold the same profession.
    randomness: 'balanced',
    // How strongly rarity is respected. 'normal' uses the catalogue's own
    // weights; 'flat' ignores rarity; 'rare' pushes the rare cards up.
    rarityBias: 'normal',
  },

  baggage: {
    count: 2, // 1-4, or 'random'
    rarities: [...content.RARITIES],
    specialProperties: true, // items may carry a hidden property
    allowTrade: false, // players may swap bags with a card
    allowSteal: false, // players may take a bag with a card
  },

  actionCards: {
    enabled: true,
    perPlayer: 2,
    deck: [...actionCards.ALL_IDS],
    // The chance that a dealt card slot is actually filled (0.05 - 1).
    drawChance: 1,
    maxUsesPerRound: 1,
    maxUsesPerGame: 0, // 0 = no overall limit beyond the cards held
  },

  rounds: {
    total: 0, // 0 = play until the bunker is full
    firstVoteRound: 2,
    revealPerRound: 1,
    resultSec: 8,
  },

  voting: {
    mode: 'single',
    votesPerPlayer: 1,
    secret: false,
    allowChange: false,
    allowTie: true,
    tieRule: 'revote',
  },

  events: {
    enabled: false,
    chance: 0.3,
    deck: [...events.ALL_IDS],
  },
};

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

// A list filtered down to known ids, never empty unless the whole thing is
// meant to be off - an empty deck would deal nothing and look like a bug.
function idList(value, allowed, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const kept = value.filter((id) => allowed.includes(id));
  return kept.length ? kept : [...fallback];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// b over a, recursively, for plain objects.
function deepMerge(a, b) {
  if (!isObject(a) || !isObject(b)) return b === undefined ? clone(a) : clone(b);
  const out = clone(a);
  Object.entries(b).forEach(([k, v]) => {
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  });
  return out;
}

// The category list a table actually plays with, given what it asked for
// and how many secrets and bags it wants. The order is always the
// catalogue's order, so every screen shows the same character sheet.
function resolveCategories(asked, { secrets, baggageCount }) {
  const wanted = new Set(Array.isArray(asked) && asked.length
    ? asked.filter((k) => content.ALL_CATEGORY_KEYS.includes(k))
    : content.DEFAULT_CATEGORY_KEYS);

  // Profession and biology are what the game opens on - they are never off.
  wanted.add('profession');
  wanted.add('biology');

  // The baggage and secret counts decide their own slots outright.
  content.BAGGAGE_KEYS.forEach((k, i) => (i < baggageCount ? wanted.add(k) : wanted.delete(k)));
  content.SECRET_KEYS.forEach((k, i) => (i < secrets ? wanted.add(k) : wanted.delete(k)));

  return content.ALL_CATEGORY_KEYS.filter((k) => wanted.has(k));
}

// How many bags a table with `count: 'random'` deals this game.
function rollBaggageCount(count, rng = Math.random) {
  if (count === 'random') return 1 + Math.floor(rng() * 4);
  return clampInt(count, 1, 4, 2);
}

// Takes any input at all and returns a complete configuration.
// `base` is what an unmentioned setting falls back to - the current
// settings when a host edits one switch in the lobby.
function sanitize(input, base = DEFAULTS) {
  const src = isObject(input) ? input : {};
  const from = deepMerge(DEFAULTS, isObject(base) ? base : {});

  // A scenario is a patch UNDER whatever the caller asked for, so a host
  // who picks a scenario and then changes one switch keeps that change.
  const scenarioId = oneOf(src.scenario, scenarios.ids(), from.scenario);
  const scenarioPatch = src.scenario && src.scenario !== from.scenario
    ? scenarios.scenario(scenarioId).settings
    : {};
  const merged = deepMerge(deepMerge(from, scenarioPatch), src);

  const p = merged.players || {};
  const ch = merged.characters || {};
  const bg = merged.baggage || {};
  const ac = merged.actionCards || {};
  const rd = merged.rounds || {};
  const vt = merged.voting || {};
  const ev = merged.events || {};

  const maxPlayers = clampInt(merged.maxPlayers, MIN_PLAYERS, MAX_PLAYERS, DEFAULTS.maxPlayers);
  const minPlayers = clampInt(p.min, MIN_PLAYERS, maxPlayers, MIN_PLAYERS);
  const secrets = clampInt(ch.secrets, 0, content.SECRET_KEYS.length, DEFAULTS.characters.secrets);
  const baggageCount = BAGGAGE_COUNTS.includes(bg.count) ? bg.count : DEFAULTS.baggage.count;
  // 'random' is decided per game; for the category list we take the
  // largest, and the deal hides the slots it did not fill.
  const baggageSlots = baggageCount === 'random' ? 4 : baggageCount;

  const voteMode = oneOf(vt.mode, VOTE_MODES, DEFAULTS.voting.mode);

  const out = {
    scenario: scenarioId,

    // --- the original five --------------------------------------
    maxPlayers,
    seats: clampInt(merged.seats, 0, MAX_PLAYERS - 1, DEFAULTS.seats),
    turnSec: clampInt(merged.turnSec, 20, 180, DEFAULTS.turnSec),
    discussSec: clampInt(merged.discussSec, 30, 600, DEFAULTS.discussSec),
    voteSec: clampInt(merged.voteSec, 15, 180, DEFAULTS.voteSec),

    players: {
      min: minPlayers,
      bots: bool(p.bots, DEFAULTS.players.bots),
      botCount: clampInt(p.botCount, 0, MAX_BOTS, DEFAULTS.players.botCount),
      allowSpectators: bool(p.allowSpectators, DEFAULTS.players.allowSpectators),
    },

    characters: {
      categories: resolveCategories(ch.categories, { secrets, baggageCount: baggageSlots }),
      secrets,
      hiddenFromOwner: clampInt(ch.hiddenFromOwner, 0, 3, DEFAULTS.characters.hiddenFromOwner),
      randomness: oneOf(ch.randomness, RANDOMNESS, DEFAULTS.characters.randomness),
      rarityBias: oneOf(ch.rarityBias, ['normal', 'flat', 'rare'], DEFAULTS.characters.rarityBias),
    },

    baggage: {
      count: baggageCount,
      rarities: idList(bg.rarities, content.RARITIES, DEFAULTS.baggage.rarities),
      specialProperties: bool(bg.specialProperties, DEFAULTS.baggage.specialProperties),
      allowTrade: bool(bg.allowTrade, DEFAULTS.baggage.allowTrade),
      allowSteal: bool(bg.allowSteal, DEFAULTS.baggage.allowSteal),
    },

    actionCards: {
      enabled: bool(ac.enabled, DEFAULTS.actionCards.enabled),
      perPlayer: clampInt(ac.perPlayer, 0, 6, DEFAULTS.actionCards.perPlayer),
      deck: idList(ac.deck, actionCards.ALL_IDS, DEFAULTS.actionCards.deck),
      drawChance: clampFloat(ac.drawChance, 0.05, 1, DEFAULTS.actionCards.drawChance),
      maxUsesPerRound: clampInt(ac.maxUsesPerRound, 0, 6, DEFAULTS.actionCards.maxUsesPerRound),
      maxUsesPerGame: clampInt(ac.maxUsesPerGame, 0, 20, DEFAULTS.actionCards.maxUsesPerGame),
    },

    rounds: {
      total: clampInt(rd.total, 0, 20, DEFAULTS.rounds.total),
      firstVoteRound: clampInt(rd.firstVoteRound, 1, 6, DEFAULTS.rounds.firstVoteRound),
      revealPerRound: clampInt(rd.revealPerRound, 1, 3, DEFAULTS.rounds.revealPerRound),
      resultSec: clampInt(rd.resultSec, 3, 60, DEFAULTS.rounds.resultSec),
    },

    voting: {
      mode: voteMode,
      // One vote each unless the table plays the multi-vote variant.
      votesPerPlayer: voteMode === 'multi' ? clampInt(vt.votesPerPlayer, 2, 4, 2) : 1,
      secret: bool(vt.secret, DEFAULTS.voting.secret),
      allowChange: bool(vt.allowChange, DEFAULTS.voting.allowChange),
      allowTie: bool(vt.allowTie, DEFAULTS.voting.allowTie),
      tieRule: oneOf(vt.tieRule, TIE_RULES, DEFAULTS.voting.tieRule),
    },

    events: {
      enabled: bool(ev.enabled, DEFAULTS.events.enabled),
      chance: clampFloat(ev.chance, 0, 1, DEFAULTS.events.chance),
      deck: idList(ev.deck, events.ALL_IDS, DEFAULTS.events.deck),
    },
  };

  // A table that says "no ties" must have a way to break one.
  if (!out.voting.allowTie && out.voting.tieRule === 'none') out.voting.tieRule = 'random';
  // Bots are only dealt in when the switch is on.
  if (!out.players.bots) out.players.botCount = 0;
  // A table with no action cards holds none.
  if (!out.actionCards.enabled) out.actionCards.perPlayer = 0;
  return out;
}

// True when a patch is in the pre-scenario shape: only the five flat
// numbers, and none of the new sections. Such a patch is applied as-is,
// which `sanitize` already does - this is only used to keep the old
// Creator configs and old saves recognisable in tests and logs.
function isLegacyShape(patch) {
  if (!isObject(patch)) return false;
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((k) => LEGACY_KEYS.includes(k));
}

// Everything the client needs to draw the settings screen.
function schema() {
  return {
    limits: {
      minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, maxBots: MAX_BOTS,
    },
    voteModes: VOTE_MODES,
    tieRules: TIE_RULES,
    randomness: RANDOMNESS,
    rarities: content.RARITIES,
    baggageCounts: BAGGAGE_COUNTS,
    categories: content.ALL_CATEGORY_KEYS,
    baggageKeys: content.BAGGAGE_KEYS,
    secretKeys: content.SECRET_KEYS,
    actionCards: actionCards.catalogue(),
    events: events.catalogue(),
    scenarios: scenarios.catalogue(),
    defaults: DEFAULTS,
  };
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  MAX_BOTS,
  DEFAULTS,
  VOTE_MODES,
  TIE_RULES,
  BAGGAGE_COUNTS,
  sanitize,
  schema,
  resolveCategories,
  rollBaggageCount,
  isLegacyShape,
  deepMerge,
};
