// Drives a Cosmic Encounter game over the real socket.io wire with three
// clients: a registered host and two guests. Proves what the engine tests
// cannot reach: guests cannot start, every player chooses a race from
// their own offer, each payload carries only its owner's hand, an
// encounter runs through its phases end to end, and chat and leaving work.

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { registerCosmicHandlers } = require('../src/socket/cosmicHandler');
const roomManager = require('../src/game/RoomManager');

const PORT = 4019;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerCosmicHandlers(io);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out on ${event}`)), 5000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

class Client {
  constructor(name) {
    this.name = name;
    this.socket = ioClient(`http://localhost:${PORT}`, { transports: ['websocket'] });
    this.state = null;
    this.socket.on('cosmic:state', (s) => { this.state = s; });
  }

  ready() {
    return new Promise((resolve) => this.socket.on('connect', resolve));
  }

  async waitFor(predicate, label, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state && predicate(this.state)) return this.state;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`Timed out waiting for ${label} (phase=${this.state?.phase} ${this.state?.encounter?.phase}/${this.state?.encounter?.step})`);
  }

  close() { this.socket.close(); }
}

const snapshot = (s) => `${s.turnCount}|${s.encounter?.number}|${s.encounter?.phase}|${s.encounter?.step}|${s.encounter?.responderId}|${JSON.stringify(s.encounter?.passes)}|${s.encounter?.chosen?.offense}${s.encounter?.chosen?.defense}|${s.phase}`;

