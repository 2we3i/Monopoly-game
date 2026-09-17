// testMatch.js
// A test match armed from the Creator's panel. The server decides whether
// the next room this Creator opens is a test (and lets a switched-off mode
// open for it); this only remembers it in the tab, so the menus unlock the
// mode's buttons and show a "test" mark while it lasts.

const KEY = 'landmark_test_match';

export function armTestMatch({ modeId, expiresAt }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ modeId, expiresAt }));
  } catch { /* storage unavailable: the menus just stay as they are */ }
}

export function clearTestMatch() {
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* nothing stored */ }
}

export function armedTestMatch() {
  try {
    const entry = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry;
  } catch {
    return null;
  }
}

// Is a test armed for this game (and, for Monopoly, this board)?
export function isTestArmed(gameId, variant = null) {
  const entry = armedTestMatch();
  if (!entry) return false;
  const [game, mode] = String(entry.modeId).split('.');
  if (game !== gameId) return false;
  return variant == null || mode === variant;
}

// Where a mode's rooms are created.
export function pathForMode(modeId) {
  const game = String(modeId).split('.')[0];
  if (game === 'throne') return '/tabletop/iron-throne';
  if (game === 'chpok' || game === 'memehype') return '/tabletop';
  return '/';
}
