// content.js
// The Bunker's content catalogue: every characteristic deck, every piece
// of baggage, every secret, every action card, every random event and
// every scenario.
//
// Nothing here is wired into the rules. The engine asks this module what
// exists and deals from whatever it answers, so new content is added by
// adding DATA - here, or through the Creator's overrides (see
// bunker/catalog.js) - and never by changing the engine.
//
// The older, smaller catalogue in cards.js is still the source of the
// original decks: this file imports them and extends them, so a game
// saved before any of this existed still deals, loads and scores.

const legacy = require('./cards');

// `s` is a card's contribution to the colony's survival chances, used for
// the verdict at the end of a game. `r` is rarity, which only decides how
// often a card is dealt. Both are server-side: the client is told names.
const RARITIES = ['common', 'uncommon', 'rare', 'legendary'];
// How often a card of each rarity is drawn, relative to the others.
const RARITY_WEIGHT = {
  common: 100, uncommon: 45, rare: 16, legendary: 5,
};

// A card: id, score, English name, Russian name, and the optional extras
// (rarity, description, glyph, hidden property).
function card(id, s, en, ru, extra = {}) {
  return {
    id, s, en, ru, r: extra.r || 'common', ...extra,
  };
}

// --- new characteristic decks ----------------------------------------

// Knowledge and skills - what a person can actually DO, as opposed to
// what they are employed as (profession) or enjoy (hobby).
const SKILLS = [
  card('welding', 3, 'Welding and metalwork', 'Сварка и работа с металлом', { r: 'uncommon' }),
  card('field_surgery', 4, 'Field surgery', 'Полевая хирургия', { r: 'rare' }),
  card('water_purify', 3, 'Water purification', 'Очистка воды', { r: 'uncommon' }),
  card('hydroponics', 3, 'Hydroponic growing', 'Гидропоника', { r: 'uncommon' }),
  card('electrics', 3, 'Wiring and electrics', 'Электрика и проводка', { r: 'common' }),
  card('gunsmith', 2, 'Gunsmithing', 'Оружейное дело', { r: 'uncommon' }),
  card('navigation', 2, 'Navigation without instruments', 'Ориентирование без приборов' ),
  card('butchery', 2, 'Butchery and curing', 'Разделка и засолка мяса'),
  card('brewing', 1, 'Brewing and distilling', 'Пивоварение и самогоноварение'),
  card('teaching', 1, 'Teaching children', 'Обучение детей'),
  card('bookkeeping', 0, 'Bookkeeping', 'Ведение учёта'),
  card('negotiation', 2, 'Negotiation and mediation', 'Переговоры и посредничество'),
  card('cartography', 1, 'Map making', 'Составление карт'),
  card('chemistry_basic', 2, 'Practical chemistry', 'Прикладная химия', { r: 'uncommon' }),
  card('masonry', 2, 'Masonry and concrete', 'Кладка и бетонные работы'),
  card('nothing_useful', -2, 'No practical skills at all', 'Никаких практических навыков', { r: 'uncommon' }),
  card('rope_work', 1, 'Knots and rigging', 'Узлы и такелаж'),
  card('composting', 2, 'Composting and waste handling', 'Компостирование и утилизация отходов'),
  card('midwifery', 3, 'Midwifery', 'Акушерство', { r: 'rare' }),
  card('reactor', 4, 'Can run a small reactor', 'Умеет обслуживать малый реактор', { r: 'legendary' }),
  card('sign_language', 1, 'Sign language', 'Язык жестов'),
  card('psych_first_aid', 2, 'Psychological first aid', 'Психологическая первая помощь'),
];

