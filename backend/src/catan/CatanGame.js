// CatanGame.js
// The authoritative Catan engine: one instance per room.
//
// A game has three stages. In SETUP every player places a settlement and
// a road, first in seat order and then in reverse, and the second
// settlement pays out the land around it. In PLAY a turn is: roll the
// dice (everyone collects from the matching hexes; a 7 makes large hands
// discard and moves the robber), then build, trade and play development
// cards in any order, then end the turn. The first player to reach the
// target score on their own turn wins.
//
// Clients only ever name an intention - "build a road on edge 31",
// "offer 2 wheat for 1 ore" - and every one is validated here against
// server state. Hands are secret: another player's resources and
// development cards reach a browser only as counts, and hidden victory
// point cards count for their owner alone until the game is over.

const {
  RESOURCES, TERRAIN_RESOURCE, GEOMETRY, generateLayout, shuffle,
} = require('./board');
const { CatanError } = require('./errors');

const PHASES = {
  LOBBY: 'LOBBY',
  SETUP: 'SETUP',
  PLAY: 'PLAY',
  GAME_OVER: 'GAME_OVER',
};

const STEPS = {
  ROLL: 'ROLL',
  DISCARD: 'DISCARD',
  ROBBER: 'ROBBER',
  STEAL: 'STEAL',
  MAIN: 'MAIN',
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const BANK_PER_RESOURCE = 19;
const OFFLINE_GRACE_SEC = 20;
const PLAYER_COLORS = ['red', 'blue', 'orange', 'white'];
const PIECES = { road: 15, settlement: 5, city: 4 };
const LONGEST_ROAD_MIN = 5;
const LARGEST_ARMY_MIN = 3;
const DISCARD_LIMIT = 7;

const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};

const DEV_DECK = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('victoryPoint'),
  ...Array(2).fill('roadBuilding'),
  ...Array(2).fill('yearOfPlenty'),
  ...Array(2).fill('monopoly'),
];
const DEV_TYPES = ['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly'];

const DEFAULT_SETTINGS = { victoryPoints: 10, turnSec: 120 };
const TURN_SEC_OPTIONS = [0, 60, 90, 120, 180, 300];

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  const turn = Math.round(Number(src.turnSec ?? base.turnSec));
  return {
    victoryPoints: clampInt(src.victoryPoints ?? base.victoryPoints, 6, 15, base.victoryPoints),
    turnSec: TURN_SEC_OPTIONS.includes(turn) ? turn : base.turnSec,
  };
}

function emptyHand() {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0]));
}

function handSize(hand) {
  return RESOURCES.reduce((sum, r) => sum + (hand[r] || 0), 0);
}

// A resource map from the client: only known resources, whole numbers.
function cleanResourceMap(input, max = BANK_PER_RESOURCE) {
  const out = emptyHand();
  if (!input || typeof input !== 'object') return out;
  RESOURCES.forEach((r) => { out[r] = clampInt(input[r], 0, max, 0); });
  return out;
}

function hasResources(hand, cost) {
  return RESOURCES.every((r) => (hand[r] || 0) >= (cost[r] || 0));
}

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

