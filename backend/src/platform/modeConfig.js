// modeConfig.js
// The Creator's controls over each game mode: player limits, whether guests
// may join, the default and locked lobby settings, texts, and - for
// Monopoly - the money rules and the Chance / Community Chest decks.
//
// A mode with no saved config plays exactly as the code ships. Changes are
// applied in a controlled way: they are validated here, saved as a new
// version (the old one stays in the history and can be restored), and read
// only when a room is created, joined or started - a game already running
// keeps what it started with.

const creatorDb = require('../db/creator');
const { AccessError } = require('./access');

// Engines are required lazily: several of them reach back into the
// platform layer while loading.
/* eslint-disable global-require */
const ENGINES = {
  monopoly: () => {
    const { MIN_PLAYERS, MAX_PLAYERS } = require('../game/GameManager');
    return { MIN_PLAYERS, MAX_PLAYERS, DEFAULT_SETTINGS: null };
  },
  mafia: () => {
    const s = require('../mafia/settings');
    return { MIN_PLAYERS: s.MIN_PLAYERS, MAX_PLAYERS: s.MAX_PLAYERS, DEFAULT_SETTINGS: s.DEFAULT_SETTINGS };
  },
  citadels: () => require('../citadels/CitadelsGame'),
  bunker: () => require('../bunker/BunkerGame'),
  catan: () => require('../catan/CatanGame'),
  cosmic: () => require('../cosmic/CosmicGame'),
  throne: () => require('../throne/ThroneGame'),
  chpok: () => require('../chpok/ChpokGame'),
  memehype: () => require('../memehype/MemeHypeGame'),
};
/* eslint-enable global-require */

const CARD_TYPES = {
  MOVE_TO: ['roleTile'],
  MOVE_RELATIVE: ['steps'],
  COLLECT: ['amount'],
  PAY: ['amount'],
  PAY_EACH_PLAYER: ['amount'],
  COLLECT_EACH_PLAYER: ['amount'],
  GO_TO_JAIL: [],
  GET_OUT_OF_JAIL: [],
  REPAIRS: ['perHouse', 'perHotel'],
  MOVE_TO_NEAREST_RAILROAD: [],
  MOVE_TO_NEAREST_UTILITY: [],
};
const ROLE_TILES = ['GO', 'JAIL', 'FAR_PROPERTY_1', 'FAR_PROPERTY_2', 'MID_RAILROAD'];

class ConfigError extends AccessError {
  constructor(message) {
    super(message, 'BAD_CONFIG');
  }
}

const cache = new Map();

function gameOf(modeId) {
  return String(modeId || '').split('.')[0];
}

function engine(gameId) {
  const load = ENGINES[gameId];
  return load ? load() : null;
}

