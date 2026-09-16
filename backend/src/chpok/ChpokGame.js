// ChpokGame.js
// An online ЧПОК room: one big screen and a phone in everyone's hand.
//
// The boxed game is played out loud around a table. This is the same two
// decks played apart: the screen deals a theme and a letter, everyone
// WRITES an answer on their own phone, and then the table votes for the
// best one. Which makes the secrecy matter - an answer must not reach
// another player's phone before voting opens, and who wrote what must not
// reach anyone at all until the votes are in. So, like Mafia, this engine
// builds a different payload per viewer and that payload is the only thing
// that ever goes out on a socket.
//
// Everything that decides anything happens here: the deal, whose answer is
// whose, who may vote for what, the count, the points and the standings. A
// phone can only ever say "here is my answer" or "here is my vote", and it
// says both exactly once per round.

const crypto = require('crypto');
const { LETTERS, themesFor, BOXES } = require('./cards');

class ChpokError extends Error {}

const PHASES = {
  LOBBY: 'LOBBY',
  ANSWER: 'ANSWER',
  VOTE: 'VOTE',
  REVEAL: 'REVEAL',
  GAME_OVER: 'GAME_OVER',
};

// Three is the smallest table where voting means anything: nobody may vote
// for their own answer, so with two players every vote is forced.
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const MAX_ANSWER_LEN = 140;
const REVEAL_SEC = 12;
const ROUND_OPTIONS = [3, 5, 7, 10];
const ANSWER_SEC_OPTIONS = [45, 60, 90, 120];
const VOTE_SEC_OPTIONS = [20, 30, 45, 60];
const DEFAULT_SETTINGS = {
  box: 'chpok', rounds: 5, answerSec: 90, voteSec: 30, allowLateJoin: true,
};

// A vote names a CARD, never a person: the token is what a phone sends
// back, and only this engine knows whose answer it belongs to.
const token = () => crypto.randomBytes(8).toString('hex');

function pickOption(value, options, fallback) {
  const n = Math.round(Number(value));
  return options.includes(n) ? n : fallback;
}

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    box: BOXES.includes(src.box) ? src.box : base.box,
    rounds: pickOption(src.rounds ?? base.rounds, ROUND_OPTIONS, base.rounds),
    answerSec: pickOption(src.answerSec ?? base.answerSec, ANSWER_SEC_OPTIONS, base.answerSec),
    voteSec: pickOption(src.voteSec ?? base.voteSec, VOTE_SEC_OPTIONS, base.voteSec),
    allowLateJoin: src.allowLateJoin === undefined ? base.allowLateJoin : !!src.allowLateJoin,
  };
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Whatever a phone typed, reduced to one line of plain text. Control
// characters and runs of whitespace are what a copy-paste from another app
// brings with it; none of it belongs on the big screen.
function cleanAnswer(value) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER_LEN);
}

class ChpokGame {
  constructor(roomCode, hostId, settings) {
    this.gameType = 'chpok';
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.players = [];
    this.phase = PHASES.LOBBY;
    this.round = 0;
    this.theme = null;
    this.letter = null;
    this.deck = { themes: [], letters: [] };
    // playerId -> { id, text, at }. The id is the token a phone votes for.
    this.answers = {};
    // The order the answers are shown in - shuffled once, when voting
    // opens, so the screen and every phone agree on the numbering.
    this.answerOrder = [];
    // voterId -> answer token
    this.votes = {};
    this.roundResult = null;
    this.results = null;
    this.phaseEndsAt = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.endedAt = null;
  }

