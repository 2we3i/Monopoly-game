// absurd.js
// The ridiculous shelf.
//
// A table can play the Bunker straight - surgeons, engineers, farmers - or
// it can let the absurd in. These cards are dealt from the SAME decks as
// everything else (a profession is a profession, however silly), so the
// engine never learns that they exist: `content.js` merges them in and
// `deal.js` decides how often they come up from one setting.
//
// The point is not the joke on its own. Every card here still carries a
// score, and some of the silliest are quietly useful - a man who has
// trained fifteen years for the end of the world really is worth a place,
// and a professional arguer really does ruin a vote. Others are a genuine
// liability dressed as a punchline. A table should never be able to
// dismiss an absurd card without listening to the argument first.
//
// `a: true` marks a card as absurd; that flag is the only thing the rest
// of the code needs to know about this file.

// id, score, English, Russian, extras
const a = (id, s, en, ru, extra = {}) => ({
  id, s, en, ru, r: extra.r || 'common', a: true, ...extra,
});

// --- professions ------------------------------------------------------

const PROFESSIONS = [
  a('mattress_tester', 0, 'Professional mattress tester', 'Профессиональный тестировщик матрасов', { r: 'common' }),
  a('pigeon_speaker', -1, 'Speaks only to pigeons', 'Человек, который разговаривает только с голубями'),
  a('rps_champion', 0, 'Former world Rock-Paper-Scissors champion', 'Бывший чемпион мира по «камень, ножницы, бумага»', { r: 'uncommon' }),
  a('ghost_hunter', 0, 'Professional ghost hunter', 'Профессиональный ловец привидений'),
  a('thinks_cat', -2, 'Convinced they are a cat', 'Человек, который уверен, что он кот'),
  a('microwave_mimic', 0, 'Can imitate a microwave perfectly', 'Идеально имитирует звук микроволновки'),
  // Fifteen years of drills is fifteen years of drills, however funny.
  a('doomsday_prepper', 4, 'Has trained for the apocalypse for 15 years', 'Человек, который 15 лет готовился к концу света', { r: 'rare' }),
  a('tiny_blogger', -1, 'Blogger with an audience of three', 'Блогер с аудиторией из трёх человек'),
  a('zoo_guard_rabbits', 1, 'Ex-zoo keeper who is afraid of rabbits', 'Бывший охранник зоопарка, который боится кроликов'),
  a('series_memorizer', 0, 'Knows every episode of one show by heart', 'Знает наизусть все серии одного сериала'),
  // A professional arguer is exactly what a vote does not need.
  a('professional_arguer', -1, 'Professional arguer', 'Профессиональный спорщик', { r: 'uncommon' }),
  a('pasta_only_cook', 1, 'Can only cook pasta', 'Умеет готовить только макароны'),
  a('the_chosen_one', -1, 'Believes they are the chosen one', 'Считает себя избранным'),
  a('never_online', 1, 'Has never used the internet', 'Никогда не пользовался интернетом'),
  a('alien_witness', 0, 'Swears they have met aliens', 'Утверждает, что видел пришельцев'),
  a('queue_stander', 0, 'Professional queue-stander', 'Профессиональный стояльщик в очередях'),
  a('mall_santa', 0, 'Shopping-centre Santa Claus', 'Дед Мороз из торгового центра'),
  a('sleep_influencer', -1, 'Sleep influencer', 'Инфлюенсер по здоровому сну'),
  a('bubble_wrap_tester', 0, 'Bubble wrap quality inspector', 'Контролёр качества пузырчатой плёнки'),
  a('crystal_healer', -2, 'Crystal healer', 'Целитель кристаллами'),
  a('escalator_inspector', 1, 'Escalator inspector', 'Инспектор эскалаторов'),
  a('professional_mourner', 0, 'Professional mourner', 'Профессиональная плакальщица'),
  a('cheese_sniffer', 1, 'Cheese quality sniffer', 'Профессиональный нюхач сыра'),
  a('mascot', 1, 'Full-time sports mascot', 'Профессиональный талисман команды'),
  a('lego_master', 2, 'Certified LEGO master builder', 'Сертифицированный мастер LEGO', { r: 'uncommon' }),
  a('flat_earther', -2, 'Flat-earth lecturer', 'Лектор общества плоской Земли'),
  a('conspiracy_blogger', -1, 'Conspiracy blogger', 'Блогер-конспиролог'),
  a('mime', 0, 'Street mime', 'Уличный мим'),
  a('worm_farmer', 3, 'Worm farmer', 'Червевод', { r: 'uncommon' }),
  a('cave_tour_guide', 3, 'Cave tour guide', 'Экскурсовод по пещерам', { r: 'uncommon' }),
  a('sewer_diver', 3, 'Sewer diver', 'Водолаз канализационных сетей', { r: 'rare' }),
  a('lift_operator', 0, 'Lift operator', 'Лифтёр'),
  a('professional_taster', 1, 'Professional food taster', 'Профессиональный дегустатор'),
  a('reality_show_winner', 0, 'Survival reality show winner', 'Победитель реалити-шоу о выживании', { r: 'uncommon' }),
  a('larper', 1, 'Full-time medieval re-enactor', 'Реконструктор Средневековья'),
  a('speedrunner', 0, 'World-record speedrunner', 'Спидранер с мировым рекордом'),
  a('asmr_artist', 0, 'ASMR artist', 'ASMR-блогер'),
  a('fortune_teller', -1, 'Fortune teller', 'Гадалка'),
  a('mushroom_influencer', 2, 'Mushroom foraging influencer', 'Блогер о сборе грибов', { r: 'uncommon' }),
  a('professional_napper', 0, 'Professional napper for science', 'Профессиональный спящий в исследованиях сна'),
  a('hot_dog_champion', -1, 'Competitive eating champion', 'Чемпион по скоростному поеданию'),
  a('balloon_animals', 0, 'Balloon animal artist', 'Мастер фигурок из шариков'),
  a('penguin_keeper', 1, 'Penguin keeper', 'Смотритель пингвинов'),
  a('doorbell_tester', 0, 'Doorbell sound designer', 'Дизайнер звуков дверных звонков'),
  a('professional_loser', 0, 'Professional game-show loser', 'Профессиональный проигравший на телешоу'),
];

