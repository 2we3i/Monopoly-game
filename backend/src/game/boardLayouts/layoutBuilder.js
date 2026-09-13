// layoutBuilder.js
// Shared helper that turns a description of 4 board edges into a full,
// correctly-ordered perimeter board array, plus derived lookup tables.
//
// Tile id / orientation convention (MUST match the frontend's
// tileGridPosition()): id 0 is the bottom-right corner (GO), increasing
// counter-clockwise: bottom row right-to-left, left column bottom-to-top,
// top row left-to-right, right column top-to-bottom.

const { TILE_TYPES } = require('./tileTypes');

function buildPerimeterBoard(edgeSpecs, sideLength) {
  if (edgeSpecs.length !== 4) {
    throw new Error(`buildPerimeterBoard requires exactly 4 edges, got ${edgeSpecs.length}`);
  }
  edgeSpecs.forEach((edge, i) => {
    if (edge.length !== sideLength) {
      throw new Error(`Edge ${i} has ${edge.length} slots, expected sideLength=${sideLength}`);
    }
  });

  const board = [];
  let id = 0;
  edgeSpecs.forEach((edge) => {
    edge.forEach((spec) => {
      board.push({ ...spec, id });
      id += 1;
    });
  });
  return board;
}

function deriveBoardIndexes(board) {
  const GROUPS = {};
  const RAILROAD_IDS = [];
  const UTILITY_IDS = [];

  board.forEach((tile) => {
    if (tile.type === TILE_TYPES.PROPERTY) {
      if (!GROUPS[tile.group]) GROUPS[tile.group] = [];
      GROUPS[tile.group].push(tile.id);
    } else if (tile.type === TILE_TYPES.RAILROAD) {
      RAILROAD_IDS.push(tile.id);
    } else if (tile.type === TILE_TYPES.UTILITY) {
      UTILITY_IDS.push(tile.id);
    }
  });

  const jailTile = board.find((t) => t.type === TILE_TYPES.JAIL);
  const goToJailTile = board.find((t) => t.type === TILE_TYPES.GO_TO_JAIL);
  if (!jailTile) throw new Error('Board has no JAIL tile');
  if (!goToJailTile) throw new Error('Board has no GO_TO_JAIL tile');

  return {
    GROUPS,
    RAILROAD_IDS,
    UTILITY_IDS,
    JAIL_TILE: jailTile.id,
    GO_TO_JAIL_TILE: goToJailTile.id,
  };
}

module.exports = { buildPerimeterBoard, deriveBoardIndexes };
