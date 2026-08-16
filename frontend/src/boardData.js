// boardData.js
// Client-side mirror of the backend's board layout, for rendering only.
// The server is the sole source of truth for game logic; this file never
// computes rent, ownership, or legality - it only maps tile ids to display
// info (name, color, price) so the board can be drawn.

export const TILE_TYPES = {
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

export const BOARD = [
  { id: 0, type: TILE_TYPES.GO, name: 'Start', nameRu: 'Старт' },
  { id: 1, type: TILE_TYPES.PROPERTY, name: 'Elm Street', nameRu: 'улица Вязов', group: 'brown', price: 60, houseCost: 50, rent: [2, 10, 30, 90, 160, 250] },
  { id: 2, type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' },
  { id: 3, type: TILE_TYPES.PROPERTY, name: 'Oak Avenue', nameRu: 'проспект Дубовый', group: 'brown', price: 60, houseCost: 50, rent: [4, 20, 60, 180, 320, 450] },
  { id: 4, type: TILE_TYPES.TAX, name: 'Income Tax', nameRu: 'Подоходный налог', amount: 200 },
  { id: 5, type: TILE_TYPES.RAILROAD, name: 'North Station', nameRu: 'Северный вокзал', price: 200, rent: [25, 50, 100, 200] },
  { id: 6, type: TILE_TYPES.PROPERTY, name: 'Maple Road', nameRu: 'дорога Кленовая', group: 'lightblue', price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { id: 7, type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' },
  { id: 8, type: TILE_TYPES.PROPERTY, name: 'Birch Lane', nameRu: 'переулок Берёзовый', group: 'lightblue', price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { id: 9, type: TILE_TYPES.PROPERTY, name: 'Cedar Court', nameRu: 'тупик Кедровый', group: 'lightblue', price: 120, houseCost: 50, rent: [8, 40, 100, 300, 450, 600] },
  { id: 10, type: TILE_TYPES.JAIL, name: 'Jail', nameRu: 'Тюрьма' },
  { id: 11, type: TILE_TYPES.PROPERTY, name: 'Willow Way', nameRu: 'аллея Ивовая', group: 'pink', price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { id: 12, type: TILE_TYPES.UTILITY, name: 'Power Plant', nameRu: 'Электростанция', price: 150 },
  { id: 13, type: TILE_TYPES.PROPERTY, name: 'Aspen Street', nameRu: 'улица Осиновая', group: 'pink', price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { id: 14, type: TILE_TYPES.PROPERTY, name: 'Poplar Place', nameRu: 'площадь Тополиная', group: 'pink', price: 160, houseCost: 100, rent: [12, 60, 180, 500, 700, 900] },
  { id: 15, type: TILE_TYPES.RAILROAD, name: 'East Station', nameRu: 'Восточный вокзал', price: 200, rent: [25, 50, 100, 200] },
  { id: 16, type: TILE_TYPES.PROPERTY, name: 'Chestnut Ave', nameRu: 'проспект Каштановый', group: 'orange', price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { id: 17, type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' },
  { id: 18, type: TILE_TYPES.PROPERTY, name: 'Sycamore St', nameRu: 'улица Платановая', group: 'orange', price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { id: 19, type: TILE_TYPES.PROPERTY, name: 'Magnolia Blvd', nameRu: 'бульвар Магнолий', group: 'orange', price: 200, houseCost: 100, rent: [16, 80, 220, 600, 800, 1000] },
  { id: 20, type: TILE_TYPES.FREE_PARKING, name: 'Free Parking', nameRu: 'Бесплатная парковка' },
  { id: 21, type: TILE_TYPES.PROPERTY, name: 'Redwood Rd', nameRu: 'дорога Секвойная', group: 'red', price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 22, type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' },
  { id: 23, type: TILE_TYPES.PROPERTY, name: 'Sequoia St', nameRu: 'улица Секвойя', group: 'red', price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 24, type: TILE_TYPES.PROPERTY, name: 'Cypress Ave', nameRu: 'проспект Кипарисовый', group: 'red', price: 240, houseCost: 150, rent: [20, 100, 300, 750, 925, 1100] },
  { id: 25, type: TILE_TYPES.RAILROAD, name: 'South Station', nameRu: 'Южный вокзал', price: 200, rent: [25, 50, 100, 200] },
  { id: 26, type: TILE_TYPES.PROPERTY, name: 'Palm Drive', nameRu: 'проезд Пальмовый', group: 'yellow', price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 27, type: TILE_TYPES.PROPERTY, name: 'Juniper Way', nameRu: 'аллея Можжевеловая', group: 'yellow', price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 28, type: TILE_TYPES.UTILITY, name: 'Water Works', nameRu: 'Водоканал', price: 150 },
  { id: 29, type: TILE_TYPES.PROPERTY, name: 'Spruce Circle', nameRu: 'площадь Еловая', group: 'yellow', price: 280, houseCost: 150, rent: [24, 120, 360, 850, 1025, 1200] },
  { id: 30, type: TILE_TYPES.GO_TO_JAIL, name: 'Go To Jail', nameRu: 'В тюрьму' },
  { id: 31, type: TILE_TYPES.PROPERTY, name: 'Hemlock Ave', nameRu: 'проспект Тсуговый', group: 'green', price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 32, type: TILE_TYPES.PROPERTY, name: 'Fir Street', nameRu: 'улица Пихтовая', group: 'green', price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 33, type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' },
  { id: 34, type: TILE_TYPES.PROPERTY, name: 'Larch Blvd', nameRu: 'бульвар Лиственничный', group: 'green', price: 320, houseCost: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
  { id: 35, type: TILE_TYPES.RAILROAD, name: 'West Station', nameRu: 'Западный вокзал', price: 200, rent: [25, 50, 100, 200] },
  { id: 36, type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' },
  { id: 37, type: TILE_TYPES.PROPERTY, name: 'Aurora Ave', nameRu: 'проспект Аврора', group: 'blue', price: 350, houseCost: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
  { id: 38, type: TILE_TYPES.TAX, name: 'Luxury Tax', nameRu: 'Налог на роскошь', amount: 100 },
  { id: 39, type: TILE_TYPES.PROPERTY, name: 'Meridian Point', nameRu: 'Меридиан-Пойнт', group: 'blue', price: 400, houseCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
];

// Returns the tile's display name in the given language, falling back to
// English if a translation is somehow missing (defensive - every tile
// above does have a nameRu, but this keeps a bad edit from ever rendering
// `undefined` on screen).
export function getTileName(tile, language) {
  if (!tile) return '';
  if (language === 'ru' && tile.nameRu) return tile.nameRu;
  return tile.name;
}

export const GROUP_COLORS = {
  brown: '#7a5230',
  lightblue: '#a3d0e8',
  pink: '#d888b0',
  orange: '#e08a3c',
  red: '#c4453a',
  yellow: '#e8cf4a',
  green: '#3f9463',
  blue: '#3a6ea8',
};

export function getTile(id) {
  return BOARD[id];
}

// Board tiles arranged around a square: this returns { row, col } in an
// 11x11 css-grid for a given tile id (0 = bottom-right corner GO, going
// counter-clockwise, matching classic board orientation).
export function tileGridPosition(id) {
  if (id <= 10) return { row: 11, col: 11 - id }; // bottom row, right-to-left
  if (id <= 20) return { row: 11 - (id - 10), col: 1 }; // left column, bottom-to-top
  if (id <= 30) return { row: 1, col: 1 + (id - 20) }; // top row, left-to-right
  return { row: 1 + (id - 30), col: 11 }; // right column, top-to-bottom
}
