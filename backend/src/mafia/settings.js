// settings.js
// The rules of one Mafia game: what roles are in the bag, how long each
// phase runs, what the players are told, and how the game is won.
//
// Everything here is data the host edits in the lobby and the engine
// reads at runtime - there is no second copy of these numbers anywhere,
// so a setting that appears in the UI is a setting that actually bites.

const { CONFIGURABLE_ROLES } = require('./roles');

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 15;

const DEFAULT_SETTINGS = {
  // --- roles ---------------------------------------------------------
  roles: { MAFIA: 1, DON: 0, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 },
  // With autoBalance on, role counts follow the size of the room; the
  // host can switch it off and pin exact numbers instead.
  autoBalance: true,

  // --- night ---------------------------------------------------------
  night: {
    durationSec: 40,
    allowChangeTarget: true,
    // Whether a player is told the outcome of their own action (the
    // sheriff's check, the doctor's save) the moment the night ends.
    showOwnResult: true,
    // Whether a role may target the same player two nights running.
    allowRepeatTarget: true,
    actionOrder: ['DON', 'MAFIA', 'SHERIFF', 'DOCTOR', 'MANIAC'],
  },

  // --- day -----------------------------------------------------------
  day: {
    discussionSec: 120,
    voteSec: 45,
    allowVoteChange: true,
    allowAbstain: true,
    // How a tied vote is settled.
    tieResolution: 'NO_EXECUTION', // NO_EXECUTION | RANDOM | REVOTE
    // A plain majority of the living, or just the most votes.
    executionRule: 'PLURALITY', // PLURALITY | MAJORITY
  },

  // --- information ---------------------------------------------------
  info: {
    revealRoleOnDeath: true,
    showDeathCause: true,
    showNightResults: true,
    showVoteCounts: true,
    showPlayerStats: true,
    showHistory: true,
  },

  // --- win conditions ------------------------------------------------
  win: {
    mafiaWinsOnParity: true,
    // Does a living maniac stop the town from winning?
    maniacBlocksTownWin: true,
    maniacWinsAtParity: true,
  },

  // --- fun mode ------------------------------------------------------
  fun: {
    enabled: false,
    modifiers: {
      randomRoles: false,      // roles redrawn without regard to balance
      doctorSelfHeal: false,   // the doctor may heal themselves
      immortal: false,         // one random player survives the first hit
      doubleVote: false,       // a random player's vote counts twice
      secretVote: false,       // nobody sees who voted for whom
      extraManiac: false,      // a second maniac joins the game
      nightEvents: false,      // random events fire at night
      dayEvents: false,        // random events fire during the day
      roleSwap: false,         // two players quietly swap roles mid-game
      fastNight: false,        // night runs at half length
      fastDay: false,          // day runs at half length
      chaos: false,            // every other modifier rolls the dice
    },
  },
};

