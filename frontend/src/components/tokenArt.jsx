// tokenArt.jsx
// The physical playing pieces. A colored disc alone tells you WHICH
// player something belongs to, but not at a glance which piece is
// "yours" on a crowded board - a silhouette does, and it survives being
// scaled down to a handful of pixels far better than a photo would.
//
// Every piece is a filled path on a 24x24 grid, drawn in currentColor,
// so one definition works as a board token, a list bullet and a trade
// screen marker without a second asset.

export const PIECE_IDS = ['hat', 'car', 'dog', 'ship', 'boot', 'cat', 'thimble', 'barrow', 'iron', 'horse'];

export const PIECE_LABELS = {
  hat: { en: 'Top hat', ru: 'Цилиндр' },
  car: { en: 'Roadster', ru: 'Автомобиль' },
  dog: { en: 'Terrier', ru: 'Собака' },
  ship: { en: 'Battleship', ru: 'Корабль' },
  boot: { en: 'Boot', ru: 'Ботинок' },
  cat: { en: 'Cat', ru: 'Кошка' },
  thimble: { en: 'Thimble', ru: 'Напёрсток' },
  barrow: { en: 'Wheelbarrow', ru: 'Тачка' },
  iron: { en: 'Iron', ru: 'Утюг' },
  horse: { en: 'Horse', ru: 'Лошадь' },
};

