// mafiaHandler.js
// Real-time layer for the Mafia mode.
//
// Two things make it different from the Monopoly handler. First, state
// is never broadcast to a room: every player is sent their OWN view,
// built by MafiaGame.toClientJSON, because most of a Mafia state is
// secret. Second, the game runs on a clock - each phase has a deadline,
// and the server (not a client) is what moves the game on when the
// deadline passes or when everyone has already acted.

const roomManager = require('../game/RoomManager');
const { MafiaError, PHASES } = require('../mafia/MafiaGame');
const { presetSettings, randomSettings, MAX_PLAYERS } = require('../mafia/settings');
const accountsDb = require('../db/accounts');
const sessionToken = require('../auth/sessionToken');

const phaseTimers = new Map();

function resolveAccountFromToken(token) {
  if (!token) return null;
  const accountId = sessionToken.verify(token);
  if (!accountId) return null;
  const row = accountsDb.findById(accountId);
  if (!row) return null;
  return accountsDb.toPublicAccount(row);
}

function identityFrom({ token, playerId, nickname }) {
  const account = resolveAccountFromToken(token);
  return {
    playerId: account ? account.id : playerId,
    nickname: account ? account.nickname : (nickname || '').trim(),
    avatarUrl: account ? account.avatarPath : null,
    accountId: account ? account.id : null,
  };
}

function sendError(socket, message) {
  socket.emit('mafia:error', { message });
}

