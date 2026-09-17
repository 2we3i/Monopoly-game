// mafiaHandler.js
// Real-time layer for the Mafia mode.
//
// Two things make it different from the Monopoly handler. First, state
// is never broadcast to a room: every player is sent their OWN view,
// built by MafiaGame.toClientJSON, because most of a Mafia state is
// secret. Second, the game runs on a clock - each phase has a deadline,
// and the server (not a client) is what moves the game on when the
// deadline passes or when everyone has already acted.
//
// Permissions come from platform/access, exactly as for Monopoly.

const roomManager = require('../game/RoomManager');
const { MafiaError, PHASES } = require('../mafia/MafiaGame');
const { presetSettings, randomSettings, MAX_PLAYERS } = require('../mafia/settings');
const { isMafiaRole, roleDef, TEAMS } = require('../mafia/roles');
const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload, idString,
} = require('./roomSockets');
const liveRoom = require('./liveRoom');

const { AccessError } = access;
const MODE_ID = 'mafia.classic';
const phaseTimers = new Map();
let ioRef = null;

function sendError(socket, message) {
  socket.emit('mafia:error', { message });
}

// Every player gets a payload of their own - this is the only function
// that writes a Mafia state onto a socket.
// eslint-disable-next-line import/order
const roomChat = require('../social/roomChat');

// Cosmetics are looks only, added after the engine has built the
// (secret-respecting) payload for this viewer.
function clientState(game, viewerId) {
  const state = game.toClientJSON(viewerId);
  state.players = roomChat.decoratePlayers(state.players, (p) => game.getPlayer(p.id)?.accountId);
  return liveRoom.decorate(state, game.roomCode);
}

// A watcher has no seat, so they get the payload built for nobody: the
// engine hides every role from a viewer it does not recognise, which is
// exactly what a spectator may see.
function spectatorState(game) {
  const state = clientState(game, null);
  state.spectating = true;
  return state;
}

function broadcast(io, roomCode) {
  const game = roomManager.getMafiaRoom(roomCode);
  if (!game) return;
  roomManager.persistMafia(roomCode);
  game.players.forEach((player) => {
    if (!player.socketId) return;
    io.to(player.socketId).emit('mafia:state', clientState(game, player.id));
  });
  liveRoom.sendToSpectators(io, roomCode, 'mafia:state', () => spectatorState(game));
  registry.observe('mafia', game);
}

function clearPhaseTimer(roomCode) {
  const timer = phaseTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    phaseTimers.delete(roomCode);
  }
}

