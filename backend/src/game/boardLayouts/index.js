// index.js (boardLayouts)
// The registry every other part of the backend goes through to get a
// board.
//
// The boards in this folder are the defaults. The Creator's panel can edit
// a built-in board (names, pictures, prices...) or add a whole new board;
// those edits are installed here at startup and after every save
// (platform/boards.js). LAYOUTS and LAYOUT_OPTIONS are updated in place, so
// every module that already holds them sees the change.
//
// A running game never changes under its players: GameState keeps the
// layout object it was created with (and restores the board it saved), and
// installing new edits builds new objects instead of mutating old ones.

const classic = require('./classic');
const metropolis = require('./metropolis');
const { TILE_TYPES } = require('./tileTypes');
const { deriveBoardIndexes } = require('./layoutBuilder');

const BUILT_IN = {
  [classic.id]: classic,
  [metropolis.id]: metropolis,
};

const LAYOUTS = { ...BUILT_IN };

const LAYOUT_OPTIONS = [];

const DEFAULT_LAYOUT_ID = classic.id;

const OWNABLE = [TILE_TYPES.PROPERTY, TILE_TYPES.RAILROAD, TILE_TYPES.UTILITY];
const CORNER_TYPES = [TILE_TYPES.GO, TILE_TYPES.JAIL, TILE_TYPES.FREE_PARKING, TILE_TYPES.GO_TO_JAIL];
const EDGE_TYPES = [TILE_TYPES.PROPERTY, TILE_TYPES.RAILROAD, TILE_TYPES.UTILITY, TILE_TYPES.TAX, TILE_TYPES.CHANCE, TILE_TYPES.CHEST];
// Colour groups the client knows how to paint (frontend/src/boardData.js).
const GROUPS = [
  'brown', 'copper', 'lightblue', 'teal', 'pink', 'magenta', 'orange', 'amber', 'red', 'crimson',
  'yellow', 'gold', 'green', 'emerald', 'blue', 'indigo', 'violet', 'rose', 'slate', 'obsidian',
];
const MIN_SIDE = 6;
const MAX_SIDE = 24;

class LayoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LayoutError';
  }
}

function refreshOptions() {
  const next = Object.values(LAYOUTS)
    .map((layout) => ({
      id: layout.id,
      label: layout.label,
      description: layout.description,
      tileCount: layout.board.length,
      ...(layout.custom ? { custom: true } : {}),
    }));
  LAYOUT_OPTIONS.splice(0, LAYOUT_OPTIONS.length, ...next);
}
refreshOptions();

const positiveInt = (v) => Number.isInteger(v) && v > 0;
const nonNegativeInt = (v) => Number.isInteger(v) && v >= 0;

