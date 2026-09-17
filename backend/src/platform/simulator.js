// simulator.js
// Test runs for the Creator: whole games played by bots entirely in
// memory, on the mode's current (or a draft) configuration. Nothing here
// touches a database, a socket, a wallet or the match history - the engines
// are created directly, never through the RoomManager.
//
// Each game is driven the way the server itself keeps a game moving: the
// engine's own timeout move (onTimeout) for turn-based games, the phase
// clock (advance) for party games, and a simple bot for the choices those
// do not make (Monopoly purchases, Mafia votes, party answers). A run
// reports how many games finished, how long they took in steps, who won,
// every error with its stack, and invariant checks per game.

/* eslint-disable global-require */
const modeConfig = require('./modeConfig');

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function botPlayers(count) {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `bot${i + 1}`,
    socketId: null,
    nickname: `Bot ${i + 1}`,
    accountId: null,
    guestKeyHash: null,
  }));
}

function readyAll(game, players) {
  players.forEach((p) => {
    try {
      game.setReady(p.playerId, true);
    } catch { /* not every lobby has a ready flag for everyone */ }
  });
}

// --- per-game drivers -----------------------------------------------------------

function monopolyGame({ layoutId, players, maxSteps, config }) {
  const { GameManager } = require('../game/GameManager');
  const options = config ? { rules: config.rules, decks: config.decks } : modeConfig.monopolyOptions(layoutId);
  const mgr = new GameManager('SIM00', 'bot1', layoutId, options);
  mgr.clock = () => mgr.__now;
  mgr.__now = Date.now();
  botPlayers(players).forEach((p) => mgr.addPlayer(p));
  mgr.startGame('bot1');
  const { state } = mgr;
  const checks = [];
  let steps = 0;
  const moneyInvariant = () => state.players.every((p) => Number.isFinite(p.money));
  // Bots drop out of auctions, so the square goes to the last bidder or
  // back to the bank when the clock runs out.
  const settleAuctions = () => {
    let guard = 0;
    while (state.auction && guard < 50) {
      guard += 1;
      const { auction } = state;
      const quitter = auction.participants.find((id) => !auction.withdrawn.includes(id) && id !== auction.highestBidderId && !state.getPlayer(id).bankrupt);
      if (quitter) {
        mgr.withdrawFromAuction(quitter, auction.id);
      } else {
        mgr.__now = auction.endsAt + 1;
        mgr.tickAuction(mgr.__now);
      }
    }
  };
  while (state.phase !== 'GAME_OVER' && steps < maxSteps) {
    steps += 1;
    mgr.__now += 1000;
    settleAuctions();
    const actor = state.currentPlayer;
    if (!actor) break;
    if (actor.bankrupt) {
      mgr.advanceTurn();
      continue; // eslint-disable-line no-continue
    }
    if (state.phase === 'ROLLING') {
      if (actor.inJail && actor.money >= state.rules.jailFine && Math.random() < 0.5) mgr.payJailFine(actor.id);
      mgr.rollDice(actor.id);
    }
    const pending = state.pendingAction;
    if (pending?.type === 'BUY_DECISION' && pending.playerId === actor.id) {
      const tile = state.layout.board[pending.tileId];
      if (actor.money >= tile.price && Math.random() < 0.8) mgr.buyProperty(actor.id, pending.tileId);
      else mgr.declinePurchase(actor.id, pending.tileId);
    }
    if (state.pendingAction?.type === 'CARD_REVEAL') mgr.acknowledgeCard(actor.id);
    settleAuctions();
    Object.entries(state.properties).forEach(([tileId, prop]) => {
      if (prop.ownerId === actor.id && actor.money > 250 && Math.random() < 0.7) {
        try {
          mgr.buildHouse(actor.id, Number(tileId));
        } catch { /* not buildable */ }
      }
    });
    settleAuctions();
    if (actor.money < 0) mgr.declareBankruptcy(actor.id);
    else if (state.phase === 'ACTION' && state.currentPlayer?.id === actor.id) mgr.endTurn(actor.id);
    if (!moneyInvariant()) checks.push('a balance stopped being a number');
  }
  const winner = state.winnerId ? state.getPlayer(state.winnerId)?.nickname : null;
  return {
    finished: state.phase === 'GAME_OVER', steps, winner, rounds: state.round, checks,
  };
}

