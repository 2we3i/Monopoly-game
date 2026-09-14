// MafiaGame.js
// The authoritative Mafia engine: one instance per room.
//
// Two things shape this file. First, the server owns every decision -
// role assignment, night resolution, vote counting and the win check all
// happen here, and the client is only ever told the outcome. Second, and
// unlike the Monopoly mode where the whole state is public, a Mafia
// state is mostly SECRET: `toClientJSON(viewerId)` builds a different
// payload per player, and it is the only thing that ever reaches a
// socket. Nothing in the room broadcast contains a role the viewer has
// not earned the right to see.

const {
  TEAMS, CONFIGURABLE_ROLES, roleDef, isMafiaRole,
} = require('./roles');
const {
  MIN_PLAYERS, MAX_PLAYERS, cloneDefaults, mergeSettings, balancedRoles,
  clampRoles, civiliansFor, phaseDurations, modifierOn, rollChaos,
} = require('./settings');

class MafiaError extends Error {}

const PHASES = {
  LOBBY: 'LOBBY',
  ROLE_REVEAL: 'ROLE_REVEAL',
  NIGHT: 'NIGHT',
  DAY: 'DAY',
  VOTE: 'VOTE',
  RESULT: 'RESULT',
  GAME_OVER: 'GAME_OVER',
};

const ROLE_REVEAL_SEC = 8;
const RESULT_SEC = 7;

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function freshStats() {
  return { votes: 0, votesOnMafia: 0, votesReceived: 0, kills: 0, saves: 0, mafiaFound: 0 };
}

// Players restored from a save made before stats existed get a zeroed set.
function statsOf(player) {
  if (!player.stats) player.stats = freshStats();
  return player.stats;
}

class MafiaGame {
  constructor(roomCode, hostId, settings) {
    this.gameType = 'mafia';
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = mergeSettings(cloneDefaults(), settings || {});
    this.players = [];
    this.phase = PHASES.LOBBY;
    this.dayNumber = 0;
    this.phaseEndsAt = null;
    this.nightActions = {};
    this.votes = {};
    this.history = [];
    this.privateResults = {};
    this.lastNight = null;
    this.lastVote = null;
    this.winner = null;
    this.createdAt = Date.now();
    this.revoteCount = 0;
    this.immortalId = null;
    this.doubleVoteId = null;
    this.activeEvent = null;
  }

  // --- players -------------------------------------------------------

  get alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  addPlayer({ playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null }) {
    const existing = this.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      existing.left = false;
      if (nickname) existing.nickname = nickname;
      if (avatarUrl !== undefined) existing.avatarUrl = avatarUrl;
      return existing;
    }
    if (this.phase !== PHASES.LOBBY) throw new MafiaError('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new MafiaError(`A Mafia room holds at most ${MAX_PLAYERS} players.`);

    const player = {
      id: playerId,
      socketId,
      nickname,
      avatarUrl,
      accountId,
      guestKeyHash: accountId ? null : guestKeyHash,
      connected: true,
      isHost: this.players.length === 0 || playerId === this.hostId,
      ready: false,
      alive: true,
      role: null,
      deathDay: null,
      deathCause: null,
      killedBy: null,
      stats: freshStats(),
    };
    if (player.isHost) this.hostId = playerId;
    this.players.push(player);
    if (this.settings.autoBalance) this.rebalanceRoles();
    return player;
  }

  removePlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (this.phase === PHASES.LOBBY) {
      this.players = this.players.filter((p) => p.id !== playerId);
      if (player.isHost && this.players.length > 0) {
        // Only registered players may start a game.
        const heir = this.players.find((p) => p.accountId) || this.players[0];
        heir.isHost = true;
        this.hostId = heir.id;
      }
      if (this.settings.autoBalance) this.rebalanceRoles();
      return;
    }
    // Mid-game a departure is a death, not a deletion: the seat still
    // matters to every count the engine makes.
    if (player.alive) this.kill(player, 'LEFT', null);
    player.left = true;
    // The seat stays, but the host's powers (skip, restart) must not
    // leave with them or the room can never be moved on again.
    if (player.isHost) {
      player.isHost = false;
      const heir = this.players.find((p) => !p.left && p.accountId && p.connected)
        || this.players.find((p) => !p.left && p.accountId)
        || this.players.find((p) => !p.left && p.connected)
        || this.players.find((p) => !p.left);
      if (heir) {
        heir.isHost = true;
        this.hostId = heir.id;
      }
    }
  }

  setConnected(playerId, connected, socketId = null) {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    player.connected = connected;
    if (socketId) player.socketId = socketId;
    return player;
  }

  setReady(playerId, ready) {
    const player = this.getPlayer(playerId);
    if (!player) throw new MafiaError('Player not found.');
    if (this.phase !== PHASES.LOBBY) return player;
    player.ready = !!ready;
    return player;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw new MafiaError('Only the host can do that.');
  }

  // --- settings ------------------------------------------------------

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new MafiaError('Settings can only be changed before the game starts.');
    this.settings = mergeSettings(this.settings, patch);
    this.settings.roles = clampRoles(this.settings.roles, Math.max(this.players.length, MIN_PLAYERS));
    if (this.settings.autoBalance) this.rebalanceRoles();
    return this.settings;
  }

  replaceSettings(playerId, settings) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new MafiaError('Settings can only be changed before the game starts.');
    this.settings = mergeSettings(cloneDefaults(), settings || {});
    this.settings.roles = clampRoles(this.settings.roles, Math.max(this.players.length, MIN_PLAYERS));
    if (this.settings.autoBalance) this.rebalanceRoles();
    return this.settings;
  }

  rebalanceRoles() {
    const count = Math.max(this.players.length, MIN_PLAYERS);
    this.settings.roles = balancedRoles(count, this.settings.roles);
  }

  roleSummary() {
    const count = Math.max(this.players.length, MIN_PLAYERS);
    const roles = clampRoles(this.settings.roles, count);
    return { ...roles, CIVILIAN: civiliansFor(this.players.length, roles) };
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.LOBBY) throw new MafiaError('The game has already started.');
    if (this.players.length < MIN_PLAYERS) {
      throw new MafiaError(`Mafia needs at least ${MIN_PLAYERS} players.`);
    }

    // Chaos rerolls its companions once, at the moment the game begins,
    // so the lobby preview and the game agree for the whole match.
    this.settings = rollChaos(this.settings);
    this.assignRoles();

    if (modifierOn(this.settings, 'immortal')) {
      this.immortalId = pickRandom(this.players).id;
    }
    if (modifierOn(this.settings, 'doubleVote')) {
      this.doubleVoteId = pickRandom(this.players).id;
    }

    this.dayNumber = 0;
    this.logEvent('GAME_STARTED', {});
    this.enterPhase(PHASES.ROLE_REVEAL, ROLE_REVEAL_SEC);
    return this;
  }

  // Back to the lobby with the same table and the same rules, so a room
  // can play again without a new code. Players who walked out of the
  // finished game do not come along.
  restart(playerId) {
    this.assertHost(playerId);
    if (this.phase !== PHASES.GAME_OVER) throw new MafiaError('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => {
      p.role = null;
      p.alive = true;
      p.ready = false;
      p.deathDay = null;
      p.deathCause = null;
      p.killedBy = null;
      p.stats = freshStats();
    });
    Object.assign(this, {
      phase: PHASES.LOBBY,
      dayNumber: 0,
      phaseEndsAt: null,
      nightActions: {},
      votes: {},
      history: [],
      privateResults: {},
      lastNight: null,
      lastVote: null,
      winner: null,
      revoteCount: 0,
      immortalId: null,
      doubleVoteId: null,
      activeEvent: null,
    });
    this.settings.roles = clampRoles(this.settings.roles, Math.max(this.players.length, MIN_PLAYERS));
    if (this.settings.autoBalance) this.rebalanceRoles();
    return this;
  }

  assignRoles() {
    const count = this.players.length;
    let roles = clampRoles(this.settings.roles, count);
    if (modifierOn(this.settings, 'extraManiac')) {
      roles = clampRoles({ ...roles, MANIAC: (roles.MANIAC || 0) + 1 }, count);
    }

    const bag = [];
    CONFIGURABLE_ROLES.forEach((id) => {
      for (let i = 0; i < (roles[id] || 0); i += 1) bag.push(id);
    });
    while (bag.length < count) bag.push('CIVILIAN');
    bag.length = count;

    // "Random roles" throws the balanced bag away and deals from the
    // full set instead - deliberately unfair, which is the point.
    const dealt = modifierOn(this.settings, 'randomRoles')
      ? this.players.map((_, i) => (i === 0 ? 'MAFIA' : pickRandom(['CIVILIAN', 'MAFIA', 'SHERIFF', 'DOCTOR', 'MANIAC', 'CIVILIAN'])))
      : shuffle(bag);

    shuffle(this.players.map((p) => p.id)).forEach((id, i) => {
      const player = this.getPlayer(id);
      player.role = dealt[i] || 'CIVILIAN';
      player.alive = true;
      player.deathDay = null;
      player.deathCause = null;
      player.killedBy = null;
    });

    // A Don with no rank and file still needs to be able to shoot, and a
    // game with no mafia at all cannot end - guard both.
    if (!this.players.some((p) => isMafiaRole(p.role))) {
      pickRandom(this.players).role = 'MAFIA';
    }
  }

  enterPhase(phase, durationSec) {
    this.phase = phase;
    this.phaseEndsAt = durationSec ? Date.now() + durationSec * 1000 : null;
  }

  // --- night ---------------------------------------------------------

  beginNight() {
    this.dayNumber += 1;
    this.nightActions = {};
    this.activeEvent = null;
    if (modifierOn(this.settings, 'nightEvents') && Math.random() < 0.4) {
      this.activeEvent = pickRandom(['FOG', 'INSOMNIA', 'FULL_MOON']);
      this.logEvent('NIGHT_EVENT', { event: this.activeEvent });
    }
    if (modifierOn(this.settings, 'roleSwap') && this.dayNumber > 1 && Math.random() < 0.25) {
      this.swapTwoRoles();
    }
    const { nightSec } = phaseDurations(this.settings);
    this.enterPhase(PHASES.NIGHT, nightSec);
  }

  swapTwoRoles() {
    const alive = this.alivePlayers;
    if (alive.length < 2) return;
    const [a, b] = shuffle(alive).slice(0, 2);
    const tmp = a.role;
    a.role = b.role;
    b.role = tmp;
    this.logEvent('ROLE_SWAP', {});
    this.pushPrivate(a.id, 'ROLE_SWAPPED', { role: a.role });
    this.pushPrivate(b.id, 'ROLE_SWAPPED', { role: b.role });
  }

  canActAtNight(player) {
    if (!player || !player.alive) return false;
    if (this.phase !== PHASES.NIGHT) return false;
    return roleDef(player.role).actsAtNight;
  }

  // `secondary` is a role's second pick of the night - today only the
  // Don's sheriff check. Both picks live on the same night action.
  submitNightAction(playerId, targetId, { secondary = false } = {}) {
    const player = this.getPlayer(playerId);
    if (!this.canActAtNight(player)) throw new MafiaError('You have no action tonight.');
    const def = roleDef(player.role);
    if (secondary && !def.secondaryAction) throw new MafiaError('Your role has no second action.');
    const field = secondary ? 'secondaryTargetId' : 'targetId';
    const current = this.nightActions[playerId] || {};
    if (!this.settings.night.allowChangeTarget && current[field]) {
      throw new MafiaError('You cannot change your choice tonight.');
    }
    const target = this.getPlayer(targetId);
    if (!target || !target.alive) throw new MafiaError('Choose a living player.');

    const isSelf = target.id === player.id;
    if (isSelf) {
      const selfHealAllowed = !secondary && player.role === 'DOCTOR' && modifierOn(this.settings, 'doctorSelfHeal');
      if (!selfHealAllowed) throw new MafiaError('You cannot target yourself.');
    }
    if (!secondary && !this.settings.night.allowRepeatTarget) {
      const last = this.lastNight?.targetsByPlayer?.[playerId];
      if (last && last === targetId) throw new MafiaError('You cannot pick the same player two nights running.');
    }

    this.nightActions[playerId] = { ...current, action: def.action, [field]: targetId };
    return this.nightActions[playerId];
  }

  everyoneActed() {
    const actors = this.alivePlayers.filter((p) => roleDef(p.role).actsAtNight);
    return actors.length > 0 && actors.every((p) => {
      const act = this.nightActions[p.id];
      if (!act?.targetId) return false;
      return !roleDef(p.role).secondaryAction || !!act.secondaryTargetId;
    });
  }

  resolveNight() {
    const alive = this.alivePlayers;
    // With showOwnResult off, the sheriff, the Don and the doctor act
    // blind: the action still happens, they just are not told how it went.
    const tellActor = this.settings.night.showOwnResult;
    const targetsByPlayer = {};
    Object.entries(this.nightActions).forEach(([pid, act]) => {
      if (act.targetId) targetsByPlayer[pid] = act.targetId;
    });

    // 1. The mafia shoot as a team: the most-nominated player, with the
    //    Don's own pick breaking a tie.
    const mafiaVoters = alive.filter((p) => isMafiaRole(p.role));
    const tally = {};
    mafiaVoters.forEach((p) => {
      const t = this.nightActions[p.id]?.targetId;
      if (t) tally[t] = (tally[t] || 0) + 1;
    });
    let mafiaTarget = null;
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (best.length > 0) {
      const top = best.filter(([, n]) => n === best[0][1]).map(([id]) => id);
      if (top.length === 1) {
        [mafiaTarget] = top;
      } else {
        const don = mafiaVoters.find((p) => roleDef(p.role).decidesMafiaTie);
        const donPick = don && this.nightActions[don.id]?.targetId;
        mafiaTarget = donPick && top.includes(donPick) ? donPick : pickRandom(top);
      }
    }
    if (this.activeEvent === 'FOG') mafiaTarget = null; // nobody finds their way
    // Every member who nominated the chosen target pulled the trigger.
    const mafiaShooters = mafiaTarget
      ? mafiaVoters.filter((p) => this.nightActions[p.id]?.targetId === mafiaTarget).map((p) => p.id)
      : [];

    // 2. The doctor's save.
    const doctor = alive.find((p) => p.role === 'DOCTOR');
    const healedId = doctor ? this.nightActions[doctor.id]?.targetId || null : null;

    // 3. Every maniac acts alone.
    const maniacShots = alive
      .filter((p) => p.role === 'MANIAC' && this.nightActions[p.id]?.targetId)
      .map((p) => ({ targetId: this.nightActions[p.id].targetId, byId: p.id }));

    // 4. Investigations see the board as it stood before the shooting.
    alive.filter((p) => p.role === 'SHERIFF').forEach((sheriff) => {
      const targetId = this.nightActions[sheriff.id]?.targetId;
      if (!targetId) return;
      const target = this.getPlayer(targetId);
      if (!target) return;
      if (isMafiaRole(target.role)) statsOf(sheriff).mafiaFound += 1;
      if (!tellActor) return;
      this.pushPrivate(sheriff.id, 'CHECK_RESULT', {
        targetId,
        targetName: target.nickname,
        isMafia: isMafiaRole(target.role),
      });
    });
    alive.filter((p) => p.role === 'DON').forEach((don) => {
      const targetId = this.nightActions[don.id]?.secondaryTargetId;
      if (!targetId || !tellActor) return;
      const target = this.getPlayer(targetId);
      if (!target) return;
      this.pushPrivate(don.id, 'DON_CHECK_RESULT', {
        targetId, targetName: target.nickname, isSheriff: target.role === 'SHERIFF',
      });
    });

    // 5. Resolve the shots.
    const deaths = [];
    const attempt = (victimId, cause, byIds) => {
      if (!victimId) return;
      const victim = this.getPlayer(victimId);
      if (!victim || !victim.alive) return;
      if (victimId === healedId) {
        statsOf(doctor).saves += 1;
        if (tellActor) this.pushPrivate(doctor.id, 'HEAL_SAVED', { targetId: victimId, targetName: victim.nickname });
        return;
      }
      if (this.immortalId === victimId) {
        this.immortalId = null; // the charm is spent
        this.pushPrivate(victimId, 'SURVIVED_IMMORTAL', {});
        return;
      }
      this.kill(victim, cause, byIds);
      byIds.forEach((id) => { statsOf(this.getPlayer(id)).kills += 1; });
      deaths.push({ playerId: victim.id, name: victim.nickname, cause, role: victim.role });
    };

    attempt(mafiaTarget, 'MAFIA', mafiaShooters);
    maniacShots.forEach((shot) => attempt(shot.targetId, 'MANIAC', [shot.byId]));

    if (this.activeEvent === 'INSOMNIA') {
      const watcher = pickRandom(alive);
      const other = pickRandom(alive.filter((p) => p.id !== watcher.id) || alive);
      if (watcher && other) {
        this.pushPrivate(watcher.id, 'INSOMNIA_PEEK', {
          targetName: other.nickname, isMafia: isMafiaRole(other.role),
        });
      }
    }

    this.lastNight = {
      night: this.dayNumber,
      deaths,
      healedId,
      mafiaTarget,
      targetsByPlayer,
      event: this.activeEvent,
    };
    this.logEvent('NIGHT_RESOLVED', {
      night: this.dayNumber,
      deaths: deaths.map((d) => ({ name: d.name, cause: d.cause, role: d.role })),
    });

    if (this.checkWin()) return;
    this.enterPhase(PHASES.RESULT, RESULT_SEC);
  }

  // `killedBy` is the list of player ids responsible: the mafia members
  // who picked the target, the maniac, or everyone who voted for an
  // execution. Empty or null when nobody is (a player who left).
  kill(player, cause, killedBy) {
    player.alive = false;
    player.deathDay = this.dayNumber;
    player.deathCause = cause;
    player.killedBy = killedBy && killedBy.length ? [...killedBy] : null;
  }

  // --- day -----------------------------------------------------------

  beginDay() {
    this.votes = {};
    this.revoteCount = 0;
    const { discussionSec } = phaseDurations(this.settings);
    if (modifierOn(this.settings, 'dayEvents') && Math.random() < 0.3) {
      this.activeEvent = pickRandom(['TOWN_MEETING', 'PANIC']);
      this.logEvent('DAY_EVENT', { event: this.activeEvent });
    }
    this.enterPhase(PHASES.DAY, discussionSec);
  }

  beginVote() {
    this.votes = {};
    const { voteSec } = phaseDurations(this.settings);
    this.enterPhase(PHASES.VOTE, voteSec);
  }

  castVote(playerId, targetId) {
    if (this.phase !== PHASES.VOTE) throw new MafiaError('Voting is not open.');
    const voter = this.getPlayer(playerId);
    if (!voter || !voter.alive) throw new MafiaError('Only living players vote.');
    if (!this.settings.day.allowVoteChange && this.votes[playerId]) {
      throw new MafiaError('You cannot change your vote.');
    }
    if (targetId === 'SKIP') {
      if (!this.settings.day.allowAbstain) throw new MafiaError('Abstaining is disabled in this game.');
      this.votes[playerId] = 'SKIP';
      return this.votes[playerId];
    }
    const target = this.getPlayer(targetId);
    if (!target || !target.alive) throw new MafiaError('Choose a living player.');
    this.votes[playerId] = targetId;
    return this.votes[playerId];
  }

  everyoneVoted() {
    const voters = this.alivePlayers;
    return voters.length > 0 && voters.every((p) => this.votes[p.id]);
  }

  voteTally() {
    const tally = {};
    Object.entries(this.votes).forEach(([voterId, targetId]) => {
      if (targetId === 'SKIP') return;
      const weight = voterId === this.doubleVoteId ? 2 : 1;
      tally[targetId] = (tally[targetId] || 0) + weight;
    });
    return tally;
  }

  resolveVote() {
    const tally = this.voteTally();
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const aliveCount = this.alivePlayers.length;
    let executedId = null;
    let outcome = 'NO_EXECUTION';

    if (entries.length > 0) {
      const topVotes = entries[0][1];
      const tied = entries.filter(([, n]) => n === topVotes).map(([id]) => id);
      const majorityNeeded = Math.floor(aliveCount / 2) + 1;
      const hasEnough = this.settings.day.executionRule === 'MAJORITY' ? topVotes >= majorityNeeded : true;

      if (!hasEnough) {
        outcome = 'NO_MAJORITY';
      } else if (tied.length === 1) {
        [executedId] = tied;
        outcome = 'EXECUTED';
      } else if (this.settings.day.tieResolution === 'RANDOM') {
        executedId = pickRandom(tied);
        outcome = 'EXECUTED_RANDOM';
      } else if (this.settings.day.tieResolution === 'REVOTE' && this.revoteCount < 1) {
        this.revoteCount += 1;
        this.lastVote = { day: this.dayNumber, tally, outcome: 'REVOTE', tied };
        this.logEvent('VOTE_TIED', { day: this.dayNumber });
        this.beginVote();
        return;
      } else {
        outcome = 'TIE';
      }
    }

    // Stats count the ballots that stood when the vote closed, read
    // against the roles as they are now - before the execution below.
    Object.entries(this.votes).forEach(([voterId, targetId]) => {
      if (targetId === 'SKIP') return;
      const voter = this.getPlayer(voterId);
      const target = this.getPlayer(targetId);
      if (!voter || !target) return;
      statsOf(voter).votes += 1;
      if (isMafiaRole(target.role)) statsOf(voter).votesOnMafia += 1;
      statsOf(target).votesReceived += 1;
    });

    if (executedId) {
      const victim = this.getPlayer(executedId);
      const voters = Object.entries(this.votes).filter(([, t]) => t === executedId).map(([v]) => v);
      this.kill(victim, 'VOTE', voters);
      this.logEvent('EXECUTED', { name: victim.nickname, role: victim.role, day: this.dayNumber });
    } else {
      this.logEvent('NO_EXECUTION', { day: this.dayNumber });
    }

    this.lastVote = {
      day: this.dayNumber,
      tally,
      outcome,
      executedId,
      executedName: executedId ? this.getPlayer(executedId).nickname : null,
      executedRole: executedId ? this.getPlayer(executedId).role : null,
    };

    if (this.checkWin()) return;
    this.enterPhase(PHASES.RESULT, RESULT_SEC);
  }

  // --- win -----------------------------------------------------------

  checkWin() {
    const alive = this.alivePlayers;
    const mafia = alive.filter((p) => isMafiaRole(p.role));
    const maniacs = alive.filter((p) => p.role === 'MANIAC');
    const town = alive.filter((p) => roleDef(p.role).team === TEAMS.TOWN);
    const win = this.settings.win;

    if (alive.length === 0) return this.endGame('NOBODY');

    if (mafia.length === 0) {
      const maniacBlocks = win.maniacBlocksTownWin && maniacs.length > 0;
      if (!maniacBlocks) return this.endGame(TEAMS.TOWN);
    }

    if (maniacs.length > 0) {
      const others = alive.length - maniacs.length;
      if (others === 0) return this.endGame('MANIAC');
      if (win.maniacWinsAtParity && maniacs.length >= others && mafia.length === 0) {
        return this.endGame('MANIAC');
      }
    }

    if (mafia.length > 0) {
      const others = town.length + maniacs.length;
      if (win.mafiaWinsOnParity ? mafia.length >= others : others === 0) {
        return this.endGame(TEAMS.MAFIA);
      }
    }

    return null;
  }

  endGame(winner) {
    this.winner = winner;
    this.phase = PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.logEvent('GAME_OVER', { winner });
    return winner;
  }

  // The phase clock. The socket layer calls this when a phase timer runs
  // out or when everyone has acted; every transition in the game funnels
  // through here so there is exactly one description of the cycle:
  // reveal -> night -> result -> day -> vote -> result -> night ...
  advance() {
    switch (this.phase) {
      case PHASES.ROLE_REVEAL:
        this.beginNight();
        break;
      case PHASES.NIGHT:
        this.resolveNight();
        break;
      case PHASES.RESULT:
        if (this.winner) break;
        // A result screen after the night leads into the day, and after
        // the day's vote back into the night.
        if (this.lastVote && this.lastVote.day === this.dayNumber && this.lastNight?.night === this.dayNumber) {
          this.beginNight();
        } else {
          this.beginDay();
        }
        break;
      case PHASES.DAY:
        this.beginVote();
        break;
      case PHASES.VOTE:
        this.resolveVote();
        break;
      default:
        break;
    }
    return this.phase;
  }

  // --- history -------------------------------------------------------

  logEvent(type, params) {
    this.history.push({ type, params: params || {}, day: this.dayNumber, phase: this.phase, ts: Date.now() });
    if (this.history.length > 300) this.history.shift();
  }

  pushPrivate(playerId, type, params) {
    if (!playerId) return;
    if (!this.privateResults[playerId]) this.privateResults[playerId] = [];
    this.privateResults[playerId].push({ type, params: params || {}, night: this.dayNumber, ts: Date.now() });
  }

  // --- serialization -------------------------------------------------

  toJSON() {
    return {
      gameType: 'mafia',
      roomCode: this.roomCode,
      hostId: this.hostId,
      settings: this.settings,
      players: this.players,
      phase: this.phase,
      dayNumber: this.dayNumber,
      phaseEndsAt: this.phaseEndsAt,
      nightActions: this.nightActions,
      votes: this.votes,
      history: this.history,
      privateResults: this.privateResults,
      lastNight: this.lastNight,
      lastVote: this.lastVote,
      winner: this.winner,
      createdAt: this.createdAt,
      immortalId: this.immortalId,
      doubleVoteId: this.doubleVoteId,
      activeEvent: this.activeEvent,
      revoteCount: this.revoteCount,
    };
  }

  static fromJSON(data) {
    const game = new MafiaGame(data.roomCode, data.hostId, data.settings);
    Object.assign(game, {
      players: data.players || [],
      phase: data.phase || PHASES.LOBBY,
      dayNumber: data.dayNumber || 0,
      phaseEndsAt: data.phaseEndsAt || null,
      nightActions: data.nightActions || {},
      votes: data.votes || {},
      history: data.history || [],
      privateResults: data.privateResults || {},
      lastNight: data.lastNight || null,
      lastVote: data.lastVote || null,
      winner: data.winner || null,
      createdAt: data.createdAt || Date.now(),
      immortalId: data.immortalId || null,
      doubleVoteId: data.doubleVoteId || null,
      activeEvent: data.activeEvent || null,
      revoteCount: data.revoteCount || 0,
    });
    game.players.forEach((p) => { p.connected = false; p.socketId = null; });
    return game;
  }

  // Whether `viewer` is allowed to know `subject`'s role. This is the
  // single gate for the whole game's secrecy - every payload below asks
  // it rather than deciding for itself.
  canSeeRole(viewer, subject) {
    if (!viewer) return false;
    if (this.phase === PHASES.GAME_OVER) return true;
    if (viewer.id === subject.id) return true;
    if (!subject.alive && this.settings.info.revealRoleOnDeath) return true;
    // The mafia know their own.
    if (isMafiaRole(viewer.role) && isMafiaRole(subject.role)) return true;
    return false;
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId) || null;
    const inGame = this.phase !== PHASES.LOBBY;
    const secretVote = modifierOn(this.settings, 'secretVote');

    const players = this.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      isGuest: !p.accountId,
      connected: p.connected,
      isHost: p.isHost,
      ready: p.ready,
      alive: p.alive,
      deathDay: p.deathDay,
      deathCause: this.settings.info.showDeathCause ? p.deathCause : null,
      role: this.canSeeRole(viewer, p) ? p.role : null,
      // Voting is public by default; the secret-vote modifier hides who
      // is pointing at whom until the count is read out.
      votedFor: this.phase === PHASES.VOTE && !secretVote ? (this.votes[p.id] || null) : undefined,
      isYou: viewer ? p.id === viewer.id : false,
    }));

    const myAction = viewer ? this.nightActions[viewer.id] || null : null;
    const teammates = viewer && isMafiaRole(viewer.role)
      ? this.players.filter((p) => isMafiaRole(p.role)).map((p) => ({ id: p.id, nickname: p.nickname, role: p.role, alive: p.alive }))
      : [];
    // The mafia coordinate in the open among themselves.
    const mafiaPicks = viewer && isMafiaRole(viewer.role)
      ? Object.fromEntries(Object.entries(this.nightActions)
        .filter(([pid, act]) => act.targetId && isMafiaRole(this.getPlayer(pid)?.role))
        .map(([pid, act]) => [pid, act.targetId]))
      : {};
    const namesOf = (ids) => [].concat(ids || []).map((id) => this.getPlayer(id)?.nickname).filter(Boolean);

    return {
      gameType: 'mafia',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      dayNumber: this.dayNumber,
      phaseEndsAt: this.phaseEndsAt,
      settings: this.settings,
      roleSummary: this.roleSummary(),
      players,
      you: viewer
        ? {
          id: viewer.id,
          role: viewer.role,
          alive: viewer.alive,
          isHost: viewer.isHost,
          canActTonight: this.canActAtNight(viewer),
          action: roleDef(viewer.role).action || null,
          secondaryAction: roleDef(viewer.role).secondaryAction || null,
          myNightTarget: myAction?.targetId || null,
          myNightSecondary: myAction?.secondaryTargetId || null,
          myVote: this.votes[viewer.id] || null,
          teammates,
          mafiaPicks,
          results: this.privateResults[viewer.id] || [],
          hasDoubleVote: viewer.id === this.doubleVoteId,
        }
        : null,
      voteTally: this.phase === PHASES.VOTE && secretVote ? null
        : (this.settings.info.showVoteCounts ? this.voteTally() : null),
      lastNight: this.settings.info.showNightResults || this.phase === PHASES.GAME_OVER ? this.lastNight : null,
      lastVote: this.lastVote,
      history: this.settings.info.showHistory || this.phase === PHASES.GAME_OVER ? this.history : [],
      winner: this.winner,
      activeEvent: this.activeEvent,
      // Full role table - who killed whom included - only once the game
      // is decided.
      reveal: this.phase === PHASES.GAME_OVER
        ? this.players.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          role: p.role,
          alive: p.alive,
          deathDay: p.deathDay,
          deathCause: p.deathCause,
          killedBy: namesOf(p.killedBy),
          stats: this.settings.info.showPlayerStats ? { ...statsOf(p) } : null,
        }))
        : null,
      inGame,
    };
  }
}

module.exports = { MafiaGame, MafiaError, PHASES };