function hardLimits(gameId) {
  const e = engine(gameId);
  return e ? { min: e.MIN_PLAYERS, max: e.MAX_PLAYERS } : { min: 1, max: 99 };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// b over a, recursively for plain objects; arrays and values replace.
function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b === undefined ? clone(a) : clone(b);
  const out = clone(a);
  Object.entries(b).forEach(([k, v]) => {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  });
  return out;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => {
    if (!isPlainObject(o[k])) o[k] = {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = clone(value);
}

// Every dotted path to a leaf of a settings object, for the "locked" picker.
function leafPaths(obj, prefix = '') {
  if (!isPlainObject(obj)) return prefix ? [prefix] : [];
  return Object.entries(obj).flatMap(([k, v]) => (isPlainObject(v) ? leafPaths(v, prefix ? `${prefix}.${k}` : k) : [prefix ? `${prefix}.${k}` : k]));
}

function defaultDecks() {
  // eslint-disable-next-line global-require
  const { CHANCE_TEMPLATE, CHEST_TEMPLATE } = require('../game/cards');
  return { chance: clone(CHANCE_TEMPLATE), chest: clone(CHEST_TEMPLATE) };
}

function defaultRules() {
  // eslint-disable-next-line global-require
  const { DEFAULT_RULES } = require('../game/GameState');
  return { ...DEFAULT_RULES };
}

// What a mode looks like with nothing saved.
function baseConfig(modeId) {
  const gameId = gameOf(modeId);
  const limits = hardLimits(gameId);
  const e = engine(gameId);
  const out = {
    minPlayers: limits.min,
    maxPlayers: limits.max,
    allowGuests: true,
    label: null,
    description: null,
    notes: '',
    defaults: e?.DEFAULT_SETTINGS ? clone(e.DEFAULT_SETTINGS) : {},
    locked: [],
  };
  if (gameId === 'monopoly') {
    out.rules = defaultRules();
    out.decks = defaultDecks();
    out.bots = { disconnectGraceSec: 600 };
  }
  return out;
}

function saved(modeId) {
  if (cache.has(modeId)) return cache.get(modeId);
  let row = null;
  try {
    row = creatorDb.getModeConfig(modeId);
  } catch {
    row = null;
  }
  cache.set(modeId, row);
  return row;
}

// The config in force: the saved one over the defaults.
function effective(modeId) {
  const base = baseConfig(modeId);
  const row = saved(modeId);
  const merged = row ? deepMerge(base, row.config) : base;
  // Arrays are replaced as a whole, so a saved deck or lock list wins.
  if (row?.config?.locked) merged.locked = [...row.config.locked];
  if (row?.config?.decks) merged.decks = clone(row.config.decks);
  return {
    ...merged,
    version: row?.version || 1,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
    customized: !!row,
  };
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function localized(value, max) {
  if (!isPlainObject(value)) return null;
  const out = { en: text(value.en, max), ru: text(value.ru, max) };
  return out.en || out.ru ? out : null;
}

function int(value, min, max, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

function validateDeck(deck, name) {
  if (!Array.isArray(deck) || deck.length < 1 || deck.length > 60) throw new ConfigError(`The ${name} deck needs between 1 and 60 cards.`);
  return deck.map((card, i) => {
    const where = `${name} card ${i + 1}`;
    if (!isPlainObject(card) || !CARD_TYPES[card.type]) throw new ConfigError(`${where}: unknown card type.`);
    const out = {
      text: { en: text(card.text?.en, 200), ru: text(card.text?.ru, 200) },
      type: card.type,
    };
    if (!out.text.en && !out.text.ru) throw new ConfigError(`${where}: the card needs a text.`);
    if (!out.text.en) out.text.en = out.text.ru;
    if (!out.text.ru) out.text.ru = out.text.en;
    CARD_TYPES[card.type].forEach((field) => {
      if (field === 'roleTile') {
        if (!ROLE_TILES.includes(card.roleTile)) throw new ConfigError(`${where}: unknown destination.`);
        out.roleTile = card.roleTile;
      } else if (field === 'steps') {
        out.steps = int(card.steps, -12, 12, `${where}: steps`);
        if (out.steps === 0) throw new ConfigError(`${where}: steps cannot be 0.`);
      } else {
        out[field] = int(card[field], 0, 100000, `${where}: ${field}`);
      }
    });
    if (card.type === 'MOVE_TO' && card.noGoCollect) out.noGoCollect = true;
    if (card.type === 'MOVE_TO_NEAREST_RAILROAD' && card.doubleRent) out.doubleRent = true;
    return out;
  });
}

// Checks and cleans a config sent from the panel. Only what differs from
// the defaults needs to be stored, but a full config is accepted too.
function validate(modeId, input) {
  const gameId = gameOf(modeId);
  if (!ENGINES[gameId]) throw new ConfigError('Unknown game.');
  const src = isPlainObject(input) ? input : {};
  const limits = hardLimits(gameId);
  const base = baseConfig(modeId);
  const out = {};

  const minPlayers = src.minPlayers === undefined ? base.minPlayers : int(src.minPlayers, limits.min, limits.max, 'Minimum players');
  const maxPlayers = src.maxPlayers === undefined ? base.maxPlayers : int(src.maxPlayers, limits.min, limits.max, 'Maximum players');
  if (minPlayers > maxPlayers) throw new ConfigError('The minimum number of players cannot be above the maximum.');
  out.minPlayers = minPlayers;
  out.maxPlayers = maxPlayers;
  out.allowGuests = src.allowGuests !== false;
  out.label = localized(src.label, 60);
  out.description = localized(src.description, 400);
  out.notes = text(src.notes, 2000);

  if (isPlainObject(src.defaults)) {
    const serialized = JSON.stringify(src.defaults);
    if (serialized.length > 20000) throw new ConfigError('The default settings are too large.');
    out.defaults = deepMerge(base.defaults, src.defaults);
  } else {
    out.defaults = base.defaults;
  }
  const known = new Set(leafPaths(base.defaults));
  const topLevel = new Set(Object.keys(base.defaults || {}));
  out.locked = Array.isArray(src.locked)
    ? [...new Set(src.locked.map(String).filter((p) => known.has(p) || topLevel.has(p)))]
    : [];

  if (gameId === 'monopoly') {
    const r = isPlainObject(src.rules) ? src.rules : {};
    const d = base.rules;
    out.rules = {
      startingMoney: r.startingMoney === undefined ? d.startingMoney : int(r.startingMoney, 0, 1000000, 'Starting money'),
      goSalary: r.goSalary === undefined ? d.goSalary : int(r.goSalary, 0, 100000, 'Start salary'),
      jailFine: r.jailFine === undefined ? d.jailFine : int(r.jailFine, 0, 100000, 'Jail fine'),
      maxJailTurns: r.maxJailTurns === undefined ? d.maxJailTurns : int(r.maxJailTurns, 1, 10, 'Turns in jail'),
      mortgageRounds: r.mortgageRounds === undefined ? d.mortgageRounds : int(r.mortgageRounds, 1, 100, 'Mortgage rounds'),
      auctionMs: r.auctionMs === undefined ? d.auctionMs : int(r.auctionMs, 5000, 300000, 'Auction length (ms)'),
    };
    const decks = isPlainObject(src.decks) ? src.decks : {};
    out.decks = {
      chance: decks.chance ? validateDeck(decks.chance, 'Chance') : base.decks.chance,
      chest: decks.chest ? validateDeck(decks.chest, 'Community Chest') : base.decks.chest,
    };
    const b = isPlainObject(src.bots) ? src.bots : {};
    out.bots = {
      disconnectGraceSec: b.disconnectGraceSec === undefined ? base.bots.disconnectGraceSec : int(b.disconnectGraceSec, 10, 3600, 'Auto-move delay'),
    };
  }
  return out;
}

function save(modeId, input, by, note = null) {
  const config = validate(modeId, input);
  creatorDb.saveModeConfig(modeId, config, by, note);
  cache.delete(modeId);
  return effective(modeId);
}

function history(modeId) {
  return creatorDb.modeConfigHistory(modeId);
}

function restoreVersion(modeId, version, by) {
  // Version 1 is the mode as the code ships it; it is never stored.
  const config = creatorDb.modeConfigVersion(modeId, Number(version)) || (Number(version) === 1 ? baseConfig(modeId) : null);
  if (!config) throw new ConfigError('That version does not exist.');
  return save(modeId, config, by, `restored v${version}`);
}

function reset(modeId, by) {
  return save(modeId, baseConfig(modeId), by, 'reset to defaults');
}

// --- what the game code asks ------------------------------------------------------

// The settings a new room starts with: what the host sent over the
// Creator's defaults, with the locked settings forced.
function settingsForNewRoom(modeId, input) {
  const cfg = effective(modeId);
  if (!cfg.customized) return input;
  const merged = deepMerge(cfg.defaults || {}, isPlainObject(input) ? input : {});
  return applyLocked(modeId, merged, cfg);
}

function applyLocked(modeId, patch, cfg = effective(modeId)) {
  if (!cfg.locked?.length || !isPlainObject(patch)) return patch;
  const out = clone(patch);
  cfg.locked.forEach((path) => {
    const value = getPath(cfg.defaults, path);
    if (value !== undefined) setPath(out, path, value);
  });
  return out;
}

function monopolyOptions(layoutId) {
  const cfg = effective(`monopoly.${layoutId}`);
  if (!cfg.customized) return {};
  return { rules: cfg.rules, decks: cfg.decks };
}

// Only a limit tighter than the engine's own is checked here: the engine
// keeps refusing (with its own message) whatever it always refused.
function assertCanSeat(modeId, seatedCount, accountId) {
  const cfg = effective(modeId);
  if (!cfg.customized) return;
  const hard = hardLimits(gameOf(modeId));
  if (cfg.maxPlayers < hard.max && seatedCount >= cfg.maxPlayers) {
    throw new AccessError(`This room is full (at most ${cfg.maxPlayers} players).`, 'ROOM_FULL');
  }
  if (!cfg.allowGuests && !accountId) {
    throw new AccessError('Guests cannot join this game right now. Log in to play.', 'GUESTS_DISABLED');
  }
}

function assertCanStart(modeId, playerCount) {
  const cfg = effective(modeId);
  if (!cfg.customized) return;
  const hard = hardLimits(gameOf(modeId));
  if (playerCount >= hard.min && playerCount < cfg.minPlayers) {
    throw new AccessError(`This game needs at least ${cfg.minPlayers} players.`, 'NOT_ENOUGH_PLAYERS');
  }
  if (playerCount > cfg.maxPlayers) {
    throw new AccessError(`This game allows at most ${cfg.maxPlayers} players.`, 'TOO_MANY_PLAYERS');
  }
}

function invalidate(modeId = null) {
  if (modeId) cache.delete(modeId);
  else cache.clear();
}

module.exports = {
  ConfigError,
  CARD_TYPES,
  ROLE_TILES,
  gameOf,
  hardLimits,
  baseConfig,
  effective,
  validate,
  save,
  history,
  restoreVersion,
  reset,
  leafPaths,
  settingsForNewRoom,
  applyLocked,
  monopolyOptions,
  assertCanSeat,
  assertCanStart,
  invalidate,
};
