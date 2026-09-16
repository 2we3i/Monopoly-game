// CitadelsGame.js
// The authoritative Citadels engine: one instance per room.
//
// A round has two halves. In the DRAFT, players pick roles one at a time,
// starting with the crown holder, each seeing only the cards still in the
// pool - and only when it is their own pick. In TURNS, roles are called in
// rank order; the holder of each role reveals it and plays a turn: take
// resources (2 gold, or draw and keep a card), use the role's power,
// collect income, build. The game ends after the round in which someone
// completes a city, and the richest city wins.
//
// Like Mafia, the state is mostly secret. `toClientJSON(viewerId)` builds
// a separate payload for each player; hands, the draft pool, unrevealed
// roles and the Assassin's and Thief's targets never appear in anyone
// else's payload. Every action is validated here against server state -
// a client only ever names which card, role or player it means.

const { ROLES, ROLE_ORDER, roleDef } = require('./roles');
const { TYPE_LIST, districtDef, deckList } = require('./districts');
const ABILITIES = require('./abilities');
const { CitadelsError } = require('./errors');

const PHASES = {
  LOBBY: 'LOBBY',
  DRAFT: 'DRAFT',
  TURNS: 'TURNS',
  GAME_OVER: 'GAME_OVER',
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 7;
const STARTING_GOLD = 2;
const STARTING_HAND = 4;
const OFFLINE_GRACE_SEC = 15;
const DEFAULT_SETTINGS = { turnSec: 90, draftSec: 30, citySize: 7 };

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
  return {
    turnSec: clampInt(src.turnSec ?? base.turnSec, 30, 300, base.turnSec),
    draftSec: clampInt(src.draftSec ?? base.draftSec, 10, 120, base.draftSec),
    citySize: clampInt(src.citySize ?? base.citySize, 6, 8, base.citySize),
  };
}

// How many roles lie face up (visibly out of play) each round, so the
// draft always leaves a real choice without running out of cards.
function faceUpCount(playerCount) {
  if (playerCount <= 4) return 2;
  if (playerCount === 5) return 1;
  return 0;
}

class CitadelsGame {
  constructor(roomCode, hostId, settings) {
    this.gameType = 'citadels';
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.players = [];
    this.phase = PHASES.LOBBY;
    this.round = 0;
    this.cards = {}; // uid -> districtId
    this.cardSeq = 0;
    this.deck = [];
    this.discardPile = [];
    this.draft = null;
    this.faceUp = [];
    this.faceDown = null;
    this.turn = null;
    this.turnRank = 0;
    this.called = {};
    this.assassinated = null;
    this.robbed = null;
    this.crownId = null;
    this.firstCompleterId = null;
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

  addPlayer({ playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null }) {
    const existing = this.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      existing.left = false;
      if (accountId) {
        existing.nickname = nickname || existing.nickname;
        existing.avatarUrl = avatarUrl;
      }
      return existing;
    }
    if (this.phase !== PHASES.LOBBY) throw new CitadelsError('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new CitadelsError(`A Citadels room holds at most ${MAX_PLAYERS} players.`);
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
      gold: 0,
      hand: [],
      city: [],
      role: null,
      completedRound: null,
      stats: { goldEarned: 0, roles: [] },
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
    if (this.phase === PHASES.LOBBY) {
      this.handOffHost(player);
      this.players = this.players.filter((p) => p.id !== playerId);
      return;
    }
    // Mid-game the seat stays - its city still scores - but its turns are
    // played automatically from now on.
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
    if (!player) throw new CitadelsError('Player not found.');
    if (this.phase === PHASES.LOBBY) player.ready = !!ready;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw new CitadelsError('Only the host can do that.');
  }

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new CitadelsError('Settings can only be changed before the game starts.');
    this.settings = sanitizeSettings(patch, this.settings);
    return this.settings;
  }

  // --- log -----------------------------------------------------------

  // `to` limits an entry to the listed players; null means everyone.
  addLog(type, params = {}, to = null) {
    this.log.push({ type, params, round: this.round, ts: Date.now(), to });
    if (this.log.length > 250) this.log.shift();
  }

  // --- cards ---------------------------------------------------------

  newCard(districtId) {
    this.cardSeq += 1;
    const uid = `c${this.cardSeq}`;
    this.cards[uid] = districtId;
    return uid;
  }

