// nowAction.js
// "Your action now" - one sentence per game that says what THIS player is
// expected to do at this exact moment, and nothing else.
//
// Every game answers the same four questions in the same shape:
//
//   tone   act | wait | urgent | info | over - what colour it reads as
//   title  the instruction itself, in the imperative ("Vote for someone")
//   hint   one line of why, or what happens next (optional)
//   step   which step of "how a round goes" this is, so the rules panel
//          can highlight the matching card (optional)
//
// A resolver only ever reads the payload the server already sends that
// game's screen - nothing new travels for this, and a game with no
// resolver falls back to its phase label, never to an error.
//
// The text lives here rather than in the flat translation dictionaries
// because it belongs WITH the rules content in rulesContent.js, which is
// bilingual data for the same reason: these two files are one document
// about one game, and splitting a sentence from the rule it explains is
// how they drift apart.

const L = (en, ru) => ({ en, ru });

// One string out of a bilingual pair.
export function say(pair, language) {
  if (!pair) return '';
  if (typeof pair === 'string') return pair;
  return pair[language] || pair.en || '';
}

const ACT = 'act';
const WAIT = 'wait';
const URGENT = 'urgent';
const INFO = 'info';
const OVER = 'over';

const waitingForOthers = L('Wait for the others', 'Ждите остальных');
const gameOver = {
  tone: OVER,
  title: L('The game is over', 'Игра окончена'),
  hint: L('Look at the results, then the host starts the next game.', 'Посмотрите итоги — дальше хост начинает новую игру.'),
};
const inLobby = {
  tone: INFO,
  title: L('Waiting in the lobby', 'Ожидание в лобби'),
  hint: L('The host starts the game when everyone is ready.', 'Хост запустит игру, когда все будут готовы.'),
};

// --- The Bunker --------------------------------------------------------

function bunker(state) {
  const you = state.you || {};
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (you.status === 'excluded') {
    return {
      tone: INFO,
      step: state.phase,
      title: L('You are outside the bunker', 'Вы остались снаружи'),
      hint: L('You can still watch and talk, but you no longer reveal or vote.', 'Вы можете смотреть и общаться, но больше не открываете карты и не голосуете.'),
    };
  }
  if (state.phase === 'REVEAL') {
    if (you.blockedFromRevealing) {
      return {
        tone: INFO,
        step: 'REVEAL',
        title: L('You reveal nothing this round', 'В этом раунде вы ничего не открываете'),
        hint: L('A card played on you has sealed your mouth until the next round.', 'Сыгранная против вас карта закрыла вам рот до следующего раунда.'),
      };
    }
    if (you.canReveal) {
      return you.requiredKey
        ? {
          tone: ACT,
          step: 'REVEAL',
          title: L('Your turn — reveal your profession', 'Ваш ход — откройте профессию'),
          hint: L('In the first round everybody opens the same card.', 'В первом раунде все открывают одну и ту же карту.'),
        }
        : {
          tone: ACT,
          step: 'REVEAL',
          title: L('Your turn — choose one card to reveal', 'Ваш ход — выберите, какую карту открыть'),
          hint: L('Open what argues for you. Everything you keep back is suspicion.', 'Открывайте то, что говорит в вашу пользу. Всё, что вы скрываете, — повод для подозрений.'),
        };
    }
    return {
      tone: WAIT,
      step: 'REVEAL',
      title: L('Someone else is revealing', 'Сейчас открывает другой игрок'),
      hint: L('Read what comes out — you will be voting on it soon.', 'Следите за тем, что открывают: скоро по этому голосовать.'),
    };
  }
  if (state.phase === 'DISCUSSION') {
    return {
      tone: ACT,
      step: 'DISCUSSION',
      title: L('Argue for your place', 'Доказывайте, что вы нужны бункеру'),
      hint: L('Say why the shelter needs you, and who it can do without.', 'Объясните, зачем вы бункеру и без кого он обойдётся.'),
    };
  }
  if (state.phase === 'VOTE') {
    if (you.canVote) {
      return {
        tone: URGENT,
        step: 'VOTE',
        title: L('Vote for the player to be excluded', 'Проголосуйте за игрока, которого хотите исключить'),
        hint: state.vote?.reason === 'duel'
          ? L('Only the two who argued can be voted out this round.', 'В этом раунде исключить можно только участников спора.')
          : L('You will be asked to confirm before the vote is cast.', 'Перед тем как голос уйдёт, вас попросят подтвердить.'),
      };
    }
    return {
      tone: WAIT,
      step: 'VOTE',
      title: L('Your vote is cast', 'Ваш голос отдан'),
      hint: L('Waiting for the rest of the table.', 'Ждём остальных игроков.'),
    };
  }
  if (state.phase === 'RESULT') {
    return {
      tone: INFO,
      step: 'RESULT',
      title: L('The result of the vote', 'Итог голосования'),
      hint: L('The next round starts in a moment.', 'Через мгновение начнётся следующий раунд.'),
    };
  }
  return null;
}

