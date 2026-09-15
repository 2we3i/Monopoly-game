// CosmicGame.js
// The authoritative Cosmic Encounter («Космический контакт») engine: one
// instance per room.
//
// Every player is an alien race with a home system of five planets and
// twenty ships. On a turn the offense has an encounter, played in eight
// phases: start turn, regroup, destiny, launch, alliance, planning,
// reveal and resolution. The first player (or players, together) to hold
// five foreign colonies wins.
//
// The state is partly secret: hands, face-down encounter cards and deal
// cards are only in their owners' payloads. Every action is validated
// here against server state - a client only names a planet, a card or a
// player.

const {
  COLORS, cosmicDeckList, destinyDeckList, isEncounter,
} = require('./cards');
const { ALIENS, ALIEN_IDS } = require('./aliens');
const { CosmicError } = require('./errors');

const PHASES = {
  LOBBY: 'LOBBY',
  ALIENS: 'ALIENS',
  PLAY: 'PLAY',
  GAME_OVER: 'GAME_OVER',
};

const ENCOUNTER_PHASES = ['START', 'REGROUP', 'DESTINY', 'LAUNCH', 'ALLIANCE', 'PLANNING', 'REVEAL', 'RESOLUTION'];

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 5;
const HAND_SIZE = 8;
const PLANETS_PER_PLAYER = 5;
const SHIPS_PER_PLANET = 4;
const SHIPS_PER_PLAYER = 20;
const WIN_COLONIES = 5;
const MAX_SHIPS_SENT = 4;
const HOME_COLONIES_FOR_POWER = 3;
const FAILED_DEAL_SHIPS = 3;

const DEAL_SEC = 60;
const REVEAL_WINDOW_SEC = 30;
const QUASH_WINDOW_SEC = 8;
const REWARD_SEC = 45;
const OFFLINE_GRACE_SEC = 20;
const TURN_SEC_OPTIONS = [0, 60, 90, 120, 180];
const DEFAULT_SETTINGS = { turnSec: 90 };

const ARTIFACT_LASTING = ['cosmicZap', 'emotionControl', 'ionicGas'];
const CARD_TYPES = ['attack', 'negotiate', 'morph', 'reinforcement', 'artifact'];

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  const turn = Math.round(Number(src.turnSec ?? base.turnSec));
  return { turnSec: TURN_SEC_OPTIONS.includes(turn) ? turn : base.turnSec };
}

function sumMap(map) {
  return Object.values(map || {}).reduce((s, n) => s + n, 0);
}

function mergeInto(target, add) {
  Object.entries(add).forEach(([k, n]) => { target[k] = (target[k] || 0) + n; });
  return target;
}

