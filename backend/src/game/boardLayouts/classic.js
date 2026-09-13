// classic.js
// The original 40-tile board, hand-authored.

const { TILE_TYPES } = require('./tileTypes');
const { buildPerimeterBoard, deriveBoardIndexes } = require('./layoutBuilder');

const SIDE_LENGTH = 10;

const EDGES = [
  [
    { type: TILE_TYPES.GO, name: 'Start', nameRu: 'Старт' },
    { type: TILE_TYPES.PROPERTY, name: 'Elm Street', nameRu: 'улица Вязов', group: 'brown', price: 60, houseCost: 50, rent: [2, 10, 30, 90, 160, 250] },
    { type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' },
    { type: TILE_TYPES.PROPERTY, name: 'Oak Avenue', nameRu: 'проспект Дубовый', group: 'brown', price: 60, houseCost: 50, rent: [4, 20, 60, 180, 320, 450] },
    { type: TILE_TYPES.TAX, name: 'Income Tax', nameRu: 'Подоходный налог', amount: 200 },
    { type: TILE_TYPES.RAILROAD, name: 'North Station', nameRu: 'Северный вокзал', price: 200, rent: [25, 50, 100, 200] },
    { type: TILE_TYPES.PROPERTY, name: 'Maple Road', nameRu: 'дорога Кленовая', group: 'lightblue', price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
    { type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' },
    { type: TILE_TYPES.PROPERTY, name: 'Birch Lane', nameRu: 'переулок Берёзовый', group: 'lightblue', price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
    { type: TILE_TYPES.PROPERTY, name: 'Cedar Court', nameRu: 'тупик Кедровый', group: 'lightblue', price: 120, houseCost: 50, rent: [8, 40, 100, 300, 450, 600] },
  ],
  [
    { type: TILE_TYPES.JAIL, name: 'Jail', nameRu: 'Тюрьма' },
    { type: TILE_TYPES.PROPERTY, name: 'Willow Way', nameRu: 'аллея Ивовая', group: 'pink', price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
    { type: TILE_TYPES.UTILITY, name: 'Power Plant', nameRu: 'Электростанция', price: 150 },
    { type: TILE_TYPES.PROPERTY, name: 'Aspen Street', nameRu: 'улица Осиновая', group: 'pink', price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
    { type: TILE_TYPES.PROPERTY, name: 'Poplar Place', nameRu: 'площадь Тополиная', group: 'pink', price: 160, houseCost: 100, rent: [12, 60, 180, 500, 700, 900] },
    { type: TILE_TYPES.RAILROAD, name: 'East Station', nameRu: 'Восточный вокзал', price: 200, rent: [25, 50, 100, 200] },
    { type: TILE_TYPES.PROPERTY, name: 'Chestnut Ave', nameRu: 'проспект Каштановый', group: 'orange', price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
    { type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' },
    { type: TILE_TYPES.PROPERTY, name: 'Sycamore St', nameRu: 'улица Платановая', group: 'orange', price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
    { type: TILE_TYPES.PROPERTY, name: 'Magnolia Blvd', nameRu: 'бульвар Магнолий', group: 'orange', price: 200, houseCost: 100, rent: [16, 80, 220, 600, 800, 1000] },
  ],
  [
    { type: TILE_TYPES.FREE_PARKING, name: 'Free Parking', nameRu: 'Бесплатная парковка' },
    { type: TILE_TYPES.PROPERTY, name: 'Redwood Rd', nameRu: 'дорога Секвойная', group: 'red', price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
    { type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' },
    { type: TILE_TYPES.PROPERTY, name: 'Sequoia St', nameRu: 'улица Секвойя', group: 'red', price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
    { type: TILE_TYPES.PROPERTY, name: 'Cypress Ave', nameRu: 'проспект Кипарисовый', group: 'red', price: 240, houseCost: 150, rent: [20, 100, 300, 750, 925, 1100] },
    { type: TILE_TYPES.RAILROAD, name: 'South Station', nameRu: 'Южный вокзал', price: 200, rent: [25, 50, 100, 200] },
    { type: TILE_TYPES.PROPERTY, name: 'Palm Drive', nameRu: 'проезд Пальмовый', group: 'yellow', price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
    { type: TILE_TYPES.PROPERTY, name: 'Juniper Way', nameRu: 'аллея Можжевеловая', group: 'yellow', price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
    { type: TILE_TYPES.UTILITY, name: 'Water Works', nameRu: 'Водоканал', price: 150 },
    { type: TILE_TYPES.PROPERTY, name: 'Spruce Circle', nameRu: 'площадь Еловая', group: 'yellow', price: 280, houseCost: 150, rent: [24, 120, 360, 850, 1025, 1200] },
  ],
  [
    { type: TILE_TYPES.GO_TO_JAIL, name: 'Go To Jail', nameRu: 'В тюрьму' },
    { type: TILE_TYPES.PROPERTY, name: 'Hemlock Ave', nameRu: 'проспект Тсуговый', group: 'green', price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
    { type: TILE_TYPES.PROPERTY, name: 'Fir Street', nameRu: 'улица Пихтовая', group: 'green', price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
    { type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' },
    { type: TILE_TYPES.PROPERTY, name: 'Larch Blvd', nameRu: 'бульвар Лиственничный', group: 'green', price: 320, houseCost: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
    { type: TILE_TYPES.RAILROAD, name: 'West Station', nameRu: 'Западный вокзал', price: 200, rent: [25, 50, 100, 200] },
    { type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' },
    { type: TILE_TYPES.PROPERTY, name: 'Aurora Ave', nameRu: 'проспект Аврора', group: 'blue', price: 350, houseCost: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
    { type: TILE_TYPES.TAX, name: 'Luxury Tax', nameRu: 'Налог на роскошь', amount: 100 },
    { type: TILE_TYPES.PROPERTY, name: 'Meridian Point', nameRu: 'Меридиан-Пойнт', group: 'blue', price: 400, houseCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
  ],
];

const BOARD = buildPerimeterBoard(EDGES, SIDE_LENGTH);

const CARD_ROLE_TILES = {
  GO: 0,
  JAIL: 10,
  FAR_PROPERTY_1: 39,
  FAR_PROPERTY_2: 37,
  MID_RAILROAD: 35,
};

const indexes = deriveBoardIndexes(BOARD);

module.exports = {
  id: 'classic',
  label: { en: 'Classic', ru: 'Классика' },
  description: {
    en: 'The original 40-tile board. Quick to learn, quick to play.',
    ru: 'Оригинальная доска на 40 клеток. Легко освоить, быстро сыграть.',
  },
  sideLength: SIDE_LENGTH,
  board: BOARD,
  cardRoleTiles: CARD_ROLE_TILES,
  ...indexes,
};
