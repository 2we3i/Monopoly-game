// aliens.js
// The alien races and when each power applies. The rules for every power
// live in CosmicGame.js; this file is the catalogue the lobby, the race
// choice and the client explanations are built from.
//
//   roles    who may use it: 'main' (offense or defense), 'offense',
//            'involved' (main player or ally), 'any'
//   phases   the encounter phases the power belongs to
//   mandatory  the power applies whenever it can (no choice)
//   complexity  the green / yellow / red lamp of the alien sheet

const ALIENS = {
  macron: {
    id: 'macron', complexity: 'green', roles: 'involved', mandatory: true, phases: ['LAUNCH', 'ALLIANCE', 'REVEAL', 'RESOLUTION'],
  },
  parasite: {
    id: 'parasite', complexity: 'green', roles: 'any', mandatory: false, phases: ['ALLIANCE'],
  },
  clone: {
    id: 'clone', complexity: 'green', roles: 'main', mandatory: false, phases: ['RESOLUTION'],
  },
  zombie: {
    id: 'zombie', complexity: 'green', roles: 'involved', mandatory: true, phases: ['RESOLUTION'],
  },
  oracle: {
    id: 'oracle', complexity: 'green', roles: 'main', mandatory: false, phases: ['PLANNING'],
  },
  trader: {
    id: 'trader', complexity: 'green', roles: 'main', mandatory: false, phases: ['PLANNING'],
  },
  mind: {
    id: 'mind', complexity: 'yellow', roles: 'any', mandatory: false, phases: ['ALLIANCE'],
  },
  fido: {
    id: 'fido', complexity: 'yellow', roles: 'any', mandatory: false, phases: ['RESOLUTION'],
  },
  warrior: {
    id: 'warrior', complexity: 'yellow', roles: 'main', mandatory: true, phases: ['REVEAL', 'RESOLUTION'],
  },
  machine: {
    id: 'machine', complexity: 'yellow', roles: 'offense', mandatory: false, phases: ['RESOLUTION'],
  },
};

const ALIEN_IDS = Object.keys(ALIENS);

module.exports = { ALIENS, ALIEN_IDS };