// --- Mafia -------------------------------------------------------------

function mafia(state) {
  const you = state.you || {};
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (state.phase === 'ROLE_REVEAL') {
    return {
      tone: INFO,
      step: 'ROLE_REVEAL',
      title: L('Remember your role', 'Запомните свою роль'),
      hint: L('Nobody else sees it. The night begins in a moment.', 'Её больше никто не видит. Скоро начнётся ночь.'),
    };
  }
  if (!you.alive) {
    return {
      tone: INFO,
      step: state.phase,
      title: L('You are out of the game', 'Вы выбыли из игры'),
      hint: L('You can watch, but you cannot speak or vote.', 'Вы можете наблюдать, но не говорить и не голосовать.'),
    };
  }
  if (state.phase === 'NIGHT') {
    if (!you.canActTonight) {
      return {
        tone: WAIT,
        step: 'NIGHT',
        title: L('Sleep — you have nothing to do tonight', 'Спите — этой ночью вы ничего не делаете'),
        hint: L('Others are acting in the dark.', 'В темноте сейчас действуют другие.'),
      };
    }
    return you.myNightTarget
      ? {
        tone: WAIT,
        step: 'NIGHT',
        title: L('Your choice is made', 'Ваш выбор сделан'),
        hint: waitingForOthers,
      }
      : {
        tone: ACT,
        step: 'NIGHT',
        title: L('Choose your target for tonight', 'Выберите цель на эту ночь'),
        hint: L('Tap a player. Nobody sees who you picked.', 'Нажмите на игрока. Никто не увидит ваш выбор.'),
      };
  }
  if (state.phase === 'DAY') {
    return {
      tone: ACT,
      step: 'DAY',
      title: L('Talk — say what you saw and what you think', 'Говорите — расскажите, что видели и что думаете'),
      hint: L('The vote comes right after the discussion.', 'Сразу после обсуждения будет голосование.'),
    };
  }
  if (state.phase === 'VOTE') {
    return you.myVote
      ? { tone: WAIT, step: 'VOTE', title: L('Your vote is cast', 'Ваш голос отдан'), hint: waitingForOthers }
      : {
        tone: URGENT,
        step: 'VOTE',
        title: L('Vote for the player to be put out', 'Проголосуйте за того, кого выгнать из города'),
        hint: L('A tie means nobody leaves.', 'При равенстве голосов не уходит никто.'),
      };
  }
  if (state.phase === 'RESULT') {
    return { tone: INFO, step: 'RESULT', title: L('The result of the day', 'Итог дня'), hint: L('The next night begins in a moment.', 'Скоро начнётся следующая ночь.') };
  }
  return null;
}

// --- Meme Hype ---------------------------------------------------------

function memehype(state) {
  const you = state.you || {};
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (!you.playing) {
    return {
      tone: INFO,
      step: state.phase,
      title: L('You are watching this round', 'Вы наблюдаете за этим раундом'),
      hint: L('Join from a phone to play the next one.', 'Подключитесь с телефона, чтобы играть в следующем.'),
    };
  }
  if (state.phase === 'PICK') {
    return you.canPick
      ? {
        tone: ACT,
        step: 'PICK',
        title: L('Pick the card that fits the situation', 'Выберите карту, которая подходит к ситуации'),
        hint: L('Funniest wins — not most sensible.', 'Побеждает самая смешная, а не самая логичная.'),
      }
      : { tone: WAIT, step: 'PICK', title: L('Your card is played', 'Ваша карта сыграна'), hint: waitingForOthers };
  }
  if (state.phase === 'VOTE') {
    return you.canVote
      ? {
        tone: URGENT,
        step: 'VOTE',
        title: L('Vote for the funniest card', 'Голосуйте за самую смешную карту'),
        hint: L('You cannot vote for your own.', 'За свою карту голосовать нельзя.'),
      }
      : { tone: WAIT, step: 'VOTE', title: L('Your vote is cast', 'Ваш голос отдан'), hint: waitingForOthers };
  }
  if (state.phase === 'REVEAL') {
    return { tone: INFO, step: 'REVEAL', title: L('Who won this round', 'Кто выиграл раунд'), hint: L('Points are handed out, then the next situation.', 'Сейчас начислятся очки — и будет новая ситуация.') };
  }
  return null;
}

