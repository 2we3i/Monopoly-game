// index.js
// Main server entry point.

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

// Server errors are kept for the Creator's panel from the very start.
const errorLog = require('./platform/errorLog');

errorLog.install();

// The Creator's edits (boards, shop items, memes, economy numbers) are
// installed before any room is restored or any route answers.
const creatorBoot = require('./platform/boot');

creatorBoot.installAll();

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const economyRoutes = require('./routes/economy');
const socialRoutes = require('./routes/social');
const { router: authRoutes, AVATAR_DIR } = require('./routes/authRoutes');
const media = require('./platform/media');
const presence = require('./platform/presence');
const memeContent = require('./memehype/content');
const { registerSocketHandlers } = require('./socket/socketHandler');
const { registerMafiaHandlers } = require('./socket/mafiaHandler');
const { registerCitadelsHandlers } = require('./socket/citadelsHandler');
const { registerBunkerHandlers } = require('./socket/bunkerHandler');
const { registerCatanHandlers } = require('./socket/catanHandler');
const { registerCosmicHandlers } = require('./socket/cosmicHandler');
const { registerThroneHandlers } = require('./socket/throneHandler');
const { registerChpokHandlers } = require('./socket/chpokHandler');
const { registerMemeHypeHandlers } = require('./socket/memeHypeHandler');
const db = require('./db/database');
const accountsDb = require('./db/accounts');
const platformDb = require('./db/platform');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 15000,
  maxHttpBufferSize: 64 * 1024,
});

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/economy', economyRoutes);
app.use('/api/social', socialRoutes);
app.use('/api', require('./routes/dashboardStats'));
app.use('/api', apiRoutes);
// Uploaded avatars served as static files under /avatars - the path
// stored on an account is already the exact URL a client requests. This
// route existing on the BACKEND is what the frontend dev-server proxy
// and any production reverse proxy both need to forward /avatars to.
app.use('/avatars', express.static(AVATAR_DIR));
// Meme Hype pictures (see src/memehype/images/custom/README.md).
// Your own meme pictures can change often, so they are cached briefly.
app.use(memeContent.CUSTOM_URL, express.static(memeContent.CUSTOM_DIR, { maxAge: '1h' }));
app.use('/memes', express.static(memeContent.IMAGES_DIR, { maxAge: '7d' }));
// Pictures uploaded from the Creator's panel. A replaced picture gets a new
// file name, so caching them never shows a stale one.
app.use(media.MEDIA_URL, express.static(media.MEDIA_DIR, { maxAge: '7d' }));

const FRONTEND_DIST = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.join(__dirname, '..', 'public');
// Hashed build assets never change under the same name; index.html must
// always be revalidated so a deploy is picked up.
app.use('/assets', express.static(path.join(FRONTEND_DIST, 'assets'), { immutable: true, maxAge: '365d' }));
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/avatars') || req.path.startsWith('/memes') || req.path.startsWith('/media')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

// An error thrown by a route is recorded and answered as JSON.
app.use(errorLog.expressHandler);

// Presence first, so a socket's account is known before any game event.
presence.attach(io);
registerSocketHandlers(io);
// The other games share the socket server: their events are namespaced
// (mafia:*, citadels:*) so the handlers never see each other's traffic.
registerMafiaHandlers(io);
registerCitadelsHandlers(io);
registerBunkerHandlers(io);
registerCatanHandlers(io);
registerCosmicHandlers(io);
registerThroneHandlers(io);
registerChpokHandlers(io);
registerMemeHypeHandlers(io);

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Landmark server listening on port ${PORT} [${NODE_ENV}]`);
  // eslint-disable-next-line no-console
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

function shutdown() {
  server.close(() => {
    db.close();
    accountsDb.close();
    platformDb.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
