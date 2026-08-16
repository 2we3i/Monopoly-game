// index.js
// Main server entry point. Serves the REST API and upgrades to Socket.io
// for real-time gameplay. In production mode it also serves the built
// frontend static files, so the whole app can run from one process/port.

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const apiRoutes = require('./routes/api');
const { registerSocketHandlers } = require('./socket/socketHandler');
const db = require('./db/database');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
  // Reasonable timeouts so a flaky phone connection isn't instantly dropped,
  // while still detecting genuinely dead sockets in a reasonable time.
  pingInterval: 10000,
  pingTimeout: 15000,
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.use('/api', apiRoutes);

// Serve built frontend in production (see frontend Dockerfile / docker-compose)
const FRONTEND_DIST = path.join(__dirname, '..', 'public');
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

registerSocketHandlers(io);

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Monopoly server listening on port ${PORT} [${NODE_ENV}]`);
  // eslint-disable-next-line no-console
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Close the DB (with a final WAL checkpoint) on graceful shutdown. Note:
// saveRoom() also checkpoints after every write (see db/database.js), so
// room data survives even an ungraceful SIGKILL - this handler just makes
// the orderly-shutdown path clean too, and releases the file handle.
process.on('SIGTERM', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
process.on('SIGINT', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