// Keeps only the fields a tile of its type uses, with sane types, so a
// board saved from the panel can never carry junk into the rules engine.
function cleanTile(raw, id) {
  if (!raw || typeof raw !== 'object') throw new LayoutError(`Tile ${id} is missing.`);
  const type = String(raw.type || '');
  const text = (v, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const tile = {
    type,
    name: text(raw.name),
    nameRu: text(raw.nameRu) || text(raw.name),
  };
  if (!tile.name) throw new LayoutError(`Tile ${id} needs a name.`);
  const description = raw.description && typeof raw.description === 'object'
    ? { en: text(raw.description.en, 400), ru: text(raw.description.ru, 400) }
    : null;
  let image = null;
  if (typeof raw.image === 'string' && raw.image.trim()) {
    image = raw.image.trim().slice(0, 500);
    if (!/^(\/|https?:\/\/)/.test(image)) throw new LayoutError(`Tile ${id}: a picture must be a /path or an http(s) address.`);
  }
  if (type === TILE_TYPES.PROPERTY) {
    tile.group = String(raw.group || '');
    tile.price = Number(raw.price);
    tile.houseCost = Number(raw.houseCost);
    tile.rent = Array.isArray(raw.rent) ? raw.rent.map(Number) : [];
  } else if (type === TILE_TYPES.RAILROAD) {
    tile.price = Number(raw.price);
    tile.rent = Array.isArray(raw.rent) ? raw.rent.map(Number) : [];
  } else if (type === TILE_TYPES.UTILITY) {
    tile.price = Number(raw.price);
  } else if (type === TILE_TYPES.TAX) {
    tile.amount = Number(raw.amount);
  }
  if (description && (description.en || description.ru)) tile.description = description;
  if (image) tile.image = image;
  tile.id = id;
  return tile;
}

function validateTile(tile) {
  const where = `Tile ${tile.id} ("${tile.name}")`;
  if (tile.type === TILE_TYPES.PROPERTY) {
    if (!GROUPS.includes(tile.group)) throw new LayoutError(`${where}: unknown colour group "${tile.group}".`);
    if (!positiveInt(tile.price)) throw new LayoutError(`${where}: the price must be a positive whole number.`);
    if (!positiveInt(tile.houseCost)) throw new LayoutError(`${where}: the house cost must be a positive whole number.`);
    if (tile.rent.length !== 6 || !tile.rent.every(nonNegativeInt)) throw new LayoutError(`${where}: rent needs 6 whole numbers (no houses, 1-4 houses, hotel).`);
  }
  if (tile.type === TILE_TYPES.RAILROAD) {
    if (!positiveInt(tile.price)) throw new LayoutError(`${where}: the price must be a positive whole number.`);
    if (tile.rent.length !== 4 || !tile.rent.every(nonNegativeInt)) throw new LayoutError(`${where}: a station's rent needs 4 whole numbers (1-4 stations owned).`);
  }
  if (tile.type === TILE_TYPES.UTILITY && !positiveInt(tile.price)) throw new LayoutError(`${where}: the price must be a positive whole number.`);
  if (tile.type === TILE_TYPES.TAX && !nonNegativeInt(tile.amount)) throw new LayoutError(`${where}: the tax must be a whole number.`);
}

// The tiles cards send players to. Kept from the base board when they
// still point at a tile of the right kind, otherwise chosen again.
function cardRolesFor(board, sideLength, preferred = {}) {
  const fits = (id, types) => Number.isInteger(id) && board[id] && types.includes(board[id].type);
  const properties = board.filter((t) => t.type === TILE_TYPES.PROPERTY).map((t) => t.id);
  const railroads = board.filter((t) => t.type === TILE_TYPES.RAILROAD).map((t) => t.id);
  return {
    GO: 0,
    JAIL: sideLength,
    FAR_PROPERTY_1: fits(preferred.FAR_PROPERTY_1, [TILE_TYPES.PROPERTY]) ? preferred.FAR_PROPERTY_1 : properties[properties.length - 1],
    FAR_PROPERTY_2: fits(preferred.FAR_PROPERTY_2, [TILE_TYPES.PROPERTY]) ? preferred.FAR_PROPERTY_2 : properties[Math.max(0, properties.length - 2)],
    MID_RAILROAD: fits(preferred.MID_RAILROAD, [TILE_TYPES.RAILROAD]) ? preferred.MID_RAILROAD : railroads[Math.floor(railroads.length / 2)],
  };
}

// Turns a board description into a layout the rules engine can use, or
// throws a LayoutError that says what is wrong.
function buildLayout({
  id, label, description, sideLength, board, cardRoleTiles = null, custom = false, baseId = null, enabled = true, version = 1,
}) {
  const side = Number(sideLength);
  if (!Number.isInteger(side) || side < MIN_SIDE || side > MAX_SIDE) {
    throw new LayoutError(`A board side must hold between ${MIN_SIDE} and ${MAX_SIDE} tiles.`);
  }
  if (!Array.isArray(board) || board.length !== side * 4) {
    throw new LayoutError(`A board with ${side} tiles per side has exactly ${side * 4} tiles.`);
  }
  const tiles = board.map((raw, i) => cleanTile(raw, i));
  tiles.forEach((tile, i) => {
    const corner = i % side === 0;
    if (corner) {
      const expected = CORNER_TYPES[i / side];
      if (tile.type !== expected) throw new LayoutError(`Tile ${i} is a corner and must be ${expected}.`);
    } else if (!EDGE_TYPES.includes(tile.type)) {
      throw new LayoutError(`Tile ${i}: "${tile.type}" cannot be placed along an edge.`);
    }
    validateTile(tile);
  });
  const properties = tiles.filter((t) => t.type === TILE_TYPES.PROPERTY);
  if (properties.length < 2) throw new LayoutError('A board needs at least two properties.');
  if (!tiles.some((t) => t.type === TILE_TYPES.RAILROAD)) throw new LayoutError('A board needs at least one station (cards send players to one).');
  if (!tiles.some((t) => t.type === TILE_TYPES.UTILITY)) throw new LayoutError('A board needs at least one utility (cards send players to one).');

  const layout = {
    id,
    label: label || { en: id, ru: id },
    description: description || { en: '', ru: '' },
    sideLength: side,
    board: tiles,
    cardRoleTiles: cardRolesFor(tiles, side, cardRoleTiles || {}),
    ...deriveBoardIndexes(tiles),
    custom: !!custom,
    baseId,
    enabled: enabled !== false,
    version,
  };
  Object.values(layout.GROUPS).forEach((ids) => Object.freeze(ids));
  return layout;
}

function builtInLayout(id) {
  return BUILT_IN[id] || null;
}

// Replaces the installed edits: rows are { id, baseId, custom, data, version }
// where data is { label, description, sideLength, board, enabled }. A row
// that no longer builds is skipped (and reported), leaving the default.
function install(rows = []) {
  const problems = [];
  const next = { ...BUILT_IN };
  rows.forEach((row) => {
    if (!row || row.deletedAt) return;
    const base = BUILT_IN[row.baseId] || BUILT_IN[row.id] || classic;
    if (!row.custom && !BUILT_IN[row.id]) return;
    try {
      next[row.id] = buildLayout({
        id: row.id,
        label: row.data.label || base.label,
        description: row.data.description || base.description,
        sideLength: row.data.sideLength || base.sideLength,
        board: row.data.board || base.board,
        cardRoleTiles: row.data.sideLength && row.data.sideLength !== base.sideLength ? null : base.cardRoleTiles,
        custom: !!row.custom,
        baseId: row.baseId || null,
        enabled: row.data.enabled !== false,
        version: row.version || 1,
      });
    } catch (err) {
      problems.push({ id: row.id, error: err.message });
    }
  });
  Object.keys(LAYOUTS).forEach((key) => { if (!next[key]) delete LAYOUTS[key]; });
  Object.assign(LAYOUTS, next);
  refreshOptions();
  return problems;
}

function getLayout(modeId) {
  const layout = LAYOUTS[modeId];
  if (!layout) {
    throw new Error(`Unknown game mode "${modeId}". Valid modes: ${Object.keys(LAYOUTS).join(', ')}`);
  }
  return layout;
}

// The layout a restored game plays on: the board it saved, when that board
// still makes a valid layout, so an edit made while the game was running
// (or a board deleted since) never reaches it. Otherwise the current one.
function layoutForSavedGame(modeId, savedBoard, savedSideLength) {
  const current = LAYOUTS[modeId] || null;
  if (Array.isArray(savedBoard) && savedBoard.length) {
    const side = savedSideLength || current?.sideLength || savedBoard.length / 4;
    const base = current || BUILT_IN[modeId] || classic;
    try {
      return buildLayout({
        id: modeId,
        label: base.label,
        description: base.description,
        sideLength: side,
        board: savedBoard,
        cardRoleTiles: base.sideLength === side ? base.cardRoleTiles : null,
        custom: !!current?.custom,
        baseId: current?.baseId || null,
        version: current?.version || 1,
      });
    } catch {
      // fall through to the current board
    }
  }
  return getLayout(modeId);
}

module.exports = {
  LAYOUTS,
  LAYOUT_OPTIONS,
  DEFAULT_LAYOUT_ID,
  BUILT_IN,
  GROUPS,
  EDGE_TYPES,
  CORNER_TYPES,
  OWNABLE,
  MIN_SIDE,
  MAX_SIDE,
  LayoutError,
  getLayout,
  buildLayout,
  builtInLayout,
  install,
  layoutForSavedGame,
  cardRolesFor,
};