const PIECE_PATHS = {
  hat: 'M8.1 4.6c0-.6.5-1.1 1.1-1.1h5.6c.6 0 1.1.5 1.1 1.1v9.1c2.6.5 4.4 1.6 4.4 2.9 0 1.8-3.7 3.3-8.3 3.3S3.7 18.4 3.7 16.6c0-1.3 1.8-2.4 4.4-2.9V4.6z',
  car: 'M3.3 14.2c0-.8.5-1.5 1.2-1.8l1.2-3c.4-1 1.3-1.6 2.4-1.6h7.8c1 0 2 .6 2.4 1.6l1.2 3c.7.3 1.2 1 1.2 1.8v2.3c0 .5-.4.9-.9.9h-1.2a2 2 0 01-3.9 0H8.3a2 2 0 01-3.9 0H3.2c-.5 0-.9-.4-.9-.9v-2.3zm4.1-4.1l-.9 2.4h11l-.9-2.4a.6.6 0 00-.6-.4H8a.6.6 0 00-.6.4z',
  dog: 'M4.4 8.3c0-1.6.9-2.8 1.7-3.4.3-.3.8 0 .8.4v2.1l1.6-1c.4-.2.8-.3 1.2-.3h4.9c2.8 0 5 2.2 5 5v1.3c0 .8-.4 1.5-1 2l-.6.4v4.5c0 .5-.4.9-.9.9h-1.5c-.5 0-.9-.4-.9-.9v-2.6H9.6v2.6c0 .5-.4.9-.9.9H7.2c-.5 0-.9-.4-.9-.9v-5.3c-1.2-.8-1.9-2.1-1.9-3.6V8.3zm3.3 1.5a.9.9 0 100 1.8.9.9 0 000-1.8z',
  ship: 'M2.6 15.3h18.8c.5 0 .8.5.6.9l-1.4 2.6c-.4.8-1.2 1.3-2.1 1.3H6.5c-.9 0-1.7-.5-2.1-1.3L3 16.2a.5.5 0 01.6-.9zm2.1-1.4V11c0-.5.4-.9.9-.9h2.6V7.6c0-.5.4-.9.9-.9h2.1V4.4c0-.5.4-.9.9-.9s.9.4.9.9v2.3h2.1c.5 0 .9.4.9.9v2.5h2.6c.5 0 .9.4.9.9v2.9H4.7z',
  boot: 'M6.6 3.6h3.5c.5 0 .9.4.9.9v6.1c0 1.6.7 3.1 2 4.1l3.9 3c1 .8 1.6 2 1.6 3.2 0 .5-.4.9-.9.9H5.4c-.5 0-.9-.4-.9-.9V5.4c0-1 .9-1.8 2.1-1.8zm-2.1 12.1h3.6v1.7H4.5v-1.7z',
  cat: 'M6.2 4.1c.2-.4.7-.5 1-.2l2.5 2c.7-.2 1.5-.3 2.3-.3s1.6.1 2.3.3l2.5-2c.4-.3.9-.1 1 .3l.8 2.9c1 1.1 1.6 2.5 1.6 4 0 1.6-.7 3.1-1.9 4.2v4c0 .5-.4.9-.9.9h-1.3c-.5 0-.9-.4-.9-.9v-2.1c-.6.1-1.3.2-2 .2h-.7v2c0 .5-.4.9-.9.9H10c-.5 0-.9-.4-.9-.9v-2.6c-2.3-1-3.9-3.1-3.9-5.7 0-1.5.6-2.9 1.6-4l-.6-2.6a.8.8 0 010-.4zm3.2 6.3a.9.9 0 100 1.8.9.9 0 000-1.8zm5.2 0a.9.9 0 100 1.8.9.9 0 000-1.8z',
  thimble: 'M6.4 5.5C6.4 4.4 8.9 3.5 12 3.5s5.6.9 5.6 2v7.2c0 3.4-2.5 6.2-5.6 6.2s-5.6-2.8-5.6-6.2V5.5zm2 1.9a.8.8 0 100 1.6.8.8 0 000-1.6zm3 0a.8.8 0 100 1.6.8.8 0 000-1.6zm3 0a.8.8 0 100 1.6.8.8 0 000-1.6zm-6 3a.8.8 0 100 1.6.8.8 0 000-1.6zm3 0a.8.8 0 100 1.6.8.8 0 000-1.6zm3 0a.8.8 0 100 1.6.8.8 0 000-1.6z',
  barrow: 'M3.2 6.1c0-.5.4-.9.9-.9h2.2c.4 0 .7.2.8.6l.5 1.4h11.2c.6 0 1.1.6.9 1.2l-1.8 5.4c-.2.6-.7.9-1.3.9H8.6l.4 1.2h8.2c.5 0 .9.4.9.9s-.4.9-.9.9H8.4c-.6 0-1.1-.4-1.3-.9L4.3 7H4.1c-.5 0-.9-.4-.9-.9zm4.6 12.3a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z',
  iron: 'M3.4 16.6c0-3.9 2.5-7.3 6.2-8.5l.6-.2V5.6c0-.5.4-.9.9-.9h5.1c2.4 0 4.4 2 4.4 4.4v.9c0 .5-.4.9-.9.9h-2.8v2.3h2.4c.5 0 .9.4.9.9v2.5c0 .5-.4.9-.9.9H4.3c-.5 0-.9-.4-.9-.9zm8.6-10.1v1.3h2.8V6.5H12z',
  horse: 'M5.1 20.4c0-4.3 1.4-6.9 3.2-8.6.5-.5.8-1.2.8-1.9V8.3c0-2.1 1.7-3.8 3.8-3.8h.3c.4 0 .7.2.9.6l.5 1.2 2.7 1.4c1.3.7 2.1 2 2.1 3.5v1.5c0 .6-.5 1.1-1.1 1.1h-1.5c-.6 0-1.1.5-1.1 1.1v5.5c0 .5-.4.9-.9.9h-1.3c-.5 0-.9-.4-.9-.9v-4.3l-2.2 1.5c-.5.3-.8.9-.8 1.5v1.3c0 .5-.4.9-.9.9H6c-.5 0-.9-.4-.9-.9zm8.5-13.2a.8.8 0 100 1.6.8.8 0 000-1.6z',
};

// A player's piece has to be the SAME on every screen in the room, and
// nothing in the game state records one - so it is derived from a stable
// property of the player instead of assigned locally. The color index is
// exactly that: the server hands out colors in a fixed order and never
// changes them for the life of the game.
const PLAYER_COLORS = [
  '#e63946', '#2a9d8f', '#f4a261', '#457b9d',
  '#a663cc', '#ffb703', '#06d6a0', '#ef476f',
  '#118ab2', '#d4622a',
];

function hashString(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pieceIdFor(player) {
  if (!player) return PIECE_IDS[0];
  const byColor = PLAYER_COLORS.indexOf((player.color || '').toLowerCase());
  const index = byColor >= 0 ? byColor : hashString(String(player.id || player.nickname || ''));
  return PIECE_IDS[index % PIECE_IDS.length];
}

export function pieceLabel(pieceId, language) {
  const entry = PIECE_LABELS[pieceId];
  if (!entry) return pieceId;
  return entry[language] || entry.en;
}

export default function PieceGlyph({ piece, className, style }) {
  const d = PIECE_PATHS[piece] || PIECE_PATHS.hat;
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
