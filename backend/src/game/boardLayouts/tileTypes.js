// tileTypes.js
// Tile-type enum shared by every board layout. Extracted to its own module
// because every layout, the layout builder, and GameManager's tile-
// resolution switch all need the exact same set of constants regardless
// of which board is active.

const TILE_TYPES = {
  GO: 'GO',
  PROPERTY: 'PROPERTY',
  RAILROAD: 'RAILROAD',
  UTILITY: 'UTILITY',
  TAX: 'TAX',
  CHANCE: 'CHANCE',
  CHEST: 'CHEST',
  JAIL: 'JAIL',
  GO_TO_JAIL: 'GO_TO_JAIL',
  FREE_PARKING: 'FREE_PARKING',
};

module.exports = { TILE_TYPES };
