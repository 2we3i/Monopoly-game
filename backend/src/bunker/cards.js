// cards.js
// The Bunker's reference data: every characteristic card a player can be
// dealt, the catastrophes and the rooms a bunker can have, plus the dealing
// itself. Cards are identified by id; names in both languages travel to the
// client once through /api/bunker/config, never inside a game payload.
//
// `s` is a card's contribution to the colony's survival chances, used only
// for the verdict at the end of the game - it never decides who is voted out.

const CATEGORY_KEYS = ['profession', 'biology', 'health', 'hobby', 'baggage', 'trait', 'extra'];

const c = (id, s, en, ru) => ({ id, s, en, ru });

const PROFESSIONS = [
  c('surgeon', 3, 'Surgeon', 'Врач-хирург'),
  c('nurse', 2, 'Nurse', 'Медсестра'),
  c('electrician', 3, 'Electrical engineer', 'Инженер-электрик'),
  c('farmer', 3, 'Farmer', 'Фермер'),
  c('cook', 2, 'Cook', 'Повар'),
  c('soldier', 2, 'Soldier', 'Военный'),
  c('teacher', 1, 'Teacher', 'Учитель'),
  c('psychologist', 1, 'Psychologist', 'Психолог'),
  c('programmer', 0, 'Programmer', 'Программист'),
  c('blogger', -1, 'Blogger', 'Блогер'),
  c('lawyer', -1, 'Lawyer', 'Юрист'),
  c('biologist', 2, 'Biologist', 'Биолог'),
  c('chemist', 2, 'Chemist', 'Химик'),
  c('plumber', 2, 'Plumber', 'Сантехник'),
  c('builder', 2, 'Builder', 'Строитель'),
  c('vet', 2, 'Veterinarian', 'Ветеринар'),
  c('mechanic', 2, 'Mechanic', 'Механик'),
  c('firefighter', 2, 'Firefighter', 'Пожарный'),
  c('police', 1, 'Police officer', 'Полицейский'),
  c('priest', 1, 'Priest', 'Священник'),
  c('musician', 0, 'Musician', 'Музыкант'),
  c('artist', 0, 'Artist', 'Художник'),
  c('accountant', 0, 'Accountant', 'Бухгалтер'),
  c('politician', -1, 'Politician', 'Политик'),
  c('astronomer', 0, 'Astronomer', 'Астроном'),
  c('pilot', 1, 'Pilot', 'Пилот'),
  c('geologist', 1, 'Geologist', 'Геолог'),
  c('pharmacist', 2, 'Pharmacist', 'Фармацевт'),
  c('carpenter', 2, 'Carpenter', 'Столяр'),
  c('hunter', 2, 'Hunter', 'Охотник'),
  c('tailor', 1, 'Tailor', 'Портной'),
  c('librarian', 0, 'Librarian', 'Библиотекарь'),
];

const HEALTH = [
  c('perfect', 3, 'Perfectly healthy', 'Идеально здоров'),
  c('asthma', -1, 'Asthma', 'Астма'),
  c('diabetes', -2, 'Type 1 diabetes', 'Диабет 1 типа'),
  c('myopia', 0, 'Short-sighted', 'Близорукость'),
  c('pollen', 0, 'Pollen allergy', 'Аллергия на пыльцу'),
  c('infertile', -1, 'Infertile', 'Бесплодие'),
  c('hypertension', -1, 'High blood pressure', 'Гипертония'),
  c('migraine', -1, 'Chronic migraine', 'Хроническая мигрень'),
  c('immunity', 2, 'Excellent immunity', 'Отличный иммунитет'),
  c('flatfoot', 0, 'Flat feet', 'Плоскостопие'),
  c('insomnia', -1, 'Insomnia', 'Бессонница'),
  c('prosthesis', -1, 'Prosthetic leg', 'Протез ноги'),
  c('half_deaf', -1, 'Deaf in one ear', 'Глухота на одно ухо'),
  c('anemia', -1, 'Anaemia', 'Анемия'),
  c('pregnant', 1, 'Three months pregnant', 'Беременность, 3 месяца'),
  c('tuberculosis', -3, 'Tuberculosis (contagious)', 'Туберкулёз (заразен)'),
  c('depression', -2, 'Depression', 'Депрессия'),
  c('epilepsy', -2, 'Epilepsy', 'Эпилепсия'),
  c('stamina', 2, 'Great stamina', 'Высокая выносливость'),
  c('colorblind', 0, 'Colour-blind', 'Дальтонизм'),
  c('claustrophobia', -2, 'Claustrophobia', 'Клаустрофобия'),
  c('cold', 0, 'A mild cold', 'Лёгкая простуда'),
  c('kidneys', -2, 'Chronic kidney disease', 'Хроническая болезнь почек'),
  c('athlete', 2, 'Athlete\'s body', 'Спортивное телосложение'),
];

