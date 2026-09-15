// cards.js
// The components of Cosmic Encounter («Космический контакт»).
//
// The rulebook gives the deck sizes - 55 encounter cards, 6 reinforcements,
// 11 artifacts and 20 destiny cards - but not the values printed on each
// card. The composition below follows the published base game the Russian
// edition translates.

const COLORS = ['red', 'blue', 'yellow', 'green', 'purple'];

// [attack value, copies] - 39 attack cards.
const ATTACKS = [
  [0, 1], [1, 1], [4, 4], [5, 1], [6, 6], [7, 1], [8, 7], [9, 1], [10, 4],
  [11, 1], [12, 3], [13, 1], [14, 2], [15, 1], [20, 2], [23, 1], [30, 1], [40, 1],
];
const NEGOTIATES = 15;
const MORPHS = 1;

// [value, copies] - 6 reinforcement cards.
const REINFORCEMENTS = [[2, 2], [3, 3], [5, 1]];

// [artifact id, copies] - 11 artifact cards.
const ARTIFACTS = [
  ['cosmicZap', 2],
  ['cardZap', 2],
  ['mobiusTubes', 1],
  ['plague', 2],
  ['forceField', 1],
  ['emotionControl', 1],
  ['ionicGas', 1],
  ['quash', 1],
];

// The special destiny cards: the defender is whoever leads on this measure.
const SPECIAL_DESTINY = ['mostColonies', 'mostCards', 'mostWarp'];

const ENCOUNTER_TYPES = ['attack', 'negotiate', 'morph'];

function cosmicDeckList() {
  const out = [];
  ATTACKS.forEach(([value, copies]) => {
    for (let i = 0; i < copies; i += 1) out.push({ type: 'attack', value });
  });
  for (let i = 0; i < NEGOTIATES; i += 1) out.push({ type: 'negotiate' });
  for (let i = 0; i < MORPHS; i += 1) out.push({ type: 'morph' });
  REINFORCEMENTS.forEach(([value, copies]) => {
    for (let i = 0; i < copies; i += 1) out.push({ type: 'reinforcement', value });
  });
  ARTIFACTS.forEach(([artifact, copies]) => {
    for (let i = 0; i < copies; i += 1) out.push({ type: 'artifact', artifact });
  });
  return out;
}

// Three cards of each colour in play, both wilds and the special cards.
function destinyDeckList(colors) {
  const out = [];
  colors.forEach((color) => {
    for (let i = 0; i < 3; i += 1) out.push({ kind: 'color', color });
  });
  out.push({ kind: 'wild' }, { kind: 'wild' });
  SPECIAL_DESTINY.forEach((rule) => out.push({ kind: 'special', rule }));
  return out;
}

function isEncounter(def) {
  return !!def && ENCOUNTER_TYPES.includes(def.type);
}

module.exports = {
  COLORS,
  ATTACKS,
  NEGOTIATES,
  MORPHS,
  REINFORCEMENTS,
  ARTIFACTS,
  SPECIAL_DESTINY,
  ENCOUNTER_TYPES,
  cosmicDeckList,
  destinyDeckList,
  isEncounter,
};
