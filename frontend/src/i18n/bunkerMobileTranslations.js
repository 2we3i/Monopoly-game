// bunkerMobileTranslations.js
// The strings of the Bunker's phone layout (BunkerMobile.jsx and
// BunkerMobileLobby.jsx): the tab bar, the menu, and the short
// explanations a small screen needs where the desktop table has room to
// show everything at once. Merged in bunkerTranslations.js.

export const bunkerMobileEn = {
  // --- the tab bar -------------------------------------------------------
  'bunker.m.tab.table': 'Game',
  'bunker.m.tab.me': 'Me',
  'bunker.m.tab.players': 'Players',
  'bunker.m.tab.bunker': 'Shelter',
  'bunker.m.tab.chat': 'Chat',

  // --- the header and its menu ------------------------------------------
  // The phase names, short enough for the header beside the clock.
  'bunker.m.phase.LOBBY': 'Lobby',
  'bunker.m.phase.REVEAL': 'Revealing cards',
  'bunker.m.phase.DISCUSSION': 'Discussion',
  'bunker.m.phase.VOTE': 'Vote',
  'bunker.m.phase.RESULT': 'Vote result',
  'bunker.m.phase.GAME_OVER': 'The door closes',
  'bunker.m.leaveHint': 'Leaving in the middle of a game puts you outside the bunker.',

  // --- the nudge when it is your move -------------------------------------
  'bunker.m.goReveal': 'Your turn to reveal a card',
  'bunker.m.goVote': 'Your vote is needed',

  // --- the game tab ------------------------------------------------------
  'bunker.m.turnProgress': 'Turn {i} of {n}',
  'bunker.m.openedThisRound': 'Revealed this round',
  'bunker.m.nothingYet': 'Nothing has been revealed this round yet.',
  'bunker.m.pickCard': 'Tap the card you will show everyone.',
  'bunker.m.requiredProfession': 'Round 1: everyone opens their profession first.',
  'bunker.m.alreadyOpen': 'Already open to everyone',
  'bunker.m.confirmTitle': 'Show this card to everyone?',
  'bunker.m.confirmNote': 'It stays open until the end of the game.',
  'bunker.m.blindCard': 'Sealed even from you',
  'bunker.m.discussTip': 'Compare what everyone has revealed in the Players tab, argue in the chat.',
  'bunker.m.toPlayers': 'All players',
  'bunker.m.toChat': 'Open the chat',
  'bunker.m.voteQuestion': 'Who stays outside?',
  'bunker.m.voteHint': 'Tap "Against" next to the player the shelter can do without.',
  'bunker.m.voteHintChange': 'You can change your vote until the count.',
  'bunker.m.voteHintFinal': 'A cast vote cannot be taken back.',
  'bunker.m.against': 'Against',
  'bunker.m.yourVote': 'Your vote',
  'bunker.m.withdraw': 'Take back',
  'bunker.m.showCards': 'Cards · {n}',
  'bunker.m.noOpenCards': 'Has not revealed anything yet.',
  'bunker.m.situation': '{seats} places · {alive} inside · {extra} too many',
  'bunker.m.situationDone': '{seats} places · {alive} inside',

  // --- the me tab ---------------------------------------------------------
  'bunker.m.openedOf': '{n} of {m} revealed',
  'bunker.m.openToAll': 'Everyone sees · {n}',
  'bunker.m.onlyYou': 'Only you see · {n}',
  'bunker.m.allOpen': 'All your cards are on the table.',
  'bunker.m.noneOpen': 'You have not revealed anything yet.',
  'bunker.m.spectatorMe': 'You are watching this game and have no character of your own.',
  'bunker.m.statusIn': 'In the game',
  'bunker.m.statusOut': 'Outside the bunker',

  // --- the players tab ---------------------------------------------------
  'bunker.m.inGame': 'In the game · {n}',
  'bunker.m.outsideN': 'Outside · {n}',
  'bunker.m.expandAll': 'Expand all',
  'bunker.m.collapseAll': 'Collapse all',
  'bunker.m.openCount': '{n}/{m} open',
  'bunker.m.hiddenRest': 'Still hidden: {list}',
  'bunker.m.profUnknown': 'Profession still hidden',
  'bunker.m.new': 'new',

  // --- the lobby -----------------------------------------------------------
  'bunker.m.invite': 'Invite',
  'bunker.m.inviteText': 'Join my Bunker game - room {code}',
  'bunker.m.copyCode': 'Copy code',
  'bunker.m.qr': 'QR code',
  'bunker.m.qrHint': 'A friend points their phone camera at it and lands in this room.',
  'bunker.m.readyCount': 'Ready: {n} of {m}',
  'bunker.m.pressReady': 'Press "Ready" when you are.',
  'bunker.m.youReady': 'You are ready - waiting for the host.',
  'bunker.m.sheetN': 'The character sheet · {n}',
  'bunker.m.timers': 'Timers',
  'bunker.m.deckN': 'Action cards · {n}',

  // --- the end ---------------------------------------------------------------
  'bunker.m.showResults': 'Show the results',
};

