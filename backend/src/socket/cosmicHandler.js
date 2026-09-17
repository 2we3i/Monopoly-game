// cosmicHandler.js
// Real-time layer for Cosmic Encounter.
//
// Like the other card games, every player is sent their own payload
// (hands, face-down encounter cards and deal details are secret), and the
// server's clock makes a plain legal choice for a player who runs out of
// time or walks away. Clients send only intentions.

const roomManager = require('../game/RoomManager');
const { CosmicError, PHASES, MAX_PLAYERS } = require('../cosmic/CosmicGame');
const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload, idString,
} = require('./roomSockets');
const roomChat = require('../social/roomChat');
const liveRoom = require('./liveRoom');

const { AccessError } = access;
const MODE_ID = 'cosmic.classic';
const timers = new Map();
let ioRef = null;

function sendError(socket, message) {
  socket.emit('cosmic:error', { message });
}

function idList(value, max = 10) {
  return Array.isArray(value) ? value.slice(0, max).map((v) => idString(v)).filter(Boolean) : [];
}

function shipMap(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  Object.entries(value).slice(0, 40).forEach(([k, v]) => {
    const key = idString(k, 20);
    const n = Number(v);
    if (key && Number.isInteger(n) && n > 0 && n <= 20) out[key] = n;
  });
  return out;
}

function clientState(game, viewerId) {
  const state = game.toClientJSON(viewerId);
  state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
  return liveRoom.decorate(state, game.roomCode);
}

// Watchers see the galaxy as an onlooker does: every colony and ship,
// but nobody's hand and no face-down encounter card.
function spectatorState(game) {
  const state = clientState(game, null);
  state.spectating = true;
  return state;
}

function broadcast(io, roomCode) {
  const game = roomManager.getCosmicRoom(roomCode);
  if (!game) return;
  roomManager.persistCosmic(roomCode);
  game.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('cosmic:state', clientState(game, p.id));
  });
  liveRoom.sendToSpectators(io, roomCode, 'cosmic:state', () => spectatorState(game));
  registry.observe('cosmic', game);
}

function clearTimer(roomCode) {
  const t = timers.get(roomCode);
  if (t) {
    clearTimeout(t);
    timers.delete(roomCode);
  }
}

