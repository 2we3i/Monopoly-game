// ThroneGame.js
// An online Iron Throne room: one instance per room.
//
// The rules themselves are the shared pure engine (engine.mjs, the same
// module the browser uses for its hot-seat table and previews). This class
// adds what a room needs around it: players and their seats at the great
// houses, the lobby, who may act, the clocks, computer houses, players who
// drop out, and a payload per player that hides what they must not see -
// other lords' tactic cards, the order of the decks and the dice seed.
//
// Clients only ever name an intention ("march 2 footmen from Winterfell to
// Moat Cailin"); the engine decides whether it is legal and what happens.

const { ThroneError } = require('./errors');

// Loaded as an ES module through require(); a server whose Node cannot do
// that keeps running every other game and reports this mode unavailable.
let engine = null;
let knownLands = new Set();
let loadError = null;
try {
  // eslint-disable-next-line global-require
  engine = require('./engine.mjs');
  // eslint-disable-next-line global-require
  knownLands = new Set(Object.keys(require('./westeros.mjs').TERRITORY));
} catch (err) {
  loadError = err;
}

const PHASES = {
  LOBBY: 'LOBBY',
  PLAY: 'PLAY',
  GAME_OVER: 'GAME_OVER',
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const TURN_SEC_OPTIONS = [0, 60, 90, 120, 180, 300];
const ROUND_OPTIONS = [8, 10, 12];
const TARGET_OPTIONS = [6, 7, 8];
const DEFAULT_SETTINGS = { roundLimit: 10, target: 7, turnSec: 120 };
const OFFLINE_GRACE_SEC = 20;
const PROPOSAL_SEC = 45;
// Computer houses move at a pace people can follow; tests speed them up.
const AI_STEP_MS = Number(process.env.THRONE_AI_STEP_MS) || 850;
const AI_BATTLE_MS = Number(process.env.THRONE_AI_BATTLE_MS) || 2400;
const HOUSE_IDS = ['stark', 'lannister', 'baratheon', 'greyjoy', 'tyrell', 'martell'];

const ID_RE = /^[a-z_]{2,24}$/;
const ACTION_TYPES = ['recruit', 'move', 'marker', 'fortify', 'buyCard', 'playCard', 'propose', 'respond', 'betray', 'endTurn'];

function isAvailable() {
  return !!engine;
}

function pickOption(value, options, fallback) {
  const n = Math.round(Number(value));
  return options.includes(n) ? n : fallback;
}

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    roundLimit: pickOption(src.roundLimit ?? base.roundLimit, ROUND_OPTIONS, base.roundLimit),
    target: pickOption(src.target ?? base.target, TARGET_OPTIONS, base.target),
    turnSec: pickOption(src.turnSec ?? base.turnSec, TURN_SEC_OPTIONS, base.turnSec),
  };
}

const idOf = (value) => (typeof value === 'string' && ID_RE.test(value) ? value : null);
const landOf = (value) => (knownLands.has(value) ? value : null);
const houseOf = (value) => (HOUSE_IDS.includes(value) ? value : null);
const countOf = (value, max) => (Number.isInteger(value) && value >= 0 && value <= max ? value : null);

// Only known action types with well-formed fields ever reach the engine.
function cleanAction(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const { type } = src;
  if (!ACTION_TYPES.includes(type)) throw new ThroneError('Unknown action.');
  let action;
  switch (type) {
    case 'recruit':
      action = { type, territory: landOf(src.territory), unit: src.unit === 'f' || src.unit === 'k' ? src.unit : null };
      break;
    case 'move':
      action = {
        type, from: landOf(src.from), to: landOf(src.to), f: countOf(src.f, 99), k: countOf(src.k, 99),
      };
      break;
    case 'marker':
    case 'fortify':
      action = { type, territory: landOf(src.territory) };
      break;
    case 'playCard':
      action = { type, index: countOf(src.index, 9) };
      if (src.target !== undefined && src.target !== null) {
        action.target = landOf(src.target);
        if (!action.target) throw new ThroneError('Invalid action.');
      }
      break;
    case 'propose':
      action = { type, to: houseOf(src.to) };
      break;
    case 'betray':
      action = { type, other: houseOf(src.other) };
      break;
    case 'respond':
      action = { type, accept: !!src.accept };
      break;
    default:
      action = { type };
  }
  if (Object.values(action).some((v) => v === null)) throw new ThroneError('Invalid action.');
  return action;
}

