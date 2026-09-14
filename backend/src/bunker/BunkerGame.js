// BunkerGame.js
// The rules of the Bunker.
//
// A catastrophe has struck and a shelter has fewer places than there are
// people. Every player is dealt seven characteristic cards, all face down.
// Each round the players take turns revealing one of their own cards (the
// first round is always the profession); from the second round on, the
// reveals are followed by a discussion and a vote, and the player with the
// most votes is left outside. A tie goes to a runoff between the tied
// players; a second tie leaves everyone in for another round. The game ends
// when no more people remain than there are places - they are the
// survivors.
//
// The state is secret: `toClientJSON(viewerId)` builds one payload per
// player, and a hidden card is simply absent from everyone else's payload.
// Every action is validated here against server state.

const {
  CATEGORY_KEYS, dealCharacteristics, pickCatastrophe, buildBunker, cardScore,
} = require('./cards');

class BunkerError extends Error {}

const PHASES = {
  LOBBY: 'LOBBY',
  REVEAL: 'REVEAL',
  DISCUSSION: 'DISCUSSION',
  VOTE: 'VOTE',
  RESULT: 'RESULT',
  GAME_OVER: 'GAME_OVER',
};

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 16;
const FIRST_VOTE_ROUND = 2;
const RESULT_SEC = 8;
const OFFLINE_GRACE_SEC = 15;
const DEFAULT_SETTINGS = {
  maxPlayers: 12, seats: 0, turnSec: 60, discussSec: 120, voteSec: 60,
};

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    maxPlayers: clampInt(src.maxPlayers ?? base.maxPlayers, MIN_PLAYERS, MAX_PLAYERS, base.maxPlayers),
    // 0 means "half the players, rounded down".
    seats: clampInt(src.seats ?? base.seats, 0, MAX_PLAYERS - 1, base.seats),
    turnSec: clampInt(src.turnSec ?? base.turnSec, 20, 180, base.turnSec),
    discussSec: clampInt(src.discussSec ?? base.discussSec, 30, 600, base.discussSec),
    voteSec: clampInt(src.voteSec ?? base.voteSec, 15, 180, base.voteSec),
  };
}

function seatsFor(playerCount, seatsSetting) {
  if (seatsSetting > 0) return Math.max(1, Math.min(seatsSetting, playerCount - 1));
  return Math.max(1, Math.floor(playerCount / 2));
}

function verdictFor(score) {
  if (score >= 6) return 'thrive';
  if (score >= 3) return 'survive';
  if (score >= 0) return 'struggle';
  return 'doomed';
}

class BunkerGame {
  constructor(roomCode, hostId, settings) {
    this.gameType = 'bunker';
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.players = [];
    this.phase = PHASES.LOBBY;
    this.round = 0;
    this.seats = 0;
    this.catastrophe = null;
    this.bunker = null;
    this.turnOrder = [];
    this.turnIndex = 0;
    this.revealedThisRound = {};
    this.votes = {};
    this.voteCandidates = [];
    this.revote = false;
    this.lastVote = null;
    this.results = null;
    this.log = [];
    this.createdAt = Date.now();
    this.startedAt = null;
    this.endedAt = null;
    this.phaseEndsAt = null;
  }