// --- hobbies ----------------------------------------------------------

const HOBBIES = [
  a('extreme_ironing', 1, 'Extreme ironing', 'Экстремальная глажка'),
  a('competitive_sleeping', 0, 'Competitive sleeping', 'Соревновательный сон'),
  a('pigeon_racing', 1, 'Pigeon racing', 'Голубиные гонки'),
  a('canning_everything', 3, 'Pickling absolutely everything', 'Консервирование всего подряд', { r: 'uncommon' }),
  a('conspiracy_boards', 0, 'Building conspiracy boards with string', 'Доски с нитками и фотографиями'),
  a('doomsday_shopping', 2, 'Stockpiling tinned food', 'Закупка консервов впрок'),
  a('lockpicking', 2, 'Lockpicking as a hobby', 'Вскрытие замков как хобби', { r: 'uncommon' }),
  a('metal_detecting', 1, 'Metal detecting', 'Поиск металлоискателем'),
  a('bug_eating', 2, 'Cooking insects', 'Кулинария из насекомых', { r: 'uncommon' }),
  a('cosplay', 0, 'Cosplay', 'Косплей'),
  a('mushroom_picking', 2, 'Mushroom picking', 'Тихая охота за грибами'),
  a('ham_conspiracies', 1, 'Listening to numbers stations', 'Прослушивание радиостанций-шифровок'),
  a('taxidermy', 1, 'Taxidermy', 'Таксидермия'),
  a('competitive_staring', 0, 'Competitive staring contests', 'Соревнования в гляделки'),
  a('yodelling', 0, 'Yodelling', 'Йодль'),
  a('crochet_army', 1, 'Crocheting an army of tiny animals', 'Вязание армии маленьких зверей'),
  a('cave_diving', 2, 'Cave diving', 'Спелеодайвинг', { r: 'uncommon' }),
  a('drone_racing', 1, 'Drone racing', 'Гонки дронов'),
  a('urban_exploring', 2, 'Urban exploration', 'Диггерство и заброшки', { r: 'uncommon' }),
  a('collecting_batteries', 1, 'Collecting batteries', 'Коллекционирование батареек'),
];

