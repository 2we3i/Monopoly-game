// metropolis.js
// "Metropolis" game mode: ~2.1x Classic's size (84 tiles vs 40). Verified
// by test/boardLayouts.test.js, which enumerates and checks every tile
// this file actually produces.

const { TILE_TYPES } = require('./tileTypes');
const { buildPerimeterBoard, deriveBoardIndexes } = require('./layoutBuilder');

const SIDE_LENGTH = 21;

const GROUP_SEQUENCE = [
  'copper', 'brown', 'lightblue', 'teal', 'pink', 'magenta',
  'orange', 'amber', 'red', 'crimson', 'yellow', 'gold',
  'green', 'emerald', 'blue', 'indigo',
  'violet', 'rose', 'slate', 'obsidian',
];

const TIER_TEMPLATES = [
  { price: 50, houseCost: 40, rent: [2, 8, 24, 72, 128, 200] },
  { price: 70, houseCost: 40, rent: [3, 12, 34, 100, 176, 260] },
  { price: 90, houseCost: 50, rent: [4, 16, 44, 128, 224, 320] },
  { price: 110, houseCost: 50, rent: [6, 22, 60, 176, 304, 420] },
  { price: 130, houseCost: 60, rent: [8, 28, 76, 220, 380, 520] },
  { price: 150, houseCost: 60, rent: [10, 34, 92, 260, 448, 600] },
  { price: 175, houseCost: 70, rent: [11, 38, 102, 300, 500, 660] },
  { price: 200, houseCost: 80, rent: [12, 42, 112, 340, 560, 720] },
  { price: 230, houseCost: 90, rent: [14, 48, 128, 380, 620, 800] },
  { price: 260, houseCost: 100, rent: [16, 54, 144, 420, 680, 880] },
  { price: 300, houseCost: 110, rent: [18, 62, 168, 480, 760, 980] },
  { price: 340, houseCost: 120, rent: [20, 70, 190, 540, 840, 1080] },
  { price: 380, houseCost: 130, rent: [23, 78, 212, 600, 920, 1180] },
  { price: 420, houseCost: 140, rent: [26, 88, 234, 660, 1000, 1280] },
  { price: 470, houseCost: 150, rent: [29, 98, 260, 730, 1100, 1400] },
  { price: 520, houseCost: 160, rent: [32, 108, 288, 800, 1200, 1520] },
  { price: 580, houseCost: 170, rent: [36, 120, 320, 880, 1320, 1660] },
  { price: 640, houseCost: 180, rent: [40, 132, 352, 960, 1440, 1800] },
  { price: 700, houseCost: 200, rent: [45, 150, 400, 1080, 1600, 2000] },
  { price: 800, houseCost: 220, rent: [50, 170, 450, 1200, 1800, 2200] },
];

const STREET_WORDS_EN = [
  'Harbor', 'Market', 'Union', 'Bridge', 'Garden', 'Highland', 'Riverside', 'Central',
  'Crescent', 'Terrace', 'Grand', 'Liberty', 'Summit', 'Vista', 'Meadow', 'Foundry',
  'Beacon', 'Anchor', 'Ivory', 'Cobalt', 'Amber', 'Granite', 'Marble', 'Cascade',
  'Orchard', 'Lantern', 'Compass', 'Wharf', 'Arbor', 'Crest', 'Hollow', 'Pinnacle',
  'Prairie', 'Sable', 'Sterling', 'Clover', 'Frontier', 'Horizon', 'Junction', 'Legacy',
  'Meridian', 'Overlook', 'Pinehurst', 'Ridgeway', 'Delta', 'Emberly', 'Fairview', 'Glenwood',
  'Aurora', 'Birchwood', 'Cliffside', 'Driftwood', 'Elmsworth', 'Foxglove', 'Greystone', 'Hawthorne',
  'Ironwood', 'Jasper', 'Kingsley', 'Larkspur',
];
const STREET_WORDS_RU = [
  'Гаванская', 'Рыночная', 'Союзная', 'Мостовая', 'Садовая', 'Нагорная', 'Набережная', 'Центральная',
  'Полумесяц', 'Террасная', 'Гранд', 'Свободы', 'Вершинная', 'Видовая', 'Луговая', 'Литейная',
  'Маячная', 'Якорная', 'Слоновая', 'Кобальтовая', 'Янтарная', 'Гранитная', 'Мраморная', 'Каскадная',
  'Садовническая', 'Фонарная', 'Компасная', 'Причальная', 'Беседочная', 'Гребневая', 'Лощинная', 'Пиковая',
  'Прерийная', 'Соболиная', 'Стерлинговая', 'Клеверная', 'Пограничная', 'Горизонтная', 'Развязочная', 'Наследия',
  'Меридианная', 'Обзорная', 'Сосновая', 'Хребтовая', 'Дельтовая', 'Эмберли', 'Панорамная', 'Гленвудская',
  'Северная Заря', 'Березовая', 'Скалистая', 'Плавниковая', 'Вязовая', 'Наперстянковая', 'Сероватая', 'Боярышниковая',
  'Железнолесная', 'Яшмовая', 'Кингсли', 'Живокостная',
];

if (STREET_WORDS_EN.length < 60 || STREET_WORDS_RU.length < 60) {
  throw new Error(`Metropolis needs at least 60 unique street names per language, got en=${STREET_WORDS_EN.length} ru=${STREET_WORDS_RU.length}`);
}

let streetCursor = 0;
function nextStreetName() {
  const en = STREET_WORDS_EN[streetCursor % STREET_WORDS_EN.length];
  const ru = STREET_WORDS_RU[streetCursor % STREET_WORDS_RU.length];
  streetCursor += 1;
  return { en: `${en} Street`, ru: `улица ${ru}` };
}