// One legal, simple decision for whoever the game waits on.
async function decide(clients, host) {
  const s = host.state;
  const enc = s.encounter;
  const byId = Object.fromEntries(clients.map((c) => [c.state.you.id, c]));
  const offense = byId[enc.aggressorId];
  const defense = byId[enc.defenderId];
  switch (enc.phase) {
    case 'START': return emit(offense.socket, 'cosmic:beginTurn', {});
    case 'REGROUP': return emit(offense.socket, 'cosmic:regroup', { planetId: offense.state.you.legal.regroupPlanets?.[0] || null });
    case 'DESTINY':
      if (enc.step === 'DRAW') return emit(offense.socket, 'cosmic:drawDestiny', {});
      if (enc.step === 'CHOOSE_PLAYER') return emit(offense.socket, 'cosmic:chooseDefender', { targetId: enc.candidates.find((id) => id !== enc.aggressorId) || enc.candidates[0] });
      return emit(offense.socket, 'cosmic:ownColor', { choice: 'redraw' });
    case 'LAUNCH': {
      const legal = offense.state.you.legal;
      const planetId = legal.targets[0];
      const [from] = Object.entries(legal.ships).sort((a, b) => b[1] - a[1])[0];
      const defenderId = enc.launchMode === 'own'
        ? Object.keys(s.planets.find((pl) => pl.id === planetId).ships).find((id) => id !== enc.aggressorId)
        : undefined;
      return emit(offense.socket, 'cosmic:launch', { planetId, defenderId, ships: { [from]: 1 } });
    }
    case 'ALLIANCE':
      if (enc.step === 'INVITE_OFFENSE') return emit(offense.socket, 'cosmic:invite', { ids: [] });
      if (enc.step === 'INVITE_DEFENSE') return emit(defense.socket, 'cosmic:invite', { ids: [] });
      return emit(byId[enc.responderId].socket, 'cosmic:ally', { side: null });
    case 'PLANNING':
      if (enc.step === 'POWERS') return emit(byId[enc.power.playerId].socket, 'cosmic:power', { power: enc.power.power, use: false });
      for (const [side, client] of [['offense', offense], ['defense', defense]]) {
        if (!enc.chosen[side] && !(enc.oracleId === client.state.you.id && !enc.chosen[side === 'offense' ? 'defense' : 'offense'])) {
          const pickCard = client.state.you.hand.find((c) => ['attack', 'negotiate', 'morph'].includes(c.type));
          return emit(client.socket, 'cosmic:selectCard', { uid: pickCard.uid });
        }
      }
      return null;
    case 'REVEAL': {
      const waiting = [enc.aggressorId, enc.defenderId, ...Object.keys(enc.allies)].find((id) => !enc.passes[id]);
      return emit(byId[waiting].socket, 'cosmic:pass', {});
    }
    case 'RESOLUTION':
      if (enc.step === 'DEAL') {
        const give = offense.state.you.hand[0];
        const res = await emit(offense.socket, 'cosmic:proposeDeal', { give: [give.uid] });
        assert(res.ok, `a deal is proposed (${res.error || ''})`);
        await defense.waitFor((st) => st.encounter?.deal?.proposal, 'the offer to arrive');
        return emit(defense.socket, 'cosmic:acceptDeal', { proposalId: defense.state.encounter.deal.proposal.id });
      }
      if (enc.step === 'QUASH') {
        const waiting = clients.find((c) => !enc.passes[c.state.you.id]);
        return emit(waiting.socket, 'cosmic:pass', {});
      }
      if (enc.step === 'REWARDS') {
        const id = Object.keys(enc.rewards)[0];
        return emit(byId[id].socket, 'cosmic:rewards', { cards: enc.rewards[id] });
      }
      if (enc.step === 'CLONE') return emit(byId[enc.clone.playerId].socket, 'cosmic:clone', { keep: false });
      if (enc.step === 'FETCH') return emit(byId[enc.fetch.fidoId].socket, 'cosmic:fetch', {});
      if (enc.step === 'FETCH_OFFER') return emit(byId[enc.fetch.targetId].socket, 'cosmic:fetchAnswer', { accept: false });
      if (enc.step === 'NEXT') return emit(offense.socket, 'cosmic:continue', { again: false });
      return null;
    default:
      return null;
  }
}

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const clients = ['Ann', 'Bob', 'Cy'].map((n) => new Client(n));
  await Promise.all(clients.map((c) => c.ready()));
  const [host, bob, cy] = clients;

  const guestCreate = await emit(bob.socket, 'cosmic:create', { nickname: 'Bob', playerId: 'g-bob' });
  assert(guestCreate.ok === false && guestCreate.code === 'GUEST_CANNOT_CREATE', 'a guest cannot create a room');

  const account = registerAccount('Ann');
  const created = await emit(host.socket, 'cosmic:create', { token: account.token, settings: { turnSec: 0 } });
  assert(created.ok, 'the registered host creates a room');
  const { roomCode } = created;
  host.state = created.state;
  assert(roomManager.roomKind(roomCode) === 'cosmic', 'the code belongs to a Cosmic Encounter room');

  const jb = await emit(bob.socket, 'cosmic:join', { roomCode, nickname: 'Bob', playerId: 'g-bob', guestKey: 'b'.repeat(64) });
  const jc = await emit(cy.socket, 'cosmic:join', { roomCode, nickname: 'Cy', playerId: 'g-cy', guestKey: 'c'.repeat(64) });
  assert(jb.ok && jc.ok, 'guests join by code');
  bob.state = jb.state;
  cy.state = jc.state;
  await host.waitFor((s) => s.players.length === 3, 'three players');

  const early = await emit(bob.socket, 'cosmic:start', {});
  assert(early.ok === false, 'a guest cannot start');
  assert((await emit(host.socket, 'cosmic:start', {})).ok, 'the host starts');
  await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'ALIENS' && s.you.alienOptions, `${c.name} gets race options`)));

  // Nobody sees another player's options or choice before the reveal.
  assert(host.state.players.every((p) => p.isYou || p.alienId === null), 'races are secret while choosing');
  for (const c of clients) {
    // eslint-disable-next-line no-await-in-loop
    const res = await emit(c.socket, 'cosmic:chooseAlien', { alienId: c.state.you.alienOptions[0] });
    assert(res.ok, `${c.name} chooses a race`);
  }
  await Promise.all(clients.map((c) => c.waitFor((s) => s.phase === 'PLAY', `${c.name} sees play`)));
  assert(host.state.players.every((p) => p.alienId), 'races are revealed together');
  // Three colours: 9 colour cards, 2 wilds and 3 special destiny cards.
  assert(host.state.planets.length === 15 && host.state.decks.destiny === 14, 'the galaxy and decks are set up');

  // Private hands.
  clients.forEach((c) => {
    assert(c.state.you.hand.length === 8, `${c.name} holds 8 cards`);
    assert(c.state.players.every((p) => p.hand === undefined && p.handCount === 8), `${c.name} sees counts only`);
  });

  const idle = clients.find((c) => c.state.you.id !== host.state.turnPlayerId);
  const refused = await emit(idle.socket, 'cosmic:beginTurn', {});
  assert(refused.ok === false, 'acting out of turn is refused');

  // Play until the first turn passes to the next player, through every phase.
  const firstOffense = host.state.turnPlayerId;
  const seenPhases = new Set();
  let checkedHidden = false;
  for (let guard = 0; guard < 200; guard += 1) {
    const s = host.state;
    if (s.phase !== 'PLAY') break;
    seenPhases.add(s.encounter.phase);
    if (s.turnPlayerId !== firstOffense && s.encounter.phase === 'START') break;
    const e = s.encounter;
    if (!checkedHidden && e.phase === 'PLANNING' && (e.chosen.offense || e.chosen.defense)) {
      const third = clients.find((c) => ![e.aggressorId, e.defenderId].includes(c.state.you.id));
      const side = e.chosen.offense ? 'offense' : 'defense';
      if (third && !e.oracleId) {
        // eslint-disable-next-line no-await-in-loop
        await third.waitFor((st) => st.encounter.chosen[side], 'the third player to see a chosen card');
        assert(third.state.encounter.cards[side].hidden, 'a face-down card is hidden from a third player');
        checkedHidden = true;
      }
    }
    const before = snapshot(s);
    // eslint-disable-next-line no-await-in-loop
    const res = await decide(clients, host);
    if (res) assert(res.ok, `step ${e.phase}/${e.step} accepted (${res.error || ''})`);
    // eslint-disable-next-line no-await-in-loop
    await host.waitFor((st) => snapshot(st) !== before || st.phase !== 'PLAY', `progress after ${e.phase}/${e.step}`);
  }
  // A resolution that needs nobody's decision is applied in the same update
  // that hands the turn on, so it shows in the log rather than as a state.
  if (host.state.log.some((l) => ['OFFENSE_WON', 'DEFENSE_WON', 'NEGOTIATION_STARTED', 'HOME_RESTORED'].includes(l.type))) seenPhases.add('RESOLUTION');
  ['START', 'REGROUP', 'DESTINY', 'LAUNCH', 'ALLIANCE', 'PLANNING', 'REVEAL', 'RESOLUTION'].forEach((ph) => {
    assert(seenPhases.has(ph) || host.state.phase !== 'PLAY', `the encounter passed through ${ph}`);
  });
  assert(host.state.phase !== 'PLAY' || host.state.turnPlayerId !== firstOffense, 'the turn passed to the next player');

  const chatSeen = new Promise((resolve) => bob.socket.once('cosmic:chat', resolve));
  host.socket.emit('cosmic:chat', { text: 'Join my alliance?' });
  assert((await chatSeen).text === 'Join my alliance?', 'room chat is delivered');

  cy.socket.emit('cosmic:leave');
  await host.waitFor((s) => s.players.find((p) => p.nickname === 'Cy')?.left, 'Cy marked as left');
  assert(roomManager.getCosmicRoom(roomCode), 'the room survives a player leaving');

  clients.forEach((c) => c.close());
  io.close();
  server.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Cosmic Encounter socket test passed');
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