// --- traits -----------------------------------------------------------

const TRAITS = [
  a('always_right', -2, 'Has never once admitted being wrong', 'Ни разу в жизни не признал свою неправоту'),
  a('narrates_life', -1, 'Narrates their own life out loud', 'Комментирует вслух всё, что делает'),
  a('agrees_everyone', -1, 'Agrees with whoever spoke last', 'Соглашается с тем, кто говорил последним'),
  a('collects_grudges', -2, 'Remembers every slight forever', 'Помнит каждую обиду вечно'),
  a('aggressively_polite', 1, 'Aggressively polite', 'Агрессивно вежливый'),
  a('laughs_at_danger', 0, 'Laughs at the wrong moments', 'Смеётся в самые неподходящие моменты'),
  a('overshares', 0, 'Cannot keep a single secret', 'Не может удержать ни одного секрета'),
  a('conspiracy_minded', -1, 'Suspects everyone of everything', 'Подозревает всех во всём'),
  a('relentless_optimist', 1, 'Relentlessly, exhaustingly optimistic', 'Неутомимо, изматывающе оптимистичен'),
  a('talks_to_objects', 0, 'Talks to the equipment', 'Разговаривает с приборами'),
  a('born_organiser', 2, 'Organises everything and everyone', 'Организует всё и всех', { r: 'uncommon' }),
  a('rules_lawyer', 0, 'Argues about rules for hours', 'Часами спорит о правилах'),
];

// --- extra facts ------------------------------------------------------

const EXTRAS = [
  a('ate_nothing_week', 2, 'Once went a week without food on a bet', 'Однажды неделю не ел на спор', { r: 'uncommon' }),
  a('knows_all_bunkers', 2, 'Has read every bunker forum on the internet', 'Прочитал все форумы о бункерах', { r: 'uncommon' }),
  a('lucky', 1, 'Has won three lotteries', 'Трижды выигрывал в лотерею', { r: 'rare' }),
  a('cursed', -1, 'Every device they touch breaks', 'Всё, к чему прикасается, ломается'),
  a('smells_rain', 1, 'Can smell rain a day ahead', 'Чувствует дождь за сутки'),
  a('never_sick', 2, 'Has not been ill in twenty years', 'Не болел двадцать лет', { r: 'uncommon' }),
  a('eats_anything', 2, 'Will eat literally anything', 'Ест буквально что угодно'),
  a('memorized_manual', 2, 'Memorised a bunker maintenance manual for fun', 'Выучил наизусть инструкцию по обслуживанию бункера', { r: 'rare' }),
  a('afraid_of_dark_loud', -1, 'Screams in the dark', 'Кричит в темноте'),
  a('nine_lives', 1, 'Has survived four serious accidents', 'Пережил четыре серьёзные аварии'),
  a('hoards_batteries', 1, 'Carries batteries everywhere', 'Всегда носит с собой батарейки'),
  a('sleeps_standing', 1, 'Can sleep standing up', 'Умеет спать стоя'),
  a('snores_symphony', -2, 'Snores loudly enough to be heard two rooms away', 'Храпит так, что слышно через две комнаты'),
  a('hums_constantly', -1, 'Hums constantly and does not notice', 'Постоянно мычит себе под нос и не замечает'),
  a('unbeatable_at_cards', 0, 'Has never lost at cards', 'Ни разу не проигрывал в карты'),
];

