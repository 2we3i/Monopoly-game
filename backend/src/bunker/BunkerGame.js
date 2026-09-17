// BunkerGame.js
// The rules of the Bunker.
//
// A catastrophe has struck and a shelter has fewer places than there are
// people. Every player is dealt a character - profession, biology, health,
// hobby, skills, temperament, extras, one to four pieces of baggage and up
// to two secrets - all face down. Each round the players take turns
// revealing their own cards (the first round is always the profession);
// from the second round on the reveals are followed by a discussion and a
// vote, and whoever the table votes against is left outside. The game ends
// when no more people remain than there are places - they are the
// survivors.
//
// On top of that a table can play with ACTION CARDS (real objects with
// declared stages, targets and durations - see actionCards.js) and with
// RANDOM EVENTS that change the shelter itself (events.js). What a table
// plays with is entirely settings (settings.js), and what content exists
// is entirely data (content.js, scenarios.js) - the rules below never name
// an individual card, item or event.
//
// The state is secret: `toClientJSON(viewerId)` builds one payload per
// player, and a hidden card is simply absent from everyone else's payload.
// Every action is validated here against server state.

const legacyCards = require('./cards');
const content = require('./content');
const deal = require('./deal');
const actionCardDefs = require('./actionCards');
const eventDefs = require('./events');
const scenarios = require('./scenarios');
const settingsModule = require('./settings');

class BunkerError extends Error {}

const PHASES = {
  LOBBY: 'LOBBY',
  REVEAL: 'REVEAL',
  DISCUSSION: 'DISCUSSION',
  VOTE: 'VOTE',
  RESULT: 'RESULT',
  GAME_OVER: 'GAME_OVER',
};

const { MIN_PLAYERS, MAX_PLAYERS } = settingsModule;
const FIRST_VOTE_ROUND = settingsModule.DEFAULTS.rounds.firstVoteRound;
const RESULT_SEC = settingsModule.DEFAULTS.rounds.resultSec;
const OFFLINE_GRACE_SEC = 15;

// The settings a game started with before any of the new sections
// existed. A save with no `categories` is dealt on these.
const LEGACY_CATEGORIES = [...legacyCards.CATEGORY_KEYS];

// Kept as an export because the Creator's mode config and the public
// /api/bunker/config both read it.
const DEFAULT_SETTINGS = settingsModule.DEFAULTS;

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  return settingsModule.sanitize(input, base);
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