const HOBBIES = [
  c('gardening', 2, 'Gardening', 'Садоводство'),
  c('chess', 0, 'Chess', 'Шахматы'),
  c('fishing', 2, 'Fishing', 'Рыбалка'),
  c('hunting', 2, 'Hunting', 'Охота'),
  c('knitting', 1, 'Knitting', 'Вязание'),
  c('yoga', 1, 'Yoga', 'Йога'),
  c('martial_arts', 2, 'Martial arts', 'Боевые искусства'),
  c('cooking', 2, 'Cooking', 'Кулинария'),
  c('radio', 2, 'Amateur radio', 'Радиолюбительство'),
  c('parkour', 1, 'Parkour', 'Паркур'),
  c('video_games', -1, 'Video games', 'Видеоигры'),
  c('photography', 0, 'Photography', 'Фотография'),
  c('reading', 1, 'Reading', 'Чтение'),
  c('woodwork', 2, 'Woodwork', 'Столярное дело'),
  c('bushcraft', 3, 'Wilderness survival', 'Выживание в дикой природе'),
  c('singing', 0, 'Singing', 'Пение'),
  c('dancing', 0, 'Dancing', 'Танцы'),
  c('first_aid', 2, 'First aid', 'Первая помощь'),
  c('stargazing', 0, 'Stargazing', 'Астрономия'),
  c('coins', -1, 'Coin collecting', 'Коллекционирование монет'),
  c('climbing', 1, 'Mountaineering', 'Альпинизм'),
  c('sewing', 1, 'Sewing', 'Шитьё'),
  c('beekeeping', 2, 'Beekeeping', 'Пчеловодство'),
  c('electronics', 2, 'DIY electronics', 'Сборка электроники'),
];

const BAGGAGE = [
  c('medkit', 3, 'First-aid kit', 'Аптечка'),
  c('seeds', 3, 'Vegetable seeds', 'Семена овощей'),
  c('rifle', 2, 'Rifle and ammunition', 'Ружьё с патронами'),
  c('toolbox', 2, 'Toolbox', 'Набор инструментов'),
  c('radio_set', 2, 'Radio receiver', 'Радиоприёмник'),
  c('water_filter', 3, 'Water filter', 'Фильтр для воды'),
  c('sleeping_bag', 1, 'Sleeping bag', 'Спальный мешок'),
  c('cans', 2, 'Crate of tinned food', 'Ящик консервов'),
  c('generator', 3, 'Portable generator', 'Генератор'),
  c('encyclopedia', 2, 'Survival encyclopedia', 'Энциклопедия выживания'),
  c('guitar', 0, 'Guitar', 'Гитара'),
  c('laptop', 0, 'Laptop', 'Ноутбук'),
  c('cat', 0, 'A cat', 'Кошка'),
  c('dog', 1, 'A dog', 'Собака'),
  c('gold', -1, 'Gold bars', 'Золотые слитки'),
  c('whisky', 0, 'Bottle of whisky', 'Бутылка виски'),
  c('tent', 1, 'Tent', 'Палатка'),
  c('hazmat', 2, 'Hazmat suit', 'Химзащитный костюм'),
  c('geiger', 2, 'Geiger counter', 'Счётчик Гейгера'),
  c('fishing_rod', 1, 'Fishing rod', 'Удочка'),
  c('iodine', 3, 'Anti-radiation pills', 'Таблетки от радиации'),
  c('album', 0, 'Family photo album', 'Семейный альбом'),
  c('sewing_kit', 1, 'Sewing kit', 'Набор для шитья'),
  c('empty_case', -1, 'An empty suitcase', 'Пустой чемодан'),
];