// --- knowledge --------------------------------------------------------

const KNOWLEDGE = [
  a('memes', -1, 'Encyclopaedic knowledge of memes', 'Энциклопедические знания о мемах'),
  a('soap_operas', -1, 'Every plot of every soap opera', 'Сюжеты всех сериалов наизусть'),
  a('conspiracies', 0, 'Every conspiracy theory ever printed', 'Все теории заговора, что были напечатаны'),
  a('football_stats', -1, 'Football statistics since 1954', 'Футбольная статистика с 1954 года'),
  a('wine_varieties', 0, 'Four hundred grape varieties', 'Четыреста сортов винограда'),
  a('board_game_rules', 1, 'The rules of two hundred board games', 'Правила двухсот настольных игр'),
  a('dinosaurs', 0, 'Everything about dinosaurs', 'Всё о динозаврах'),
  a('mushroom_lore', 3, 'Which mushrooms kill and which feed', 'Какие грибы убивают, а какие кормят', { r: 'uncommon' }),
  a('knot_theory', 1, 'Two hundred knots by name', 'Двести узлов по именам'),
];

// --- special abilities ------------------------------------------------

const ABILITIES = [
  a('perfect_microwave', 0, 'Imitates any machine sound perfectly', 'Идеально имитирует звук любой техники'),
  a('never_lost', 2, 'Never gets lost anywhere', 'Никогда и нигде не теряется', { r: 'uncommon' }),
  a('sleeps_anywhere', 2, 'Falls asleep anywhere in one minute', 'Засыпает где угодно за минуту'),
  a('reads_faces', 2, 'Always knows when someone is lying', 'Всегда знает, когда человек врёт', { r: 'rare' }),
  a('eats_expired', 2, 'Can eat spoiled food without consequence', 'Ест испорченную еду без последствий', { r: 'uncommon' }),
  a('holds_breath', 1, 'Holds their breath for five minutes', 'Задерживает дыхание на пять минут'),
  a('animal_whisperer', 2, 'Animals do whatever they ask', 'Животные слушаются его беспрекословно', { r: 'uncommon' }),
  a('one_hand_everything', 1, 'Does everything one-handed', 'Всё делает одной рукой'),
  a('perfect_pitch_machines', 2, 'Hears a machine about to break', 'На слух определяет поломку до того, как она случилась', { r: 'rare' }),
  a('cat_nine_lives', 0, 'Insists they have eight lives left', 'Утверждает, что у него осталось восемь жизней'),
];

// --- fears ------------------------------------------------------------

const PHOBIAS = [
  a('fear_rabbits', 0, 'Terrified of rabbits', 'Панически боится кроликов'),
  a('fear_cheese', 0, 'Terrified of cheese', 'Панически боится сыра'),
  a('fear_buttons', 0, 'Cannot touch buttons', 'Не может прикасаться к пуговицам'),
  a('fear_own_reflection', -1, 'Afraid of their own reflection', 'Боится собственного отражения'),
  a('fear_silence', -1, 'Cannot stand silence', 'Не выносит тишину'),
  a('fear_numbers', 0, 'Afraid of the number seven', 'Боится числа семь'),
  a('fear_beards', 0, 'Afraid of beards', 'Боится бород'),
];

// --- baggage ----------------------------------------------------------

