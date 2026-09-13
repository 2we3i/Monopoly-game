import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:4000', ws: true },
      '/api': { target: 'http://localhost:4000' },
      '/avatars': { target: 'http://localhost:4000' },
    },
  },
  build: { outDir: 'dist' },
});