const TRAITS = [
  c('leader', 2, 'Natural leader', 'Прирождённый лидер'),
  c('panicker', -2, 'Panics easily', 'Паникёр'),
  c('kind', 1, 'Kind', 'Добрый'),
  c('selfish', -2, 'Selfish', 'Эгоист'),
  c('calm', 2, 'Calm under pressure', 'Хладнокровный'),
  c('hot_tempered', -1, 'Hot-tempered', 'Вспыльчивый'),
  c('hardworking', 2, 'Hard-working', 'Трудолюбивый'),
  c('lazy', -2, 'Lazy', 'Ленивый'),
  c('honest', 1, 'Honest', 'Честный'),
  c('liar', -2, 'Compulsive liar', 'Лжец'),
  c('optimist', 1, 'Optimist', 'Оптимист'),
  c('pessimist', -1, 'Pessimist', 'Пессимист'),
  c('charismatic', 1, 'Charismatic', 'Харизматичный'),
  c('withdrawn', 0, 'Withdrawn', 'Замкнутый'),
  c('responsible', 2, 'Responsible', 'Ответственный'),
  c('gambler', -1, 'Gambler', 'Азартный'),
  c('brave', 1, 'Brave', 'Храбрый'),
  c('coward', -1, 'Cowardly', 'Трусливый'),
  c('curious', 0, 'Curious', 'Любопытный'),
  c('pedant', 1, 'Meticulous', 'Педантичный'),
];

const EXTRAS = [
  c('morse', 1, 'Knows Morse code', 'Знает азбуку Морзе'),
  c('truck', 1, 'Can drive a lorry', 'Умеет водить грузовик'),
  c('captivity', 0, 'Was once taken prisoner', 'Был в плену'),
  c('survival_course', 2, 'Took a survival course', 'Прошёл курсы выживания'),
  c('languages', 1, 'Speaks four languages', 'Знает четыре языка'),
  c('ex_convict', -1, 'Former convict', 'Бывший заключённый'),
  c('midwife', 2, 'Can deliver a baby', 'Умеет принимать роды'),
  c('sleeper', -1, 'Sleeps twelve hours a day', 'Спит по 12 часов в сутки'),
  c('snores', -1, 'Snores loudly', 'Громко храпит'),
  c('sleepwalker', -1, 'Sleepwalks', 'Лунатик'),
  c('second_bunker', 2, 'Knows where a second bunker is', 'Знает, где второй бункер'),
  c('engines', 2, 'Can fix any engine', 'Починит любой двигатель'),
  c('dark', -1, 'Afraid of the dark', 'Боится темноты'),
  c('memory', 1, 'Photographic memory', 'Фотографическая память'),
  c('vegetarian', 0, 'Vegetarian', 'Вегетарианец'),
  c('sharpshooter', 1, 'Excellent shot', 'Отлично стреляет'),
  c('scraps', 2, 'Can cook out of nothing', 'Готовит из ничего'),
  c('ufo', 0, 'Swears they once saw a UFO', 'Уверен, что видел НЛО'),
  c('hacker', 1, 'Can hack any lock', 'Вскроет любой замок'),
  c('stash', 1, 'Hid a stash of batteries nearby', 'Спрятал рядом запас батареек'),
];