function turnGame(Engine, { players, maxSteps, settings, host = 'bot1' }) {
  const game = new Engine('SIM00', host, settings);
  const seats = botPlayers(players);
  seats.forEach((p) => game.addPlayer(p));
  readyAll(game, seats);
  game.start(host);
  let steps = 0;
  while (game.phase !== 'GAME_OVER' && steps < maxSteps) {
    steps += 1;
    game.onTimeout();
  }
  return { game, steps, finished: game.phase === 'GAME_OVER' };
}

function citadelsGame({ players, maxSteps, settings }) {
  const { CitadelsGame, PHASES } = require('../citadels/CitadelsGame');
  const { districtDef } = require('../citadels/districts');
  const game = new CitadelsGame('SIM00', 'bot1', settings);
  const seats = botPlayers(players);
  seats.forEach((p) => game.addPlayer(p));
  readyAll(game, seats);
  game.start('bot1');
  let steps = 0;
  const checks = [];
  while (game.phase !== PHASES.GAME_OVER && steps < maxSteps) {
    steps += 1;
    if (game.phase === PHASES.DRAFT) {
      game.pickRole(game.currentPicker().id, pick(game.availableRoles()));
      continue; // eslint-disable-line no-continue
    }
    const actor = game.getPlayer(game.turn.playerId);
    if (Math.random() < 0.5) game.takeGold(actor.id);
    else {
      try {
        game.drawForResources(actor.id);
      } catch {
        game.takeGold(actor.id);
      }
      if (game.turn.step === 'CHOOSE') game.keepCard(actor.id, game.turn.drawn[0]);
    }
    try {
      game.collectIncome(actor.id);
    } catch { /* a role without income */ }
    const affordable = actor.hand.find((uid) => {
      const d = districtDef(game.cards[uid]);
      return d.cost <= actor.gold && !actor.city.some((c) => c.districtId === d.id);
    });
    if (affordable) game.build(actor.id, affordable);
    game.endTurn(actor.id);
    if (game.players.some((p) => p.gold < 0)) checks.push('gold went below zero');
  }
  return {
    finished: game.phase === PHASES.GAME_OVER, steps, winner: winnerName(game), checks: [...new Set(checks)],
  };
}