const PRESETS = {
  CLASSIC: {
    id: 'CLASSIC',
    settings: { roles: { MAFIA: 2, DON: 1, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 }, autoBalance: true },
  },
  FAST: {
    id: 'FAST',
    settings: {
      roles: { MAFIA: 2, DON: 0, SHERIFF: 1, DOCTOR: 1, MANIAC: 0 },
      autoBalance: true,
      night: { durationSec: 25 },
      day: { discussionSec: 60, voteSec: 30 },
    },
  },
  BIG_PARTY: {
    id: 'BIG_PARTY',
    settings: {
      roles: { MAFIA: 3, DON: 1, SHERIFF: 1, DOCTOR: 1, MANIAC: 1 },
      autoBalance: true,
      day: { discussionSec: 180, voteSec: 60 },
    },
  },
  WITH_MANIAC: {
    id: 'WITH_MANIAC',
    settings: { roles: { MAFIA: 2, DON: 1, SHERIFF: 1, DOCTOR: 1, MANIAC: 1 }, autoBalance: true },
  },
  CHAOS: {
    id: 'CHAOS',
    settings: {
      roles: { MAFIA: 3, DON: 1, SHERIFF: 1, DOCTOR: 1, MANIAC: 1 },
      autoBalance: true,
      night: { durationSec: 25 },
      day: { discussionSec: 60, voteSec: 25 },
      fun: {
        enabled: true,
        modifiers: {
          randomRoles: true, doctorSelfHeal: true, immortal: true, doubleVote: true,
          secretVote: false, extraManiac: true, nightEvents: true, dayEvents: true,
          roleSwap: true, fastNight: true, fastDay: true, chaos: true,
        },
      },
    },
  },
  FUN: {
    id: 'FUN',
    settings: {
      roles: { MAFIA: 2, DON: 1, SHERIFF: 1, DOCTOR: 1, MANIAC: 1 },
      autoBalance: true,
      fun: {
        enabled: true,
        modifiers: {
          randomRoles: false, doctorSelfHeal: true, immortal: false, doubleVote: true,
          secretVote: false, extraManiac: false, nightEvents: true, dayEvents: false,
          roleSwap: false, fastNight: false, fastDay: false, chaos: false,
        },
      },
    },
  },
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Merges a partial settings patch into a full settings object without
// letting a caller introduce keys the engine does not know about - the
// shape of DEFAULT_SETTINGS is the whitelist.
function mergeSettings(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!isPlainObject(patch)) return out;
  Object.keys(out).forEach((key) => {
    if (!(key in patch)) return;
    const current = out[key];
    const incoming = patch[key];
    if (isPlainObject(current)) {
      out[key] = mergeSettings(current, incoming);
    } else if (Array.isArray(current)) {
      if (Array.isArray(incoming)) out[key] = incoming.filter((v) => typeof v === 'string');
    } else if (typeof current === 'number') {
      const n = Number(incoming);
      if (Number.isFinite(n)) out[key] = Math.max(0, Math.round(n));
    } else if (typeof current === 'boolean') {
      out[key] = !!incoming;
    } else if (typeof current === 'string') {
      if (typeof incoming === 'string') out[key] = incoming;
    }
  });
  return out;
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function presetSettings(presetId) {
  const preset = PRESETS[presetId];
  if (!preset) return cloneDefaults();
  return mergeSettings(cloneDefaults(), preset.settings);
}

// How many of each special role a room of this size should have. Used
// when autoBalance is on, and as the starting point a host edits from.
// The shape of the curve is the familiar one: roughly a quarter of the
// table is mafia, and the power roles appear as the room gets big enough
// to absorb them.
function balancedRoles(playerCount, wanted = {}) {
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, playerCount || MIN_PLAYERS));
  const mafiaTotal = Math.max(1, Math.round(count / 4));
  const useDon = wanted.DON !== 0 && count >= 6;
  const roles = {
    MAFIA: useDon ? Math.max(1, mafiaTotal - 1) : mafiaTotal,
    DON: useDon ? 1 : 0,
    SHERIFF: wanted.SHERIFF === 0 ? 0 : 1,
    DOCTOR: wanted.DOCTOR === 0 ? 0 : (count >= 5 ? 1 : 0),
    MANIAC: wanted.MANIAC ? Math.min(wanted.MANIAC, count >= 8 ? 1 : 0) : 0,
  };
  return clampRoles(roles, count);
}

