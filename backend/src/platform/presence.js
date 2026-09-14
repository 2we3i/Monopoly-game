// presence.js
// Who is connected right now. Every socket announces its session token
// (in the handshake, and again whenever the player logs in or out), and
// this module keeps the socket -> account map the admin panel reads for
// "online" numbers and uses to reach a player it has just blocked.

const accountsDb = require('../db/accounts');
const access = require('./access');

const sockets = new Map(); // socketId -> { accountId, connectedAt }
let ioRef = null;

function identify(socket, token) {
  const row = access.accountFromToken(token);
  if (row && accountsDb.isBlocked(row)) {
    socket.emit('account:blocked', { reason: row.blocked_reason || null });
    sockets.set(socket.id, { accountId: null, connectedAt: Date.now() });
    return;
  }
  sockets.set(socket.id, { accountId: row ? row.id : null, connectedAt: Date.now() });
  if (row) accountsDb.touchSeen(row.id);
}

function attach(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    identify(socket, socket.handshake?.auth?.token);
    socket.on('presence:identify', (payload) => identify(socket, payload?.token));
    socket.on('disconnect', () => {
      const entry = sockets.get(socket.id);
      sockets.delete(socket.id);
      if (entry?.accountId) accountsDb.touchSeen(entry.accountId);
    });
  });
}

function onlineAccountIds() {
  const ids = new Set();
  sockets.forEach((entry) => { if (entry.accountId) ids.add(entry.accountId); });
  return ids;
}

function socketCount() {
  return sockets.size;
}

function socketsOfAccount(accountId) {
  const out = [];
  sockets.forEach((entry, socketId) => { if (entry.accountId === accountId) out.push(socketId); });
  return out;
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

module.exports = { attach, onlineAccountIds, socketCount, socketsOfAccount, disconnectAccount };
