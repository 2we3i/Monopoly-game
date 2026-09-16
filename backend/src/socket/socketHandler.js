// socketHandler.js
// Real-time layer for Monopoly.
//
// Every create/join goes through platform/access: only a registered
// account may create or start a room, a blocked account may do nothing,
// and a reconnect may only reclaim a seat that is provably the caller's.

const roomManager = require('../game/RoomManager');
const { GameError } = require('../game/GameManager');
const { LAYOUT_OPTIONS, DEFAULT_LAYOUT_ID } = require('../game/boardLayouts');
const access = require('../platform/access');
const modes = require('../platform/modes');
const registry = require('../platform/registry');
const bans = require('../platform/bans');
const {
  notifyRemoved, clientMessage, errorPayload,
} = require('./roomSockets');
const roomChat = require('../social/roomChat');
const liveRoom = require('./liveRoom');

const { AccessError } = access;
const DISCONNECT_GRACE_MS = 1000 * 60 * 10;
const disconnectTimers = new Map();
// One timer per room with a running auction, keyed by auction id and
// closing time so a bid that extends the auction re-arms it exactly once.
const auctionTimers = new Map();
let ioRef = null;

// The state every client receives. The guest key hash is a server-side
// secret check and never leaves the server. Cosmetics are looks only and
// are added after the game state is built. serverTime lets every client
// count down to the same auction deadline whatever its own clock says.
function roomStatePayload(mgr) {
  const state = mgr.state.toJSON();
  state.players = roomChat.decoratePlayers(
    state.players.map(({ guestKeyHash, ...p }) => ({ ...p, isGuest: !p.accountId })),
    (p) => p.accountId,
  );
  return liveRoom.decorate(state, mgr.state.roomCode);
}

function clearAuctionTimer(roomCode) {
  const entry = auctionTimers.get(roomCode);
  if (entry) {
    clearTimeout(entry.timer);
    auctionTimers.delete(roomCode);
  }
}

