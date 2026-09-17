import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

// The Iron Throne rules are one module shared with the server, which is
// authoritative for online rooms; the client imports it through this alias.
const THRONE_DIR = fileURLToPath(new URL('../backend/src/throne', import.meta.url));
// The two ЧПОК decks are shared the same way: the server deals them in an
// online room, the browser deals them around one table, and there is only
// ever one copy of the cards.
const CHPOK_DIR = fileURLToPath(new URL('../backend/src/chpok', import.meta.url));

// In dev, requests to /socket.io, /api, and /avatars are proxied to the
// backend so the browser only ever talks to one origin. /avatars serves
// uploaded profile pictures - an <img src="/avatars/..."> tag resolves
// that path against the PAGE's own origin, not the backend's, so without
// this proxy entry every avatar request would silently hit this dev
// server's SPA catch-all instead and get back index.html rather than
// image bytes. The actual backend URL used at runtime is controlled by
// VITE_SERVER_URL (see src/hooks/useSocket.js).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@throne': THRONE_DIR, '@chpok': CHPOK_DIR },
  },
  server: {
    host: true,
    port: 5173,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), THRONE_DIR, CHPOK_DIR],
    },
    proxy: {
      '/socket.io': { target: 'http://localhost:4000', ws: true },
      '/api': { target: 'http://localhost:4000' },
      '/avatars': { target: 'http://localhost:4000' },
      '/memes': { target: 'http://localhost:4000' },
    },
  },
  build: { outDir: 'dist' },
});