const DECKS = {
  profession: PROFESSIONS,
  health: HEALTH,
  hobby: HOBBIES,
  baggage: BAGGAGE,
  trait: TRAITS,
  extra: EXTRAS,
};

const CATASTROPHES = [
  {
    id: 'nuclear_war',
    months: 24,
    en: { name: 'Nuclear war', text: 'The surface is scorched and radioactive. It will be safe to come out in about two years.' },
    ru: { name: 'Ядерная война', text: 'Поверхность выжжена и заражена радиацией. Выйти можно будет примерно через два года.' },
  },
  {
    id: 'pandemic',
    months: 12,
    en: { name: 'Pandemic', text: 'A lethal virus has swept the planet. The survivors must wait until it burns out.' },
    ru: { name: 'Пандемия', text: 'Смертельный вирус охватил планету. Выжившим нужно переждать, пока он не утихнет.' },
  },
  {
    id: 'asteroid',
    months: 36,
    en: { name: 'Asteroid impact', text: 'Dust has blocked out the sun. Crops will not grow for years.' },
    ru: { name: 'Падение астероида', text: 'Пыль закрыла солнце. Урожай не вырастет ещё несколько лет.' },
  },
  {
    id: 'supervolcano',
    months: 18,
    en: { name: 'Supervolcano eruption', text: 'Ash covers the continent and the air is unbreathable.' },
    ru: { name: 'Извержение супервулкана', text: 'Пепел покрыл континент, воздухом невозможно дышать.' },
  },
  {
    id: 'ice_age',
    months: 48,
    en: { name: 'New ice age', text: 'Temperatures have dropped sharply. Only a sealed shelter keeps warmth.' },
    ru: { name: 'Новый ледниковый период', text: 'Температура резко упала. Тепло сохраняется только в герметичном убежище.' },
  },
  {
    id: 'ai_uprising',
    months: 12,
    en: { name: 'Machine uprising', text: 'Automated systems have turned on people. Anything with a network signal is dangerous.' },
    ru: { name: 'Восстание машин', text: 'Автоматические системы обернулись против людей. Опасно всё, что подключено к сети.' },
  },
  {
    id: 'chemical',
    months: 10,
    en: { name: 'Chemical disaster', text: 'A cloud of toxic gas hangs over the region. It will take months to disperse.' },
    ru: { name: 'Химическая катастрофа', text: 'Над регионом висит облако ядовитого газа. Рассеется оно только через месяцы.' },
  },
  {
    id: 'solar_flare',
    months: 8,
    en: { name: 'Solar superstorm', text: 'Power grids are gone and radiation spikes on the surface every day.' },
    ru: { name: 'Солнечная супербуря', text: 'Энергосети уничтожены, а радиация на поверхности скачет каждый день.' },
  },
  {
    id: 'zombies',
    months: 20,
    en: { name: 'Zombie outbreak', text: 'The infected roam the streets. The bunker door must stay shut.' },
    ru: { name: 'Зомби-апокалипсис', text: 'Заражённые бродят по улицам. Дверь бункера должна оставаться закрытой.' },
  },
  {
    id: 'flood',
    months: 14,
    en: { name: 'Global flood', text: 'The oceans have risen. The bunker sits on the last high ground for miles.' },
    ru: { name: 'Всемирный потоп', text: 'Уровень океана поднялся. Бункер стоит на последней возвышенности в округе.' },
  },
];