// --- Chpok -------------------------------------------------------------

function chpok(state) {
  const you = state.you || {};
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (!you.playing) {
    return {
      tone: INFO, step: state.phase, title: L('You are watching', 'Вы наблюдаете'), hint: L('Join from a phone to play.', 'Подключитесь с телефона, чтобы играть.'),
    };
  }
  if (state.phase === 'ANSWER') {
    return you.canAnswer
      ? { tone: ACT, step: 'ANSWER', title: L('Write your answer', 'Напишите свой ответ'), hint: L('Anything goes, as long as it lands.', 'Подойдёт что угодно, лишь бы зашло.') }
      : { tone: WAIT, step: 'ANSWER', title: L('Your answer is in', 'Ваш ответ принят'), hint: waitingForOthers };
  }
  if (state.phase === 'VOTE') {
    return you.canVote
      ? { tone: URGENT, step: 'VOTE', title: L('Vote for the best answer', 'Голосуйте за лучший ответ'), hint: L('Not your own one.', 'За свой ответ голосовать нельзя.') }
      : { tone: WAIT, step: 'VOTE', title: L('Your vote is cast', 'Ваш голос отдан'), hint: waitingForOthers };
  }
  if (state.phase === 'REVEAL') return { tone: INFO, step: 'REVEAL', title: L('The answers are revealed', 'Ответы раскрыты'), hint: L('Then on to the next question.', 'Дальше — следующий вопрос.') };
  return null;
}

// --- Citadels ----------------------------------------------------------

function citadels(state) {
  const you = state.you || {};
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (state.phase === 'DRAFT') {
    return you.canPick
      ? {
        tone: ACT,
        step: 'DRAFT',
        title: L('Choose your role for this round', 'Выберите роль на этот раунд'),
        hint: L('Nobody sees your choice - and the roles left over pass on.', 'Ваш выбор никто не видит — оставшиеся роли уходят дальше.'),
      }
      : { tone: WAIT, step: 'DRAFT', title: L('Someone else is choosing a role', 'Роль выбирает другой игрок'), hint: waitingForOthers };
  }
  if (state.phase === 'TURNS') {
    if (!you.isYourTurn) {
      return { tone: WAIT, step: 'TURNS', title: L('Wait for your role to be called', 'Ждите, когда назовут вашу роль'), hint: L('Roles act in rank order, one after another.', 'Роли ходят по порядку рангов, одна за другой.') };
    }
    const step = you.turn?.step;
    if (step === 'CHOOSE') {
      return { tone: ACT, step: 'TURNS', title: L('Take gold or take a card', 'Возьмите золото или карту'), hint: L('Two gold, or one of the two cards you were dealt.', 'Две монеты — или одна из двух вытянутых карт.') };
    }
    return {
      tone: ACT,
      step: 'TURNS',
      title: L('Your turn — build, use your ability, then end the turn', 'Ваш ход — стройте, используйте способность и завершайте ход'),
      hint: L('Your role can be used once. A district costs its printed price.', 'Способность роли работает один раз. Район стоит указанную цену.'),
    };
  }
  return null;
}

// --- Catan -------------------------------------------------------------

