// bunkerNewTranslations.js
// The strings that came with the bigger character sheet (knowledge, a
// condition, a past, a fear, a special ability), the ridiculous shelf, the
// new random events and the vote confirmation. Kept in their own file so
// the two older dictionaries stay readable; merged in bunkerTranslations.js.

export const bunkerNewEn = {
  // --- the new characteristics -----------------------------------------
  'bunker.char.knowledge': 'Knowledge',
  'bunker.char.condition': 'Condition',
  'bunker.char.past': 'Past',
  'bunker.char.phobia': 'Fear',
  'bunker.char.ability': 'Special ability',
  // A row of the sheet this player holds no card in at all.
  'bunker.noCard': 'no card here',

  // --- the ridiculous shelf ---------------------------------------------
  'bunker.absurdBadge': 'Absurd',
  'bunker.absurdHint': 'A card from the ridiculous shelf. Some of them are genuinely useful.',
  'bunker.settings.absurdity': 'Absurdity',
  'bunker.settings.absurdityHint': 'How often the ridiculous cards - the mattress tester, the man certain he is a cat - are dealt alongside the serious ones.',
  'bunker.settings.absurdity.off': 'Off',
  'bunker.settings.absurdity.light': 'A pinch',
  'bunker.settings.absurdity.normal': 'Normal',
  'bunker.settings.absurdity.full': 'A lot',
  'bunker.settings.absurdity.only': 'Nothing but',
  'bunker.settings.absurdity.offHint': 'The straight game: only serious characters.',
  'bunker.settings.absurdity.lightHint': 'The odd absurd card among the serious ones.',
  'bunker.settings.absurdity.normalHint': 'Absurd cards as often as the catalogue intends.',
  'bunker.settings.absurdity.fullHint': 'Absurd cards three times as often.',
  'bunker.settings.absurdity.onlyHint': 'Only absurd characters. Good luck.',

  // --- the new events ----------------------------------------------------
  'bunker.event.equipment_failure.name': 'Equipment failure',
  'bunker.event.equipment_failure.text': 'A room is out of action, and nothing can be played this round.',
  'bunker.event.water_shortage.name': 'Water shortage',
  'bunker.event.water_shortage.text': 'Stores are down, and everyone has to open one more card this round.',
  'bunker.event.argument.name': 'An argument breaks out',
  'bunker.event.argument.text': '№{aNumber} {a} and №{bNumber} {b} are at each other. Both open a card, and this vote is between the two of them.',
  'bunker.event.power_out.name': 'The power goes out',
  'bunker.event.power_out.text': 'No cards this round, and the next vote is taken in the dark.',
  'bunker.event.unknown_item.name': 'An unknown object',
  'bunker.event.unknown_item.text': '№{number} {name} is handed something sealed. Not even they know what it is.',
  'bunker.event.conditions_change.name': 'The forecast changes',
  'bunker.event.conditions_change.text': 'The surface will take {months} months now, not {before}.',
  'bunker.event.specialist_needed.name': 'A specialist is needed',
  'bunker.event.specialist_needed.text': 'Everyone who was quiet about one thing has to speak: {count} cards are opened.',
  'bunker.event.contamination.name': 'Supplies contaminated',
  'bunker.event.contamination.text': 'Part of the stores is spoiled, and someone has already eaten from it.',
  'bunker.event.double_exclusion.name': 'The air will not stretch',
  'bunker.event.double_exclusion.text': 'This vote sends two people out instead of one.',

  // --- what the events leave behind --------------------------------------
  'bunker.effect.noCards.name': 'No cards',
  'bunker.effect.noCards.text': 'Nothing can be played this round.',
  'bunker.effect.duel.name': 'In the argument',
  'bunker.effect.duel.text': 'Only the two who argued can be voted out this round.',
  'bunker.effect.doubleExclusion.name': 'Two go out',
  'bunker.effect.doubleExclusion.text': 'This vote leaves two people outside.',
  'bunker.effect.secretVote.name': 'Dark vote',
  'bunker.effect.secretVote.text': 'Nobody sees who voted for whom.',
  'bunker.effect.extraReveal.name': 'Extra reveal',
  'bunker.effect.extraReveal.text': 'One more card is opened this round.',
  'bunker.tableEffects': 'In force right now',

  // --- the vote ----------------------------------------------------------
  'bunker.voteReason.duel': 'The argument decides: only these two are on the table.',
  'bunker.voteReason.revote': 'A runoff between the players who tied.',
  'bunker.voteReason.final': 'The last vote. Every remaining place is decided at once.',
  'bunker.confirmVoteTitle': 'Vote against №{number} {name}?',
  'bunker.confirmVoteText': 'If the table agrees, they are left outside and every card they hold is turned face up.',
  'bunker.confirmVoteTextMulti': 'This uses one of your {n} votes.',
  'bunker.confirmVoteChange': 'You may still change your mind afterwards.',
  'bunker.confirmVoteFinal': 'This cannot be taken back.',
  'bunker.confirmVoteYes': 'Yes, vote against them',
  'bunker.confirmVoteNo': 'Not yet',
  'bunker.withdrawVote': 'Take my vote back',
  'bunker.needVotes': '{n} more before the count',
  'bunker.whoVotedTitle': 'Who has voted',
  'bunker.notVotedYet': 'Still deciding',
  'bunker.outcome.excludedTwo': 'Two are left outside: №{number} {name} and one more',
  'bunker.log.EXCLUDED_TWO': 'The air did not stretch: two people are left outside',
};

