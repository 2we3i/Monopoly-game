// engine.js
// The rules of the Iron Throne as pure functions, in the same shape as the
// ЧПОК engine: createGame() lays out Westeros, act() applies one thing the
// current house did and returns the next state (or the same object when the
// action is not allowed). Dice come from a seeded generator kept in the
// state, so a game - AI turns included - replays identically in a script.
//
// A round: a Westeros event card is revealed, then every house takes a turn
// in seat order. A turn: income arrives (gold and influence), then the lord
// spends commands on marches, voyages and attacks, recruits at castles,
// plays one tactic card, places control markers and deals with the other
// houses. Holding key territories - strongholds, castles, cities and King's
// Landing, which is worth two - brings a house closer to the Iron Throne.
// The first house to end its turn with the target number wins; otherwise
// the most powerful house when the last round ends.

import { SEA, TERRITORIES, TERRITORY } from './westeros.js';
import { HOUSES, HOUSE_IDS } from './houses.js';

export { HOUSES, HOUSE_IDS };

export const ENGINE_VERSION = 1;

export const MIN_HOUSES = 2;
export const COMMANDS = 3;
export const HAND_LIMIT = 3;
export const FORT_LIMIT = 2;
export const ALLIANCE_ROUNDS = 3;
export const START_GOLD = 5;
export const START_INFLUENCE = 3;
export const ROUND_OPTIONS = [8, 10, 12];
export const TARGET_OPTIONS = [6, 7, 8];
export const COST = {
  f: 2, k: 5, fort: 10, card: 4, marker: 1, alliance: 2, betray: 2,
};

// gold: income, defense: added to defenders, vp: towards the throne,
// recruit: units that may be raised there per turn.
export const STRUCTURES = {
  capital: {
    gold: 3, defense: 2, vp: 2, recruit: 2,
  },
  stronghold: {
    gold: 2, defense: 2, vp: 1, recruit: 2,
  },
  city: {
    gold: 2, defense: 1, vp: 1, recruit: 1,
  },
  castle: {
    gold: 1, defense: 1, vp: 1, recruit: 1,
  },
  // A castle a house built itself: a place to muster and hold, not a seat.
  fort: {
    gold: 0, defense: 1, vp: 0, recruit: 1,
  },
};

export const CARDS = ['surprise', 'walls', 'march', 'raven', 'mercs', 'sabotage', 'treasure'];
// Which territories a card is played on; cards not listed need no target.
export const CARD_TARGET = { walls: 'own', mercs: 'site', sabotage: 'foe' };
export const EVENTS = ['winter', 'harvest', 'wildlings', 'feast', 'storm', 'plague', 'muster', 'council', 'calm', 'tourney'];

// --- Dice and decks ------------------------------------------------------------