class CosmicGame {
  constructor(roomCode, hostId, settings) {
    this.gameType = 'cosmic';
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.players = [];
    this.phase = PHASES.LOBBY;
    this.planets = [];
    this.warp = {};
    this.cards = {}; // uid -> card definition
    this.cardSeq = 0;
    this.cosmicDeck = [];
    this.cosmicDiscard = [];
    this.destinyDeck = [];
    this.destinyDiscard = [];
    this.order = [];
    this.turnIndex = 0;
    this.enc = null;
    this.seq = 0;
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

  addPlayer({
    playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null,
  }) {
    const existing = this.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      existing.left = false;
      if (accountId) {
        existing.nickname = nickname || existing.nickname;
        existing.avatarUrl = avatarUrl;
      }
      if (this.settings.turnSec === 0 && this.actorIds().includes(existing.id) && !this.fixedWindowSec()) this.armDeadline();
      return existing;
    }
    if (this.phase !== PHASES.LOBBY) throw new CosmicError('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new CosmicError(`A Cosmic Encounter room holds at most ${MAX_PLAYERS} players.`);
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
      color: null,
      alienId: null,
      alienOptions: [],
      hand: [],
      tokens: 0,
      stats: { encounters: 0, wins: 0 },
    };
    if (player.isHost) this.hostId = player.id;
    this.players.push(player);
    return player;
  }

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
      return;
    }
    // Mid-game the seat stays - its ships and colonies are on the board -
    // and its decisions are made automatically from now on.
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this.handOffHost(player);
    this.addLog('PLAYER_LEFT', { name: player.nickname });
    this.shortenDeadlineFor(player);
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
    if (!player) throw new CosmicError('Player not found.');
    if (this.phase === PHASES.LOBBY) player.ready = !!ready;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw new CosmicError('Only the host can do that.');
  }

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new CosmicError('Settings can only be changed before the game starts.');
    this.settings = sanitizeSettings(patch, this.settings);
    return this.settings;
  }

  // `to` limits an entry to the listed players; null means everyone.
  addLog(type, params = {}, to = null) {
    this.log.push({
      type, params, turn: this.enc ? this.turnIndexNumber() : 0, ts: Date.now(), to,
    });
    if (this.log.length > 400) this.log.shift();
  }

  turnIndexNumber() {
    return this.turnCount || 0;
  }

  // --- cards ---------------------------------------------------------

  newCard(def) {
    this.cardSeq += 1;
    const uid = `k${this.cardSeq}`;
    this.cards[uid] = def;
    return uid;
  }

  def(uid) {
    return this.cards[uid] || null;
  }

  cardView(uid) {
    const d = this.def(uid);
    return d ? { uid, ...d } : null;
  }

  hasEncounterCard(playerId) {
    const p = this.getPlayer(playerId);
    return !!p && p.hand.some((uid) => isEncounter(this.def(uid)));
  }

  // Draws up to `count` cards. An empty deck is rebuilt from the discard
  // pile; with both empty a cosmic quake re-deals everyone instead.
  drawCards(playerId, count) {
    const player = this.getPlayer(playerId);
    for (let i = 0; i < count; i += 1) {
      if (this.cosmicDeck.length === 0) {
        if (this.cosmicDiscard.length === 0) {
          this.cosmicQuake();
          return;
        }
        this.cosmicDeck = shuffle(this.cosmicDiscard);
        this.cosmicDiscard = [];
        this.addLog('DECK_RESHUFFLED', {});
      }
      player.hand.push(this.cosmicDeck.pop());
    }
  }

  cosmicQuake() {
    this.players.forEach((p) => {
      this.cosmicDiscard.push(...p.hand);
      p.hand = [];
    });
    this.cosmicDeck = shuffle([...this.cosmicDeck, ...this.cosmicDiscard]);
    this.cosmicDiscard = [];
    this.players.forEach((p) => {
      for (let i = 0; i < HAND_SIZE && this.cosmicDeck.length; i += 1) p.hand.push(this.cosmicDeck.pop());
    });
    this.addLog('COSMIC_QUAKE', {});
  }

  // Discard the whole hand and draw 8, until an encounter card turns up.
  refillForEncounter(playerId) {
    const player = this.getPlayer(playerId);
    for (let guard = 0; guard < 20 && !this.hasEncounterCard(playerId); guard += 1) {
      this.cosmicDiscard.push(...player.hand);
      player.hand = [];
      this.drawCards(playerId, HAND_SIZE);
    }
  }

  takeFromHand(player, uid) {
    const i = player.hand.indexOf(uid);
    if (i === -1) throw new CosmicError('That card is not in your hand.');
    player.hand.splice(i, 1);
    return uid;
  }

  drawDestinyCard() {
    // The last card is never revealed: it is shuffled into a new deck.
    if (this.destinyDeck.length <= 1) {
      this.destinyDeck = shuffle([...this.destinyDeck, ...this.destinyDiscard]);
      this.destinyDiscard = [];
      this.addLog('DESTINY_RESHUFFLED', {});
    }
    const card = this.destinyDeck.pop();
    this.destinyDiscard.push(card);
    return card;
  }

  // --- board ---------------------------------------------------------

  planet(planetId) {
    return this.planets.find((pl) => pl.id === planetId) || null;
  }

  shipsOn(playerId, planetId) {
    return this.planet(planetId)?.ships[playerId] || 0;
  }

  colonies(playerId) {
    return this.planets.filter((pl) => (pl.ships[playerId] || 0) > 0);
  }

  homeColonies(playerId) {
    return this.planets.filter((pl) => pl.ownerId === playerId && (pl.ships[playerId] || 0) > 0).length;
  }

  foreignColonies(playerId) {
    return this.planets.filter((pl) => pl.ownerId !== playerId && (pl.ships[playerId] || 0) > 0).length;
  }

  colonyShips(playerId) {
    return this.colonies(playerId).reduce((s, pl) => s + pl.ships[playerId], 0);
  }

  bestColony(playerId) {
    const list = this.colonies(playerId);
    list.sort((a, b) => (b.ships[playerId] - a.ships[playerId]) || ((b.ownerId === playerId) - (a.ownerId === playerId)));
    return list[0] || null;
  }

  addShips(playerId, planetId, count) {
    if (count <= 0) return;
    const pl = this.planet(planetId);
    pl.ships[playerId] = (pl.ships[playerId] || 0) + count;
  }

  removeShips(playerId, planetId, count) {
    const pl = this.planet(planetId);
    if (!pl || (pl.ships[playerId] || 0) < count) throw new CosmicError('You do not have that many ships there.');
    pl.ships[playerId] -= count;
    if (pl.ships[playerId] === 0) delete pl.ships[playerId];
  }

  // Ships leaving colonies for the gate or an alliance: {planetId: n}.
  takeSelection(playerId, selection, limit) {
    const clean = {};
    Object.entries(selection && typeof selection === 'object' ? selection : {}).forEach(([planetId, n]) => {
      const count = clampInt(n, 0, MAX_SHIPS_SENT, 0);
      if (count > 0 && this.planet(planetId)) clean[planetId] = count;
    });
    const total = sumMap(clean);
    if (total < 1) throw new CosmicError('Send at least one ship.');
    if (total > limit) throw new CosmicError(limit === 1 ? 'You can only send one ship.' : `You can send at most ${limit} ships.`);
    Object.entries(clean).forEach(([planetId, n]) => {
      if (this.shipsOn(playerId, planetId) < n) throw new CosmicError('You do not have that many ships there.');
    });
    Object.entries(clean).forEach(([planetId, n]) => this.removeShips(playerId, planetId, n));
    return clean;
  }

  // Automatic selection: the largest colonies give first, and a colony
  // keeps its last ship when another colony can spare one.
  autoSelection(playerId, count) {
    const pick = {};
    const left = Object.fromEntries(this.colonies(playerId).map((pl) => [pl.id, pl.ships[playerId]]));
    for (let i = 0; i < count; i += 1) {
      const entries = Object.entries(left).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      if (!entries.length) break;
      const [planetId] = entries[0];
      left[planetId] -= 1;
      pick[planetId] = (pick[planetId] || 0) + 1;
    }
    return pick;
  }

  // Ships going home: to the colony they came from if it still stands,
  // otherwise to the player's biggest colony.
  returnShips(playerId, origins) {
    Object.entries(origins || {}).forEach(([from, n]) => {
      if (n <= 0) return;
      const pl = this.planet(from);
      if (pl && (pl.ships[playerId] || 0) > 0) {
        this.addShips(playerId, pl.id, n);
        return;
      }
      const best = this.bestColony(playerId);
      if (best) {
        this.addShips(playerId, best.id, n);
      } else {
        // No colony left anywhere: the ships regroup on a home planet.
        const home = pl && pl.ownerId === playerId ? pl : this.planets.find((x) => x.ownerId === playerId);
        this.addShips(playerId, home.id, n);
      }
    });
  }

  // Ships already lifted off the board go to the warp - unless the owner
  // is the Zombie, whose ships go home instead. Returns how many arrived.
  sendToWarp(playerId, count, origins) {
    if (count <= 0) return 0;
    if (this.powerActive(playerId, 'zombie')) {
      this.returnShips(playerId, origins);
      this.addLog('POWER_ZOMBIE', { name: this.getPlayer(playerId).nickname, count });
      return 0;
    }
    this.warp[playerId] = (this.warp[playerId] || 0) + count;
    return count;
  }

  // Loses ships of the player's choosing - automatically: gate first, then
  // the largest colonies.
  loseShips(playerId, count) {
    const origins = {};
    let left = count;
    const gate = this.enc?.gate[playerId];
    if (gate) {
      Object.keys(gate).forEach((from) => {
        const n = Math.min(left, gate[from]);
        if (n > 0) {
          gate[from] -= n;
          origins[from] = (origins[from] || 0) + n;
          left -= n;
          if (gate[from] === 0) delete gate[from];
        }
      });
      if (!sumMap(gate)) delete this.enc.gate[playerId];
    }
    if (left > 0) {
      const pick = this.autoSelection(playerId, left);
      Object.entries(pick).forEach(([planetId, n]) => {
        this.removeShips(playerId, planetId, n);
        origins[planetId] = (origins[planetId] || 0) + n;
      });
    }
    return this.sendToWarp(playerId, sumMap(origins), origins);
  }

  shipsInPlay(playerId) {
    return this.colonyShips(playerId) + (this.warp[playerId] || 0)
      + sumMap(this.enc?.gate[playerId]) + sumMap(this.enc?.defense[playerId]);
  }

  // --- powers --------------------------------------------------------

  // A power works only while the race keeps 3 home colonies and nobody
  // has zapped it this encounter.
  powerActive(playerId, alienId) {
    const p = this.getPlayer(playerId);
    if (!p || p.alienId !== alienId) return false;
    if (this.homeColonies(playerId) < HOME_COLONIES_FOR_POWER) return false;
    return !this.enc?.frozen?.[playerId];
  }

  shipValue(playerId, count) {
    return count * (this.powerActive(playerId, 'macron') ? 4 : 1);
  }

  sendLimit(playerId) {
    return this.powerActive(playerId, 'macron') ? 1 : MAX_SHIPS_SENT;
  }

  rewardMultiplier(playerId) {
    return this.powerActive(playerId, 'macron') ? 2 : 1;
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new CosmicError('The game has already started.');
    if (this.players.length < MIN_PLAYERS) throw new CosmicError(`Cosmic Encounter needs at least ${MIN_PLAYERS} players.`);

    this.planets = [];
    this.warp = {};
    this.cards = {};
    this.cardSeq = 0;
    this.players.forEach((p, i) => {
      p.color = COLORS[i];
      p.alienId = null;
      p.hand = [];
      p.tokens = 0;
      p.stats = { encounters: 0, wins: 0 };
      this.warp[p.id] = 0;
      for (let k = 0; k < PLANETS_PER_PLAYER; k += 1) {
        this.planets.push({
          id: `${p.color}-${k}`, ownerId: p.id, color: p.color, index: k, ships: { [p.id]: SHIPS_PER_PLANET },
        });
      }
    });
    this.cosmicDeck = shuffle(cosmicDeckList().map((d) => this.newCard(d)));
    this.cosmicDiscard = [];
    this.destinyDeck = shuffle(destinyDeckList(this.players.map((p) => p.color)).map((d) => ({ ...d, id: this.newCard(d) })));
    this.destinyDiscard = [];
    this.players.forEach((p) => this.drawCards(p.id, HAND_SIZE));

    // Advanced setup: two races each, keep one.
    const pool = shuffle(ALIEN_IDS);
    this.players.forEach((p, i) => { p.alienOptions = pool.slice(i * 2, i * 2 + 2); });

    this.order = this.players.map((p) => p.id);
    this.turnIndex = 0;
    this.turnCount = 0;
    this.enc = null;
    this.results = null;
    this.log = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.phase = PHASES.ALIENS;
    this.addLog('GAME_STARTED', {});
    this.armDeadline();
    return this;
  }

  chooseAlien(playerId, alienId) {
    if (this.phase !== PHASES.ALIENS) throw new CosmicError('Races are not being chosen now.');
    const p = this.getPlayer(playerId);
    if (!p) throw new CosmicError('Player not found.');
    if (p.alienId) throw new CosmicError('You have already chosen your race.');
    if (!p.alienOptions.includes(alienId)) throw new CosmicError('Choose one of the two races you were dealt.');
    p.alienId = alienId;
    this.addLog('ALIEN_CHOSEN', { name: p.nickname });
    if (this.players.every((x) => x.alienId)) this.beginGame();
    else this.armDeadline();
  }

  beginGame() {
    this.players.forEach((p) => this.addLog('ALIEN_REVEALED', { name: p.nickname, alien: p.alienId }));
    // The first player: reveal destiny cards until a player's colour shows.
    let first = null;
    for (let guard = 0; guard < 40 && !first; guard += 1) {
      const card = this.drawDestinyCard();
      if (card.kind === 'color') first = this.players.find((p) => p.color === card.color) || null;
    }
    this.destinyDeck = shuffle([...this.destinyDeck, ...this.destinyDiscard]);
    this.destinyDiscard = [];
    this.turnIndex = Math.max(0, this.order.indexOf(first?.id));
    this.phase = PHASES.PLAY;
    this.turnCount = 1;
    this.addLog('FIRST_PLAYER', { name: this.getPlayer(this.order[this.turnIndex]).nickname });
    this.newEncounter(1, 'START');
  }

  restart(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.GAME_OVER) throw new CosmicError('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => {
      Object.assign(p, {
        ready: false, color: null, alienId: null, alienOptions: [], hand: [], tokens: 0, stats: { encounters: 0, wins: 0 },
      });
    });
    Object.assign(this, {
      phase: PHASES.LOBBY,
      planets: [],
      warp: {},
      cards: {},
      cosmicDeck: [],
      cosmicDiscard: [],
      destinyDeck: [],
      destinyDiscard: [],
      order: [],
      turnIndex: 0,
      turnCount: 0,
      enc: null,
      results: null,
      log: [],
      startedAt: null,
      endedAt: null,
      phaseEndsAt: null,
    });
  }

  // --- encounter plumbing ---------------------------------------------

  newEncounter(number, phase) {
    const aggressorId = this.order[this.turnIndex];
    this.enc = {
      number,
      phase,
      step: phase === 'DESTINY' ? 'DRAW' : null,
      aggressorId,
      destiny: null,
      candidates: null,
      ownOptions: null,
      launchMode: null,
      defenderId: null,
      targetPlanetId: null,
      gate: {},
      defense: {},
      invites: { offense: null, defense: null },
      allies: {},
      acceptOrder: [],
      acceptIndex: 0,
      powerQueue: [],
      oracleId: null,
      cards: { offense: null, defense: null },
      revealed: false,
      reinforcements: [],
      passes: {},
      effects: [],
      frozen: {},
      outcome: null,
      deal: null,
      rewards: null,
      cloneQueue: [],
      cloneKept: {},
      discarded: [],
      fetch: null,
      mindSeen: {},
      success: false,
      windowKey: null,
    };
    if (phase === 'START') this.addLog('TURN_STARTED', { name: this.getPlayer(aggressorId).nickname });
    this.armDeadline();
  }

  assertPlay() {
    if (this.phase === PHASES.GAME_OVER) throw new CosmicError('The game is over.');
    if (this.phase !== PHASES.PLAY || !this.enc) throw new CosmicError('The game is not in play.');
  }

  assertStep(phase, step, playerId, who) {
    this.assertPlay();
    if (this.enc.phase !== phase || (step !== undefined && this.enc.step !== step)) throw new CosmicError('That cannot be done in this phase.');
    if (who === 'offense' && playerId !== this.enc.aggressorId) throw new CosmicError('Only the offense can do that now.');
    if (who === 'defense' && playerId !== this.enc.defenderId) throw new CosmicError('Only the defense can do that now.');
    const p = this.getPlayer(playerId);
    if (!p) throw new CosmicError('Player not found.');
    return p;
  }

  sideOf(playerId) {
    const enc = this.enc;
    if (!enc) return null;
    if (playerId === enc.aggressorId) return 'offense';
    if (playerId === enc.defenderId) return 'defense';
    return enc.allies[playerId] || null;
  }

  mainIds() {
    return [this.enc.aggressorId, this.enc.defenderId].filter(Boolean);
  }

  opponentOf(playerId) {
    return playerId === this.enc.aggressorId ? this.enc.defenderId : this.enc.aggressorId;
  }

  involvedIds() {
    return [...this.mainIds(), ...Object.keys(this.enc.allies)];
  }

  effectActive(kind) {
    return !!this.enc?.effects.some((e) => e.kind === kind && !e.zapped);
  }

  returnAllies(ids = Object.keys(this.enc.allies)) {
    ids.forEach((id) => {
      const side = this.enc.allies[id];
      const map = side === 'offense' ? this.enc.gate : this.enc.defense;
      if (map[id]) this.returnShips(id, map[id]);
      delete map[id];
      delete this.enc.allies[id];
    });
  }

  returnAllShips() {
    Object.entries(this.enc.gate).forEach(([id, origins]) => this.returnShips(id, origins));
    Object.entries(this.enc.defense).forEach(([id, origins]) => this.returnShips(id, origins));
    this.enc.gate = {};
    this.enc.defense = {};
  }

  // --- 1. start turn ---------------------------------------------------

  beginTurn(playerId) {
    const p = this.assertStep('START', null, playerId, 'offense');
    if (!this.hasEncounterCard(playerId)) {
      this.refillForEncounter(playerId);
      this.addLog('NO_ENCOUNTER_REDRAW', { name: p.nickname });
    }
    this.enc.phase = 'REGROUP';
    this.armDeadline();
  }

  // --- 2. regroup -------------------------------------------------------

  regroup(playerId, planetId) {
    const p = this.assertStep('REGROUP', null, playerId, 'offense');
    if ((this.warp[playerId] || 0) > 0) {
      if (this.colonies(playerId).length) {
        if (!planetId || this.shipsOn(playerId, planetId) <= 0) throw new CosmicError('Choose one of your colonies for the ship.');
        this.addShips(playerId, planetId, 1);
        this.addLog('REGROUPED', { name: p.nickname, planet: planetId });
      } else {
        this.enc.gate[playerId] = { gate: 1 };
        this.addLog('REGROUPED_TO_GATE', { name: p.nickname });
      }
      this.warp[playerId] -= 1;
    } else {
      this.addLog('REGROUP_EMPTY', { name: p.nickname });
    }
    this.enc.phase = 'DESTINY';
    this.enc.step = 'DRAW';
    this.armDeadline();
  }

  // --- 3. destiny ---------------------------------------------------------

  drawDestiny(playerId) {
    const p = this.assertStep('DESTINY', 'DRAW', playerId, 'offense');
    const card = this.drawDestinyCard();
    this.enc.destiny = { kind: card.kind, color: card.color || null, rule: card.rule || null };
    this.addLog('DESTINY_DRAWN', { name: p.nickname, ...this.enc.destiny });
    const enc = this.enc;
    if (card.kind === 'color') {
      const owner = this.players.find((x) => x.color === card.color);
      if (owner.id === enc.aggressorId) this.enterOwnColor();
      else this.setDefender(owner.id);
    } else if (card.kind === 'wild') {
      enc.candidates = this.players.filter((x) => x.id !== enc.aggressorId).map((x) => x.id);
      enc.step = 'CHOOSE_PLAYER';
      this.armDeadline();
    } else {
      const measure = {
        mostColonies: (x) => this.foreignColonies(x.id),
        mostCards: (x) => x.hand.length,
        mostWarp: (x) => this.warp[x.id] || 0,
      }[card.rule];
      const max = Math.max(...this.players.map(measure));
      const leaders = this.players.filter((x) => measure(x) === max).map((x) => x.id);
      if (leaders.length === 1) {
        if (leaders[0] === enc.aggressorId) this.enterOwnColor();
        else this.setDefender(leaders[0]);
      } else {
        enc.candidates = leaders;
        enc.step = 'CHOOSE_PLAYER';
        this.armDeadline();
      }
    }
  }

  chooseDefender(playerId, targetId) {
    this.assertStep('DESTINY', 'CHOOSE_PLAYER', playerId, 'offense');
    if (!this.enc.candidates.includes(targetId)) throw new CosmicError('That player is not a possible defense.');
    if (targetId === playerId) this.enterOwnColor();
    else this.setDefender(targetId);
  }

  // Your own colour: attack a foreign colony in your home system, rebuild
  // an empty home planet, or discard it and draw again.
  enterOwnColor() {
    const aggr = this.enc.aggressorId;
    const home = this.planets.filter((pl) => pl.ownerId === aggr);
    this.enc.ownOptions = {
      attack: home.filter((pl) => Object.keys(pl.ships).some((id) => id !== aggr)).map((pl) => pl.id),
      restore: this.colonyShips(aggr) > 0 ? home.filter((pl) => !(pl.ships[aggr] > 0)).map((pl) => pl.id) : [],
    };
    this.enc.step = 'OWN_COLOR';
    this.armDeadline();
  }

  ownColorChoice(playerId, choice) {
    const p = this.assertStep('DESTINY', 'OWN_COLOR', playerId, 'offense');
    const opts = this.enc.ownOptions;
    if (choice === 'redraw') {
      this.addLog('DESTINY_REDRAW', { name: p.nickname });
      this.enc.destiny = null;
      this.enc.ownOptions = null;
      this.enc.step = 'DRAW';
      this.drawDestiny(playerId);
      return;
    }
    if (choice === 'attack' && opts.attack.length) {
      this.enc.launchMode = 'own';
    } else if (choice === 'restore' && opts.restore.length) {
      this.enc.launchMode = 'restore';
    } else {
      throw new CosmicError('That option is not possible now.');
    }
    this.enc.phase = 'LAUNCH';
    this.enc.step = 'TARGET';
    this.armDeadline();
  }

  setDefender(defenderId) {
    this.enc.defenderId = defenderId;
    this.enc.launchMode = 'normal';
    this.enc.phase = 'LAUNCH';
    this.enc.step = 'TARGET';
    this.addLog('DEFENSE_CHOSEN', { name: this.getPlayer(defenderId).nickname });
    this.armDeadline();
  }

  // --- 4. launch -----------------------------------------------------------

  launch(playerId, { planetId, defenderId, ships } = {}) {
    const p = this.assertStep('LAUNCH', 'TARGET', playerId, 'offense');
    const enc = this.enc;
    const pl = this.planet(planetId);
    if (!pl) throw new CosmicError('Aim the hyperspace gate at a planet.');
    if (enc.launchMode === 'normal') {
      if (pl.ownerId !== enc.defenderId) throw new CosmicError('The target must be a planet in the defense\'s home system.');
    } else if (enc.launchMode === 'own') {
      if (!enc.ownOptions.attack.includes(planetId)) throw new CosmicError('Choose one of your planets with a foreign colony.');
      if (!defenderId || defenderId === playerId || !(pl.ships[defenderId] > 0)) throw new CosmicError('Choose whose colony you are attacking.');
      enc.defenderId = defenderId;
    } else if (enc.launchMode === 'restore') {
      if (!enc.ownOptions.restore.includes(planetId)) throw new CosmicError('Choose one of your empty home planets.');
    }

    const preloaded = sumMap(enc.gate[playerId]);
    const limit = this.sendLimit(playerId);
    const hasSelection = ships && Object.values(ships).some((n) => Number(n) > 0);
    if (preloaded >= limit && hasSelection) throw new CosmicError(limit === 1 ? 'You can only send one ship.' : `You can send at most ${limit} ships.`);
    if (!(preloaded > 0 && !hasSelection)) {
      const origins = this.takeSelection(playerId, ships, limit - preloaded);
      enc.gate[playerId] = mergeInto(enc.gate[playerId] || {}, origins);
    }
    enc.targetPlanetId = planetId;
    const count = sumMap(enc.gate[playerId]);
    this.addLog('LAUNCHED', {
      name: p.nickname, planet: planetId, count, defense: enc.defenderId ? this.getPlayer(enc.defenderId).nickname : null,
    });

    if (enc.launchMode === 'restore') {
      this.addShips(playerId, planetId, count);
      delete enc.gate[playerId];
      enc.success = true;
      enc.outcome = { type: 'restore' };
      this.addLog('HOME_RESTORED', { name: p.nickname, planet: planetId });
      enc.phase = 'RESOLUTION';
      this.afterEncounter();
      return;
    }
    enc.phase = 'ALLIANCE';
    enc.step = 'INVITE_OFFENSE';
    this.armDeadline();
  }

  // --- 5. alliance -----------------------------------------------------------

  useMind(playerId, targetId) {
    const p = this.assertStep('ALLIANCE', 'INVITE_OFFENSE', playerId);
    if (!this.powerActive(playerId, 'mind')) throw new CosmicError('You do not have that power.');
    if (this.enc.mindSeen[playerId]) throw new CosmicError('You have already used your power this encounter.');
    const mains = this.mainIds();
    if (!mains.includes(targetId)) throw new CosmicError('Choose the offense or the defense.');
    if (mains.includes(playerId) && targetId === playerId) throw new CosmicError('As a main player you look at your opponent\'s hand.');
    this.enc.mindSeen[playerId] = targetId;
    this.addLog('POWER_MIND', { name: p.nickname, target: this.getPlayer(targetId).nickname });
  }

  invite(playerId, ids) {
    const enc = this.enc;
    this.assertPlay();
    if (enc.phase !== 'ALLIANCE') throw new CosmicError('Allies are not being invited now.');
    const step = enc.step;
    if (step === 'INVITE_OFFENSE' && playerId !== enc.aggressorId) throw new CosmicError('The offense invites allies first.');
    if (step === 'INVITE_DEFENSE' && playerId !== enc.defenderId) throw new CosmicError('The defense is inviting allies now.');
    if (step !== 'INVITE_OFFENSE' && step !== 'INVITE_DEFENSE') throw new CosmicError('Invitations are closed.');
    const allowed = this.players.filter((x) => !this.mainIds().includes(x.id) && !x.left).map((x) => x.id);
    const list = [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => allowed.includes(id));
    const p = this.getPlayer(playerId);
    if (step === 'INVITE_OFFENSE') {
      enc.invites.offense = list;
      enc.step = 'INVITE_DEFENSE';
      this.addLog('INVITED', { name: p.nickname, side: 'offense', names: list.map((id) => this.getPlayer(id).nickname) });
      this.armDeadline();
      return;
    }
    enc.invites.defense = list;
    this.addLog('INVITED', { name: p.nickname, side: 'defense', names: list.map((id) => this.getPlayer(id).nickname) });
    // Invited players answer in turn order, starting left of the offense.
    const start = this.order.indexOf(enc.aggressorId);
    const seats = this.order.map((_, i) => this.order[(start + 1 + i) % this.order.length]);
    enc.acceptOrder = seats.filter((id) => {
      const x = this.getPlayer(id);
      if (!x || x.left || this.mainIds().includes(id)) return false;
      if (this.colonyShips(id) < 1) return false;
      return enc.invites.offense.includes(id) || enc.invites.defense.includes(id) || this.powerActive(id, 'parasite');
    });
    enc.acceptIndex = 0;
    if (enc.acceptOrder.length) {
      enc.step = 'ACCEPT';
      this.armDeadline();
    } else {
      this.enterPlanning();
    }
  }

  allianceChoices(playerId) {
    const enc = this.enc;
    const parasite = this.powerActive(playerId, 'parasite');
    return {
      offense: enc.invites.offense?.includes(playerId) || parasite,
      defense: enc.invites.defense?.includes(playerId) || parasite,
    };
  }

  respondAlliance(playerId, { side, ships } = {}) {
    const p = this.assertStep('ALLIANCE', 'ACCEPT', playerId);
    const enc = this.enc;
    if (enc.acceptOrder[enc.acceptIndex] !== playerId) throw new CosmicError('It is not your turn to answer.');
    if (side === 'offense' || side === 'defense') {
      const choices = this.allianceChoices(playerId);
      if (!choices[side]) throw new CosmicError('You were not invited to that side.');
      const invited = side === 'offense' ? enc.invites.offense.includes(playerId) : enc.invites.defense.includes(playerId);
      const origins = this.takeSelection(playerId, ships, this.sendLimit(playerId));
      (side === 'offense' ? enc.gate : enc.defense)[playerId] = origins;
      enc.allies[playerId] = side;
      this.addLog('ALLY_JOINED', {
        name: p.nickname, side, count: sumMap(origins), parasite: !invited,
      });
    } else {
      this.addLog('ALLY_DECLINED', { name: p.nickname });
    }
    enc.acceptIndex += 1;
    if (enc.acceptIndex >= enc.acceptOrder.length) this.enterPlanning();
    else this.armDeadline();
  }

  // --- 6. planning -------------------------------------------------------------

  enterPlanning() {
    const enc = this.enc;
    enc.phase = 'PLANNING';
    enc.step = null;
    if (!this.checkHandsBeforePlanning()) return;
    enc.powerQueue = [];
    this.mainIds().forEach((id) => {
      if (this.powerActive(id, 'trader')) enc.powerQueue.push({ playerId: id, power: 'trader' });
      if (this.powerActive(id, 'oracle')) enc.powerQueue.push({ playerId: id, power: 'oracle' });
    });
    enc.step = enc.powerQueue.length ? 'POWERS' : 'SELECT';
    this.armDeadline();
  }

  // The defense without encounter cards shows the hand and draws anew;
  // the offense without them loses the rest of the turn.
  checkHandsBeforePlanning() {
    const enc = this.enc;
    const def = this.getPlayer(enc.defenderId);
    if (!this.hasEncounterCard(def.id)) {
      this.addLog('DEFENSE_REDRAW', { name: def.nickname, cards: def.hand.map((uid) => this.cardView(uid)) });
      this.refillForEncounter(def.id);
    }
    if (!this.hasEncounterCard(enc.aggressorId)) {
      this.addLog('OFFENSE_OUT_OF_CARDS', { name: this.getPlayer(enc.aggressorId).nickname });
      this.returnAllShips();
      this.endTurn();
      return false;
    }
    return true;
  }

  usePower(playerId, { power, use } = {}) {
    const p = this.assertStep('PLANNING', 'POWERS', playerId);
    const head = this.enc.powerQueue[0];
    if (!head || head.playerId !== playerId || head.power !== power) throw new CosmicError('It is not your power\'s moment.');
    if (use && this.powerActive(playerId, power)) {
      const opp = this.getPlayer(this.opponentOf(playerId));
      if (power === 'trader') {
        [p.hand, opp.hand] = [opp.hand, p.hand];
        this.addLog('POWER_TRADER', { name: p.nickname, target: opp.nickname });
      } else if (power === 'oracle') {
        this.enc.oracleId = playerId;
        this.addLog('POWER_ORACLE', { name: p.nickname, target: opp.nickname });
      }
    }
    this.enc.powerQueue.shift();
    if (this.enc.powerQueue.length) {
      this.armDeadline();
      return;
    }
    if (!this.checkHandsBeforePlanning()) return;
    this.enc.step = 'SELECT';
    this.armDeadline();
  }

  selectCard(playerId, uid) {
    const p = this.assertStep('PLANNING', 'SELECT', playerId);
    const enc = this.enc;
    const side = this.mainIds().includes(playerId) ? (playerId === enc.aggressorId ? 'offense' : 'defense') : null;
    if (!side) throw new CosmicError('Only the offense and the defense play encounter cards.');
    if (enc.cards[side]) throw new CosmicError('You have already chosen your card.');
    if (!p.hand.includes(uid) || !isEncounter(this.def(uid))) throw new CosmicError('Choose an encounter card from your hand.');
    const other = side === 'offense' ? 'defense' : 'offense';
    if (enc.oracleId === playerId && !enc.cards[other]) throw new CosmicError('The Oracle chooses after the opponent\'s card is shown.');
    this.takeFromHand(p, uid);
    enc.cards[side] = uid;
    this.addLog('CARD_SELECTED', { name: p.nickname });
    if (enc.cards.offense && enc.cards.defense) this.enterReveal();
    else this.armDeadline();
  }

  // --- 7. reveal --------------------------------------------------------------------

  enterReveal() {
    const enc = this.enc;
    enc.phase = 'REVEAL';
    enc.step = 'WINDOW';
    enc.revealed = true;
    enc.passes = {};
    this.addLog('CARDS_REVEALED', { offense: this.cardView(enc.cards.offense), defense: this.cardView(enc.cards.defense) });
    this.armDeadline();
  }

  effectiveCards() {
    const enc = this.enc;
    const o = this.def(enc.cards.offense);
    const d = this.def(enc.cards.defense);
    let off = { type: o.type, value: o.value || 0 };
    let dfn = { type: d.type, value: d.value || 0 };
    if (off.type === 'morph' && dfn.type === 'morph') {
      off = { type: 'attack', value: 0 };
      dfn = { type: 'attack', value: 0 };
    } else if (off.type === 'morph') {
      off = { ...dfn, morph: true };
    } else if (dfn.type === 'morph') {
      dfn = { ...off, morph: true };
    }
    if (this.effectActive('emotionControl')) {
      if (off.type === 'attack') off = { ...off, type: 'negotiate', controlled: true };
      if (dfn.type === 'attack') dfn = { ...dfn, type: 'negotiate', controlled: true };
    }
    return { offense: off, defense: dfn };
  }

  totals(effective = this.effectiveCards()) {
    const enc = this.enc;
    const reinf = (side) => enc.reinforcements.filter((r) => r.side === side).reduce((s, r) => s + r.value, 0);
    const warrior = (id) => (this.powerActive(id, 'warrior') ? this.getPlayer(id).tokens : 0);
    const offShips = Object.entries(enc.gate).reduce((s, [id, map]) => s + this.shipValue(id, sumMap(map)), 0);
    const defShips = this.shipValue(enc.defenderId, this.shipsOn(enc.defenderId, enc.targetPlanetId))
      + Object.entries(enc.defense).reduce((s, [id, map]) => s + this.shipValue(id, sumMap(map)), 0);
    const offense = {
      card: effective.offense.value, ships: offShips, reinforcements: reinf('offense'), tokens: warrior(enc.aggressorId),
    };
    const defense = {
      card: effective.defense.value, ships: defShips, reinforcements: reinf('defense'), tokens: warrior(enc.defenderId),
    };
    offense.total = offense.card + offense.ships + offense.reinforcements + offense.tokens;
    defense.total = defense.card + defense.ships + defense.reinforcements + defense.tokens;
    return { offense, defense };
  }

  playReinforcement(playerId, uid, side) {
    const p = this.assertStep('REVEAL', 'WINDOW', playerId);
    if (!this.involvedIds().includes(playerId)) throw new CosmicError('Only players in the encounter play reinforcements.');
    if (side !== 'offense' && side !== 'defense') throw new CosmicError('Choose which side to reinforce.');
    const d = this.def(uid);
    if (!p.hand.includes(uid) || d?.type !== 'reinforcement') throw new CosmicError('Choose a reinforcement card from your hand.');
    this.takeFromHand(p, uid);
    this.enc.reinforcements.push({
      uid, playerId, side, value: d.value,
    });
    this.enc.passes = {};
    this.phaseEndsAt = Math.max(this.phaseEndsAt || 0, Date.now() + 10000);
    this.addLog('REINFORCED', { name: p.nickname, side, value: d.value });
  }

  pass(playerId) {
    this.assertPlay();
    const enc = this.enc;
    if (enc.phase === 'REVEAL' && enc.step === 'WINDOW') {
      if (!this.involvedIds().includes(playerId)) throw new CosmicError('You are not in this encounter.');
      enc.passes[playerId] = true;
      const waiting = this.involvedIds().filter((id) => !enc.passes[id] && !this.getPlayer(id).left);
      if (!waiting.length) this.resolveEncounter();
      return;
    }
    if (enc.phase === 'RESOLUTION' && enc.step === 'QUASH') {
      enc.passes[playerId] = true;
      const waiting = this.players.filter((x) => !x.left && !enc.passes[x.id]);
      if (!waiting.length) this.executeDeal();
      return;
    }
    throw new CosmicError('There is nothing to pass on now.');
  }

  // --- 8. resolution ----------------------------------------------------------------------

  resolveEncounter() {
    const enc = this.enc;
    const eff = this.effectiveCards();
    enc.phase = 'RESOLUTION';
    enc.step = null;
    const aggr = enc.aggressorId;
    const def = enc.defenderId;
    this.getPlayer(aggr).stats.encounters += 1;
    this.getPlayer(def).stats.encounters += 1;

    if (eff.offense.type === 'negotiate' && eff.defense.type === 'negotiate') {
      this.returnAllies();
      enc.outcome = { type: 'deal', effective: eff };
      enc.step = 'DEAL';
      enc.deal = { proposal: null, seq: 0 };
      this.addLog('NEGOTIATION_STARTED', {});
      this.armDeadline();
      return;
    }

    let winner;
    let totals = null;
    if (eff.offense.type === 'attack' && eff.defense.type === 'attack') {
      totals = this.totals(eff);
      winner = totals.offense.total > totals.defense.total ? 'offense' : 'defense';
    } else {
      winner = eff.offense.type === 'attack' ? 'offense' : 'defense';
    }
    const ionic = this.effectActive('ionicGas');
    enc.outcome = { type: winner, effective: eff, totals };
    const planetId = enc.targetPlanetId;

    if (winner === 'offense') {
      const defShips = this.shipsOn(def, planetId);
      if (defShips) this.removeShips(def, planetId, defShips);
      const defLost = this.sendToWarp(def, defShips, { [planetId]: defShips });
      Object.entries(enc.defense).forEach(([id, origins]) => this.sendToWarp(id, sumMap(origins), origins));
      enc.defense = {};
      Object.entries(enc.gate).forEach(([id, origins]) => {
        const n = sumMap(origins);
        const had = this.shipsOn(id, planetId) > 0;
        this.addShips(id, planetId, n);
        this.addLog(had ? 'COLONY_REINFORCED' : 'COLONY_CREATED', { name: this.getPlayer(id).nickname, planet: planetId, count: n });
      });
      enc.gate = {};
      enc.success = true;
      this.getPlayer(aggr).stats.wins += 1;
      this.addLog('OFFENSE_WON', { name: this.getPlayer(aggr).nickname, totals: totals && { offense: totals.offense.total, defense: totals.defense.total } });
      if (eff.defense.type === 'negotiate' && !ionic) this.compensate(def, aggr, defLost * this.rewardMultiplier(def));
    } else {
      let aggrLost = 0;
      Object.entries(enc.gate).forEach(([id, origins]) => {
        const lost = this.sendToWarp(id, sumMap(origins), origins);
        if (id === aggr) aggrLost = lost;
      });
      enc.gate = {};
      enc.success = false;
      this.getPlayer(def).stats.wins += 1;
      this.addLog('DEFENSE_WON', { name: this.getPlayer(def).nickname, totals: totals && { offense: totals.offense.total, defense: totals.defense.total } });
      if (eff.offense.type === 'negotiate' && !ionic) this.compensate(aggr, def, aggrLost * this.rewardMultiplier(aggr));
      const rewards = {};
      if (!ionic) {
        Object.entries(enc.defense).forEach(([id, origins]) => { rewards[id] = sumMap(origins) * this.rewardMultiplier(id); });
      }
      if (Object.keys(rewards).length) {
        enc.rewards = rewards;
        enc.step = 'REWARDS';
        if (this.checkVictory()) return;
        this.armDeadline();
        return;
      }
      Object.entries(enc.defense).forEach(([id, origins]) => this.returnShips(id, origins));
      enc.defense = {};
    }
    if (this.checkVictory()) return;
    this.afterEncounter();
  }

  // The loser who negotiated takes random cards from the winner: one for
  // each of their ships sent to the warp.
  compensate(loserId, winnerId, count) {
    const loser = this.getPlayer(loserId);
    const winner = this.getPlayer(winnerId);
    const n = Math.min(count, winner.hand.length);
    const taken = [];
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(Math.random() * winner.hand.length);
      taken.push(winner.hand.splice(idx, 1)[0]);
    }
    loser.hand.push(...taken);
    this.addLog('COMPENSATION', { name: loser.nickname, from: winner.nickname, count: n });
    if (n) this.addLog('COMPENSATION_CARDS', { name: loser.nickname, from: winner.nickname, cards: taken.map((uid) => this.cardView(uid)) }, [loserId, winnerId]);
  }

  claimRewards(playerId, cards) {
    const p = this.assertStep('RESOLUTION', 'REWARDS', playerId);
    const enc = this.enc;
    const total = enc.rewards?.[playerId];
    if (total === undefined) throw new CosmicError('You have no defensive rewards to collect.');
    const k = clampInt(cards, 0, total, total);
    this.drawCards(playerId, k);
    const freed = Math.min(total - k, this.warp[playerId] || 0);
    for (let i = 0; i < freed; i += 1) {
      this.warp[playerId] -= 1;
      const best = this.bestColony(playerId);
      const origins = enc.defense[playerId] || {};
      this.addShips(playerId, best ? best.id : Object.keys(origins)[0], 1);
    }
    if (enc.defense[playerId]) this.returnShips(playerId, enc.defense[playerId]);
    delete enc.defense[playerId];
    delete enc.rewards[playerId];
    this.addLog('REWARDS_TAKEN', { name: p.nickname, cards: k, ships: freed });
    if (Object.keys(enc.rewards).length) return;
    enc.rewards = null;
    this.afterEncounter();
  }

  // --- deals -----------------------------------------------------------------------

  proposeDeal(playerId, terms = {}) {
    const p = this.assertStep('RESOLUTION', 'DEAL', playerId);
    if (!this.mainIds().includes(playerId)) throw new CosmicError('Only the offense and the defense make the deal.');
    const other = this.getPlayer(this.opponentOf(playerId));
    const give = [...new Set(Array.isArray(terms.give) ? terms.give : [])].slice(0, 20);
    give.forEach((uid) => { if (!p.hand.includes(uid)) throw new CosmicError('You can only offer cards from your hand.'); });
    const take = clampInt(terms.take, 0, Math.min(10, other.hand.length), 0);
    const colonyMe = terms.colonyMe || null;
    const colonyOther = terms.colonyOther || null;
    if (colonyMe) {
      if (!(this.shipsOn(other.id, colonyMe) > 0)) throw new CosmicError('You can only colonize a planet where your opponent has a colony.');
      if (this.shipsOn(playerId, colonyMe) > 0) throw new CosmicError('You already have a colony there.');
    }
    if (colonyOther) {
      if (!(this.shipsOn(playerId, colonyOther) > 0)) throw new CosmicError('You can only let them colonize a planet where you have a colony.');
      if (this.shipsOn(other.id, colonyOther) > 0) throw new CosmicError('They already have a colony there.');
    }
    const shipsMe = clampInt(terms.shipsMe, 1, MAX_SHIPS_SENT, 1);
    const shipsOther = clampInt(terms.shipsOther, 1, MAX_SHIPS_SENT, 1);
    if (!give.length && !take && !colonyMe && !colonyOther) throw new CosmicError('A deal must move at least one card or make a colony.');
    this.enc.deal.seq += 1;
    this.enc.deal.proposal = {
      id: this.enc.deal.seq, by: playerId, give, take, colonyMe, colonyOther, shipsMe, shipsOther,
    };
    this.addLog('DEAL_PROPOSED', { name: p.nickname });
  }

  acceptDeal(playerId, proposalId) {
    const p = this.assertStep('RESOLUTION', 'DEAL', playerId);
    const proposal = this.enc.deal.proposal;
    if (!proposal || proposal.id !== proposalId) throw new CosmicError('That offer is no longer on the table.');
    if (!this.mainIds().includes(playerId) || proposal.by === playerId) throw new CosmicError('Only the other side accepts the offer.');
    const by = this.getPlayer(proposal.by);
    if (!proposal.give.every((uid) => by.hand.includes(uid))) throw new CosmicError('The offered cards are no longer in their hand.');
    this.enc.step = 'QUASH';
    this.enc.passes = {};
    this.addLog('DEAL_AGREED', { name: p.nickname, by: by.nickname });
    this.armDeadline();
  }

  executeDeal() {
    const enc = this.enc;
    const t = enc.deal.proposal;
    const by = this.getPlayer(t.by);
    const other = this.getPlayer(this.opponentOf(t.by));
    // The exchange is simultaneous: random cards come from the other
    // side's own hand, never from the cards just handed over.
    const given = t.give.filter((uid) => by.hand.includes(uid));
    const taken = [];
    for (let i = 0; i < Math.min(t.take, other.hand.length); i += 1) {
      const idx = Math.floor(Math.random() * other.hand.length);
      taken.push(other.hand.splice(idx, 1)[0]);
    }
    given.forEach((uid) => { this.takeFromHand(by, uid); other.hand.push(uid); });
    by.hand.push(...taken);
    const colonies = [];
    if (t.colonyMe && this.colonizeByDeal(by.id, t.colonyMe, t.shipsMe)) colonies.push({ name: by.nickname, planet: t.colonyMe });
    if (t.colonyOther && this.colonizeByDeal(other.id, t.colonyOther, t.shipsOther)) colonies.push({ name: other.nickname, planet: t.colonyOther });
    if (!given.length && !taken.length && !colonies.length) {
      this.failDeal('empty');
      return;
    }
    this.addLog('DEAL_DONE', {
      by: by.nickname, other: other.nickname, give: given.length, take: taken.length, colonies,
    });
    if (given.length || taken.length) {
      this.addLog('DEAL_CARDS', {
        by: by.nickname, other: other.nickname, give: given.map((uid) => this.cardView(uid)), take: taken.map((uid) => this.cardView(uid)),
      }, [by.id, other.id]);
    }
    this.returnAllShips();
    enc.success = true;
    enc.outcome = { ...enc.outcome, type: 'deal', done: true };
    if (this.checkVictory()) return;
    this.afterEncounter();
  }

  // Deal colonies: the offense lands its gate ships; anyone else sends up
  // to four ships from their colonies.
  colonizeByDeal(playerId, planetId, count) {
    if (this.shipsOn(playerId, planetId) > 0) return false;
    let origins;
    const gate = this.enc.gate[playerId];
    if (gate && sumMap(gate)) {
      origins = gate;
      delete this.enc.gate[playerId];
    } else {
      const pick = this.autoSelection(playerId, count);
      Object.entries(pick).forEach(([from, n]) => this.removeShips(playerId, from, n));
      origins = pick;
    }
    const n = sumMap(origins);
    if (!n) return false;
    this.addShips(playerId, planetId, n);
    this.addLog('COLONY_CREATED', { name: this.getPlayer(playerId).nickname, planet: planetId, count: n });
    return true;
  }

  failDeal(reason) {
    const enc = this.enc;
    this.addLog('DEAL_FAILED', { reason });
    this.mainIds().forEach((id) => {
      const lost = this.loseShips(id, FAILED_DEAL_SHIPS);
      this.addLog('SHIPS_LOST', { name: this.getPlayer(id).nickname, count: lost });
    });
    this.returnAllShips();
    enc.success = false;
    enc.outcome = { ...enc.outcome, type: 'deal', done: false };
    this.afterEncounter();
  }

  // --- end of an encounter ------------------------------------------------------------

  afterEncounter() {
    const enc = this.enc;
    enc.phase = 'RESOLUTION';
    enc.cloneQueue = ['offense', 'defense']
      .map((side) => ({ side, playerId: side === 'offense' ? enc.aggressorId : enc.defenderId }))
      .filter(({ side, playerId }) => playerId && enc.cards[side] && this.powerActive(playerId, 'clone'));
    if (enc.cloneQueue.length) {
      enc.step = 'CLONE';
      this.armDeadline();
      return;
    }
    this.discardEncounterCards();
  }

  cloneChoice(playerId, keep) {
    const p = this.assertStep('RESOLUTION', 'CLONE', playerId);
    const head = this.enc.cloneQueue[0];
    if (!head || head.playerId !== playerId) throw new CosmicError('It is not your choice now.');
    if (keep) {
      p.hand.push(this.enc.cards[head.side]);
      this.enc.cloneKept[head.side] = true;
      this.addLog('POWER_CLONE', { name: p.nickname });
    }
    this.enc.cloneQueue.shift();
    if (this.enc.cloneQueue.length) {
      this.armDeadline();
      return;
    }
    this.discardEncounterCards();
  }

  discardEncounterCards() {
    const enc = this.enc;
    enc.discarded = [];
    ['offense', 'defense'].forEach((side) => {
      const uid = enc.cards[side];
      if (uid && !enc.cloneKept[side]) {
        this.cosmicDiscard.push(uid);
        enc.discarded.push(uid);
      }
    });
    enc.reinforcements.forEach((r) => this.cosmicDiscard.push(r.uid));
    const fido = this.players.find((x) => !x.left && this.powerActive(x.id, 'fido'));
    if (fido && enc.discarded.length) {
      enc.fetch = { fidoId: fido.id, stage: 'CHOOSE' };
      enc.step = 'FETCH';
      this.armDeadline();
      return;
    }
    this.wrapUpEncounter();
  }

  fetch(playerId, { cardUid, targetId, reward } = {}) {
    const p = this.assertStep('RESOLUTION', 'FETCH', playerId);
    const enc = this.enc;
    if (enc.fetch.fidoId !== playerId) throw new CosmicError('Only Fido fetches cards.');
    if (!cardUid) {
      this.wrapUpEncounter();
      return;
    }
    if (!enc.discarded.includes(cardUid) || !this.cosmicDiscard.includes(cardUid)) throw new CosmicError('Fetch one of the encounter cards just discarded.');
    const target = this.getPlayer(targetId);
    if (!target || target.id === playerId || target.left) throw new CosmicError('Offer the card to another player.');
    if (reward !== 'ship' && reward !== 'card') throw new CosmicError('Choose your reward: a ship or a card.');
    this.cosmicDiscard.splice(this.cosmicDiscard.indexOf(cardUid), 1);
    enc.fetch = {
      fidoId: playerId, stage: 'OFFER', cardUid, targetId, reward,
    };
    enc.step = 'FETCH_OFFER';
    this.addLog('POWER_FIDO_OFFER', { name: p.nickname, target: target.nickname, card: this.cardView(cardUid) });
    this.armDeadline();
  }

  fetchAnswer(playerId, accept) {
    const p = this.assertStep('RESOLUTION', 'FETCH_OFFER', playerId);
    const f = this.enc.fetch;
    if (f.targetId !== playerId) throw new CosmicError('The card was offered to someone else.');
    const fido = this.getPlayer(f.fidoId);
    if (accept) {
      p.hand.push(f.cardUid);
      if (f.reward === 'ship' && (this.warp[fido.id] || 0) > 0 && this.bestColony(fido.id)) {
        this.warp[fido.id] -= 1;
        this.addShips(fido.id, this.bestColony(fido.id).id, 1);
      } else {
        this.drawCards(fido.id, 1);
      }
      this.addLog('POWER_FIDO_ACCEPTED', { name: p.nickname, fido: fido.nickname, reward: f.reward });
    } else {
      fido.hand.push(f.cardUid);
      this.addLog('POWER_FIDO_DECLINED', { name: p.nickname, fido: fido.nickname });
    }
    this.wrapUpEncounter();
  }

  wrapUpEncounter() {
    const enc = this.enc;
    // Warrior: one token after an encounter won as a main player, two after a loss.
    this.mainIds().forEach((id) => {
      if (!this.powerActive(id, 'warrior') || !enc.outcome || enc.outcome.type === 'restore') return;
      const side = id === enc.aggressorId ? 'offense' : 'defense';
      const won = enc.outcome.type === 'deal' ? !!enc.outcome.done : enc.outcome.type === side;
      const add = won ? 1 : 2;
      this.getPlayer(id).tokens += add;
      this.addLog('POWER_WARRIOR', { name: this.getPlayer(id).nickname, count: add });
    });
    this.returnAllShips();
    enc.fetch = null;
    if (this.phase !== PHASES.PLAY) return;
    const aggr = this.getPlayer(enc.aggressorId);
    const hasCard = this.hasEncounterCard(aggr.id);
    const machine = this.powerActive(aggr.id, 'machine');
    const again = !aggr.left && hasCard && ((enc.number === 1 && enc.success) || (machine && enc.number >= 2));
    if (again) {
      enc.step = 'NEXT';
      this.armDeadline();
      return;
    }
    this.endTurn();
  }

  continueTurn(playerId, again) {
    const p = this.assertStep('RESOLUTION', 'NEXT', playerId, 'offense');
    if (again) {
      if (!this.hasEncounterCard(playerId)) throw new CosmicError('You need an encounter card for another encounter.');
      const number = this.enc.number + 1;
      this.addLog('ANOTHER_ENCOUNTER', { name: p.nickname, number });
      this.newEncounter(number, 'REGROUP');
      return;
    }
    this.endTurn();
  }

  endTurn() {
    const active = this.order.filter((id) => !this.getPlayer(id).left);
    if (!active.length) {
      this.phaseEndsAt = null;
      return;
    }
    for (let i = 1; i <= this.order.length; i += 1) {
      const next = (this.turnIndex + i) % this.order.length;
      if (!this.getPlayer(this.order[next]).left) {
        this.turnIndex = next;
        break;
      }
    }
    this.turnCount = (this.turnCount || 0) + 1;
    this.newEncounter(1, 'START');
  }

  checkVictory() {
    const winners = this.players.filter((p) => this.foreignColonies(p.id) >= WIN_COLONIES);
    if (!winners.length) return false;
    this.endGame(winners);
    return true;
  }

  endGame(winners) {
    const ids = winners.map((p) => p.id);
    const standings = this.players.map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      color: p.color,
      alienId: p.alienId,
      foreignColonies: this.foreignColonies(p.id),
      homeColonies: this.homeColonies(p.id),
      warp: this.warp[p.id] || 0,
      encounters: p.stats.encounters,
      wins: p.stats.wins,
      winner: ids.includes(p.id),
    }));
    standings.sort((a, b) => (b.winner - a.winner) || (b.foreignColonies - a.foreignColonies) || (a.warp - b.warp));
    this.results = { winnerIds: ids, standings };
    this.phase = PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.endedAt = Date.now();
    this.addLog('GAME_OVER', { names: winners.map((p) => p.nickname) });
  }

  // --- artifacts -----------------------------------------------------------------------

  playArtifact(playerId, uid, payload = {}) {
    this.assertPlay();
    const p = this.getPlayer(playerId);
    if (!p) throw new CosmicError('Player not found.');
    const d = this.def(uid);
    if (!p.hand.includes(uid) || d?.type !== 'artifact') throw new CosmicError('Choose an artifact card from your hand.');
    const enc = this.enc;
    const a = d.artifact;
    let target = null;
    const finish = () => {
      this.takeFromHand(p, uid);
      this.cosmicDiscard.push(uid);
    };

    switch (a) {
      case 'cosmicZap': {
        target = this.getPlayer(payload.targetId);
        if (!target || !target.alienId) throw new CosmicError('Choose a player whose power to zap.');
        finish();
        enc.frozen[target.id] = true;
        enc.effects.push({ kind: a, by: playerId, target: target.id });
        break;
      }
      case 'cardZap': {
        const last = [...enc.effects].reverse().find((e) => !e.zapped && ARTIFACT_LASTING.includes(e.kind));
        if (!last) throw new CosmicError('There is no artifact effect to cancel.');
        finish();
        last.zapped = true;
        if (last.kind === 'cosmicZap' && !enc.effects.some((e) => e.kind === 'cosmicZap' && !e.zapped && e.target === last.target)) {
          delete enc.frozen[last.target];
        }
        target = last.target ? this.getPlayer(last.target) : null;
        this.addLog('ARTIFACT_CANCELLED', { name: p.nickname, artifact: last.kind });
        break;
      }
      case 'mobiusTubes': {
        if (enc.phase !== 'REGROUP' || playerId !== enc.aggressorId) throw new CosmicError('Mobius Tubes are played by the offense in the regroup phase.');
        finish();
        this.players.forEach((x) => {
          const n = this.warp[x.id] || 0;
          if (!n) return;
          this.warp[x.id] = 0;
          // Only the offense may hold ships on the gate (as when regrouping
          // without a colony); anyone else lands them back home.
          if (!this.bestColony(x.id) && x.id === enc.aggressorId) {
            enc.gate[x.id] = mergeInto(enc.gate[x.id] || {}, { gate: n });
          } else {
            this.returnShips(x.id, { warp: n });
          }
        });
        break;
      }
      case 'plague': {
        if (enc.phase !== 'START') throw new CosmicError('Plague is played at the start of a turn.');
        target = this.getPlayer(payload.targetId);
        if (!target || target.left) throw new CosmicError('Choose a player to infect.');
        finish();
        const lost = this.loseShips(target.id, 3);
        const dropped = [];
        CARD_TYPES.forEach((type) => {
          const card = target.hand.find((u) => this.def(u)?.type === type);
          if (card) {
            this.takeFromHand(target, card);
            this.cosmicDiscard.push(card);
            dropped.push(this.cardView(card));
          }
        });
        this.addLog('PLAGUE', { target: target.nickname, ships: lost, cards: dropped });
        break;
      }
      case 'forceField': {
        if (enc.phase !== 'PLANNING' || !Object.keys(enc.allies).length) throw new CosmicError('Force Field is played after alliances are formed.');
        const ids = Array.isArray(payload.targetIds) && payload.targetIds.length
          ? payload.targetIds.filter((id) => enc.allies[id])
          : Object.keys(enc.allies);
        if (!ids.length) throw new CosmicError('Choose which alliances to cancel.');
        finish();
        this.returnAllies(ids);
        this.addLog('FORCE_FIELD', { names: ids.map((id) => this.getPlayer(id).nickname) });
        break;
      }
      case 'emotionControl':
      case 'ionicGas': {
        if (enc.phase !== 'REVEAL' || enc.step !== 'WINDOW') throw new CosmicError('This artifact is played after the cards are revealed.');
        finish();
        enc.effects.push({ kind: a, by: playerId });
        break;
      }
      case 'quash': {
        if (enc.phase !== 'RESOLUTION' || enc.step !== 'QUASH') throw new CosmicError('Quash is played right after a deal is made.');
        finish();
        this.addLog('ARTIFACT_PLAYED', { name: p.nickname, artifact: a, target: null });
        this.failDeal('quash');
        return;
      }
      default:
        throw new CosmicError('Unknown artifact.');
    }
    this.addLog('ARTIFACT_PLAYED', { name: p.nickname, artifact: a, target: target?.nickname || null });
    if (enc.phase === 'REVEAL' && enc.step === 'WINDOW') {
      enc.passes = {};
      this.phaseEndsAt = Math.max(this.phaseEndsAt || 0, Date.now() + 10000);
    }
  }

  // Which artifacts this player could play right now.
  playableArtifacts(playerId) {
    const p = this.getPlayer(playerId);
    const enc = this.enc;
    if (!p || this.phase !== PHASES.PLAY || !enc) return [];
    return p.hand.filter((uid) => {
      const d = this.def(uid);
      if (d?.type !== 'artifact') return false;
      switch (d.artifact) {
        case 'cosmicZap': return this.players.some((x) => x.alienId);
        case 'cardZap': return enc.effects.some((e) => !e.zapped && ARTIFACT_LASTING.includes(e.kind));
        case 'mobiusTubes': return enc.phase === 'REGROUP' && playerId === enc.aggressorId;
        case 'plague': return enc.phase === 'START';
        case 'forceField': return enc.phase === 'PLANNING' && Object.keys(enc.allies).length > 0;
        case 'emotionControl':
        case 'ionicGas': return enc.phase === 'REVEAL' && enc.step === 'WINDOW';
        case 'quash': return enc.phase === 'RESOLUTION' && enc.step === 'QUASH';
        default: return false;
      }
    });
  }

  // --- deadlines ---------------------------------------------------------------------------

  actorIds() {
    if (this.phase === PHASES.ALIENS) return this.players.filter((p) => !p.alienId).map((p) => p.id);
    if (this.phase !== PHASES.PLAY || !this.enc) return [];
    const enc = this.enc;
    switch (enc.phase) {
      case 'START':
      case 'REGROUP':
      case 'DESTINY':
      case 'LAUNCH':
        return [enc.aggressorId];
      case 'ALLIANCE':
        if (enc.step === 'INVITE_OFFENSE') return [enc.aggressorId];
        if (enc.step === 'INVITE_DEFENSE') return [enc.defenderId];
        return [enc.acceptOrder[enc.acceptIndex]].filter(Boolean);
      case 'PLANNING':
        if (enc.step === 'POWERS') return [enc.powerQueue[0]?.playerId].filter(Boolean);
        return ['offense', 'defense'].filter((s) => !enc.cards[s]).map((s) => (s === 'offense' ? enc.aggressorId : enc.defenderId));
      case 'REVEAL':
        return this.involvedIds().filter((id) => !enc.passes[id]);
      case 'RESOLUTION':
        if (enc.step === 'DEAL') return this.mainIds();
        if (enc.step === 'QUASH') return this.players.filter((p) => !enc.passes[p.id]).map((p) => p.id);
        if (enc.step === 'REWARDS') return Object.keys(enc.rewards || {});
        if (enc.step === 'CLONE') return [enc.cloneQueue[0]?.playerId].filter(Boolean);
        if (enc.step === 'FETCH') return [enc.fetch?.fidoId].filter(Boolean);
        if (enc.step === 'FETCH_OFFER') return [enc.fetch?.targetId].filter(Boolean);
        if (enc.step === 'NEXT') return [enc.aggressorId];
        return [];
      default:
        return [];
    }
  }

  // Steps with a clock of their own, whatever the table's turn timer.
  fixedWindowSec() {
    const enc = this.enc;
    if (this.phase !== PHASES.PLAY || !enc) return null;
    if (enc.phase === 'REVEAL' && enc.step === 'WINDOW') return REVEAL_WINDOW_SEC;
    if (enc.phase === 'RESOLUTION' && enc.step === 'DEAL') return DEAL_SEC;
    if (enc.phase === 'RESOLUTION' && enc.step === 'QUASH') return QUASH_WINDOW_SEC;
    if (enc.phase === 'RESOLUTION' && enc.step === 'REWARDS') return REWARD_SEC;
    return null;
  }

  armDeadline() {
    const fixed = this.fixedWindowSec();
    if (fixed) {
      const key = `${this.enc.number}:${this.enc.phase}:${this.enc.step}:${this.turnCount}`;
      if (this.enc.windowKey !== key) {
        this.enc.windowKey = key;
        this.phaseEndsAt = Date.now() + fixed * 1000;
      }
      return;
    }
    const actors = this.actorIds().map((id) => this.getPlayer(id)).filter(Boolean);
    if (!actors.length) {
      this.phaseEndsAt = null;
      return;
    }
    const away = actors.some((p) => !p.connected || p.left);
    let seconds = this.settings.turnSec;
    if (away) seconds = seconds ? Math.min(seconds, OFFLINE_GRACE_SEC) : OFFLINE_GRACE_SEC;
    this.phaseEndsAt = seconds ? Date.now() + seconds * 1000 : null;
  }

  shortenDeadlineFor(player) {
    if (!this.actorIds().includes(player.id)) return;
    const grace = Date.now() + OFFLINE_GRACE_SEC * 1000;
    this.phaseEndsAt = this.phaseEndsAt ? Math.min(this.phaseEndsAt, grace) : grace;
  }

  // The clock ran out: make the plainest legal choice for whoever the game
  // is waiting on, and keep going.
  onTimeout() {
    if (this.phase === PHASES.ALIENS) {
      this.players.filter((p) => !p.alienId).forEach((p) => this.chooseAlien(p.id, p.alienOptions[0]));
      return;
    }
    if (this.phase !== PHASES.PLAY || !this.enc) return;
    const enc = this.enc;
    const aggr = enc.aggressorId;
    switch (enc.phase) {
      case 'START': this.beginTurn(aggr); break;
      case 'REGROUP': this.regroup(aggr, this.bestColony(aggr)?.id || null); break;
      case 'DESTINY':
        if (enc.step === 'DRAW') this.drawDestiny(aggr);
        else if (enc.step === 'CHOOSE_PLAYER') this.chooseDefender(aggr, enc.candidates.find((id) => id !== aggr) || enc.candidates[0]);
        else if (enc.step === 'OWN_COLOR') {
          const o = enc.ownOptions;
          this.ownColorChoice(aggr, o.attack.length ? 'attack' : o.restore.length ? 'restore' : 'redraw');
        }
        break;
      case 'LAUNCH': {
        let planetId;
        let defenderId;
        if (enc.launchMode === 'normal') {
          const planets = this.planets.filter((pl) => pl.ownerId === enc.defenderId);
          planets.sort((a, b) => (a.ships[enc.defenderId] || 0) - (b.ships[enc.defenderId] || 0));
          planetId = planets[0].id;
        } else if (enc.launchMode === 'own') {
          [planetId] = enc.ownOptions.attack;
          defenderId = Object.keys(this.planet(planetId).ships).find((id) => id !== aggr);
        } else {
          [planetId] = enc.ownOptions.restore;
        }
        const preloaded = sumMap(enc.gate[aggr]);
        const want = Math.max(0, Math.min(this.sendLimit(aggr), 2) - preloaded);
        const ships = preloaded && !want ? {} : this.autoSelection(aggr, Math.max(want, preloaded ? 0 : 1));
        this.launch(aggr, { planetId, defenderId, ships });
        break;
      }
      case 'ALLIANCE':
        if (enc.step === 'INVITE_OFFENSE') this.invite(aggr, []);
        else if (enc.step === 'INVITE_DEFENSE') this.invite(enc.defenderId, []);
        else this.respondAlliance(enc.acceptOrder[enc.acceptIndex], { side: null });
        break;
      case 'PLANNING':
        if (enc.step === 'POWERS') {
          const head = enc.powerQueue[0];
          this.usePower(head.playerId, { power: head.power, use: false });
        } else {
          const order = ['offense', 'defense'];
          if (enc.oracleId === aggr) order.reverse();
          order.forEach((side) => {
            if (this.enc.phase !== 'PLANNING' || this.enc.cards[side]) return;
            const id = side === 'offense' ? this.enc.aggressorId : this.enc.defenderId;
            const options = this.getPlayer(id).hand.filter((u) => isEncounter(this.def(u)));
            this.selectCard(id, options[Math.floor(Math.random() * options.length)]);
          });
        }
        break;
      case 'REVEAL': this.resolveEncounter(); break;
      case 'RESOLUTION':
        if (enc.step === 'DEAL') this.failDeal('timeout');
        else if (enc.step === 'QUASH') this.executeDeal();
        else if (enc.step === 'REWARDS') Object.keys({ ...enc.rewards }).forEach((id) => { if (this.enc.rewards) this.claimRewards(id, this.enc.rewards[id]); });
        else if (enc.step === 'CLONE') this.cloneChoice(enc.cloneQueue[0].playerId, false);
        else if (enc.step === 'FETCH') this.fetch(enc.fetch.fidoId, {});
        else if (enc.step === 'FETCH_OFFER') this.fetchAnswer(enc.fetch.targetId, false);
        else if (enc.step === 'NEXT') this.continueTurn(aggr, false);
        break;
      default:
        break;
    }
  }

  // --- serialization ----------------------------------------------------------------------

  toJSON() {
    const {
      gameType, roomCode, hostId, settings, players, phase, planets, warp, cards, cardSeq, cosmicDeck, cosmicDiscard,
      destinyDeck, destinyDiscard, order, turnIndex, turnCount, enc, results, log, createdAt, startedAt, endedAt, phaseEndsAt,
    } = this;
    return {
      gameType, roomCode, hostId, settings, players, phase, planets, warp, cards, cardSeq, cosmicDeck, cosmicDiscard,
      destinyDeck, destinyDiscard, order, turnIndex, turnCount, enc, results, log, createdAt, startedAt, endedAt, phaseEndsAt,
    };
  }

  static fromJSON(data) {
    const game = new CosmicGame(data.roomCode, data.hostId, data.settings);
    [
      'players', 'phase', 'planets', 'warp', 'cards', 'cardSeq', 'cosmicDeck', 'cosmicDiscard', 'destinyDeck', 'destinyDiscard',
      'order', 'turnIndex', 'turnCount', 'enc', 'results', 'log', 'createdAt', 'startedAt', 'endedAt', 'phaseEndsAt',
    ].forEach((f) => { if (data[f] !== undefined) game[f] = data[f]; });
    game.players.forEach((p) => { p.connected = false; p.socketId = null; });
    return game;
  }

  // --- client payload ----------------------------------------------------------------------

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId);
    const enc = this.enc;
    const inPlay = this.phase === PHASES.PLAY && enc;
    const actors = this.actorIds();
    const over = this.phase === PHASES.GAME_OVER;

    const players = this.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      isGuest: !p.accountId,
      connected: p.connected,
      left: !!p.left,
      isHost: p.isHost,
      ready: p.ready,
      color: p.color,
      alienId: this.phase === PHASES.ALIENS && p.id !== viewerId ? null : p.alienId,
      hasChosenAlien: !!p.alienId,
      handCount: p.hand.length,
      warp: this.warp[p.id] || 0,
      foreignColonies: this.planets.length ? this.foreignColonies(p.id) : 0,
      homeColonies: this.planets.length ? this.homeColonies(p.id) : 0,
      powerActive: !!p.alienId && this.planets.length > 0 && this.homeColonies(p.id) >= HOME_COLONIES_FOR_POWER && !enc?.frozen?.[p.id],
      frozen: !!enc?.frozen?.[p.id],
      tokens: p.tokens,
      side: inPlay ? this.sideOf(p.id) : null,
      isCurrent: actors.includes(p.id),
      isYou: viewer ? p.id === viewer.id : false,
    }));

    let encounter = null;
    if (enc && (inPlay || over)) {
      const sideCard = (side) => {
        const uid = enc.cards[side];
        if (!uid) return null;
        const owner = side === 'offense' ? enc.aggressorId : enc.defenderId;
        const oracleShown = enc.oracleId && enc.oracleId !== owner;
        if (enc.revealed || oracleShown || owner === viewerId) return { ...this.cardView(uid), faceUp: !!(enc.revealed || oracleShown) };
        return { hidden: true };
      };
      const counts = (map) => Object.fromEntries(Object.entries(map).map(([id, o]) => [id, sumMap(o)]));
      const proposal = enc.deal?.proposal;
      const dealVisible = proposal && viewer && this.mainIds().includes(viewer.id);
      encounter = {
        number: enc.number,
        phase: enc.phase,
        step: enc.step,
        aggressorId: enc.aggressorId,
        defenderId: enc.defenderId,
        destiny: enc.destiny,
        candidates: enc.candidates,
        ownOptions: enc.ownOptions,
        launchMode: enc.launchMode,
        targetPlanetId: enc.targetPlanetId,
        gate: counts(enc.gate),
        defense: counts(enc.defense),
        invites: enc.invites,
        allies: enc.allies,
        acceptOrder: enc.acceptOrder,
        responderId: enc.step === 'ACCEPT' ? enc.acceptOrder[enc.acceptIndex] : null,
        power: enc.step === 'POWERS' ? enc.powerQueue[0] || null : null,
        oracleId: enc.oracleId,
        cards: { offense: sideCard('offense'), defense: sideCard('defense') },
        chosen: { offense: !!enc.cards.offense, defense: !!enc.cards.defense },
        revealed: enc.revealed,
        effective: enc.revealed ? this.effectiveCards() : null,
        totals: enc.revealed && enc.phase === 'REVEAL' ? this.totals() : enc.outcome?.totals || null,
        reinforcements: enc.reinforcements.map((r) => ({ playerId: r.playerId, side: r.side, value: r.value })),
        passes: enc.passes,
        effects: enc.effects,
        frozen: enc.frozen,
        outcome: enc.outcome ? { type: enc.outcome.type, done: enc.outcome.done, totals: enc.outcome.totals || null } : null,
        deal: enc.deal
          ? {
            proposal: proposal
              ? {
                id: proposal.id,
                by: proposal.by,
                giveCount: proposal.give.length,
                give: dealVisible ? proposal.give.map((uid) => this.cardView(uid)) : null,
                take: proposal.take,
                colonyMe: proposal.colonyMe,
                colonyOther: proposal.colonyOther,
                shipsMe: proposal.shipsMe,
                shipsOther: proposal.shipsOther,
              }
              : null,
          }
          : null,
        rewards: enc.rewards,
        clone: enc.step === 'CLONE' ? enc.cloneQueue[0] || null : null,
        fetch: enc.fetch
          ? {
            fidoId: enc.fetch.fidoId,
            stage: enc.fetch.stage,
            targetId: enc.fetch.targetId || null,
            reward: enc.fetch.reward || null,
            card: enc.fetch.cardUid ? this.cardView(enc.fetch.cardUid) : null,
          }
          : null,
        discarded: enc.step === 'FETCH' ? enc.discarded.map((uid) => this.cardView(uid)) : null,
        mindSeen: enc.mindSeen,
        success: enc.success,
      };
    }

    let you = null;
    if (viewer) {
      const legal = {};
      if (inPlay) {
        const aggr = enc.aggressorId === viewer.id;
        if (enc.phase === 'REGROUP' && aggr) legal.regroupPlanets = this.colonies(viewer.id).map((pl) => pl.id);
        if (enc.phase === 'LAUNCH' && aggr) {
          if (enc.launchMode === 'normal') legal.targets = this.planets.filter((pl) => pl.ownerId === enc.defenderId).map((pl) => pl.id);
          else if (enc.launchMode === 'own') legal.targets = enc.ownOptions.attack;
          else legal.targets = enc.ownOptions.restore;
          legal.sendLimit = this.sendLimit(viewer.id);
          legal.preloaded = sumMap(enc.gate[viewer.id]);
        }
        if (enc.phase === 'ALLIANCE' && enc.step === 'ACCEPT' && enc.acceptOrder[enc.acceptIndex] === viewer.id) {
          legal.alliance = this.allianceChoices(viewer.id);
          legal.sendLimit = this.sendLimit(viewer.id);
        }
        if (enc.phase === 'ALLIANCE' && enc.step === 'INVITE_OFFENSE' && this.powerActive(viewer.id, 'mind') && !enc.mindSeen[viewer.id]) {
          legal.mind = this.mainIds().filter((id) => !(this.mainIds().includes(viewer.id) && id === viewer.id));
        }
        legal.artifacts = this.playableArtifacts(viewer.id);
        legal.ships = Object.fromEntries(this.colonies(viewer.id).map((pl) => [pl.id, pl.ships[viewer.id]]));
      }
      const mindTarget = enc?.mindSeen?.[viewer.id];
      you = {
        id: viewer.id,
        isHost: viewer.isHost,
        color: viewer.color,
        alienId: viewer.alienId,
        alienOptions: this.phase === PHASES.ALIENS ? viewer.alienOptions : null,
        hand: viewer.hand.map((uid) => this.cardView(uid)),
        side: inPlay ? this.sideOf(viewer.id) : null,
        legal,
        mindHand: inPlay && mindTarget ? this.getPlayer(mindTarget).hand.map((uid) => this.cardView(uid)) : null,
        mindTarget: mindTarget || null,
      };
    }

    return {
      gameType: 'cosmic',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      winColonies: WIN_COLONIES,
      turnCount: this.turnCount || 0,
      players,
      order: this.order,
      turnPlayerId: inPlay ? enc.aggressorId : null,
      planets: this.planets.map((pl) => ({
        id: pl.id, ownerId: pl.ownerId, color: pl.color, index: pl.index, ships: { ...pl.ships },
      })),
      warp: { ...this.warp },
      decks: {
        cosmic: this.cosmicDeck.length,
        cosmicDiscard: this.cosmicDiscard.length,
        cosmicTop: this.cosmicDiscard.length ? this.cardView(this.cosmicDiscard[this.cosmicDiscard.length - 1]) : null,
        destiny: this.destinyDeck.length,
        destinyDiscard: this.destinyDiscard.length,
        destinyTop: this.destinyDiscard.length
          ? (({ kind, color, rule }) => ({ kind, color: color || null, rule: rule || null }))(this.destinyDiscard[this.destinyDiscard.length - 1])
          : null,
      },
      encounter,
      you,
      log: this.log.filter((e) => !e.to || (viewer && e.to.includes(viewer.id))).slice(-120)
        .map(({
          type, params, turn, ts,
        }) => ({
          type, params, turn, ts,
        })),
      results: over ? this.results : null,
    };
  }
}

module.exports = {
  CosmicGame,
  CosmicError,
  PHASES,
  ENCOUNTER_PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  HAND_SIZE,
  SHIPS_PER_PLAYER,
  WIN_COLONIES,
  DEAL_SEC,
  DEFAULT_SETTINGS,
  TURN_SEC_OPTIONS,
  sanitizeSettings,
  sumMap,
};
