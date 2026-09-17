// content/social.js
// The rules of the games played with people rather than a board: the
// Bunker, Mafia, Meme Hype and Chpok.
//
// Every game is described in the SAME eight blocks, because a player who
// has read one rules panel should already know where to look in the next:
//
//   goal     what you are trying to do
//   flow     how a round goes, step by step
//   ui       what the things on screen mean
//   win      how you win
//   actions  what you can do, and when
//   special  the rules that surprise people
//   end      when the game stops
//   short    the whole game in five lines, for someone who is mid-match
//
// Text is bilingual data ({ en, ru }) rather than translation keys: a rule
// and its explanation are one sentence in two languages, and keeping them
// side by side is what stops one drifting from the other.

const L = (en, ru) => ({ en, ru });

export const bunker = {
  emoji: '☢️',
  title: L('The Bunker', 'Бункер'),
  tagline: L('A shelter with too few places, and a table that has to choose.', 'Убежище, в котором мест меньше, чем людей, — и стол, которому придётся выбирать.'),

  goal: L(
    'The world above is gone and the shelter holds fewer people than are standing at the door. You are one of them. Your job is to convince everybody else that the bunker needs YOU - using the character you were dealt, the order you reveal it in, and whatever alliances you can hold together long enough to matter.',
    'Мир наверху уничтожен, а мест в убежище меньше, чем людей у двери. Вы — один из них. Ваша задача — убедить остальных, что бункеру нужны именно вы: с помощью выпавшего персонажа, порядка, в котором вы его раскрываете, и союзов, которые удастся удержать достаточно долго.',
  ),

  short: [
    L('You are dealt a character: profession, body, health, skills, a past, a fear, a secret and what you brought with you. All of it face down.', 'Вам выдают персонажа: профессия, возраст и пол, здоровье, навыки, прошлое, страх, секрет и то, что вы принесли с собой. Всё — закрыто.'),
    L('Each round everyone reveals ONE card of their own choosing. The first round is always the profession.', 'Каждый раунд каждый открывает ОДНУ карту на свой выбор. В первом раунде — всегда профессия.'),
    L('After the reveals comes a discussion, then a vote. Whoever the table votes against stays outside.', 'После вскрытий — обсуждение, затем голосование. Тот, против кого проголосовал стол, остаётся снаружи.'),
    L('Random events change the shelter itself: places are lost or gained, supplies spoil, the power goes out.', 'Случайные события меняют само убежище: мест становится меньше или больше, припасы портятся, гаснет свет.'),
    L('The game ends when no more people are left inside than there are places. Those people are the survivors.', 'Игра заканчивается, когда внутри остаётся не больше людей, чем мест. Эти люди и есть выжившие.'),
  ],

  flow: [
    {
      id: 'REVEAL',
      glyph: '👁️',
      title: L('1. Reveal', '1. Вскрытие'),
      text: L('Players take turns, one card each, in seat order. You choose WHICH card - that choice is most of the game. The first round is the profession, for everybody.', 'Игроки ходят по очереди, по одной карте, по номерам мест. ВЫ выбираете, какую карту открыть, — в этом выборе и есть игра. Первый раунд — профессия, у всех.'),
    },
    {
      id: 'DISCUSSION',
      glyph: '💬',
      title: L('2. Discussion', '2. Обсуждение'),
      text: L('Everyone talks at once: argue for your place, pick holes in someone else, promise whatever you like. Nothing said here is binding.', 'Говорят все сразу: доказывайте своё право на место, ищите слабые места у других, обещайте что угодно. Ничто из сказанного не обязывает.'),
    },
    {
      id: 'VOTE',
      glyph: '⚖️',
      title: L('3. Vote', '3. Голосование'),
      text: L('Everyone still inside votes against one player. You confirm before your vote is cast, and you can see how many votes have been given and how many are still missing.', 'Каждый, кто ещё внутри, голосует против одного игрока. Перед отправкой голоса вы подтверждаете выбор и видите, сколько голосов уже отдано и сколько не хватает.'),
    },
    {
      id: 'RESULT',
      glyph: '🚪',
      title: L('4. Result', '4. Итог'),
      text: L('The player with the most votes is left outside, and every card they were holding is turned face up. A tie goes to a runoff between the tied players.', 'Игрок с наибольшим числом голосов остаётся снаружи, и все его карты открываются. При равенстве проводится перебаллотировка между ними.'),
    },
  ],

  ui: [
    { glyph: '🪑', title: L('Places', 'Мест'), text: L('How many people the shelter holds. Events can change this number mid-game.', 'Сколько человек помещается в убежище. События могут изменить это число по ходу игры.') },
    { glyph: '👥', title: L('Inside', 'Внутри'), text: L('How many are still in the game, and how many more have to go.', 'Сколько игроков ещё в игре и сколько ещё должно уйти.') },
    { glyph: '🔒', title: L('A closed card', 'Закрытая карта'), text: L('Nobody else has been told it - it is genuinely not in their copy of the game. "Sealed" means even you have not seen it yet.', 'Её никто не знает — её физически нет в их копии игры. «Запечатано» значит, что её не видели даже вы.') },
    { glyph: '🎒', title: L('Baggage', 'Багаж'), text: L('What you brought. Items carry a rarity, and some have a sealed property that only comes out if something opens it.', 'То, что вы принесли. У предметов есть редкость, а у некоторых — запечатанное свойство, которое вскроется, только если его откроют.') },
    { glyph: '🃏', title: L('Action cards', 'Карты действий'), text: L('The number on a seat is how many cards that player still holds - never which ones.', 'Число у места показывает, сколько карт у игрока на руках, — но никогда каких именно.') },
    { glyph: '⚡', title: L('Event banner', 'Плашка события'), text: L('Something has happened to the bunker itself. It stays on screen for the round it affects.', 'С самим бункером что-то произошло. Плашка держится на экране весь раунд, на который событие влияет.') },
    { glyph: '🛡️', title: L('Badges on a seat', 'Значки у места'), text: L('Protection, a double vote, a sealed mouth, illness. They are public on purpose - a hidden shield would change nothing about the argument.', 'Защита, двойной голос, запрет на вскрытие, болезнь. Они открыты намеренно: скрытый щит ничего не менял бы в споре.') },
  ],

  win: L(
    'You win by being inside when the door closes. There is no score to chase - the only thing that matters is not being the one the table votes against. At the end the shelter is given a verdict (from "doomed" to "thriving") based on how useful the survivors actually are, but that verdict does not take your place away.',
    'Вы побеждаете, если оказались внутри, когда дверь закрылась. Никаких очков собирать не нужно: важно только не оказаться тем, против кого проголосовал стол. В конце убежищу выносится вердикт — от «обречены» до «процветают» — по тому, насколько выжившие полезны, но места он у вас не отнимает.',
  ),

  actions: [
    { glyph: '👁️', title: L('Reveal a card', 'Открыть карту'), text: L('On your turn, in the reveal phase. One per turn.', 'В свой ход в фазе вскрытия. По одной за ход.') },
    { glyph: '💬', title: L('Talk', 'Говорить'), text: L('Always - in the chat, or out loud at the table.', 'Всегда: в чате или вслух за столом.') },
    { glyph: '⚖️', title: L('Vote', 'Голосовать'), text: L('In the vote phase, against anyone but yourself. Confirmed before it counts.', 'В фазе голосования, против кого угодно, кроме себя. Считается только после подтверждения.') },
    { glyph: '🃏', title: L('Play an action card', 'Разыграть карту действия'), text: L('If the table plays with them, and the card allows this phase. Some rounds an event blocks them entirely.', 'Если стол играет с ними и карта разрешена в этой фазе. В некоторых раундах событие блокирует их полностью.') },
    { glyph: '🏳️', title: L('Give up', 'Сдаться'), text: L('Leaves the bunker on your own terms. It cannot be taken back.', 'Вы уходите из бункера по собственной воле. Отменить нельзя.') },
  ],

  special: [
    { title: L('Sealed cards', 'Запечатанные карты'), text: L('Some tables deal a card face down even to its owner. You find out what it is when you reveal it - in front of everybody.', 'На некоторых столах карта выдаётся закрытой даже владельцу. Вы узнаете, что это, в момент вскрытия — вместе со всеми.') },
    { title: L('Absurd characters', 'Абсурдные персонажи'), text: L('A professional mattress tester or a man certain he is a cat can be dealt alongside the surgeons. Some of them are genuinely useful - a man who spent fifteen years training for the end of the world is worth a place. Do not dismiss one without listening.', 'Рядом с хирургами может выпасть профессиональный тестировщик матрасов или человек, уверенный, что он кот. Некоторые из них реально полезны: тот, кто пятнадцать лет готовился к концу света, места достоин. Не отмахивайтесь, не выслушав.') },
    { title: L('Events', 'События'), text: L('Between rounds the shelter can lose a place, gain one, lose power, lose a room, or have half its food spoil. An argument can even force a vote between two named players and nobody else.', 'Между раундами убежище может потерять место или получить новое, остаться без света, лишиться отсека или половины запасов. А спор может свести голосование к двум конкретным игрокам — и больше ни к кому.') },
    { title: L('Leaving is final', 'Уход окончателен'), text: L('Whoever is voted out shows every card they hold. They can still watch and talk, but they no longer reveal or vote.', 'Кто исключён, открывает все свои карты. Он может смотреть и говорить, но больше не вскрывает карты и не голосует.') },
  ],

  end: [
    { title: L('The places are filled', 'Места заполнены'), text: L('As soon as no more people remain inside than there are places, the door closes and those people survive.', 'Как только внутри остаётся не больше людей, чем мест, дверь закрывается — и эти люди выживают.') },
    { title: L('The round limit', 'Лимит раундов'), text: L('If the table plays with a fixed number of rounds and it runs out, one last vote decides every remaining place at once.', 'Если стол играет с ограничением по раундам и оно закончилось, одно последнее голосование решает все оставшиеся места разом.') },
  ],

  example: {
    title: L('An example', 'Пример'),
    text: L(
      'You are dealt "Blogger", 24, perfectly healthy, with a crate of antibiotics in your bag. Opening the profession first makes you look useless. Opening the antibiotics first buys you two rounds - and by the time anyone asks what you do for a living, you have already been the person who brought the medicine.',
      'Вам выпало: «Блогер», 24 года, идеально здоров, в багаже — ящик антибиотиков. Открыв сначала профессию, вы выглядите бесполезным. Открыв сначала антибиотики, вы выигрываете два раунда — и к моменту, когда кто-то спросит, кем вы работаете, вы уже «тот, кто принёс лекарства».',
    ),
  },
};

