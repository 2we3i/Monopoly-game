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
const absurd = require('./absurd');

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

// More work than the original thirty-two. The shelter needs people who can
// grow food, mend a pump, treat a wound and keep a reactor cool; it also
// fills up with people whose work stopped meaning anything the moment the
// sirens went off. Both are here on purpose - a table with nothing but
// useful professions has nothing to argue about.
const PROFESSION_EXTRA = [
  card('doctor', 3, 'Doctor (general practice)', 'Врач общей практики', { r: 'uncommon' }),
  card('paramedic', 3, 'Paramedic', 'Фельдшер скорой помощи', { r: 'uncommon' }),
  card('anesthetist', 3, 'Anaesthetist', 'Анестезиолог', { r: 'rare' }),
  card('engineer', 3, 'Engineer', 'Инженер', { r: 'uncommon' }),
  card('rescuer', 3, 'Search and rescue worker', 'Спасатель', { r: 'uncommon' }),
  card('miner', 2, 'Miner', 'Шахтёр'),
  card('scientist', 2, 'Research scientist', 'Учёный'),
  card('nuclear_engineer', 4, 'Nuclear power specialist', 'Специалист по ядерной энергетике', { r: 'legendary' }),
  card('water_engineer', 4, 'Water treatment specialist', 'Специалист по водоснабжению', { r: 'rare' }),
  card('agronomist', 3, 'Agronomist', 'Специалист по сельскому хозяйству', { r: 'uncommon' }),
  card('survivalist', 3, 'Survival instructor', 'Специалист по выживанию', { r: 'rare' }),
  card('welder_pro', 3, 'Welder', 'Сварщик', { r: 'uncommon' }),
  card('hvac', 3, 'Ventilation engineer', 'Инженер по вентиляции', { r: 'rare' }),
  card('archivist', 1, 'Archivist', 'Архивист'),
  card('entrepreneur', 0, 'Entrepreneur', 'Предприниматель'),
  card('athlete', 1, 'Professional athlete', 'Профессиональный спортсмен'),
  card('journalist', 0, 'Journalist', 'Журналист'),
  card('actor', -1, 'Actor', 'Актёр'),
  card('shopkeeper', 0, 'Shop assistant', 'Продавец'),
  card('unemployed', -1, 'Unemployed', 'Безработный'),
  card('crime_boss', -1, 'Crime boss', 'Криминальный авторитет', { r: 'rare' }),
  card('fisherman', 2, 'Fisherman', 'Рыбак'),
  card('beekeeper', 2, 'Beekeeper', 'Пчеловод'),
  card('butcher', 2, 'Butcher', 'Мясник'),
  card('baker', 2, 'Baker', 'Пекарь'),
  card('seamstress', 1, 'Seamstress', 'Швея'),
  card('driver', 1, 'Lorry driver', 'Водитель грузовика'),
  card('crane_operator', 1, 'Crane operator', 'Крановщик'),
  card('radio_engineer', 3, 'Radio engineer', 'Радиоинженер', { r: 'uncommon' }),
  card('dentist', 2, 'Dentist', 'Стоматолог', { r: 'uncommon' }),
  card('psychiatrist', 2, 'Psychiatrist', 'Психиатр', { r: 'uncommon' }),
  card('microbiologist', 3, 'Microbiologist', 'Микробиолог', { r: 'rare' }),
  card('epidemiologist', 3, 'Epidemiologist', 'Эпидемиолог', { r: 'rare' }),
  card('botanist', 3, 'Botanist', 'Ботаник', { r: 'uncommon' }),
  card('meteorologist', 1, 'Meteorologist', 'Метеоролог'),
  card('cartographer', 1, 'Cartographer', 'Картограф'),
  card('sapper', 2, 'Bomb disposal engineer', 'Сапёр', { r: 'rare' }),
  card('sniper', 1, 'Army sniper', 'Армейский снайпер', { r: 'uncommon' }),
  card('medic_military', 3, 'Combat medic', 'Военный врач', { r: 'rare' }),
  card('diver', 2, 'Commercial diver', 'Водолаз', { r: 'uncommon' }),
  card('chemical_tech', 3, 'Chemical process technician', 'Технолог химического производства', { r: 'uncommon' }),
  card('machinist', 2, 'Machinist', 'Токарь'),
  card('locksmith', 2, 'Locksmith', 'Слесарь'),
  card('it_admin', 1, 'System administrator', 'Системный администратор'),
  card('teacher_primary', 1, 'Primary school teacher', 'Учитель начальных классов'),
  card('midwife_pro', 3, 'Midwife', 'Акушерка', { r: 'rare' }),
  card('nutritionist', 2, 'Nutritionist', 'Диетолог'),
  card('logistician', 2, 'Logistics manager', 'Логист'),
  card('translator', 0, 'Translator', 'Переводчик'),
  card('historian', 0, 'Historian', 'Историк'),
  card('philosopher', -1, 'Philosopher', 'Философ'),
  card('model', -1, 'Fashion model', 'Модель'),
  card('dj', -1, 'DJ', 'Диджей'),
  card('banker', -1, 'Investment banker', 'Инвестиционный банкир'),
  card('realtor', -1, 'Estate agent', 'Риелтор'),
  card('marketer', -1, 'Marketing manager', 'Маркетолог'),
  card('taxidermist', 1, 'Taxidermist', 'Таксидермист'),
  card('gravedigger', 1, 'Gravedigger', 'Могильщик'),
  card('shepherd', 2, 'Shepherd', 'Пастух'),
  card('forester', 2, 'Forest ranger', 'Лесничий'),
  card('tunneller', 3, 'Tunnel engineer', 'Проходчик тоннелей', { r: 'uncommon' }),
];

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