function catanGame({ players, maxSteps, settings }) {
  const { CatanGame, PHASES } = require('../catan/CatanGame');
  const { RESOURCES } = require('../catan/board');
  const game = new CatanGame('SIM00', 'bot1', { ...(settings || {}), turnSec: 0 });
  const seats = botPlayers(players);
  seats.forEach((p) => game.addPlayer(p));
  readyAll(game, seats);
  game.start('bot1');
  const tryDo = (fn) => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };
  while (game.phase === PHASES.SETUP) {
    const id = game.setup.order[game.setup.index];
    if (game.setup.step === 'SETTLEMENT') game.buildSettlement(id, pick(game.legalSettlementVertices(id)));
    else game.buildRoad(id, pick(game.legalRoadEdges(id)));
  }
  let steps = 0;
  while (game.phase === PHASES.PLAY && steps < maxSteps) {
    steps += 1;
    const id = game.turn.playerId;
    const me = game.getPlayer(id);
    const step = game.turn.step;
    if (step === 'ROLL') {
      game.rollDice(id);
      continue; // eslint-disable-line no-continue
    }
    if (step === 'DISCARD') {
      Object.entries({ ...game.turn.discards }).forEach(([pid, count]) => {
        const pl = game.getPlayer(pid);
        const pool = RESOURCES.flatMap((r) => Array(pl.resources[r]).fill(r));
        const chosen = {};
        for (let i = 0; i < count; i += 1) {
          const r = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
          chosen[r] = (chosen[r] || 0) + 1;
        }
        game.discard(pid, chosen);
      });
      continue; // eslint-disable-line no-continue
    }
    if (step === 'ROBBER') {
      game.moveRobber(id, pick(game.legalRobberHexes()));
      continue; // eslint-disable-line no-continue
    }
    if (step === 'STEAL') {
      game.steal(id, pick(game.turn.stealFrom));
      continue; // eslint-disable-line no-continue
    }
    let acted = true;
    let guard = 0;
    while (acted && game.phase === PHASES.PLAY && game.turn.step === 'MAIN' && game.turn.playerId === id && guard < 30) {
      guard += 1;
      acted = false;
      const cities = game.legalCityVertices(id);
      if (cities.length && tryDo(() => game.buildCity(id, pick(cities)))) { acted = true; continue; } // eslint-disable-line no-continue
      const spots = game.legalSettlementVertices(id);
      if (spots.length && tryDo(() => game.buildSettlement(id, pick(spots)))) { acted = true; continue; } // eslint-disable-line no-continue
      const roads = game.legalRoadEdges(id);
      if (roads.length && (game.turn.freeRoads > 0 || spots.length === 0) && tryDo(() => game.buildRoad(id, pick(roads)))) { acted = true; continue; } // eslint-disable-line no-continue
      if (game.devDeck.length && Math.random() < 0.5 && tryDo(() => game.buyDevCard(id))) { acted = true; continue; } // eslint-disable-line no-continue
      const rates = game.tradeRates(id);
      const surplus = RESOURCES.find((r) => me.resources[r] >= rates[r] + 1);
      const need = RESOURCES.filter((r) => me.resources[r] === 0 && game.bank[r] > 0);
      if (surplus && need.length && tryDo(() => game.bankTrade(id, surplus, pick(need)))) acted = true;
    }
    if (game.phase === PHASES.PLAY && game.turn.step === 'MAIN' && game.turn.playerId === id) game.endTurn(id);
  }
  return {
    finished: game.phase === PHASES.GAME_OVER, steps, winner: winnerName(game), checks: [],
  };
}

function throneGame({ players, maxSteps, settings }) {
  const { ThroneGame, PHASES } = require('../throne/ThroneGame');
  const game = new ThroneGame('SIM00', 'bot1', { ...(settings || {}), turnSec: 0 });
  const seats = botPlayers(Math.max(2, players));
  seats.forEach((p) => game.addPlayer(p));
  readyAll(game, seats);
  game.start('bot1');
  // Every lord leaves: the computer plays each house to the end.
  game.players.forEach((p) => game.removePlayer(p.id));
  let steps = 0;
  while (game.phase === PHASES.PLAY && steps < maxSteps) {
    game.aiAt = Date.now() - 1;
    game.phaseEndsAt = game.phaseEndsAt ? Date.now() - 1 : null;
    game.onTimeout();
    steps += 1;
  }
  return {
    finished: game.phase === PHASES.GAME_OVER, steps, winner: winnerName(game), checks: [],
  };
}

function cosmicGame({ players, maxSteps, settings }) {
  const { CosmicGame, PHASES } = require('../cosmic/CosmicGame');
  const game = new CosmicGame('SIM00', 'bot1', { ...(settings || {}), turnSec: 0 });
  const seats = botPlayers(players);
  seats.forEach((p) => game.addPlayer(p));
  readyAll(game, seats);
  game.start('bot1');
  const tryDo = (fn) => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };
  game.players.forEach((p) => game.chooseAlien(p.id, pick(p.alienOptions)));
  let steps = 0;
  while (game.phase === PHASES.PLAY && steps < maxSteps) {
    steps += 1;
    const e = game.enc;
    if (e.phase === 'ALLIANCE' && e.step === 'ACCEPT') {
      const id = e.acceptOrder[e.acceptIndex];
      const ch = game.allianceChoices(id);
      const sides = ['offense', 'defense'].filter((side) => ch[side]);
      if (sides.length && Math.random() < 0.6) game.respondAlliance(id, { side: pick(sides), ships: game.autoSelection(id, Math.min(game.sendLimit(id), 2)) });
      else game.respondAlliance(id, { side: null });
    } else if (e.phase === 'ALLIANCE') {
      game.invite(e.step === 'INVITE_OFFENSE' ? e.aggressorId : e.defenderId, game.players.filter(() => Math.random() < 0.5).map((p) => p.id));
    } else if (e.phase === 'RESOLUTION' && e.step === 'DEAL' && Math.random() < 0.6) {
      const by = pick(game.mainIds());
      if (tryDo(() => game.proposeDeal(by, { take: 1, give: game.getPlayer(by).hand.slice(0, 1) }))) {
        game.acceptDeal(game.opponentOf(by), game.enc.deal.proposal.id);
      } else game.onTimeout();
    } else if (e.phase === 'RESOLUTION' && e.step === 'NEXT') {
      game.continueTurn(e.aggressorId, Math.random() < 0.8);
    } else {
      game.onTimeout();
    }
  }
  return {
    finished: game.phase === PHASES.GAME_OVER, steps, winner: winnerName(game), checks: [],
  };
}

