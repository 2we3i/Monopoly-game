// modes.js
// The catalogue of playable modes and whether each one is open for new
// games. A mode is enabled, disabled, or paused until a moment in time;
// the check happens only when a NEW match would begin, so games already
// running are never interrupted by the admin flipping a switch.

const platformDb = require('../db/platform');
const { LAYOUT_OPTIONS, DEFAULT_LAYOUT_ID } = require('../game/boardLayouts');
const { AccessError } = require('./access');

const STATUSES = ['enabled', 'disabled', 'paused'];

function catalog() {
  return [
    ...LAYOUT_OPTIONS.map((layout) => ({
      id: `monopoly.${layout.id}`,
      gameId: 'monopoly',
      variant: layout.id,
      label: layout.label,
    })),
    { id: 'mafia.classic', gameId: 'mafia', variant: 'classic', label: { en: 'Mafia', ru: 'Мафия' } },
    { id: 'citadels.classic', gameId: 'citadels', variant: 'classic', label: { en: 'Citadels', ru: 'Цитадели' } },
    { id: 'bunker.classic', gameId: 'bunker', variant: 'classic', label: { en: 'Bunker', ru: 'Бункер' } },
    { id: 'catan.classic', gameId: 'catan', variant: 'classic', label: { en: 'Catan', ru: 'Колонизаторы' } },
    { id: 'cosmic.classic', gameId: 'cosmic', variant: 'classic', label: { en: 'Cosmic Encounter', ru: 'Космический контакт' } },
    { id: 'throne.classic', gameId: 'throne', variant: 'classic', label: { en: 'The Iron Throne', ru: 'Железный трон' } },
    { id: 'chpok.party', gameId: 'chpok', variant: 'party', label: { en: 'ЧПОК Party', ru: 'ЧПОК: вечеринка' } },
    { id: 'memehype.party', gameId: 'memehype', variant: 'party', label: { en: 'Meme Hype', ru: 'Meme Hype' } },
  ];
}

function monopolyModeId(layoutId) {
  return `monopoly.${layoutId || DEFAULT_LAYOUT_ID}`;
}

function statusOf(modeId) {
  const row = platformDb.getModeRow(modeId);
  if (!row) return { status: 'enabled', pausedUntil: null };
  if (row.status === 'paused' && row.paused_until && row.paused_until <= Date.now()) {
    // A pause that has run out reopens the mode on its own.
    platformDb.setModeRow({ modeId, status: 'enabled', pausedUntil: null, updatedBy: 'system' });
    return { status: 'enabled', pausedUntil: null };
  }
  return { status: row.status, pausedUntil: row.paused_until || null };
}

function isAvailable(modeId) {
  return statusOf(modeId).status === 'enabled';
}

function assertAvailable(modeId) {
  const known = catalog().some((m) => m.id === modeId);
  if (!known) throw new AccessError(`Unknown game mode "${modeId}".`, 'UNKNOWN_MODE');
  const { status, pausedUntil } = statusOf(modeId);
  if (status === 'enabled') return;
  const until = status === 'paused' && pausedUntil ? ` until ${new Date(pausedUntil).toISOString()}` : '';
  throw new AccessError(`This game mode is ${status === 'paused' ? 'temporarily unavailable' : 'disabled'}${until}.`, 'MODE_UNAVAILABLE');
}

function setStatus(modeId, status, { pauseMinutes = null, updatedBy = null } = {}) {
  if (!catalog().some((m) => m.id === modeId)) throw new AccessError('Unknown game mode.', 'UNKNOWN_MODE');
  if (!STATUSES.includes(status)) throw new AccessError('Unknown status.', 'BAD_STATUS');
  let pausedUntil = null;
  if (status === 'paused') {
    const minutes = Number(pauseMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60 * 24 * 30) {
      throw new AccessError('A pause must last between 1 minute and 30 days.', 'BAD_PAUSE');
    }
    pausedUntil = Date.now() + Math.round(minutes) * 60 * 1000;
  }
  platformDb.setModeRow({ modeId, status, pausedUntil, updatedBy });
  return statusOf(modeId);
}

function listWithStatus() {
  return catalog().map((m) => ({ ...m, ...statusOf(m.id) }));
}

function gameAvailable(gameId) {
  return catalog().some((m) => m.gameId === gameId && isAvailable(m.id));
}

module.exports = {
  STATUSES, catalog, monopolyModeId, statusOf, isAvailable, assertAvailable, setStatus, listWithStatus, gameAvailable,
};