class ThroneGame {
  constructor(roomCode, hostId, settings) {
    if (!engine) throw new ThroneError('The Iron Throne is not available on this server.');
    this.gameType = 'throne';
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.players = [];
    this.phase = PHASES.LOBBY;
    this.aiHouses = [];
    this.state = null;
    this.results = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.endedAt = null;
    this.phaseEndsAt = null;
    this.aiAt = null;
    this.clock = { key: null, turnEndsAt: null, awaySince: null };
  }

  // --- players ---------------------------------------------------------------

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId) || null;
  }

  ownerOf(house) {
    return this.players.find((p) => p.house === house && !p.left) || null;
  }

  freeHouses() {
    return HOUSE_IDS.filter((h) => !this.players.some((p) => p.house === h) && !this.aiHouses.includes(h));
  }

  addPlayer({
    playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null,
  }) {
    const existing = this.getPlayer(playerId);
    if (existing) {
      const wasAway = existing.left;
      existing.socketId = socketId;
      existing.connected = true;
      existing.left = false;
      if (accountId) {
        existing.nickname = nickname || existing.nickname;
        existing.avatarUrl = avatarUrl;
      }
      // A lord who comes back takes their house back from the computer.
      if (wasAway && this.phase === PHASES.PLAY && existing.house && this.state.houses[existing.house]) {
        this.state.houses[existing.house].control = 'human';
        this.note('playerBack', {}, existing.house);
      }
      this.armDeadline();
      return existing;
    }
    if (this.phase !== PHASES.LOBBY) throw new ThroneError('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new ThroneError(`An Iron Throne room holds at most ${MAX_PLAYERS} players.`);
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
      house: this.freeHouses()[0] || null,
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
    // A room with no host at all can never be restarted or closed by
    // anyone in it, so the last fallback is a seat that has also been
    // left: if its owner ever comes back, the room answers to them again.
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
    if (this.phase !== PHASES.PLAY) {
      this.handOffHost(player);
      this.players = this.players.filter((p) => p.id !== playerId);
      return;
    }
    // Mid-game the house stays on the map; the computer rules it from now.
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this.handOffHost(player);
    const house = this.state.houses[player.house];
    if (house && !house.out) {
      house.control = 'ai';
      this.note('playerLeft', {}, player.house);
      if (this.state.proposal?.to === player.house) this.applyEngine({ type: 'respond', accept: false });
    }
    this.armDeadline();
  }

  setConnected(playerId, connected, socketId = null) {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    player.connected = connected;
    player.socketId = connected ? socketId : null;
    this.armDeadline();
    return player;
  }

  setReady(playerId, ready) {
    const player = this.getPlayer(playerId);
    if (!player) throw new ThroneError('Player not found.');
    if (this.phase === PHASES.LOBBY) player.ready = !!ready;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw new ThroneError('Only the host can do that.');
  }

  assertLobby() {
    if (this.phase !== PHASES.LOBBY) throw new ThroneError('That can only be changed before the game starts.');
  }

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    this.assertLobby();
    this.settings = sanitizeSettings(patch, this.settings);
    return this.settings;
  }

  chooseHouse(playerId, house) {
    this.assertLobby();
    const player = this.getPlayer(playerId);
    if (!player) throw new ThroneError('Player not found.');
    if (!HOUSE_IDS.includes(house)) throw new ThroneError('Unknown house.');
    const holder = this.players.find((p) => p.house === house);
    if (holder && holder.id !== playerId) throw new ThroneError('Another lord already leads that house.');
    this.aiHouses = this.aiHouses.filter((h) => h !== house);
    player.house = house;
    player.ready = false;
  }

  setAiHouse(playerId, house, on) {
    this.assertHost(playerId);
    this.assertLobby();
    if (!HOUSE_IDS.includes(house)) throw new ThroneError('Unknown house.');
    if (this.players.some((p) => p.house === house)) throw new ThroneError('A player already leads that house.');
    this.aiHouses = this.aiHouses.filter((h) => h !== house);
    if (on) this.aiHouses.push(house);
  }

  // --- lifecycle -------------------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new ThroneError('The game has already started.');
    const seated = this.players.filter((p) => !p.left);
    if (seated.length < MIN_PLAYERS) throw new ThroneError(`The Iron Throne needs at least ${MIN_PLAYERS} players.`);
    seated.forEach((p) => {
      if (!p.house) [p.house] = this.freeHouses();
    });
    const houses = {};
    const names = {};
    seated.forEach((p) => {
      houses[p.house] = 'human';
      names[p.house] = p.nickname;
    });
    this.aiHouses.forEach((h) => { if (!houses[h]) houses[h] = 'ai'; });
    this.state = engine.createGame({
      houses, names, roundLimit: this.settings.roundLimit, target: this.settings.target,
    });
    this.phase = PHASES.PLAY;
    this.results = null;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.clock = { key: null, turnEndsAt: null, awaySince: null };
    this.armDeadline();
    return this;
  }

  restart(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.GAME_OVER) throw new ThroneError('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => { p.ready = false; });
    Object.assign(this, {
      phase: PHASES.LOBBY, state: null, results: null, startedAt: null, endedAt: null, phaseEndsAt: null, aiAt: null,
    });
  }

  // --- actions ---------------------------------------------------------------

  // The engine returns the same object for a move it refuses.
  applyEngine(action) {
    const next = engine.act(this.state, action);
    if (next === this.state) return false;
    this.state = next;
    return true;
  }

  act(playerId, raw) {
    if (this.phase !== PHASES.PLAY || !this.state) throw new ThroneError('The game is not running.');
    const player = this.getPlayer(playerId);
    if (!player || player.left || !player.house) throw new ThroneError('You do not lead a house in this game.');
    const action = cleanAction(raw);
    const s = this.state;
    const mine = s.houses[player.house];
    if (!mine || mine.out) throw new ThroneError('Your house has fallen.');
    if (action.type === 'respond') {
      if (s.proposal?.to !== player.house) throw new ThroneError('No alliance is offered to your house.');
    } else if (engine.currentHouse(s) !== player.house) {
      throw new ThroneError('It is not your turn.');
    } else if (s.proposal) {
      throw new ThroneError('Wait for the answer to the alliance offer.');
    }
    if (!this.applyEngine(action)) throw new ThroneError('That move is not possible right now.');
    this.afterChange();
  }

  afterChange() {
    if (this.state.phase === 'over') this.endGame();
    else this.armDeadline();
  }

  // Appends a line to the game's chronicle in the engine's own format.
  note(key, vars = {}, house = null) {
    const s = this.state;
    if (!s) return;
    s.logN += 1;
    s.log.push({
      n: s.logN, round: s.round, turnNo: s.turnNo, house, key, vars,
    });
    if (s.log.length > 240) s.log.splice(0, s.log.length - 240);
  }

  // --- clocks ------------------------------------------------------------------

  // What the room is waiting for: a human lord (their turn clock, or a
  // short grace when they are away), an answer to an alliance offer, or a
  // computer house's next step.
  armDeadline() {
    this.phaseEndsAt = null;
    this.aiAt = null;
    if (this.phase !== PHASES.PLAY || !this.state || this.state.phase !== 'play') return;
    const s = this.state;
    const now = Date.now();
    const waitingOn = s.proposal ? s.proposal.to : engine.currentHouse(s);
    const key = s.proposal ? `p|${s.turnNo}|${s.proposal.from}|${s.proposal.to}` : `t|${s.turnNo}`;

    if (s.houses[waitingOn].control === 'ai') {
      this.clock = { key, turnEndsAt: null, awaySince: null };
      const battle = s.battle && s.battle.id === s.seq;
      this.aiAt = now + (battle ? AI_BATTLE_MS : AI_STEP_MS);
      return;
    }

    if (this.clock.key !== key) {
      const seconds = s.proposal ? PROPOSAL_SEC : this.settings.turnSec;
      this.clock = { key, turnEndsAt: seconds ? now + seconds * 1000 : null, awaySince: null };
    }
    const owner = this.ownerOf(waitingOn);
    const away = !owner || !owner.connected;
    if (away && !this.clock.awaySince) this.clock.awaySince = now;
    if (!away) this.clock.awaySince = null;
    const graceEnds = this.clock.awaySince ? this.clock.awaySince + OFFLINE_GRACE_SEC * 1000 : null;
    const ends = [this.clock.turnEndsAt, graceEnds].filter(Boolean);
    this.phaseEndsAt = ends.length ? Math.min(...ends) : null;
  }

  wakeAt() {
    const times = [this.phaseEndsAt, this.aiAt].filter(Boolean);
    return times.length ? Math.min(...times) : null;
  }

  // The clock ran out, or a computer house is due: keep the game moving.
  onTimeout() {
    if (this.phase !== PHASES.PLAY || !this.state || this.state.phase !== 'play') return;
    const s = this.state;
    const now = Date.now();
    if (s.proposal) {
      const target = s.proposal.to;
      if (s.houses[target].control === 'ai' || (this.phaseEndsAt && now >= this.phaseEndsAt - 50)) {
        this.applyEngine({ type: 'respond', accept: false });
        this.note('proposalTimeout', {}, target);
      }
    } else {
      const house = engine.currentHouse(s);
      if (s.houses[house].control === 'ai') {
        if (this.aiAt && now >= this.aiAt - 50) this.state = engine.aiStep(s);
      } else if (this.phaseEndsAt && now >= this.phaseEndsAt - 50) {
        this.note('autoEnd', {}, house);
        if (!this.applyEngine({ type: 'endTurn' })) this.armDeadline();
      }
    }
    this.afterChange();
  }

  // --- end ---------------------------------------------------------------------

  endGame() {
    const s = this.state;
    const winners = s.winners || [];
    const standings = engine.standings(s).map((row) => {
      const owner = this.players.find((p) => p.house === row.id) || null;
      return {
        house: row.id,
        playerId: owner?.id || null,
        nickname: owner?.nickname || null,
        ai: s.houses[row.id].control === 'ai' && !owner,
        vp: row.vp,
        lands: row.lands,
        strength: row.strength,
        gold: row.gold,
        out: row.out,
        winner: winners.includes(row.id),
      };
    });
    this.results = {
      reason: s.reason,
      winners,
      winnerIds: standings.filter((r) => r.winner && r.playerId).map((r) => r.playerId),
      standings,
    };
    this.phase = PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.aiAt = null;
    this.endedAt = Date.now();
  }

  // --- serialization -------------------------------------------------------------

  toJSON() {
    const {
      gameType, roomCode, hostId, settings, players, phase, aiHouses, state, results, createdAt, startedAt, endedAt, clock,
    } = this;
    return {
      gameType, roomCode, hostId, settings, players, phase, aiHouses, state, results, createdAt, startedAt, endedAt, clock,
    };
  }

  static fromJSON(data) {
    const game = new ThroneGame(data.roomCode, data.hostId, data.settings);
    ['players', 'phase', 'aiHouses', 'state', 'results', 'createdAt', 'startedAt', 'endedAt', 'clock'].forEach((f) => {
      if (data[f] !== undefined && data[f] !== null) game[f] = data[f];
    });
    game.players.forEach((p) => { p.connected = false; p.socketId = null; });
    game.armDeadline();
    return game;
  }

  // The game as one lord may see it: no dice seed, no deck order, and only
  // their own tactic cards (the others arrive as counts).
  visibleState(house) {
    if (!this.state) return null;
    const s = structuredClone(this.state);
    delete s.rng;
    s.cardDeckCount = s.cardDeck.length;
    s.eventDeckCount = s.eventDeck.length;
    s.cardDeck = [];
    s.eventDeck = [];
    Object.values(s.houses).forEach((h) => {
      h.handCount = h.hand.length;
      if (h.id !== house) h.hand = [];
    });
    return s;
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId);
    return {
      gameType: 'throne',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      options: { rounds: ROUND_OPTIONS, targets: TARGET_OPTIONS, turnSec: TURN_SEC_OPTIONS },
      houses: HOUSE_IDS.map((h) => {
        const holder = this.players.find((p) => p.house === h);
        return { id: h, playerId: holder?.id || null, ai: this.aiHouses.includes(h) };
      }),
      players: this.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        isGuest: !p.accountId,
        connected: p.connected,
        left: !!p.left,
        exitReason: p.exitReason || null,
        surrendered: !!p.surrendered,
        isHost: p.isHost,
        ready: p.ready,
        house: p.house,
        isYou: viewer ? p.id === viewer.id : false,
      })),
      you: viewer ? { id: viewer.id, isHost: viewer.isHost, house: viewer.house } : null,
      game: this.visibleState(viewer?.house || null),
      results: this.phase === PHASES.GAME_OVER ? this.results : null,
    };
  }
}

module.exports = {
  ThroneGame,
  ThroneError,
  PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_SETTINGS,
  TURN_SEC_OPTIONS,
  HOUSE_IDS,
  cleanAction,
  isAvailable,
  loadError: () => loadError,
};
