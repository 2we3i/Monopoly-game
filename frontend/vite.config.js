import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the Monopoly frontend.
// In dev, requests to /socket.io and /api are proxied to the backend so the
// browser only ever talks to one origin (avoids CORS friction locally).
// The actual backend URL used at runtime is controlled by VITE_SERVER_URL
// (see src/hooks/useSocket.js) so the host can point the built app at their
// own server IP/domain without rebuilding.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:4000',
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
