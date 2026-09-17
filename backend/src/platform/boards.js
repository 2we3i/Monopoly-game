// boards.js
// The Creator's board editor: edit any square of a Monopoly board (name,
// picture, description, price, rent, house cost, tax, kind of square), add
// a whole new board - copied from an existing one or generated at any size -
// and remove boards that were added. Each board is a Monopoly mode
// ("monopoly.<board id>") that can be switched on and off like any other.
//
// Saving validates the whole board first (boardLayouts.buildLayout), so a
// broken board is never installed. Games already running keep the board
// they started on.

const creatorDb = require('../db/creator');
const layouts = require('../game/boardLayouts');
const { TILE_TYPES } = require('../game/boardLayouts/tileTypes');
const { AccessError } = require('./access');

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,29}$/;

class BoardError extends AccessError {
  constructor(message) {
    super(message, 'BAD_BOARD');
  }
}

function install() {
  let rows = [];
  try {
    rows = creatorDb.listLayouts();
  } catch {
    rows = [];
  }
  return layouts.install(rows);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function summary(layout) {
  const row = creatorDb.getLayoutRow(layout.id);
  const counts = {};
  layout.board.forEach((t) => { counts[t.type] = (counts[t.type] || 0) + 1; });
  return {
    id: layout.id,
    modeId: `monopoly.${layout.id}`,
    label: layout.label,
    description: layout.description,
    sideLength: layout.sideLength,
    tileCount: layout.board.length,
    custom: !!layout.custom,
    baseId: layout.baseId || null,
    edited: !layout.custom && !!row,
    version: row?.version || 1,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
    counts,
    groups: Object.keys(layout.GROUPS),
    images: layout.board.filter((t) => t.image).length,
  };
}

function list() {
  return Object.values(layouts.LAYOUTS).map(summary);
}

function get(id) {
  const layout = layouts.LAYOUTS[id];
  if (!layout) throw new BoardError('Board not found.');
  return {
    ...summary(layout),
    board: clone(layout.board),
    cardRoleTiles: layout.cardRoleTiles,
    defaultBoard: layouts.BUILT_IN[id] ? clone(layouts.BUILT_IN[id].board) : null,
  };
}

function localized(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
  const out = { en: text(value.en), ru: text(value.ru) };
  if (!out.en && !out.ru) return fallback;
  return { en: out.en || out.ru, ru: out.ru || out.en };
}

function longText(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 400) : '');
  return { en: text(value.en), ru: text(value.ru) };
}

// Checks a full board and stores it. Returns { before, after } summaries.
function save(id, input, by) {
  const current = layouts.LAYOUTS[id];
  if (!current) throw new BoardError('Board not found.');
  const before = summary(current);
  const data = {
    label: localized(input.label, current.label),
    description: longText(input.description, current.description),
    sideLength: input.sideLength ? Number(input.sideLength) : current.sideLength,
    board: Array.isArray(input.board) ? input.board : current.board,
  };
  try {
    layouts.buildLayout({ id, ...data, cardRoleTiles: current.cardRoleTiles });
  } catch (err) {
    throw new BoardError(err.message);
  }
  creatorDb.saveLayout({
    id, baseId: current.baseId || null, custom: !!current.custom, data, by,
  });
  const problems = install();
  const problem = problems.find((p) => p.id === id);
  if (problem) throw new BoardError(problem.error);
  return { before, after: summary(layouts.LAYOUTS[id]) };
}

// One square. patch may change any field of the tile.
function saveTile(id, tileId, patch, by) {
  const current = layouts.LAYOUTS[id];
  if (!current) throw new BoardError('Board not found.');
  const index = Number(tileId);
  if (!Number.isInteger(index) || !current.board[index]) throw new BoardError('Square not found.');
  const board = clone(current.board);
  const before = board[index];
  board[index] = { ...before, ...patch, id: index };
  save(id, { board }, by);
  return { before, after: layouts.LAYOUTS[id].board[index] };
}

function resetTile(id, tileId, by) {
  const base = layouts.BUILT_IN[id];
  if (!base) throw new BoardError('Only a built-in board has a default to go back to.');
  const index = Number(tileId);
  if (!base.board[index]) throw new BoardError('Square not found.');
  const board = clone(layouts.LAYOUTS[id].board);
  const before = board[index];
  board[index] = clone(base.board[index]);
  save(id, { board }, by);
  return { before, after: board[index] };
}

