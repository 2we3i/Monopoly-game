// content/boards.js
// The rules of the games played on a board: Landmark (the Monopoly-style
// mode), Catan, Citadels, Cosmic Encounter and the Iron Throne.
//
// Same eight blocks as content/social.js - see the note at the top of that
// file for why they are the same, and why the text is bilingual data
// rather than translation keys.

const L = (en, ru) => ({ en, ru });

export const monopoly = {
  emoji: '🏙️',
  title: L('Landmark', 'Landmark'),
  tagline: L('Buy the board, charge the rent, outlast everybody else.', 'Скупите доску, берите аренду, переживите всех остальных.'),

  goal: L(
    'Go round the board buying property. Once you own everything of one colour you can build on it, and the rent stops being an inconvenience and starts being fatal. The last player who has not gone bankrupt wins.',
    'Ходите по доске и скупайте участки. Собрав полный цвет, вы можете строить — и аренда из мелкой неприятности превращается в смертельную. Побеждает тот, кто последним остался не банкротом.',
  ),

  short: [
    L('Roll, move, and do whatever the tile you landed on says.', 'Бросайте кубики, двигайтесь и делайте то, что требует клетка.'),
    L('An unowned property is yours to buy - or it goes to auction for everybody.', 'Свободный участок можно купить, иначе он уходит на аукцион для всех.'),
    L('Land on someone else\'s property and you pay them rent.', 'Попали на чужой участок — платите аренду владельцу.'),
    L('A full colour set lets you build houses, and then a hotel. Rent multiplies.', 'Полный цвет позволяет строить дома, а затем отель. Аренда растёт кратно.'),
    L('Run out of money with debts you cannot cover and you are out.', 'Кончились деньги, а долг закрыть нечем — вы выбываете.'),
  ],

  flow: [
    { id: 'ROLL', glyph: '🎲', title: L('1. Roll', '1. Бросок'), text: L('Two dice. Doubles give you another roll - three doubles in a row send you to jail.', 'Два кубика. Дубль даёт ещё один бросок; три дубля подряд отправляют в тюрьму.') },
    { id: 'ACTION', glyph: '🏠', title: L('2. The tile', '2. Клетка'), text: L('Buy, pay rent, draw a card, pay tax - whatever you landed on.', 'Покупка, аренда, карта, налог — что выпало, то и делаете.') },
    { id: 'MANAGE', glyph: '🔨', title: L('3. Manage', '3. Управление'), text: L('Build, mortgage, or trade with anyone who will talk to you.', 'Стройте, закладывайте участки или торгуйтесь с теми, кто готов говорить.') },
    { id: 'END', glyph: '➡️', title: L('4. End the turn', '4. Конец хода'), text: L('The turn passes on. Trades can still reach you between turns.', 'Ход переходит дальше. Предложения обмена могут приходить и между ходами.') },
  ],

  ui: [
    { glyph: '💰', title: L('Your balance', 'Ваш баланс'), text: L('Cash in hand. It does not include what your property is worth.', 'Наличные на руках. Стоимость недвижимости в него не входит.') },
    { glyph: '🏘️', title: L('Property chips', 'Фишки участков'), text: L('Your deeds, grouped by colour. A complete set is highlighted - that is when you can build.', 'Ваши активы, сгруппированные по цветам. Полный набор подсвечен — с этого момента можно строить.') },
    { glyph: '🔨', title: L('Houses and hotels', 'Дома и отели'), text: L('Small marks on a tile. Each one multiplies the rent.', 'Маленькие отметки на клетке. Каждая кратно повышает аренду.') },
    { glyph: '🤝', title: L('Trade panel', 'Панель обмена'), text: L('Offer money, property and jail cards in any combination. Both sides have to accept.', 'Предлагайте деньги, участки и карты освобождения в любых сочетаниях. Согласиться должны обе стороны.') },
    { glyph: '🔨', title: L('Auction', 'Аукцион'), text: L('When a property is refused, everybody bids. The last bid takes it.', 'Если от участка отказались, ставки делают все. Участок уходит последней ставке.') },
  ],

  win: L('You win by being the last player still solvent. Everything else - the sets, the hotels, the trades - is a way of getting there.', 'Побеждает последний, кто остался платёжеспособным. Всё остальное — наборы, отели, обмены — лишь способ до этого дойти.'),

  actions: [
    { glyph: '🎲', title: L('Roll', 'Бросить кубики'), text: L('At the start of your turn.', 'В начале своего хода.') },
    { glyph: '💵', title: L('Buy or decline', 'Купить или отказаться'), text: L('When you land on unowned property. Declining sends it to auction.', 'Когда встали на свободный участок. Отказ отправляет его на аукцион.') },
    { glyph: '🔨', title: L('Build and mortgage', 'Строить и закладывать'), text: L('On your turn, on colour sets you own in full.', 'В свой ход, на полностью собранных цветах.') },
    { glyph: '🤝', title: L('Trade', 'Обмен'), text: L('At any time, with any player.', 'В любой момент, с любым игроком.') },
  ],

  special: [
    { title: L('Jail', 'Тюрьма'), text: L('You can pay, use a card, or try for a double three times. In jail you still collect rent.', 'Можно заплатить, использовать карту или трижды попытаться выбросить дубль. В тюрьме аренда всё равно капает.') },
    { title: L('Mortgages', 'Залог'), text: L('A mortgaged property pays no rent until it is bought back, with interest.', 'Заложенный участок не приносит аренду, пока его не выкупят — с процентом.') },
    { title: L('Bankruptcy', 'Банкротство'), text: L('If you cannot pay, you sell and mortgage what you can. If it is still not enough, you are out and your property goes to your creditor.', 'Если платить нечем, вы продаёте и закладываете, что можете. Если и этого мало — вы выбываете, а имущество уходит кредитору.') },
  ],

  end: [
    { title: L('One player left', 'Остался один'), text: L('Everyone else has gone bankrupt.', 'Все остальные обанкротились.') },
  ],
};