// Arms the clock for whatever phase the game is in now, and keeps arming
// it as the game walks forward - a single chain, so a phase can never
// end up with two timers or none.
function schedulePhase(io, roomCode) {
  clearPhaseTimer(roomCode);
  const game = roomManager.getMafiaRoom(roomCode);
  if (!game || game.phase === PHASES.GAME_OVER || game.phase === PHASES.LOBBY) return;
  if (!game.phaseEndsAt) return;

  const delay = Math.max(250, game.phaseEndsAt - Date.now());
  const timer = setTimeout(() => {
    phaseTimers.delete(roomCode);
    const current = roomManager.getMafiaRoom(roomCode);
    if (!current) return;
    try {
      current.advance();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Mafia phase advance failed in ${roomCode}:`, err.message);
    }
    broadcast(io, roomCode);
    schedulePhase(io, roomCode);
  }, delay);
  phaseTimers.set(roomCode, timer);
}

// Everyone has acted - there is nothing left to wait for, so the phase
// ends early instead of burning the rest of its timer.
function advanceEarly(io, roomCode) {
  const game = roomManager.getMafiaRoom(roomCode);
  if (!game) return;
  clearPhaseTimer(roomCode);
  try {
    game.advance();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Mafia early advance failed in ${roomCode}:`, err.message);
  }
  broadcast(io, roomCode);
  schedulePhase(io, roomCode);
}

function stageOf(phase) {
  if (phase === PHASES.LOBBY) return 'lobby';
  if (phase === PHASES.GAME_OVER) return 'finished';
  return 'active';
}

// A phase that nobody is still expected to act in must not sit out its
// clock: after a seat empties, the remaining table may already be done.
function advanceIfSettled(io, roomCode) {
  const game = roomManager.getMafiaRoom(roomCode);
  if (!game) return;
  if (game.phase === PHASES.NIGHT && game.everyoneActed()) advanceEarly(io, roomCode);
  else if (game.phase === PHASES.VOTE && game.everyoneVoted()) advanceEarly(io, roomCode);
}

// One player stops being a player: they gave up, their twenty seconds ran
// out, or they walked out. All three end the same way in the engine - a
// mid-game departure is a death - and the room is told which it was.
function dropPlayer(io, roomCode, playerId, reason) {
  const game = roomManager.getMafiaRoom(roomCode);
  if (!game) return;
  const player = game.getPlayer(playerId);
  if (!player || player.exitReason) return;
  const { nickname } = player;
  liveRoom.disarmDrop(roomCode, playerId);
  liveRoom.markExit(game, playerId, reason);
  game.removePlayer(playerId);

  if (game.players.length === 0) {
    clearPhaseTimer(roomCode);
    liveRoom.disarmRoom(roomCode);
    roomManager.deleteMafiaRoom(roomCode, 'empty');
    liveRoom.closeSpectators(io, roomCode, 'mafia', 'empty');
    return;
  }
  if (game.phase !== PHASES.LOBBY && game.phase !== PHASES.GAME_OVER) game.checkWin();
  io.to(roomCode).emit('mafia:system', {
    type: reason === 'surrender' ? 'PLAYER_SURRENDERED' : 'PLAYER_DROPPED',
    params: { name: nickname },
  });
  broadcast(io, roomCode);
  schedulePhase(io, roomCode);
  advanceIfSettled(io, roomCode);
}

function resultFor(game, player) {
  if (!game.winner || game.winner === 'NOBODY') return 'loss';
  if (game.winner === 'MANIAC') return player.role === 'MANIAC' ? 'win' : 'loss';
  if (game.winner === TEAMS.MAFIA) return isMafiaRole(player.role) ? 'win' : 'loss';
  return roleDef(player.role).team === TEAMS.TOWN ? 'win' : 'loss';
}

const DATA_KEYS = ['mafiaRoom', 'mafiaPlayerId', 'mafiaAccountId'];

registry.register({
  type: 'mafia',
  rooms: () => roomManager.mafiaRooms.values(),
  get: (code) => roomManager.getMafiaRoom(code),
  summary(game) {
    const host = game.getPlayer(game.hostId);
    return {
      code: game.roomCode,
      gameType: 'mafia',
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
        status: p.left ? 'left' : p.alive ? 'alive' : 'dead',
      })),
      details: { day: game.dayNumber, winner: game.winner },
    };
  },
  matchSummary(game) {
    const stage = stageOf(game.phase);
    const host = game.getPlayer(game.hostId);
    return {
      gameType: 'mafia',
      roomCode: game.roomCode,
      modeId: MODE_ID,
      hostAccountId: host?.accountId || null,
      stage,
      players: game.players.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: game.winner,
          players: game.players.map((p) => ({ playerId: p.id, result: resultFor(game, p), role: p.role })),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const game = roomManager.getMafiaRoom(code);
    if (!game) return false;
    clearPhaseTimer(code);
    game.players.forEach((p) => notifyRemoved(ioRef, p.socketId, {
      gameType: 'mafia', roomCode: code, reason, dataKeys: DATA_KEYS,
    }));
    liveRoom.disarmRoom(code);
    liveRoom.closeSpectators(ioRef, code, 'mafia', reason);
    roomManager.deleteMafiaRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const game = roomManager.getMafiaRoom(code);
    const player = game?.getPlayer(playerId);
    if (!player) return false;
    notifyRemoved(ioRef, player.socketId, { gameType: 'mafia', roomCode: code, reason, dataKeys: DATA_KEYS });
    game.setConnected(playerId, false);
    dropPlayer(ioRef, code, playerId, 'kicked');
    if (!roomManager.getMafiaRoom(code)) return true;
    broadcast(ioRef, code);
    schedulePhase(ioRef, code);
    return true;
  },
});