function syncAuctionTimer(io, roomCode) {
  const mgr = roomManager.getRoom(roomCode);
  const auction = mgr?.state.auction;
  const key = auction ? `${auction.id}:${auction.endsAt}` : null;
  const existing = auctionTimers.get(roomCode);
  if (existing && existing.key === key) return;
  clearAuctionTimer(roomCode);
  if (!auction) return;
  const timer = setTimeout(() => {
    auctionTimers.delete(roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    // eslint-disable-next-line no-use-before-define
    if (room.tickAuction(Date.now())) broadcastState(io, roomCode);
    else syncAuctionTimer(io, roomCode);
  }, Math.max(0, auction.endsAt - Date.now()) + 25);
  timer.unref?.();
  auctionTimers.set(roomCode, { key, timer });
}

// Final places: the winner first, then the players still solvent by cash,
// then the bankrupt in reverse order of elimination.
function monopolyPlaces(state) {
  const order = [...state.players].sort((a, b) => {
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
    if (a.bankrupt) return (b.bankruptAt || 0) - (a.bankruptAt || 0);
    return b.money - a.money;
  });
  return new Map(order.map((p, i) => [p.id, i + 1]));
}

function broadcastState(io, roomCode) {
  const mgr = roomManager.getRoom(roomCode);
  if (!mgr) return;
  roomManager.persist(roomCode);
  syncAuctionTimer(io, roomCode);
  io.to(roomCode).emit('game:state', roomStatePayload(mgr));
  registry.observe('monopoly', mgr);
}

function sendError(socket, message) {
  socket.emit('game:error', { message });
}

function clearDisconnectTimer(roomCode, playerId) {
  const key = `${roomCode}:${playerId}`;
  const t = disconnectTimers.get(key);
  if (t) {
    clearTimeout(t);
    disconnectTimers.delete(key);
  }
}

function scheduleAutoSkip(io, roomCode, playerId) {
  const key = `${roomCode}:${playerId}`;
  clearDisconnectTimer(roomCode, playerId);
  const timer = setTimeout(() => {
    const mgr = roomManager.getRoom(roomCode);
    if (!mgr) return;
    const cp = mgr.state.currentPlayer;
    if (cp && cp.id === playerId && !cp.connected && mgr.state.phase !== 'GAME_OVER' && mgr.state.phase !== 'LOBBY') {
      try {
        if (cp.money < 0) {
          mgr.declareBankruptcy(playerId);
        } else {
          // An unanswered purchase counts as a pass: the square goes to auction.
          const pending = mgr.state.pendingAction;
          if (pending?.type === 'BUY_DECISION' && pending.playerId === playerId) mgr.declinePurchase(playerId, pending.tileId);
          mgr.state.pendingAction = null;
          mgr.state.phase = 'ACTION';
          mgr.endTurn(playerId);
        }
        mgr.state.addLog(`${cp.nickname} was auto-skipped after a long disconnect.`, 'AUTO_SKIPPED', { name: cp.nickname });
      } catch (err) {
        mgr.advanceTurn();
      }
      broadcastState(io, roomCode);
    }
    disconnectTimers.delete(key);
  }, DISCONNECT_GRACE_MS);
  disconnectTimers.set(key, timer);
}

function stageOf(phase) {
  if (phase === 'LOBBY') return 'lobby';
  if (phase === 'GAME_OVER') return 'finished';
  return 'active';
}

const DATA_KEYS = ['roomCode', 'playerId', 'accountId'];

// A player stops being a player: they gave up, walked out, or their twenty
// seconds of grace ran out. Before the game starts that empties the seat;
// once it has started, the only honest way out of a Monopoly game is
// bankruptcy, so that is what it becomes.
function dropPlayer(io, roomCode, playerId, reason) {
  const mgr = roomManager.getRoom(roomCode);
  if (!mgr) return;
  const player = mgr.state.getPlayer(playerId);
  if (!player || player.exitReason) return;
  clearDisconnectTimer(roomCode, playerId);
  liveRoom.disarmDrop(roomCode, playerId);
  liveRoom.markExit(mgr, playerId, reason);
  const { nickname } = player;

  if (mgr.state.phase === 'LOBBY') {
    mgr.removePlayer(playerId);
  } else {
    if (!player.bankrupt && mgr.state.phase !== 'GAME_OVER') {
      try {
        mgr.declareBankruptcy(playerId);
      } catch (err) {
        // Already out, or the game is over - either way there is nothing
        // left for this player to give up.
      }
    }
    mgr.markDisconnected(playerId);
  }
  if (mgr.state.players.length === 0) {
    liveRoom.disarmRoom(roomCode);
    clearAuctionTimer(roomCode);
    roomManager.deleteRoom(roomCode, 'empty');
    liveRoom.closeSpectators(io, roomCode, 'monopoly', 'empty');
    return;
  }
  io.to(roomCode).emit('chat:system', {
    message: reason === 'surrender' ? nickname + ' surrendered.' : nickname + ' is out of the game.',
    type: reason === 'surrender' ? 'PLAYER_SURRENDERED' : 'PLAYER_DROPPED',
    params: { name: nickname },
  });
  broadcastState(io, roomCode);
}

registry.register({
  type: 'monopoly',
  rooms: () => roomManager.rooms.values(),
  get: (code) => roomManager.getRoom(code),
  summary(mgr) {
    const s = mgr.state;
    const host = s.players.find((p) => p.id === mgr.hostId) || s.players.find((p) => p.isHost);
    const winner = s.winnerId ? s.getPlayer(s.winnerId) : null;
    return {
      code: s.roomCode,
      gameType: 'monopoly',
      modeId: modes.monopolyModeId(s.modeId),
      hostId: mgr.hostId,
      hostNickname: host?.nickname || null,
      hostAccountId: host?.accountId || null,
      createdAt: s.createdAt,
      phase: s.phase,
      stage: stageOf(s.phase),
      maxPlayers: 10,
      players: s.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        accountId: p.accountId || null,
        isGuest: !p.accountId,
        connected: !!p.connected,
        isHost: p.id === mgr.hostId,
        status: p.bankrupt ? 'bankrupt' : 'playing',
      })),
      details: {
        currentPlayer: s.phase !== 'LOBBY' && s.phase !== 'GAME_OVER' ? s.currentPlayer?.nickname || null : null,
        winner: winner?.nickname || null,
        board: s.modeId,
      },
    };
  },
  matchSummary(mgr) {
    const s = mgr.state;
    const stage = stageOf(s.phase);
    const host = s.getPlayer(mgr.hostId);
    const winner = s.winnerId ? s.getPlayer(s.winnerId) : null;
    const places = stage === 'finished' ? monopolyPlaces(s) : null;
    return {
      gameType: 'monopoly',
      roomCode: s.roomCode,
      modeId: modes.monopolyModeId(s.modeId),
      hostAccountId: host?.accountId || null,
      stage,
      players: s.players.map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname })),
      results: stage === 'finished'
        ? {
          winner: winner?.nickname || null,
          players: s.players.map((p) => ({
            playerId: p.id, result: p.id === s.winnerId ? 'win' : 'loss', score: p.money, place: places.get(p.id),
          })),
        }
        : null,
    };
  },
  close(code, reason = 'closed') {
    const mgr = roomManager.getRoom(code);
    if (!mgr) return false;
    mgr.state.players.forEach((p) => {
      clearDisconnectTimer(code, p.id);
      notifyRemoved(ioRef, p.socketId, { gameType: 'monopoly', roomCode: code, reason, dataKeys: DATA_KEYS });
    });
    clearAuctionTimer(code);
    liveRoom.disarmRoom(code);
    liveRoom.closeSpectators(ioRef, code, 'monopoly', reason);
    roomManager.deleteRoom(code, reason);
    return true;
  },
  kick(code, playerId, reason = 'kicked') {
    const mgr = roomManager.getRoom(code);
    const player = mgr?.state.getPlayer(playerId);
    if (!player) return false;
    clearDisconnectTimer(code, playerId);
    notifyRemoved(ioRef, player.socketId, { gameType: 'monopoly', roomCode: code, reason, dataKeys: DATA_KEYS });
    if (mgr.state.phase === 'LOBBY') {
      mgr.removePlayer(playerId);
    } else {
      if (!player.bankrupt && mgr.state.phase !== 'GAME_OVER') mgr.declareBankruptcy(playerId);
      mgr.markDisconnected(playerId);
    }
    if (mgr.state.players.length === 0) {
      roomManager.deleteRoom(code, reason);
    } else {
      broadcastState(ioRef, code);
    }
    return true;
  },
});