export const catan = {
  emoji: '🌾',
  title: L('Catan', 'Катан'),
  tagline: L('Settle the island, trade what you lack, get to ten points first.', 'Заселите остров, выменяйте недостающее и первым доберитесь до десяти очков.'),

  goal: L(
    'Build settlements and cities on an island of hexes. Each hex produces a resource when its number is rolled, and resources buy roads, settlements, cities and development cards. Ten victory points wins.',
    'Стройте поселения и города на острове из гексов. Каждый гекс даёт ресурс, когда выпадает его число, а ресурсы идут на дороги, поселения, города и карты развития. Победа — десять очков.',
  ),

  short: [
    L('Everyone places two settlements and two roads to start.', 'В начале каждый ставит два поселения и две дороги.'),
    L('On your turn: roll, then build and trade, then end the turn.', 'В свой ход: бросок, затем стройка и торговля, затем конец хода.'),
    L('Every roll pays EVERYONE whose settlements touch that number.', 'Каждый бросок приносит ресурсы ВСЕМ, чьи поселения касаются выпавшего числа.'),
    L('A seven moves the robber, blocks a hex and makes big hands discard.', 'Семёрка двигает разбойника, блокирует гекс и заставляет сбрасывать большие руки.'),
    L('First to ten victory points wins.', 'Побеждает первый, кто набрал десять очков.'),
  ],

  flow: [
    { id: 'SETUP', glyph: '📍', title: L('0. Setup', '0. Расстановка'), text: L('Two settlements and two roads each, placed in order and then back again. The second settlement pays you immediately.', 'По два поселения и две дороги, по очереди туда и обратно. За второе поселение ресурсы начисляются сразу.') },
    { id: 'ROLL', glyph: '🎲', title: L('1. Roll', '1. Бросок'), text: L('Two dice. Every player collects from hexes with that number.', 'Два кубика. Ресурсы с гексов этого числа получают все игроки.') },
    { id: 'ROBBER', glyph: '🦹', title: L('2. On a seven', '2. Если семь'), text: L('Anyone holding more than seven cards discards half. Then you move the robber and steal one card.', 'У кого больше семи карт — сбрасывает половину. Затем вы двигаете разбойника и крадёте одну карту.') },
    { id: 'BUILD', glyph: '🔨', title: L('3. Build and trade', '3. Стройка и торговля'), text: L('Trade with players or with the bank at your ports, then build whatever you can pay for.', 'Торгуйте с игроками или с банком через порты, затем стройте всё, что можете оплатить.') },
  ],

  ui: [
    { glyph: '🎴', title: L('Your resources', 'Ваши ресурсы'), text: L('Brick, wood, wool, grain, ore. Only you see the exact hand.', 'Глина, лес, шерсть, зерно, руда. Точную руку видите только вы.') },
    { glyph: '🔢', title: L('Numbers on hexes', 'Числа на гексах'), text: L('The chance of that number coming up - the dots underneath say how likely it is.', 'Вероятность выпадения: точки под числом показывают, насколько оно частое.') },
    { glyph: '🦹', title: L('The robber', 'Разбойник'), text: L('The hex he sits on produces nothing at all.', 'Гекс, на котором он стоит, не даёт ничего.') },
    { glyph: '🏆', title: L('Points', 'Очки'), text: L('Settlements 1, cities 2, plus the longest road, the largest army and hidden point cards.', 'Поселение — 1, город — 2, плюс длинная дорога, большая армия и скрытые карты очков.') },
  ],

  win: L('Ten victory points on your own turn. Hidden development-point cards count, which is why a player on eight can win out of nowhere.', 'Десять очков в свой ход. Скрытые карты очков тоже считаются — поэтому игрок с восемью очками может выиграть внезапно.'),

  actions: [
    { glyph: '🎲', title: L('Roll', 'Бросок'), text: L('Start of your turn, once.', 'В начале хода, один раз.') },
    { glyph: '🔨', title: L('Build', 'Строить'), text: L('Roads, settlements, cities - as often as you can pay.', 'Дороги, поселения, города — сколько сможете оплатить.') },
    { glyph: '🤝', title: L('Trade', 'Торговать'), text: L('With players on your turn; with the bank at your own rate.', 'С игроками — в свой ход; с банком — по своему курсу.') },
    { glyph: '📜', title: L('Development cards', 'Карты развития'), text: L('Buy any time on your turn, play one per turn.', 'Покупайте в свой ход сколько угодно, разыгрывайте по одной за ход.') },
  ],

  special: [
    { title: L('The distance rule', 'Правило расстояния'), text: L('No two settlements may sit on neighbouring corners.', 'Два поселения не могут стоять на соседних узлах.') },
    { title: L('Longest road and largest army', 'Длинная дорога и большая армия'), text: L('Two points each, and they move to whoever overtakes you.', 'По два очка каждая, и они переходят к тому, кто вас обгонит.') },
  ],

  end: [
    { title: L('Ten points', 'Десять очков'), text: L('Counted on your own turn, hidden cards included.', 'Считаются в ваш ход, вместе со скрытыми картами.') },
  ],
};