// Secrets: the thing a player would rather not reveal. These are the
// cards that turn a quiet round into an argument.
const SECRETS = [
  card('immune_carrier', 3, 'Immune, but a carrier of the infection', 'Имеет иммунитет, но является носителем заразы', { r: 'rare' }),
  card('stole_supplies', -2, 'Stole supplies from the last shelter', 'Украл припасы из прошлого убежища'),
  card('knows_code', 3, 'Knows the code to the bunker\'s reserve store', 'Знает код от резервного склада бункера', { r: 'rare' }),
  card('sleeper_agent', -3, 'Was sent here to watch the others', 'Был отправлен сюда следить за остальными', { r: 'rare' }),
  card('hidden_illness', -2, 'Hiding an illness from everyone', 'Скрывает болезнь от всех'),
  card('killed_before', -2, 'Has killed someone before', 'Уже убивал человека'),
  card('twin_outside', 0, 'Has a twin still on the surface', 'На поверхности остался близнец'),
  card('cannot_read', -1, 'Cannot read', 'Не умеет читать'),
  card('fears_group', -1, 'Cannot sleep with other people nearby', 'Не может спать рядом с людьми'),
  card('second_map', 2, 'Has memorised the map of the tunnels', 'Помнит наизусть карту тоннелей', { r: 'uncommon' }),
  card('rich_before', 0, 'Bought their place in the bunker', 'Купил своё место в бункере'),
  card('allergic_secret', -1, 'Secretly allergic to the ration protein', 'Тайно страдает аллергией на паёк'),
  card('saved_many', 2, 'Saved eleven people during the evacuation', 'Спас одиннадцать человек при эвакуации', { r: 'uncommon' }),
  card('no_secret', 0, 'Has nothing to hide at all', 'Совершенно нечего скрывать'),
  card('faked_papers', -1, 'Their documents are forged', 'Документы поддельные'),
  card('pregnant_secret', 1, 'Pregnant and has told nobody', 'Беременна и никому не сказала', { r: 'uncommon' }),
  card('sabotaged', -3, 'Sabotaged the last bunker\'s generator', 'Вывел из строя генератор прошлого бункера', { r: 'rare' }),
  card('knows_cure', 4, 'Remembers the formula of the antidote', 'Помнит формулу противоядия', { r: 'legendary' }),
  card('addicted', -2, 'Dependent on a medicine that will run out', 'Зависим от лекарства, которое скоро закончится'),
  card('former_leader', 1, 'Led a settlement that survived two winters', 'Возглавлял поселение, пережившее две зимы', { r: 'uncommon' }),
];

// --- baggage ----------------------------------------------------------
//
// Every item carries its own name, picture (a glyph), description, game
// value (`s`), rarity, and an optional hidden property that only matters
// once the item is looked at closely. The original twenty-four items keep
// their ids and scores; this table adds the detail around them and a
// second, rarer shelf of items to draw the extra slots from.

const ITEM_DETAIL = {
  medkit: { g: '🧰', r: 'uncommon', hidden: 'expired', en: 'Enough for three serious injuries.', ru: 'Хватит на три серьёзных ранения.' },
  seeds: { g: '🌱', r: 'uncommon', hidden: 'sterile', en: 'Six kinds of vegetable, sealed and dry.', ru: 'Шесть видов овощей, запаяны и сухие.' },
  rifle: { g: '🔫', r: 'uncommon', hidden: 'jams', en: 'A hunting rifle and forty rounds.', ru: 'Охотничье ружьё и сорок патронов.' },
  toolbox: { g: '🧳', r: 'common', en: 'Spanners, pliers, a hand drill.', ru: 'Ключи, пассатижи, ручная дрель.' },
  radio_set: { g: '📻', r: 'common', hidden: 'batteries_low', en: 'Receives, but cannot transmit.', ru: 'Принимает, но не передаёт.' },
  water_filter: { g: '💧', r: 'rare', en: 'Cleans about a hundred litres a day.', ru: 'Очищает около ста литров в сутки.' },
  sleeping_bag: { g: '🛏️', r: 'common', en: 'Rated to minus fifteen.', ru: 'Рассчитан до минус пятнадцати.' },
  cans: { g: '🥫', r: 'common', hidden: 'half_spoiled', en: 'Forty tins, labels long gone.', ru: 'Сорок банок, этикеток давно нет.' },
  generator: { g: '⚡', r: 'rare', hidden: 'needs_fuel', en: 'Two kilowatts, if there is fuel.', ru: 'Два киловатта, если есть топливо.' },
  encyclopedia: { g: '📘', r: 'uncommon', en: 'Everything from splints to solar stills.', ru: 'От шин при переломах до солнечных опреснителей.' },
  guitar: { g: '🎸', r: 'common', en: 'Six strings, one of them borrowed.', ru: 'Шесть струн, одна чужая.' },
  laptop: { g: '💻', r: 'common', hidden: 'encrypted', en: 'Charged, with something on the disk.', ru: 'Заряжен, и на диске что-то есть.' },
  cat: { g: '🐈', r: 'common', en: 'Catches mice. Eats rations.', ru: 'Ловит мышей. Ест паёк.' },
  dog: { g: '🐕', r: 'common', en: 'Hears the corridor before anyone else.', ru: 'Слышит коридор раньше всех.' },
  gold: { g: '🪙', r: 'uncommon', hidden: 'worthless_now', en: 'Four bars. Heavy.', ru: 'Четыре слитка. Тяжёлые.' },
  whisky: { g: '🥃', r: 'common', en: 'Disinfectant, anaesthetic, or a bad idea.', ru: 'Антисептик, обезболивающее или плохая идея.' },
  tent: { g: '⛺', r: 'common', en: 'Two-person, for the surface.', ru: 'Двухместная, для поверхности.' },
  hazmat: { g: '🥽', r: 'uncommon', hidden: 'torn', en: 'One suit, one filter set.', ru: 'Один костюм, один комплект фильтров.' },
  geiger: { g: '📟', r: 'uncommon', en: 'Clicks. Often.', ru: 'Щёлкает. Часто.' },
  fishing_rod: { g: '🎣', r: 'common', en: 'Useful if any water is left.', ru: 'Пригодится, если осталась вода.' },
  iodine: { g: '💊', r: 'rare', en: 'Two hundred tablets.', ru: 'Двести таблеток.' },
  album: { g: '📷', r: 'common', en: 'People who are not coming.', ru: 'Люди, которые уже не придут.' },
  sewing_kit: { g: '🧵', r: 'common', en: 'Needles, thread, a thimble.', ru: 'Иглы, нитки, напёрсток.' },
  empty_case: { g: '🧳', r: 'common', hidden: 'false_bottom', en: 'Nothing inside. Or almost nothing.', ru: 'Внутри ничего. Или почти ничего.' },
};

