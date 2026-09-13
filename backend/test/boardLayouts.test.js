// Structural validation for every board layout.

const { TILE_TYPES } = require('../src/game/boardLayouts/tileTypes');
const layouts = require('../src/game/boardLayouts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function validateLayout(layout) {
  const { board, sideLength, id } = layout;
  const prefix = `[${id}]`;

  assert(board.length === 4 * sideLength, `${prefix} board.length (${board.length}) !== 4*sideLength (${4 * sideLength})`);

  board.forEach((tile, i) => {
    assert(tile.id === i, `${prefix} tile at index ${i} has id ${tile.id}`);
    assert(!!tile.type, `${prefix} tile ${i} missing type`);
    assert(!!tile.name, `${prefix} tile ${i} missing name`);
    assert(!!tile.nameRu, `${prefix} tile ${i} missing nameRu`);
  });

  const cornerIds = [0, sideLength, 2 * sideLength, 3 * sideLength];
  const expectedCornerTypes = [TILE_TYPES.GO, TILE_TYPES.JAIL, TILE_TYPES.FREE_PARKING, TILE_TYPES.GO_TO_JAIL];
  cornerIds.forEach((cid, i) => {
    assert(board[cid].type === expectedCornerTypes[i], `${prefix} corner ${i} at tile ${cid} should be ${expectedCornerTypes[i]}, got ${board[cid].type}`);
  });

  const properties = board.filter((t) => t.type === TILE_TYPES.PROPERTY);
  properties.forEach((tile) => {
    assert(!!tile.group, `${prefix} property "${tile.name}" missing group`);
    assert(typeof tile.price === 'number' && tile.price > 0, `${prefix} property "${tile.name}" bad price: ${tile.price}`);
    assert(typeof tile.houseCost === 'number' && tile.houseCost > 0, `${prefix} property "${tile.name}" bad houseCost: ${tile.houseCost}`);
    assert(Array.isArray(tile.rent) && tile.rent.length === 6, `${prefix} property "${tile.name}" rent table wrong length: ${JSON.stringify(tile.rent)}`);
    for (let j = 1; j < tile.rent.length; j++) {
      assert(tile.rent[j] > tile.rent[j - 1], `${prefix} property "${tile.name}" rent not strictly increasing at index ${j}: ${JSON.stringify(tile.rent)}`);
    }
  });

  const groupCounts = {};
  properties.forEach((t) => { groupCounts[t.group] = (groupCounts[t.group] || 0) + 1; });
  const sizes = Object.values(groupCounts);
  const maxSize = Math.max(...sizes);
  const minSize = Math.min(...sizes);
  assert(maxSize - minSize <= 1, `${prefix} color groups vary by more than 1 tile: ${JSON.stringify(groupCounts)}`);

  const propNames = properties.map((t) => t.name);
  const dupeNames = propNames.filter((n, i) => propNames.indexOf(n) !== i);
  assert(dupeNames.length === 0, `${prefix} duplicate property names: ${JSON.stringify([...new Set(dupeNames)])}`);
  const propNamesRu = properties.map((t) => t.nameRu);
  const dupeNamesRu = propNamesRu.filter((n, i) => propNamesRu.indexOf(n) !== i);
  assert(dupeNamesRu.length === 0, `${prefix} duplicate Russian property names: ${JSON.stringify([...new Set(dupeNamesRu)])}`);

  board.filter((t) => t.type === TILE_TYPES.RAILROAD).forEach((tile) => {
    assert(Array.isArray(tile.rent) && tile.rent.length === 4, `${prefix} railroad "${tile.name}" rent table wrong length: ${JSON.stringify(tile.rent)}`);
    assert(typeof tile.price === 'number' && tile.price > 0, `${prefix} railroad "${tile.name}" bad price`);
  });
  board.filter((t) => t.type === TILE_TYPES.UTILITY).forEach((tile) => {
    assert(typeof tile.price === 'number' && tile.price > 0, `${prefix} utility "${tile.name}" bad price`);
  });
  board.filter((t) => t.type === TILE_TYPES.TAX).forEach((tile) => {
    assert(typeof tile.amount === 'number' && tile.amount > 0, `${prefix} tax "${tile.name}" bad amount: ${tile.amount}`);
  });

  assert(board.some((t) => t.type === TILE_TYPES.CHANCE), `${prefix} no Chance tiles on the board`);
  assert(board.some((t) => t.type === TILE_TYPES.CHEST), `${prefix} no Community Chest tiles on the board`);

  Object.entries(layout.cardRoleTiles).forEach(([role, tileId]) => {
    assert(tileId >= 0 && tileId < board.length, `${prefix} card role "${role}" points at out-of-bounds tile ${tileId}`);
  });

  console.log(`✓ ${id}: ${board.length} tiles, ${properties.length} properties across ${Object.keys(groupCounts).length} groups (${minSize}-${maxSize} tiles each), ${board.filter((t) => t.type === TILE_TYPES.RAILROAD).length} railroads, ${board.filter((t) => t.type === TILE_TYPES.UTILITY).length} utilities - all checks passed`);
}

function main() {
  const layoutIds = Object.keys(layouts.LAYOUTS);
  assert(layoutIds.length >= 2, `expected at least 2 registered layouts, got ${layoutIds.length}`);
  layoutIds.forEach((id) => validateLayout(layouts.LAYOUTS[id]));

  layoutIds.forEach((id) => {
    const layout = layouts.getLayout(id);
    assert(layout && layout.id === id, `getLayout("${id}") did not return the matching layout`);
  });
  let threw = false;
  try {
    layouts.getLayout('this-mode-does-not-exist');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'getLayout() with an unknown mode id should throw, not silently return something');
  console.log('✓ registry: getLayout() resolves every registered id and rejects unknown ones');

  console.log('\n=== BOARD LAYOUT STRUCTURAL TESTS PASSED ===');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