export const citadels = {
  emoji: '🏰',
  title: L('Citadels', 'Цитадели'),
  tagline: L('Pick a role in secret, then act in its order - if you survive being called.', 'Тайно выберите роль и ходите в её очередь — если доживёте до вызова.'),

  goal: L(
    'Build a city of districts. Each round you secretly choose a role: the role decides when you act and what you can do, and two of them can ruin somebody else\'s round entirely.',
    'Постройте город из районов. Каждый раунд вы тайно выбираете роль: она определяет, когда вы ходите и что можете, а две из них способны испортить чужой раунд целиком.',
  ),

  short: [
    L('Each round, players pick roles one at a time from a shrinking pile.', 'Каждый раунд игроки по очереди выбирают роли из уменьшающейся стопки.'),
    L('Roles are called in rank order, 1 to 8.', 'Роли вызываются по рангу, с первого по восьмой.'),
    L('On your turn take two gold or a card, then build one district.', 'В свой ход возьмите две монеты или карту, затем постройте один район.'),
    L('The assassin kills a role; the thief robs one. Neither knows who chose it.', 'Убийца убивает роль, вор её обкрадывает. Ни тот, ни другой не знает, кто её взял.'),
    L('The first to finish their city ends the game.', 'Кто первым достроит город — тот и завершает игру.'),
  ],

  flow: [
    { id: 'DRAFT', glyph: '🎭', title: L('1. Choose a role', '1. Выбор роли'), text: L('In secret, one player at a time. What you do not take passes to the next player.', 'Тайно, по одному игроку. Что не взяли — уходит следующему.') },
    { id: 'TURNS', glyph: '⚜️', title: L('2. Roles are called', '2. Вызов ролей'), text: L('From rank 1 upwards. If your role was assassinated you lose the whole turn.', 'С первого ранга и выше. Если вашу роль убили, вы теряете весь ход.') },
    { id: 'ACTION', glyph: '🏗️', title: L('3. Your turn', '3. Ваш ход'), text: L('Gold or a card, your role\'s ability, and one district built.', 'Золото или карта, способность роли и один построенный район.') },
  ],

  ui: [
    { glyph: '🎭', title: L('The role row', 'Ряд ролей'), text: L('Which roles are face up, which have been called, and which is acting now.', 'Какие роли открыты, какие уже вызваны и какая ходит сейчас.') },
    { glyph: '🪙', title: L('Gold', 'Золото'), text: L('What you can spend this turn. Districts cost their printed price.', 'Сколько вы можете потратить в этот ход. Район стоит указанную цену.') },
    { glyph: '🏘️', title: L('A city', 'Город'), text: L('The districts in front of a player. Colours matter for some roles\' income.', 'Районы перед игроком. Цвета важны для дохода некоторых ролей.') },
  ],

  win: L('When somebody completes their city the round is finished and the highest total wins - built value, plus bonuses for finishing first and for a city of every colour.', 'Когда кто-то достраивает город, раунд доигрывается, и побеждает наибольшая сумма: стоимость построенного плюс бонусы за первое завершение и за город всех цветов.'),

  actions: [
    { glyph: '🎭', title: L('Pick a role', 'Выбрать роль'), text: L('In the draft, when it is your turn to pick.', 'В драфте, когда очередь выбирать дошла до вас.') },
    { glyph: '🪙', title: L('Take gold or a card', 'Взять золото или карту'), text: L('At the start of your turn - one or the other.', 'В начале хода — одно из двух.') },
    { glyph: '🏗️', title: L('Build', 'Строить'), text: L('One district a turn, unless your role says otherwise.', 'Один район за ход, если роль не говорит иначе.') },
    { glyph: '✨', title: L('Use your ability', 'Использовать способность'), text: L('Once per turn, while your role is being called.', 'Один раз за ход, пока вызвана ваша роль.') },
  ],

  special: [
    { title: L('The assassin and the thief', 'Убийца и вор'), text: L('They name a ROLE, not a player. Whoever took it loses their turn, or their gold.', 'Они называют РОЛЬ, а не игрока. Кто её взял — теряет ход или всё золото.') },
    { title: L('The warlord', 'Военачальник'), text: L('Can destroy one district in somebody else\'s city, for one gold less than it cost.', 'Может разрушить один район в чужом городе, заплатив на монету меньше его цены.') },
  ],

  end: [
    { title: L('A finished city', 'Достроенный город'), text: L('The round in which a player completes their city is the last one.', 'Раунд, в котором игрок достроил город, становится последним.') },
  ],
};