// The second shelf: items that only appear when a table plays with more
// than one piece of baggage, so the extra slot is not a copy of the first.
const EXTRA_BAGGAGE = [
  card('solar_charger', 3, 'Folding solar charger', 'Складная солнечная зарядка', { r: 'rare', g: '🔆', en_d: 'Sixty watts in full sun.', ru_d: 'Шестьдесят ватт на прямом солнце.' }),
  card('antibiotics', 4, 'Case of antibiotics', 'Ящик антибиотиков', { r: 'rare', g: '💉', hidden: 'expired', en_d: 'Enough for a whole winter of infections.', ru_d: 'Хватит на целую зиму инфекций.' }),
  card('goat', 3, 'A live goat', 'Живая коза', { r: 'rare', g: '🐐', en_d: 'Milk, and a problem to feed.', ru_d: 'Молоко и проблема с кормом.' }),
  card('welder', 2, 'Portable welder', 'Переносной сварочный аппарат', { r: 'uncommon', g: '🔥', hidden: 'needs_fuel', en_d: 'Repairs the door. Eats power.', ru_d: 'Починит дверь. Ест энергию.' }),
  card('night_vision', 2, 'Night-vision goggles', 'Прибор ночного видения', { r: 'rare', g: '🥽', hidden: 'batteries_low', en_d: 'Two hours of charge left.', ru_d: 'Осталось два часа заряда.' }),
  card('books_children', 1, 'Crate of children\'s books', 'Ящик детских книг', { r: 'common', g: '📚', en_d: 'Someone will have to teach them.', ru_d: 'Кому-то придётся по ним учить.' }),
  card('chess_set', 0, 'Chess set', 'Шахматы', { r: 'common', g: '♟️', en_d: 'Two years is a long time.', ru_d: 'Два года — это долго.' }),
  card('spare_filters', 3, 'Spare air filters', 'Запасные воздушные фильтры', { r: 'rare', g: '🌀', en_d: 'The bunker breathes for another year.', ru_d: 'Бункер дышит ещё год.' }),
  card('crowbar', 1, 'Crowbar', 'Лом', { r: 'common', g: '🪓', en_d: 'Opens most things. Loudly.', ru_d: 'Откроет почти всё. Громко.' }),
  card('vodka_crate', 0, 'Crate of vodka', 'Ящик водки', { r: 'common', g: '🍶', en_d: 'Currency, antiseptic, or trouble.', ru_d: 'Валюта, антисептик или беда.' }),
  card('rabbits', 3, 'Breeding pair of rabbits', 'Пара кроликов на развод', { r: 'uncommon', g: '🐇', en_d: 'Meat that makes more meat.', ru_d: 'Мясо, которое делает ещё мясо.' }),
  card('map_bunkers', 2, 'Map of the other shelters', 'Карта других убежищ', { r: 'rare', g: '🗺️', hidden: 'outdated', en_d: 'Eleven marks. Some are old.', ru_d: 'Одиннадцать отметок. Часть устарела.' }),
  card('handcuffs', 0, 'Handcuffs', 'Наручники', { r: 'common', g: '⛓️', en_d: 'For when talking stops working.', ru_d: 'На случай, когда разговоры не помогут.' }),
  card('sat_phone', 2, 'Satellite phone', 'Спутниковый телефон', { r: 'legendary', g: '📡', hidden: 'batteries_low', en_d: 'If anything is still up there to answer.', ru_d: 'Если наверху ещё есть кому ответить.' }),
  card('paint', 0, 'Tins of paint', 'Банки с краской', { r: 'common', g: '🎨', en_d: 'Grey walls for two years, or not.', ru_d: 'Два года серых стен — или нет.' }),
  card('microscope', 2, 'Field microscope', 'Полевой микроскоп', { r: 'rare', g: '🔬', en_d: 'Tells clean water from water that looks clean.', ru_d: 'Отличит чистую воду от той, что выглядит чистой.' }),
  card('fuel_cans', 3, 'Four jerrycans of diesel', 'Четыре канистры дизеля', { r: 'uncommon', g: '🛢️', en_d: 'The generator runs for a month.', ru_d: 'Генератор проработает месяц.' }),
  card('mushroom_kit', 2, 'Mushroom growing kit', 'Набор для выращивания грибов', { r: 'uncommon', g: '🍄', en_d: 'Grows in the dark. Very convenient.', ru_d: 'Растёт в темноте. Очень удобно.' }),
  card('violin', 0, 'A violin', 'Скрипка', { r: 'uncommon', g: '🎻', hidden: 'false_bottom', en_d: 'The case is heavier than the violin.', ru_d: 'Футляр тяжелее скрипки.' }),
  card('scrap_metal', 1, 'Sack of scrap metal', 'Мешок металлолома', { r: 'common', g: '⚙️', en_d: 'Parts for whatever breaks first.', ru_d: 'Запчасти для того, что сломается первым.' }),
];