export const mafia = {
  emoji: '🌙',
  title: L('Mafia', 'Мафия'),
  tagline: L('A town that does not know who among it kills at night.', 'Город, который не знает, кто из его жителей убивает по ночам.'),

  goal: L(
    'You belong either to the town or to the mafia, and only your own side knows which. The town has to work out who the killers are and vote them out in daylight; the mafia has to kill quietly at night and talk its way out of trouble by day.',
    'Вы либо мирный житель, либо мафия — и знает об этом только ваша сторона. Городу нужно вычислить убийц и выгнать их днём голосованием; мафии — тихо убивать ночью и отговариваться днём.',
  ),

  short: [
    L('Everyone gets a secret role. The mafia know each other; the town knows nobody.', 'Каждому выдаётся тайная роль. Мафия знает своих; мирные — никого.'),
    L('At night the roles with powers act in secret: the mafia kill, the doctor saves, the sheriff checks.', 'Ночью роли со способностями действуют тайно: мафия убивает, доктор лечит, шериф проверяет.'),
    L('By day the town talks and then votes one person out.', 'Днём город обсуждает и выгоняет одного игрока голосованием.'),
    L('The game ends when the mafia are all out, or when they are no longer outnumbered.', 'Игра заканчивается, когда мафия выбита — или когда её уже не меньше, чем мирных.'),
  ],

  flow: [
    { id: 'ROLE_REVEAL', glyph: '🎭', title: L('1. Roles', '1. Роли'), text: L('You are shown your own role and, if you are mafia, your partners. Nobody else sees it.', 'Вам показывают вашу роль, а если вы мафия — ещё и напарников. Больше её никто не видит.') },
    { id: 'NIGHT', glyph: '🌙', title: L('2. Night', '2. Ночь'), text: L('The town sleeps. The mafia choose a victim; the doctor chooses someone to protect; the sheriff checks one player.', 'Город спит. Мафия выбирает жертву, доктор — кого защитить, шериф проверяет одного игрока.') },
    { id: 'DAY', glyph: '☀️', title: L('3. Day', '3. День'), text: L('What happened in the night is announced, and everyone argues about who did it.', 'Объявляется, что случилось ночью, — и все спорят, кто это сделал.') },
    { id: 'VOTE', glyph: '⚖️', title: L('4. Vote', '4. Голосование'), text: L('The town votes. Most votes is put out of town, and their role is shown. A tie means nobody leaves.', 'Город голосует. Кто набрал больше всех — покидает город, его роль открывается. При равенстве не уходит никто.') },
  ],

  ui: [
    { glyph: '🎭', title: L('Your role card', 'Карточка роли'), text: L('Top of the screen, visible only to you. It says what you may do at night.', 'Вверху экрана, видна только вам. В ней написано, что вы можете ночью.') },
    { glyph: '🌙', title: L('Night screen', 'Ночной экран'), text: L('Dark background means the town is asleep. If you have nothing to do, you simply wait.', 'Тёмный фон значит, что город спит. Если делать нечего — просто ждите.') },
    { glyph: '💀', title: L('A dead seat', 'Мёртвое место'), text: L('Greyed out. Dead players see everything but can neither speak nor vote.', 'Затемнено. Погибшие всё видят, но не могут ни говорить, ни голосовать.') },
    { glyph: '⚖️', title: L('Vote counters', 'Счётчики голосов'), text: L('The number on a seat is how many have voted against that player so far.', 'Число у места — сколько голосов уже отдано против этого игрока.') },
  ],

  win: L(
    'The town wins when the last mafioso is out. The mafia win the moment they are not outnumbered by the town - at that point the vote can no longer save anybody.',
    'Мирные побеждают, когда выбывает последний мафиози. Мафия побеждает в тот момент, когда её становится не меньше, чем мирных: с этого момента голосование уже никого не спасёт.',
  ),

  actions: [
    { glyph: '🎯', title: L('Choose a target', 'Выбрать цель'), text: L('At night, if your role has a power. Tap a seat; nobody sees your choice.', 'Ночью, если у роли есть способность. Нажмите на место — ваш выбор никто не видит.') },
    { glyph: '💬', title: L('Talk', 'Говорить'), text: L('By day, if you are alive.', 'Днём, если вы живы.') },
    { glyph: '⚖️', title: L('Vote', 'Голосовать'), text: L('In the vote phase, if you are alive.', 'В фазе голосования, если вы живы.') },
  ],

  special: [
    { title: L('The doctor', 'Доктор'), text: L('Can save the mafia\'s target, including themselves, but usually not twice in a row.', 'Может спасти цель мафии, в том числе себя, но обычно не два раза подряд.') },
    { title: L('The sheriff', 'Шериф'), text: L('Learns one player\'s allegiance each night - and has to decide how loudly to say so.', 'Каждую ночь узнаёт принадлежность одного игрока — и должен решить, насколько громко об этом говорить.') },
    { title: L('Dead players', 'Погибшие'), text: L('Never reveal what they know. That is the whole game.', 'Не раскрывают того, что знают. На этом вся игра и держится.') },
  ],

  end: [
    { title: L('The town wins', 'Победа города'), text: L('The last mafioso is voted out.', 'Выгнан последний мафиози.') },
    { title: L('The mafia win', 'Победа мафии'), text: L('The mafia are equal in number to the rest of the town.', 'Мафии становится столько же, сколько остальных жителей.') },
  ],
};