export const cosmic = {
  emoji: '🚀',
  title: L('Cosmic Encounter', 'Cosmic Encounter'),
  tagline: L('Every alien breaks a different rule. Five colonies and you win.', 'Каждый инопланетянин ломает своё правило. Пять колоний — и вы победили.'),

  goal: L(
    'Establish five colonies on planets outside your own system. Every player has an alien power that breaks one rule of the game permanently, in their favour - reading the other powers is half the game.',
    'Основать пять колоний на планетах вне своей системы. У каждого игрока есть сила, которая навсегда ломает одно правило игры в его пользу, — половина игры в том, чтобы читать чужие силы.',
  ),

  short: [
    L('On your turn you draw destiny, which decides whose system you attack.', 'В свой ход вы тянете судьбу, которая решает, в чью систему вы нападёте.'),
    L('You send up to four ships; both sides may invite allies.', 'Вы отправляете до четырёх кораблей; обе стороны могут звать союзников.'),
    L('Both main players play a card face down: attack (a number) or negotiate (a deal).', 'Оба главных игрока кладут карту рубашкой вверх: атака (число) или переговоры (сделка).'),
    L('Ships plus attack value decides it. Losing ships go to the warp.', 'Решают корабли плюс значение атаки. Проигравшие корабли уходят в варп.'),
    L('Five foreign colonies wins - and two players can win together.', 'Пять чужих колоний — победа, и победить вдвоём тоже можно.'),
  ],

  flow: [
    { id: 'REGROUP', glyph: '♻️', title: L('1. Regroup', '1. Перегруппировка'), text: L('Take one ship back from the warp, if you have any there.', 'Заберите один корабль из варпа, если он там есть.') },
    { id: 'DESTINY', glyph: '🔮', title: L('2. Destiny', '2. Судьба'), text: L('Draw a card: it names the system you are attacking.', 'Тяните карту: она называет систему, в которую вы нападаете.') },
    { id: 'LAUNCH', glyph: '🚀', title: L('3. Launch', '3. Запуск'), text: L('Choose a planet in that system and put up to four ships through the gate.', 'Выберите планету в этой системе и отправьте через врата до четырёх кораблей.') },
    { id: 'ALLIANCE', glyph: '🤝', title: L('4. Alliances', '4. Союзы'), text: L('Both sides invite; everyone else decides which side to join, if any.', 'Обе стороны приглашают; остальные решают, к кому примкнуть — и примыкать ли вообще.') },
    { id: 'PLANNING', glyph: '🃏', title: L('5. Planning', '5. Планирование'), text: L('The two main players each play one encounter card face down.', 'Оба главных игрока кладут по одной карте столкновения рубашкой вверх.') },
    { id: 'RESOLUTION', glyph: '💥', title: L('6. Resolution', '6. Развязка'), text: L('Cards are revealed together and the encounter is settled.', 'Карты вскрываются одновременно, и столкновение разрешается.') },
  ],

  ui: [
    { glyph: '🪐', title: L('Systems', 'Системы'), text: L('Five planets each. Ships on a planet you do not own are a colony.', 'По пять планет у каждого. Корабли на чужой планете — это колония.') },
    { glyph: '👽', title: L('Your alien', 'Ваш инопланетянин'), text: L('Says which rule you break, and when. Read it before your first encounter.', 'Говорит, какое правило вы ломаете и когда. Прочитайте до первого столкновения.') },
    { glyph: '🌀', title: L('The warp', 'Варп'), text: L('Where lost ships go. One comes back at the start of each of your turns.', 'Куда уходят потерянные корабли. Один возвращается в начале каждого вашего хода.') },
  ],

  win: L('Five colonies on planets outside your own system. If two players get there in the same encounter, they win together.', 'Пять колоний на планетах вне своей системы. Если двое достигают этого в одном столкновении, они побеждают вместе.'),

  actions: [
    { glyph: '🔮', title: L('Draw destiny', 'Тянуть судьбу'), text: L('On your own turn.', 'В свой ход.') },
    { glyph: '🚀', title: L('Send ships', 'Отправить корабли'), text: L('As an attacker, or as an ally when invited.', 'Как атакующий — или как союзник, если позвали.') },
    { glyph: '🃏', title: L('Play a card', 'Сыграть карту'), text: L('As one of the two main players in the planning phase.', 'Как один из двух главных игроков в фазе планирования.') },
    { glyph: '💎', title: L('Play an artifact', 'Разыграть артефакт'), text: L('Whenever its own text says you may.', 'Когда это разрешает его собственный текст.') },
  ],

  special: [
    { title: L('Negotiate', 'Переговоры'), text: L('Two negotiates means a deal: the pair have a minute to agree a trade, or both lose ships.', 'Две карты переговоров — это сделка: у пары есть минута договориться, иначе оба теряют корабли.') },
    { title: L('Allies are paid', 'Союзникам платят'), text: L('Winning allies take a colony or draw cards. Losing allies lose their ships.', 'Победившие союзники получают колонию или карты. Проигравшие теряют корабли.') },
  ],

  end: [
    { title: L('Five colonies', 'Пять колоний'), text: L('Checked the moment an encounter is resolved.', 'Проверяется в момент разрешения столкновения.') },
  ],
};