// Knowledge is what a person KNOWS, as opposed to what their hands can do
// (skill) - a distinction that matters the moment the table argues about
// whether theory is worth a place when nobody can put it into practice.
const KNOWLEDGE = [
  card('medicine_theory', 3, 'Medicine, in theory', 'Медицина — в теории', { r: 'uncommon' }),
  card('edible_plants', 3, 'Which plants are edible', 'Какие растения съедобны', { r: 'uncommon' }),
  card('radiation_safety', 3, 'Radiation safety', 'Радиационная безопасность', { r: 'rare' }),
  card('ballistics', 1, 'Ballistics', 'Баллистика'),
  card('electric_theory', 2, 'Electrical theory', 'Теория электричества'),
  card('construction_norms', 2, 'Building codes and load limits', 'Строительные нормы и нагрузки'),
  card('anatomy', 2, 'Human anatomy', 'Анатомия человека'),
  card('meteorology', 1, 'Weather patterns', 'Погодные закономерности'),
  card('geology_knowledge', 2, 'Rocks, soils and groundwater', 'Породы, почвы и грунтовые воды', { r: 'uncommon' }),
  card('law', -1, 'Law', 'Юриспруденция'),
  card('economics', -1, 'Economics', 'Экономика'),
  card('astronomy_knowledge', 0, 'Astronomy', 'Астрономия'),
  card('history_knowledge', 0, 'History', 'История'),
  card('languages_five', 1, 'Five languages', 'Пять языков'),
  card('chemistry_knowledge', 3, 'Chemistry', 'Химия', { r: 'uncommon' }),
  card('microbiology_knowledge', 3, 'Microbiology', 'Микробиология', { r: 'rare' }),
  card('engineering_knowledge', 3, 'Mechanical engineering', 'Инженерная механика', { r: 'uncommon' }),
  card('nothing_known', -2, 'Left school at fourteen', 'Бросил школу в четырнадцать'),
  card('psychology_knowledge', 2, 'Group psychology', 'Психология малых групп', { r: 'uncommon' }),
  card('water_chemistry', 3, 'Water chemistry', 'Химия воды', { r: 'rare' }),
];

// A condition or limitation, kept apart from general health: health says
// how strong a body is, this says what it cannot do.
const CONDITIONS = [
  card('none_cond', 2, 'No limitations at all', 'Никаких ограничений', { r: 'uncommon' }),
  card('peanut_allergy', -1, 'Severe nut allergy', 'Тяжёлая аллергия на орехи'),
  card('needs_insulin', -3, 'Needs insulin every day', 'Ежедневно нужен инсулин', { r: 'uncommon' }),
  card('wheelchair', -2, 'Uses a wheelchair', 'Передвигается в коляске'),
  card('one_arm', -2, 'Lost an arm', 'Нет одной руки'),
  card('blind_one_eye', -1, 'Blind in one eye', 'Не видит одним глазом'),
  card('no_smell', 0, 'No sense of smell', 'Не чувствует запахов'),
  card('lactose', 0, 'Lactose intolerant', 'Непереносимость лактозы'),
  card('gluten', -1, 'Coeliac disease', 'Целиакия'),
  card('back_injury', -1, 'Cannot lift anything heavy', 'Нельзя поднимать тяжести'),
  card('needs_glasses', 0, 'Helpless without glasses', 'Беспомощен без очков'),
  card('heart_condition', -2, 'Heart condition', 'Болезнь сердца'),
  card('mute', -1, 'Cannot speak', 'Не может говорить'),
  card('deaf', -1, 'Deaf', 'Глухота'),
  card('needs_dialysis', -3, 'Needs dialysis', 'Нужен диализ', { r: 'rare' }),
  card('chronic_pain', -1, 'Chronic pain', 'Хроническая боль'),
  card('sleep_apnea', -1, 'Sleep apnoea', 'Апноэ во сне'),
  card('seasonal_allergy', 0, 'Seasonal allergies', 'Сезонная аллергия'),
  card('recovering', 1, 'Recovering from surgery, nearly well', 'Восстанавливается после операции, почти здоров'),
  card('mild_limp', 0, 'A slight limp', 'Лёгкая хромота'),
];