export const bunkerNewRu = {
  // --- the new characteristics -----------------------------------------
  'bunker.char.knowledge': 'Знания',
  'bunker.char.condition': 'Ограничение',
  'bunker.char.past': 'Прошлое',
  'bunker.char.phobia': 'Страх',
  'bunker.char.ability': 'Особая способность',
  // A row of the sheet this player holds no card in at all.
  'bunker.noCard': 'карты нет',

  // --- the ridiculous shelf ---------------------------------------------
  'bunker.absurdBadge': 'Абсурд',
  'bunker.absurdHint': 'Карта с абсурдной полки. Некоторые из них внезапно полезны.',
  'bunker.settings.absurdity': 'Абсурдность',
  'bunker.settings.absurdityHint': 'Как часто рядом с серьёзными картами попадаются абсурдные — тестировщик матрасов, человек, уверенный, что он кот.',
  'bunker.settings.absurdity.off': 'Выключено',
  'bunker.settings.absurdity.light': 'Щепотка',
  'bunker.settings.absurdity.normal': 'Обычно',
  'bunker.settings.absurdity.full': 'Много',
  'bunker.settings.absurdity.only': 'Только абсурд',
  'bunker.settings.absurdity.offHint': 'Серьёзная игра: только обычные персонажи.',
  'bunker.settings.absurdity.lightHint': 'Изредка абсурдная карта среди серьёзных.',
  'bunker.settings.absurdity.normalHint': 'Абсурдные карты выпадают так часто, как задумано.',
  'bunker.settings.absurdity.fullHint': 'Абсурдные карты втрое чаще.',
  'bunker.settings.absurdity.onlyHint': 'Только абсурдные персонажи. Удачи.',

  // --- the new events ----------------------------------------------------
  'bunker.event.equipment_failure.name': 'Поломка оборудования',
  'bunker.event.equipment_failure.text': 'Отсек вышел из строя, и в этом раунде нельзя разыграть ни одной карты.',
  'bunker.event.water_shortage.name': 'Нехватка воды',
  'bunker.event.water_shortage.text': 'Запасы просели, и в этом раунде каждый открывает ещё одну карту.',
  'bunker.event.argument.name': 'Вспыхнул спор',
  'bunker.event.argument.text': '№{aNumber} {a} и №{bNumber} {b} сцепились. Оба открывают карту, и голосование идёт только между ними.',
  'bunker.event.power_out.name': 'Отключение электричества',
  'bunker.event.power_out.text': 'В этом раунде карты не работают, а следующее голосование пройдёт в темноте.',
  'bunker.event.unknown_item.name': 'Неизвестный предмет',
  'bunker.event.unknown_item.text': '№{number} {name} достаётся запечатанная находка. Даже он не знает, что внутри.',
  'bunker.event.conditions_change.name': 'Условия изменились',
  'bunker.event.conditions_change.text': 'Теперь наверху придётся переждать {months} мес. вместо {before}.',
  'bunker.event.specialist_needed.name': 'Нужен специалист',
  'bunker.event.specialist_needed.text': 'Все, кто молчал об одном и том же, обязаны сказать: открыто карт — {count}.',
  'bunker.event.contamination.name': 'Заражение запасов',
  'bunker.event.contamination.text': 'Часть припасов испорчена, и кто-то уже успел из них поесть.',
  'bunker.event.double_exclusion.name': 'Воздуха не хватит',
  'bunker.event.double_exclusion.text': 'Это голосование отправляет наружу двоих вместо одного.',

  // --- what the events leave behind --------------------------------------
  'bunker.effect.noCards.name': 'Карты не работают',
  'bunker.effect.noCards.text': 'В этом раунде нельзя разыграть ни одной карты.',
  'bunker.effect.duel.name': 'В споре',
  'bunker.effect.duel.text': 'В этом раунде исключить можно только участников спора.',
  'bunker.effect.doubleExclusion.name': 'Уходят двое',
  'bunker.effect.doubleExclusion.text': 'Это голосование оставит снаружи двоих.',
  'bunker.effect.secretVote.name': 'Тёмное голосование',
  'bunker.effect.secretVote.text': 'Никто не увидит, кто за кого голосовал.',
  'bunker.effect.extraReveal.name': 'Ещё одно вскрытие',
  'bunker.effect.extraReveal.text': 'В этом раунде открывается ещё одна карта.',
  'bunker.tableEffects': 'Действует прямо сейчас',

  // --- the vote ----------------------------------------------------------
  'bunker.voteReason.duel': 'Решает спор: на кону только эти двое.',
  'bunker.voteReason.revote': 'Перебаллотировка между теми, кто набрал поровну.',
  'bunker.voteReason.final': 'Последнее голосование. Все оставшиеся места решаются разом.',
  'bunker.confirmVoteTitle': 'Голосовать против №{number} {name}?',
  'bunker.confirmVoteText': 'Если стол согласится, он останется снаружи, а все его карты будут открыты.',
  'bunker.confirmVoteTextMulti': 'Будет потрачен один голос из {n}.',
  'bunker.confirmVoteChange': 'Решение потом ещё можно будет изменить.',
  'bunker.confirmVoteFinal': 'Отменить это будет нельзя.',
  'bunker.confirmVoteYes': 'Да, голосую против',
  'bunker.confirmVoteNo': 'Пока нет',
  'bunker.withdrawVote': 'Забрать голос',
  'bunker.needVotes': 'до подсчёта осталось: {n}',
  'bunker.whoVotedTitle': 'Кто уже проголосовал',
  'bunker.notVotedYet': 'Ещё думает',
  'bunker.outcome.excludedTwo': 'Снаружи остаются двое: №{number} {name} и ещё один',
  'bunker.log.EXCLUDED_TWO': 'Воздуха не хватило: снаружи остаются двое',
};

export default { bunkerNewEn, bunkerNewRu };
