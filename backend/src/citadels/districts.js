// districts.js
// Every district card in Citadels, as data.
//
// A district has a type (which role draws income from it), a cost (what
// it takes to build and what it scores), and optionally a `special` block
// describing a rule it changes. The engine reads the special keys rather
// than checking card names, so a new special district is one entry here
// plus, at most, one small rule in the engine.

const TYPES = {
  RESIDENTIAL: 'RESIDENTIAL',
  RELIGIOUS: 'RELIGIOUS',
  TRADE: 'TRADE',
  MILITARY: 'MILITARY',
  SPECIAL: 'SPECIAL',
};

const TYPE_LIST = Object.values(TYPES);

const DISTRICTS = [
  // --- residential (the King's income) --------------------------------
  { id: 'MANOR', type: TYPES.RESIDENTIAL, cost: 3, count: 5, name: { en: 'Manor', ru: 'Усадьба' } },
  { id: 'CASTLE', type: TYPES.RESIDENTIAL, cost: 4, count: 4, name: { en: 'Castle', ru: 'Замок' } },
  { id: 'PALACE', type: TYPES.RESIDENTIAL, cost: 5, count: 3, name: { en: 'Palace', ru: 'Дворец' } },

  // --- religious (the Bishop's income) --------------------------------
  { id: 'TEMPLE', type: TYPES.RELIGIOUS, cost: 1, count: 3, name: { en: 'Temple', ru: 'Храм' } },
  { id: 'CHURCH', type: TYPES.RELIGIOUS, cost: 2, count: 3, name: { en: 'Church', ru: 'Церковь' } },
  { id: 'MONASTERY', type: TYPES.RELIGIOUS, cost: 3, count: 3, name: { en: 'Monastery', ru: 'Монастырь' } },
  { id: 'CATHEDRAL', type: TYPES.RELIGIOUS, cost: 5, count: 2, name: { en: 'Cathedral', ru: 'Собор' } },

  // --- trade (the Merchant's income) ----------------------------------
  { id: 'TAVERN', type: TYPES.TRADE, cost: 1, count: 5, name: { en: 'Tavern', ru: 'Таверна' } },
  { id: 'MARKET', type: TYPES.TRADE, cost: 2, count: 4, name: { en: 'Market', ru: 'Рынок' } },
  { id: 'TRADING_POST', type: TYPES.TRADE, cost: 2, count: 3, name: { en: 'Trading post', ru: 'Торговая лавка' } },
  { id: 'DOCKS', type: TYPES.TRADE, cost: 3, count: 3, name: { en: 'Docks', ru: 'Пристань' } },
  { id: 'HARBOR', type: TYPES.TRADE, cost: 4, count: 3, name: { en: 'Harbor', ru: 'Гавань' } },
  { id: 'TOWN_HALL', type: TYPES.TRADE, cost: 5, count: 2, name: { en: 'Town hall', ru: 'Ратуша' } },

  // --- military (the Warlord's income) --------------------------------
  { id: 'WATCHTOWER', type: TYPES.MILITARY, cost: 1, count: 3, name: { en: 'Watchtower', ru: 'Сторожевая башня' } },
  { id: 'PRISON', type: TYPES.MILITARY, cost: 2, count: 3, name: { en: 'Prison', ru: 'Тюрьма' } },
  { id: 'BARRACKS', type: TYPES.MILITARY, cost: 3, count: 3, name: { en: 'Barracks', ru: 'Казармы' } },
  { id: 'FORTRESS', type: TYPES.MILITARY, cost: 5, count: 2, name: { en: 'Fortress', ru: 'Крепость' } },

  // --- special: one copy each, each bends a rule ---------------------
  {
    id: 'DRAGON_GATE', type: TYPES.SPECIAL, cost: 6, count: 1, special: { scoreBonus: 2 },
    name: { en: 'Dragon Gate', ru: 'Драконьи врата' },
    text: { en: 'Scores 8 points instead of 6.', ru: 'Приносит 8 очков вместо 6.' },
  },
  {
    id: 'UNIVERSITY', type: TYPES.SPECIAL, cost: 6, count: 1, special: { scoreBonus: 2 },
    name: { en: 'University', ru: 'Университет' },
    text: { en: 'Scores 8 points instead of 6.', ru: 'Приносит 8 очков вместо 6.' },
  },
  {
    id: 'LIBRARY', type: TYPES.SPECIAL, cost: 6, count: 1, special: { keepAllDrawn: true },
    name: { en: 'Library', ru: 'Библиотека' },
    text: { en: 'When you draw cards, keep all of them.', ru: 'Взяв карты, вы оставляете их все.' },
  },
  {
    id: 'OBSERVATORY', type: TYPES.SPECIAL, cost: 5, count: 1, special: { drawExtra: 1 },
    name: { en: 'Observatory', ru: 'Обсерватория' },
    text: { en: 'Draw 3 cards instead of 2 when you draw.', ru: 'Берёте 3 карты вместо 2.' },
  },
  {
    id: 'SMITHY', type: TYPES.SPECIAL, cost: 5, count: 1, special: { activated: 'SMITHY' },
    name: { en: 'Smithy', ru: 'Кузница' },
    text: { en: 'Once per turn: pay 2 gold to draw 3 cards.', ru: 'Раз за ход: заплатите 2 золота и возьмите 3 карты.' },
  },
  {
    id: 'LABORATORY', type: TYPES.SPECIAL, cost: 5, count: 1, special: { activated: 'LABORATORY' },
    name: { en: 'Laboratory', ru: 'Лаборатория' },
    text: { en: 'Once per turn: discard a card to gain 1 gold.', ru: 'Раз за ход: сбросьте карту и получите 1 золото.' },
  },
  {
    id: 'SCHOOL_OF_MAGIC', type: TYPES.SPECIAL, cost: 6, count: 1, special: { wildIncome: true },
    name: { en: 'School of Magic', ru: 'Школа магии' },
    text: { en: 'Counts as your role\'s type when collecting income.', ru: 'При сборе дохода считается кварталом типа вашей роли.' },
  },
  {
    id: 'KEEP', type: TYPES.SPECIAL, cost: 3, count: 1, special: { indestructible: true },
    name: { en: 'Keep', ru: 'Бастион' },
    text: { en: 'The Warlord cannot destroy it.', ru: 'Кондотьер не может его разрушить.' },
  },
  {
    id: 'GREAT_WALL', type: TYPES.SPECIAL, cost: 6, count: 1, special: { wallTax: 1 },
    name: { en: 'Great Wall', ru: 'Великая стена' },
    text: { en: 'Destroying your other districts costs the Warlord 1 more.', ru: 'Разрушение других ваших кварталов стоит Кондотьеру на 1 дороже.' },
  },
  {
    id: 'HAUNTED_QUARTER', type: TYPES.SPECIAL, cost: 2, count: 1, special: { wildScoringType: true },
    name: { en: 'Haunted Quarter', ru: 'Квартал призраков' },
    text: { en: 'At the end, counts as any one type you are missing.', ru: 'В конце игры считается любым недостающим типом.' },
  },
];

const BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

function districtDef(id) {
  return BY_ID[id] || null;
}

// The full deck as a list of district ids, one entry per physical card.
function deckList() {
  const out = [];
  DISTRICTS.forEach((d) => {
    for (let i = 0; i < d.count; i += 1) out.push(d.id);
  });
  return out;
}

module.exports = { TYPES, TYPE_LIST, DISTRICTS, districtDef, deckList };