class CatanGame {
  constructor(roomCode, hostId, settings) {
    this.gameType = 'catan';
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.players = [];
    this.phase = PHASES.LOBBY;
    this.layout = null;
    this.robberHex = null;
    this.buildings = {}; // vertexId -> { playerId, type: 'settlement'|'city' }
    this.roads = {}; // edgeId -> playerId
    this.bank = emptyHand();
    this.devDeck = [];
    this.order = [];
    this.setup = null;
    this.turn = null;
    this.turnNumber = 0;
    this.trade = null;
    this.tradeSeq = 0;
    this.lastRoll = null;
    this.longestRoad = null; // { playerId, length }
    this.largestArmy = null; // { playerId, count }
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
      // Without a turn clock the deadline only exists while the player
      // due to act is away; coming back lifts it.
      if (this.settings.turnSec === 0 && this.isActor(existing.id)) this.armDeadline();
      return existing;
    }
    if (this.phase !== PHASES.LOBBY) throw new CatanError('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new CatanError(`A Catan room holds at most ${MAX_PLAYERS} players.`);
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
      resources: emptyHand(),
      devCards: [],
      knights: 0,
      stats: { produced: 0, trades: 0, devPlayed: 0 },
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
      return;
    }
    // Mid-game the seat stays - its pieces are on the island - but its
    // turns are played automatically from now on.
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this.handOffHost(player);
    if (this.trade) {
      if (this.trade.fromId === playerId) this.trade = null;
      else delete this.trade.responses[playerId];
    }
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
    if (!player) throw new CatanError('Player not found.');
    if (this.phase === PHASES.LOBBY) player.ready = !!ready;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw new CatanError('Only the host can do that.');
  }

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new CatanError('Settings can only be changed before the game starts.');
    this.settings = sanitizeSettings(patch, this.settings);
    return this.settings;
  }

  // --- log -----------------------------------------------------------

  // `to` limits an entry to the listed players; null means everyone.
  addLog(type, params = {}, to = null) {
    this.log.push({
      type, params, turn: this.turnNumber, ts: Date.now(), to,
    });
    if (this.log.length > 300) this.log.shift();
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new CatanError('The game has already started.');
    if (this.players.length < MIN_PLAYERS) throw new CatanError(`Catan needs at least ${MIN_PLAYERS} players.`);

    this.players.forEach((p, i) => {
      Object.assign(p, {
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        resources: emptyHand(),
        devCards: [],
        knights: 0,
        stats: { produced: 0, trades: 0, devPlayed: 0 },
      });
    });
    this.layout = generateLayout();
    this.robberHex = this.layout.hexes.find((h) => h.terrain === 'desert').id;
    this.buildings = {};
    this.roads = {};
    this.bank = Object.fromEntries(RESOURCES.map((r) => [r, BANK_PER_RESOURCE]));
    this.devDeck = shuffle(DEV_DECK);
    const first = Math.floor(Math.random() * this.players.length);
    this.order = this.players.map((_, i) => this.players[(first + i) % this.players.length].id);
    this.setup = {
      order: [...this.order, ...[...this.order].reverse()],
      index: 0,
      step: 'SETTLEMENT',
      lastVertex: null,
    };
    this.turn = null;
    this.turnNumber = 0;
    this.trade = null;
    this.lastRoll = null;
    this.longestRoad = null;
    this.largestArmy = null;
    this.results = null;
    this.log = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.phase = PHASES.SETUP;
    this.addLog('GAME_STARTED', { name: this.getPlayer(this.order[0]).nickname });
    this.armDeadline();
    return this;
  }

  restart(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.GAME_OVER) throw new CatanError('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => {
      Object.assign(p, {
        ready: false, color: null, resources: emptyHand(), devCards: [], knights: 0, stats: { produced: 0, trades: 0, devPlayed: 0 },
      });
    });
    Object.assign(this, {
      phase: PHASES.LOBBY,
      layout: null,
      robberHex: null,
      buildings: {},
      roads: {},
      bank: emptyHand(),
      devDeck: [],
      order: [],
      setup: null,
      turn: null,
      turnNumber: 0,
      trade: null,
      lastRoll: null,
      longestRoad: null,
      largestArmy: null,
      results: null,
      log: [],
      startedAt: null,
      endedAt: null,
      phaseEndsAt: null,
    });
  }

  // --- deadlines -----------------------------------------------------

  // Everyone the game is waiting on right now.
  actorIds() {
    if (this.phase === PHASES.SETUP && this.setup) return [this.setup.order[this.setup.index]];
    if (this.phase === PHASES.PLAY && this.turn) {
      if (this.turn.step === STEPS.DISCARD) return Object.keys(this.turn.discards || {});
      return [this.turn.playerId];
    }
    return [];
  }

  isActor(playerId) {
    return this.actorIds().includes(playerId);
  }

  armDeadline() {
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
    if (!this.isActor(player.id)) return;
    const grace = Date.now() + OFFLINE_GRACE_SEC * 1000;
    this.phaseEndsAt = this.phaseEndsAt ? Math.min(this.phaseEndsAt, grace) : grace;
  }

  // The clock ran out on whoever was due to act: make a legal move for
  // them and keep the game moving.
  onTimeout() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    if (this.phase === PHASES.SETUP && this.setup) {
      const player = this.getPlayer(this.setup.order[this.setup.index]);
      if (this.setup.step === 'SETTLEMENT') {
        const spots = this.legalSettlementVertices(player.id);
        if (spots.length) this.buildSettlement(player.id, pick(spots));
      } else {
        const edges = this.legalRoadEdges(player.id);
        if (edges.length) this.buildRoad(player.id, pick(edges));
      }
      this.addLog('AUTO_MOVE', { name: player.nickname });
      return;
    }
    if (this.phase !== PHASES.PLAY || !this.turn) return;
    const current = this.getPlayer(this.turn.playerId);
    switch (this.turn.step) {
      case STEPS.ROLL:
        this.rollDice(current.id);
        this.addLog('AUTO_MOVE', { name: current.nickname });
        break;
      case STEPS.DISCARD:
        Object.entries({ ...this.turn.discards }).forEach(([id, count]) => {
          const p = this.getPlayer(id);
          const pool = RESOURCES.flatMap((r) => Array(p.resources[r]).fill(r));
          const chosen = emptyHand();
          shuffle(pool).slice(0, count).forEach((r) => { chosen[r] += 1; });
          this.discard(id, chosen);
          this.addLog('AUTO_MOVE', { name: p.nickname });
        });
        break;
      case STEPS.ROBBER: {
        const hexes = this.legalRobberHexes();
        const safe = hexes.filter((h) => !this.playersOnHex(h).includes(current.id));
        this.moveRobber(current.id, pick(safe.length ? safe : hexes));
        this.addLog('AUTO_MOVE', { name: current.nickname });
        break;
      }
      case STEPS.STEAL:
        this.steal(current.id, pick(this.turn.stealFrom));
        break;
      case STEPS.MAIN:
        this.endTurn(current.id, { auto: true });
        break;
      default:
        break;
    }
  }

  // --- board queries -------------------------------------------------

  hexResource(hexId) {
    return TERRAIN_RESOURCE[this.layout.hexes[hexId].terrain];
  }

  playersOnHex(hexId) {
    const ids = new Set();
    GEOMETRY.hexes[hexId].vertices.forEach((v) => {
      if (this.buildings[v]) ids.add(this.buildings[v].playerId);
    });
    return [...ids];
  }

  // The distance rule: no settlement on a corner next to another one.
  vertexOpen(vertexId) {
    if (this.buildings[vertexId]) return false;
    return GEOMETRY.vertices[vertexId].neighbors.every((n) => !this.buildings[n]);
  }

  touchesOwnRoad(playerId, vertexId) {
    return GEOMETRY.vertices[vertexId].edges.some((e) => this.roads[e] === playerId);
  }

  legalSettlementVertices(playerId) {
    const inSetup = this.phase === PHASES.SETUP;
    return GEOMETRY.vertices
      .filter((v) => this.vertexOpen(v.id) && (inSetup || this.touchesOwnRoad(playerId, v.id)))
      .map((v) => v.id);
  }

  // A road extends from the player's own building, or from the end of
  // their own road - unless an opponent's building sits on that corner.
  roadConnects(playerId, edgeId) {
    const edge = GEOMETRY.edges[edgeId];
    return [edge.a, edge.b].some((v) => {
      const building = this.buildings[v];
      if (building) return building.playerId === playerId;
      return GEOMETRY.vertices[v].edges.some((e) => e !== edgeId && this.roads[e] === playerId);
    });
  }

  legalRoadEdges(playerId) {
    if (this.phase === PHASES.SETUP) {
      const from = this.setup?.lastVertex;
      if (from === null || from === undefined) return [];
      return GEOMETRY.vertices[from].edges.filter((e) => this.roads[e] === undefined);
    }
    return GEOMETRY.edges
      .filter((e) => this.roads[e.id] === undefined && this.roadConnects(playerId, e.id))
      .map((e) => e.id);
  }

  legalCityVertices(playerId) {
    return Object.entries(this.buildings)
      .filter(([, b]) => b.playerId === playerId && b.type === 'settlement')
      .map(([v]) => Number(v));
  }

  legalRobberHexes() {
    return GEOMETRY.hexes.map((h) => h.id).filter((id) => id !== this.robberHex);
  }

  piecesUsed(playerId) {
    const used = { road: 0, settlement: 0, city: 0 };
    Object.values(this.roads).forEach((id) => { if (id === playerId) used.road += 1; });
    Object.values(this.buildings).forEach((b) => { if (b.playerId === playerId) used[b.type] += 1; });
    return used;
  }

  piecesLeft(playerId) {
    const used = this.piecesUsed(playerId);
    return { road: PIECES.road - used.road, settlement: PIECES.settlement - used.settlement, city: PIECES.city - used.city };
  }

  // The best harbour rate for each resource: 4:1 with the bank, 3:1 on a
  // generic harbour, 2:1 on that resource's own harbour.
  tradeRates(playerId) {
    const rates = Object.fromEntries(RESOURCES.map((r) => [r, 4]));
    (this.layout?.ports || []).forEach((port) => {
      const edge = GEOMETRY.edges[port.edgeId];
      const owns = [edge.a, edge.b].some((v) => this.buildings[v]?.playerId === playerId);
      if (!owns) return;
      if (port.type === 'any') RESOURCES.forEach((r) => { rates[r] = Math.min(rates[r], 3); });
      else rates[port.type] = 2;
    });
    return rates;
  }

  // Longest continuous road: a walk along the player's roads that never
  // reuses a segment and cannot pass through a corner an opponent built on.
  longestRoadFor(playerId) {
    const own = Object.entries(this.roads).filter(([, id]) => id === playerId).map(([e]) => Number(e));
    if (!own.length) return 0;
    const ownSet = new Set(own);
    let best = 0;
    const walk = (vertex, used, length) => {
      if (length > best) best = length;
      const building = this.buildings[vertex];
      if (length > 0 && building && building.playerId !== playerId) return;
      GEOMETRY.vertices[vertex].edges.forEach((e) => {
        if (!ownSet.has(e) || used.has(e)) return;
        const edge = GEOMETRY.edges[e];
        used.add(e);
        walk(edge.a === vertex ? edge.b : edge.a, used, length + 1);
        used.delete(e);
      });
    };
    const starts = new Set(own.flatMap((e) => [GEOMETRY.edges[e].a, GEOMETRY.edges[e].b]));
    starts.forEach((v) => walk(v, new Set(), 0));
    return best;
  }

  updateLongestRoad() {
    const lengths = Object.fromEntries(this.players.map((p) => [p.id, this.longestRoadFor(p.id)]));
    const holder = this.longestRoad?.playerId || null;
    const max = Math.max(0, ...Object.values(lengths));
    let next = null;
    if (holder && lengths[holder] >= LONGEST_ROAD_MIN && lengths[holder] === max) {
      next = holder;
    } else if (max >= LONGEST_ROAD_MIN) {
      // A holder who lost the lead gives the card up; a tie among the
      // others leaves it with nobody.
      const leaders = Object.keys(lengths).filter((id) => lengths[id] === max);
      if (leaders.length === 1) [next] = leaders;
    }
    if (next !== holder) {
      if (next) this.addLog('LONGEST_ROAD', { name: this.getPlayer(next).nickname, length: lengths[next] });
      else this.addLog('LONGEST_ROAD_LOST', { name: this.getPlayer(holder).nickname });
    }
    this.longestRoad = next ? { playerId: next, length: lengths[next] } : null;
  }

  updateLargestArmy(player) {
    if (player.knights < LARGEST_ARMY_MIN) return;
    const holder = this.largestArmy?.playerId;
    if (holder === player.id) {
      this.largestArmy.count = player.knights;
      return;
    }
    if (!holder || player.knights > this.largestArmy.count) {
      this.largestArmy = { playerId: player.id, count: player.knights };
      this.addLog('LARGEST_ARMY', { name: player.nickname, count: player.knights });
    }
  }

  // Score everyone can see: buildings plus the two special cards.
  publicPoints(playerId) {
    let points = 0;
    Object.values(this.buildings).forEach((b) => {
      if (b.playerId === playerId) points += b.type === 'city' ? 2 : 1;
    });
    if (this.longestRoad?.playerId === playerId) points += 2;
    if (this.largestArmy?.playerId === playerId) points += 2;
    return points;
  }

  hiddenPoints(player) {
    return player.devCards.filter((c) => c.type === 'victoryPoint').length;
  }

  totalPoints(player) {
    return this.publicPoints(player.id) + this.hiddenPoints(player);
  }

  // --- resource movement ---------------------------------------------

  pay(player, cost) {
    RESOURCES.forEach((r) => {
      const n = cost[r] || 0;
      player.resources[r] -= n;
      this.bank[r] += n;
    });
  }

  give(player, resource, count) {
    const n = Math.min(count, this.bank[resource]);
    player.resources[resource] += n;
    this.bank[resource] -= n;
    return n;
  }

  // --- turn plumbing -------------------------------------------------

  assertPhase(phase) {
    if (this.phase !== phase) {
      if (this.phase === PHASES.GAME_OVER) throw new CatanError('The game is over.');
      throw new CatanError('That cannot be done right now.');
    }
  }

  assertTurn(playerId) {
    this.assertPhase(PHASES.PLAY);
    if (!this.turn || this.turn.playerId !== playerId) throw new CatanError('It is not your turn.');
    return this.getPlayer(playerId);
  }

  assertMain(playerId) {
    const player = this.assertTurn(playerId);
    if (this.turn.step === STEPS.ROLL) throw new CatanError('Roll the dice first.');
    if (this.turn.step !== STEPS.MAIN) throw new CatanError('Finish dealing with the robber first.');
    return player;
  }

  beginTurn(playerId) {
    this.turnNumber += 1;
    this.trade = null;
    this.turn = {
      playerId,
      step: STEPS.ROLL,
      devPlayed: false,
      freeRoads: 0,
      discards: null,
      stealFrom: null,
      afterRobber: null,
    };
    this.armDeadline();
  }

  checkWin(player) {
    if (this.phase !== PHASES.PLAY || this.turn?.playerId !== player.id) return false;
    if (this.totalPoints(player) < this.settings.victoryPoints) return false;
    this.endGame(player);
    return true;
  }

  // --- setup ---------------------------------------------------------

  setupActor(playerId, step) {
    this.assertPhase(PHASES.SETUP);
    if (this.setup.order[this.setup.index] !== playerId) throw new CatanError('It is not your turn to place.');
    if (this.setup.step !== step) {
      throw new CatanError(step === 'ROAD' ? 'Place your settlement first.' : 'Place a road next to your new settlement.');
    }
    return this.getPlayer(playerId);
  }

  // --- building ------------------------------------------------------

  buildSettlement(playerId, vertexId) {
    if (!Number.isInteger(vertexId) || !GEOMETRY.vertices[vertexId]) throw new CatanError('Pick a corner of a hex.');

    if (this.phase === PHASES.SETUP) {
      const player = this.setupActor(playerId, 'SETTLEMENT');
      if (!this.vertexOpen(vertexId)) throw new CatanError('Settlements need at least two road lengths between them.');
      this.buildings[vertexId] = { playerId, type: 'settlement' };
      this.setup.lastVertex = vertexId;
      this.setup.step = 'ROAD';
      const secondRound = this.setup.index >= this.order.length;
      const gained = emptyHand();
      if (secondRound) {
        GEOMETRY.vertices[vertexId].hexes.forEach((h) => {
          const resource = this.hexResource(h);
          if (resource) gained[resource] += this.give(player, resource, 1);
        });
      }
      this.addLog('PLACED_SETTLEMENT', { name: player.nickname, resources: secondRound ? gained : null });
      this.armDeadline();
      return;
    }

    const player = this.assertMain(playerId);
    if (this.piecesLeft(playerId).settlement <= 0) throw new CatanError('You have no settlements left - upgrade one to a city.');
    if (this.buildings[vertexId]) throw new CatanError('That corner is taken.');
    if (!this.vertexOpen(vertexId)) throw new CatanError('Settlements need at least two road lengths between them.');
    if (!this.touchesOwnRoad(playerId, vertexId)) throw new CatanError('A settlement must be at the end of one of your roads.');
    if (!hasResources(player.resources, COSTS.settlement)) throw new CatanError('Not enough resources for a settlement.');
    this.pay(player, COSTS.settlement);
    this.buildings[vertexId] = { playerId, type: 'settlement' };
    this.addLog('BUILT_SETTLEMENT', { name: player.nickname });
    // A new settlement can cut an opponent's road in two.
    this.updateLongestRoad();
    this.checkWin(player);
  }

  buildRoad(playerId, edgeId) {
    if (!Number.isInteger(edgeId) || !GEOMETRY.edges[edgeId]) throw new CatanError('Pick a side of a hex.');

    if (this.phase === PHASES.SETUP) {
      const player = this.setupActor(playerId, 'ROAD');
      if (!this.legalRoadEdges(playerId).includes(edgeId)) throw new CatanError('The road must touch the settlement you just placed.');
      this.roads[edgeId] = playerId;
      this.addLog('PLACED_ROAD', { name: player.nickname });
      this.setup.index += 1;
      this.setup.step = 'SETTLEMENT';
      this.setup.lastVertex = null;
      if (this.setup.index >= this.setup.order.length) {
        this.setup = null;
        this.phase = PHASES.PLAY;
        this.addLog('SETUP_DONE', {});
        this.beginTurn(this.order[0]);
      } else {
        this.armDeadline();
      }
      return;
    }

    const player = this.assertMain(playerId);
    if (this.piecesLeft(playerId).road <= 0) throw new CatanError('You have no roads left.');
    if (this.roads[edgeId] !== undefined) throw new CatanError('There is already a road there.');
    if (!this.roadConnects(playerId, edgeId)) throw new CatanError('A road must connect to your own road, settlement or city.');
    const free = this.turn.freeRoads > 0;
    if (!free && !hasResources(player.resources, COSTS.road)) throw new CatanError('Not enough resources for a road.');
    if (free) this.turn.freeRoads -= 1;
    else this.pay(player, COSTS.road);
    this.roads[edgeId] = playerId;
    this.addLog('BUILT_ROAD', { name: player.nickname, free });
    this.updateLongestRoad();
    this.checkWin(player);
  }

  buildCity(playerId, vertexId) {
    const player = this.assertMain(playerId);
    const building = this.buildings[vertexId];
    if (!building || building.playerId !== playerId || building.type !== 'settlement') {
      throw new CatanError('A city replaces one of your own settlements.');
    }
    if (this.piecesLeft(playerId).city <= 0) throw new CatanError('You have no cities left.');
    if (!hasResources(player.resources, COSTS.city)) throw new CatanError('Not enough resources for a city.');
    this.pay(player, COSTS.city);
    building.type = 'city';
    this.addLog('BUILT_CITY', { name: player.nickname });
    this.checkWin(player);
  }

  buyDevCard(playerId) {
    const player = this.assertMain(playerId);
    if (!this.devDeck.length) throw new CatanError('There are no development cards left.');
    if (!hasResources(player.resources, COSTS.dev)) throw new CatanError('Not enough resources for a development card.');
    this.pay(player, COSTS.dev);
    const type = this.devDeck.pop();
    player.devCards.push({ type, boughtTurn: this.turnNumber });
    this.addLog('BOUGHT_DEV', { name: player.nickname });
    this.addLog('YOU_BOUGHT_DEV', { card: type }, [player.id]);
    this.checkWin(player);
  }

  // --- dice, production, robber --------------------------------------

  rollDice(playerId, forced = null) {
    const player = this.assertTurn(playerId);
    if (this.turn.step !== STEPS.ROLL) throw new CatanError('You have already rolled this turn.');
    // Points can arrive on someone else's turn (a settlement that cuts a
    // rival's road hands over the Longest Road); they win when their own
    // turn comes round.
    if (this.checkWin(player)) return;
    const dice = forced || [rollDie(), rollDie()];
    const total = dice[0] + dice[1];
    this.lastRoll = { dice, total, playerId, turn: this.turnNumber };
    this.addLog('ROLLED', { name: player.nickname, dice, total });

    if (total === 7) {
      const discards = {};
      this.players.forEach((p) => {
        const size = handSize(p.resources);
        if (size > DISCARD_LIMIT) discards[p.id] = Math.floor(size / 2);
      });
      if (Object.keys(discards).length) {
        this.turn.step = STEPS.DISCARD;
        this.turn.discards = discards;
        Object.entries(discards).forEach(([id, count]) => this.addLog('MUST_DISCARD', { name: this.getPlayer(id).nickname, count }));
      } else {
        this.turn.step = STEPS.ROBBER;
      }
      this.turn.afterRobber = STEPS.MAIN;
      this.armDeadline();
      return;
    }

    this.produce(total);
    this.turn.step = STEPS.MAIN;
    this.armDeadline();
  }

  // Every hex showing the number pays each adjacent settlement 1 and each
  // city 2 - except under the robber. When the bank cannot cover every
  // claim on a resource, nobody gets that resource (unless only one
  // player claims it, who then takes what is left).
  produce(total) {
    const claims = Object.fromEntries(RESOURCES.map((r) => [r, {}]));
    this.layout.hexes.forEach((hex) => {
      if (hex.number !== total || hex.id === this.robberHex) return;
      const resource = TERRAIN_RESOURCE[hex.terrain];
      GEOMETRY.hexes[hex.id].vertices.forEach((v) => {
        const b = this.buildings[v];
        if (!b) return;
        claims[resource][b.playerId] = (claims[resource][b.playerId] || 0) + (b.type === 'city' ? 2 : 1);
      });
    });

    const gained = {};
    RESOURCES.forEach((r) => {
      const entries = Object.entries(claims[r]);
      if (!entries.length) return;
      const demand = entries.reduce((sum, [, n]) => sum + n, 0);
      if (demand > this.bank[r] && entries.length > 1) {
        this.addLog('BANK_SHORT', { resource: r });
        return;
      }
      entries.forEach(([id, n]) => {
        const got = this.give(this.getPlayer(id), r, n);
        if (!got) return;
        gained[id] = gained[id] || emptyHand();
        gained[id][r] += got;
      });
    });

    Object.entries(gained).forEach(([id, hand]) => {
      const p = this.getPlayer(id);
      p.stats.produced += handSize(hand);
      this.addLog('PRODUCED', { name: p.nickname, resources: hand });
    });
    if (!Object.keys(gained).length) this.addLog('NO_PRODUCTION', { total });
  }

  discard(playerId, resources) {
    this.assertPhase(PHASES.PLAY);
    if (this.turn?.step !== STEPS.DISCARD || !this.turn.discards?.[playerId]) throw new CatanError('You do not need to discard.');
    const player = this.getPlayer(playerId);
    const chosen = cleanResourceMap(resources);
    const required = this.turn.discards[playerId];
    if (handSize(chosen) !== required) throw new CatanError(`Discard exactly ${required} cards.`);
    if (!hasResources(player.resources, chosen)) throw new CatanError('You do not have those cards.');
    this.pay(player, chosen);
    delete this.turn.discards[playerId];
    this.addLog('DISCARDED', { name: player.nickname, count: required });
    if (!Object.keys(this.turn.discards).length) {
      this.turn.discards = null;
      this.turn.step = STEPS.ROBBER;
    }
    this.armDeadline();
  }

  moveRobber(playerId, hexId) {
    const player = this.assertTurn(playerId);
    if (this.turn.step !== STEPS.ROBBER) throw new CatanError('The robber is not moving now.');
    if (!Number.isInteger(hexId) || !GEOMETRY.hexes[hexId]) throw new CatanError('Pick a hex.');
    if (hexId === this.robberHex) throw new CatanError('The robber has to move to a different hex.');
    this.robberHex = hexId;
    this.addLog('ROBBER_MOVED', { name: player.nickname, hex: hexId, terrain: this.layout.hexes[hexId].terrain });
    const victims = this.playersOnHex(hexId)
      .filter((id) => id !== playerId && handSize(this.getPlayer(id).resources) > 0);
    if (victims.length === 0) {
      this.finishRobber();
    } else if (victims.length === 1) {
      this.turn.stealFrom = victims;
      this.turn.step = STEPS.STEAL;
      this.steal(playerId, victims[0]);
    } else {
      this.turn.stealFrom = victims;
      this.turn.step = STEPS.STEAL;
      this.armDeadline();
    }
  }

  steal(playerId, victimId) {
    const player = this.assertTurn(playerId);
    if (this.turn.step !== STEPS.STEAL) throw new CatanError('There is nobody to steal from.');
    if (!this.turn.stealFrom.includes(victimId)) throw new CatanError('Steal from a player with a building on the robber\'s hex.');
    const victim = this.getPlayer(victimId);
    const pool = RESOURCES.flatMap((r) => Array(victim.resources[r]).fill(r));
    if (pool.length) {
      const resource = pool[Math.floor(Math.random() * pool.length)];
      victim.resources[resource] -= 1;
      player.resources[resource] += 1;
      this.addLog('STOLE', { name: player.nickname, victim: victim.nickname });
      this.addLog('STOLE_PRIVATE', { name: player.nickname, victim: victim.nickname, resource }, [player.id, victim.id]);
    }
    this.finishRobber();
  }

  finishRobber() {
    this.turn.stealFrom = null;
    this.turn.step = this.turn.afterRobber || STEPS.MAIN;
    this.turn.afterRobber = null;
    this.armDeadline();
  }

  // --- development cards ---------------------------------------------

  playDevCard(playerId, type, payload = {}) {
    const player = this.assertTurn(playerId);
    if (!DEV_TYPES.includes(type) || type === 'victoryPoint') throw new CatanError('That card cannot be played.');
    const step = this.turn.step;
    if (type === 'knight' ? ![STEPS.ROLL, STEPS.MAIN].includes(step) : step !== STEPS.MAIN) {
      throw new CatanError(type === 'knight' ? 'Finish dealing with the robber first.' : 'Roll the dice before playing this card.');
    }
    if (this.turn.devPlayed) throw new CatanError('Only one development card can be played per turn.');
    const index = player.devCards.findIndex((c) => c.type === type && c.boughtTurn < this.turnNumber);
    if (index === -1) {
      const fresh = player.devCards.some((c) => c.type === type);
      throw new CatanError(fresh ? 'A card cannot be played on the turn it was bought.' : 'You do not have that card.');
    }

    // Validate the card's own choice before anything is spent.
    let chosen = null;
    if (type === 'yearOfPlenty') {
      const picks = Array.isArray(payload.resources) ? payload.resources.slice(0, 2) : [];
      if (picks.length !== 2 || !picks.every((r) => RESOURCES.includes(r))) throw new CatanError('Choose two resources.');
      const want = emptyHand();
      picks.forEach((r) => { want[r] += 1; });
      if (!RESOURCES.every((r) => this.bank[r] >= want[r])) throw new CatanError('The bank does not have those resources.');
      chosen = want;
    } else if (type === 'monopoly') {
      if (!RESOURCES.includes(payload.resource)) throw new CatanError('Choose a resource.');
    } else if (type === 'roadBuilding') {
      if (this.piecesLeft(playerId).road <= 0) throw new CatanError('You have no roads left to build.');
    }

    player.devCards.splice(index, 1);
    this.turn.devPlayed = true;
    player.stats.devPlayed += 1;
    this.addLog('PLAYED_DEV', { name: player.nickname, card: type });

    if (type === 'knight') {
      player.knights += 1;
      this.updateLargestArmy(player);
      this.turn.afterRobber = step;
      this.turn.step = STEPS.ROBBER;
      this.armDeadline();
    } else if (type === 'roadBuilding') {
      this.turn.freeRoads = Math.min(2, this.piecesLeft(playerId).road);
    } else if (type === 'yearOfPlenty') {
      RESOURCES.forEach((r) => { if (chosen[r]) this.give(player, r, chosen[r]); });
      this.addLog('YEAR_OF_PLENTY', { name: player.nickname, resources: chosen });
    } else if (type === 'monopoly') {
      const resource = payload.resource;
      let taken = 0;
      this.players.forEach((p) => {
        if (p.id === playerId) return;
        taken += p.resources[resource];
        p.resources[resource] = 0;
      });
      player.resources[resource] += taken;
      this.addLog('MONOPOLY', { name: player.nickname, resource, count: taken });
    }
    this.checkWin(player);
  }

  // --- trading -------------------------------------------------------

  bankTrade(playerId, give, get, amount = 1) {
    const player = this.assertMain(playerId);
    if (!RESOURCES.includes(give) || !RESOURCES.includes(get)) throw new CatanError('Choose resources to trade.');
    if (give === get) throw new CatanError('Pick two different resources.');
    const count = clampInt(amount, 1, 10, 1);
    const rate = this.tradeRates(playerId)[give];
    if (player.resources[give] < rate * count) throw new CatanError(`You need ${rate * count} ${give} for that trade.`);
    if (this.bank[get] < count) throw new CatanError('The bank has run out of that resource.');
    player.resources[give] -= rate * count;
    this.bank[give] += rate * count;
    player.resources[get] += count;
    this.bank[get] -= count;
    player.stats.trades += 1;
    this.addLog('BANK_TRADE', {
      name: player.nickname, give, giveCount: rate * count, get, getCount: count, rate,
    });
  }

  // Only the player whose turn it is may put an offer on the table; the
  // others accept or decline, and the offerer picks one who accepted.
  proposeTrade(playerId, { give, get, to } = {}) {
    const player = this.assertMain(playerId);
    const offer = cleanResourceMap(give);
    const want = cleanResourceMap(get);
    if (!handSize(offer) || !handSize(want)) throw new CatanError('A trade needs something on both sides.');
    if (RESOURCES.some((r) => offer[r] && want[r])) throw new CatanError('Do not offer and ask for the same resource.');
    if (!hasResources(player.resources, offer)) throw new CatanError('You do not have what you are offering.');
    const others = this.players.filter((p) => p.id !== playerId && !p.left).map((p) => p.id);
    const targets = Array.isArray(to) && to.length ? others.filter((id) => to.includes(id)) : others;
    if (!targets.length) throw new CatanError('Choose who the offer is for.');
    this.tradeSeq += 1;
    this.trade = {
      id: this.tradeSeq, fromId: playerId, give: offer, get: want, to: targets, responses: {},
    };
    this.addLog('TRADE_OFFERED', { name: player.nickname, give: offer, get: want });
  }

  respondTrade(playerId, tradeId, accept) {
    this.assertPhase(PHASES.PLAY);
    const trade = this.trade;
    if (!trade || trade.id !== tradeId) throw new CatanError('That offer is no longer on the table.');
    if (!trade.to.includes(playerId)) throw new CatanError('That offer is not for you.');
    const player = this.getPlayer(playerId);
    if (accept && !hasResources(player.resources, trade.get)) throw new CatanError('You do not have what they are asking for.');
    trade.responses[playerId] = accept ? 'accept' : 'decline';
  }

  confirmTrade(playerId, tradeId, partnerId) {
    const player = this.assertMain(playerId);
    const trade = this.trade;
    if (!trade || trade.id !== tradeId || trade.fromId !== playerId) throw new CatanError('That offer is no longer on the table.');
    if (trade.responses[partnerId] !== 'accept') throw new CatanError('That player has not accepted.');
    const partner = this.getPlayer(partnerId);
    // Hands may have changed since the offer was made.
    if (!hasResources(player.resources, trade.give)) throw new CatanError('You no longer have what you offered.');
    if (!hasResources(partner.resources, trade.get)) {
      trade.responses[partnerId] = 'decline';
      throw new CatanError('They no longer have what you asked for.');
    }
    RESOURCES.forEach((r) => {
      player.resources[r] += trade.get[r] - trade.give[r];
      partner.resources[r] += trade.give[r] - trade.get[r];
    });
    player.stats.trades += 1;
    partner.stats.trades += 1;
    this.addLog('TRADED', {
      name: player.nickname, partner: partner.nickname, give: trade.give, get: trade.get,
    });
    this.trade = null;
  }

  cancelTrade(playerId) {
    this.assertPhase(PHASES.PLAY);
    if (!this.trade || this.trade.fromId !== playerId) throw new CatanError('You have no offer on the table.');
    this.trade = null;
  }

  endTurn(playerId, { auto = false } = {}) {
    const player = this.assertTurn(playerId);
    if (this.turn.step !== STEPS.MAIN) throw new CatanError(this.turn.step === STEPS.ROLL ? 'Roll the dice first.' : 'Finish dealing with the robber first.');
    if (auto) this.addLog('AUTO_MOVE', { name: player.nickname });
    this.addLog('TURN_ENDED', { name: player.nickname });
    const index = this.order.indexOf(playerId);
    this.beginTurn(this.order[(index + 1) % this.order.length]);
  }

  // --- end -----------------------------------------------------------

  endGame(winner) {
    const standings = this.players.map((p) => {
      const settlements = Object.values(this.buildings).filter((b) => b.playerId === p.id && b.type === 'settlement').length;
      const cities = Object.values(this.buildings).filter((b) => b.playerId === p.id && b.type === 'city').length;
      return {
        playerId: p.id,
        nickname: p.nickname,
        color: p.color,
        settlements,
        cities,
        longestRoad: this.longestRoad?.playerId === p.id,
        largestArmy: this.largestArmy?.playerId === p.id,
        victoryCards: this.hiddenPoints(p),
        knights: p.knights,
        roadLength: this.longestRoadFor(p.id),
        total: this.totalPoints(p),
      };
    });
    standings.sort((a, b) => {
      if (a.playerId === winner.id) return -1;
      if (b.playerId === winner.id) return 1;
      return b.total - a.total || b.cities - a.cities;
    });
    this.results = { standings, winnerId: winner.id };
    this.phase = PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.endedAt = Date.now();
    this.trade = null;
    this.addLog('GAME_OVER', { name: winner.nickname, points: this.totalPoints(winner) });
  }

  // --- serialization -------------------------------------------------

  toJSON() {
    const {
      gameType, roomCode, hostId, settings, players, phase, layout, robberHex, buildings, roads, bank, devDeck, order,
      setup, turn, turnNumber, trade, tradeSeq, lastRoll, longestRoad, largestArmy, results, log, createdAt, startedAt,
      endedAt, phaseEndsAt,
    } = this;
    return {
      gameType, roomCode, hostId, settings, players, phase, layout, robberHex, buildings, roads, bank, devDeck, order,
      setup, turn, turnNumber, trade, tradeSeq, lastRoll, longestRoad, largestArmy, results, log, createdAt, startedAt,
      endedAt, phaseEndsAt,
    };
  }

  static fromJSON(data) {
    const game = new CatanGame(data.roomCode, data.hostId, data.settings);
    const fields = [
      'players', 'phase', 'layout', 'robberHex', 'buildings', 'roads', 'bank', 'devDeck', 'order', 'setup', 'turn',
      'turnNumber', 'trade', 'tradeSeq', 'lastRoll', 'longestRoad', 'largestArmy', 'results', 'log', 'createdAt',
      'startedAt', 'endedAt', 'phaseEndsAt',
    ];
    fields.forEach((f) => { if (data[f] !== undefined) game[f] = data[f]; });
    game.players.forEach((p) => { p.connected = false; p.socketId = null; });
    return game;
  }

  // The island as a client draws it: fixed geometry plus this game's layout.
  boardView() {
    if (!this.layout) return null;
    return {
      hexes: GEOMETRY.hexes.map((h) => {
        const tile = this.layout.hexes[h.id];
        return {
          id: h.id, q: h.q, r: h.r, x: h.x, y: h.y, vertices: h.vertices, terrain: tile.terrain, number: tile.number,
        };
      }),
      vertices: GEOMETRY.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y })),
      edges: GEOMETRY.edges.map((e) => ({ id: e.id, a: e.a, b: e.b })),
      ports: this.layout.ports.map((p) => ({ edgeId: p.edgeId, type: p.type })),
      robberHex: this.robberHex,
    };
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId);
    const inPlay = this.phase === PHASES.PLAY && this.turn;
    const actors = this.actorIds();

    const players = this.players.map((p) => {
      const left = this.layout ? this.piecesLeft(p.id) : { ...PIECES };
      return {
        id: p.id,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        isGuest: !p.accountId,
        connected: p.connected,
        left: !!p.left,
        isHost: p.isHost,
        ready: p.ready,
        color: p.color,
        resourceCount: handSize(p.resources),
        devCardCount: p.devCards.length,
        knights: p.knights,
        roadLength: this.layout ? this.longestRoadFor(p.id) : 0,
        points: this.phase === PHASES.GAME_OVER ? this.totalPoints(p) : this.publicPoints(p.id),
        longestRoad: this.longestRoad?.playerId === p.id,
        largestArmy: this.largestArmy?.playerId === p.id,
        piecesLeft: left,
        mustDiscard: inPlay && this.turn.step === STEPS.DISCARD ? (this.turn.discards?.[p.id] || 0) : 0,
        isCurrent: actors.includes(p.id) && !(inPlay && this.turn.step === STEPS.DISCARD),
        isYou: viewer ? p.id === viewer.id : false,
      };
    });

    let you = null;
    if (viewer) {
      const isYourTurn = !!(inPlay && this.turn.playerId === viewer.id);
      const setupTurn = this.phase === PHASES.SETUP && this.setup?.order[this.setup.index] === viewer.id;
      const legal = {
        settlements: [], roads: [], cities: [], robberHexes: [],
      };
      if (setupTurn) {
        if (this.setup.step === 'SETTLEMENT') legal.settlements = this.legalSettlementVertices(viewer.id);
        else legal.roads = this.legalRoadEdges(viewer.id);
      } else if (isYourTurn && this.turn.step === STEPS.MAIN) {
        const left = this.piecesLeft(viewer.id);
        if (left.settlement > 0) legal.settlements = this.legalSettlementVertices(viewer.id);
        if (left.road > 0) legal.roads = this.legalRoadEdges(viewer.id);
        if (left.city > 0) legal.cities = this.legalCityVertices(viewer.id);
      } else if (isYourTurn && this.turn.step === STEPS.ROBBER) {
        legal.robberHexes = this.legalRobberHexes();
      }
      you = {
        id: viewer.id,
        isHost: viewer.isHost,
        color: viewer.color,
        resources: { ...viewer.resources },
        devCards: viewer.devCards.map((c) => ({ type: c.type, playable: c.type !== 'victoryPoint' && c.boughtTurn < this.turnNumber })),
        points: this.totalPoints(viewer),
        hiddenPoints: this.hiddenPoints(viewer),
        tradeRates: this.layout ? this.tradeRates(viewer.id) : null,
        piecesLeft: this.layout ? this.piecesLeft(viewer.id) : { ...PIECES },
        isYourTurn,
        setupTurn,
        mustDiscard: inPlay && this.turn.step === STEPS.DISCARD ? (this.turn.discards?.[viewer.id] || 0) : 0,
        legal,
      };
    }

    return {
      gameType: 'catan',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      turnNumber: this.turnNumber,
      costs: COSTS,
      players,
      order: this.order,
      board: this.boardView(),
      buildings: Object.entries(this.buildings).map(([v, b]) => ({ vertexId: Number(v), playerId: b.playerId, type: b.type })),
      roads: Object.entries(this.roads).map(([e, playerId]) => ({ edgeId: Number(e), playerId })),
      bank: { ...this.bank },
      devDeckCount: this.devDeck.length,
      setup: this.phase === PHASES.SETUP && this.setup
        ? {
          playerId: this.setup.order[this.setup.index],
          step: this.setup.step,
          round: this.setup.index < this.order.length ? 1 : 2,
          lastVertex: this.setup.lastVertex,
        }
        : null,
      turn: inPlay
        ? {
          playerId: this.turn.playerId,
          step: this.turn.step,
          devPlayed: this.turn.devPlayed,
          freeRoads: this.turn.freeRoads,
          stealFrom: this.turn.stealFrom,
          discards: this.turn.discards,
        }
        : null,
      lastRoll: this.lastRoll,
      trade: this.trade,
      longestRoad: this.longestRoad,
      largestArmy: this.largestArmy,
      you,
      log: this.log.filter((e) => !e.to || (viewer && e.to.includes(viewer.id))).slice(-100)
        .map(({
          type, params, turn, ts,
        }) => ({
          type, params, turn, ts,
        })),
      results: this.phase === PHASES.GAME_OVER ? this.results : null,
    };
  }
}

module.exports = {
  CatanGame,
  CatanError,
  PHASES,
  STEPS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_SETTINGS,
  TURN_SEC_OPTIONS,
  COSTS,
  PIECES,
  DEV_DECK,
  PLAYER_COLORS,
  BANK_PER_RESOURCE,
  sanitizeSettings,
  handSize,
};
