// boardData.js
// Pure helpers for rendering a board - NONE of these hardcode a tile
// count, side length, or specific board content.

export const TILE_TYPES = {
  GO: 'GO',
  PROPERTY: 'PROPERTY',
  RAILROAD: 'RAILROAD',
  UTILITY: 'UTILITY',
  TAX: 'TAX',
  CHANCE: 'CHANCE',
  CHEST: 'CHEST',
  JAIL: 'JAIL',
  GO_TO_JAIL: 'GO_TO_JAIL',
  FREE_PARKING: 'FREE_PARKING',
};

export const GROUP_COLORS = {
  brown: '#7a5230', copper: '#7a5230', lightblue: '#a3d0e8', teal: '#3fa9a6',
  pink: '#d888b0', magenta: '#c14e9a', orange: '#e08a3c', amber: '#e0a83c',
  red: '#c4453a', crimson: '#a32d3f', yellow: '#e8cf4a', gold: '#d4af37',
  green: '#3f9463', emerald: '#2e8b57', blue: '#3a6ea8', indigo: '#4b5fa8',
  violet: '#7a5fb8', rose: '#c1567c', slate: '#5a6b7a', obsidian: '#3a3f47',
};

// Non-property ownables still need a stable accent color so the board,
// the trade screen and the deed card can all speak the same visual
// language ("this swatch identifies the asset") regardless of type.
export const RAILROAD_COLOR = '#37474f';
export const UTILITY_COLOR = '#5f8a99';

export function tileAccentColor(tile) {
  if (!tile) return '#8a8b76';
  if (tile.type === TILE_TYPES.RAILROAD) return RAILROAD_COLOR;
  if (tile.type === TILE_TYPES.UTILITY) return UTILITY_COLOR;
  return GROUP_COLORS[tile.group] || '#8a8b76';
}

// --- Board geometry ------------------------------------------------
//
// The board is laid out at a FIXED intrinsic pixel size and then scaled
// as a whole by the viewport's zoom transform. Laying out in real pixels
// (rather than percentage grid tracks whose meaning changes with the
// container) is what makes tile content predictable: a tile is always
// TILE_W x TILE_H CSS pixels of design space, so type sizes, paddings
// and icons are tuned once and simply scale, instead of re-flowing into
// unreadable slivers on a large board (Metropolis is 84 tiles).
export const TILE_W = 80;
export const CORNER = 118;
export const BOARD_PAD = 16;

export function boardLines(sideLength) {
  return sideLength + 1;
}

export function boardPixelSize(sideLength) {
  return CORNER * 2 + (sideLength - 1) * TILE_W + BOARD_PAD * 2;
}

// Given a tile id and the room's actual sideLength, returns { row, col }
// in a (sideLength+1) x (sideLength+1) grid. id 0 is the bottom-right
// corner, increasing counter-clockwise - matches the backend's
// layoutBuilder.js exactly.
export function tileGridPosition(id, sideLength) {
  const lines = boardLines(sideLength);
  if (id <= sideLength) return { row: lines, col: lines - id };
  if (id <= sideLength * 2) return { row: lines - (id - sideLength), col: 1 };
  if (id <= sideLength * 3) return { row: 1, col: 1 + (id - sideLength * 2) };
  return { row: 1 + (id - sideLength * 3), col: lines };
}

// Which board edge a tile sits on. Side tiles put their color band on
// the edge facing the middle of the board, the way a physical board
// does, so a whole color group reads as one continuous stripe.
export function tileOrientation(id, sideLength) {
  const { row, col } = tileGridPosition(id, sideLength);
  const lines = boardLines(sideLength);
  const isCorner = (row === 1 || row === lines) && (col === 1 || col === lines);
  if (isCorner) return 'corner';
  if (row === lines) return 'bottom';
  if (row === 1) return 'top';
  if (col === 1) return 'left';
  return 'right';
}