let tierCursor = 0;
let groupCursor = 0;
let groupTilesPlaced = 0;
const TILES_PER_GROUP = 3;

function nextProperty() {
  const tier = TIER_TEMPLATES[Math.min(tierCursor, TIER_TEMPLATES.length - 1)];
  const group = GROUP_SEQUENCE[groupCursor % GROUP_SEQUENCE.length];
  const name = nextStreetName();
  groupTilesPlaced += 1;
  if (groupTilesPlaced >= TILES_PER_GROUP) {
    groupTilesPlaced = 0;
    groupCursor += 1;
    tierCursor += 1;
  }
  return {
    type: TILE_TYPES.PROPERTY,
    name: name.en,
    nameRu: name.ru,
    group,
    price: tier.price,
    houseCost: tier.houseCost,
    rent: tier.rent,
  };
}

let railroadCursor = 0;
function nextRailroad() {
  railroadCursor += 1;
  return {
    type: TILE_TYPES.RAILROAD,
    name: `Transit Hub ${railroadCursor}`,
    nameRu: `Транспортный узел ${railroadCursor}`,
    price: 200,
    rent: [25, 50, 100, 200],
  };
}

const UTILITY_SPECS = [
  { name: 'Power Grid', nameRu: 'Энергосеть' },
  { name: 'Water Authority', nameRu: 'Водоканал' },
];
let utilityCursor = 0;
function nextUtility() {
  const spec = UTILITY_SPECS[utilityCursor % UTILITY_SPECS.length];
  utilityCursor += 1;
  return { type: TILE_TYPES.UTILITY, name: spec.name, nameRu: spec.nameRu, price: 150 };
}

function chance() {
  return { type: TILE_TYPES.CHANCE, name: 'Chance', nameRu: 'Шанс' };
}
function chest() {
  return { type: TILE_TYPES.CHEST, name: 'Community Chest', nameRu: 'Общественная казна' };
}
function tax(name, nameRu, amount) {
  return { type: TILE_TYPES.TAX, name, nameRu, amount };
}

function buildEdge(edgeIndex) {
  const slots = [];
  const cornerNames = ['GO', 'JAIL', 'FREE_PARKING', 'GO_TO_JAIL'];
  slots.push({ corner: cornerNames[edgeIndex] });

  const cardTileA = edgeIndex % 2 === 0 ? chance : chest;
  const cardTileB = edgeIndex % 2 === 0 ? chest : chance;
  const hasUtility = edgeIndex === 0 || edgeIndex === 2;

  slots.push(nextProperty(), nextProperty());
  slots.push(cardTileA());
  slots.push(nextProperty(), nextProperty());
  slots.push(nextRailroad());
  slots.push(nextProperty(), nextProperty());
  slots.push(hasUtility ? nextUtility() : cardTileB());
  slots.push(nextProperty(), nextProperty());
  slots.push(nextProperty());
  slots.push(nextProperty(), nextProperty());
  slots.push(cardTileA());
  slots.push(nextProperty(), nextProperty());
  const taxSpecs = [
    ['Income Tax', 'Подоходный налог', 200],
    ['Property Tax', 'Налог на имущество', 150],
    ['Luxury Tax', 'Налог на роскошь', 100],
    ['Toll Tax', 'Дорожный сбор', 120],
  ];
  const [tName, tNameRu, tAmount] = taxSpecs[edgeIndex];
  slots.push(tax(tName, tNameRu, tAmount));
  slots.push(nextProperty(), nextProperty());

  if (slots.length !== SIDE_LENGTH) {
    throw new Error(`Metropolis edge ${edgeIndex} generated ${slots.length} slots, expected ${SIDE_LENGTH}`);
  }
  return slots;
}

const CORNER_TILES = {
  GO: { type: TILE_TYPES.GO, name: 'Start', nameRu: 'Старт' },
  JAIL: { type: TILE_TYPES.JAIL, name: 'Jail', nameRu: 'Тюрьма' },
  FREE_PARKING: { type: TILE_TYPES.FREE_PARKING, name: 'Free Parking', nameRu: 'Бесплатная парковка' },
  GO_TO_JAIL: { type: TILE_TYPES.GO_TO_JAIL, name: 'Go To Jail', nameRu: 'В тюрьму' },
};

const rawEdges = [0, 1, 2, 3].map(buildEdge);
const EDGES = rawEdges.map((edge) => edge.map((slot) => (slot.corner ? CORNER_TILES[slot.corner] : slot)));

const BOARD = buildPerimeterBoard(EDGES, SIDE_LENGTH);

const CARD_ROLE_TILES = {
  GO: 0,
  JAIL: SIDE_LENGTH,
  FAR_PROPERTY_1: BOARD.length - 9,
  FAR_PROPERTY_2: BOARD.length - 26,
  MID_RAILROAD: BOARD.filter((t) => t.type === TILE_TYPES.RAILROAD)[2].id,
};

const indexes = deriveBoardIndexes(BOARD);

module.exports = {
  id: 'metropolis',
  label: { en: 'Metropolis', ru: 'Мегаполис' },
  description: {
    en: 'A sprawling board roughly 2-3x the size of Classic, with 20 districts to build an empire across.',
    ru: 'Огромная доска, примерно в 2-3 раза больше классической, с 20 районами для вашей империи.',
  },
  sideLength: SIDE_LENGTH,
  board: BOARD,
  cardRoleTiles: CARD_ROLE_TILES,
  ...indexes,
};