export const throne = {
  emoji: '🐺',
  title: L('The Iron Throne', 'Железный трон'),
  tagline: L('Orders written in secret, revealed all at once.', 'Приказы пишутся тайно и раскрываются одновременно.'),

  goal: L(
    'Take seven castles and strongholds before anybody else. Armies matter, but the influence tracks - who acts first, who wins ties, who commands the fleets - decide as much as the battles.',
    'Захватить семь замков и крепостей раньше остальных. Армии важны, но треки влияния — кто ходит первым, кто выигрывает ничьи, кто командует флотами — решают не меньше сражений.',
  ),

  short: [
    L('Each round starts with Westeros cards that change the rules for everyone.', 'Каждый раунд начинается с карт Вестероса, которые меняют правила для всех.'),
    L('Then everyone places orders face down on their own areas, at the same time.', 'Затем все одновременно раскладывают приказы рубашкой вверх на своих областях.'),
    L('Orders are revealed together and resolved in a fixed order: raid, march, consolidate power.', 'Приказы вскрываются разом и исполняются в строгом порядке: налёт, поход, сбор власти.'),
    L('Battles are decided by strength plus a house card played in secret.', 'Бой решают сила и карта дома, сыгранная тайно.'),
    L('Seven castles and strongholds wins immediately.', 'Семь замков и крепостей — немедленная победа.'),
  ],

  flow: [
    { id: 'westeros', glyph: '📜', title: L('1. Westeros', '1. Вестерос'), text: L('Three cards: supply, mustering, wildlings and whatever else the round throws at the table.', 'Три карты: снабжение, сбор войск, одичалые и всё прочее, что раунд бросает на стол.') },
    { id: 'planning', glyph: '📝', title: L('2. Planning', '2. Планирование'), text: L('Place one order on each area where you have units. Nobody sees them until everyone is done.', 'Положите по приказу на каждую область со своими войсками. До конца никто их не видит.') },
    { id: 'action', glyph: '⚔️', title: L('3. Action', '3. Исполнение'), text: L('Raids first, then marches (and the battles they cause), then consolidate power.', 'Сначала налёты, затем походы — и бои, которые они вызывают, — затем сбор власти.') },
  ],

  ui: [
    { glyph: '🏰', title: L('Castles', 'Замки'), text: L('Your victory counter. Seven ends the game.', 'Ваш счётчик победы. Семь завершают игру.') },
    { glyph: '📊', title: L('Influence tracks', 'Треки влияния'), text: L('Throne, sword and raven: turn order, who wins a tied battle, and one special power a round.', 'Трон, меч и ворон: очередь хода, победа в ничейном бою и одна особая возможность за раунд.') },
    { glyph: '🎴', title: L('House cards', 'Карты дома'), text: L('Each is spent once until you run out and take them all back.', 'Каждая тратится один раз, пока не кончатся все — тогда вы забираете их обратно.') },
  ],

  win: L('Seven castles and strongholds ends the game immediately. If the last round runs out first, the count decides - and the tracks break the tie.', 'Семь замков и крепостей мгновенно завершают игру. Если раньше кончился последний раунд, решает их количество, а ничью разбивают треки.'),

  actions: [
    { glyph: '📝', title: L('Place orders', 'Расставить приказы'), text: L('In the planning phase, one per area with units.', 'В фазе планирования, по одному на область с войсками.') },
    { glyph: '⚔️', title: L('Resolve an order', 'Исполнить приказ'), text: L('In the action phase, in turn order.', 'В фазе исполнения, по очереди хода.') },
    { glyph: '🎴', title: L('Play a house card', 'Сыграть карту дома'), text: L('When a battle starts, in secret.', 'Когда начинается бой, тайно.') },
  ],

  special: [
    { title: L('Supply', 'Снабжение'), text: L('Your supply level caps how big your armies may be. Over the limit, you have to disband.', 'Уровень снабжения ограничивает размер армий. Превысили — придётся распустить войска.') },
    { title: L('The wildlings', 'Одичалые'), text: L('Everyone bids power against them in secret. Lose, and the table pays for it together.', 'Против них все тайно ставят власть. Проиграете — расплачиваться будет весь стол.') },
  ],

  end: [
    { title: L('Seven castles', 'Семь замков'), text: L('Checked at the end of every round.', 'Проверяется в конце каждого раунда.') },
    { title: L('The last round', 'Последний раунд'), text: L('If nobody has seven, the most castles wins.', 'Если семи нет ни у кого, побеждает тот, у кого замков больше.') },
  ],
};

export default {
  monopoly, catan, citadels, cosmic, throne,
};