// Guarantees a role table that can actually be dealt: at least one
// mafia, at least one civilian, and never more special roles than there
// are seats.
function clampRoles(roles, playerCount) {
  const out = {};
  CONFIGURABLE_ROLES.forEach((id) => {
    out[id] = Math.max(0, Math.round(Number(roles?.[id]) || 0));
  });
  // A Don without any other structure is still a mafia member, so the
  // team is never empty - but a Don alone is only allowed once the room
  // is big enough to have hidden him.
  if (out.MAFIA + out.DON === 0) out.MAFIA = 1;

  const maxSpecial = Math.max(1, playerCount - 1); // always leave a civilian
  let total = CONFIGURABLE_ROLES.reduce((sum, id) => sum + out[id], 0);
  // Trim from the least essential role first if the host over-filled.
  const trimOrder = ['MANIAC', 'DOCTOR', 'SHERIFF', 'DON', 'MAFIA'];
  let i = 0;
  while (total > maxSpecial && i < trimOrder.length) {
    const id = trimOrder[i];
    const canTrim = id === 'MAFIA' ? out[id] - 1 : out[id];
    const take = Math.min(Math.max(canTrim, 0), total - maxSpecial);
    out[id] -= take;
    total -= take;
    i += 1;
  }
  // The mafia must never outnumber or match the rest before a card is
  // even dealt, or the game is over on night zero.
  const mafiaCount = out.MAFIA + out.DON;
  const others = playerCount - mafiaCount;
  if (mafiaCount >= others) {
    const excess = mafiaCount - Math.max(1, Math.floor((playerCount - 1) / 2));
    const fromRanks = Math.min(excess, Math.max(0, out.MAFIA - (out.DON ? 0 : 1)));
    out.MAFIA -= fromRanks;
    if (out.MAFIA + out.DON === 0) out.MAFIA = 1;
  }
  return out;
}

function civiliansFor(playerCount, roles) {
  const special = CONFIGURABLE_ROLES.reduce((sum, id) => sum + (roles[id] || 0), 0);
  return Math.max(0, playerCount - special);
}

// Effective phase lengths, after the fun modifiers have had their say.
function phaseDurations(settings) {
  const fun = settings.fun?.enabled ? settings.fun.modifiers : {};
  const nightFactor = fun.fastNight ? 0.5 : 1;
  const dayFactor = fun.fastDay ? 0.5 : 1;
  return {
    nightSec: Math.max(10, Math.round(settings.night.durationSec * nightFactor)),
    discussionSec: Math.max(15, Math.round(settings.day.discussionSec * dayFactor)),
    voteSec: Math.max(10, Math.round(settings.day.voteSec * dayFactor)),
  };
}

function modifierOn(settings, key) {
  return !!(settings.fun?.enabled && settings.fun.modifiers?.[key]);
}

// "Surprise me": a configuration that is random but still playable -
// every roll is taken from a range that keeps the game balanced rather
// than from the full space of possible values.
function randomSettings(playerCount) {
  const s = cloneDefaults();
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, playerCount || 8));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  s.roles = balancedRoles(count, {
    DON: chance(0.7) ? 1 : 0,
    SHERIFF: chance(0.9) ? 1 : 0,
    DOCTOR: chance(0.8) ? 1 : 0,
    MANIAC: chance(0.45) && count >= 8 ? 1 : 0,
  });
  s.night.durationSec = pick([25, 30, 40, 50]);
  s.day.discussionSec = pick([60, 90, 120, 150]);
  s.day.voteSec = pick([25, 30, 45]);
  s.day.tieResolution = pick(['NO_EXECUTION', 'RANDOM', 'REVOTE']);
  s.day.allowAbstain = chance(0.7);
  s.info.revealRoleOnDeath = chance(0.75);
  s.info.showNightResults = chance(0.8);

  if (chance(0.45)) {
    s.fun.enabled = true;
    const keys = Object.keys(s.fun.modifiers);
    const howMany = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < howMany; i += 1) {
      const key = pick(keys.filter((k) => k !== 'chaos'));
      s.fun.modifiers[key] = true;
    }
  }
  return s;
}

// Chaos rerolls the other modifiers each time a game starts, so two
// chaos games are never the same.
function rollChaos(settings) {
  if (!modifierOn(settings, 'chaos')) return settings;
  const next = JSON.parse(JSON.stringify(settings));
  Object.keys(next.fun.modifiers).forEach((key) => {
    if (key === 'chaos') return;
    next.fun.modifiers[key] = Math.random() < 0.45;
  });
  return next;
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_SETTINGS,
  PRESETS,
  cloneDefaults,
  presetSettings,
  mergeSettings,
  balancedRoles,
  clampRoles,
  civiliansFor,
  phaseDurations,
  modifierOn,
  randomSettings,
  rollChaos,
};