// A generated board: corners, a station in the middle of each side, chance
// and chest cards, two utilities, a tax, and colour groups of three.
function generateBoard(sideLength) {
  const side = Number(sideLength);
  if (!Number.isInteger(side) || side < layouts.MIN_SIDE || side > layouts.MAX_SIDE) {
    throw new BoardError(`A side holds between ${layouts.MIN_SIDE} and ${layouts.MAX_SIDE} squares.`);
  }
  const corners = [
    { type: TILE_TYPES.GO, name: 'Start', nameRu: 'Старт' },
    { type: TILE_TYPES.JAIL, name: 'Jail', nameRu: 'Тюрьма' },
    { type: TILE_TYPES.FREE_PARKING, name: 'Free Parking', nameRu: 'Бесплатная парковка' },
    { type: TILE_TYPES.GO_TO_JAIL, name: 'Go To Jail', nameRu: 'В тюрьму' },
  ];
  const stations = [['North Station', 'Северный вокзал'], ['East Station', 'Восточный вокзал'], ['South Station', 'Южный вокзал'], ['West Station', 'Западный вокзал']];
  const board = [];
  let propertyIndex = 0;
  const mid = Math.floor(side / 2);
  for (let s = 0; s < 4; s += 1) {
    board.push({ ...corners[s] });
    for (let pos = 1; pos < side; pos += 1) {
      if (pos === mid) {
        board.push({
          type: TILE_TYPES.RAILROAD, name: stations[s][0], nameRu: stations[s][1], price: 200, rent: [25, 50, 100, 200],
        });
      } else if (pos === 2) {
        board.push(s % 2 === 0
          ? { type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' }
          : { type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' });
      } else if (pos === side - 2 && (s === 1 || s === 2)) {
        board.push(s === 1
          ? { type: TILE_TYPES.UTILITY, name: 'Power Plant', nameRu: 'Электростанция', price: 150 }
          : { type: TILE_TYPES.UTILITY, name: 'Water Works', nameRu: 'Водоканал', price: 150 });
      } else if (pos === side - 2 && s === 3) {
        board.push({
          type: TILE_TYPES.TAX, name: 'Luxury Tax', nameRu: 'Налог на роскошь', amount: 100,
        });
      } else {
        const group = layouts.GROUPS[Math.floor(propertyIndex / 3) % layouts.GROUPS.length];
        const price = 60 + propertyIndex * 20;
        const r = Math.max(2, Math.round(price * 0.08));
        propertyIndex += 1;
        board.push({
          type: TILE_TYPES.PROPERTY,
          name: `Street ${propertyIndex}`,
          nameRu: `Улица ${propertyIndex}`,
          group,
          price,
          houseCost: 50 * (s + 1),
          rent: [r, r * 5, r * 15, r * 40, r * 55, r * 70],
        });
      }
    }
  }
  return board.map((t, i) => ({ ...t, id: i }));
}

function create({
  id, label, description, baseId = null, sideLength = null,
}, by) {
  const newId = String(id || '').trim().toLowerCase();
  if (!ID_PATTERN.test(newId)) throw new BoardError('A board id is 3-30 characters: latin letters, digits and dashes.');
  if (layouts.LAYOUTS[newId]) throw new BoardError('A board with this id already exists.');
  const existing = creatorDb.getLayoutRow(newId);
  if (existing && !existing.deletedAt) throw new BoardError('A board with this id already exists.');
  let data;
  if (baseId) {
    const base = layouts.LAYOUTS[baseId];
    if (!base) throw new BoardError('The board to copy was not found.');
    data = {
      label: localized(label, { en: `${base.label.en} (copy)`, ru: `${base.label.ru} (копия)` }),
      description: longText(description, base.description),
      sideLength: base.sideLength,
      board: clone(base.board),
    };
  } else {
    const board = generateBoard(sideLength || 10);
    data = {
      label: localized(label, { en: newId, ru: newId }),
      description: longText(description, { en: '', ru: '' }),
      sideLength: Number(sideLength || 10),
      board,
    };
  }
  try {
    layouts.buildLayout({ id: newId, ...data });
  } catch (err) {
    throw new BoardError(err.message);
  }
  creatorDb.saveLayout({
    id: newId, baseId: baseId || null, custom: true, data, by,
  });
  install();
  return summary(layouts.LAYOUTS[newId]);
}

function remove(id) {
  const layout = layouts.LAYOUTS[id];
  if (!layout) throw new BoardError('Board not found.');
  if (!layout.custom) throw new BoardError('A built-in board cannot be deleted - reset it instead.');
  const before = summary(layout);
  creatorDb.deleteLayout(id);
  install();
  return before;
}

function reset(id) {
  if (!layouts.BUILT_IN[id]) throw new BoardError('Only a built-in board can be reset.');
  const before = summary(layouts.LAYOUTS[id]);
  creatorDb.deleteLayout(id);
  install();
  return { before, after: summary(layouts.LAYOUTS[id]) };
}

// Every picture used on a board, for the media library.
function images() {
  const out = [];
  Object.values(layouts.LAYOUTS).forEach((layout) => {
    layout.board.forEach((tile) => {
      if (tile.image) {
        out.push({
          layoutId: layout.id, tileId: tile.id, url: tile.image, name: tile.name, nameRu: tile.nameRu, type: tile.type,
        });
      }
    });
  });
  return out;
}

module.exports = {
  BoardError,
  install,
  list,
  get,
  save,
  saveTile,
  resetTile,
  create,
  remove,
  reset,
  generateBoard,
  images,
};