const BUNKER_ROOMS = [
  { id: 'well', en: 'Water well', ru: 'Водяная скважина' },
  { id: 'greenhouse', en: 'Greenhouse', ru: 'Теплица' },
  { id: 'workshop', en: 'Workshop', ru: 'Мастерская' },
  { id: 'infirmary', en: 'Infirmary', ru: 'Медпункт' },
  { id: 'library', en: 'Library', ru: 'Библиотека' },
  { id: 'radio_room', en: 'Radio room', ru: 'Радиорубка' },
  { id: 'armory', en: 'Armoury', ru: 'Оружейная' },
  { id: 'gym', en: 'Gym', ru: 'Спортзал' },
  { id: 'fuel', en: 'Fuel store', ru: 'Запас топлива' },
  { id: 'solar', en: 'Solar panels', ru: 'Солнечные панели' },
  { id: 'kitchen', en: 'Kitchen', ru: 'Кухня' },
  { id: 'lab', en: 'Laboratory', ru: 'Лаборатория' },
  { id: 'nursery', en: 'Nursery', ru: 'Детская комната' },
  { id: 'seed_vault', en: 'Seed vault', ru: 'Хранилище семян' },
];

function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function biologyCard(rng = Math.random) {
  const gender = rng() < 0.5 ? 'male' : 'female';
  // Adults of every age, weighted towards the middle years.
  const age = 18 + Math.floor(((rng() + rng() + rng()) / 3) * 64);
  return { gender, age };
}

// One set of characteristics per player. Within a game no two players
// share the same card in a category, as long as the deck is big enough.
function dealCharacteristics(count, rng = Math.random) {
  const shuffled = Object.fromEntries(Object.entries(DECKS).map(([key, deck]) => [key, shuffle(deck, rng)]));
  return Array.from({ length: count }, (_, i) => ({
    profession: { id: shuffled.profession[i % PROFESSIONS.length].id },
    biology: biologyCard(rng),
    health: { id: shuffled.health[i % HEALTH.length].id },
    hobby: { id: shuffled.hobby[i % HOBBIES.length].id },
    baggage: { id: shuffled.baggage[i % BAGGAGE.length].id },
    trait: { id: shuffled.trait[i % TRAITS.length].id },
    extra: { id: shuffled.extra[i % EXTRAS.length].id },
  }));
}

function pickCatastrophe(rng = Math.random) {
  return { id: CATASTROPHES[Math.floor(rng() * CATASTROPHES.length)].id };
}

function buildBunker(rng = Math.random) {
  const areas = [40, 60, 80, 120, 150];
  const food = [3, 6, 12, 18, 24];
  return {
    area: areas[Math.floor(rng() * areas.length)],
    foodMonths: food[Math.floor(rng() * food.length)],
    rooms: shuffle(BUNKER_ROOMS, rng).slice(0, 3).map((r) => r.id),
  };
}

function cardScore(key, card) {
  if (!card) return 0;
  if (key === 'biology') {
    if (card.age <= 45) return 1;
    if (card.age <= 60) return 0;
    return -1;
  }
  return DECKS[key]?.find((x) => x.id === card.id)?.s || 0;
}

function isKnownCard(key, card) {
  if (!card) return false;
  if (key === 'biology') return ['male', 'female'].includes(card.gender) && Number.isInteger(card.age);
  return !!DECKS[key]?.some((x) => x.id === card.id);
}

// Names and texts for the client; scores stay on the server.
function publicConfig() {
  const names = (deck) => deck.map(({ id, en, ru }) => ({ id, name: { en, ru } }));
  return {
    categories: CATEGORY_KEYS,
    cards: Object.fromEntries(Object.entries(DECKS).map(([key, deck]) => [key, names(deck)])),
    catastrophes: CATASTROPHES.map(({ id, months, en, ru }) => ({
      id, months, name: { en: en.name, ru: ru.name }, text: { en: en.text, ru: ru.text },
    })),
    rooms: BUNKER_ROOMS.map(({ id, en, ru }) => ({ id, name: { en, ru } })),
  };
}

module.exports = {
  CATEGORY_KEYS,
  DECKS,
  CATASTROPHES,
  BUNKER_ROOMS,
  shuffle,
  dealCharacteristics,
  pickCatastrophe,
  buildBunker,
  cardScore,
  isKnownCard,
  publicConfig,
};