function catan(state) {
  const you = state.you || {};
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (you.mustDiscard > 0) {
    return {
      tone: URGENT,
      step: 'ROBBER',
      title: L(`Discard ${you.mustDiscard} resource cards`, `Сбросьте ${you.mustDiscard} карт ресурсов`),
      hint: L('A seven was rolled and your hand is too big.', 'Выпала семёрка, а рука слишком большая.'),
    };
  }
  if (state.phase === 'SETUP') {
    if (!you.setupTurn) return { tone: WAIT, step: 'SETUP', title: L('Someone else is placing', 'Сейчас ставит другой игрок'), hint: waitingForOthers };
    return state.setup?.step === 'SETTLEMENT'
      ? { tone: ACT, step: 'SETUP', title: L('Place a settlement', 'Поставьте поселение'), hint: L('Pick a corner where three good numbers meet.', 'Выбирайте угол, где сходятся три хороших числа.') }
      : { tone: ACT, step: 'SETUP', title: L('Place a road', 'Поставьте дорогу'), hint: L('It must touch the settlement you just placed.', 'Она должна касаться только что поставленного поселения.') };
  }
  if (state.phase === 'PLAY') {
    if (!you.isYourTurn) return { tone: WAIT, step: 'TURN', title: L("Wait for your turn", 'Ждите своего хода'), hint: L('You still collect resources on every roll.', 'Ресурсы вы всё равно получаете на каждом броске.') };
    const step = state.turn?.step;
    if (step === 'ROLL') return { tone: ACT, step: 'ROLL', title: L('Roll the dice', 'Бросьте кубики'), hint: L('Everyone collects from the number you roll.', 'По выпавшему числу ресурсы получают все.') };
    if (step === 'ROBBER') return { tone: URGENT, step: 'ROBBER', title: L('Move the robber', 'Переставьте разбойника'), hint: L('The hex you choose stops producing, and you steal from one neighbour.', 'Выбранный гекс перестаёт давать ресурс, и вы крадёте карту у соседа.') };
    return { tone: ACT, step: 'BUILD', title: L('Build, trade, or end your turn', 'Стройте, торгуйте или завершайте ход'), hint: L('Ten points wins the game.', 'Для победы нужно десять очков.') };
  }
  return null;
}

// --- Cosmic Encounter --------------------------------------------------

function cosmic(state) {
  const you = state.you || {};
  const enc = state.encounter;
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (state.phase === 'ALIENS') {
    return { tone: ACT, step: 'ALIENS', title: L('Choose your alien power', 'Выберите свою инопланетную силу'), hint: L('It breaks one rule of the game in your favour, all game long.', 'Она ломает одно правило игры в вашу пользу — на всю партию.') };
  }
  if (!enc) return null;
  const mine = enc.aggressorId === you.id;
  const theirs = enc.defenderId === you.id;
  const main = mine || theirs;
  switch (enc.phase) {
    case 'REGROUP':
      return mine
        ? { tone: ACT, step: 'REGROUP', title: L('Take a ship back from the warp', 'Заберите корабль из варпа'), hint: L('One ship returns to any of your colonies.', 'Один корабль возвращается в любую вашу колонию.') }
        : { tone: WAIT, step: 'REGROUP', title: L('The attacker is regrouping', 'Атакующий перегруппировывается'), hint: waitingForOthers };
    case 'DESTINY':
      return mine
        ? { tone: ACT, step: 'DESTINY', title: L('Draw destiny', 'Тяните карту судьбы'), hint: L('It decides whose system you attack.', 'Она решит, в чью систему вы нападёте.') }
        : { tone: WAIT, step: 'DESTINY', title: L('Destiny is being drawn', 'Тянут карту судьбы'), hint: waitingForOthers };
    case 'LAUNCH':
      return mine
        ? { tone: ACT, step: 'LAUNCH', title: L('Choose a planet and send your ships', 'Выберите планету и отправьте корабли'), hint: L('Up to four ships go through the gate.', 'Через врата летят до четырёх кораблей.') }
        : { tone: WAIT, step: 'LAUNCH', title: L('The attacker is choosing a target', 'Атакующий выбирает цель'), hint: waitingForOthers };
    case 'ALLIANCE':
      if (main) {
        return { tone: ACT, step: 'ALLIANCE', title: L('Invite allies', 'Позовите союзников'), hint: L('Allies who end up on the winning side are paid.', 'Союзники победившей стороны получают награду.') };
      }
      return { tone: ACT, step: 'ALLIANCE', title: L('Join a side, or stay out', 'Примкните к стороне — или останьтесь в стороне'), hint: L('You only gain if the side you joined wins.', 'Выгода будет, только если ваша сторона победит.') };
    case 'PLANNING':
      if (main) {
        return { tone: URGENT, step: 'PLANNING', title: L('Play an encounter card face down', 'Сыграйте карту столкновения рубашкой вверх'), hint: L('Attack adds to your ships; negotiate makes a deal instead.', 'Атака складывается с кораблями; переговоры — это сделка вместо боя.') };
      }
      return { tone: WAIT, step: 'PLANNING', title: L('The two sides are choosing cards', 'Стороны выбирают карты'), hint: waitingForOthers };
    case 'REVEAL':
      return { tone: INFO, step: 'RESOLUTION', title: L('The cards are revealed', 'Карты раскрыты'), hint: L('Ships plus card decides it.', 'Решают корабли плюс значение карты.') };
    case 'RESOLUTION':
      return { tone: INFO, step: 'RESOLUTION', title: L('The encounter is resolved', 'Столкновение разрешается'), hint: L('Losing ships go to the warp.', 'Проигравшие корабли уходят в варп.') };
    default:
      return { tone: WAIT, step: enc.phase, title: L('The encounter is under way', 'Столкновение идёт'), hint: waitingForOthers };
  }
}