// A hidden property is a second thing about an item that a player can be
// forced to reveal, or discover with a card. It is never dealt on its own.
const HIDDEN_PROPERTIES = {
  expired: { s: -2, en: 'Most of it is past its expiry date', ru: 'Большая часть просрочена' },
  sterile: { s: -3, en: 'The seeds will not germinate', ru: 'Семена не взойдут' },
  jams: { s: -1, en: 'It jams every third shot', ru: 'Заедает на каждом третьем выстреле' },
  batteries_low: { s: -1, en: 'Almost out of charge', ru: 'Заряда почти не осталось' },
  half_spoiled: { s: -2, en: 'Half of it has spoiled', ru: 'Половина испортилась' },
  needs_fuel: { s: -1, en: 'Useless without fuel', ru: 'Бесполезен без топлива' },
  encrypted: { s: 1, en: 'There is encrypted data on it', ru: 'На нём зашифрованные данные' },
  worthless_now: { s: -2, en: 'Worth nothing down here', ru: 'Здесь ничего не стоит' },
  torn: { s: -2, en: 'There is a tear in the seam', ru: 'По шву идёт разрыв' },
  false_bottom: { s: 2, en: 'It has a false bottom, and something in it', ru: 'В нём двойное дно, и там что-то есть' },
  outdated: { s: -1, en: 'The information is years out of date', ru: 'Сведения устарели на годы' },
};

// The complete baggage shelf: the original items, enriched, plus the
// second shelf. Ids never change, so an old save still resolves.
const BAGGAGE = [
  ...legacy.DECKS.baggage.map((item) => {
    const d = ITEM_DETAIL[item.id] || {};
    return {
      ...item,
      r: d.r || 'common',
      g: d.g || '🎒',
      hidden: d.hidden || null,
      en_d: d.en || null,
      ru_d: d.ru || null,
    };
  }),
  ...EXTRA_BAGGAGE,
];

// --- the category table ----------------------------------------------
//
// Every characteristic a character can have. `deck` names the pool it is
// dealt from; `slot` groups the baggage slots so they share one deck
// without ever dealing the same item twice to one player.

