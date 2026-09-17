// scenarios.js
// The different kinds of Bunker a table can play.
//
// A scenario is a named bundle of settings plus the catastrophes that fit
// it. It is data: adding "Deep space" or "Drought" is a new entry here (or
// a Creator-made scenario saved through the admin panel), never a change to
// the engine. `settings` is a PATCH - anything a scenario does not mention
// keeps the default, so a new setting added later needs no edit to any
// existing scenario.

// The catastrophes that came with the original mode, grouped by theme so a
// scenario can say "any of these".
const SCENARIOS = [
  {
    id: 'classic',
    builtIn: true,
    catastrophes: null, // any
    settings: {},
  },
  {
    id: 'postapocalypse',
    builtIn: true,
    catastrophes: ['asteroid', 'supervolcano', 'solar_flare'],
    settings: {
      characters: { secrets: 1 },
      baggage: { count: 2 },
      events: { enabled: true, chance: 0.35 },
      rounds: { discussSec: 150 },
    },
  },
  {
    id: 'virus',
    builtIn: true,
    catastrophes: ['pandemic'],
    settings: {
      characters: { secrets: 2 },
      // Health matters more than anything when the threat is a disease.
      events: { enabled: true, chance: 0.3, deck: ['illness', 'inspection', 'resource_loss', 'skill_useless'] },
      voting: { secret: true },
    },
  },
  {
    id: 'nuclear',
    builtIn: true,
    catastrophes: ['nuclear_war', 'chemical'],
    settings: {
      baggage: { count: 3 },
      events: { enabled: true, chance: 0.3, deck: ['resource_loss', 'room_lost', 'seats_lost', 'collapse', 'blackout'] },
      rounds: { turnSec: 45 },
    },
  },
  {
    id: 'flood',
    builtIn: true,
    catastrophes: ['flood'],
    settings: {
      events: { enabled: true, chance: 0.4, deck: ['seats_lost', 'room_lost', 'collapse', 'new_resource'] },
      seats: 0,
    },
  },
  {
    id: 'zombies',
    builtIn: true,
    catastrophes: ['zombies'],
    settings: {
      characters: { secrets: 2 },
      baggage: { count: 2, allowSteal: true },
      actionCards: { enabled: true, perPlayer: 3 },
      events: { enabled: true, chance: 0.4 },
    },
  },
  {
    id: 'space',
    builtIn: true,
    catastrophes: ['asteroid', 'solar_flare', 'ai_uprising'],
    settings: {
      // A capsule has very few places and no room for argument.
      rounds: { discussSec: 90, voteSec: 45 },
      events: { enabled: true, chance: 0.45, deck: ['seats_lost', 'room_lost', 'collapse', 'blackout', 'skill_useless'] },
    },
  },
  {
    id: 'collapse',
    builtIn: true,
    catastrophes: ['ai_uprising', 'ice_age', 'supervolcano'],
    settings: {
      characters: { secrets: 2, randomness: 'chaotic' },
      actionCards: { enabled: true, perPlayer: 2 },
      events: { enabled: true, chance: 0.3 },
    },
  },
  {
    id: 'scarcity',
    builtIn: true,
    catastrophes: ['ice_age', 'flood', 'asteroid'],
    settings: {
      baggage: { count: 1 },
      actionCards: { enabled: false },
      events: { enabled: true, chance: 0.5, deck: ['resource_loss', 'seats_lost', 'room_lost', 'new_resource'] },
    },
  },
  {
    id: 'experimental',
    builtIn: true,
    catastrophes: null,
    settings: {
      characters: { secrets: 2, randomness: 'chaotic', hiddenFromOwner: 1 },
      baggage: { count: 'random', allowTrade: true, allowSteal: true },
      actionCards: { enabled: true, perPlayer: 4, maxUsesPerRound: 2 },
      events: { enabled: true, chance: 0.6 },
      voting: { mode: 'multi', votesPerPlayer: 2, allowChange: true },
      rounds: { revealPerRound: 2 },
    },
  },
];

const BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

function scenario(id) {
  return BY_ID.get(id) || BY_ID.get('classic');
}

function ids() {
  return SCENARIOS.map((s) => s.id);
}

// What the client and the admin panel are told about the scenarios.
function catalogue() {
  return SCENARIOS.map((s) => ({
    id: s.id,
    builtIn: !!s.builtIn,
    catastrophes: s.catastrophes,
    settings: s.settings,
  }));
}

module.exports = { SCENARIOS, scenario, ids, catalogue };