// --- Monopoly ----------------------------------------------------------

function monopoly(state, { isMyTurn } = {}) {
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase === 'LOBBY') return inLobby;
  if (state.auction) {
    return { tone: URGENT, step: 'AUCTION', title: L('Bid, or pass on the auction', 'Делайте ставку или пасуйте на аукционе'), hint: L('The last bidder takes the property.', 'Недвижимость уйдёт последнему, кто поднял ставку.') };
  }
  if (!isMyTurn) {
    return { tone: WAIT, step: 'TURN', title: L('Wait for your turn', 'Ждите своего хода'), hint: L('You can still trade and manage your property.', 'Пока можно торговаться и управлять своей недвижимостью.') };
  }
  const pending = state.pendingAction;
  if (pending?.type === 'BUY_DECISION') {
    return { tone: URGENT, step: 'ACTION', title: L('Buy this property, or send it to auction', 'Купите участок или отправьте его на аукцион'), hint: L('If you pass, everyone can bid for it.', 'Если откажетесь, за него смогут побороться все.') };
  }
  if (pending?.type === 'CARD_REVEAL') {
    return { tone: ACT, step: 'ACTION', title: L('Read the card and confirm', 'Прочитайте карту и подтвердите'), hint: null };
  }
  if (state.phase === 'ROLLING') {
    return { tone: ACT, step: 'ROLL', title: L('Roll the dice', 'Бросьте кубики'), hint: L('Doubles let you roll again.', 'Дубль даёт ещё один бросок.') };
  }
  return { tone: ACT, step: 'ACTION', title: L('Build, trade, or end your turn', 'Стройте, торгуйте или завершайте ход'), hint: L('Rent is collected automatically.', 'Аренда списывается автоматически.') };
}

// --- A Game of Thrones -------------------------------------------------

function throne(state) {
  if (state.phase === 'GAME_OVER') return gameOver;
  if (state.phase !== 'PLAY') return inLobby;
  const g = state.game || {};
  const step = g.step || g.phase;
  const map = {
    westeros: {
      tone: INFO, step: 'westeros', title: L('The Westeros cards are being read', 'Читаются карты Вестероса'), hint: L('They change the rules of this round for everyone.', 'Они меняют правила этого раунда для всех.'),
    },
    planning: {
      tone: ACT, step: 'planning', title: L('Place your orders face down', 'Разложите приказы рубашкой вверх'), hint: L('One order per area with your units.', 'По одному приказу на каждую область с вашими войсками.'),
    },
    action: {
      tone: ACT, step: 'action', title: L('Resolve your orders', 'Исполняйте свои приказы'), hint: L('Raids, then marches, then consolidate power.', 'Сначала налёты, затем походы, затем сбор власти.'),
    },
  };
  return map[step] || { tone: WAIT, title: L('The round is under way', 'Раунд идёт'), hint: null };
}

const RESOLVERS = {
  bunker, mafia, memehype, chpok, citadels, catan, cosmic, monopoly, throne,
};

// The instruction for this player right now, already in one language.
// Returns null when a game has nothing specific to say - the caller falls
// back to its own phase label.
export function nowAction(gameId, state, ctx = {}) {
  const resolver = RESOLVERS[gameId];
  if (!resolver || !state) return null;
  let raw = null;
  try {
    raw = resolver(state, ctx);
  } catch {
    // A payload shape we did not expect must never take the screen down:
    // the panel simply says nothing.
    return null;
  }
  if (!raw) return null;
  const language = ctx.language || 'en';
  return {
    tone: raw.tone || INFO,
    step: raw.step || null,
    title: say(raw.title, language),
    hint: raw.hint ? say(raw.hint, language) : null,
  };
}

export const TONES = {
  act: 'act', wait: 'wait', urgent: 'urgent', info: 'info', over: 'over',
};

export default nowAction;