let effectSeq = 0;

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

    // --- the parts a table can switch on ---------------------------
    // The characteristics THIS game was dealt on. Frozen at the start, so
    // a host editing the settings of the next game never disturbs this one.
    this.categories = null;
    this.baggageCount = 0;
    // Live effects from action cards and events: { id, type, params, until }.
    this.effects = [];
    // Everything any player was told privately (a peeked card, a swap).
    this.privateResults = {};
    // The public record of every action card played.
    this.cardHistory = [];
    // How many cards each player has played, this round and in total.
    this.cardUses = {};
    // Categories an event has made worthless for the final verdict.
    this.mutedCategories = [];
    this.activeEvent = null;
    this.eventLog = [];
    // Set when the round limit is reached with too many people still inside:
    // one last vote decides everything at once.
    this.finalVote = false;
  }

  // Randomness lives behind a method so it is never serialised and a test
  // can replace it wholesale.
  // eslint-disable-next-line class-methods-use-this
  rng() {
    return Math.random();
  }

  // --- what this game is playing with --------------------------------

  categoriesInPlay() {
    return this.categories || this.settings.characters.categories || LEGACY_CATEGORIES;
  }

  baggageKeysInPlay() {
    return this.categoriesInPlay().filter((k) => content.BAGGAGE_KEYS.includes(k));
  }

  secretKeysInPlay() {
    return this.categoriesInPlay().filter((k) => content.SECRET_KEYS.includes(k));
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
    playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null, isBot = false,
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
    if (this.seatedCount() >= this.settings.maxPlayers) {
      throw new BunkerError(`This bunker room holds at most ${this.settings.maxPlayers} players.`);
    }
    const player = {
      id: playerId,
      socketId,
      nickname: String(nickname || 'Player').slice(0, 20),
      avatarUrl,
      accountId,
      guestKeyHash,
      isBot: !!isBot,
      connected: true,
      left: false,
      isHost: this.players.length === 0 && !isBot,
      ready: !!isBot,
      number: this.players.length + 1,
      cards: {},
      revealed: [],
      // Cards the owner cannot see either, until they come out.
      blind: [],
      // Which of this player's items have had their hidden property opened.
      openProperties: [],
      hand: [],
      status: 'alive',
      excludedRound: null,
      exclusionReason: null,
    };
    if (player.isHost) this.hostId = player.id;
    this.players.push(player);
    return player;
  }

  seatedCount() {
    return this.players.filter((p) => !p.left).length;
  }

  // --- bots ----------------------------------------------------------

  // Bots fill a short table so a game can be played without waiting for
  // more people. They are ordinary seats: they hold cards, reveal, vote and
  // can be voted out - they simply decide for themselves.
  syncBots() {
    if (this.phase !== PHASES.LOBBY) return;
    const wanted = this.settings.players.bots ? this.settings.players.botCount : 0;
    const current = this.players.filter((p) => p.isBot);
    if (current.length > wanted) {
      const drop = new Set(current.slice(wanted).map((p) => p.id));
      this.players = this.players.filter((p) => !drop.has(p.id));
    } else {
      for (let i = current.length; i < wanted; i += 1) {
        if (this.seatedCount() >= this.settings.maxPlayers) break;
        this.addPlayer({
          playerId: `bot-${this.roomCode}-${i + 1}`,
          socketId: null,
          nickname: `Bot ${i + 1}`,
          isBot: true,
        });
      }
    }
    this.renumber();
  }

  // Everything a bot owes the table right now. Called after every change
  // that could be waiting on one; the guard stops a bot's move from
  // re-entering this while it is still running.
  runBots() {
    if (this._botsRunning) return;
    this._botsRunning = true;
    try {
      for (let guard = 0; guard < 200; guard += 1) {
        if (!this.stepBots()) break;
      }
    } finally {
      this._botsRunning = false;
    }
  }

  // One bot action, or false when there is nothing for a bot to do.
  stepBots() {
    if (this.phase === PHASES.REVEAL) {
      const current = this.getPlayer(this.currentTurnId());
      if (!current || !current.isBot) return false;
      const hidden = this.hiddenKeys(current);
      if (!hidden.length) return false;
      const key = this.requiredKeyFor(current) || hidden[Math.floor(this.rng() * hidden.length)];
      // A bot picks its own card, so this is an ordinary reveal - logging
      // it as a missed turn would tell the table something untrue.
      this.reveal(current.id, key);
      return true;
    }
    if (this.phase === PHASES.VOTE) {
      const waiting = this.alivePlayers().find((p) => p.isBot && !this.hasVoted(p.id));
      if (!waiting) return false;
      const options = this.voteCandidates.filter((id) => id !== waiting.id && this.getPlayer(id)?.status === 'alive');
      if (!options.length) return false;
      const needed = this.settings.voting.mode === 'multi' ? Math.min(this.settings.voting.votesPerPlayer, options.length) : 1;
      const picked = deal.shuffle(options, () => this.rng()).slice(0, needed);
      picked.forEach((targetId) => {
        try {
          this.vote(waiting.id, targetId);
        } catch { /* a bot that cannot cast this ballot simply does not */ }
      });
      // A bot that still has no vote on record must not be waited for.
      if (!this.hasVoted(waiting.id)) this.votes[waiting.id] = this.settings.voting.mode === 'multi' ? [] : null;
      return true;
    }
    return false;
  }

  // The host's powers go to a registered player when one is left, since
  // only registered players may start a game.
  handOffHost(leaving) {
    if (!leaving.isHost) return;
    leaving.isHost = false;
    const candidates = this.players.filter((p) => p.id !== leaving.id && !p.left && !p.isBot);
    // A room with no host at all can never be restarted or closed by
    // anyone in it, so the last fallback is a seat that has also been
    // left: if its owner ever comes back, the room answers to them again.
    const remaining = this.players.filter((p) => p.id !== leaving.id && !p.isBot);
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
      this.renumber();
      return;
    }
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this.handOffHost(player);
    if (this.phase === PHASES.GAME_OVER || player.status !== 'alive') return;

    // The places are already filled - this game is decided, and the result
    // is only still on screen. Excluding one more person now would leave
    // the bunker with fewer people in it than it has room for (and, with a
    // single place, with nobody at all), so the game simply closes here.
    if (this.alivePlayers().length <= this.seats) {
      this.endGame();
      return;
    }

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
      Object.keys(this.votes).forEach((voterId) => {
        const v = this.votes[voterId];
        if (Array.isArray(v)) {
          this.votes[voterId] = v.filter((t) => t !== player.id);
        } else if (v === player.id) {
          delete this.votes[voterId];
        }
      });
      this.voteCandidates = this.voteCandidates.filter((id) => id !== player.id);
      if (this.voteCandidates.length < 2) {
        this.voteCandidates = this.alivePlayers().map((p) => p.id);
        this.revote = false;
      }
      this.resolveIfEveryoneVoted();
    }
    this.runBots();
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
    if (next.maxPlayers < this.players.filter((p) => !p.isBot).length) {
      throw new BunkerError('The room already has more players than that.');
    }
    this.settings = next;
    this.syncBots();
    return this.settings;
  }

  // --- log -----------------------------------------------------------

  addLog(type, params = {}) {
    this.log.push({
      type, params, round: this.round, ts: Date.now(),
    });
    if (this.log.length > 400) this.log.shift();
  }

  tellPrivately(playerId, type, params = {}) {
    if (!playerId) return;
    if (!this.privateResults[playerId]) this.privateResults[playerId] = [];
    this.privateResults[playerId].push({
      type, params, round: this.round, ts: Date.now(),
    });
    if (this.privateResults[playerId].length > 60) this.privateResults[playerId].shift();
  }

  // --- effects -------------------------------------------------------

  addEffect(type, params = {}, until = 'round') {
    effectSeq += 1;
    this.effects.push({
      id: `e${effectSeq}`, type, params, until, round: this.round,
    });
  }

  effectsOf(type) {
    return this.effects.filter((e) => e.type === type);
  }

  hasEffect(type, playerId = null) {
    return this.effects.some((e) => e.type === type && (playerId === null || e.params.playerId === playerId));
  }

  consumeEffects(until) {
    this.effects = this.effects.filter((e) => e.until !== until);
  }

  // --- timing --------------------------------------------------------

  setDeadline(seconds, actor = null) {
    let endsAt = Date.now() + seconds * 1000;
    // A bot never needs its full turn, and a seat that is offline should
    // not hold the table up for the whole clock.
    if (actor && (actor.isBot || !actor.connected)) endsAt = Math.min(endsAt, Date.now() + OFFLINE_GRACE_SEC * 1000);
    this.phaseEndsAt = endsAt;
  }

  shortenDeadlineFor(player) {
    if (!this.phaseEndsAt) return;
    const grace = Date.now() + OFFLINE_GRACE_SEC * 1000;
    if (this.phase === PHASES.REVEAL && this.currentTurnId() === player.id) {
      this.phaseEndsAt = Math.min(this.phaseEndsAt, grace);
    }
    if (this.phase === PHASES.VOTE) {
      const waiting = this.alivePlayers().filter((p) => !this.hasVoted(p.id));
      if (waiting.length && waiting.every((p) => !p.connected)) this.phaseEndsAt = Math.min(this.phaseEndsAt, grace);
    }
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new BunkerError('The game has already started.');
    this.syncBots();
    if (this.players.length < this.settings.players.min) {
      throw new BunkerError(`The Bunker needs at least ${this.settings.players.min} players.`);
    }

    this.renumber();
    // This game's character sheet is fixed now: a 'random' baggage count
    // is rolled once, here, so every player has the same number of bags.
    this.baggageCount = settingsModule.rollBaggageCount(this.settings.baggage.count, () => this.rng());
    this.categories = settingsModule.resolveCategories(this.settings.characters.categories, {
      secrets: this.settings.characters.secrets,
      baggageCount: this.baggageCount,
    });

    const hands = deal.dealTable(this.players, { ...this.settings, characters: { ...this.settings.characters, categories: this.categories } }, () => this.rng());
    this.players.forEach((p, i) => {
      Object.assign(p, {
        cards: hands[i],
        revealed: [],
        blind: this.pickBlindKeys(),
        openProperties: [],
        hand: deal.dealActionCards(this.settings, () => this.rng()),
        status: 'alive',
        excludedRound: null,
        exclusionReason: null,
      });
    });

    this.seats = seatsFor(this.players.length, this.settings.seats);
    this.catastrophe = this.pickCatastrophe();
    this.bunker = legacyCards.buildBunker(() => this.rng());
    this.round = 0;
    this.votes = {};
    this.voteCandidates = [];
    this.revote = false;
    this.lastVote = null;
    this.results = null;
    this.log = [];
    this.effects = [];
    this.privateResults = {};
    this.cardHistory = [];
    this.cardUses = {};
    this.mutedCategories = [];
    this.activeEvent = null;
    this.eventLog = [];
    this.finalVote = false;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.addLog('GAME_STARTED', {
      catastrophe: this.catastrophe.id,
      seats: this.seats,
      players: this.players.length,
      scenario: this.settings.scenario,
    });
    this.beginRound();
    return this;
  }

  // The scenario decides which catastrophes fit; `null` means any of them.
  pickCatastrophe() {
    const allowed = scenarios.scenario(this.settings.scenario).catastrophes;
    const pool = allowed
      ? legacyCards.CATASTROPHES.filter((c) => allowed.includes(c.id))
      : legacyCards.CATASTROPHES;
    const list = pool.length ? pool : legacyCards.CATASTROPHES;
    return { id: list[Math.floor(this.rng() * list.length)].id };
  }

  // How long this table has to stay under ground. Normally the
  // catastrophe's own figure; an event can push it either way, and once it
  // has, the number the game carries wins over the catalogue's.
  catastropheMonths() {
    if (Number.isFinite(this.catastrophe?.months)) return this.catastrophe.months;
    const entry = legacyCards.CATASTROPHES.find((c) => c.id === this.catastrophe?.id);
    return entry ? entry.months : 12;
  }

  // Which of a character's own cards are hidden from the character too.
  // Never the profession: the first round would have nothing to open.
  pickBlindKeys() {
    const n = this.settings.characters.hiddenFromOwner;
    if (!n) return [];
    const pool = this.categoriesInPlay().filter((k) => k !== 'profession' && k !== 'biology');
    return deal.shuffle(pool, () => this.rng()).slice(0, n);
  }

  hiddenKeys(player) {
    return this.categoriesInPlay().filter((k) => !player.revealed.includes(k) && player.cards[k] !== undefined);
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
    this.consumeEffects('round');
    this.cardUses = Object.fromEntries(Object.entries(this.cardUses).map(([id, u]) => [id, { round: 0, game: u.game || 0 }]));
    this.activeEvent = null;
    this.maybeFireEvent();

    const alive = this.alivePlayers().sort((a, b) => a.number - b.number);
    // The opening speaker moves one seat along every round.
    const start = alive.length ? (this.round - 1) % alive.length : 0;
    const rotated = [...alive.slice(start), ...alive.slice(0, start)];
    // A round can ask for more than one reveal each: the order simply
    // goes round the table that many times.
    const reveals = this.settings.rounds.revealPerRound;
    const order = [];
    for (let pass = 0; pass < reveals; pass += 1) {
      rotated.forEach((p) => {
        const owed = this.hiddenKeys(p).length;
        if (owed > pass) order.push(p.id);
      });
    }
    this.turnOrder = order.filter((id) => !this.hasEffect('blockReveal', id));
    this.turnIndex = 0;
    this.revealedThisRound = {};
    this.lastVote = null;
    this.addLog('ROUND_STARTED', { round: this.round });

    if (this.roundLimitReached()) {
      this.startFinalVote();
      return;
    }
    if (!this.turnOrder.length) {
      this.startDiscussion();
      return;
    }
    this.phase = PHASES.REVEAL;
    this.setDeadline(this.settings.turnSec, this.getPlayer(this.turnOrder[0]));
    this.runBots();
  }

  roundLimitReached() {
    const limit = this.settings.rounds.total;
    return limit > 0 && this.round > limit;
  }

  reveal(playerId, key, { auto = false, forced = false } = {}) {
    if (this.phase !== PHASES.REVEAL) throw new BunkerError('Characteristics are revealed only during the reveal phase.');
    const player = this.getPlayer(playerId);
    if (!player) throw new BunkerError('Player not found.');
    if (player.status !== 'alive') throw new BunkerError('Players outside the bunker no longer reveal cards.');
    if (this.currentTurnId() !== playerId) throw new BunkerError('It is not your turn to reveal.');
    if (!this.categoriesInPlay().includes(key)) throw new BunkerError('Unknown characteristic.');
    if (player.revealed.includes(key)) throw new BunkerError('That characteristic is already revealed.');
    const required = this.requiredKeyFor(player);
    if (required && key !== required) throw new BunkerError('In the first round everyone reveals their profession.');
    // A card played on this player has sealed their mouth for the round.
    if (!forced && !auto && this.hasEffect('blockReveal', playerId)) {
      throw new BunkerError('Someone has blocked you from revealing this round.');
    }

    player.revealed.push(key);
    player.blind = player.blind.filter((k) => k !== key);
    this.revealedThisRound[player.id] = key;
    this.addLog(auto ? 'AUTO_REVEALED' : 'REVEALED', {
      name: player.nickname, number: player.number, key, card: player.cards[key],
    });
    this.advanceTurn();
  }

  // Used by action cards and events: a reveal that does not belong to the
  // player's turn and does not move the turn on.
  forceReveal(player, key) {
    if (!player || player.revealed.includes(key) || player.cards[key] === undefined) return false;
    player.revealed.push(key);
    player.blind = player.blind.filter((k) => k !== key);
    this.revealedThisRound[player.id] = key;
    this.addLog('FORCED_REVEAL', {
      name: player.nickname, number: player.number, key, card: player.cards[key],
    });
    return true;
  }

  noteRevealedThisRound(player, key) {
    this.revealedThisRound[player.id] = key;
  }

  markHiddenAgain(player, key) {
    this.addLog('HIDDEN_AGAIN', { name: player.nickname, number: player.number, key });
    if (this.revealedThisRound[player.id] === key) delete this.revealedThisRound[player.id];
  }

  // Turns an item's sealed property face up. Returns the property id, or
  // null when that item has none (or it is already open).
  revealHiddenProperty(player, key) {
    const card = player?.cards?.[key];
    if (!card || !card.property || player.openProperties.includes(key)) return null;
    player.openProperties.push(key);
    card.revealedProperty = true;
    this.addLog('PROPERTY_REVEALED', {
      name: player.nickname, number: player.number, key, property: card.property,
    });
    return card.property;
  }

  drawReplacement(key, player) {
    return deal.drawReplacement(key, player, this.settings, () => this.rng());
  }

  dealActionCard(player) {
    if (!this.settings.actionCards.enabled) return null;
    const drawn = deal.drawActionCard(this.settings, () => this.rng());
    if (drawn) player.hand.push(drawn);
    return drawn;
  }

  advanceTurn() {
    this.turnIndex += 1;
    while (this.turnIndex < this.turnOrder.length) {
      const next = this.getPlayer(this.turnOrder[this.turnIndex]);
      if (next && next.status === 'alive' && this.hiddenKeys(next).length > 0
        && !this.hasEffect('blockReveal', next.id)) break;
      this.turnIndex += 1;
    }
    if (this.turnIndex >= this.turnOrder.length) {
      // An extra reveal buys one more lap for whoever played it.
      const extra = this.effectsOf('extraReveal')
        .map((e) => this.getPlayer(e.params.playerId))
        .filter((p) => p && p.status === 'alive' && this.hiddenKeys(p).length > 0);
      if (extra.length) {
        this.effects = this.effects.filter((e) => e.type !== 'extraReveal');
        this.turnOrder = [...this.turnOrder, ...extra.map((p) => p.id)];
        this.setDeadline(this.settings.turnSec, this.getPlayer(this.turnOrder[this.turnIndex]));
        this.runBots();
        return;
      }
      if (this.round < this.settings.rounds.firstVoteRound) this.beginRound();
      else this.startDiscussion();
      return;
    }
    this.setDeadline(this.settings.turnSec, this.getPlayer(this.turnOrder[this.turnIndex]));
    this.runBots();
  }

  startDiscussion() {
    this.phase = PHASES.DISCUSSION;
    this.setDeadline(this.settings.discussSec);
    this.addLog('DISCUSSION_STARTED', {});
  }

  startVote({ candidates = null, revote = false } = {}) {
    // A card can push this round's vote away entirely.
    if (!revote && this.hasEffect('postponeVote')) {
      this.effects = this.effects.filter((e) => e.type !== 'postponeVote');
      this.addLog('VOTE_POSTPONED', {});
      this.lastVote = {
        round: this.round, tally: [], revote: false, outcome: 'postponed', excludedId: null,
      };
      this.showResult();
      return;
    }
    this.phase = PHASES.VOTE;
    this.votes = {};
    // An argument between two people is settled between those two: the
    // rest of the table votes, but only the pair can be voted out.
    const duel = !candidates && !revote ? this.effectsOf('duel')[0] : null;
    const duelPair = duel
      ? (duel.params.playerIds || []).filter((id) => this.getPlayer(id)?.status === 'alive')
      : [];
    this.voteCandidates = candidates
      || (duelPair.length >= 2 ? duelPair : this.alivePlayers().map((p) => p.id));
    this.revote = revote;
    this.setDeadline(this.settings.voteSec);
    if (revote) {
      this.addLog('REVOTE', { names: this.voteCandidates.map((id) => this.getPlayer(id)?.nickname).filter(Boolean) });
    } else {
      this.addLog('VOTING_STARTED', {});
    }
    this.runBots();
  }

  // The last word: the round limit ran out with more people inside than
  // there are places, so one vote decides every remaining place at once.
  startFinalVote() {
    this.finalVote = true;
    this.addLog('FINAL_VOTE', { seats: this.seats, alive: this.alivePlayers().length });
    this.startVote();
  }

  // Only the host can cut a discussion or a result screen short. Reveals
  // and votes always get their full time - every player has a say.
  skipPhase(playerId) {
    this.assertHost(playerId);
    if (this.phase === PHASES.DISCUSSION) this.startVote();
    else if (this.phase === PHASES.RESULT) this.continueAfterResult();
    else throw new BunkerError('This phase cannot be skipped.');
  }

  // --- voting --------------------------------------------------------

  hasVoted(playerId) {
    const v = this.votes[playerId];
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.length >= this.settings.voting.votesPerPlayer || v.length === 0;
    return true;
  }

  // Everything a player has pointed at, as a list, whichever mode is on.
  ballotOf(playerId) {
    const v = this.votes[playerId];
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
  }

  vote(playerId, targetId) {
    if (this.phase !== PHASES.VOTE) throw new BunkerError('Voting is not open right now.');
    const voter = this.getPlayer(playerId);
    if (!voter) throw new BunkerError('Player not found.');
    if (voter.status !== 'alive') throw new BunkerError('Only players still in the bunker can vote.');
    if (targetId === playerId) throw new BunkerError('You cannot vote against yourself.');
    const target = this.getPlayer(targetId);
    if (!target || target.status !== 'alive' || !this.voteCandidates.includes(targetId)) {
      throw new BunkerError('That player cannot be voted for.');
    }

    const multi = this.settings.voting.mode === 'multi';
    const current = this.ballotOf(playerId);

    if (multi) {
      if (current.includes(targetId)) {
        if (!this.settings.voting.allowChange) throw new BunkerError('You have already voted for that player.');
        this.votes[playerId] = current.filter((t) => t !== targetId);
        return;
      }
      if (current.length >= this.settings.voting.votesPerPlayer) {
        if (!this.settings.voting.allowChange) throw new BunkerError('You have used all of your votes.');
        // Changing a full ballot drops the oldest of them.
        this.votes[playerId] = [...current.slice(1), targetId];
      } else {
        this.votes[playerId] = [...current, targetId];
      }
    } else {
      if (this.votes[playerId] !== undefined && !this.settings.voting.allowChange) {
        throw new BunkerError('You have already voted.');
      }
      this.votes[playerId] = targetId;
    }

    this.addLog('VOTE_CAST', { name: voter.nickname, number: voter.number });
    this.resolveIfEveryoneVoted();
  }

  resolveIfEveryoneVoted() {
    if (this.phase !== PHASES.VOTE) return;
    const waiting = this.alivePlayers().filter((p) => !this.hasVoted(p.id));
    if (waiting.length === 0) this.resolveVote();
  }

  // How much one player's ballot is worth.
  voteWeight(playerId) {
    return this.hasEffect('doubleVote', playerId) ? 2 : 1;
  }

  tally() {
    const counts = new Map(this.voteCandidates.map((id) => [id, { playerId: id, votes: 0, voters: [] }]));
    Object.keys(this.votes).forEach((voterId) => {
      const weight = this.voteWeight(voterId);
      this.ballotOf(voterId).forEach((targetId) => {
        const row = counts.get(targetId);
        if (!row) return;
        row.votes += weight;
        row.voters.push(voterId);
      });
    });
    return [...counts.values()].sort((a, b) => b.votes - a.votes);
  }

  // A player a card has put out of reach cannot be excluded by this vote.
  isProtected(playerId) {
    return this.hasEffect('protected', playerId);
  }

  resolveVote() {
    const tally = this.tally();
    const cast = Object.keys(this.votes).filter((id) => this.ballotOf(id).length > 0).length;
    const base = { round: this.round, tally, revote: this.revote };
    const rules = this.settings.voting;

    // Once every card is on the table there is nothing left to learn, so a
    // deadlock is settled by drawing lots instead of repeating forever.
    const nothingHidden = this.alivePlayers().every((p) => this.hiddenKeys(p).length === 0);
    const canExclude = (id) => !this.isProtected(id);

    const finish = (outcome, excludedIds, extra = {}) => {
      const excludedNow = [];
      excludedIds.forEach((id) => {
        const victim = this.getPlayer(id);
        if (!victim || victim.status !== 'alive') return;
        this.excludePlayer(victim, outcome === 'lot' ? 'lot' : 'vote');
        excludedNow.push(victim);
      });
      this.lastVote = {
        ...base,
        outcome,
        excludedId: excludedNow[0]?.id || null,
        excludedIds: excludedNow.map((p) => p.id),
        protectedIds: this.effectsOf('protected').map((e) => e.params.playerId),
        ...extra,
      };
      excludedNow.forEach((victim) => this.addLog(outcome === 'lot' ? 'EXCLUDED_BY_LOT' : 'EXCLUDED', {
        name: victim.nickname, number: victim.number, votes: tally.find((r) => r.playerId === victim.id)?.votes || 0,
      }));
      if (!excludedNow.length) this.addLog('NO_EXCLUSION', { reason: extra.reason || outcome });
      this.consumeEffects('nextVote');
      this.showResult();
    };

    const drawLots = (pool) => {
      const eligible = pool.filter(canExclude);
      const list = eligible.length ? eligible : pool;
      finish('lot', [list[Math.floor(this.rng() * list.length)]], { leaders: pool });
    };

    // --- the last vote of a capped game: fill every place at once ----
    if (this.finalVote) {
      const toRemove = Math.max(0, this.alivePlayers().length - this.seats);
      const ordered = tally.filter((row) => canExclude(row.playerId)).map((row) => row.playerId);
      const chosen = ordered.slice(0, toRemove);
      // If protection left too few candidates, lots settle the rest.
      while (chosen.length < toRemove) {
        const rest = this.alivePlayers().map((p) => p.id).filter((id) => !chosen.includes(id));
        if (!rest.length) break;
        chosen.push(rest[Math.floor(this.rng() * rest.length)]);
      }
      finish('final', chosen);
      return;
    }

    if (cast === 0) {
      if (nothingHidden) {
        drawLots(this.voteCandidates);
        return;
      }
      finish('noVotes', [], { reason: 'noVotes' });
      return;
    }

    const top = tally[0].votes;
    const leaders = tally.filter((row) => row.votes === top).map((row) => row.playerId);

    if (leaders.length > 1) {
      // A table that does not allow ties settles them straight away.
      if (!rules.allowTie || rules.tieRule === 'random') {
        drawLots(leaders);
        return;
      }
      if (rules.tieRule === 'all') {
        // Everyone tied goes - unless that would empty the bunker below
        // its own capacity, in which case lots decide instead.
        const room = this.alivePlayers().length - this.seats;
        if (leaders.length <= room) {
          finish('tieAll', leaders.filter(canExclude));
          return;
        }
        drawLots(leaders);
        return;
      }
      if (rules.tieRule === 'revote' && !this.revote) {
        this.lastVote = { ...base, outcome: 'tie', excludedId: null, leaders };
        this.addLog('VOTE_TIED', { round: this.round });
        this.startVote({ candidates: leaders, revote: true });
        return;
      }
      if (nothingHidden) {
        drawLots(leaders);
        return;
      }
      finish('tieAgain', [], { reason: 'tie', leaders });
      return;
    }

    if (!canExclude(leaders[0])) {
      finish('protected', [], { reason: 'protected', leaders });
      return;
    }
    // When the air will not stretch to everyone, the runner-up goes too -
    // but never so far that the bunker ends up below its own capacity.
    if (this.hasEffect('doubleExclusion') && this.alivePlayers().length - this.seats >= 2) {
      const runnerUp = tally.find((row) => row.playerId !== leaders[0] && row.votes > 0 && canExclude(row.playerId));
      if (runnerUp) {
        finish('excludedTwo', [leaders[0], runnerUp.playerId]);
        return;
      }
    }
    finish('excluded', [leaders[0]]);
  }

  excludePlayer(player, reason) {
    player.status = 'excluded';
    player.excludedRound = this.round;
    player.exclusionReason = reason;
    // Whoever leaves the bunker leaves with all cards on the table.
    player.revealed = [...this.categoriesInPlay()];
    player.blind = [];
  }

  showResult() {
    this.phase = PHASES.RESULT;
    this.votes = {};
    this.voteCandidates = [];
    this.revote = false;
    this.setDeadline(this.settings.rounds.resultSec);
  }

  continueAfterResult() {
    if (this.finalVote || this.alivePlayers().length <= this.seats) this.endGame();
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
        if (!hidden.length || this.hasEffect('blockReveal', player.id)) {
          this.advanceTurn();
          return;
        }
        const key = this.requiredKeyFor(player) || hidden[Math.floor(this.rng() * hidden.length)];
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

  // --- random events -------------------------------------------------

  maybeFireEvent() {
    const cfg = this.settings.events;
    if (!cfg.enabled || this.round < 2) return null;
    if (this.rng() > cfg.chance) return null;
    return this.fireRandomEvent('round');
  }

  fireRandomEvent(source = 'round') {
    const pool = this.settings.events.deck.map((id) => eventDefs.eventDef(id)).filter(Boolean);
    if (!pool.length) return null;
    // Try a few times: an event that cannot apply right now (no room left
    // to lose, nobody to make ill) is skipped rather than silently wasted.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const chosen = pool[Math.floor(this.rng() * pool.length)];
      const result = chosen.apply(this, { rooms: legacyCards.BUNKER_ROOMS });
      if (result) {
        const entry = {
          id: chosen.id, params: result, round: this.round, source, ts: Date.now(),
        };
        this.activeEvent = entry;
        this.eventLog.push(entry);
        if (this.eventLog.length > 50) this.eventLog.shift();
        this.addLog('EVENT', { event: chosen.id, ...result });
        return entry;
      }
    }
    return null;
  }

  // --- action cards --------------------------------------------------

  usesOf(playerId) {
    if (!this.cardUses[playerId]) this.cardUses[playerId] = { round: 0, game: 0 };
    return this.cardUses[playerId];
  }

  // Which of a player's cards they could play right now, and why not.
  playableCards(player) {
    if (!player || !this.settings.actionCards.enabled) return [];
    const uses = this.usesOf(player.id);
    const limits = this.settings.actionCards;
    return player.hand.map((held, index) => {
      const def = actionCardDefs.cardDef(held.id);
      let reason = null;
      if (held.usedAt) reason = 'used';
      else if (!def) reason = 'unknown';
      else if (player.status !== 'alive') reason = 'excluded';
      else if (this.hasEffect('noCards')) reason = 'noCards';
      else if (!actionCardDefs.playableIn(this.phase, held.id)) reason = 'wrongPhase';
      else if (limits.maxUsesPerRound > 0 && uses.round >= limits.maxUsesPerRound) reason = 'roundLimit';
      else if (limits.maxUsesPerGame > 0 && uses.game >= limits.maxUsesPerGame) reason = 'gameLimit';
      return {
        index, id: held.id, used: !!held.usedAt, playable: !reason, reason,
      };
    });
  }

  playCard(playerId, { cardId, index = null, targetId = null, key = null } = {}) {
    if (!this.settings.actionCards.enabled) throw new BunkerError('This table plays without action cards.');
    if (this.phase === PHASES.LOBBY || this.phase === PHASES.GAME_OVER) throw new BunkerError('Action cards cannot be played now.');
    const actor = this.getPlayer(playerId);
    if (!actor) throw new BunkerError('Player not found.');
    if (actor.status !== 'alive') throw new BunkerError('Players outside the bunker cannot play cards.');
    // An event can shut the whole system down for a round.
    if (this.hasEffect('noCards')) throw new BunkerError('Nothing can be played this round.');

    // A specific copy if the caller named one, otherwise the first unused
    // copy of that card in their hand.
    const slot = index !== null && actor.hand[index] && !actor.hand[index].usedAt && actor.hand[index].id === cardId
      ? actor.hand[index]
      : actor.hand.find((h) => h.id === cardId && !h.usedAt);
    if (!slot) throw new BunkerError('You do not have that card.');

    const def = actionCardDefs.cardDef(cardId);
    if (!def) throw new BunkerError('Unknown card.');
    if (!this.settings.actionCards.deck.includes(cardId)) throw new BunkerError('That card is not in play at this table.');
    if (!actionCardDefs.playableIn(this.phase, cardId)) throw new BunkerError('That card cannot be played in this phase.');

    const uses = this.usesOf(playerId);
    const limits = this.settings.actionCards;
    if (limits.maxUsesPerRound > 0 && uses.round >= limits.maxUsesPerRound) {
      throw new BunkerError('You have already played a card this round.');
    }
    if (limits.maxUsesPerGame > 0 && uses.game >= limits.maxUsesPerGame) {
      throw new BunkerError('You have played all the cards you may this game.');
    }
    // Trading and stealing baggage are separate switches from the cards.
    if (cardId === 'swap_baggage' && !this.settings.baggage.allowTrade) {
      throw new BunkerError('This table does not allow baggage to change hands.');
    }

    const { targetPlayer, resolvedKey } = this.resolveCardTarget(def, actor, targetId, key);
    const outcome = def.apply({
      game: this, actor, targetPlayer, key: resolvedKey,
    }) || {};

    if (outcome.failed) throw new BunkerError(`That card had no effect: ${outcome.failed}.`);

    slot.usedAt = { round: this.round, ts: Date.now() };
    uses.round += 1;
    uses.game += 1;

    const entry = {
      cardId,
      byId: actor.id,
      byName: actor.nickname,
      byNumber: actor.number,
      round: this.round,
      phase: this.phase,
      // A card whose whole point is that only its owner learns something
      // records THAT it was played, never what it found out.
      secret: !!outcome.secret,
      params: outcome.public || {},
      ts: Date.now(),
    };
    this.cardHistory.push(entry);
    if (this.cardHistory.length > 100) this.cardHistory.shift();
    this.addLog('CARD_PLAYED', {
      name: actor.nickname, number: actor.number, cardId, ...(outcome.public || {}),
    });
    // A card can settle the phase it was played in: a vote that now has
    // every ballot, or a reveal whose turn-holder has just been silenced
    // and must be passed over rather than left to time out.
    if (this.phase === PHASES.VOTE) this.resolveIfEveryoneVoted();
    if (this.phase === PHASES.REVEAL) {
      const current = this.getPlayer(this.currentTurnId());
      if (current && this.hasEffect('blockReveal', current.id)) this.advanceTurn();
    }
    this.runBots();
    return entry;
  }

  // Turns what the client named into the objects the card wants, refusing
  // anything the card's declaration does not allow.
  resolveCardTarget(def, actor, targetId, key) {
    const { TARGETS } = actionCardDefs;
    const livingOther = () => {
      const target = this.getPlayer(targetId);
      if (!target || target.status !== 'alive') throw new BunkerError('Choose a player who is still in the bunker.');
      if (target.id === actor.id) throw new BunkerError('That card must be pointed at someone else.');
      return target;
    };

    switch (def.target) {
      case TARGETS.NONE:
        return { targetPlayer: null, resolvedKey: null };
      case TARGETS.SELF:
        return { targetPlayer: actor, resolvedKey: null };
      case TARGETS.PLAYER:
        return { targetPlayer: livingOther(), resolvedKey: null };
      case TARGETS.ANY_PLAYER: {
        const target = this.getPlayer(targetId) || actor;
        if (target.status !== 'alive') throw new BunkerError('Choose a player who is still in the bunker.');
        return { targetPlayer: target, resolvedKey: null };
      }
      case TARGETS.OWN_CHARACTERISTIC: {
        if (!this.categoriesInPlay().includes(key)) throw new BunkerError('Choose one of your characteristics.');
        if (def.requiresRevealed && !actor.revealed.includes(key)) throw new BunkerError('That characteristic is not on the table.');
        return { targetPlayer: actor, resolvedKey: key };
      }
      case TARGETS.PLAYER_CHARACTERISTIC: {
        const target = livingOther();
        if (!this.categoriesInPlay().includes(key)) throw new BunkerError('Choose a characteristic that is in play.');
        if (def.keyFilter === 'baggage' && !this.baggageKeysInPlay().includes(key)) {
          throw new BunkerError('That card only works on baggage.');
        }
        return { targetPlayer: target, resolvedKey: key };
      }
      default:
        return { targetPlayer: null, resolvedKey: null };
    }
  }

  // --- the end -------------------------------------------------------

  endGame() {
    const survivors = this.alivePlayers();
    const keys = this.categoriesInPlay().filter((k) => !this.mutedCategories.includes(k));
    const scoreOf = (p) => keys.reduce((sum, k) => sum + content.cardScore(k, p.cards[k]), 0)
      - (this.hasEffect('ill', p.id) ? 2 : 0);
    const scores = survivors.map(scoreOf);
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
      scenario: this.settings.scenario,
      mutedCategories: [...this.mutedCategories],
      // A per-player breakdown, so the end screen can say WHY the colony
      // scored what it scored.
      scores: survivors.map((p) => ({ playerId: p.id, score: scoreOf(p) })),
      events: this.eventLog.map((e) => ({ id: e.id, round: e.round })),
      cardsPlayed: this.cardHistory.length,
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
        ready: !!p.isBot,
        cards: {},
        revealed: [],
        blind: [],
        openProperties: [],
        hand: [],
        status: 'alive',
        excludedRound: null,
        exclusionReason: null,
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
      categories: null,
      baggageCount: 0,
      effects: [],
      privateResults: {},
      cardHistory: [],
      cardUses: {},
      mutedCategories: [],
      activeEvent: null,
      eventLog: [],
      finalVote: false,
    });
    this.syncBots();
  }

  // --- serialization -------------------------------------------------

  static FIELDS = [
    'players', 'phase', 'round', 'seats', 'catastrophe', 'bunker', 'turnOrder', 'turnIndex', 'revealedThisRound',
    'votes', 'voteCandidates', 'revote', 'lastVote', 'results', 'log', 'createdAt', 'startedAt', 'endedAt', 'phaseEndsAt',
    'categories', 'baggageCount', 'effects', 'privateResults', 'cardHistory', 'cardUses', 'mutedCategories',
    'activeEvent', 'eventLog', 'finalVote',
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
    // A room saved before any of the new machinery existed has none of it.
    // It keeps the character sheet it was dealt on, and simply plays with
    // the new features switched off for the rest of the match.
    if (!game.categories && game.phase !== PHASES.LOBBY) game.categories = [...LEGACY_CATEGORIES];
    game.effects = game.effects || [];
    game.privateResults = game.privateResults || {};
    game.cardHistory = game.cardHistory || [];
    game.cardUses = game.cardUses || {};
    game.mutedCategories = game.mutedCategories || [];
    game.eventLog = game.eventLog || [];
    game.players.forEach((p) => {
      p.connected = false;
      p.socketId = null;
      p.hand = p.hand || [];
      p.blind = p.blind || [];
      p.openProperties = p.openProperties || [];
    });
    return game;
  }

  // What `viewer` may see of `subject`'s cards: their own always (unless
  // this table deals some of them blind), and otherwise only what has been
  // revealed - everything once a player is out or the game is over.
  cardsVisibleTo(viewer, subject) {
    const everything = this.phase === PHASES.GAME_OVER || subject.status === 'excluded';
    const own = viewer && viewer.id === subject.id;
    return Object.fromEntries(this.categoriesInPlay().map((k) => {
      const card = subject.cards[k];
      if (!card) return [k, null];
      const revealed = subject.revealed.includes(k);
      if (everything || revealed) return [k, this.publicCard(subject, k, card)];
      // The owner sees their own card unless it was dealt face down to
      // them too.
      if (own && !subject.blind.includes(k)) return [k, this.publicCard(subject, k, card)];
      return [k, null];
    }));
  }

  // An item's sealed property is stripped out until it has been opened.
  publicCard(subject, key, card) {
    if (!card.property || subject.openProperties.includes(key)) return card;
    const { property, ...rest } = card;
    return rest;
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId);
    const currentId = this.currentTurnId();
    const inVote = this.phase === PHASES.VOTE;
    const secretVote = this.settings.voting.secret || this.hasEffect('secretVote');
    const categories = this.categoriesInPlay();

    const players = this.players.map((p) => ({
      id: p.id,
      number: p.number,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      isGuest: !p.accountId,
      isBot: !!p.isBot,
      connected: p.connected,
      left: !!p.left,
      exitReason: p.exitReason || null,
      surrendered: !!p.surrendered,
      isHost: p.isHost,
      ready: p.ready,
      status: p.status,
      excludedRound: p.excludedRound,
      exclusionReason: p.exclusionReason,
      cards: this.phase === PHASES.LOBBY ? {} : this.cardsVisibleTo(viewer, p),
      // Which rows of the sheet this player actually holds a card in. It
      // is the whole sheet for everyone, until an event hands one person
      // something nobody else has - and then a closed row and a row that
      // is simply not theirs must not look the same. No secret travels
      // here: the event that dealt it said out loud who got it.
      heldKeys: this.phase === PHASES.LOBBY ? [] : categories.filter((k) => p.cards[k] !== undefined),
      revealed: p.revealed,
      openProperties: p.openProperties || [],
      // How many action cards they still hold - never which ones.
      cardsInHand: (p.hand || []).filter((h) => !h.usedAt).length,
      revealedThisRound: this.revealedThisRound[p.id] || null,
      isCurrent: currentId === p.id,
      isCandidate: inVote && this.voteCandidates.includes(p.id),
      hasVoted: inVote ? this.hasVoted(p.id) : false,
      // The public effects on this seat: everyone can see who is protected
      // or holding a double vote, which is what makes those cards matter.
      effects: this.effects
        .filter((e) => e.params.playerId === p.id || (e.params.playerIds || []).includes(p.id))
        .map((e) => e.type),
      isYou: viewer ? p.id === viewer.id : false,
    }));

    const alive = this.alivePlayers();
    const you = viewer
      ? {
        id: viewer.id,
        isHost: viewer.isHost,
        status: viewer.status,
        canReveal: currentId === viewer.id && !this.hasEffect('blockReveal', viewer.id),
        blockedFromRevealing: this.hasEffect('blockReveal', viewer.id),
        requiredKey: currentId === viewer.id ? this.requiredKeyFor(viewer) : null,
        blind: viewer.blind || [],
        canVote: inVote && viewer.status === 'alive' && !this.hasVoted(viewer.id),
        // Your own vote, and nobody else's, until the vote is counted.
        myVote: inVote ? (this.votes[viewer.id] ?? null) : null,
        myVotes: inVote ? this.ballotOf(viewer.id) : [],
        votesLeft: inVote ? Math.max(0, this.settings.voting.votesPerPlayer - this.ballotOf(viewer.id).length) : 0,
        hand: (viewer.hand || []).map((h, index) => ({ index, id: h.id, used: !!h.usedAt })),
        playable: this.playableCards(viewer),
        cardUses: this.usesOf(viewer.id),
        results: this.privateResults[viewer.id] || [],
      }
      : null;

    return {
      gameType: 'bunker',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      firstVoteRound: this.settings.rounds.firstVoteRound,
      totalRounds: this.settings.rounds.total,
      finalVote: this.finalVote,
      scenario: this.settings.scenario,
      settings: this.settings,
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      minPlayers: this.settings.players.min,
      maxPlayers: this.settings.maxPlayers,
      categories,
      baggageKeys: this.baggageKeysInPlay(),
      secretKeys: this.secretKeysInPlay(),
      mutedCategories: this.mutedCategories,
      seats: this.phase === PHASES.LOBBY
        ? seatsFor(Math.max(this.players.length, this.settings.players.min), this.settings.seats)
        : this.seats,
      aliveCount: this.phase === PHASES.LOBBY ? this.players.length : alive.length,
      catastrophe: this.catastrophe ? { ...this.catastrophe, months: this.catastropheMonths() } : null,
      bunker: this.bunker,
      activeEvent: this.activeEvent,
      // Effects on the whole table rather than on one seat - the power
      // being out, the air running short. The UI reads these to explain
      // why a button is not there.
      tableEffects: this.effects
        .filter((e) => !e.params.playerId && !(e.params.playerIds || []).length)
        .map((e) => e.type),
      eventLog: this.eventLog.slice(-20),
      cardHistory: this.cardHistory.slice(-40),
      turn: this.phase === PHASES.REVEAL
        ? { playerId: currentId, index: this.turnIndex, total: this.turnOrder.length }
        : null,
      vote: inVote
        ? {
          candidates: this.voteCandidates,
          revote: this.revote,
          // Why these candidates and not the whole table.
          reason: this.finalVote ? 'final' : this.revote ? 'revote' : this.hasEffect('duel') ? 'duel' : 'normal',
          secret: secretVote,
          mode: this.settings.voting.mode,
          votesPerPlayer: this.settings.voting.votesPerPlayer,
          votedCount: alive.filter((p) => this.hasVoted(p.id)).length,
          voterCount: alive.length,
          // A running count, unless this table votes in the dark.
          live: secretVote ? null : this.tally(),
        }
        : null,
      lastVote: this.lastVote,
      players,
      you,
      log: this.log.slice(-120),
      results: this.phase === PHASES.GAME_OVER ? this.results : null,
    };
  }
}

module.exports = {
  BunkerGame,
  BunkerError,
  PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  FIRST_VOTE_ROUND,
  RESULT_SEC,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  seatsFor,
};
