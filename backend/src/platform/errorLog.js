// errorLog.js
// Server errors, kept for the Creator's panel. Everything the server
// already reports with console.error (a failed socket action, a room that
// could not be restored, a reward that failed) is also stored here, with
// the game it most likely belongs to, and so is anything an HTTP route
// throws. Nothing about how errors are printed changes.

const creatorDb = require('../db/creator');

const GAME_IDS = ['monopoly', 'mafia', 'citadels', 'bunker', 'catan', 'cosmic', 'throne', 'chpok', 'memehype'];
const MAX_PER_MINUTE = 120;

let installed = false;
let windowStart = 0;
let windowCount = 0;
let writes = 0;

function guessGame(text) {
  const lower = String(text || '').toLowerCase();
  return GAME_IDS.find((id) => lower.includes(id)) || (lower.includes('meme hype') ? 'memehype' : null);
}

function describe(args) {
  let stack = null;
  const parts = args.map((a) => {
    if (a instanceof Error) {
      stack = stack || a.stack || null;
      return a.message;
    }
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  });
  return { message: parts.join(' ').trim() || 'Unknown error', stack };
}

function record({
  level = 'error', source = 'server', message, stack = null, context = null, gameType = null,
}) {
  const now = Date.now();
  if (now - windowStart > 60000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  if (windowCount > MAX_PER_MINUTE) return;
  try {
    creatorDb.addError({
      level, source, gameType: gameType || guessGame(`${message} ${stack || ''} ${context ? JSON.stringify(context) : ''}`), message, stack, context,
    });
    writes += 1;
    if (writes % 500 === 0) creatorDb.pruneErrors();
  } catch {
    // The log must never become a new source of errors.
  }
}

function install() {
  if (installed) return;
  installed = true;
  const original = console.error.bind(console); // eslint-disable-line no-console
  // eslint-disable-next-line no-console
  console.error = (...args) => {
    original(...args);
    const { message, stack } = describe(args);
    record({ source: 'console', message, stack });
  };
  process.on('uncaughtExceptionMonitor', (err) => {
    record({ level: 'fatal', source: 'process', message: err?.message || String(err), stack: err?.stack || null });
  });
  process.on('unhandledRejection', (reason) => {
    record({ level: 'error', source: 'promise', message: reason?.message || String(reason), stack: reason?.stack || null });
    original('Unhandled promise rejection:', reason);
  });
}

// Express error handler: records the failure and answers with JSON.
// eslint-disable-next-line no-unused-vars
function expressHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    record({
      source: 'http', message: err.message || String(err), stack: err.stack || null, context: { method: req.method, path: req.path },
    });
  }
  if (res.headersSent) return;
  res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : (err.message || 'Request failed.') });
}

module.exports = {
  install, record, expressHandler, guessGame, GAME_IDS,
};