export const memehype = {
  emoji: '🔥',
  title: L('Meme Hype', 'Meme Hype'),
  tagline: L('A situation, a handful of memes, and a table deciding which one lands.', 'Ситуация, горсть мемов — и стол, который решает, какой из них зашёл.'),

  goal: L(
    'A situation is read out. Everyone plays one meme card from their hand as the answer to it, and then everyone votes for the card they find funniest. Points go to the cards that got votes.',
    'Зачитывается ситуация. Каждый выкладывает из руки один мем как ответ на неё, а потом все голосуют за самый смешной. Очки получают карты, за которые проголосовали.',
  ),

  short: [
    L('Each round the screen shows one situation.', 'Каждый раунд на экране появляется одна ситуация.'),
    L('From your hand, play the meme that answers it best - or funniest.', 'Из своей руки выложите мем, который отвечает на неё лучше всего — или смешнее всего.'),
    L('When everyone has played, all the cards are shown and everyone votes. Not for their own.', 'Когда сыграли все, карты открываются и все голосуют. За свою — нельзя.'),
    L('Each vote is worth points; the round winner gets a bonus. Most points at the end wins.', 'Каждый голос приносит очки, победитель раунда получает бонус. Побеждает тот, у кого в конце больше очков.'),
  ],

  flow: [
    { id: 'PICK', glyph: '🃏', title: L('1. Pick', '1. Выбор'), text: L('Read the situation and play one card from your hand, before the timer runs out.', 'Прочитайте ситуацию и выложите одну карту из руки, пока не кончился таймер.') },
    { id: 'VOTE', glyph: '🗳️', title: L('2. Vote', '2. Голосование'), text: L('Every card is shown without its owner\'s name. Vote for the one you liked most.', 'Все карты показываются без имён авторов. Голосуйте за ту, что понравилась больше всех.') },
    { id: 'REVEAL', glyph: '🏆', title: L('3. Reveal', '3. Раскрытие'), text: L('Who played what, who voted for what, and how many points everyone made.', 'Кто что выложил, кто за что голосовал и сколько очков кто заработал.') },
  ],

  ui: [
    { glyph: '📰', title: L('The situation', 'Ситуация'), text: L('The card at the top of the screen. Everything this round is an answer to it.', 'Карточка вверху экрана. Всё в этом раунде — ответ на неё.') },
    { glyph: '🃏', title: L('Your hand', 'Ваша рука'), text: L('On your phone. A card you play is replaced before the next round.', 'На вашем телефоне. Сыгранная карта заменяется новой к следующему раунду.') },
    { glyph: '⏱️', title: L('The ring timer', 'Кольцевой таймер'), text: L('How long is left in this phase. If it runs out, a card is played for you.', 'Сколько осталось до конца фазы. Если время выйдет, карта будет сыграна за вас.') },
    { glyph: '⭐', title: L('The multiplier', 'Множитель'), text: L('Later rounds can be worth more than early ones - the screen says when.', 'Поздние раунды могут стоить дороже ранних — экран об этом сообщает.') },
  ],

  win: L('Most points when the last round is scored. Votes are the only way to score, so play for the table you are sitting at.', 'Побеждает тот, у кого больше очков после последнего раунда. Очки дают только голоса — играйте под тот стол, за которым сидите.'),

  actions: [
    { glyph: '🃏', title: L('Play a card', 'Выложить карту'), text: L('In the pick phase, one card, from your phone.', 'В фазе выбора — одну карту, со своего телефона.') },
    { glyph: '🗳️', title: L('Vote', 'Голосовать'), text: L('In the vote phase, for anyone\'s card but your own.', 'В фазе голосования — за любую карту, кроме своей.') },
  ],

  special: [
    { title: L('Age rating', 'Возрастной рейтинг'), text: L('A room is either 16+ or 18+, and a 16+ room can never be dealt an 18+ card - the filter is on the server.', 'Комната бывает 16+ или 18+, и в 16+ комнату карта 18+ не попадёт никогда: фильтр стоит на сервере.') },
    { title: L('Packs', 'Наборы'), text: L('The host chooses which packs of memes and situations are in play before the game starts.', 'Хост выбирает, какие наборы мемов и ситуаций участвуют, до начала игры.') },
    { title: L('Timeouts', 'Тайм-ауты'), text: L('If you do not play in time, the game plays a card for you - marked as automatic.', 'Если не успели, игра выложит карту за вас — с пометкой, что автоматически.') },
  ],

  end: [
    { title: L('The last round', 'Последний раунд'), text: L('The room plays a fixed number of rounds, chosen by the host.', 'Комната играет фиксированное число раундов, которое выбрал хост.') },
  ],
};

