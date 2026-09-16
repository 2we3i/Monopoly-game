// dev-preview.js
// Runs the whole app - the API, the sockets and the built frontend - as a
// single origin on one port, the way the Docker image does.
//
// It exists so the app can be driven end to end (two players, a phone, a
// spectator) without a second dev server or a proxy in between, and
// against a throwaway data directory so a local play-through never touches
// real accounts or rooms.
//
//   node scripts/dev-preview.js            # port 4100, temp data
//   PORT=4200 node scripts/dev-preview.js

const path = require('path');
const os = require('os');
const fs = require('fs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'frontend', 'dist');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  // eslint-disable-next-line no-console
  console.error('No frontend build found. Run: npm run build --prefix frontend');
  process.exit(1);
}

// A stable directory, so restarting the preview does not throw away the
// accounts and rooms a play-through just set up. Still a throwaway: it
// lives in the OS temp directory, never in the project.
const dataDir = process.env.DATA_DIR || path.join(os.tmpdir(), 'landmark-preview-data');
fs.mkdirSync(dataDir, { recursive: true });

process.env.DATA_DIR = dataDir;
process.env.FRONTEND_DIST = dist;
process.env.PORT = process.env.PORT || '4100';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'preview-only-secret';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// eslint-disable-next-line no-console
console.log(`Preview data directory: ${dataDir}`);
// eslint-disable-next-line import/no-dynamic-require, global-require
require(path.join(root, 'backend', 'src', 'index.js'));