function schedule(io, roomCode) {
  clearTimer(roomCode);
  const game = roomManager.getCosmicRoom(roomCode);
  if (!game || !game.phaseEndsAt || game.phase === PHASES.LOBBY || game.phase === PHASES.GAME_OVER) return;
  const delay = Math.max(200, game.phaseEndsAt - Date.now());
  timers.set(roomCode, setTimeout(() => {
    timers.delete(roomCode);
    const current = roomManager.getCosmicRoom(roomCode);
    if (!current) return;
    try {
      current.onTimeout();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Cosmic timeout handling failed in ${roomCode}:`, err.message);
      current.phaseEndsAt = Date.now() + 5000;
    }
    broadcast(io, roomCode);
    schedule(io, roomCode);
  }, delay));
}

function stageOf(phase) {
  if (phase === PHASES.LOBBY) return 'lobby';
  if (phase === PHASES.GAME_OVER) return 'finished';
  return 'active';
}

const DATA_KEYS = ['cosmicRoom', 'cosmicPlayerId', 'cosmicAccountId'];

// One seat stops being a seat: the player gave up, walked out, or their
// twenty seconds of grace ran out. The engine turns that into whatever it
// means at this table; the reason is kept, so everyone can be told which
// of the three it was.
function dropPlayer(io, roomCode, playerId, reason) {
  const game = roomManager.getCosmicRoom(roomCode);
  if (!game) return;
  const player = game.getPlayer(playerId);
  if (!player || player.exitReason) return;
  const { nickname } = player;
  liveRoom.disarmDrop(roomCode, playerId);
  liveRoom.markExit(game, playerId, reason);
  game.removePlayer(playerId);

  if (game.players.length === 0 || game.players.every((p) => p.left)) {
    clearTimer(roomCode);
    liveRoom.disarmRoom(roomCode);
    roomManager.deleteCosmicRoom(roomCode, 'empty');
    liveRoom.closeSpectators(io, roomCode, 'cosmic', 'empty');
    return;
  }
  io.to(roomCode).emit('cosmic:system', {
    type: reason === 'surrender' ? 'PLAYER_SURRENDERED' : 'PLAYER_DROPPED',
    params: { name: nickname },
  });
  broadcast(io, roomCode);
  schedule(io, roomCode);
}

registry.register({
  type: 'cosmic',
  rooms: () => roomManager.cosmicRooms.values(),
  get: (code) => roomManager.getCosmicRoom(code),
  summary(game) {
    const host = game.getPlayer(game.hostId);
    return {
      code: game.roomCode,
      gameType: 'cosmic',
      modeId: MODE_ID,
      hostId: game.hostId,
      hostNickname: host?.nickname || null,
      hostAccountId: host?.accountId || null,
      createdAt: game.createdAt,
      phase: game.phase,
      stage: stageOf(game.phase),
      maxPlayers: MAX_PLAYERS,
      players: game.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        accountId: p.accountId || null,
        isGuest: !p.accountId,
        connected: !!p.connected,
        isHost: p.id === game.hostId,
        status: p.left ? 'left' : `${game.planets.length ? game.foreignColonies(p.id) : 0} colonies`,
      })),
      details: { turn: game.turnCount || 0 },
    };
  },
  matchSummary(game) {
    const stage = stageOf(game.phase);
    const host = game.getPlayer(game.hostId);
    const standings = game.results?.standings || [];
    return {
      gameType: 'cosmic',
      roomCode: game.roomCode,
      modeId: MODE_ID,
      hostAccountId: host?.accountId || null,
      stage,
      startedAt: game.startedAt,
      players: game.players.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: standings.filter((s) => s.winner).map((s) => s.nickname).join(', ') || null,
          players: game.players.map((p) => {
            const row = standings.find((s) => s.playerId === p.id);
            const won = game.results.winnerIds.includes(p.id);
            // Shared victories share first place.
            const place = won ? 1 : standings.findIndex((s) => s.playerId === p.id) + 1;
            return {
              playerId: p.id,
              place: place || null,
              result: won ? 'win' : 'loss',
              role: p.alienId,
              score: row?.foreignColonies ?? 0,
              buildings: row?.foreignColonies ?? 0,
              goldEarned: 0,
              extra: { alien: p.alienId, encounters: p.stats.encounters, wins: p.stats.wins },
            };
          }),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const game = roomManager.getCosmicRoom(code);
    if (!game) return false;
    clearTimer(code);
    game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
      gameType: 'cosmic', roomCode: code, reason, dataKeys: DATA_KEYS,
    }));
    liveRoom.disarmRoom(code);
    liveRoom.closeSpectators(ioRef, code, 'cosmic', reason);
    roomManager.deleteCosmicRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const game = roomManager.getCosmicRoom(code);
    const player = game?.getPlayer(playerId);
    if (!player) return false;
    notifyRemoved(ioRef, player.socketId, { gameType: 'cosmic', roomCode: code, reason, dataKeys: DATA_KEYS });
    dropPlayer(ioRef, code, playerId, 'kicked');
    if (!roomManager.getCosmicRoom(code)) return true;
    broadcast(ioRef, code);
    schedule(ioRef, code);
    return true;
  },
});

function registerCosmicHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    const act = (fn) => (payload, cb) => {
      const roomCode = socket.data.cosmicRoom;
      const playerId = socket.data.cosmicPlayerId;
      try {
        const game = roomManager.getCosmicRoom(roomCode);
        if (!game || !game.getPlayer(playerId)) throw new CosmicError('You are not in a Cosmic Encounter room.');
        fn(game, playerId, payload && typeof payload === 'object' ? payload : {});
        broadcast(io, roomCode);
        schedule(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [CosmicError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    };

    socket.on('cosmic:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, token, guestKey, settings,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        modes.assertAvailable(MODE_ID, identity.accountId);
        const game = roomManager.createCosmicRoom(identity.playerId, settings, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        // Back inside the twenty seconds: nothing happened at all.
        liveRoom.disarmDrop(game.roomCode, player.id);
        liveRoom.unwatch(socket);
        socket.join(game.roomCode);
        socket.data.cosmicRoom = game.roomCode;
        socket.data.cosmicPlayerId = player.id;
        socket.data.cosmicAccountId = identity.accountId;
        roomManager.persistCosmic(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
      } catch (err) {
        cb?.(errorPayload(err, [CosmicError]));
      }
    });

    socket.on('cosmic:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getCosmicRoom(roomCode);
        if (!game) throw new CosmicError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const existing = game.getPlayer(identity.playerId);
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
          // Out is out: a seat somebody gave up cannot be taken back, and
          // the client turns this refusal into a place in the gallery.
          liveRoom.assertSeatReclaimable(existing);
        } else if (!identity.nickname) {
          throw new CosmicError('Nickname is required.');
        }
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        socket.join(game.roomCode);
        socket.data.cosmicRoom = game.roomCode;
        socket.data.cosmicPlayerId = player.id;
        socket.data.cosmicAccountId = identity.accountId;
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
        broadcast(io, game.roomCode);
        schedule(io, game.roomCode);
        io.to(game.roomCode).emit('cosmic:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED', params: { name: player.nickname },
        });
      } catch (err) {
        cb?.(errorPayload(err, [CosmicError]));
      }
    });

    socket.on('cosmic:settings', act((game, playerId, p) => game.updateSettings(playerId, p.settings || {})));
    socket.on('cosmic:ready', act((game, playerId, p) => game.setReady(playerId, p.ready)));

    socket.on('cosmic:start', act((game, playerId) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.cosmicAccountId);
      modes.assertAvailable(MODE_ID, socket.data.cosmicAccountId);
      game.start(playerId);
    }));

    socket.on('cosmic:restart', act((game, playerId, p) => {
      game.assertHost(playerId);
      access.assertCanStart(socket.data.cosmicAccountId);
      game.restart(playerId);
      if (p.startNow) {
        modes.assertAvailable(MODE_ID, socket.data.cosmicAccountId);
        game.start(playerId);
      }
    }));

    socket.on('cosmic:chooseAlien', act((game, playerId, p) => game.chooseAlien(playerId, idString(p.alienId, 30))));
    socket.on('cosmic:beginTurn', act((game, playerId) => game.beginTurn(playerId)));
    socket.on('cosmic:regroup', act((game, playerId, p) => game.regroup(playerId, idString(p.planetId, 20))));
    socket.on('cosmic:drawDestiny', act((game, playerId) => game.drawDestiny(playerId)));
    socket.on('cosmic:chooseDefender', act((game, playerId, p) => game.chooseDefender(playerId, idString(p.targetId))));
    socket.on('cosmic:ownColor', act((game, playerId, p) => game.ownColorChoice(playerId, idString(p.choice, 10))));
    socket.on('cosmic:launch', act((game, playerId, p) => game.launch(playerId, {
      planetId: idString(p.planetId, 20), defenderId: idString(p.defenderId), ships: shipMap(p.ships),
    })));
    socket.on('cosmic:mind', act((game, playerId, p) => game.useMind(playerId, idString(p.targetId))));
    socket.on('cosmic:invite', act((game, playerId, p) => game.invite(playerId, idList(p.ids))));
    socket.on('cosmic:ally', act((game, playerId, p) => game.respondAlliance(playerId, {
      side: idString(p.side, 10), ships: shipMap(p.ships),
    })));
    socket.on('cosmic:power', act((game, playerId, p) => game.usePower(playerId, { power: idString(p.power, 20), use: !!p.use })));
    socket.on('cosmic:selectCard', act((game, playerId, p) => game.selectCard(playerId, idString(p.uid, 20))));
    socket.on('cosmic:reinforce', act((game, playerId, p) => game.playReinforcement(playerId, idString(p.uid, 20), idString(p.side, 10))));
    socket.on('cosmic:artifact', act((game, playerId, p) => game.playArtifact(playerId, idString(p.uid, 20), {
      targetId: idString(p.targetId), targetIds: idList(p.targetIds),
    })));
    socket.on('cosmic:pass', act((game, playerId) => game.pass(playerId)));
    socket.on('cosmic:proposeDeal', act((game, playerId, p) => game.proposeDeal(playerId, {
      give: idList(p.give, 20),
      take: p.take,
      colonyMe: idString(p.colonyMe, 20),
      colonyOther: idString(p.colonyOther, 20),
      shipsMe: p.shipsMe,
      shipsOther: p.shipsOther,
    })));
    socket.on('cosmic:acceptDeal', act((game, playerId, p) => game.acceptDeal(playerId, Number(p.proposalId))));
    socket.on('cosmic:rewards', act((game, playerId, p) => game.claimRewards(playerId, p.cards)));
    socket.on('cosmic:clone', act((game, playerId, p) => game.cloneChoice(playerId, !!p.keep)));
    socket.on('cosmic:fetch', act((game, playerId, p) => game.fetch(playerId, {
      cardUid: idString(p.cardUid, 20), targetId: idString(p.targetId), reward: idString(p.reward, 10),
    })));
    socket.on('cosmic:fetchAnswer', act((game, playerId, p) => game.fetchAnswer(playerId, !!p.accept)));
    socket.on('cosmic:continue', act((game, playerId, p) => game.continueTurn(playerId, !!p.again)));

    socket.on('cosmic:chat', ({ text, emote } = {}) => {
      const game = roomManager.getCosmicRoom(socket.data.cosmicRoom);
      const player = game?.getPlayer(socket.data.cosmicPlayerId);
      if (!player) return;
      const message = roomChat.prepareRoomMessage({
        text, emote: idString(emote, 80), sender: player, players: game.players,
      });
      if (!message) return;
      io.to(game.roomCode).emit('cosmic:chat', message);
      roomChat.notifyMentions(message, { players: game.players, context: { kind: 'room', gameType: 'cosmic', roomCode: game.roomCode } });
    });

    // --- watching -----------------------------------------------------

    // Anyone may watch a room without taking a seat, before or after the
    // game started. A watcher is sent the payload built for no viewer at
    // all, so nothing private is in it, and has no events with which to
    // act on the game.
    socket.on('cosmic:spectate', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getCosmicRoom(roomCode);
        if (!game) throw new CosmicError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const own = game.getPlayer(identity.playerId);
        if (own && !own.left) throw new CosmicError('You are playing in this room.');
        const viewer = liveRoom.watch(socket, game.roomCode, 'cosmic', identity);
        if (!viewer) throw new CosmicError('This room has too many spectators already.');
        cb?.({ ok: true, roomCode: game.roomCode, spectator: true, state: spectatorState(game) });
        broadcast(io, game.roomCode);
      } catch (err) {
        cb?.(errorPayload(err, [CosmicError]));
      }
    });

    socket.on('cosmic:unspectate', () => {
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
    });

    // --- giving up ----------------------------------------------------

    // The client has already asked for a confirmation by the time this
    // arrives. Surrendering is final; the player stays on as a watcher.
    socket.on('cosmic:surrender', (payload, cb) => {
      const roomCode = socket.data.cosmicRoom;
      const playerId = socket.data.cosmicPlayerId;
      try {
        const game = roomManager.getCosmicRoom(roomCode);
        const player = game?.getPlayer(playerId);
        if (!game || !player) throw new CosmicError('You are not in a Cosmic Encounter room.');
        if (player.exitReason) throw new CosmicError('You have already left this game.');
        const seat = {
          playerId, nickname: player.nickname, accountId: player.accountId, avatarUrl: player.avatarUrl,
        };
        dropPlayer(io, roomCode, playerId, 'surrender');
        if (roomManager.getCosmicRoom(roomCode)) {
          liveRoom.watch(socket, roomCode, 'cosmic', seat);
          broadcast(io, roomCode);
        }
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [CosmicError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('cosmic:leave', () => {
      const roomCode = socket.data.cosmicRoom;
      const playerId = socket.data.cosmicPlayerId;
      DATA_KEYS.forEach((k) => { socket.data[k] = null; });
      liveRoom.unwatch(socket);
      const game = roomManager.getCosmicRoom(roomCode);
      if (!game) return;
      socket.leave(roomCode);
      dropPlayer(io, roomCode, playerId, 'left');
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.cosmicRoom;
      const playerId = socket.data.cosmicPlayerId;
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
      const game = roomManager.getCosmicRoom(roomCode);
      if (!game || !playerId) return;
      const player = game.getPlayer(playerId);
      if (!player || player.exitReason) return;
      // A socket that closed AFTER its owner had already reconnected is
      // stale: the seat now answers to a different socket, and treating
      // this close as a disconnect would knock a player who is sitting
      // right there offline - and start a countdown on them.
      if (player.socketId !== socket.id) return;
      game.setConnected(playerId, false);
      // Not a departure yet: twenty seconds to come back, counted down on
      // every screen in the room.
      liveRoom.armDrop(roomCode, playerId, () => dropPlayer(io, roomCode, playerId, 'timeout'));
      broadcast(io, roomCode);
      schedule(io, roomCode);
    });
  });
}

module.exports = { registerCosmicHandlers };