// What a person was before all this. A past is the card that makes a
// table re-read every reveal that came before it.
const PASTS = [
  card('war_veteran', 2, 'Fought in a war', 'Прошёл войну', { r: 'uncommon' }),
  card('prison_ten_years', -2, 'Ten years in prison', 'Десять лет в тюрьме'),
  card('orphanage', 1, 'Grew up in an orphanage', 'Вырос в детском доме'),
  card('village_childhood', 2, 'Grew up in a village without running water', 'Вырос в деревне без водопровода'),
  card('expedition_arctic', 3, 'Spent a winter at a polar station', 'Зимовал на полярной станции', { r: 'rare' }),
  card('survived_earthquake', 2, 'Survived an earthquake under rubble', 'Пережил землетрясение под завалами', { r: 'uncommon' }),
  card('raised_five', 2, 'Raised five children alone', 'В одиночку вырастил пятерых детей', { r: 'uncommon' }),
  card('was_homeless', 2, 'Was homeless for three years', 'Три года жил на улице'),
  card('cult_member', -2, 'Spent years in a cult', 'Годы провёл в секте'),
  card('bankrupt', -1, 'Lost everything in a bankruptcy', 'Потерял всё при банкротстве'),
  card('sailor_years', 2, 'Ten years in the merchant navy', 'Десять лет в торговом флоте', { r: 'uncommon' }),
  card('always_rich', -1, 'Has never worked a day', 'Ни дня не работал'),
  card('lost_family', 0, 'Lost their whole family last year', 'В прошлом году потерял всю семью'),
  card('firefighter_past', 2, 'Was a firefighter for a decade', 'Десять лет служил в пожарной охране', { r: 'uncommon' }),
  card('hospital_volunteer', 1, 'Volunteered in a field hospital', 'Волонтёрил в полевом госпитале'),
  card('ran_a_farm', 3, 'Ran a farm for fifteen years', 'Пятнадцать лет держал хозяйство', { r: 'rare' }),
  card('deserter', -2, 'Deserted their post once', 'Однажды бросил свой пост'),
  card('shipwreck', 2, 'Survived a shipwreck', 'Пережил кораблекрушение', { r: 'uncommon' }),
  card('nothing_notable', 0, 'An entirely ordinary life', 'Совершенно обычная жизнь'),
  card('taught_survival', 3, 'Taught survival courses for years', 'Годами вёл курсы выживания', { r: 'rare' }),
];

// A fear is rarely fatal - but a shelter is small, dark, loud and full of
// other people, and a fear of any of those is an argument.
const PHOBIAS = [
  card('claustrophobia_fear', -3, 'Enclosed spaces', 'Замкнутые пространства', { r: 'uncommon' }),
  card('dark_fear', -2, 'The dark', 'Темнота'),
  card('crowds_fear', -2, 'Crowds and close company', 'Толпа и теснота'),
  card('blood_fear', -2, 'The sight of blood', 'Вид крови'),
  card('height_fear', 0, 'Heights', 'Высота'),
  card('water_fear', -1, 'Deep water', 'Глубокая вода'),
  card('insects_fear', -1, 'Insects', 'Насекомые'),
  card('dogs_fear', 0, 'Dogs', 'Собаки'),
  card('needles_fear', -1, 'Needles and injections', 'Иглы и уколы'),
  card('fire_fear', -1, 'Fire', 'Огонь'),
  card('loneliness_fear', -1, 'Being alone', 'Одиночество'),
  card('radiation_fear', -1, 'Radiation, to the point of paralysis', 'Радиация — до оцепенения'),
  card('death_fear', 0, 'Death, plainly and openly', 'Смерть — прямо и открыто'),
  card('nothing_fear', 2, 'Nothing frightens them', 'Ничего не боится', { r: 'rare' }),
  card('failure_fear', 0, 'Letting people down', 'Подвести людей'),
  card('disease_fear', -1, 'Infection', 'Заражение'),
];