function winnerName(game) {
  const results = game.results || {};
  if (results.winner) return typeof results.winner === 'string' ? results.winner : results.winner.nickname || null;
  const ids = results.winnerIds || (results.winnerId ? [results.winnerId] : null);
  if (ids && typeof game.getPlayer === 'function') {
    const names = ids.map((id) => game.getPlayer(id)?.nickname).filter(Boolean);
    if (names.length) return names.join(', ');
  }
  const rows = results.standings || results.players || [];
  const top = rows.find((p) => p.place === 1 || p.result === 'win' || p.winner);
  return top ? (top.nickname || top.house || top.name || null) : null;
}

function mafiaGame({ players, maxSteps, settings }) {
  const { MafiaGame } = require('../mafia/MafiaGame');
  const game = new MafiaGame('SIM00', 'bot1', settings);
  const seats = botPlayers(players);
  seats.forEach((p) => game.addPlayer(p));
  readyAll(game, seats);
  game.start('bot1');
  let steps = 0;
  while (game.phase !== 'GAME_OVER' && steps < maxSteps) {
    steps += 1;
    const alive = game.players.filter((p) => p.alive !== false && p.status !== 'dead');
    if (game.phase === 'NIGHT') {
      alive.forEach((p) => {
        try {
          if (game.canActAtNight(p)) game.submitNightAction(p.id, pick(alive.filter((o) => o.id !== p.id)).id);
        } catch { /* this role does not act, or not at this target */ }
      });
    }
    if (game.phase === 'VOTE') {
      alive.forEach((p) => {
        try {
          game.castVote(p.id, pick(alive.filter((o) => o.id !== p.id)).id);
        } catch { /* may not vote */ }
      });
    }
    game.advance();
  }
  return {
    finished: game.phase === 'GAME_OVER', steps, winner: game.winner || null, checks: [],
  };
}

function partyGame(Engine, kind, { players, maxSteps, settings }) {
  const game = new Engine('SIM00', 'bot1', settings);
  const seats = botPlayers(players);
  seats.forEach((p) => game.addPlayer({ ...p, device: 'phone' }));
  readyAll(game, seats);
  game.start('bot1');
  let steps = 0;
  const words = ['кот', 'пицца', 'понедельник', 'ракета', 'чайник', 'дождь', 'мем'];
  while (!game.isOver && steps < maxSteps) {
    steps += 1;
    const active = game.activePlayers();
    if (kind === 'chpok' && game.phase === 'ANSWER') {
      active.forEach((p) => {
        try {
          game.submitAnswer(p.id, `${pick(words)} ${pick(words)}`);
        } catch { /* already answered */ }
      });
    }
    if (game.phase === 'VOTE') {
      active.forEach((p) => {
        try {
          if (kind === 'chpok') {
            const options = (game.answerOrder || []).filter((id) => game.answers?.[id]?.playerId !== p.id);
            if (options.length) game.castVote(p.id, pick(options));
          } else {
            const options = Object.keys(game.picks || {}).filter((token) => game.pickByToken(token)?.playerId !== p.id);
            if (options.length) game.vote(p.id, pick(options));
          }
        } catch { /* may not vote for that */ }
      });
    }
    game.advance();
  }
  return {
    finished: game.isOver, steps, winner: winnerName(game), checks: [],
  };
}