const CATEGORIES = [
  { key: 'profession', deck: 'profession', core: true, order: 1 },
  { key: 'biology', deck: null, core: true, order: 2 }, // generated, not dealt
  { key: 'health', deck: 'health', core: true, order: 3 },
  { key: 'hobby', deck: 'hobby', core: false, order: 4 },
  { key: 'skill', deck: 'skill', core: false, order: 5 },
  { key: 'trait', deck: 'trait', core: false, order: 6 },
  { key: 'extra', deck: 'extra', core: false, order: 7 },
  { key: 'baggage', deck: 'baggage', core: true, order: 8, slot: 'baggage' },
  { key: 'baggage2', deck: 'baggage', core: false, order: 9, slot: 'baggage' },
  { key: 'baggage3', deck: 'baggage', core: false, order: 10, slot: 'baggage' },
  { key: 'baggage4', deck: 'baggage', core: false, order: 11, slot: 'baggage' },
  { key: 'secret', deck: 'secret', core: false, order: 12, slot: 'secret' },
  { key: 'secret2', deck: 'secret', core: false, order: 13, slot: 'secret' },
];

const BAGGAGE_KEYS = CATEGORIES.filter((c) => c.slot === 'baggage').map((c) => c.key);
const SECRET_KEYS = CATEGORIES.filter((c) => c.slot === 'secret').map((c) => c.key);
// Every key the engine can ever deal. The seven original keys come first
// and in their original order, so old saves and old payloads line up.
const ALL_CATEGORY_KEYS = [...CATEGORIES].sort((a, b) => a.order - b.order).map((c) => c.key);
// What a table plays with unless it says otherwise: the original seven,
// plus the second bag and one secret.
const DEFAULT_CATEGORY_KEYS = ['profession', 'biology', 'health', 'hobby', 'skill', 'trait', 'extra', 'baggage', 'baggage2', 'secret'];

const DECKS = {
  ...legacy.DECKS,
  baggage: BAGGAGE,
  skill: SKILLS,
  secret: SECRETS,
};

function categoryDef(key) {
  return CATEGORIES.find((c) => c.key === key) || null;
}

function deckFor(key) {
  const def = categoryDef(key);
  return def && def.deck ? DECKS[def.deck] || [] : [];
}

function hiddenProperty(id) {
  return HIDDEN_PROPERTIES[id] || null;
}

// A card's contribution to the colony's chances. Unknown ids score zero
// rather than throwing, so content that was removed from the catalogue
// never breaks a game that was dealt with it.
function cardScore(key, card_) {
  if (!card_) return 0;
  if (key === 'biology') {
    if (card_.age <= 45) return 1;
    if (card_.age <= 60) return 0;
    return -1;
  }
  const entry = deckFor(key).find((x) => x.id === card_.id);
  let score = entry ? entry.s || 0 : 0;
  // A hidden property counts only once it is out in the open.
  if (card_.revealedProperty && entry && entry.hidden) {
    score += hiddenProperty(entry.hidden)?.s || 0;
  }
  return score;
}

function isKnownCard(key, card_) {
  if (!card_) return false;
  if (key === 'biology') return ['male', 'female'].includes(card_.gender) && Number.isInteger(card_.age);
  return deckFor(key).some((x) => x.id === card_.id);
}

// Names and descriptions for the client. Scores and rarities stay here;
// rarity travels because the UI shows it on an item, but it decides
// nothing on the client.
function publicDecks() {
  const out = {};
  Object.entries(DECKS).forEach(([deckName, deck]) => {
    out[deckName] = deck.map((entry) => ({
      id: entry.id,
      name: { en: entry.en, ru: entry.ru },
      rarity: entry.r || 'common',
      glyph: entry.g || null,
      description: entry.en_d ? { en: entry.en_d, ru: entry.ru_d } : null,
      hasHidden: !!entry.hidden,
    }));
  });
  return out;
}

function publicHiddenProperties() {
  return Object.fromEntries(Object.entries(HIDDEN_PROPERTIES).map(([id, v]) => [id, { name: { en: v.en, ru: v.ru } }]));
}

module.exports = {
  RARITIES,
  RARITY_WEIGHT,
  CATEGORIES,
  ALL_CATEGORY_KEYS,
  DEFAULT_CATEGORY_KEYS,
  BAGGAGE_KEYS,
  SECRET_KEYS,
  DECKS,
  HIDDEN_PROPERTIES,
  card,
  categoryDef,
  deckFor,
  hiddenProperty,
  cardScore,
  isKnownCard,
  publicDecks,
  publicHiddenProperties,
};