const BAGGAGE = [
  a('inflatable_boat_toy', 0, 'An inflatable flamingo', 'Надувной фламинго', { r: 'common', g: '🦩', en_d: 'Two metres of pink optimism.', ru_d: 'Два метра розового оптимизма.' }),
  a('garden_gnome', 0, 'A garden gnome', 'Садовый гном', { r: 'common', g: '🧙', en_d: 'Heavy. Watching. Ceramic.', ru_d: 'Тяжёлый. Наблюдает. Керамический.' }),
  a('box_of_rubber_ducks', 0, 'A crate of rubber ducks', 'Ящик резиновых уточек', { r: 'common', g: '🦆', en_d: 'Two hundred of them. Nobody knows why.', ru_d: 'Двести штук. Никто не знает зачем.' }),
  a('bag_of_batteries', 3, 'A sack of assorted batteries', 'Мешок разных батареек', { r: 'uncommon', g: '🔋', en_d: 'Some of them even work.', ru_d: 'Часть из них даже работает.' }),
  a('novelty_hat', 0, 'A hat with a propeller', 'Шапка с пропеллером', { r: 'common', g: '🧢', en_d: 'Morale, technically.', ru_d: 'Формально — боевой дух.' }),
  a('accordion', -1, 'An accordion', 'Аккордеон', { r: 'common', g: '🪗', en_d: 'Two years. In a sealed room.', ru_d: 'Два года. В закрытом помещении.' }),
  a('mystery_jar', 1, 'A jar of something pickled', 'Банка чего-то маринованного', { r: 'common', g: '🫙', hidden: 'half_spoiled', en_d: 'The label fell off in 2019.', ru_d: 'Этикетка отклеилась в 2019-м.' }),
  a('cursed_painting', 0, 'A portrait that follows you', 'Портрет, который следит за тобой', { r: 'uncommon', g: '🖼️', hidden: 'false_bottom', en_d: 'It really does. Everyone checks.', ru_d: 'Правда следит. Все проверяли.' }),
  a('bucket_of_glitter', -1, 'A bucket of glitter', 'Ведро блёсток', { r: 'common', g: '✨', en_d: 'It will never leave the bunker.', ru_d: 'Она останется в бункере навсегда.' }),
  a('ten_thousand_matches', 3, 'Ten thousand matches', 'Десять тысяч спичек', { r: 'uncommon', g: '🔥', en_d: 'Someone planned ahead. Sort of.', ru_d: 'Кто-то подготовился. Своеобразно.' }),
  a('life_size_cutout', 0, 'A cardboard cut-out of a celebrity', 'Картонная фигура знаменитости', { r: 'common', g: '🪧', en_d: 'Company, of a kind.', ru_d: 'Компания. Своего рода.' }),
  a('metal_detector', 2, 'A metal detector', 'Металлоискатель', { r: 'uncommon', g: '📡', hidden: 'batteries_low', en_d: 'Finds nails, coins and buried doors.', ru_d: 'Находит гвозди, монеты и засыпанные двери.' }),
];

// --- pasts ------------------------------------------------------------

const PASTS = [
  a('lived_in_barrel', 2, 'Lived in a barrel for a year on a bet', 'Год прожил в бочке на спор', { r: 'uncommon' }),
  a('escaped_circus', 1, 'Ran away with a circus and came back', 'Сбежал с цирком и вернулся'),
  a('sued_a_pigeon', 0, 'Once took a pigeon to court', 'Однажды судился с голубем'),
  a('ruled_a_forum', 0, 'Moderated a forum of forty thousand people', 'Модерировал форум на сорок тысяч человек'),
  a('fake_royalty', -1, 'Pretended to be minor royalty for six years', 'Шесть лет выдавал себя за особу королевских кровей'),
  a('ate_only_soup', 0, 'Ate nothing but soup for three years', 'Три года ел только суп'),
  a('survived_avalanche', 2, 'Was dug out of an avalanche alive', 'Был откопан живым из-под лавины', { r: 'uncommon' }),
];

const DECKS = {
  profession: PROFESSIONS,
  hobby: HOBBIES,
  trait: TRAITS,
  extra: EXTRAS,
  knowledge: KNOWLEDGE,
  ability: ABILITIES,
  phobia: PHOBIAS,
  baggage: BAGGAGE,
  past: PASTS,
};

// Every absurd id, so a lookup can tell at a glance what came from here.
const ALL_IDS = new Set(Object.values(DECKS).flat().map((entry) => entry.id));

module.exports = { DECKS, ALL_IDS };
