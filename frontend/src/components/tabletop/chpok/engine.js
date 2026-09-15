// engine.js
// The rules of both ЧПОК boxes as pure functions: createGame() lays out a
// table, act() applies one thing the players did and returns the next
// table. Nothing here touches React or reads the clock - the screen passes
// the time in - so every variant can be played to its end in a script.
//
// The players say their answers out loud, so the engine never judges a
// word: the table does, and the screen reports the verdict ("answered",
// "not accepted", "who was first"). Each variant follows its rule card
// from the box; where a card is silent the choice is commented below.
//
// First box: knockout, alphabet, party, judge, thirty.
// Second box: talent, bomb, duel.

import { LETTERS, THEMES_1, THEMES_2 } from './cards.js';

export const ENGINE_VERSION = 1;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const ANSWER_SECONDS = 3;
export const KNOCKOUT_LIMIT = 5;
export const ALPHABET_OPEN = 5;
export const JUDGE_COUNT = 5;
export const THIRTY_SECONDS = 30;
export const THIRTY_TURNS = 2;
export const HAND_SIZE = 4;
export const BOMB_SECONDS = 60;
export const BOMB_ROUNDS = 15;
export const DUEL_OPEN = 3;

export const GAMES = {
  chpok: { id: 'chpok', slug: 'chpok', modes: ['knockout', 'alphabet', 'party', 'judge', 'thirty'] },
  chpok2: { id: 'chpok2', slug: 'chpok-2', modes: ['talent', 'bomb', 'duel'] },
};

// A judge or a host facing a single answer has nothing to choose between.
const MODE_MIN_PLAYERS = { judge: 3, talent: 3 };
export const minPlayersFor = (mode) => MODE_MIN_PLAYERS[mode] || MIN_PLAYERS;

// Fewer cards wins in these variants; more wins everywhere else.
const LOWER_WINS = { knockout: true, bomb: true };