function registerMafiaHandlers(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    const withGame = (fn) => (payload, cb) => {
      try {
        const roomCode = socket.data.mafiaRoom;
        const playerId = socket.data.mafiaPlayerId;
        const game = roomManager.getMafiaRoom(roomCode);
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        fn({
          game, roomCode, playerId, payload: payload && typeof payload === 'object' ? payload : {},
        });
        broadcast(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [MafiaError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    };

    socket.on('mafia:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, token, guestKey, settings, presetId,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        modes.assertAvailable(MODE_ID, identity.accountId);
        const initial = presetId ? presetSettings(presetId) : settings;
        const game = roomManager.createMafiaRoom(identity.playerId, initial, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        socket.join(game.roomCode);
        socket.data.mafiaRoom = game.roomCode;
        socket.data.mafiaPlayerId = player.id;
        socket.data.mafiaAccountId = identity.accountId;
        roomManager.persistMafia(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
        broadcast(io, game.roomCode);
      } catch (err) {
        cb?.(errorPayload(err, [MafiaError]));
      }
    });

    socket.on('mafia:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getMafiaRoom(roomCode);
        if (!game) throw new MafiaError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const existing = game.getPlayer(identity.playerId);
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
          // Out is out: a player who surrendered, walked out or ran out of
          // grace cannot take their seat back - only watch.
          liveRoom.assertSeatReclaimable(existing);
        }
        if (!existing && !identity.nickname) throw new MafiaError('Nickname is required.');
        if (!existing && game.players.length >= MAX_PLAYERS) {
          throw new MafiaError(`This room is full (${MAX_PLAYERS} players).`);
        }
        const player = existing
          ? game.setConnected(identity.playerId, true, socket.id)
          : game.addPlayer({ ...identity, socketId: socket.id });
        if (existing) existing.left = false;
        // Back inside the grace period: nothing happened at all.
        liveRoom.disarmDrop(game.roomCode, player.id);
        liveRoom.unwatch(socket);

        socket.join(game.roomCode);
        socket.data.mafiaRoom = game.roomCode;
        socket.data.mafiaPlayerId = player.id;
        socket.data.mafiaAccountId = identity.accountId;
        roomManager.persistMafia(game.roomCode);
        cb?.({
          ok: true, roomCode: game.roomCode, playerId: player.id, state: clientState(game, player.id),
        });
        broadcast(io, game.roomCode);
        io.to(game.roomCode).emit('mafia:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED',
          params: { name: player.nickname },
        });
      } catch (err) {
        cb?.(errorPayload(err, [MafiaError]));
      }
    });

    socket.on('mafia:settings', withGame(({ game, playerId, payload }) => {
      game.updateSettings(playerId, payload.settings || {});
    }));

    socket.on('mafia:preset', withGame(({ game, playerId, payload }) => {
      game.replaceSettings(playerId, presetSettings(idString(payload.presetId, 40)));
    }));

    socket.on('mafia:randomSettings', withGame(({ game, playerId }) => {
      game.assertHost(playerId);
      game.replaceSettings(playerId, randomSettings(game.players.length));
    }));

    socket.on('mafia:ready', withGame(({ game, playerId, payload }) => {
      game.setReady(playerId, payload.ready);
    }));

    socket.on('mafia:start', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      try {
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        game.assertHost(playerId);
        access.assertCanStart(socket.data.mafiaAccountId);
        modes.assertAvailable(MODE_ID, socket.data.mafiaAccountId);
        game.start(playerId);
        broadcast(io, roomCode);
        schedulePhase(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [MafiaError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('mafia:night', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      try {
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        // A role's second pick (the Don's sheriff check) arrives on the
        // same event, in its own field.
        const secondary = idString(payload?.secondaryTargetId);
        if (secondary) {
          game.submitNightAction(playerId, secondary, { secondary: true });
        } else {
          game.submitNightAction(playerId, idString(payload?.targetId));
        }
        broadcast(io, roomCode);
        if (game.everyoneActed()) advanceEarly(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [MafiaError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('mafia:vote', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      try {
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        game.castVote(playerId, idString(payload?.targetId));
        broadcast(io, roomCode);
        if (game.everyoneVoted()) advanceEarly(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [MafiaError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    // After a finished game the host takes the same room back to the
    // lobby - and, with `startNow`, straight into a new deal.
    socket.on('mafia:restart', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      try {
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        game.assertHost(playerId);
        access.assertCanStart(socket.data.mafiaAccountId);
        clearPhaseTimer(roomCode);
        game.restart(playerId);
        io.to(roomCode).emit('mafia:system', { type: 'GAME_RESTARTED', params: {} });
        // If the table is now too small to deal (or the mode was switched
        // off meanwhile), the room simply stays in the lobby.
        if (payload?.startNow) {
          try {
            modes.assertAvailable(MODE_ID, socket.data.mafiaAccountId);
            game.start(playerId);
          } catch (startErr) {
            if (!(startErr instanceof MafiaError) && !(startErr instanceof AccessError)) throw startErr;
            sendError(socket, startErr.message);
          }
        }
        broadcast(io, roomCode);
        schedulePhase(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [MafiaError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    // The host can cut a discussion short rather than wait out the clock.
    socket.on('mafia:skipPhase', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      try {
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        game.assertHost(playerId);
        if (game.phase === PHASES.LOBBY || game.phase === PHASES.GAME_OVER) {
          throw new MafiaError('Nothing to skip.');
        }
        advanceEarly(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [MafiaError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    // Chat obeys the same secrecy the rest of the game does: at night
    // the mafia have a channel of their own, and the dead can read
    // everything but say nothing to the living.
    socket.on('mafia:chat', ({ text, emote } = {}) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      if (!game) return;
      const player = game.getPlayer(playerId);
      if (!player) return;

      const isNight = game.phase === PHASES.NIGHT;
      const channel = !player.alive ? 'DEAD' : (isNight ? 'MAFIA' : 'TOWN');
      if (channel === 'MAFIA' && !['MAFIA', 'DON'].includes(player.role)) return;

      const prepared = roomChat.prepareRoomMessage({
        text, emote: typeof emote === 'string' ? emote.slice(0, 80) : null, sender: player, players: game.players,
      });
      if (!prepared) return;
      const message = { ...prepared, channel };
      const canRead = (p) => channel === 'TOWN'
        || (channel === 'DEAD' && !p.alive)
        || (channel === 'MAFIA' && (['MAFIA', 'DON'].includes(p.role) || !p.alive));
      game.players.forEach((p) => {
        if (p.socketId && canRead(p)) io.to(p.socketId).emit('mafia:chat', message);
      });
      roomChat.notifyMentions(message, {
        players: game.players, canRead, context: { kind: 'room', gameType: 'mafia', roomCode },
      });
    });

    // --- watching -----------------------------------------------------

    // Anyone may watch a Mafia room, at any point in the game, without
    // taking a seat. The payload a watcher gets is built for no viewer at
    // all, so no living player's role is in it.
    socket.on('mafia:spectate', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const game = roomManager.getMafiaRoom(roomCode);
        if (!game) throw new MafiaError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(game.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        // Someone with a live seat here is a player, not a watcher.
        const seat = game.getPlayer(identity.playerId);
        if (seat && !seat.left) throw new MafiaError('You are playing in this room.');
        const viewer = liveRoom.watch(socket, game.roomCode, 'mafia', identity);
        if (!viewer) throw new MafiaError('This room has too many spectators already.');
        cb?.({ ok: true, roomCode: game.roomCode, spectator: true, state: spectatorState(game) });
        broadcast(io, game.roomCode);
      } catch (err) {
        cb?.(errorPayload(err, [MafiaError]));
      }
    });

    socket.on('mafia:unspectate', () => {
      const roomCode = liveRoom.unwatch(socket);
      if (roomCode) broadcast(io, roomCode);
    });

    // --- giving up ----------------------------------------------------

    // Surrender is a real exit, not a disconnect: the seat is gone at once
    // and cannot be reclaimed. The confirmation happens in the client; by
    // the time this arrives the player has already said yes.
    socket.on('mafia:surrender', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      try {
        const game = roomManager.getMafiaRoom(roomCode);
        const player = game?.getPlayer(playerId);
        if (!game || !player) throw new MafiaError('You are not in a Mafia room.');
        if (player.exitReason) throw new MafiaError('You have already left this game.');
        dropPlayer(io, roomCode, playerId, 'surrender');
        // A player who gave up mid-game keeps watching from the gallery.
        if (roomManager.getMafiaRoom(roomCode)) {
          liveRoom.watch(socket, roomCode, 'mafia', {
            playerId, nickname: player.nickname, accountId: player.accountId, avatarUrl: player.avatarUrl,
          });
          broadcast(io, roomCode);
        }
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [MafiaError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('mafia:leave', () => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      socket.data.mafiaRoom = null;
      socket.data.mafiaPlayerId = null;
      socket.data.mafiaAccountId = null;
      liveRoom.unwatch(socket);
      if (!game) return;
      socket.leave(roomCode);
      dropPlayer(io, roomCode, playerId, 'left');
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcast(io, watched);
      if (!roomCode || !playerId) return;
      const game = roomManager.getMafiaRoom(roomCode);
      if (!game) return;
      const player = game.getPlayer(playerId);
      if (!player || player.exitReason) return;
      // A socket that closed AFTER its owner had already reconnected is
      // stale: the seat now answers to a different socket, and treating
      // this close as a disconnect would knock a player who is sitting
      // right there offline - and start a countdown on them.
      if (player.socketId !== socket.id) return;
      game.setConnected(playerId, false);
      // A dropped connection is not a death - yet. The player has twenty
      // seconds to come back; the room sees the countdown, and only when
      // it runs out does the seat actually empty.
      liveRoom.armDrop(roomCode, playerId, () => dropPlayer(io, roomCode, playerId, 'timeout'));
      broadcast(io, roomCode);
    });
  });
}

module.exports = { registerMafiaHandlers, broadcastMafia: broadcast, scheduleMafiaPhase: schedulePhase };