  // --- players -------------------------------------------------------

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId) || null;
  }

  // Everyone still in the game: a seat that was left is not one of them,
  // and neither is a screen that is only showing the game. A room is
  // usually one big screen and a phone each, but a group with a single
  // laptop plays from it as well - so whether a seat plays is a choice,
  // not something read off the device.
  activePlayers() {
    return this.players.filter((p) => !p.left && p.playing);
  }

  // Everyone in the room, playing or not, minus the seats that are gone.
  presentPlayers() {
    return this.players.filter((p) => !p.left);
  }

  // The big screen stops (or starts) taking part. Only before the game.
  setPlaying(playerId, playing) {
    const player = this.getPlayer(playerId);
    if (!player) throw new ChpokError('Player not found.');
    if (this.phase !== PHASES.LOBBY) throw new ChpokError('That can only be changed before the game starts.');
    player.playing = !!playing;
    if (!player.playing) player.ready = false;
    return player;
  }

  addPlayer({
    playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null, device = null,
  }) {
    const existing = this.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      if (device) existing.device = device;
      if (accountId) {
        existing.nickname = nickname || existing.nickname;
        existing.avatarUrl = avatarUrl;
      }
      return existing;
    }
    // Latecomers are welcome between rounds - a party game nobody can join
    // once it started is a party game people watch instead of play - but
    // never in the middle of an answer or a vote, which would either leak
    // the answers to them or let them vote on a round they did not play.
    if (this.phase === PHASES.GAME_OVER) throw new ChpokError('This game is over.');
    if (this.phase !== PHASES.LOBBY) {
      if (!this.settings.allowLateJoin) throw new ChpokError('This game has already started.');
      if (this.phase !== PHASES.REVEAL) throw new ChpokError('The round is in progress - you can join at the end of it.');
    }
    if (this.activePlayers().length >= MAX_PLAYERS) {
      throw new ChpokError(`A ЧПОК room holds at most ${MAX_PLAYERS} players.`);
    }
    const player = {
      id: playerId,
      socketId,
      nickname: String(nickname || 'Player').slice(0, 20),
      avatarUrl,
      accountId,
      guestKeyHash,
      device: device || 'screen',
      // A phone is always here to play; a screen says so for itself, and
      // the first seat in the room is the host, who plays by default.
      playing: device !== 'screen' || this.players.length === 0,
      connected: true,
      left: false,
      isHost: this.players.length === 0,
      ready: false,
      score: 0,
      roundsPlayed: 0,
      exitReason: null,
      surrendered: false,
    };
    if (player.isHost) this.hostId = player.id;
    this.players.push(player);
    return player;
  }

  handOffHost(leaving) {
    if (!leaving.isHost) return;
    leaving.isHost = false;
    const candidates = this.players.filter((p) => p.id !== leaving.id && !p.left);
    // A room with no host at all can never be started or moved on, so the
    // last fallback is a seat that has also been left.
    const remaining = this.players.filter((p) => p.id !== leaving.id);
    const heir = candidates.find((p) => p.accountId && p.connected)
      || candidates.find((p) => p.accountId)
      || candidates.find((p) => p.connected)
      || candidates[0]
      || remaining.find((p) => p.accountId)
      || remaining[0];
    if (heir) {
      heir.isHost = true;
      this.hostId = heir.id;
    }
  }

  removePlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (this.phase === PHASES.LOBBY) {
      this.handOffHost(player);
      this.players = this.players.filter((p) => p.id !== playerId);
      return;
    }
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this.handOffHost(player);
    if (this.phase === PHASES.GAME_OVER) return;
    // An answer that is already in the round stays in it - other players
    // may have voted on it, and taking it away would unpick their votes.
    // A vote that has not been counted yet goes, because the player is no
    // longer one of the people the count is waiting for.
    delete this.votes[playerId];
    if (this.activePlayers().length < MIN_PLAYERS) {
      this.finish('tooFew');
    }
  }

  setConnected(playerId, connected, socketId = null) {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    player.connected = connected;
    player.socketId = connected ? socketId : null;
    return player;
  }

  setReady(playerId, ready) {
    const player = this.getPlayer(playerId);
    if (!player) throw new ChpokError('Player not found.');
    if (this.phase === PHASES.LOBBY) player.ready = !!ready;
    return player;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw new ChpokError('Only the host can do that.');
  }

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new ChpokError('Settings can only be changed before the game starts.');
    this.settings = sanitizeSettings(patch, this.settings);
    return this.settings;
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new ChpokError('The game has already started.');
    if (this.activePlayers().length < MIN_PLAYERS) {
      throw new ChpokError(`ЧПОК needs at least ${MIN_PLAYERS} players with a phone connected.`);
    }
    this.deck = { themes: shuffle(themesFor(this.settings.box)), letters: shuffle(LETTERS) };
    this.players.forEach((p) => {
      p.score = 0;
      p.roundsPlayed = 0;
    });
    this.round = 0;
    this.results = null;
    this.startedAt = Date.now();
    this.beginRound();
    return this;
  }

  restart(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.GAME_OVER) throw new ChpokError('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => {
      p.ready = false;
      p.score = 0;
      p.roundsPlayed = 0;
    });
    Object.assign(this, {
      phase: PHASES.LOBBY,
      round: 0,
      theme: null,
      letter: null,
      answers: {},
      answerOrder: [],
      votes: {},
      roundResult: null,
      results: null,
      phaseEndsAt: null,
      startedAt: null,
      endedAt: null,
    });
    return this;
  }

  drawTheme() {
    if (this.deck.themes.length === 0) this.deck.themes = shuffle(themesFor(this.settings.box));
    return this.deck.themes.pop();
  }

  drawLetter() {
    if (this.deck.letters.length === 0) this.deck.letters = shuffle(LETTERS);
    return this.deck.letters.pop();
  }

  beginRound() {
    this.round += 1;
    this.theme = this.drawTheme();
    this.letter = this.drawLetter();
    this.answers = {};
    this.answerOrder = [];
    this.votes = {};
    this.roundResult = null;
    this.activePlayers().forEach((p) => { p.roundsPlayed += 1; });
    this.enterPhase(PHASES.ANSWER, this.settings.answerSec);
  }

  enterPhase(phase, durationSec) {
    this.phase = phase;
    this.phaseEndsAt = durationSec ? Date.now() + durationSec * 1000 : null;
  }

  // --- answering -----------------------------------------------------

  // One answer per player per round, and once it is sent it is sent: the
  // round is a sealed-bid one, and an answer that could still change after
  // other people had seen it would not be.
  submitAnswer(playerId, text) {
    if (this.phase !== PHASES.ANSWER) throw new ChpokError('Answers are closed.');
    const player = this.getPlayer(playerId);
    if (!player || player.left || !player.playing) throw new ChpokError('You are not playing in this room.');
    if (this.answers[playerId]) throw new ChpokError('You have already sent your answer.');
    const clean = cleanAnswer(text);
    if (!clean) throw new ChpokError('Write something first.');
    this.answers[playerId] = { id: token(), text: clean, at: Date.now() };
    return this.answers[playerId];
  }

  // Who the round is still waiting on. A player who has lost their phone
  // for a moment is still expected to answer; a player who is out is not.
  pendingAnswerIds() {
    return this.activePlayers().filter((p) => !this.answers[p.id]).map((p) => p.id);
  }

  everyoneAnswered() {
    return this.phase === PHASES.ANSWER && this.pendingAnswerIds().length === 0;
  }

  // --- voting --------------------------------------------------------

  openVote() {
    const entries = Object.entries(this.answers)
      .filter(([playerId]) => this.getPlayer(playerId));
    // Nobody wrote anything, or only one person did: there is nothing to
    // choose between, so the round is simply shown and the game moves on.
    if (entries.length < 2) {
      this.closeVote();
      return;
    }
    this.answerOrder = shuffle(entries.map(([, answer]) => answer.id));
    this.votes = {};
    this.enterPhase(PHASES.VOTE, this.settings.voteSec);
  }

  answerByToken(answerId) {
    const found = Object.entries(this.answers).find(([, a]) => a.id === answerId);
    return found ? { playerId: found[0], answer: found[1] } : null;
  }

  // One vote, for somebody else's card, and it cannot be taken back.
  castVote(voterId, answerId) {
    if (this.phase !== PHASES.VOTE) throw new ChpokError('Voting is closed.');
    const voter = this.getPlayer(voterId);
    if (!voter || voter.left || !voter.playing) throw new ChpokError('You are not playing in this room.');
    if (this.votes[voterId]) throw new ChpokError('You have already voted.');
    const target = this.answerByToken(answerId);
    if (!target || !this.answerOrder.includes(answerId)) throw new ChpokError('That answer is not in this round.');
    if (target.playerId === voterId) throw new ChpokError('You cannot vote for your own answer.');
    this.votes[voterId] = answerId;
    return this.votes[voterId];
  }

  // A player with no answer of their own still votes; a player whose
  // answer is the only one left obviously cannot.
  canVote(player) {
    if (!player || player.left || !player.playing) return false;
    return this.answerOrder.some((id) => this.answerByToken(id)?.playerId !== player.id);
  }

  pendingVoterIds() {
    return this.activePlayers().filter((p) => this.canVote(p) && !this.votes[p.id]).map((p) => p.id);
  }

  everyoneVoted() {
    return this.phase === PHASES.VOTE && this.pendingVoterIds().length === 0;
  }

  // --- the count -----------------------------------------------------

  // A vote is worth a point to whoever wrote the card, and the card with
  // the most votes is worth one more. A round nobody voted in scores
  // nothing, which is its own kind of verdict.
  closeVote() {
    const tally = {};
    Object.values(this.votes).forEach((answerId) => {
      tally[answerId] = (tally[answerId] || 0) + 1;
    });
    const entries = Object.entries(this.answers).map(([playerId, answer]) => ({
      playerId,
      nickname: this.getPlayer(playerId)?.nickname || '—',
      answerId: answer.id,
      text: answer.text,
      votes: tally[answer.id] || 0,
      voters: Object.entries(this.votes).filter(([, id]) => id === answer.id).map(([voterId]) => voterId),
      points: 0,
    }));
    const best = entries.reduce((max, e) => Math.max(max, e.votes), 0);
    entries.forEach((e) => {
      e.points = e.votes + (best > 0 && e.votes === best ? 1 : 0);
      const player = this.getPlayer(e.playerId);
      if (player) player.score += e.points;
    });
    entries.sort((a, b) => b.votes - a.votes || a.nickname.localeCompare(b.nickname));
    this.roundResult = {
      round: this.round,
      theme: this.theme,
      letter: this.letter,
      entries,
      winners: best > 0 ? entries.filter((e) => e.votes === best).map((e) => e.playerId) : [],
      silent: entries.length === 0,
    };
    this.enterPhase(PHASES.REVEAL, REVEAL_SEC);
  }

  nextRound() {
    if (this.round >= this.settings.rounds) {
      this.finish('rounds');
      return;
    }
    if (this.activePlayers().length < MIN_PLAYERS) {
      this.finish('tooFew');
      return;
    }
    this.beginRound();
  }

  finish(reason) {
    if (this.phase === PHASES.GAME_OVER) return;
    const standings = this.players
      .filter((p) => p.playing)
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        score: p.score,
        rounds: p.roundsPlayed,
        left: !!p.left,
        exitReason: p.exitReason || null,
      }))
      .sort((a, b) => (a.left - b.left) || (b.score - a.score) || a.nickname.localeCompare(b.nickname));
    // Only a player who is still here can win, and a table where nobody
    // ever got a vote has no winner rather than a room full of them.
    const staying = standings.filter((row) => !row.left);
    const best = staying.reduce((max, row) => Math.max(max, row.score), 0);
    this.results = {
      reason,
      rounds: this.round,
      standings,
      winnerIds: best > 0 ? staying.filter((r) => r.score === best).map((r) => r.playerId) : [],
    };
    this.phase = PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.endedAt = Date.now();
  }

  // --- the clock -----------------------------------------------------

  // What the room does when the phase it is in runs out of time. Called by
  // the room's single timer, and by the handler when there is nothing left
  // to wait for.
  advance() {
    switch (this.phase) {
      case PHASES.ANSWER:
        this.openVote();
        break;
      case PHASES.VOTE:
        this.closeVote();
        break;
      case PHASES.REVEAL:
        this.nextRound();
        break;
      default:
        break;
    }
    return this.phase;
  }

  // --- serialization -------------------------------------------------

  toJSON() {
    const {
      gameType, roomCode, hostId, settings, players, phase, round, theme, letter,
      deck, answers, answerOrder, votes, roundResult, results, phaseEndsAt, createdAt, startedAt, endedAt,
    } = this;
    return {
      gameType,
      roomCode,
      hostId,
      settings,
      players,
      phase,
      round,
      theme,
      letter,
      deck,
      answers,
      answerOrder,
      votes,
      roundResult,
      results,
      phaseEndsAt,
      createdAt,
      startedAt,
      endedAt,
    };
  }

  static fromJSON(data) {
    const game = new ChpokGame(data.roomCode, data.hostId, data.settings);
    [
      'players', 'phase', 'round', 'theme', 'letter', 'deck', 'answers', 'answerOrder',
      'votes', 'roundResult', 'results', 'phaseEndsAt', 'createdAt', 'startedAt', 'endedAt',
    ].forEach((field) => {
      if (data[field] !== undefined && data[field] !== null) game[field] = data[field];
    });
    game.players.forEach((p) => {
      p.connected = false;
      p.socketId = null;
      if (p.playing === undefined) p.playing = true;
    });
    return game;
  }

  // --- what each viewer may see ---------------------------------------

  // The cards on the table, as the big screen and every phone see them.
  // During the vote an answer is a number and a piece of text and nothing
  // else - the name attached to it is exactly what the vote is about.
  visibleAnswers(viewer) {
    if (this.phase === PHASES.ANSWER) return [];
    if (this.phase !== PHASES.VOTE) return [];
    return this.answerOrder.map((id, index) => {
      const entry = this.answerByToken(id);
      return {
        id,
        index: index + 1,
        text: entry.answer.text,
        mine: !!viewer && entry.playerId === viewer.id,
        votes: null,
      };
    });
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId) || null;
    const answered = new Set(Object.keys(this.answers));
    const voted = new Set(Object.keys(this.votes));

    return {
      gameType: 'chpok',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      maxAnswerLength: MAX_ANSWER_LEN,
      options: { rounds: ROUND_OPTIONS, answerSec: ANSWER_SEC_OPTIONS, voteSec: VOTE_SEC_OPTIONS, boxes: BOXES },
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      // The theme and the letter are the whole point of the round: they are
      // on the big screen, so they are on every phone too.
      theme: this.phase === PHASES.LOBBY ? null : this.theme,
      letter: this.phase === PHASES.LOBBY ? null : this.letter,
      players: this.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        isGuest: !p.accountId,
        isHost: p.isHost,
        device: p.device,
        playing: !!p.playing,
        connected: p.connected,
        left: !!p.left,
        exitReason: p.exitReason || null,
        surrendered: !!p.surrendered,
        ready: p.ready,
        score: p.score,
        // Who the room is waiting for is public; WHAT they wrote is not.
        answered: answered.has(p.id),
        voted: voted.has(p.id),
        isYou: viewer ? p.id === viewer.id : false,
      })),
      answers: this.visibleAnswers(viewer),
      you: viewer
        ? {
          id: viewer.id,
          isHost: viewer.isHost,
          device: viewer.device,
          playing: !!viewer.playing,
          score: viewer.score,
          left: !!viewer.left,
          canAnswer: this.phase === PHASES.ANSWER && viewer.playing && !viewer.left && !this.answers[viewer.id],
          myAnswer: this.answers[viewer.id]?.text || null,
          myVote: this.votes[viewer.id] || null,
          canVote: this.phase === PHASES.VOTE && this.canVote(viewer) && !this.votes[viewer.id],
        }
        : null,
      waitingOn: this.phase === PHASES.ANSWER
        ? this.pendingAnswerIds()
        : (this.phase === PHASES.VOTE ? this.pendingVoterIds() : []),
      roundResult: this.phase === PHASES.REVEAL || this.phase === PHASES.GAME_OVER ? this.roundResult : null,
      results: this.phase === PHASES.GAME_OVER ? this.results : null,
    };
  }
}

module.exports = {
  ChpokGame,
  ChpokError,
  PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MAX_ANSWER_LEN,
  DEFAULT_SETTINGS,
  ROUND_OPTIONS,
  ANSWER_SEC_OPTIONS,
  VOTE_SEC_OPTIONS,
  sanitizeSettings,
  cleanAnswer,
};