export const chpok = {
  emoji: '💥',
  title: L('Chpok', 'Чпок'),
  tagline: L('A question, everybody\'s answer, and a vote on which one is best.', 'Вопрос, ответы всех — и голосование, чей лучше.'),

  goal: L(
    'Every round asks one question. Everyone writes an answer, the answers are shown anonymously, and everyone votes for the best one.',
    'Каждый раунд задаётся один вопрос. Все пишут ответ, ответы показываются анонимно, и все голосуют за лучший.',
  ),

  short: [
    L('Read the question and type an answer on your phone.', 'Прочитайте вопрос и напишите ответ на телефоне.'),
    L('All the answers appear without names.', 'Все ответы появляются без имён.'),
    L('Vote for the answer you liked best - not your own.', 'Голосуйте за понравившийся ответ — но не за свой.'),
    L('Votes are points. Most points at the end wins.', 'Голоса — это очки. Побеждает тот, у кого их больше в конце.'),
  ],

  flow: [
    { id: 'ANSWER', glyph: '✍️', title: L('1. Answer', '1. Ответ'), text: L('Type your answer before the timer runs out.', 'Напишите ответ, пока не кончилось время.') },
    { id: 'VOTE', glyph: '🗳️', title: L('2. Vote', '2. Голосование'), text: L('Pick the best answer on the board.', 'Выберите лучший ответ на доске.') },
    { id: 'REVEAL', glyph: '🏆', title: L('3. Reveal', '3. Раскрытие'), text: L('Whose answer was whose, and the points.', 'Чей ответ был чей — и очки.') },
  ],

  ui: [
    { glyph: '❓', title: L('The question', 'Вопрос'), text: L('At the top of the shared screen.', 'Вверху общего экрана.') },
    { glyph: '📱', title: L('Your phone', 'Ваш телефон'), text: L('Everything you type or tap happens there; the big screen is for everybody.', 'Всё, что вы пишете и нажимаете, происходит там; большой экран — общий.') },
  ],

  win: L('Most points after the last question.', 'Побеждает тот, у кого больше очков после последнего вопроса.'),

  actions: [
    { glyph: '✍️', title: L('Write an answer', 'Написать ответ'), text: L('In the answer phase, once.', 'В фазе ответа, один раз.') },
    { glyph: '🗳️', title: L('Vote', 'Голосовать'), text: L('In the vote phase, for someone else\'s answer.', 'В фазе голосования, за чужой ответ.') },
  ],

  special: [
    { title: L('Anonymity', 'Анонимность'), text: L('Nobody knows who wrote what until the reveal - that is the point.', 'Никто не знает, кто что написал, до раскрытия — в этом весь смысл.') },
  ],

  end: [
    { title: L('The last question', 'Последний вопрос'), text: L('The room plays the number of rounds the host chose.', 'Комната играет столько раундов, сколько выбрал хост.') },
  ],
};

export default {
  bunker, mafia, memehype, chpok,
};