function rand(s) {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const d6 = (s) => 1 + Math.floor(rand(s) * 6);

function shuffleWith(s, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function drawFrom(s, deck, discard) {
  if (!s[deck].length) {
    s[deck] = shuffleWith(s, s[discard]);
    s[discard] = [];
  }
  return s[deck].pop() ?? null;
}

// --- Reading the state -----------------------------------------------------------

export const currentHouse = (s) => s.order[s.turn];
export const unitsIn = (l) => l.f + l.k;
export const strengthIn = (l) => l.f + 2 * l.k;
export const freeUnits = (l) => ({ f: l.f - l.tf, k: l.k - l.tk });
export const throneHolder = (s) => s.lands.kings_landing.owner;

export function structureOf(s, id) {
  return TERRITORY[id].structure || (s.lands[id].fort ? 'fort' : null);
}

export function isAllied(s, a, b) {
  return !!a && !!b && a !== b && s.alliances.some((al) => (al.a === a && al.b === b) || (al.a === b && al.b === a));
}

export function allianceOf(s, a, b) {
  return s.alliances.find((al) => (al.a === a && al.b === b) || (al.a === b && al.b === a)) || null;
}

export function landsOf(s, h) {
  return Object.keys(s.lands).filter((id) => s.lands[id].owner === h);
}

// Anyone to fight: an army, a neutral garrison or a control marker.
export const isDefended = (l) => unitsIn(l) > 0 || l.garrison > 0 || l.marker;

export function defenseOf(s, id) {
  const l = s.lands[id];
  if (!isDefended(l)) return 0;
  const st = structureOf(s, id);
  return strengthIn(l) + l.garrison + (st ? STRUCTURES[st].defense : 0) + (l.marker ? 1 : 0) + (l.walls ? 2 : 0);
}

export function supplyOf(s, h) {
  return landsOf(s, h).reduce((n, id) => n + TERRITORY[id].supply, 0);
}

export const armyCap = (s, h) => 4 + 2 * supplyOf(s, h);

export function armyOf(s, h) {
  let f = 0;
  let k = 0;
  let stacks = 0;
  landsOf(s, h).forEach((id) => {
    const l = s.lands[id];
    f += l.f;
    k += l.k;
    if (unitsIn(l)) stacks += 1;
  });
  return {
    f, k, units: f + k, strength: f + 2 * k, stacks,
  };
}

export function vpOf(s, h) {
  return landsOf(s, h).reduce((n, id) => {
    const st = structureOf(s, id);
    return n + (st ? STRUCTURES[st].vp : 0);
  }, 0);
}

export function incomeOf(s, h) {
  let gold = 1;
  let influence = 1;
  landsOf(s, h).forEach((id) => {
    const st = structureOf(s, id);
    if (st) gold += STRUCTURES[st].gold;
    if (TERRITORY[id].port) gold += 1;
    influence += TERRITORY[id].crown;
  });
  if (s.event === 'winter') gold = Math.ceil(gold / 2);
  return { gold, influence };
}

export const commandsFor = (s, h) => COMMANDS + (throneHolder(s) === h ? 1 : 0);

export function unitCost(s, unit) {
  if (unit === 'k' && s.event === 'tourney') return 3;
  return Math.max(1, COST[unit] - (s.event === 'muster' ? 1 : 0));
}

export const allianceCost = (s) => (s.event === 'council' ? 0 : COST.alliance);

export function standings(s) {
  return s.order
    .map((id) => ({
      id, vp: vpOf(s, id), lands: landsOf(s, id).length, strength: armyOf(s, id).strength, gold: s.houses[id].gold, out: s.houses[id].out,
    }))
    .sort((a, b) => (a.out - b.out) || (b.vp - a.vp) || (b.lands - a.lands) || (b.strength - a.strength) || (b.gold - a.gold));
}

export function bordersHouse(s, a, b) {
  return landsOf(s, a).some((id) => TERRITORY[id].neighbors.some((n) => s.lands[n].owner === b));
}

// Where an army standing in `from` can go this turn. Allied ground is
// closed; a port adds every coast of the sea zones it touches, unless a
// storm has closed the sea for the round.
export function moveTargets(s, from) {
  const h = s.lands[from]?.owner;
  if (!h) return [];
  const out = new Map();
  const classify = (id, voyage) => {
    if (id === from || out.has(id)) return;
    const l = s.lands[id];
    if (l.owner && l.owner !== h && isAllied(s, h, l.owner)) return;
    const kind = l.owner === h ? 'move' : isDefended(l) ? 'attack' : 'capture';
    out.set(id, { id, kind, voyage });
  };
  TERRITORY[from].neighbors.forEach((id) => classify(id, false));
  if (TERRITORY[from].port && s.event !== 'storm') {
    TERRITORY[from].seas.forEach((sea) => SEA[sea].coasts.forEach((id) => classify(id, true)));
  }
  return [...out.values()];
}

// null when the current house may recruit `unit` in `id`, otherwise why not.
export function recruitProblem(s, id, unit) {
  const h = currentHouse(s);
  const l = s.lands[id];
  if (!l || l.owner !== h) return 'notOwn';
  const st = structureOf(s, id);
  if (!st) return 'noSite';
  if ((s.recruited[id] || 0) >= STRUCTURES[st].recruit) return 'siteLimit';
  if (armyOf(s, h).units >= armyCap(s, h)) return 'cap';
  if (s.houses[h].gold < unitCost(s, unit)) return 'gold';
  return null;
}

export function fortifyProblem(s, id) {
  const h = currentHouse(s);
  const l = s.lands[id];
  if (!l || l.owner !== h) return 'notOwn';
  if (structureOf(s, id)) return 'hasStructure';
  if (s.houses[h].forts >= FORT_LIMIT) return 'fortLimit';
  if (s.houses[h].gold < COST.fort) return 'gold';
  return null;
}

export function markerProblem(s, id) {
  const h = currentHouse(s);
  const l = s.lands[id];
  if (!l || l.owner !== h) return 'notOwn';
  if (l.marker) return 'hasMarker';
  if (s.houses[h].influence < COST.marker) return 'influence';
  return null;
}

// Territories a card can be played on, or null for a card without a target.
export function cardTargets(s, card) {
  const type = CARD_TARGET[card];
  if (!type) return null;
  const h = currentHouse(s);
  const ids = Object.keys(s.lands);
  if (type === 'own') return ids.filter((id) => s.lands[id].owner === h && !s.lands[id].walls);
  if (type === 'site') {
    if (armyOf(s, h).units >= armyCap(s, h)) return [];
    return ids.filter((id) => s.lands[id].owner === h && structureOf(s, id));
  }
  return ids.filter((id) => {
    const l = s.lands[id];
    if (l.owner === h || isAllied(s, h, l.owner)) return false;
    if (!(unitsIn(l) > 0 || l.garrison > 0 || l.marker || l.walls)) return false;
    return TERRITORY[id].neighbors.some((n) => s.lands[n].owner === h);
  });
}

// Chance that attack + d6 beats defense + d6 (ties hold for the defender).
export function winChance(atk, def) {
  let wins = 0;
  for (let a = 1; a <= 6; a += 1) {
    for (let d = 1; d <= 6; d += 1) if (atk + a > def + d) wins += 1;
  }
  return wins / 36;
}

// --- Changing the state ------------------------------------------------------------

function log(s, key, vars = {}, house = currentHouse(s)) {
  s.logN += 1;
  s.log.push({
    n: s.logN, round: s.round, turnNo: s.turnNo, house, key, vars,
  });
  if (s.log.length > 240) s.log.splice(0, s.log.length - 240);
}

// Footmen fall first; tired counts never exceed what is left.
function removeUnits(l, n) {
  let left = n;
  while (left > 0 && l.f > 0) { l.f -= 1; left -= 1; }
  while (left > 0 && l.k > 0) { l.k -= 1; left -= 1; }
  if (l.tf !== undefined) {
    l.tf = Math.min(l.tf, l.f);
    l.tk = Math.min(l.tk, l.k);
  }
  return n - left;
}

function drawCard(s, h) {
  const me = s.houses[h];
  if (me.hand.length >= HAND_LIMIT) return null;
  const card = drawFrom(s, 'cardDeck', 'cardDiscard');
  if (card) me.hand.push(card);
  return card;
}

function takeLand(s, id, h, f, k) {
  const l = s.lands[id];
  Object.assign(l, {
    owner: h, f, k, tf: f, tk: k, garrison: 0, marker: false, walls: false,
  });
  s.houses[h].stats.captured += 1;
  if (TERRITORY[id].structure && drawCard(s, h)) log(s, 'spoils', { t: id }, h);
}

function finishGame(s, reason, winners) {
  s.phase = 'over';
  s.reason = reason;
  s.proposal = null;
  s.winners = winners?.length ? winners : [standings(s)[0].id];
  log(s, 'gameOver', { reason }, s.winners[0]);
}

function checkEliminations(s) {
  s.order.forEach((h) => {
    const me = s.houses[h];
    if (me.out || landsOf(s, h).length > 0) return;
    me.out = true;
    me.hand = [];
    s.alliances = s.alliances.filter((al) => al.a !== h && al.b !== h);
    if (s.proposal && (s.proposal.from === h || s.proposal.to === h)) s.proposal = null;
    log(s, 'eliminated', {}, h);
  });
  const alive = s.order.filter((h) => !s.houses[h].out);
  if (alive.length <= 1 && s.phase === 'play') finishGame(s, 'conquest', alive);
}

function beginTurn(s) {
  const h = currentHouse(s);
  const me = s.houses[h];
  s.turnNo += 1;
  s.recruited = {};
  Object.values(s.lands).forEach((l) => {
    l.tf = 0;
    l.tk = 0;
    if (l.owner === h) l.walls = false;
  });
  Object.assign(me, {
    commands: commandsFor(s, h), cardPlayed: false, bonus: 0, proposed: false,
  });
  const income = incomeOf(s, h);
  me.gold += income.gold;
  me.influence += income.influence;
  log(s, 'turnStart', { gold: income.gold, influence: income.influence }, h);
}

function alive(s) {
  return s.order.filter((h) => !s.houses[h].out);
}

function newRound(s) {
  s.round += 1;
  s.alliances = s.alliances.filter((al) => {
    if (al.until >= s.round) return true;
    log(s, 'allianceExpired', { other: al.b }, al.a);
    return false;
  });
  if (s.event) s.eventDiscard.push(s.event);
  s.event = drawFrom(s, 'eventDeck', 'eventDiscard');
  log(s, 'event', { event: s.event }, null);

  if (s.event === 'harvest') alive(s).forEach((h) => { s.houses[h].gold += 2; });
  if (s.event === 'council') alive(s).forEach((h) => { s.houses[h].influence += 1; });
  if (s.event === 'feast') {
    const king = throneHolder(s);
    alive(s).forEach((h) => {
      if (h === king) {
        s.houses[h].gold += 3;
        s.houses[h].influence += 2;
      } else {
        s.houses[h].influence += 1;
      }
    });
  }
  if (s.event === 'plague') {
    let hit = 0;
    Object.values(s.lands).forEach((l) => {
      if (unitsIn(l) >= 4) hit += removeUnits(l, 1);
    });
    log(s, 'plagueHit', { n: hit }, null);
  }
  if (s.event === 'wildlings') {
    const wall = s.lands.castle_black;
    if (wall.owner && strengthIn(wall) >= 3) {
      s.houses[wall.owner].influence += 2;
      log(s, 'wildlingsHeld', { t: 'castle_black' }, wall.owner);
    } else {
      let raided = false;
      alive(s).forEach((h) => {
        const north = landsOf(s, h)
          .filter((id) => TERRITORY[id].region === 'north' && unitsIn(s.lands[id]) > 0)
          .sort((a, b) => unitsIn(s.lands[b]) - unitsIn(s.lands[a]));
        if (!north.length) return;
        removeUnits(s.lands[north[0]], 1);
        raided = true;
        log(s, 'wildlingsRaid', { t: north[0] }, h);
      });
      if (!raided) log(s, 'wildlingsNone', {}, null);
    }
  }
}

function fight(s, h, from, to, f, k, voyage) {
  const src = s.lands[from];
  const dst = s.lands[to];
  const me = s.houses[h];
  const defender = dst.owner;
  const atkBase = f + 2 * k + me.bonus;
  const defBase = defenseOf(s, to);
  const rollA = d6(s);
  const rollD = d6(s);
  const atk = atkBase + rollA;
  const def = defBase + rollD;
  const win = atk > def;
  const diff = Math.abs(atk - def);
  const heavy = Math.max(1, Math.ceil(diff / 3));
  const light = diff <= 2 ? 1 : 0;
  me.bonus = 0;
  const report = {
    id: s.seq + 1, attacker: h, defender, from, to, voyage, atkBase, defBase, rollA, rollD, atk, def, win,
    atkUnits: f + k, atkLoss: 0, defLoss: 0, garrison: dst.garrison, retreat: null, routed: false,
  };

  if (win) {
    const beaten = { f: dst.f, k: dst.k };
    report.defLoss = removeUnits(beaten, Math.min(heavy, beaten.f + beaten.k));
    if (defender && beaten.f + beaten.k > 0) {
      const fallback = TERRITORY[to].neighbors
        .filter((n) => s.lands[n].owner === defender)
        .sort((a, b) => unitsIn(s.lands[b]) - unitsIn(s.lands[a]))[0];
      if (fallback) {
        s.lands[fallback].f += beaten.f;
        s.lands[fallback].k += beaten.k;
        report.retreat = fallback;
      } else {
        report.routed = true;
      }
    }
    const victors = { f, k };
    report.atkLoss = removeUnits(victors, Math.min(light, f + k - 1));
    me.stats.won += 1;
    if (defender) s.houses[defender].stats.lost += 1;
    takeLand(s, to, h, victors.f, victors.k);
    log(s, 'battleWon', {
      from, to, other: defender, atk, def,
    }, h);
  } else {
    const beaten = { f, k };
    report.atkLoss = removeUnits(beaten, Math.min(heavy, f + k));
    src.f += beaten.f;
    src.k += beaten.k;
    src.tf += beaten.f;
    src.tk += beaten.k;
    if (light) {
      if (unitsIn(dst) > 0) report.defLoss = removeUnits(dst, 1);
      else if (dst.garrison > 1) {
        dst.garrison -= 1;
        report.defLoss = 1;
      }
    }
    me.stats.lost += 1;
    if (defender) s.houses[defender].stats.won += 1;
    log(s, 'battleLost', {
      from, to, other: defender, atk, def,
    }, h);
  }
  s.battle = report;
}

const HANDLERS = {
  recruit(s, { territory, unit }) {
    if ((unit !== 'f' && unit !== 'k') || recruitProblem(s, territory, unit)) return false;
    const h = currentHouse(s);
    const l = s.lands[territory];
    const cost = unitCost(s, unit);
    s.houses[h].gold -= cost;
    l[unit] += 1;
    l[unit === 'f' ? 'tf' : 'tk'] += 1;
    s.recruited[territory] = (s.recruited[territory] || 0) + 1;
    log(s, unit === 'f' ? 'recruitF' : 'recruitK', { t: territory, gold: cost });
    return true;
  },

  move(s, {
    from, to, f = 0, k = 0,
  }) {
    const h = currentHouse(s);
    const me = s.houses[h];
    const src = s.lands[from];
    if (!src || src.owner !== h || me.commands < 1) return false;
    if (![f, k].every((n) => Number.isInteger(n) && n >= 0) || f + k < 1) return false;
    if (f > src.f - src.tf || k > src.k - src.tk) return false;
    const target = moveTargets(s, from).find((x) => x.id === to);
    if (!target) return false;
    me.commands -= 1;
    src.f -= f;
    src.k -= k;
    const dst = s.lands[to];
    if (target.kind === 'move') {
      dst.f += f;
      dst.k += k;
      dst.tf += f;
      dst.tk += k;
      log(s, target.voyage ? 'sail' : 'march', { from, to, n: f + k });
    } else if (target.kind === 'capture') {
      const prev = dst.owner;
      takeLand(s, to, h, f, k);
      log(s, prev ? 'captureFrom' : 'capture', {
        from, to, other: prev, n: f + k,
      });
    } else {
      fight(s, h, from, to, f, k, target.voyage);
    }
    checkEliminations(s);
    return true;
  },

  marker(s, { territory }) {
    if (markerProblem(s, territory)) return false;
    const h = currentHouse(s);
    s.houses[h].influence -= COST.marker;
    s.lands[territory].marker = true;
    log(s, 'marker', { t: territory });
    return true;
  },

  fortify(s, { territory }) {
    if (fortifyProblem(s, territory)) return false;
    const h = currentHouse(s);
    s.houses[h].gold -= COST.fort;
    s.houses[h].forts += 1;
    s.lands[territory].fort = true;
    log(s, 'fortify', { t: territory });
    return true;
  },

  buyCard(s) {
    const h = currentHouse(s);
    const me = s.houses[h];
    if (me.gold < COST.card || me.hand.length >= HAND_LIMIT) return false;
    me.gold -= COST.card;
    const card = drawCard(s, h);
    if (!card) return false;
    log(s, 'buyCard', {});
    return true;
  },

  playCard(s, { index, target }) {
    const h = currentHouse(s);
    const me = s.houses[h];
    const card = me.hand[index];
    if (me.cardPlayed || !card) return false;
    const targets = cardTargets(s, card);
    if (targets && !targets.includes(target)) return false;
    if (card === 'surprise') me.bonus += 2;
    if (card === 'march') me.commands += 1;
    if (card === 'raven') me.influence += 2;
    if (card === 'treasure') me.gold += 4;
    if (card === 'walls') s.lands[target].walls = true;
    if (card === 'mercs') {
      const n = Math.min(2, armyCap(s, h) - armyOf(s, h).units);
      if (n < 1) return false;
      s.lands[target].f += n;
      s.lands[target].tf += n;
    }
    if (card === 'sabotage') {
      const l = s.lands[target];
      if (unitsIn(l) > 0) removeUnits(l, 1);
      else if (l.garrison > 0) l.garrison -= 1;
      l.marker = false;
      l.walls = false;
    }
    me.hand.splice(index, 1);
    s.cardDiscard.push(card);
    me.cardPlayed = true;
    log(s, 'playCard', { card, t: target ?? null });
    return true;
  },

  propose(s, { to }) {
    const h = currentHouse(s);
    const me = s.houses[h];
    const cost = allianceCost(s);
    if (to === h || !s.houses[to] || s.houses[to].out || isAllied(s, h, to) || me.proposed || me.influence < cost) return false;
    me.influence -= cost;
    me.proposed = true;
    log(s, 'propose', { other: to });
    if (s.houses[to].control === 'ai') resolveProposal(s, h, to, aiAccepts(s, h, to));
    else s.proposal = { from: h, to };
    return true;
  },

  respond(s, { accept }) {
    if (!s.proposal) return false;
    const { from, to } = s.proposal;
    s.proposal = null;
    resolveProposal(s, from, to, !!accept);
    return true;
  },

  betray(s, { other }) {
    const h = currentHouse(s);
    const me = s.houses[h];
    if (!isAllied(s, h, other) || me.influence < COST.betray) return false;
    me.influence -= COST.betray;
    s.alliances = s.alliances.filter((al) => !((al.a === h && al.b === other) || (al.a === other && al.b === h)));
    s.houses[other].influence += 1;
    log(s, 'betray', { other });
    return true;
  },

  endTurn(s) {
    const h = currentHouse(s);
    if (vpOf(s, h) >= s.target) {
      finishGame(s, 'throne', [h]);
      return true;
    }
    s.houses[h].bonus = 0;
    const count = s.order.length;
    let next = s.turn;
    let wrapped = false;
    for (let i = 0; i < count; i += 1) {
      next = (next + 1) % count;
      if (next === 0) wrapped = true;
      if (!s.houses[s.order[next]].out) break;
    }
    s.turn = next;
    if (wrapped) {
      if (s.round >= s.roundLimit) {
        finishGame(s, 'rounds');
        return true;
      }
      newRound(s);
      checkEliminations(s);
      if (s.phase !== 'play') return true;
      for (let i = 0; i < count && s.houses[currentHouse(s)].out; i += 1) s.turn = (s.turn + 1) % count;
    }
    beginTurn(s);
    return true;
  },

  finish(s) {
    finishGame(s, 'early');
    return true;
  },
};

function resolveProposal(s, from, to, accept) {
  if (accept) {
    s.alliances.push({ a: from, b: to, until: s.round + ALLIANCE_ROUNDS });
    log(s, 'allianceMade', { other: to, until: s.round + ALLIANCE_ROUNDS }, from);
  } else {
    log(s, 'allianceRefused', { other: to }, from);
  }
}

export function act(state, action) {
  if (!state || state.phase !== 'play' || !action) return state;
  if (state.proposal && action.type !== 'respond' && action.type !== 'finish') return state;
  const s = structuredClone(state);
  const handler = HANDLERS[action.type];
  if (!handler || handler(s, action) === false) return state;
  s.seq += 1;
  return s;
}

// houses: { stark: 'human' | 'ai' | null, ... }. Houses left out of the game
// leave their lands to neutral garrisons.
export function createGame({
  houses, names = {}, roundLimit = 10, target = 7, seed = Math.floor(Math.random() * 2 ** 31),
}) {
  const order = HOUSE_IDS.filter((h) => houses[h] === 'human' || houses[h] === 'ai');
  if (order.length < MIN_HOUSES) throw new Error('Not enough houses');
  const s = {
    v: ENGINE_VERSION,
    game: 'throne',
    seq: 0,
    phase: 'play',
    reason: null,
    round: 1,
    roundLimit,
    target,
    rng: seed | 0,
    order,
    turn: 0,
    turnNo: 0,
    houses: {},
    lands: {},
    alliances: [],
    proposal: null,
    event: 'calm',
    eventDeck: [],
    eventDiscard: [],
    cardDeck: [],
    cardDiscard: [],
    recruited: {},
    battle: null,
    winners: [],
    log: [],
    logN: 0,
  };
  s.eventDeck = shuffleWith(s, EVENTS.filter((e) => e !== 'calm').concat(['calm']));
  s.cardDeck = shuffleWith(s, [...CARDS, ...CARDS, ...CARDS]);

  TERRITORIES.forEach((t) => {
    const l = {
      owner: null, f: 0, k: 0, tf: 0, tk: 0, garrison: t.garrison, marker: false, walls: false, fort: false,
    };
    if (t.home && order.includes(t.home)) {
      l.owner = t.home;
      if (HOUSES[t.home].seat === t.id) {
        l.f = 2;
        l.k = 1;
      } else {
        l.f = 1;
      }
    } else if (t.home) {
      l.garrison = t.structure === 'stronghold' ? 3 : t.structure ? 2 : 0;
    }
    s.lands[t.id] = l;
  });

  order.forEach((h) => {
    s.houses[h] = {
      id: h,
      control: houses[h],
      name: (names[h] || '').trim().slice(0, 24),
      gold: START_GOLD,
      influence: START_INFLUENCE,
      hand: [],
      out: false,
      commands: 0,
      cardPlayed: false,
      bonus: 0,
      proposed: false,
      forts: 0,
      stats: { won: 0, lost: 0, captured: 0 },
    };
    drawCard(s, h);
  });

  log(s, 'start', { target, rounds: roundLimit }, null);
  beginTurn(s);
  return s;
}

// --- The AI ------------------------------------------------------------------------
// A plain, readable opponent: take instant value, recruit where the threat
// is, strike where the odds are good, push idle troops to the front, then
// spend what is left on markers, cards and friends.

function maxBy(list, score) {
  let best = list[0];
  let bestScore = -Infinity;
  list.forEach((item) => {
    const v = score(item);
    if (v > bestScore) { bestScore = v; best = item; }
  });
  return best;
}

function threatTo(s, h, id) {
  return TERRITORY[id].neighbors.reduce((n, nb) => {
    const l = s.lands[nb];
    return l.owner && l.owner !== h && !isAllied(s, h, l.owner) ? n + strengthIn(l) : n;
  }, 0);
}

function worthOf(s, id) {
  const t = TERRITORY[id];
  const st = structureOf(s, id);
  return 3 + (st ? STRUCTURES[st].vp * 10 + STRUCTURES[st].gold * 2 : 0) + (t.port ? 2 : 0) + t.supply * 2 + t.crown * 2;
}

function bestStrike(s, h) {
  const me = s.houses[h];
  let best = null;
  landsOf(s, h).forEach((id) => {
    const l = s.lands[id];
    const free = freeUnits(l);
    if (free.f + free.k === 0) return;
    const keep = structureOf(s, id) || threatTo(s, h, id) > 0 ? 1 : 0;
    const send = { ...free };
    let leave = keep - (unitsIn(l) - (send.f + send.k));
    while (leave > 0 && send.f > 0) { send.f -= 1; leave -= 1; }
    while (leave > 0 && send.k > 0) { send.k -= 1; leave -= 1; }
    if (send.f + send.k === 0) return;
    moveTargets(s, id).forEach((tgt) => {
      if (tgt.kind === 'move') return;
      const worth = worthOf(s, tgt.id);
      if (tgt.kind === 'capture') {
        const one = send.f > 0 ? { f: 1, k: 0 } : { f: 0, k: 1 };
        const score = worth + 5;
        if (!best || score > best.score) best = { score, from: id, to: tgt.id, kind: 'capture', margin: 99, ...one };
        return;
      }
      const margin = send.f + 2 * send.k + me.bonus - defenseOf(s, tgt.id);
      if (margin < (structureOf(s, tgt.id) ? 1 : 2)) return;
      const score = worth + margin * 2 + (s.lands[tgt.id].owner ? 3 : 0);
      if (!best || score > best.score) {
        best = {
          score, from: id, to: tgt.id, kind: 'attack', margin, f: send.f, k: send.k,
        };
      }
    });
  });
  return best;
}

// Idle troops in safe lands walk one step towards the nearest frontier.
function bestShift(s, h) {
  const mine = landsOf(s, h);
  const own = new Set(mine);
  const dist = {};
  const queue = mine.filter((id) => TERRITORY[id].neighbors.some((n) => !own.has(n) && !isAllied(s, h, s.lands[n].owner)));
  queue.forEach((id) => { dist[id] = 0; });
  for (let i = 0; i < queue.length; i += 1) {
    TERRITORY[queue[i]].neighbors.forEach((n) => {
      if (own.has(n) && dist[n] === undefined) {
        dist[n] = dist[queue[i]] + 1;
        queue.push(n);
      }
    });
  }
  const interior = mine.filter((id) => dist[id] >= 1).sort((a, b) => dist[b] - dist[a]);
  for (const id of interior) {
    const free = freeUnits(s.lands[id]);
    if (free.f + free.k === 0) continue;
    const step = TERRITORY[id].neighbors.find((n) => dist[n] === dist[id] - 1);
    if (step) return { from: id, to: step, f: free.f, k: free.k };
  }
  return null;
}

function aiAccepts(s, from, to) {
  if (standings(s)[0].id === from && vpOf(s, from) >= s.target - 2) return false;
  if (bordersHouse(s, to, from) && armyOf(s, from).strength > armyOf(s, to).strength * 1.5) return rand(s) < 0.85;
  return rand(s) < 0.6;
}

export function planAi(s) {
  if (s.phase !== 'play') return null;
  if (s.proposal) return s.houses[s.proposal.to].control === 'ai' ? { type: 'respond', accept: false } : null;
  const h = currentHouse(s);
  const me = s.houses[h];
  if (me.control !== 'ai') return null;
  const mine = landsOf(s, h);
  const army = armyOf(s, h);
  const cap = armyCap(s, h);
  const threat = (id) => threatTo(s, h, id);

  if (!me.cardPlayed) {
    const instant = me.hand.findIndex((c) => c === 'treasure' || c === 'raven' || (c === 'march' && me.commands > 0));
    if (instant >= 0) return { type: 'playCard', index: instant };
    const mercs = me.hand.indexOf('mercs');
    const sites = mercs >= 0 ? cardTargets(s, 'mercs') : [];
    if (sites.length) return { type: 'playCard', index: mercs, target: maxBy(sites, threat) };
  }

  if (army.units < cap) {
    const sites = mine.filter((id) => !recruitProblem(s, id, 'f')).sort((a, b) => threat(b) - threat(a));
    if (sites.length) {
      const site = sites[0];
      const knight = me.gold >= unitCost(s, 'k') + unitCost(s, 'f') && !recruitProblem(s, site, 'k');
      return { type: 'recruit', territory: site, unit: knight ? 'k' : 'f' };
    }
  }

  if (me.commands > 0) {
    const strike = bestStrike(s, h);
    if (strike) {
      if (strike.kind === 'attack' && !me.cardPlayed && me.bonus === 0) {
        const sabotage = me.hand.indexOf('sabotage');
        if (sabotage >= 0 && cardTargets(s, 'sabotage').includes(strike.to)) return { type: 'playCard', index: sabotage, target: strike.to };
        const surprise = me.hand.indexOf('surprise');
        if (surprise >= 0 && strike.margin < 4) return { type: 'playCard', index: surprise };
      }
      return {
        type: 'move', from: strike.from, to: strike.to, f: strike.f, k: strike.k,
      };
    }
    const shift = bestShift(s, h);
    if (shift) return { type: 'move', ...shift };
  }

  if (!me.cardPlayed) {
    const walls = me.hand.indexOf('walls');
    const spots = walls >= 0 ? cardTargets(s, 'walls').filter((id) => structureOf(s, id) && threat(id) > 0) : [];
    if (spots.length) return { type: 'playCard', index: walls, target: maxBy(spots, threat) };
  }

  if (me.influence >= 3) {
    const spot = mine.find((id) => !s.lands[id].marker && unitsIn(s.lands[id]) === 0 && (structureOf(s, id) || threat(id) > 0));
    if (spot) return { type: 'marker', territory: spot };
  }

  if (!me.proposed && me.influence >= allianceCost(s) + 2 && !s.alliances.some((al) => al.a === h || al.b === h)) {
    const leader = standings(s)[0].id;
    const friends = s.order.filter((o) => o !== h && o !== leader && !s.houses[o].out && bordersHouse(s, h, o));
    if (friends.length) return { type: 'propose', to: maxBy(friends, (o) => armyOf(s, o).strength) };
  }

  if (me.hand.length < 2 && me.gold >= COST.card + (army.units < cap ? unitCost(s, 'f') : 0)) return { type: 'buyCard' };

  if (army.units >= cap && me.gold >= COST.fort + 2) {
    const spot = mine.filter((id) => !fortifyProblem(s, id)).sort((a, b) => threat(b) - threat(a))[0];
    if (spot) return { type: 'fortify', territory: spot };
  }

  return { type: 'endTurn' };
}

// One AI decision applied. An action the rules refuse ends the turn instead,
// so a computer house can never stall the table.
export function aiStep(state) {
  const action = planAi(state);
  if (!action) return state;
  const next = act(state, action);
  if (next !== state || action.type === 'endTurn') return next;
  return act(state, { type: 'endTurn' });
}
