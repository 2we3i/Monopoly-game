// index.js (boardLayouts)
// The registry every other part of the backend goes through to get a
// board.

const classic = require('./classic');
const metropolis = require('./metropolis');

const LAYOUTS = {
  [classic.id]: classic,
  [metropolis.id]: metropolis,
};

const LAYOUT_OPTIONS = Object.values(LAYOUTS).map((layout) => ({
  id: layout.id,
  label: layout.label,
  description: layout.description,
  tileCount: layout.board.length,
}));

const DEFAULT_LAYOUT_ID = classic.id;

function getLayout(modeId) {
  const layout = LAYOUTS[modeId];
  if (!layout) {
    throw new Error(`Unknown game mode "${modeId}". Valid modes: ${Object.keys(LAYOUTS).join(', ')}`);
  }
  return layout;
}

module.exports = { LAYOUTS, LAYOUT_OPTIONS, DEFAULT_LAYOUT_ID, getLayout };
