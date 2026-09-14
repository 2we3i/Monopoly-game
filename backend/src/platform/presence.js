// presence.js
// Who is connected right now. Every socket announces its session token
// (in the handshake, and again whenever the player logs in or out), and
// this module keeps the socket -> account map the admin panel reads for
// "online" numbers and uses to reach a player it has just blocked.
//
// A socket that announces itself on the "social" channel also joins its
// account's private room: that is where messages, notifications and
// wallet updates are delivered, to every open tab of the account at once.
// Game sockets stay out of it, so they never carry that traffic twice.

const accountsDb = require('../db/accounts');
const access = require('./access');

const sockets = new Map(); // socketId -> { accountId, connectedAt, channel }
const socialListeners = [];
let ioRef = null;

const accountRoom = (accountId) => `acct:${accountId}`;

function identify(socket, token, channel) {
  const previous = sockets.get(socket.id);
  const nextChannel = channel === 'social' ? 'social' : (previous?.channel || 'game');
  if (previous?.accountId && previous.channel === 'social') socket.leave(accountRoom(previous.accountId));

  const row = access.accountFromToken(token);
  if (row && accountsDb.isBlocked(row)) {
    socket.emit('account:blocked', { reason: row.blocked_reason || null });
    sockets.set(socket.id, { accountId: null, connectedAt: previous?.connectedAt || Date.now(), channel: nextChannel });
    return;
  }
  sockets.set(socket.id, {
    accountId: row ? row.id : null,
    connectedAt: previous?.connectedAt || Date.now(),
    channel: nextChannel,
  });
  if (!row) return;
  accountsDb.touchSeen(row.id);
  if (nextChannel === 'social') {
    socket.join(accountRoom(row.id));
    socialListeners.forEach((fn) => {
      try {
        fn(row.id, socket);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Social connect listener failed:', err.message);
      }
    });
  }
}

function attach(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    const auth = socket.handshake?.auth || {};
    identify(socket, auth.token, auth.channel);
    socket.on('presence:identify', (payload) => identify(socket, payload?.token, payload?.channel));
    socket.on('disconnect', () => {
      const entry = sockets.get(socket.id);
      sockets.delete(socket.id);
      if (entry?.accountId) accountsDb.touchSeen(entry.accountId);
    });
  });
}

function onSocialConnect(fn) {
  socialListeners.push(fn);
}

function onlineAccountIds() {
  const ids = new Set();
  sockets.forEach((entry) => { if (entry.accountId) ids.add(entry.accountId); });
  return ids;
}

function isOnline(accountId) {
  if (!accountId) return false;
  for (const entry of sockets.values()) if (entry.accountId === accountId) return true;
  return false;
}

// Is a messenger connection open for this account (so a message sent to
// it has actually been delivered to a screen)?
function hasSocial(accountId) {
  if (!accountId) return false;
  for (const entry of sockets.values()) if (entry.accountId === accountId && entry.channel === 'social') return true;
  return false;
}

function socketCount() {
  return sockets.size;
}

function socketsOfAccount(accountId) {
  const out = [];
  sockets.forEach((entry, socketId) => { if (entry.accountId === accountId) out.push(socketId); });
  return out;
}

function emitToAccount(accountId, event, payload) {
  if (!ioRef || !accountId) return;
  ioRef.to(accountRoom(accountId)).emit(event, payload);
}

// Tells every open tab of an account that it has been blocked, then cuts
// the connection so nothing further arrives from it.
function disconnectAccount(accountId, reason) {
  if (!ioRef) return 0;
  const ids = socketsOfAccount(accountId);
  ids.forEach((id) => {
    const socket = ioRef.sockets.sockets.get(id);
    if (!socket) return;
    socket.emit('account:blocked', { reason: reason || null });
    setTimeout(() => socket.disconnect(true), 150);
  });
  return ids.length;
}

module.exports = {
  attach,
  onSocialConnect,
  onlineAccountIds,
  isOnline,
  hasSocial,
  socketCount,
  socketsOfAccount,
  emitToAccount,
  disconnectAccount,
};