// Every player gets a payload of their own - this is the only function
// that writes a Mafia state onto a socket.
function broadcast(io, roomCode) {
  const game = roomManager.getMafiaRoom(roomCode);
  if (!game) return;
  roomManager.persistMafia(roomCode);
  game.players.forEach((player) => {
    if (!player.socketId) return;
    io.to(player.socketId).emit('mafia:state', game.toClientJSON(player.id));
  });
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

function registerMafiaHandlers(io) {
  io.on('connection', (socket) => {
    const withGame = (fn) => (payload, cb) => {
      try {
        const roomCode = socket.data.mafiaRoom;
        const playerId = socket.data.mafiaPlayerId;
        const game = roomManager.getMafiaRoom(roomCode);
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        fn({ game, roomCode, playerId, payload: payload || {} });
        broadcast(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        if (!(err instanceof MafiaError)) {
          // eslint-disable-next-line no-console
          console.error('Mafia handler error:', err);
        }
        sendError(socket, err.message);
        cb?.({ ok: false, error: err.message });
      }
    };

    socket.on('mafia:create', ({ nickname, playerId, token, settings, presetId }, cb) => {
      try {
        const identity = identityFrom({ token, playerId, nickname });
        if (!identity.nickname) throw new MafiaError('Nickname is required.');
        const initial = presetId ? presetSettings(presetId) : settings;
        const game = roomManager.createMafiaRoom(identity.playerId, initial);
        const player = game.addPlayer({ ...identity, socketId: socket.id });
        socket.join(game.roomCode);
        socket.data.mafiaRoom = game.roomCode;
        socket.data.mafiaPlayerId = player.id;
        roomManager.persistMafia(game.roomCode);
        cb?.({ ok: true, roomCode: game.roomCode, playerId: player.id, state: game.toClientJSON(player.id) });
        broadcast(io, game.roomCode);
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('mafia:join', ({ roomCode, nickname, playerId, token }, cb) => {
      try {
        const game = roomManager.getMafiaRoom(roomCode);
        if (!game) throw new MafiaError('Room not found. Check the code and try again.');
        const identity = identityFrom({ token, playerId, nickname });
        const existing = game.getPlayer(identity.playerId);
        if (!existing && !identity.nickname) throw new MafiaError('Nickname is required.');
        if (!existing && game.players.length >= MAX_PLAYERS) {
          throw new MafiaError(`This room is full (${MAX_PLAYERS} players).`);
        }
        const player = existing
          ? game.setConnected(identity.playerId, true, socket.id)
          : game.addPlayer({ ...identity, socketId: socket.id });

        socket.join(game.roomCode);
        socket.data.mafiaRoom = game.roomCode;
        socket.data.mafiaPlayerId = player.id;
        roomManager.persistMafia(game.roomCode);
        cb?.({ ok: true, roomCode: game.roomCode, playerId: player.id, state: game.toClientJSON(player.id) });
        broadcast(io, game.roomCode);
        io.to(game.roomCode).emit('mafia:system', {
          type: existing ? 'PLAYER_RECONNECTED' : 'PLAYER_JOINED',
          params: { name: player.nickname },
        });
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('mafia:settings', withGame(({ game, playerId, payload }) => {
      game.updateSettings(playerId, payload.settings || {});
    }));

    socket.on('mafia:preset', withGame(({ game, playerId, payload }) => {
      game.replaceSettings(playerId, presetSettings(payload.presetId));
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
        game.start(playerId);
        broadcast(io, roomCode);
        schedulePhase(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        sendError(socket, err.message);
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('mafia:night', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      try {
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        game.submitNightAction(playerId, payload?.targetId);
        broadcast(io, roomCode);
        if (game.everyoneActed()) advanceEarly(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        sendError(socket, err.message);
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('mafia:vote', (payload, cb) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      try {
        if (!game) throw new MafiaError('You are not in a Mafia room.');
        game.castVote(playerId, payload?.targetId);
        broadcast(io, roomCode);
        if (game.everyoneVoted()) advanceEarly(io, roomCode);
        cb?.({ ok: true });
      } catch (err) {
        sendError(socket, err.message);
        cb?.({ ok: false, error: err.message });
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
        sendError(socket, err.message);
        cb?.({ ok: false, error: err.message });
      }
    });

    // Chat obeys the same secrecy the rest of the game does: at night
    // the mafia have a channel of their own, and the dead can read
    // everything but say nothing to the living.
    socket.on('mafia:chat', ({ text }) => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      if (!game) return;
      const player = game.getPlayer(playerId);
      if (!player) return;
      const clean = String(text || '').trim().slice(0, 300);
      if (!clean) return;

      const isNight = game.phase === PHASES.NIGHT;
      const channel = !player.alive ? 'DEAD' : (isNight ? 'MAFIA' : 'TOWN');
      if (channel === 'MAFIA' && !['MAFIA', 'DON'].includes(player.role)) return;

      const message = {
        channel,
        playerId: player.id,
        nickname: player.nickname,
        text: clean,
        ts: Date.now(),
      };
      game.players.forEach((p) => {
        if (!p.socketId) return;
        const canRead = channel === 'TOWN'
          || (channel === 'DEAD' && !p.alive)
          || (channel === 'MAFIA' && (['MAFIA', 'DON'].includes(p.role) || !p.alive));
        if (canRead) io.to(p.socketId).emit('mafia:chat', message);
      });
    });

    socket.on('mafia:leave', () => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      const game = roomManager.getMafiaRoom(roomCode);
      socket.data.mafiaRoom = null;
      socket.data.mafiaPlayerId = null;
      if (!game) return;
      game.removePlayer(playerId);
      socket.leave(roomCode);
      if (game.players.length === 0) {
        clearPhaseTimer(roomCode);
        roomManager.deleteMafiaRoom(roomCode);
        return;
      }
      broadcast(io, roomCode);
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.mafiaRoom;
      const playerId = socket.data.mafiaPlayerId;
      if (!roomCode || !playerId) return;
      const game = roomManager.getMafiaRoom(roomCode);
      if (!game) return;
      game.setConnected(playerId, false);
      // A disconnect is never a death here: a reload mid-night should
      // not cost a player their game, and the phase clock keeps running
      // regardless of who is currently looking at it.
      broadcast(io, roomCode);
    });
  });
}

module.exports = { registerMafiaHandlers, broadcastMafia: broadcast, scheduleMafiaPhase: schedulePhase };