export function shuffle(list, rng = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// `recycle` is the card's "if the deck runs out, shuffle the discard into
// a new deck" - only the variants that say so get it.
function draw(pile, rng, recycle) {
  if (pile.deck.length === 0 && recycle && pile.discard.length > 0) {
    pile.deck = shuffle(pile.discard, rng);
    pile.discard = [];
  }
  return pile.deck.length > 0 ? pile.deck.pop() : null;
}

const zeros = (n) => Array.from({ length: n }, () => 0);
const isSeat = (s, i) => Number.isInteger(i) && i >= 0 && i < s.players.length;
const nextSeat = (s, seat) => (seat + 1) % s.players.length;

// Seats clockwise from the left of `seat`, without it.
export function seatsAfter(count, seat) {
  return Array.from({ length: count - 1 }, (_, k) => (seat + 1 + k) % count);
}

function nextAlive(s, seat) {
  for (let k = 1; k <= s.players.length; k += 1) {
    const j = (seat + k) % s.players.length;
    if (!s.out[j]) return j;
  }
  return seat;
}

function validLetters(open, picks) {
  return Array.isArray(picks)
    && new Set(picks).size === picks.length
    && picks.every((i) => Number.isInteger(i) && i >= 0 && i < open.length);
}

// Notices tell the table what just happened. Drinking notices come from the
// optional alcohol rules and exist only when that version is switched on.
function note(s, key, vars, drink = false) {
  if (drink && !s.alcohol) return;
  s.notices.push({ key: `tabletop.${drink ? 'drink' : 'notice'}.${key}`, vars, drink });
}

export function createGame({
  game, mode, names, alcohol = false, withFirstBox = false,
}, rng = Math.random) {
  const def = GAMES[game];
  if (!def || !def.modes.includes(mode)) throw new Error(`Unknown variant ${game}/${mode}`);
  const players = names.slice(0, MAX_PLAYERS);
  if (players.length < minPlayersFor(mode)) throw new Error('Not enough players');

  // The second box is compatible with the first: its rules can use the
  // first box's themes too.
  const themes = game === 'chpok' ? THEMES_1 : [...THEMES_2, ...(withFirstBox ? THEMES_1 : [])];
  const n = players.length;
  const s = {
    v: ENGINE_VERSION,
    game,
    mode,
    alcohol: !!alcohol,
    withFirstBox: game === 'chpok2' && !!withFirstBox,
    players,
    black: { deck: shuffle(themes, rng), discard: [] },
    white: { deck: shuffle(LETTERS, rng), discard: [] },
    phase: 'ready',
    notices: [],
    winners: [],
    seq: 0,
  };

  switch (mode) {
    case 'knockout':
      Object.assign(s, {
        penalties: zeros(n), out: players.map(() => false), leader: 0, answerer: null, theme: null, letters: [], turnStartedAt: null,
      });
      break;
    case 'alphabet':
      s.taken = zeros(n);
      s.open = Array.from({ length: ALPHABET_OPEN }, () => draw(s.white, rng, false));
      s.theme = draw(s.black, rng, false);
      s.phase = 'question';
      break;
    case 'party':
      s.won = zeros(n);
      s.theme = draw(s.black, rng, false);
      s.letter = draw(s.white, rng, true);
      s.phase = 'question';
      break;
    case 'judge':
      Object.assign(s, {
        won: zeros(n), judge: 0, theme: null, hands: [], countdownFrom: null,
      });
      break;
    case 'thirty':
      Object.assign(s, {
        scores: zeros(n), turns: zeros(n), current: 0, theme: null, letter: null, count: 0, passes: 0, endsAt: null,
      });
      break;
    case 'talent':
      Object.assign(s, {
        won: zeros(n), host: 0, theme: null, letter: null, queue: [], pickIndex: 0, submissions: [], revealed: 0,
      });
      s.hands = players.map(() => []);
      for (let round = 0; round < HAND_SIZE; round += 1) {
        s.hands.forEach((hand) => hand.push(draw(s.black, rng, false)));
      }
      break;
    case 'bomb':
      Object.assign(s, {
        penalties: zeros(n), round: 1, first: 0, holder: null, theme: null, letter: null, endsAt: null, skipUsed: players.map(() => false),
      });
      break;
    case 'duel':
      Object.assign(s, { win: zeros(n), pen: zeros(n) });
      s.open = Array.from({ length: DUEL_OPEN }, () => draw(s.white, rng, false));
      s.theme = draw(s.black, rng, false);
      s.phase = 'question';
      break;
    default:
      break;
  }
  return s;
}

export function scoreValues(s) {
  switch (s.mode) {
    case 'knockout':
    case 'bomb':
      return s.penalties;
    case 'alphabet':
      return s.taken;
    case 'thirty':
      return s.scores;
    case 'duel':
      return s.win.map((w, i) => w - s.pen[i]);
    default:
      return s.won;
  }
}

// Best first; knocked-out players last.
export function standings(s) {
  const values = scoreValues(s);
  const lower = !!LOWER_WINS[s.mode];
  return s.players
    .map((name, index) => ({
      index, name, value: values[index], out: !!s.out?.[index],
    }))
    .sort((a, b) => (a.out - b.out) || (lower ? a.value - b.value : b.value - a.value) || (a.index - b.index));
}

function finish(s) {
  const rows = standings(s).filter((r) => !r.out);
  const best = rows.length > 0 ? rows[0].value : null;
  s.winners = rows.filter((r) => r.value === best).map((r) => r.index);
  s.phase = 'over';
}

// --- 30 seconds helpers ---------------------------------------------------
function endThirtyTurn(s) {
  const seat = s.current;
  const name = s.players[seat];
  s.scores[seat] += s.count;
  s.turns[seat] += 1;
  if (s.letter !== null) s.white.discard.push(s.letter);
  s.black.discard.push(s.theme);
  note(s, 'turnResult', { name, n: s.count });
  if (s.passes > 0) note(s, 'perPass', { name, n: s.passes }, true);
  Object.assign(s, {
    letter: null, theme: null, endsAt: null, count: 0, passes: 0, current: nextSeat(s, seat), phase: 'ready',
  });
  if (s.turns.every((turns) => turns >= THIRTY_TURNS)) finish(s);
}

function nextThirtyLetter(s, rng) {
  s.white.discard.push(s.letter);
  s.letter = draw(s.white, rng, false);
  // The card does not say what happens when all 27 letters are used up
  // inside one turn; there is nothing left to answer, so the turn ends.
  if (s.letter === null) endThirtyTurn(s);
}

function passBomb(s, rng) {
  s.white.discard.push(s.letter);
  s.holder = nextSeat(s, s.holder);
  s.letter = draw(s.white, rng, true);
}

const HANDLERS = {
  // --- Box 1, variant 1: Knockout ------------------------------------------
  knockout: {
    reveal(s, a, rng, now) {
      if (s.phase !== 'ready') return false;
      s.theme = draw(s.black, rng, false);
      // Unreachable in practice: at most 8 x 5 penalty cards leave the deck.
      if (s.theme === null) { finish(s); return true; }
      s.letters = [draw(s.white, rng, true)];
      s.answerer = nextAlive(s, s.leader);
      s.turnStartedAt = now;
      s.phase = 'answer';
      return true;
    },
    answered(s, a, rng, now) {
      if (s.phase !== 'answer') return false;
      let letter = draw(s.white, rng, true);
      if (letter === null) {
        // Every letter is face up in this one round: reuse all but the last.
        s.white.deck = shuffle(s.letters.slice(0, -1), rng);
        s.letters = s.letters.slice(-1);
        letter = draw(s.white, rng, false);
      }
      s.letters.push(letter);
      s.answerer = nextAlive(s, s.answerer);
      s.turnStartedAt = now;
      return true;
    },
    failed(s) {
      if (s.phase !== 'answer') return false;
      const loser = s.answerer;
      const name = s.players[loser];
      s.penalties[loser] += 1;
      s.white.discard.push(...s.letters);
      Object.assign(s, {
        letters: [], theme: null, answerer: null, turnStartedAt: null,
      });
      note(s, 'penalty', { name, n: s.penalties[loser], max: KNOCKOUT_LIMIT });
      note(s, 'self', { name }, true);
      if (s.penalties[loser] >= KNOCKOUT_LIMIT) {
        s.out[loser] = true;
        note(s, 'out', { name });
        note(s, 'bottom', { name }, true);
      }
      if (s.out.filter((o) => !o).length <= 1) { finish(s); return true; }
      // The loser opens the next round - or, once out, the next player still in.
      s.leader = s.out[loser] ? nextAlive(s, loser) : loser;
      s.phase = 'ready';
      return true;
    },
  },

  // --- Box 1, variant 2: Alphabet ------------------------------------------
  alphabet: {
    capture(s, a, rng) {
      if (s.phase !== 'question' || !isSeat(s, a.player) || !validLetters(s.open, a.letters) || a.letters.length < 2) return false;
      const n = a.letters.length;
      const name = s.players[a.player];
      s.taken[a.player] += n;
      s.open = s.open.filter((_, i) => !a.letters.includes(i));
      s.black.discard.push(s.theme);
      s.theme = null;
      note(s, 'captured', { name, n });
      note(s, 'chooseN', { name, n }, true);
      if (n === 2) note(s, 'onlyTwo', { name }, true);
      if (n > 4) note(s, 'chooseBottom', { name }, true);
      while (s.open.length < ALPHABET_OPEN) {
        const letter = draw(s.white, rng, false);
        if (letter === null) break;
        s.open.push(letter);
      }
      if (s.open.length < ALPHABET_OPEN) { finish(s); return true; }
      s.theme = draw(s.black, rng, true);
      return true;
    },
    addLetter(s, a, rng) {
      if (s.phase !== 'question') return false;
      const letter = draw(s.white, rng, false);
      // No letter left to add: the open ones can never be topped up again,
      // which is the card's end of the game.
      if (letter === null) { finish(s); return true; }
      s.open.push(letter);
      note(s, 'extraLetter', { letter });
      return true;
    },
  },

  // --- Box 1, variant 3: Party ---------------------------------------------
  party: {
    win(s, a, rng) {
      if (s.phase !== 'question' || !isSeat(s, a.player)) return false;
      const name = s.players[a.player];
      s.won[a.player] += 1;
      s.white.discard.push(s.letter);
      s.letter = null;
      note(s, 'wonTheme', { name });
      note(s, 'choose', { name }, true);
      s.theme = draw(s.black, rng, false);
      if (s.theme === null) { finish(s); return true; }
      s.letter = draw(s.white, rng, true);
      return true;
    },
    reject(s, a) {
      if (s.phase !== 'question' || !isSeat(s, a.player)) return false;
      const name = s.players[a.player];
      note(s, 'rejected', { name });
      note(s, 'self', { name }, true);
      return true;
    },
    nobody(s, a, rng) {
      if (s.phase !== 'question') return false;
      s.white.discard.push(s.letter);
      s.letter = draw(s.white, rng, true);
      note(s, 'nextLetter', {});
      note(s, 'everyone', {}, true);
      return true;
    },
  },

  // --- Box 1, variant 4: The judge decides ---------------------------------
  judge: {
    deal(s, a, rng, now) {
      if (s.phase !== 'ready') return false;
      s.theme = draw(s.black, rng, false);
      if (s.theme === null) { finish(s); return true; }
      s.hands = s.players.map((_, seat) => (seat === s.judge ? null : draw(s.white, rng, true)));
      s.countdownFrom = now;
      s.phase = 'answers';
      return true;
    },
    award(s, a) {
      if (s.phase !== 'answers' || !isSeat(s, a.player) || a.player === s.judge) return false;
      const name = s.players[a.player];
      s.won[a.player] += 1;
      note(s, 'wonTheme', { name });
      note(s, 'choose', { name }, true);
      s.white.discard.push(...s.hands.filter((letter) => letter !== null));
      Object.assign(s, {
        hands: [], theme: null, countdownFrom: null, judge: nextSeat(s, s.judge), phase: 'ready',
      });
      if (s.black.deck.length === 0) finish(s);
      return true;
    },
  },

  // --- Box 1, variant 5: 30 seconds ----------------------------------------
  thirty: {
    start(s, a, rng, now) {
      if (s.phase !== 'ready') return false;
      s.theme = draw(s.black, rng, true);
      // "Return all letters to the white deck and shuffle it."
      s.white.deck = shuffle([...s.white.deck, ...s.white.discard], rng);
      s.white.discard = [];
      s.letter = draw(s.white, rng, false);
      Object.assign(s, {
        count: 0, passes: 0, endsAt: now + THIRTY_SECONDS * 1000, phase: 'running',
      });
      return true;
    },
    score(s, a, rng) {
      if (s.phase !== 'running') return false;
      s.count += 1;
      nextThirtyLetter(s, rng);
      return true;
    },
    // Alcohol version only: set the letter aside, drink for it later.
    pass(s, a, rng) {
      if (s.phase !== 'running' || !s.alcohol) return false;
      s.passes += 1;
      nextThirtyLetter(s, rng);
      return true;
    },
    // Alcohol version only: someone else shouts the answer and takes the point.
    steal(s, a, rng) {
      if (s.phase !== 'running' || !s.alcohol || !isSeat(s, a.player) || a.player === s.current) return false;
      const name = s.players[a.player];
      s.scores[a.player] += 1;
      note(s, 'stolen', { name });
      note(s, 'twice', { name }, true);
      nextThirtyLetter(s, rng);
      return true;
    },
    end(s, a) {
      if (s.phase !== 'running' || (a.endsAt !== undefined && a.endsAt !== s.endsAt)) return false;
      endThirtyTurn(s);
      return true;
    },
  },

  // --- Box 2, variant 1: Talent show ---------------------------------------
  talent: {
    reveal(s, a, rng) {
      if (s.phase !== 'ready') return false;
      s.theme = draw(s.black, rng, false);
      if (s.theme === null) { finish(s); return true; }
      s.letter = draw(s.white, rng, true);
      s.phase = 'hostAnswer';
      return true;
    },
    toPick(s) {
      if (s.phase !== 'hostAnswer') return false;
      Object.assign(s, {
        queue: seatsAfter(s.players.length, s.host), pickIndex: 0, submissions: [], phase: 'pick',
      });
      return true;
    },
    submit(s, a, rng) {
      if (s.phase !== 'pick') return false;
      const seat = s.queue[s.pickIndex];
      const hand = s.hands[seat];
      if (a.player !== seat || !Number.isInteger(a.card) || a.card < 0 || a.card >= hand.length) return false;
      const [card] = hand.splice(a.card, 1);
      s.submissions.push({ player: seat, card });
      s.pickIndex += 1;
      if (s.pickIndex >= s.queue.length) {
        // The host shuffles the played cards, so nobody knows whose is whose.
        s.submissions = shuffle(s.submissions, rng);
        s.revealed = 0;
        s.phase = 'reveal';
      }
      return true;
    },
    // Alcohol version only: drink to throw the whole hand back and draw anew.
    redraw(s, a, rng) {
      if (s.phase !== 'pick' || !s.alcohol) return false;
      const seat = s.queue[s.pickIndex];
      if (a.player !== seat) return false;
      const size = s.hands[seat].length;
      s.black.deck = shuffle([...s.black.deck, ...s.hands[seat]], rng);
      s.hands[seat] = Array.from({ length: size }, () => draw(s.black, rng, false));
      note(s, 'redraw', { name: s.players[seat] }, true);
      return true;
    },
    revealNext(s) {
      if (s.phase !== 'reveal' || s.revealed >= s.submissions.length) return false;
      s.revealed += 1;
      return true;
    },
    choose(s, a, rng) {
      if (s.phase !== 'reveal' || s.revealed < s.submissions.length) return false;
      const chosen = s.submissions[a.submission];
      if (!chosen) return false;
      const name = s.players[chosen.player];
      s.won[chosen.player] += 1;
      s.black.discard.push(s.theme, ...s.submissions.filter((sub) => sub !== chosen).map((sub) => sub.card));
      s.white.discard.push(s.letter);
      note(s, 'chosen', { name });
      note(s, 'allExcept', { host: s.players[s.host], name }, true);
      Object.assign(s, {
        theme: null, letter: null, submissions: [], revealed: 0, queue: [], pickIndex: 0,
      });
      const drawers = seatsAfter(s.players.length, s.host);
      if (s.black.deck.length < drawers.length) { finish(s); return true; }
      drawers.forEach((seat) => s.hands[seat].push(draw(s.black, rng, false)));
      s.host = nextSeat(s, s.host);
      s.phase = 'ready';
      // The card is silent on a table with no theme left for the next host;
      // that round cannot be played, so the game ends here.
      if (s.black.deck.length === 0) finish(s);
      return true;
    },
  },

  // --- Box 2, variant 2: Explosive -----------------------------------------
  bomb: {
    start(s, a, rng, now) {
      if (s.phase !== 'ready') return false;
      s.theme = draw(s.black, rng, true);
      s.white.deck = shuffle([...s.white.deck, ...s.white.discard], rng);
      s.white.discard = [];
      s.holder = s.first;
      s.letter = draw(s.white, rng, true);
      s.endsAt = now + BOMB_SECONDS * 1000;
      s.skipUsed = s.players.map(() => false);
      s.phase = 'running';
      return true;
    },
    pass(s, a, rng) {
      if (s.phase !== 'running') return false;
      passBomb(s, rng);
      return true;
    },
    // Alcohol version only, once per player per round.
    skip(s, a, rng) {
      if (s.phase !== 'running' || !s.alcohol || s.skipUsed[s.holder]) return false;
      s.skipUsed[s.holder] = true;
      note(s, 'skip', { name: s.players[s.holder] }, true);
      passBomb(s, rng);
      return true;
    },
    boom(s, a) {
      if (s.phase !== 'running' || (a.endsAt !== undefined && a.endsAt !== s.endsAt)) return false;
      const seat = s.holder;
      const name = s.players[seat];
      s.penalties[seat] += 1;
      s.white.discard.push(s.letter);
      note(s, 'boom', { name });
      note(s, 'twice', { name }, true);
      Object.assign(s, {
        letter: null, theme: null, endsAt: null, holder: null, first: seat, round: s.round + 1, phase: 'ready',
      });
      if (s.round > BOMB_ROUNDS) finish(s);
      return true;
    },
  },

  // --- Box 2, variant 3: Duel ----------------------------------------------
  duel: {
    claim(s, a, rng) {
      if (s.phase !== 'question' || !isSeat(s, a.player) || !validLetters(s.open, a.letters)) return false;
      const name = s.players[a.player];
      const win = a.letters.length;
      const pen = s.open.length - win;
      s.win[a.player] += win;
      s.pen[a.player] += pen;
      note(s, 'duel', { name, win, pen });
      if (pen > 0) note(s, 'self', { name }, true);
      if (pen === 0) note(s, 'opponentsTwice', { name }, true);
      s.black.discard.push(s.theme);
      s.open = [];
      s.theme = null;
      if (s.white.deck.length < DUEL_OPEN) { finish(s); return true; }
      s.open = Array.from({ length: DUEL_OPEN }, () => draw(s.white, rng, false));
      s.theme = draw(s.black, rng, true);
      return true;
    },
  },
};

// Applies one action. An action the rules do not allow right now returns
// the same table untouched.
export function act(state, action, rng = Math.random, now = Date.now()) {
  if (!state || state.phase === 'over' || !action) return state;
  const s = structuredClone(state);
  s.notices = [];
  if (action.type === 'finish') {
    finish(s);
  } else {
    const handler = HANDLERS[s.mode]?.[action.type];
    if (!handler || handler(s, action, rng, now) === false) return state;
  }
  s.seq += 1;
  return s;
}