// Start offset (in board pixels) of a 1-based grid track. The first and
// last tracks are the wider corner tracks.
function trackStart(index, lines) {
  if (index <= 1) return BOARD_PAD;
  if (index >= lines) return BOARD_PAD + CORNER + (lines - 2) * TILE_W;
  return BOARD_PAD + CORNER + (index - 2) * TILE_W;
}

// Pixel rect of a tile inside the board's own coordinate space.
export function tileRect(id, sideLength) {
  const { row, col } = tileGridPosition(id, sideLength);
  const lines = boardLines(sideLength);
  const edge = (i) => (i === 1 || i === lines ? CORNER : TILE_W);
  return {
    x: trackStart(col, lines),
    y: trackStart(row, lines),
    w: edge(col),
    h: edge(row),
  };
}

export function tileCenter(id, sideLength) {
  const r = tileRect(id, sideLength);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// The open middle of the board, in board pixels.
export function boardInnerRect(sideLength) {
  const start = BOARD_PAD + CORNER;
  const size = (boardLines(sideLength) - 2) * TILE_W;
  return { x: start, y: start, w: size, h: size };
}

export function getTileName(tile, language) {
  if (!tile) return '';
  if (language === 'ru' && tile.nameRu) return tile.nameRu;
  return tile.name;
}

// --- Derived game facts --------------------------------------------

// Maps every color group to the player who owns ALL of its tiles (a
// monopoly), or null. Callers use it to flag "this group is complete",
// which is what makes building possible and doubles the base rent.
export function computeGroupOwners(board, properties) {
  const byGroup = {};
  board.forEach((tile) => {
    if (tile.type !== TILE_TYPES.PROPERTY) return;
    if (!byGroup[tile.group]) byGroup[tile.group] = [];
    byGroup[tile.group].push(tile.id);
  });
  const owners = {};
  Object.entries(byGroup).forEach(([group, ids]) => {
    const first = properties[ids[0]]?.ownerId || null;
    owners[group] = first && ids.every((id) => properties[id]?.ownerId === first) ? first : null;
  });
  return owners;
}

export function groupTileIds(board, group) {
  return board.filter((t) => t.type === TILE_TYPES.PROPERTY && t.group === group).map((t) => t.id);
}

export function ownedTileIds(playerId, properties) {
  return Object.entries(properties)
    .filter(([, p]) => p.ownerId === playerId)
    .map(([tileId]) => Number(tileId));
}

export function mortgageValue(tile) {
  return Math.floor((tile?.price || 0) / 2);
}

export function unmortgageCost(tile) {
  return Math.ceil(((tile?.price || 0) / 2) * 1.1);
}

// Cash-out worth of a single asset: a mortgaged deed is only worth its
// redemption value, and houses sell back at half price. Used by the
// trade screen's value summary and by net worth.
export function assetValue(tile, propState) {
  if (!tile) return 0;
  const base = propState?.mortgaged ? mortgageValue(tile) : tile.price || 0;
  const houses = (propState?.houses || 0) * Math.floor((tile.houseCost || 0) / 2);
  return base + houses;
}

export function netWorth(player, board, properties) {
  return ownedTileIds(player.id, properties)
    .reduce((sum, tileId) => sum + assetValue(board[tileId], properties[tileId]), player.money);
}

// Rent the owner would currently charge, mirroring the server's
// _computeRent for the cases that can be shown statically. Utilities
// depend on a live dice roll, so they report null here and the UI shows
// their multiplier instead.
export function currentRent(tile, propState, board, properties) {
  if (!tile || !propState?.ownerId) return null;
  if (tile.type === TILE_TYPES.PROPERTY) {
    const ids = groupTileIds(board, tile.group);
    const monopoly = ids.every((id) => properties[id]?.ownerId === propState.ownerId);
    if (propState.houses === 0) return monopoly ? tile.rent[0] * 2 : tile.rent[0];
    return tile.rent[propState.houses];
  }
  if (tile.type === TILE_TYPES.RAILROAD) {
    const owned = board.filter((t) => t.type === TILE_TYPES.RAILROAD && properties[t.id]?.ownerId === propState.ownerId).length;
    const table = tile.rent || [];
    if (table.length === 0) return null;
    return table[Math.min(Math.max(owned - 1, 0), table.length - 1)];
  }
  return null;
}

export function railroadOwnedCount(ownerId, board, properties) {
  return board.filter((t) => t.type === TILE_TYPES.RAILROAD && properties[t.id]?.ownerId === ownerId).length;
}

export function utilityMultiplier(ownerId, board, properties) {
  if (!ownerId) return 4;
  const owned = board.filter((t) => t.type === TILE_TYPES.UTILITY && properties[t.id]?.ownerId === ownerId).length;
  return owned >= 2 ? 10 : 4;
}

export function formatMoney(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US')}`;
}

// --- Family prices, mortgage timers, auctions ------------------------

// Mirrors the server: a mortgaged deed goes to auction after this many
// full rounds.
export const MORTGAGE_ROUNDS = 10;

// The rent a visitor pays today without a family price - what a custom
// price is measured against (the server's _pricingBaseRent). A utility is
// measured against the average roll of 7.
export function pricingBaseRent(tile, propState, board, properties) {
  if (!tile || !propState?.ownerId) return null;
  if (tile.type === TILE_TYPES.UTILITY) return utilityMultiplier(propState.ownerId, board, properties) * 7;
  return currentRent(tile, propState, board, properties);
}

// One change of a family price may move it by at most 10% of the current
// price - never less than $1, or a cheap square could not move at all.
export function priceStepLimit(current) {
  return Math.max(1, Math.floor(Math.max(0, current || 0) * 0.1));
}

// Full rounds left before a mortgaged deed goes to auction (0 = this is
// the last round), or null for a deed that is not mortgaged.
export function mortgageRoundsLeft(propState, round) {
  if (!propState?.mortgaged || !Number.isInteger(propState.mortgageExpiresRound)) return null;
  return Math.max(0, propState.mortgageExpiresRound - (round || 1) - 1);
}

export function bankBuybackValue(tile) {
  return Math.floor((tile?.price || 0) / 2);
}

export function formatSignedMoney(delta) {
  const n = Number(delta) || 0;
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}$${Math.abs(n).toLocaleString('en-US')}`;
}

export function formatSignedPercent(percent) {
  if (percent == null) return null;
  return `${percent > 0 ? '+' : percent < 0 ? '−' : '±'}${Math.abs(percent)}%`;
}

// Milliseconds until a SERVER timestamp, corrected for the difference
// between this browser's clock and the server's (measured when the state
// arrived), so every player sees the same countdown.
export function serverMsLeft(endsAt, gameState, now = Date.now()) {
  const offset = gameState?.serverTime && gameState?.receivedAt ? gameState.serverTime - gameState.receivedAt : 0;
  return endsAt - (now + offset);
}

// The family-price change a viewer should see on a square: a visitor sees
// their own price and how it last moved; the owner sees the latest change
// they made for anyone.
export function priceChangeFor(propState, viewerId) {
  if (!propState?.ownerId || !viewerId) return null;
  const changes = propState.priceChanges || {};
  if (propState.ownerId === viewerId) {
    const latest = Object.entries(changes).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0];
    return latest ? { ...latest[1], targetId: latest[0], asOwner: true } : null;
  }
  const custom = propState.customPrices?.[viewerId];
  const change = changes[viewerId];
  if (typeof custom !== 'number' && !change) return null;
  return {
    ...(change || {}),
    to: typeof custom === 'number' ? custom : change.to,
    delta: change ? change.delta : 0,
    percent: change ? change.percent : 0,
    asOwner: false,
  };
}