function registerSocketHandlers(io) {
  ioRef = io;
  // Rooms restored from disk may have an auction in progress.
  [...roomManager.rooms.keys()].forEach((code) => syncAuctionTimer(io, code));
  io.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;
    socket.data.accountId = null;

    socket.on('room:create', (payload, cb) => {
      try {
        const {
          nickname, playerId, modeId, token, guestKey,
        } = payload || {};
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        access.assertCanCreate(identity);
        const layoutId = modeId || DEFAULT_LAYOUT_ID;
        if (!LAYOUT_OPTIONS.some((opt) => opt.id === layoutId)) {
          throw new GameError(`Unknown game mode "${modeId}".`);
        }
        modes.assertAvailable(modes.monopolyModeId(layoutId));

        const mgr = roomManager.createRoom(identity.playerId, layoutId, {
          accountId: identity.accountId, nickname: identity.nickname,
        });
        const player = mgr.addPlayer({
          playerId: identity.playerId,
          socketId: socket.id,
          nickname: identity.nickname,
          avatarUrl: identity.avatarUrl,
          accountId: identity.accountId,
        });
        socket.join(mgr.state.roomCode);
        socket.data.roomCode = mgr.state.roomCode;
        socket.data.playerId = player.id;
        socket.data.accountId = identity.accountId;
        roomManager.persist(mgr.state.roomCode);
        cb?.({ ok: true, roomCode: mgr.state.roomCode, playerId: player.id, state: roomStatePayload(mgr) });
        io.to(mgr.state.roomCode).emit('game:state', roomStatePayload(mgr));
      } catch (err) {
        cb?.(errorPayload(err, [GameError]));
      }
    });

    socket.on('room:join', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const mgr = roomManager.getRoom(roomCode);
        if (!mgr) throw new GameError('Room not found. Check the code and try again.');

        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(mgr.state.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }

        const existing = mgr.state.getPlayer(identity.playerId);
        let player;
        if (existing) {
          access.assertCanClaimSeat(existing, identity);
          // Out is out: a seat somebody gave up cannot be taken back, and
          // the client turns this refusal into a place in the gallery.
          liveRoom.assertSeatReclaimable(existing);
          clearDisconnectTimer(mgr.state.roomCode, identity.playerId);
          liveRoom.disarmDrop(mgr.state.roomCode, identity.playerId);
          liveRoom.unwatch(socket);
          player = mgr.reconnectPlayer(identity.playerId, socket.id);
          if (!identity.isGuest) {
            player.nickname = identity.nickname;
            player.avatarUrl = identity.avatarUrl;
          }
        } else {
          if (!identity.nickname) throw new GameError('Nickname is required.');
          player = mgr.addPlayer({
            playerId: identity.playerId,
            socketId: socket.id,
            nickname: identity.nickname,
            avatarUrl: identity.avatarUrl,
            accountId: identity.accountId,
            guestKeyHash: identity.guestKeyHash,
          });
        }

        socket.join(mgr.state.roomCode);
        socket.data.roomCode = mgr.state.roomCode;
        socket.data.playerId = player.id;
        socket.data.accountId = identity.accountId;
        roomManager.persist(mgr.state.roomCode);
        cb?.({ ok: true, roomCode: mgr.state.roomCode, playerId: player.id, state: roomStatePayload(mgr) });
        io.to(mgr.state.roomCode).emit('game:state', roomStatePayload(mgr));
        io.to(mgr.state.roomCode).emit('chat:system', { message: `${player.nickname} joined.`, type: 'PLAYER_JOINED_CHAT', params: { name: player.nickname } });
      } catch (err) {
        cb?.(errorPayload(err, [GameError]));
      }
    });

    socket.on('room:rejoinCheck', ({ roomCode, playerId } = {}, cb) => {
      const mgr = roomManager.getRoom(roomCode);
      if (!mgr) return cb?.({ ok: false });
      const player = mgr.state.getPlayer(playerId);
      if (!player) return cb?.({ ok: false });
      cb?.({ ok: true });
    });

    // Explicit "I am leaving" - the only thing that permanently removes
    // a player from a LOBBY-phase room. Distinct from a raw disconnect,
    // which is ambiguous (reload vs. genuinely leaving).
    socket.on('room:leave', () => {
      const { roomCode, playerId } = socket.data;
      liveRoom.unwatch(socket);
      if (!roomCode || !playerId) return;
      const mgr = roomManager.getRoom(roomCode);
      socket.leave(roomCode);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      socket.data.accountId = null;
      if (!mgr) return;
      dropPlayer(io, roomCode, playerId, 'left');
    });

    // --- watching -------------------------------------------------------

    // A Monopoly board holds nothing secret, so a watcher simply receives
    // the room's own broadcasts - and has no events to act on it with.
    socket.on('room:spectate', (payload, cb) => {
      try {
        const {
          roomCode, nickname, playerId, token, guestKey,
        } = payload || {};
        const mgr = roomManager.getRoom(roomCode);
        if (!mgr) throw new GameError('Room not found. Check the code and try again.');
        const identity = access.resolveIdentity({
          token, playerId, nickname, guestKey,
        });
        if (bans.isBanned(mgr.state.roomCode, identity.playerId)) {
          throw new AccessError('You were removed from this room.', 'BANNED');
        }
        const own = mgr.state.getPlayer(identity.playerId);
        if (own && !own.exitReason && own.connected) throw new GameError('You are playing in this room.');
        const viewer = liveRoom.watch(socket, mgr.state.roomCode, 'monopoly', identity);
        if (!viewer) throw new GameError('This room has too many spectators already.');
        cb?.({
          ok: true,
          roomCode: mgr.state.roomCode,
          spectator: true,
          state: { ...roomStatePayload(mgr), spectating: true },
        });
        broadcastState(io, mgr.state.roomCode);
      } catch (err) {
        cb?.(errorPayload(err, [GameError]));
      }
    });

    socket.on('room:unspectate', () => {
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcastState(io, watched);
    });

    // --- giving up ------------------------------------------------------

    // The client has already asked for a confirmation by the time this
    // arrives. Mid-game this is a bankruptcy, which is final.
    socket.on('room:surrender', (payload, cb) => {
      const { roomCode, playerId } = socket.data;
      try {
        const mgr = roomManager.getRoom(roomCode);
        const player = mgr?.state.getPlayer(playerId);
        if (!mgr || !player) throw new GameError('You are not in an active room.');
        if (player.exitReason) throw new GameError('You have already left this game.');
        const seat = {
          playerId, nickname: player.nickname, accountId: player.accountId, avatarUrl: player.avatarUrl,
        };
        dropPlayer(io, roomCode, playerId, 'surrender');
        if (roomManager.getRoom(roomCode)) {
          liveRoom.watch(socket, roomCode, 'monopoly', seat);
          broadcastState(io, roomCode);
        }
        cb?.({ ok: true });
      } catch (err) {
        const message = clientMessage(err, [GameError]);
        sendError(socket, message);
        cb?.({ ok: false, error: message });
      }
    });

    socket.on('room:start', () => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return sendError(socket, 'Room not found.');
      try {
        if (socket.data.playerId !== mgr.hostId) throw new GameError('Only the host can start the game.');
        access.assertCanStart(socket.data.accountId);
        modes.assertAvailable(modes.monopolyModeId(mgr.state.modeId));
        mgr.startGame(socket.data.playerId);
        broadcastState(io, mgr.state.roomCode);
      } catch (err) {
        sendError(socket, clientMessage(err, [GameError]));
      }
    });

    // An auction whose time is up is closed before anything else is
    // applied, so a bid arriving a moment after the deadline is refused
    // rather than raced against the timer.
    const withGame = (handler) => (payload) => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return sendError(socket, 'You are not in an active room.');
      let closedAuction = false;
      try {
        closedAuction = mgr.tickAuction(Date.now());
        handler(mgr, payload && typeof payload === 'object' ? payload : {});
        broadcastState(io, mgr.state.roomCode);
      } catch (err) {
        if (closedAuction) broadcastState(io, mgr.state.roomCode);
        sendError(socket, clientMessage(err, [GameError]));
      }
    };

    socket.on('game:rollDice', withGame((mgr) => mgr.rollDice(socket.data.playerId)));
    socket.on('game:payJailFine', withGame((mgr) => mgr.payJailFine(socket.data.playerId)));
    socket.on('game:useJailCard', withGame((mgr) => mgr.useGetOutOfJailCard(socket.data.playerId)));
    socket.on('game:buyProperty', withGame((mgr, { tileId }) => mgr.buyProperty(socket.data.playerId, tileId)));
    socket.on('game:declinePurchase', withGame((mgr, { tileId }) => mgr.declinePurchase(socket.data.playerId, tileId)));
    socket.on('game:acknowledgeCard', withGame((mgr) => mgr.acknowledgeCard(socket.data.playerId)));
    socket.on('game:buildHouse', withGame((mgr, { tileId }) => mgr.buildHouse(socket.data.playerId, tileId)));
    socket.on('game:sellHouse', withGame((mgr, { tileId }) => mgr.sellHouse(socket.data.playerId, tileId)));
    socket.on('game:mortgage', withGame((mgr, { tileId }) => mgr.mortgageProperty(socket.data.playerId, tileId)));
    socket.on('game:unmortgage', withGame((mgr, { tileId }) => mgr.unmortgageProperty(socket.data.playerId, tileId)));
    socket.on('game:endTurn', withGame((mgr) => mgr.endTurn(socket.data.playerId)));
    socket.on('game:declareBankruptcy', withGame((mgr) => mgr.declareBankruptcy(socket.data.playerId)));

    socket.on('game:proposeTrade', withGame((mgr, payload) => mgr.proposeTrade(socket.data.playerId, payload)));
    socket.on('game:acceptTrade', withGame((mgr, { tradeId }) => mgr.acceptTrade(socket.data.playerId, tradeId)));
    socket.on('game:declineTrade', withGame((mgr, { tradeId }) => mgr.declineTrade(socket.data.playerId, tradeId)));
    socket.on('game:cancelTrade', withGame((mgr, { tradeId }) => mgr.cancelTrade(socket.data.playerId, tradeId)));

    socket.on('game:setCustomPrice', withGame((mgr, { tileId, targetPlayerId, amount }) => mgr.setCustomPrice(socket.data.playerId, tileId, targetPlayerId, amount)));
    socket.on('game:sellToBank', withGame((mgr, { tileId }) => mgr.sellPropertyToBank(socket.data.playerId, tileId)));
    socket.on('game:placeBid', withGame((mgr, { auctionId, amount }) => mgr.placeBid(socket.data.playerId, auctionId, amount)));
    socket.on('game:withdrawAuction', withGame((mgr, { auctionId }) => mgr.withdrawFromAuction(socket.data.playerId, auctionId)));

    socket.on('chat:message', ({ text, emote } = {}) => {
      const mgr = roomManager.getRoom(socket.data.roomCode);
      if (!mgr) return;
      const player = mgr.state.getPlayer(socket.data.playerId);
      if (!player) return;
      const message = roomChat.prepareRoomMessage({
        text, emote: typeof emote === 'string' ? emote.slice(0, 80) : null, sender: player, players: mgr.state.players,
      });
      if (!message) return;
      io.to(mgr.state.roomCode).emit('chat:message', { ...message, color: player.color });
      roomChat.notifyMentions(message, { players: mgr.state.players, context: { kind: 'room', gameType: 'monopoly', roomCode: mgr.state.roomCode } });
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      const watched = liveRoom.unwatch(socket);
      if (watched) broadcastState(io, watched);
      if (!roomCode || !playerId) return;
      const mgr = roomManager.getRoom(roomCode);
      if (!mgr) return;
      const player = mgr.state.getPlayer(playerId);
      if (!player || player.exitReason) return;
      // A socket that closed AFTER its owner had already reconnected is
      // stale: the seat now answers to a different socket, and treating
      // this close as a disconnect would knock a player who is sitting
      // right there offline - and start a countdown on them.
      if (player.socketId !== socket.id) return;

      mgr.markDisconnected(playerId);
      roomManager.persist(roomCode);
      // Twenty seconds to come back, counted down on every screen in the
      // room. A player who is already bankrupt has nothing left to lose,
      // so their seat is left exactly where it is.
      if (!player.bankrupt && mgr.state.phase !== 'GAME_OVER') {
        liveRoom.armDrop(roomCode, playerId, () => dropPlayer(io, roomCode, playerId, 'timeout'));
      }
      io.to(roomCode).emit('game:state', roomStatePayload(mgr));
      if (mgr.state.phase !== 'LOBBY') {
        const cp = mgr.state.currentPlayer;
        if (cp && cp.id === playerId) {
          scheduleAutoSkip(io, roomCode, playerId);
        }
      }
    });
  });
}

module.exports = { registerSocketHandlers };