export const bunkerMobileRu = {
  // --- the tab bar -------------------------------------------------------
  'bunker.m.tab.table': 'Игра',
  'bunker.m.tab.me': 'Я',
  'bunker.m.tab.players': 'Игроки',
  'bunker.m.tab.bunker': 'Бункер',
  'bunker.m.tab.chat': 'Чат',

  // --- the header and its menu ------------------------------------------
  // The phase names, short enough for the header beside the clock.
  'bunker.m.phase.LOBBY': 'Лобби',
  'bunker.m.phase.REVEAL': 'Раскрытие карт',
  'bunker.m.phase.DISCUSSION': 'Обсуждение',
  'bunker.m.phase.VOTE': 'Голосование',
  'bunker.m.phase.RESULT': 'Итоги голосования',
  'bunker.m.phase.GAME_OVER': 'Дверь закрывается',
  'bunker.m.leaveHint': 'Если выйти посреди игры, вы останетесь снаружи бункера.',

  // --- the nudge when it is your move -------------------------------------
  'bunker.m.goReveal': 'Ваш ход — откройте карту',
  'bunker.m.goVote': 'Нужен ваш голос',

  // --- the game tab ------------------------------------------------------
  'bunker.m.turnProgress': 'Ход {i} из {n}',
  'bunker.m.openedThisRound': 'Открыто в этом раунде',
  'bunker.m.nothingYet': 'В этом раунде пока ничего не открыли.',
  'bunker.m.pickCard': 'Нажмите на карту, которую покажете всем.',
  'bunker.m.requiredProfession': 'Раунд 1: сначала все открывают профессию.',
  'bunker.m.alreadyOpen': 'Уже открыты всем',
  'bunker.m.confirmTitle': 'Показать эту карту всем?',
  'bunker.m.confirmNote': 'Она останется открытой до конца игры.',
  'bunker.m.blindCard': 'Запечатано даже от вас',
  'bunker.m.discussTip': 'Сравните, кто что открыл, во вкладке «Игроки» и спорьте в чате.',
  'bunker.m.toPlayers': 'Все игроки',
  'bunker.m.toChat': 'Открыть чат',
  'bunker.m.voteQuestion': 'Кто останется снаружи?',
  'bunker.m.voteHint': 'Нажмите «Против» у того, без кого бункер обойдётся.',
  'bunker.m.voteHintChange': 'Голос можно изменить до подсчёта.',
  'bunker.m.voteHintFinal': 'Отданный голос забрать нельзя.',
  'bunker.m.against': 'Против',
  'bunker.m.yourVote': 'Ваш голос',
  'bunker.m.withdraw': 'Забрать',
  'bunker.m.showCards': 'Карты · {n}',
  'bunker.m.noOpenCards': 'Пока ничего не открыл(а).',
  'bunker.m.situation': 'Мест: {seats} · внутри: {alive} · лишних: {extra}',
  'bunker.m.situationDone': 'Мест: {seats} · внутри: {alive}',

  // --- the me tab ---------------------------------------------------------
  'bunker.m.openedOf': 'Открыто {n} из {m}',
  'bunker.m.openToAll': 'Видят все · {n}',
  'bunker.m.onlyYou': 'Видите только вы · {n}',
  'bunker.m.allOpen': 'Все ваши карты на столе.',
  'bunker.m.noneOpen': 'Вы пока ничего не открыли.',
  'bunker.m.spectatorMe': 'Вы наблюдаете за игрой — своего персонажа у вас нет.',
  'bunker.m.statusIn': 'В игре',
  'bunker.m.statusOut': 'Снаружи бункера',

  // --- the players tab ---------------------------------------------------
  'bunker.m.inGame': 'В игре · {n}',
  'bunker.m.outsideN': 'Снаружи · {n}',
  'bunker.m.expandAll': 'Развернуть всех',
  'bunker.m.collapseAll': 'Свернуть всех',
  'bunker.m.openCount': 'открыто {n}/{m}',
  'bunker.m.hiddenRest': 'Ещё скрыто: {list}',
  'bunker.m.profUnknown': 'Профессия пока скрыта',
  'bunker.m.new': 'новое',

  // --- the lobby -----------------------------------------------------------
  'bunker.m.invite': 'Пригласить',
  'bunker.m.inviteText': 'Заходи в мою игру «Бункер» — комната {code}',
  'bunker.m.copyCode': 'Копировать код',
  'bunker.m.qr': 'QR-код',
  'bunker.m.qrHint': 'Друг наводит камеру телефона — и сразу попадает в эту комнату.',
  'bunker.m.readyCount': 'Готовы: {n} из {m}',
  'bunker.m.pressReady': 'Нажмите «Готов», когда будете готовы.',
  'bunker.m.youReady': 'Вы готовы — ждём хозяина комнаты.',
  'bunker.m.sheetN': 'Анкета персонажа · {n}',
  'bunker.m.timers': 'Таймеры',
  'bunker.m.deckN': 'Карты действий · {n}',

  // --- the end ---------------------------------------------------------------
  'bunker.m.showResults': 'Показать итоги',
};

export default { bunkerMobileEn, bunkerMobileRu };