  // --- players -------------------------------------------------------

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId) || null;
  }

  alivePlayers() {
    return this.players.filter((p) => p.status === 'alive');
  }

  renumber() {
    this.players.forEach((p, i) => { p.number = i + 1; });
  }

  addPlayer({
    playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null,
  }) {
    const existing = this.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      if (accountId) {
        existing.nickname = nickname || existing.nickname;
        existing.avatarUrl = avatarUrl;
      }
      return existing;
    }
    if (this.phase !== PHASES.LOBBY) throw new BunkerError('This game has already started.');
    if (this.players.length >= this.settings.maxPlayers) {
      throw new BunkerError(`This bunker room holds at most ${this.settings.maxPlayers} players.`);
    }
    const player = {
      id: playerId,
      socketId,
      nickname: String(nickname || 'Player').slice(0, 20),
      avatarUrl,
      accountId,
      guestKeyHash,
      connected: true,
      left: false,
      isHost: this.players.length === 0,
      ready: false,
      number: this.players.length + 1,
      cards: {},
      revealed: [],
      status: 'alive',
      excludedRound: null,
      exclusionReason: null,
    };
    if (player.isHost) this.hostId = player.id;
    this.players.push(player);
    return player;
  }

  // The host's powers go to a registered player when one is left, since
  // only registered players may start a game.
  handOffHost(leaving) {
    if (!leaving.isHost) return;
    leaving.isHost = false;
    const candidates = this.players.filter((p) => p.id !== leaving.id && !p.left);
    const heir = candidates.find((p) => p.accountId && p.connected)
      || candidates.find((p) => p.accountId)
      || candidates.find((p) => p.connected)
      || candidates[0];
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
      this.renumber();
      return;
    }
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this.handOffHost(player);
    if (this.phase === PHASES.GAME_OVER || player.status !== 'alive') return;

    // Walking out of the bunker mid-game is the same as being voted out.
    const wasCurrent = this.currentTurnId() === player.id;
    this.excludePlayer(player, 'left');
    this.addLog('PLAYER_LEFT', { name: player.nickname, number: player.number });
    if (this.alivePlayers().length <= this.seats) {
      this.endGame();
      return;
    }
    if (this.phase === PHASES.REVEAL && wasCurrent) {
      this.advanceTurn();
    } else if (this.phase === PHASES.VOTE) {
      delete this.votes[player.id];
      Object.keys(this.votes).forEach((voterId) => { if (this.votes[voterId] === player.id) delete this.votes[voterId]; });
      this.voteCandidates = this.voteCandidates.filter((id) => id !== player.id);
      if (this.voteCandidates.length < 2) {
        this.voteCandidates = this.alivePlayers().map((p) => p.id);
        this.revote = false;
      }
      this.resolveIfEveryoneVoted();
    }
  }

  setConnected(playerId, connected, socketId = null) {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    player.connected = connected;
    player.socketId = connected ? socketId : null;
    if (!connected) this.shortenDeadlineFor(player);
    return player;
  }

  setReady(playerId, ready) {
    const player = this.getPlayer(playerId);
    if (!player) throw new BunkerError('Player not found.');
    if (this.phase === PHASES.LOBBY) player.ready = !!ready;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw new BunkerError('Only the host can do that.');
  }

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new BunkerError('Settings can only be changed before the game starts.');
    const next = sanitizeSettings(patch, this.settings);
    if (next.maxPlayers < this.players.length) {
      throw new BunkerError('The room already has more players than that.');
    }
    this.settings = next;
    return this.settings;
  }

  // --- log -----------------------------------------------------------

  addLog(type, params = {}) {
    this.log.push({
      type, params, round: this.round, ts: Date.now(),
    });
    if (this.log.length > 300) this.log.shift();
  }

  // --- timing --------------------------------------------------------

  setDeadline(seconds, actor = null) {
    let endsAt = Date.now() + seconds * 1000;
    if (actor && !actor.connected) endsAt = Math.min(endsAt, Date.now() + OFFLINE_GRACE_SEC * 1000);
    this.phaseEndsAt = endsAt;
  }

  shortenDeadlineFor(player) {
    if (!this.phaseEndsAt) return;
    const grace = Date.now() + OFFLINE_GRACE_SEC * 1000;
    if (this.phase === PHASES.REVEAL && this.currentTurnId() === player.id) {
      this.phaseEndsAt = Math.min(this.phaseEndsAt, grace);
    }
    if (this.phase === PHASES.VOTE) {
      const waiting = this.alivePlayers().filter((p) => this.votes[p.id] === undefined);
      if (waiting.length && waiting.every((p) => !p.connected)) this.phaseEndsAt = Math.min(this.phaseEndsAt, grace);
    }
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new BunkerError('The game has already started.');
    if (this.players.length < MIN_PLAYERS) throw new BunkerError(`The Bunker needs at least ${MIN_PLAYERS} players.`);

    this.renumber();
    const hands = dealCharacteristics(this.players.length);
    this.players.forEach((p, i) => {
      Object.assign(p, {
        cards: hands[i], revealed: [], status: 'alive', excludedRound: null, exclusionReason: null,
      });
    });
    this.seats = seatsFor(this.players.length, this.settings.seats);
    this.catastrophe = pickCatastrophe();
    this.bunker = buildBunker();
    this.round = 0;
    this.votes = {};
    this.voteCandidates = [];
    this.revote = false;
    this.lastVote = null;
    this.results = null;
    this.log = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.addLog('GAME_STARTED', { catastrophe: this.catastrophe.id, seats: this.seats, players: this.players.length });
    this.beginRound();
    return this;
  }

  hiddenKeys(player) {
    return CATEGORY_KEYS.filter((k) => !player.revealed.includes(k));
  }

  // The first round every player shows their profession.
  requiredKeyFor(player) {
    return this.round === 1 && !player.revealed.includes('profession') ? 'profession' : null;
  }

  currentTurnId() {
    return this.phase === PHASES.REVEAL ? this.turnOrder[this.turnIndex] || null : null;
  }

  beginRound() {
    this.round += 1;
    const alive = this.alivePlayers().sort((a, b) => a.number - b.number);
    // The opening speaker moves one seat along every round.
    const start = alive.length ? (this.round - 1) % alive.length : 0;
    const rotated = [...alive.slice(start), ...alive.slice(0, start)];
    this.turnOrder = rotated.filter((p) => this.hiddenKeys(p).length > 0).map((p) => p.id);
    this.turnIndex = 0;
    this.revealedThisRound = {};
    this.lastVote = null;
    this.addLog('ROUND_STARTED', { round: this.round });
    if (!this.turnOrder.length) {
      this.startDiscussion();
      return;
    }
    this.phase = PHASES.REVEAL;
    this.setDeadline(this.settings.turnSec, this.getPlayer(this.turnOrder[0]));
  }

  reveal(playerId, key, { auto = false } = {}) {
    if (this.phase !== PHASES.REVEAL) throw new BunkerError('Characteristics are revealed only during the reveal phase.');
    const player = this.getPlayer(playerId);
    if (!player) throw new BunkerError('Player not found.');
    if (player.status !== 'alive') throw new BunkerError('Players outside the bunker no longer reveal cards.');
    if (this.currentTurnId() !== playerId) throw new BunkerError('It is not your turn to reveal.');
    if (!CATEGORY_KEYS.includes(key)) throw new BunkerError('Unknown characteristic.');
    if (player.revealed.includes(key)) throw new BunkerError('That characteristic is already revealed.');
    const required = this.requiredKeyFor(player);
    if (required && key !== required) throw new BunkerError('In the first round everyone reveals their profession.');

    player.revealed.push(key);
    this.revealedThisRound[player.id] = key;
    this.addLog(auto ? 'AUTO_REVEALED' : 'REVEALED', {
      name: player.nickname, number: player.number, key, card: player.cards[key],
    });
    this.advanceTurn();
  }

  advanceTurn() {
    this.turnIndex += 1;
    while (this.turnIndex < this.turnOrder.length) {
      const next = this.getPlayer(this.turnOrder[this.turnIndex]);
      if (next && next.status === 'alive' && this.hiddenKeys(next).length > 0) break;
      this.turnIndex += 1;
    }
    if (this.turnIndex >= this.turnOrder.length) {
      if (this.round < FIRST_VOTE_ROUND) this.beginRound();
      else this.startDiscussion();
      return;
    }
    this.setDeadline(this.settings.turnSec, this.getPlayer(this.turnOrder[this.turnIndex]));
  }

  startDiscussion() {
    this.phase = PHASES.DISCUSSION;
    this.setDeadline(this.settings.discussSec);
    this.addLog('DISCUSSION_STARTED', {});
  }

  startVote({ candidates = null, revote = false } = {}) {
    this.phase = PHASES.VOTE;
    this.votes = {};
    this.voteCandidates = candidates || this.alivePlayers().map((p) => p.id);
    this.revote = revote;
    this.setDeadline(this.settings.voteSec);
    if (revote) {
      this.addLog('REVOTE', { names: this.voteCandidates.map((id) => this.getPlayer(id)?.nickname).filter(Boolean) });
    } else {
      this.addLog('VOTING_STARTED', {});
    }
  }

  // Only the host can cut a discussion or a result screen short. Reveals
  // and votes always get their full time - every player has a say.
  skipPhase(playerId) {
    this.assertHost(playerId);
    if (this.phase === PHASES.DISCUSSION) this.startVote();
    else if (this.phase === PHASES.RESULT) this.continueAfterResult();
    else throw new BunkerError('This phase cannot be skipped.');
  }

  vote(playerId, targetId) {
    if (this.phase !== PHASES.VOTE) throw new BunkerError('Voting is not open right now.');
    const voter = this.getPlayer(playerId);
    if (!voter) throw new BunkerError('Player not found.');
    if (voter.status !== 'alive') throw new BunkerError('Only players still in the bunker can vote.');
    if (this.votes[playerId] !== undefined) throw new BunkerError('You have already voted.');
    if (targetId === playerId) throw new BunkerError('You cannot vote against yourself.');
    const target = this.getPlayer(targetId);
    if (!target || target.status !== 'alive' || !this.voteCandidates.includes(targetId)) {
      throw new BunkerError('That player cannot be voted for.');
    }
    this.votes[playerId] = targetId;
    this.addLog('VOTE_CAST', { name: voter.nickname, number: voter.number });
    this.resolveIfEveryoneVoted();
  }

  resolveIfEveryoneVoted() {
    if (this.phase !== PHASES.VOTE) return;
    const waiting = this.alivePlayers().filter((p) => this.votes[p.id] === undefined);
    if (waiting.length === 0) this.resolveVote();
  }

  tally() {
    return this.voteCandidates
      .map((id) => {
        const voters = Object.keys(this.votes).filter((voterId) => this.votes[voterId] === id);
        return { playerId: id, votes: voters.length, voters };
      })
      .sort((a, b) => b.votes - a.votes);
  }

  resolveVote() {
    const tally = this.tally();
    const cast = Object.keys(this.votes).length;
    const base = { round: this.round, tally, revote: this.revote };

    // Once every card is on the table there is nothing left to learn, so a
    // deadlock is settled by drawing lots instead of repeating forever.
    const nothingHidden = this.alivePlayers().every((p) => this.hiddenKeys(p).length === 0);
    const drawLots = (pool) => {
      const loser = this.getPlayer(pool[Math.floor(Math.random() * pool.length)]);
      this.excludePlayer(loser, 'lot');
      this.lastVote = { ...base, outcome: 'lot', excludedId: loser.id, leaders: pool };
      this.addLog('EXCLUDED_BY_LOT', { name: loser.nickname, number: loser.number });
      this.showResult();
    };

    if (cast === 0) {
      if (nothingHidden) {
        drawLots(this.voteCandidates);
        return;
      }
      this.lastVote = { ...base, outcome: 'noVotes', excludedId: null };
      this.addLog('NO_EXCLUSION', { reason: 'noVotes' });
      this.showResult();
      return;
    }

    const top = tally[0].votes;
    const leaders = tally.filter((row) => row.votes === top).map((row) => row.playerId);
    if (leaders.length > 1) {
      if (!this.revote) {
        this.lastVote = { ...base, outcome: 'tie', excludedId: null, leaders };
        this.startVote({ candidates: leaders, revote: true });
        return;
      }
      if (nothingHidden) {
        drawLots(leaders);
        return;
      }
      this.lastVote = { ...base, outcome: 'tieAgain', excludedId: null, leaders };
      this.addLog('NO_EXCLUSION', { reason: 'tie' });
      this.showResult();
      return;
    }

    const excluded = this.getPlayer(leaders[0]);
    this.excludePlayer(excluded, 'vote');
    this.lastVote = { ...base, outcome: 'excluded', excludedId: excluded.id };
    this.addLog('EXCLUDED', { name: excluded.nickname, number: excluded.number, votes: top });
    this.showResult();
  }

  excludePlayer(player, reason) {
    player.status = 'excluded';
    player.excludedRound = this.round;
    player.exclusionReason = reason;
    // Whoever leaves the bunker leaves with all cards on the table.
    player.revealed = [...CATEGORY_KEYS];
  }

  showResult() {
    this.phase = PHASES.RESULT;
    this.votes = {};
    this.voteCandidates = [];
    this.revote = false;
    this.setDeadline(RESULT_SEC);
  }

  continueAfterResult() {
    if (this.alivePlayers().length <= this.seats) this.endGame();
    else this.beginRound();
  }

  onTimeout() {
    switch (this.phase) {
      case PHASES.REVEAL: {
        const player = this.getPlayer(this.currentTurnId());
        if (!player) {
          this.advanceTurn();
          return;
        }
        const hidden = this.hiddenKeys(player);
        const key = this.requiredKeyFor(player) || hidden[Math.floor(Math.random() * hidden.length)];
        this.reveal(player.id, key, { auto: true });
        return;
      }
      case PHASES.DISCUSSION:
        this.startVote();
        return;
      case PHASES.VOTE:
        this.resolveVote();
        return;
      case PHASES.RESULT:
        this.continueAfterResult();
        return;
      default:
    }
  }

  endGame() {
    const survivors = this.alivePlayers();
    const scores = survivors.map((p) => CATEGORY_KEYS.reduce((sum, k) => sum + cardScore(k, p.cards[k]), 0));
    const colonyScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    const excluded = this.players
      .filter((p) => p.status === 'excluded')
      .sort((a, b) => (a.excludedRound || 0) - (b.excludedRound || 0))
      .map((p) => ({ playerId: p.id, round: p.excludedRound, reason: p.exclusionReason }));
    this.results = {
      survivorIds: survivors.map((p) => p.id),
      excluded,
      seats: this.seats,
      rounds: this.round,
      colonyScore,
      verdict: verdictFor(colonyScore),
    };
    this.phase = PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.endedAt = Date.now();
    this.addLog('GAME_OVER', { names: survivors.map((p) => p.nickname) });
  }

  restart(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.GAME_OVER) throw new BunkerError('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => {
      Object.assign(p, {
        ready: false, cards: {}, revealed: [], status: 'alive', excludedRound: null, exclusionReason: null,
      });
    });
    this.renumber();
    Object.assign(this, {
      phase: PHASES.LOBBY,
      round: 0,
      seats: 0,
      catastrophe: null,
      bunker: null,
      turnOrder: [],
      turnIndex: 0,
      revealedThisRound: {},
      votes: {},
      voteCandidates: [],
      revote: false,
      lastVote: null,
      results: null,
      log: [],
      startedAt: null,
      endedAt: null,
      phaseEndsAt: null,
    });
  }

  // --- serialization -------------------------------------------------

  static FIELDS = [
    'players', 'phase', 'round', 'seats', 'catastrophe', 'bunker', 'turnOrder', 'turnIndex', 'revealedThisRound',
    'votes', 'voteCandidates', 'revote', 'lastVote', 'results', 'log', 'createdAt', 'startedAt', 'endedAt', 'phaseEndsAt',
  ];

  toJSON() {
    const out = {
      gameType: this.gameType, roomCode: this.roomCode, hostId: this.hostId, settings: this.settings,
    };
    BunkerGame.FIELDS.forEach((f) => { out[f] = this[f]; });
    return out;
  }

  static fromJSON(data) {
    const game = new BunkerGame(data.roomCode, data.hostId, data.settings);
    BunkerGame.FIELDS.forEach((f) => { if (data[f] !== undefined) game[f] = data[f]; });
    game.players.forEach((p) => { p.connected = false; p.socketId = null; });
    return game;
  }

  // What `viewer` may see of `subject`'s cards: their own always, and
  // otherwise only what has been revealed - everything once a player is
  // out or the game is over.
  cardsVisibleTo(viewer, subject) {
    const everything = this.phase === PHASES.GAME_OVER || subject.status === 'excluded' || (viewer && viewer.id === subject.id);
    return Object.fromEntries(CATEGORY_KEYS.map((k) => [
      k, (everything || subject.revealed.includes(k)) && subject.cards[k] ? subject.cards[k] : null,
    ]));
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId);
    const currentId = this.currentTurnId();
    const inVote = this.phase === PHASES.VOTE;

    const players = this.players.map((p) => ({
      id: p.id,
      number: p.number,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      isGuest: !p.accountId,
      connected: p.connected,
      left: !!p.left,
      isHost: p.isHost,
      ready: p.ready,
      status: p.status,
      excludedRound: p.excludedRound,
      exclusionReason: p.exclusionReason,
      cards: this.phase === PHASES.LOBBY ? {} : this.cardsVisibleTo(viewer, p),
      revealed: p.revealed,
      revealedThisRound: this.revealedThisRound[p.id] || null,
      isCurrent: currentId === p.id,
      isCandidate: inVote && this.voteCandidates.includes(p.id),
      hasVoted: inVote ? this.votes[p.id] !== undefined : false,
      isYou: viewer ? p.id === viewer.id : false,
    }));

    const alive = this.alivePlayers();
    const you = viewer
      ? {
        id: viewer.id,
        isHost: viewer.isHost,
        status: viewer.status,
        canReveal: currentId === viewer.id,
        requiredKey: currentId === viewer.id ? this.requiredKeyFor(viewer) : null,
        canVote: inVote && viewer.status === 'alive' && this.votes[viewer.id] === undefined,
        // Your own vote, and nobody else's, until the vote is counted.
        myVote: inVote ? this.votes[viewer.id] ?? null : null,
      }
      : null;

    return {
      gameType: 'bunker',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      firstVoteRound: FIRST_VOTE_ROUND,
      settings: this.settings,
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      minPlayers: MIN_PLAYERS,
      maxPlayers: this.settings.maxPlayers,
      seats: this.phase === PHASES.LOBBY ? seatsFor(Math.max(this.players.length, MIN_PLAYERS), this.settings.seats) : this.seats,
      aliveCount: this.phase === PHASES.LOBBY ? this.players.length : alive.length,
      catastrophe: this.catastrophe,
      bunker: this.bunker,
      turn: this.phase === PHASES.REVEAL
        ? { playerId: currentId, index: this.turnIndex, total: this.turnOrder.length }
        : null,
      vote: inVote
        ? {
          candidates: this.voteCandidates,
          revote: this.revote,
          votedCount: Object.keys(this.votes).length,
          voterCount: alive.length,
        }
        : null,
      lastVote: this.lastVote,
      players,
      you,
      log: this.log.slice(-100),
      results: this.phase === PHASES.GAME_OVER ? this.results : null,
    };
  }
}

module.exports = {
  BunkerGame, BunkerError, PHASES, MIN_PLAYERS, MAX_PLAYERS, FIRST_VOTE_ROUND, RESULT_SEC, DEFAULT_SETTINGS,
  sanitizeSettings, seatsFor,
};