// One thing a character can do that nobody else can. Abilities are the
// loudest cards in the game: they are what a player saves for the round
// they are about to be voted out.
const ABILITIES = [
  card('never_panics', 3, 'Never panics, whatever happens', 'Никогда не паникует, что бы ни случилось', { r: 'rare' }),
  card('photographic', 2, 'Remembers everything they have read', 'Помнит всё, что прочитал', { r: 'uncommon' }),
  card('immune_system', 4, 'Immune to the infection', 'Невосприимчив к заразе', { r: 'legendary' }),
  card('night_vision_nat', 2, 'Sees in near darkness', 'Видит почти в полной темноте', { r: 'rare' }),
  card('endurance_ability', 2, 'Can work for two days without sleep', 'Может работать двое суток без сна', { r: 'uncommon' }),
  card('calms_people', 3, 'Can talk anyone down from anything', 'Способен успокоить кого угодно', { r: 'uncommon' }),
  card('fixes_anything', 3, 'Can repair anything with what is at hand', 'Починит что угодно из того, что под рукой', { r: 'rare' }),
  card('finds_water', 3, 'Finds water anywhere', 'Найдёт воду где угодно', { r: 'rare' }),
  card('eats_little', 2, 'Needs a third of the rations', 'Обходится третью пайка', { r: 'uncommon' }),
  card('heals_fast', 2, 'Heals twice as fast as anyone', 'Заживает вдвое быстрее других', { r: 'uncommon' }),
  card('perfect_aim', 1, 'Never misses', 'Никогда не промахивается'),
  card('reads_people', 2, 'Reads people at a glance', 'Читает людей с первого взгляда', { r: 'uncommon' }),
  card('no_ability', -1, 'Nothing special whatsoever', 'Ничего особенного'),
  card('leads_naturally', 2, 'People follow them without being asked', 'Люди идут за ним без просьб', { r: 'uncommon' }),
  card('cold_resistant', 2, 'Barely feels the cold', 'Почти не чувствует холода'),
  card('smells_gas', 3, 'Smells a gas leak before any sensor', 'Чует утечку газа раньше датчика', { r: 'rare' }),
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

// The original thirteen keep their orders exactly; everything added later
// takes a number after them, so an old save, an old payload and an old
// Creator config all still line up. The ORDER a character sheet is DRAWN
// in is a separate, presentational list on the client - it is free to slot
// the new cards wherever they read best.
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
  { key: 'knowledge', deck: 'knowledge', core: false, order: 14 },
  { key: 'condition', deck: 'condition', core: false, order: 15 },
  { key: 'past', deck: 'past', core: false, order: 16 },
  { key: 'phobia', deck: 'phobia', core: false, order: 17 },
  { key: 'ability', deck: 'ability', core: false, order: 18 },
];

const BAGGAGE_KEYS = CATEGORIES.filter((c) => c.slot === 'baggage').map((c) => c.key);
const SECRET_KEYS = CATEGORIES.filter((c) => c.slot === 'secret').map((c) => c.key);
// Every key the engine can ever deal. The seven original keys come first
// and in their original order, so old saves and old payloads line up.
const ALL_CATEGORY_KEYS = [...CATEGORIES].sort((a, b) => a.order - b.order).map((c) => c.key);
// What a table plays with unless it says otherwise: a full character -
// what they do, what they are, what they know, what they have been
// through, what they are afraid of and the one thing they can do that
// nobody else can, plus two bags and a secret. A host who wants the older,
// shorter sheet simply switches the extra rows off in the settings.
const DEFAULT_CATEGORY_KEYS = [
  'profession', 'biology', 'health', 'condition', 'hobby', 'skill', 'knowledge',
  'trait', 'past', 'phobia', 'ability', 'extra', 'baggage', 'baggage2', 'secret',
];

// The serious catalogue, before the absurd shelf is mixed in.
const STRAIGHT_DECKS = {
  ...legacy.DECKS,
  profession: [...legacy.DECKS.profession, ...PROFESSION_EXTRA],
  baggage: BAGGAGE,
  skill: SKILLS,
  secret: SECRETS,
  knowledge: KNOWLEDGE,
  condition: CONDITIONS,
  past: PASTS,
  phobia: PHOBIAS,
  ability: ABILITIES,
};

// The decks as the engine sees them: everything serious, plus the absurd
// cards for the same deck. Nothing downstream distinguishes them - a
// profession is a profession. Only `deal.js` reads the `a` flag, to decide
// how often (or whether) an absurd card is dealt; a card already in play
// always resolves, so switching absurdity off mid-game breaks nothing.
const DECKS = Object.fromEntries(
  Object.entries(STRAIGHT_DECKS).map(([name, deck]) => [name, [...deck, ...(absurd.DECKS[name] || [])]]),
);

// True for a card from the ridiculous shelf.
function isAbsurd(id) {
  return absurd.ALL_IDS.has(id);
}

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
      // The client draws an absurd card differently - it is a joke the
      // table is allowed to see coming.
      absurd: !!entry.a,
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
  STRAIGHT_DECKS,
  isAbsurd,
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
