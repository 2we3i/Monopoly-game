// Board.js
// Defines the 40-tile Monopoly-style board.
// Group names / colors are original (not Hasbro's) to avoid IP issues,
// but the mechanics mirror classic property-trading gameplay.

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

// Rent tables: [baseRent, rent1House, rent2House, rent3House, rent4House, rentHotel]
const BOARD = [
  { id: 0, type: TILE_TYPES.GO, name: 'Start' },
  { id: 1, type: TILE_TYPES.PROPERTY, name: 'Elm Street', group: 'brown', price: 60, houseCost: 50, rent: [2, 10, 30, 90, 160, 250] },
  { id: 2, type: TILE_TYPES.CHEST, name: 'Community Chest' },
  { id: 3, type: TILE_TYPES.PROPERTY, name: 'Oak Avenue', group: 'brown', price: 60, houseCost: 50, rent: [4, 20, 60, 180, 320, 450] },
  { id: 4, type: TILE_TYPES.TAX, name: 'Income Tax', amount: 200 },
  { id: 5, type: TILE_TYPES.RAILROAD, name: 'North Station', price: 200, rent: [25, 50, 100, 200] },
  { id: 6, type: TILE_TYPES.PROPERTY, name: 'Maple Road', group: 'lightblue', price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { id: 7, type: TILE_TYPES.CHANCE, name: 'Chance' },
  { id: 8, type: TILE_TYPES.PROPERTY, name: 'Birch Lane', group: 'lightblue', price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { id: 9, type: TILE_TYPES.PROPERTY, name: 'Cedar Court', group: 'lightblue', price: 120, houseCost: 50, rent: [8, 40, 100, 300, 450, 600] },
  { id: 10, type: TILE_TYPES.JAIL, name: 'Jail / Just Visiting' },
  { id: 11, type: TILE_TYPES.PROPERTY, name: 'Willow Way', group: 'pink', price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { id: 12, type: TILE_TYPES.UTILITY, name: 'Power Plant', price: 150 },
  { id: 13, type: TILE_TYPES.PROPERTY, name: 'Aspen Street', group: 'pink', price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { id: 14, type: TILE_TYPES.PROPERTY, name: 'Poplar Place', group: 'pink', price: 160, houseCost: 100, rent: [12, 60, 180, 500, 700, 900] },
  { id: 15, type: TILE_TYPES.RAILROAD, name: 'East Station', price: 200, rent: [25, 50, 100, 200] },
  { id: 16, type: TILE_TYPES.PROPERTY, name: 'Chestnut Ave', group: 'orange', price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { id: 17, type: TILE_TYPES.CHEST, name: 'Community Chest' },
  { id: 18, type: TILE_TYPES.PROPERTY, name: 'Sycamore St', group: 'orange', price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { id: 19, type: TILE_TYPES.PROPERTY, name: 'Magnolia Blvd', group: 'orange', price: 200, houseCost: 100, rent: [16, 80, 220, 600, 800, 1000] },
  { id: 20, type: TILE_TYPES.FREE_PARKING, name: 'Free Parking' },
  { id: 21, type: TILE_TYPES.PROPERTY, name: 'Redwood Rd', group: 'red', price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 22, type: TILE_TYPES.CHANCE, name: 'Chance' },
  { id: 23, type: TILE_TYPES.PROPERTY, name: 'Sequoia St', group: 'red', price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 24, type: TILE_TYPES.PROPERTY, name: 'Cypress Ave', group: 'red', price: 240, houseCost: 150, rent: [20, 100, 300, 750, 925, 1100] },
  { id: 25, type: TILE_TYPES.RAILROAD, name: 'South Station', price: 200, rent: [25, 50, 100, 200] },
  { id: 26, type: TILE_TYPES.PROPERTY, name: 'Palm Drive', group: 'yellow', price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 27, type: TILE_TYPES.PROPERTY, name: 'Juniper Way', group: 'yellow', price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 28, type: TILE_TYPES.UTILITY, name: 'Water Works', price: 150 },
  { id: 29, type: TILE_TYPES.PROPERTY, name: 'Spruce Circle', group: 'yellow', price: 280, houseCost: 150, rent: [24, 120, 360, 850, 1025, 1200] },
  { id: 30, type: TILE_TYPES.GO_TO_JAIL, name: 'Go To Jail' },
  { id: 31, type: TILE_TYPES.PROPERTY, name: 'Hemlock Ave', group: 'green', price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 32, type: TILE_TYPES.PROPERTY, name: 'Fir Street', group: 'green', price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 33, type: TILE_TYPES.CHEST, name: 'Community Chest' },
  { id: 34, type: TILE_TYPES.PROPERTY, name: 'Larch Blvd', group: 'green', price: 320, houseCost: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
  { id: 35, type: TILE_TYPES.RAILROAD, name: 'West Station', price: 200, rent: [25, 50, 100, 200] },
  { id: 36, type: TILE_TYPES.CHANCE, name: 'Chance' },
  { id: 37, type: TILE_TYPES.PROPERTY, name: 'Aurora Ave', group: 'blue', price: 350, houseCost: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
  { id: 38, type: TILE_TYPES.TAX, name: 'Luxury Tax', amount: 100 },
  { id: 39, type: TILE_TYPES.PROPERTY, name: 'Meridian Point', group: 'blue', price: 400, houseCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
];

// Group -> list of tile ids, used to check monopolies
const GROUPS = {};
BOARD.forEach((tile) => {
  if (tile.type === TILE_TYPES.PROPERTY) {
    if (!GROUPS[tile.group]) GROUPS[tile.group] = [];
    GROUPS[tile.group].push(tile.id);
  }
});

const RAILROAD_IDS = BOARD.filter((t) => t.type === TILE_TYPES.RAILROAD).map((t) => t.id);
const UTILITY_IDS = BOARD.filter((t) => t.type === TILE_TYPES.UTILITY).map((t) => t.id);

function getTile(id) {
  return BOARD[id];
}

module.exports = { BOARD, TILE_TYPES, GROUPS, RAILROAD_IDS, UTILITY_IDS, getTile };
