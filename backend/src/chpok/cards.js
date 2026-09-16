// cards.js
// The two decks of a ЧПОК box, for the server.
//
// The card data itself lives in cards.json, which the browser imports
// through the @chpok alias (see frontend/vite.config.js): one deck, one
// copy, whether it is being dealt by a server for an online room or by the
// browser for a group around one table.

const data = require('./cards.json');

const LETTERS = data.letters;
const THEMES_1 = data.themes1;
const THEMES_2 = data.themes2;

// Which themes a room plays with. 'both' is the second box's own rule:
// the two boxes are compatible and can be shuffled together.
function themesFor(box) {
  if (box === 'chpok2') return [...THEMES_2];
  if (box === 'both') return [...THEMES_1, ...THEMES_2];
  return [...THEMES_1];
}

module.exports = {
  LETTERS, THEMES_1, THEMES_2, themesFor, BOXES: ['chpok', 'chpok2', 'both'],
};