  drawCards(count) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      if (this.deck.length === 0 && this.discardPile.length > 0) {
        this.deck = shuffle(this.discardPile);
        this.discardPile = [];
      }
      if (this.deck.length === 0) break;
      out.push(this.deck.pop());
    }
    return out;
  }

  discard(uids) {
    this.discardPile.push(...uids);
  }

  cardView(uid) {
    return { uid, districtId: this.cards[uid] };
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new CitadelsError('The game has already started.');
    if (this.players.length < MIN_PLAYERS) throw new CitadelsError(`Citadels needs at least ${MIN_PLAYERS} players.`);

    this.cards = {};
    this.cardSeq = 0;
    this.deck = shuffle(deckList().map((id) => this.newCard(id)));
    this.discardPile = [];
    this.players.forEach((p) => {
      p.gold = STARTING_GOLD;
      p.hand = this.drawCards(STARTING_HAND);
      p.city = [];
      p.role = null;
      p.completedRound = null;
      p.stats = { goldEarned: 0, roles: [] };
    });
    this.crownId = this.players[Math.floor(Math.random() * this.players.length)].id;
    this.firstCompleterId = null;
    this.results = null;
    this.round = 0;
    this.log = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.addLog('GAME_STARTED', { crown: this.getPlayer(this.crownId).nickname });
    this.beginRound();
    return this;
  }

  beginRound() {
    this.round += 1;
    this.players.forEach((p) => { p.role = null; });
    this.assassinated = null;
    this.robbed = null;
    this.called = {};
    this.turn = null;
    this.turnRank = 0;

    const pool = shuffle(ROLE_ORDER);
    this.faceDown = pool.pop();
    this.faceUp = [];
    for (let i = 0; i < faceUpCount(this.players.length); i += 1) {
      // The King is never discarded face up: someone must be able to take
      // the crown.
      const idx = pool.findIndex((r) => r !== 'KING');
      if (idx === -1) break;
      this.faceUp.push(pool.splice(idx, 1)[0]);
    }

    const crownIndex = Math.max(0, this.players.findIndex((p) => p.id === this.crownId));
    const order = this.players.map((_, i) => this.players[(crownIndex + i) % this.players.length].id);
    this.draft = { order, index: 0, pool };
    this.phase = PHASES.DRAFT;
    this.addLog('ROUND_STARTED', { round: this.round, faceUp: this.faceUp });
    this.setDeadline(this.currentPicker(), this.settings.draftSec);
  }

  currentPicker() {
    if (this.phase !== PHASES.DRAFT || !this.draft) return null;
    return this.getPlayer(this.draft.order[this.draft.index]);
  }

  // The seventh player of a full table also gets the face-down card to
  // choose from, as in the tabletop rules - otherwise there would be one
  // role left for them and no choice at all.
  availableRoles() {
    if (!this.draft) return [];
    const last = this.draft.index === this.draft.order.length - 1;
    if (last && this.players.length === MAX_PLAYERS && this.faceDown) return [...this.draft.pool, this.faceDown];
    return [...this.draft.pool];
  }

  pickRole(playerId, roleId) {
    if (this.phase !== PHASES.DRAFT) throw new CitadelsError('Roles are not being chosen right now.');
    const picker = this.currentPicker();
    if (!picker || picker.id !== playerId) throw new CitadelsError('It is not your turn to choose.');
    if (!this.availableRoles().includes(roleId)) throw new CitadelsError('That role is not available.');

    if (this.draft.pool.includes(roleId)) {
      this.draft.pool = this.draft.pool.filter((r) => r !== roleId);
    } else {
      this.faceDown = null;
    }
    picker.role = roleId;
    picker.stats.roles.push(roleId);
    this.addLog('YOU_PICKED', { role: roleId }, [picker.id]);
    this.addLog('PLAYER_PICKED', { name: picker.nickname });

    this.draft.index += 1;
    if (this.draft.index >= this.draft.order.length) {
      this.beginTurns();
    } else {
      this.setDeadline(this.currentPicker(), this.settings.draftSec);
    }
  }

  beginTurns() {
    this.phase = PHASES.TURNS;
    this.turnRank = 0;
    this.draft = null;
    this.callNextRole();
  }

  giveCrown(player) {
    if (this.crownId !== player.id) {
      this.crownId = player.id;
      this.addLog('CROWN_TAKEN', { name: player.nickname });
    }
  }

  callNextRole() {
    this.turn = null;
    while (this.turnRank < ROLE_ORDER.length) {
      this.turnRank += 1;
      const roleId = ROLE_ORDER[this.turnRank - 1];
      const def = roleDef(roleId);

      if (this.faceUp.includes(roleId)) {
        this.called[roleId] = { state: 'faceUp' };
        continue;
      }
      const holder = this.players.find((p) => p.role === roleId);
      if (!holder) {
        this.called[roleId] = { state: 'absent' };
        this.addLog('ROLE_ABSENT', { role: roleId });
        continue;
      }
      if (this.assassinated === roleId) {
        this.called[roleId] = { state: 'killed', playerId: holder.id };
        this.addLog('ROLE_KILLED', { role: roleId, name: holder.nickname });
        // A murdered King is still crowned: the crown passes at the end
        // of the round either way.
        if (def.takesCrown) this.giveCrown(holder);
        continue;
      }

      this.called[roleId] = { state: 'active', playerId: holder.id };
      this.addLog('ROLE_CALLED', { role: roleId, name: holder.nickname });

      // The Thief strikes before the robbed player takes any resources.
      if (this.robbed === roleId) {
        const thief = this.players.find((p) => p.role === 'THIEF');
        if (thief && thief.id !== holder.id) {
          const amount = holder.gold;
          thief.gold += amount;
          thief.stats.goldEarned += amount;
          holder.gold = 0;
          this.called[roleId].robbed = true;
          this.addLog('ROBBED', { name: holder.nickname, thief: thief.nickname, amount });
        }
      }
      if (def.takesCrown) this.giveCrown(holder);

      this.turn = {
        rank: this.turnRank,
        roleId,
        playerId: holder.id,
        step: 'RESOURCE',
        drawn: [],
        built: 0,
        incomeTaken: false,
        abilityUsed: false,
        used: {},
      };
      if (def.turnStartCards) {
        const drawn = this.drawCards(def.turnStartCards);
        holder.hand.push(...drawn);
        this.addLog('EXTRA_CARDS', { name: holder.nickname, count: drawn.length });
      }
      this.setDeadline(holder, this.settings.turnSec);
      return;
    }
    this.endRound();
  }

  endRound() {
    this.turn = null;
    if (this.players.some((p) => p.city.length >= this.settings.citySize)) {
      this.endGame();
      return;
    }
    this.beginRound();
  }

  // --- deadlines -----------------------------------------------------

  setDeadline(player, seconds) {
    const sec = player && (!player.connected || player.left) ? Math.min(seconds, OFFLINE_GRACE_SEC) : seconds;
    this.phaseEndsAt = Date.now() + sec * 1000;
  }

  currentActorId() {
    if (this.phase === PHASES.DRAFT) return this.currentPicker()?.id || null;
    if (this.phase === PHASES.TURNS) return this.turn?.playerId || null;
    return null;
  }

  shortenDeadlineFor(player) {
    if (this.currentActorId() !== player.id || !this.phaseEndsAt) return;
    this.phaseEndsAt = Math.min(this.phaseEndsAt, Date.now() + OFFLINE_GRACE_SEC * 1000);
  }

  // The clock ran out on whoever was due to act: play the safest move for
  // them and keep the game moving.
  onTimeout() {
    if (this.phase === PHASES.DRAFT) {
      const picker = this.currentPicker();
      const options = this.availableRoles();
      if (picker && options.length) {
        this.pickRole(picker.id, options[Math.floor(Math.random() * options.length)]);
        this.addLog('AUTO_PICK', { name: picker.nickname });
      }
      return;
    }
    if (this.phase === PHASES.TURNS && this.turn) {
      this.endTurn(this.turn.playerId, { auto: true });
    }
  }

  // --- turn actions --------------------------------------------------

  assertTurn(playerId) {
    if (this.phase !== PHASES.TURNS || !this.turn) throw new CitadelsError('No turn is being played.');
    if (this.turn.playerId !== playerId) throw new CitadelsError('It is not your turn.');
    return this.getPlayer(playerId);
  }

  assertStep(step, message) {
    if (this.turn.step !== step) throw new CitadelsError(message);
  }

  hasDistrict(player, predicate) {
    return player.city.some((c) => predicate(districtDef(c.districtId)));
  }

  gainGold(player, amount) {
    player.gold += amount;
    player.stats.goldEarned += amount;
  }

  resourceBonus(player) {
    const bonus = roleDef(player.role)?.resourceBonusGold || 0;
    if (bonus) this.gainGold(player, bonus);
    return bonus;
  }

  takeGold(playerId) {
    const player = this.assertTurn(playerId);
    this.assertStep('RESOURCE', 'You have already taken resources this turn.');
    this.gainGold(player, 2);
    const bonus = this.resourceBonus(player);
    this.turn.step = 'ACTION';
    this.addLog('TOOK_GOLD', { name: player.nickname, amount: 2 + bonus });
  }

  drawForResources(playerId) {
    const player = this.assertTurn(playerId);
    this.assertStep('RESOURCE', 'You have already taken resources this turn.');
    const extra = this.hasDistrict(player, (d) => d.special?.drawExtra) ? 1 : 0;
    const drawn = this.drawCards(2 + extra);
    if (drawn.length === 0) throw new CitadelsError('The deck is empty - take gold instead.');
    const bonus = this.resourceBonus(player);
    if (this.hasDistrict(player, (d) => d.special?.keepAllDrawn) || drawn.length === 1) {
      player.hand.push(...drawn);
      this.turn.step = 'ACTION';
    } else {
      this.turn.drawn = drawn;
      this.turn.step = 'CHOOSE';
    }
    this.addLog('DREW_CARDS', { name: player.nickname, bonus });
  }

  keepCard(playerId, cardUid) {
    const player = this.assertTurn(playerId);
    this.assertStep('CHOOSE', 'There is no card to choose.');
    if (!this.turn.drawn.includes(cardUid)) throw new CitadelsError('Choose one of the cards you drew.');
    player.hand.push(cardUid);
    this.discard(this.turn.drawn.filter((uid) => uid !== cardUid));
    this.turn.drawn = [];
    this.turn.step = 'ACTION';
  }

  collectIncome(playerId) {
    const player = this.assertTurn(playerId);
    if (this.turn.step === 'CHOOSE') throw new CitadelsError('Keep a card first.');
    if (this.turn.incomeTaken) throw new CitadelsError('You have already collected income this turn.');
    const def = roleDef(player.role);
    if (!def.incomeType) throw new CitadelsError('Your role collects no income.');
    const amount = player.city.filter((c) => {
      const d = districtDef(c.districtId);
      return d.type === def.incomeType || d.special?.wildIncome;
    }).length;
    this.gainGold(player, amount);
    this.turn.incomeTaken = true;
    this.addLog('INCOME', { name: player.nickname, amount });
  }

  build(playerId, cardUid) {
    const player = this.assertTurn(playerId);
    this.assertStep('ACTION', 'Take resources before building.');
    if (!player.hand.includes(cardUid)) throw new CitadelsError('That card is not in your hand.');
    const limit = roleDef(player.role)?.buildLimit || 1;
    if (this.turn.built >= limit) throw new CitadelsError(`You can build ${limit} district${limit > 1 ? 's' : ''} per turn.`);
    const def = districtDef(this.cards[cardUid]);
    if (player.city.some((c) => c.districtId === def.id)) throw new CitadelsError('You already have that district.');
    if (player.gold < def.cost) throw new CitadelsError(`${def.name.en} costs ${def.cost} gold.`);

    player.gold -= def.cost;
    player.hand = player.hand.filter((uid) => uid !== cardUid);
    player.city.push({ uid: cardUid, districtId: def.id, round: this.round });
    this.turn.built += 1;
    this.addLog('BUILT', { name: player.nickname, districtId: def.id, cost: def.cost });

    if (player.city.length >= this.settings.citySize && player.completedRound === null) {
      player.completedRound = this.round;
      if (!this.firstCompleterId) this.firstCompleterId = player.id;
      this.addLog('CITY_COMPLETE', { name: player.nickname });
    }
  }

  useAbility(playerId, payload = {}) {
    const player = this.assertTurn(playerId);
    if (this.turn.step === 'CHOOSE') throw new CitadelsError('Keep a card first.');
    const def = roleDef(player.role);
    const ability = def?.ability && ABILITIES[def.ability];
    if (!ability) throw new CitadelsError('Your role has no power to use.');
    if (this.turn.abilityUsed) throw new CitadelsError('You have already used your power this turn.');
    ability(this, player, payload);
    this.turn.abilityUsed = true;
  }

  useDistrict(playerId, { districtId, cardUid } = {}) {
    const player = this.assertTurn(playerId);
    this.assertStep('ACTION', 'Take resources first.');
    const owned = player.city.find((c) => c.districtId === districtId);
    const def = owned && districtDef(owned.districtId);
    if (!def?.special?.activated) throw new CitadelsError('You have no such district to use.');
    if (this.turn.used[districtId]) throw new CitadelsError('You have already used it this turn.');

    if (def.special.activated === 'SMITHY') {
      if (player.gold < 2) throw new CitadelsError('The Smithy costs 2 gold.');
      player.gold -= 2;
      const drawn = this.drawCards(3);
      player.hand.push(...drawn);
      this.addLog('USED_SMITHY', { name: player.nickname, count: drawn.length });
    } else if (def.special.activated === 'LABORATORY') {
      if (!player.hand.includes(cardUid)) throw new CitadelsError('Choose a card from your hand to discard.');
      player.hand = player.hand.filter((uid) => uid !== cardUid);
      this.discard([cardUid]);
      this.gainGold(player, 1);
      this.addLog('USED_LABORATORY', { name: player.nickname });
    }
    this.turn.used[districtId] = true;
  }

  endTurn(playerId, { auto = false } = {}) {
    const player = this.assertTurn(playerId);
    // A turn cannot be walked away from half-done: resources are taken
    // and a drawn card is kept before the next role is called.
    if (this.turn.step === 'RESOURCE') {
      if (!auto) throw new CitadelsError('Take resources before ending your turn.');
      this.takeGold(playerId);
    }
    if (this.turn.step === 'CHOOSE') {
      if (!auto) throw new CitadelsError('Keep one of the cards you drew first.');
      this.keepCard(playerId, this.turn.drawn[0]);
    }
    if (auto) this.addLog('AUTO_TURN', { name: player.nickname });
    this.callNextRole();
  }

  // --- end -----------------------------------------------------------

  scoreFor(player) {
    const defs = player.city.map((c) => districtDef(c.districtId));
    const base = defs.reduce((sum, d) => sum + d.cost + (d.special?.scoreBonus || 0), 0);
    const haunted = defs.some((d) => d.special?.wildScoringType);
    const types = new Set(defs.filter((d) => !d.special?.wildScoringType).map((d) => d.type));
    const missing = TYPE_LIST.filter((t) => !types.has(t)).length;
    const diversity = missing === 0 || (haunted && missing === 1) ? 3 : 0;
    let completion = 0;
    if (player.id === this.firstCompleterId) completion = 4;
    else if (player.city.length >= this.settings.citySize) completion = 2;
    return { base, diversity, completion, total: base + diversity + completion };
  }

  endGame() {
    const standings = this.players.map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      gold: p.gold,
      buildings: p.city.length,
      role: p.role,
      roleRank: roleDef(p.role)?.rank || 0,
      ...this.scoreFor(p),
    }));
    // Ties go to the richer player, then to the higher role this round.
    standings.sort((a, b) => b.total - a.total || b.gold - a.gold || b.roleRank - a.roleRank);
    this.results = { standings, winnerId: standings[0]?.playerId || null };
    this.phase = PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.endedAt = Date.now();
    this.turn = null;
    this.addLog('GAME_OVER', { name: standings[0]?.nickname || '' });
  }

  restart(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.GAME_OVER) throw new CitadelsError('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => {
      Object.assign(p, {
        ready: false, gold: 0, hand: [], city: [], role: null, completedRound: null, stats: { goldEarned: 0, roles: [] },
      });
    });
    Object.assign(this, {
      phase: PHASES.LOBBY,
      round: 0,
      deck: [],
      discardPile: [],
      cards: {},
      draft: null,
      faceUp: [],
      faceDown: null,
      turn: null,
      turnRank: 0,
      called: {},
      assassinated: null,
      robbed: null,
      firstCompleterId: null,
      results: null,
      log: [],
      startedAt: null,
      endedAt: null,
      phaseEndsAt: null,
    });
  }

  // --- serialization -------------------------------------------------

  toJSON() {
    const {
      gameType, roomCode, hostId, settings, players, phase, round, cards, cardSeq, deck, discardPile, draft,
      faceUp, faceDown, turn, turnRank, called, assassinated, robbed, crownId, firstCompleterId, results, log,
      createdAt, startedAt, endedAt, phaseEndsAt,
    } = this;
    return {
      gameType, roomCode, hostId, settings, players, phase, round, cards, cardSeq, deck, discardPile, draft,
      faceUp, faceDown, turn, turnRank, called, assassinated, robbed, crownId, firstCompleterId, results, log,
      createdAt, startedAt, endedAt, phaseEndsAt,
    };
  }

  static fromJSON(data) {
    const game = new CitadelsGame(data.roomCode, data.hostId, data.settings);
    const fields = [
      'players', 'phase', 'round', 'cards', 'cardSeq', 'deck', 'discardPile', 'draft', 'faceUp', 'faceDown', 'turn',
      'turnRank', 'called', 'assassinated', 'robbed', 'crownId', 'firstCompleterId', 'results', 'log', 'createdAt',
      'startedAt', 'endedAt', 'phaseEndsAt',
    ];
    fields.forEach((f) => { if (data[f] !== undefined) game[f] = data[f]; });
    game.players.forEach((p) => { p.connected = false; p.socketId = null; });
    return game;
  }

  // What `viewer` may know about `subject`'s role right now.
  roleVisibleTo(viewer, subject) {
    if (this.phase === PHASES.GAME_OVER) return true;
    if (viewer && viewer.id === subject.id) return true;
    // A role becomes public the moment the engine calls it.
    return Object.values(this.called).some((c) => c.playerId === subject.id);
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId);
    const inTurns = this.phase === PHASES.TURNS && this.turn;
    const picker = this.currentPicker();

    const players = this.players.map((p) => {
      const roleVisible = p.role && this.roleVisibleTo(viewer, p);
      const calledEntry = Object.values(this.called).find((c) => c.playerId === p.id);
      return {
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
        gold: p.gold,
        handCount: p.hand.length,
        city: p.city.map((c) => ({ uid: c.uid, districtId: c.districtId })),
        crown: p.id === this.crownId,
        hasPicked: this.phase === PHASES.DRAFT ? !!p.role : undefined,
        role: roleVisible ? p.role : null,
        killed: calledEntry?.state === 'killed',
        robbed: !!calledEntry?.robbed,
        completed: p.completedRound !== null,
        isCurrent: this.currentActorId() === p.id,
        isYou: viewer ? p.id === viewer.id : false,
      };
    });

    // The track of all roles in calling order. A role's holder appears
    // only once the role has been called.
    const roleTrack = ROLE_ORDER.map((id) => {
      const entry = this.called[id];
      let state = 'pending';
      if (this.faceUp.includes(id)) state = 'faceUp';
      else if (entry) state = entry.state === 'active' ? 'called' : entry.state;
      if (inTurns && this.turn.roleId === id) state = 'current';
      return { id, rank: ROLES[id].rank, state, playerId: entry?.playerId || null };
    });

    const isYourTurn = !!(viewer && inTurns && this.turn.playerId === viewer.id);
    const you = viewer
      ? {
        id: viewer.id,
        isHost: viewer.isHost,
        role: viewer.role,
        gold: viewer.gold,
        hand: viewer.hand.map((uid) => this.cardView(uid)),
        isYourTurn,
        canPick: !!(picker && picker.id === viewer.id),
        draftOptions: picker && picker.id === viewer.id ? this.availableRoles() : null,
        drawn: isYourTurn && this.turn.step === 'CHOOSE' ? this.turn.drawn.map((uid) => this.cardView(uid)) : null,
        turn: isYourTurn
          ? {
            step: this.turn.step,
            built: this.turn.built,
            buildLimit: roleDef(viewer.role)?.buildLimit || 1,
            incomeTaken: this.turn.incomeTaken,
            abilityUsed: this.turn.abilityUsed,
            used: this.turn.used,
          }
          : null,
        // Your own secret choice this round, and nobody else's.
        secretTarget: viewer.role === 'ASSASSIN' ? this.assassinated : viewer.role === 'THIEF' ? this.robbed : null,
      }
      : null;

    return {
      gameType: 'citadels',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      players,
      deckCount: this.deck.length,
      faceUp: this.faceUp,
      draft: this.phase === PHASES.DRAFT
        ? { pickerId: picker?.id || null, order: this.draft.order, poolCount: this.availableRoles().length }
        : null,
      roleTrack,
      turn: inTurns
        ? { roleId: this.turn.roleId, playerId: this.turn.playerId, step: this.turn.step === 'CHOOSE' ? 'RESOURCE' : this.turn.step, built: this.turn.built }
        : null,
      you,
      log: this.log.filter((e) => !e.to || (viewer && e.to.includes(viewer.id))).slice(-80)
        .map(({ type, params, round, ts }) => ({ type, params, round, ts })),
      results: this.phase === PHASES.GAME_OVER ? this.results : null,
    };
  }
}

module.exports = {
  CitadelsGame, CitadelsError, PHASES, MIN_PLAYERS, MAX_PLAYERS, DEFAULT_SETTINGS, sanitizeSettings,
};
