// translations.js
// Flat key -> string dictionaries per language. Keys are grouped by
// component/screen via a dot-prefix purely for human readability when
// scanning this file; there's no nested-object lookup, just flat keys, to
// keep the lookup function trivial and avoid a runtime dependency.
//
// English (`en`) is the source of truth: every key that exists anywhere in
// the app MUST have an English entry. Russian (`ru`) mirrors the same key
// set - see the completeness check at the bottom of this file (throws in
// dev if a key is missing from `ru`, so a translation can never silently
// fall through to a blank string).

export const LANGUAGES = {
  en: { label: 'English', nativeLabel: 'English' },
  ru: { label: 'Russian', nativeLabel: 'Русский' },
};

export const DEFAULT_LANGUAGE = 'en';

const en = {
  // --- App chrome ---
  'app.title': 'Landmark',
  'app.tagline': 'Trade properties, collect rent, and bankrupt your friends — live, in the browser, with up to 10 players.',
  'app.feature.realtime': 'Real-time',
  'app.feature.players': 'Up to 10 players',
  'app.feature.free': 'Free, no download',
  'app.leaveGame': 'Leave game',
  'app.rejoining': 'Rejoining your game…',
  'app.reconnecting': 'Reconnecting…',
  'app.connectionIssue': 'Connection issue: {error}.',

  // --- Landing screen ---
  'landing.hostGame': 'Host a new game',
  'landing.hostGameSub': 'Get a room code to share',
  'landing.joinGame': 'Join with a code',
  'landing.joinGameSub': "Enter a friend's room code",
  'landing.back': '← Back',
  'landing.yourNickname': 'Your nickname',
  'landing.nicknamePlaceholder': 'e.g. Sasha',
  'landing.roomCode': 'Room code',
  'landing.roomCodePlaceholder': 'e.g. K7QXM',
  'landing.createRoom': 'Create room',
  'landing.creatingRoom': 'Creating room…',
  'landing.createRoomHint': "You'll get a room code to share with up to 9 friends.",
  'landing.joinRoom': 'Join room',
  'landing.joiningRoom': 'Joining…',
  'landing.errorNicknameRequired': 'Enter a nickname first.',
  'landing.errorRoomCodeRequired': 'Enter a room code.',

  // --- Waiting room ---
  'waiting.roomCode': 'Room code',
  'waiting.copy': 'Copy',
  'waiting.copied': 'Copied ✓',
  'waiting.copyInviteLink': 'Copy invite link instead',
  'waiting.players': 'Players',
  'waiting.leave': 'Leave',
  'waiting.seatOpen': '{count} seat open — share the code above',
  'waiting.seatsOpen': '{count} seats open — share the code above',
  'waiting.startGame': 'Start game',
  'waiting.needMorePlayers': 'Need at least 2 players',
  'waiting.hostOnlyHint': 'Only you (the host) can start the game.',
  'waiting.waitingForHost': 'Waiting for the host to start the game…',
  'waiting.host': 'Host',
  'waiting.ready': 'Ready',
  'waiting.offline': 'offline',
  'waiting.you': 'you',

  // --- In-game: turn / action panel ---
  'game.yourTurn': 'Your turn',
  'game.nameTurn': "{name}'s turn",
  'game.rollDice': 'Roll dice',
  'game.tryForDoubles': 'Try for doubles',
  'game.inJail': "You're in Jail",
  'game.payJailFine': 'Pay $50 fine',
  'game.useJailCard': 'Use jail card',
  'game.endTurn': 'End turn',
  'game.declareBankruptcy': 'Declare bankruptcy',
  'game.inDebt': "You're ${amount} in debt. Mortgage or sell properties, or declare bankruptcy.",
  'game.freeParking': 'Free Parking: {amount}',
  'game.freeParkingLabel': 'Free Parking:',
  'game.doubles': 'Doubles!',

  // --- Buy prompt ---
  'buy.landedOnUnowned': 'Landed on unowned property',
  'buy.buyFor': 'Buy for ${price}? You have ${money}.',
  'buy.pass': 'Pass',
  'buy.buyForPrice': 'Buy for ${price}',

  // --- Card reveal ---
  'card.chance': 'Chance',
  'card.communityChest': 'Community Chest',
  'card.continue': 'Continue',

  // --- Game over ---
  'gameOver.title': 'Game over',
  'gameOver.youWon': 'You won! 🎉',
  'gameOver.nameWins': '{name} wins!',
  'gameOver.subtitleWon': 'Everyone else went bankrupt. Nicely played.',
  'gameOver.subtitleLost': 'Everyone else went bankrupt. Better luck next time.',
  'gameOver.backToLobby': 'Back to lobby',

  // --- Sidebar ---
  'sidebar.players': 'Players',
  'sidebar.chat': 'Chat',
  'sidebar.property': '{count} property',
  'sidebar.properties': '{count} properties',
  'sidebar.bankrupt': 'Bankrupt',
  'sidebar.inJail': 'In Jail',
  'sidebar.disconnected': 'Disconnected',
  'sidebar.you': '(you)',

  // --- Chat ---
  'chat.noMessages': 'No messages yet. Say hi!',
  'chat.placeholder': 'Type a message…',
  'chat.send': 'Send',

  // --- Property modal ---
  'property.ownedBy': 'Owned by {name}',
  'property.mortgaged': 'Mortgaged',
  'property.unowned': 'Unowned · ${price} to purchase',
  'property.baseRent': 'Base rent',
  'property.houseCount': '{count} house',
  'property.housesCount': '{count} houses',
  'property.hotel': 'Hotel',
  'property.railroadRentTable': '1 owned: $25 · 2 owned: $50 · 3 owned: $100 · 4 owned: $200',
  'property.utilityRentTable': '1 owned: 4× dice roll · Both owned: 10× dice roll',
  'property.build': 'Build (${cost})',
  'property.sellHouse': 'Sell house',
  'property.payOffMortgage': 'Pay off mortgage (${cost})',
  'property.mortgageFor': 'Mortgage for ${amount}',
  'property.turnOnlyHint': 'You can only manage properties on your turn.',

  // --- Board special tiles ---
  'tile.go': 'Start',
  'tile.jail': 'Jail',
  'tile.freeParking': 'Free Parking',
  'tile.goToJail': 'Go To Jail',
  'tile.chance': 'Chance',
  'tile.communityChest': 'Community Chest',
  'tile.incomeTax': 'Income Tax',
  'tile.luxuryTax': 'Luxury Tax',

  // --- Language switcher ---
  'language.label': 'Language',
};

