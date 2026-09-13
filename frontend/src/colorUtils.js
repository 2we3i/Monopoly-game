// colorUtils.js
// Color math shared by the board, the panels and the deed cards. Kept
// out of any one component because ownership color, group color and
// player color all need the same two operations everywhere they appear.

function normalizeHex(hex) {
  if (!hex || hex[0] !== '#') return null;
  return hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
}

export function hexToRgba(hex, alpha) {
  const h = normalizeHex(hex);
  if (!h) return `rgba(122,122,122,${alpha})`;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// A light group color (yellow, light blue) needs dark glyphs on top of it
// and a dark one needs light glyphs - picking by measured luminance keeps
// markers legible on every group without a per-color lookup table.
export function isLightColor(hex) {
  const h = normalizeHex(hex);
  if (!h) return false;
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.62;
}
