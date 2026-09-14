// index.js
// Main server entry point.

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const apiRoutes = require('./routes/api');
const { router: authRoutes, AVATAR_DIR } = require('./routes/authRoutes');
const { registerSocketHandlers } = require('./socket/socketHandler');
const { registerMafiaHandlers } = require('./socket/mafiaHandler');
const db = require('./db/database');
const accountsDb = require('./db/accounts');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 15000,
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
// Uploaded avatars served as static files under /avatars - the path
// stored on an account is already the exact URL a client requests. This
// route existing on the BACKEND is what the frontend dev-server proxy
// and any production reverse proxy both need to forward /avatars to.
app.use('/avatars', express.static(AVATAR_DIR));

const FRONTEND_DIST = path.join(__dirname, '..', 'public');
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/avatars')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

registerSocketHandlers(io);
// A second game on the same socket server: its events are namespaced
// (mafia:*) so the two handlers never see each other's traffic.
registerMafiaHandlers(io);

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Monopoly server listening on port ${PORT} [${NODE_ENV}]`);
  // eslint-disable-next-line no-console
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    db.close();
    accountsDb.close();
    process.exit(0);
  });
});
process.on('SIGINT', () => {
  server.close(() => {
    db.close();
    accountsDb.close();
    process.exit(0);
  });
});