const DRIVERS = {
  monopoly: (opts) => monopolyGame(opts),
  mafia: (opts) => mafiaGame(opts),
  citadels: (opts) => citadelsGame(opts),
  bunker: (opts) => {
    const { BunkerGame } = require('../bunker/BunkerGame');
    const { game, steps, finished } = turnGame(BunkerGame, opts);
    const alive = game.players.filter((p) => p.status === 'alive').length;
    return {
      finished, steps, winner: finished ? `${alive} survivors` : null, checks: finished && alive > game.seats ? ['more survivors than places'] : [],
    };
  },
  catan: (opts) => catanGame(opts),
  cosmic: (opts) => cosmicGame(opts),
  throne: (opts) => throneGame(opts),
  chpok: (opts) => partyGame(require('../chpok/ChpokGame').ChpokGame, 'chpok', opts),
  memehype: (opts) => partyGame(require('../memehype/MemeHypeGame').MemeHypeGame, 'memehype', opts),
};

const STEP_LIMITS = {
  monopoly: 10000, mafia: 400, citadels: 4000, bunker: 2000, catan: 20000, cosmic: 30000, throne: 20000, chpok: 400, memehype: 400,
};

// Plays `games` games of a mode. config (optional) is a draft mode config
// to test before saving it; otherwise the saved one is used.
function run(modeId, {
  games = 5, players = null, config = null, timeBudgetMs = 20000,
} = {}) {
  const gameId = modeConfig.gameOf(modeId);
  const driver = DRIVERS[gameId];
  if (!driver) throw new Error(`No simulator for "${gameId}".`);
  const effective = config ? { ...modeConfig.baseConfig(modeId), ...modeConfig.validate(modeId, config) } : modeConfig.effective(modeId);
  const count = Math.max(1, Math.min(50, Number(games) || 1));
  const hard = modeConfig.hardLimits(gameId);
  const table = players
    ? Math.max(hard.min, Math.min(hard.max, Number(players)))
    : Math.max(hard.min, Math.min(effective.maxPlayers, Math.max(effective.minPlayers, Math.min(4, hard.max))));
  const settings = gameId === 'monopoly' ? null : modeConfig.settingsForNewRoom(modeId, effective.defaults);
  const started = Date.now();
  const results = [];
  for (let i = 0; i < count; i += 1) {
    if (Date.now() - started > timeBudgetMs) break;
    const t0 = Date.now();
    try {
      const r = driver({
        layoutId: modeId.split('.')[1],
        players: table,
        maxSteps: STEP_LIMITS[gameId],
        settings: config ? modeConfig.applyLocked(modeId, effective.defaults, effective) : settings,
        config: config && gameId === 'monopoly' ? effective : null,
      });
      results.push({
        index: i + 1, ok: true, ...r, ms: Date.now() - t0,
      });
    } catch (err) {
      results.push({
        index: i + 1, ok: false, error: err.message, stack: (err.stack || '').split('\n').slice(0, 8).join('\n'), ms: Date.now() - t0,
      });
    }
  }
  const finished = results.filter((r) => r.ok && r.finished).length;
  const errors = results.filter((r) => !r.ok);
  const winners = {};
  results.forEach((r) => { if (r.winner) winners[r.winner] = (winners[r.winner] || 0) + 1; });
  const okRuns = results.filter((r) => r.ok);
  return {
    modeId,
    players: table,
    requested: count,
    played: results.length,
    finished,
    unfinished: okRuns.length - finished,
    errors: errors.length,
    avgSteps: okRuns.length ? Math.round(okRuns.reduce((n, r) => n + r.steps, 0) / okRuns.length) : 0,
    avgMs: results.length ? Math.round(results.reduce((n, r) => n + r.ms, 0) / results.length) : 0,
    totalMs: Date.now() - started,
    winners,
    checks: [...new Set(results.flatMap((r) => r.checks || []))],
    status: errors.length ? 'failed' : (finished === results.length ? 'passed' : 'warning'),
    games: results,
    usedDraft: !!config,
    configVersion: config ? null : effective.version,
  };
}

module.exports = { run, DRIVERS };