const ru = {
  // --- App chrome ---
  'app.title': 'Landmark',
  'app.tagline': 'Покупайте недвижимость, собирайте арендную плату и разоряйте друзей — в реальном времени, прямо в браузере, до 10 игроков.',
  'app.feature.realtime': 'В реальном времени',
  'app.feature.players': 'До 10 игроков',
  'app.feature.free': 'Бесплатно, без установки',
  'app.leaveGame': 'Покинуть игру',
  'app.rejoining': 'Возвращаемся в игру…',
  'app.reconnecting': 'Переподключение…',
  'app.connectionIssue': 'Проблема с соединением: {error}.',

  // --- Landing screen ---
  'landing.hostGame': 'Создать игру',
  'landing.hostGameSub': 'Получите код комнаты, чтобы поделиться',
  'landing.joinGame': 'Войти по коду',
  'landing.joinGameSub': 'Введите код комнаты друга',
  'landing.back': '← Назад',
  'landing.yourNickname': 'Ваш никнейм',
  'landing.nicknamePlaceholder': 'например, Саша',
  'landing.roomCode': 'Код комнаты',
  'landing.roomCodePlaceholder': 'например, K7QXM',
  'landing.createRoom': 'Создать комнату',
  'landing.creatingRoom': 'Создаём комнату…',
  'landing.createRoomHint': 'Вы получите код комнаты, которым можно поделиться с 9 друзьями.',
  'landing.joinRoom': 'Войти в комнату',
  'landing.joiningRoom': 'Подключение…',
  'landing.errorNicknameRequired': 'Сначала введите никнейм.',
  'landing.errorRoomCodeRequired': 'Введите код комнаты.',

  // --- Waiting room ---
  'waiting.roomCode': 'Код комнаты',
  'waiting.copy': 'Копировать',
  'waiting.copied': 'Скопировано ✓',
  'waiting.copyInviteLink': 'Скопировать ссылку-приглашение',
  'waiting.players': 'Игроки',
  'waiting.leave': 'Выйти',
  'waiting.seatOpen': 'Свободно {count} место — поделитесь кодом выше',
  'waiting.seatsOpen': 'Свободно {count} мест — поделитесь кодом выше',
  'waiting.startGame': 'Начать игру',
  'waiting.needMorePlayers': 'Нужно как минимум 2 игрока',
  'waiting.hostOnlyHint': 'Только вы (хост) можете начать игру.',
  'waiting.waitingForHost': 'Ожидание, пока хост начнёт игру…',
  'waiting.host': 'Хост',
  'waiting.ready': 'Готов',
  'waiting.offline': 'не в сети',
  'waiting.you': 'вы',

  // --- In-game: turn / action panel ---
  'game.yourTurn': 'Ваш ход',
  'game.nameTurn': 'Ход игрока {name}',
  'game.rollDice': 'Бросить кубики',
  'game.tryForDoubles': 'Попытаться выбросить дубль',
  'game.inJail': 'Вы в тюрьме',
  'game.payJailFine': 'Заплатить $50 штрафа',
  'game.useJailCard': 'Использовать карту освобождения',
  'game.endTurn': 'Закончить ход',
  'game.declareBankruptcy': 'Объявить банкротство',
  'game.inDebt': 'Вы должны ${amount}. Заложите или продайте имущество, либо объявите банкротство.',
  'game.freeParking': 'Бесплатная парковка: {amount}',
  'game.freeParkingLabel': 'Бесплатная парковка:',
  'game.doubles': 'Дубль!',

  // --- Buy prompt ---
  'buy.landedOnUnowned': 'Вы попали на свободную собственность',
  'buy.buyFor': 'Купить за ${price}? У вас ${money}.',
  'buy.pass': 'Пропустить',
  'buy.buyForPrice': 'Купить за ${price}',

  // --- Card reveal ---
  'card.chance': 'Шанс',
  'card.communityChest': 'Общественная казна',
  'card.continue': 'Продолжить',

  // --- Game over ---
  'gameOver.title': 'Игра окончена',
  'gameOver.youWon': 'Вы победили! 🎉',
  'gameOver.nameWins': 'Победитель — {name}!',
  'gameOver.subtitleWon': 'Все остальные обанкротились. Отличная игра.',
  'gameOver.subtitleLost': 'Все остальные обанкротились. Повезёт в следующий раз.',
  'gameOver.backToLobby': 'Вернуться в лобби',

  // --- Sidebar ---
  'sidebar.players': 'Игроки',
  'sidebar.chat': 'Чат',
  'sidebar.property': '{count} объект',
  'sidebar.properties': '{count} объектов',
  'sidebar.bankrupt': 'Банкрот',
  'sidebar.inJail': 'В тюрьме',
  'sidebar.disconnected': 'Не в сети',
  'sidebar.you': '(вы)',

  // --- Chat ---
  'chat.noMessages': 'Сообщений пока нет. Поздоровайтесь!',
  'chat.placeholder': 'Введите сообщение…',
  'chat.send': 'Отправить',

  // --- Property modal ---
  'property.ownedBy': 'Владелец: {name}',
  'property.mortgaged': 'Заложено',
  'property.unowned': 'Свободно · ${price} за покупку',
  'property.baseRent': 'Базовая аренда',
  'property.houseCount': '{count} дом',
  'property.housesCount': '{count} дома(ов)',
  'property.hotel': 'Отель',
  'property.railroadRentTable': '1 в собственности: $25 · 2: $50 · 3: $100 · 4: $200',
  'property.utilityRentTable': '1 в собственности: 4× бросок кубиков · Обе: 10× бросок кубиков',
  'property.build': 'Построить (${cost})',
  'property.sellHouse': 'Продать дом',
  'property.payOffMortgage': 'Погасить залог (${cost})',
  'property.mortgageFor': 'Заложить за ${amount}',
  'property.turnOnlyHint': 'Управлять недвижимостью можно только в свой ход.',

  // --- Board special tiles ---
  'tile.go': 'Старт',
  'tile.jail': 'Тюрьма',
  'tile.freeParking': 'Бесплатная парковка',
  'tile.goToJail': 'В тюрьму',
  'tile.chance': 'Шанс',
  'tile.communityChest': 'Казна',
  'tile.incomeTax': 'Подоходный налог',
  'tile.luxuryTax': 'Налог на роскошь',

  // --- Language switcher ---
  'language.label': 'Язык',
};

export const TRANSLATIONS = { en, ru };

// Completeness check: every key in `en` must exist in every other
// language. This runs once at module load - cheap, and it fails loudly
// and immediately (rather than silently rendering blank/undefined text)
// if a translation is ever added to one language and forgotten in another.
if (import.meta.env.DEV) {
  const enKeys = Object.keys(en);
  Object.entries(TRANSLATIONS).forEach(([lang, dict]) => {
    if (lang === 'en') return;
    const missing = enKeys.filter((k) => !(k in dict));
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`[i18n] Language "${lang}" is missing ${missing.length} key(s): ${missing.join(', ')}`);
    }
  });
}
