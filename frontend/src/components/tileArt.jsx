// tileArt.jsx
// Illustrations for board squares.
//
// Two rules shaped these drawings. First, they must survive being scaled
// with the board: a tile is ~80 design pixels wide and may be shown at a
// third of that, so every piece of art is a flat silhouette with no
// detail smaller than a stroke - no gradients, no hairlines, no text.
// Second, they must never compete with the name and the price, which is
// why they are drawn in the tile's own group color at low contrast and
// sit behind the label rather than beside it.
//
// A layout may also ship a real picture per tile (`tile.image`); that
// always wins over the generated art - see BoardTile.

import { TILE_TYPES } from '../boardData';

// Property art rises with the price of the square, so a glance across an
// edge of the board reads as a skyline getting taller and richer - the
// same information the price already carries, in a form you can see
// without reading.
export function artTierFor(tile, maxPrice) {
  if (!tile || !tile.price || !maxPrice) return 0;
  const ratio = tile.price / maxPrice;
  if (ratio < 0.22) return 0;
  if (ratio < 0.42) return 1;
  if (ratio < 0.62) return 2;
  if (ratio < 0.82) return 3;
  return 4;
}

const BUILDINGS = [
  // 0 - cottage
  'M4 22v-8.2L16 5l12 8.8V22H4zm9-1.6h6V15h-6v5.4z',
  // 1 - townhouse pair
  'M3 22V11l7-5 7 5v11H3zm15 0V9.5l5.5-3.8L29 9.5V22H18zM7.5 14h5v4h-5v-4zm14.5 0h3.5v4H22v-4z',
  // 2 - apartment block
  'M5 22V6.5C5 5.7 5.7 5 6.5 5h11c.8 0 1.5.7 1.5 1.5V22H5zm16 0V11h5.5c.8 0 1.5.7 1.5 1.5V22h-7zM8 8.5h3v3H8v-3zm5 0h3v3h-3v-3zm-5 5h3v3H8v-3zm5 0h3v3h-3v-3zm-5 5h3v3.5H8V18.5zm5 0h3v3.5h-3V18.5zm10-4h3v3h-3v-3z',
  // 3 - office tower
  'M3 22v-8c0-.8.7-1.5 1.5-1.5H9V6c0-.8.7-1.5 1.5-1.5h8c.8 0 1.5.7 1.5 1.5v6.5h4.5c.8 0 1.5.7 1.5 1.5v8H3zm9-14h2.5v2.5H12V8zm4 0h2.5v2.5H16V8zm-4 5h2.5v2.5H12V13zm4 0h2.5v2.5H16V13zm-10 3h2.5v2.5H6V16zm15 0h2.5v2.5H21V16z',
  // 4 - skyscraper cluster
  'M2 22v-9.5C2 11.7 2.7 11 3.5 11H7V7.5C7 6.7 7.7 6 8.5 6H12V2.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3V6h3.5c.8 0 1.5.7 1.5 1.5V11h3.5c.8 0 1.5.7 1.5 1.5V22H2zm12-17h3v2.5h-3V5zm0 5h3v2.5h-3V10zm0 5h3v2.5h-3V15zm-5-2h3v2.5H9V13zm0 5h3v2.5H9V18zm10-5h3v2.5h-3V13zm0 5h3v2.5h-3V18z',
];

const SCENES = {
  train: 'M6 5.5C6 4.1 7.1 3 8.5 3h15C24.9 3 26 4.1 26 5.5V15c0 1.4-1.1 2.5-2.5 2.5h-15A2.5 2.5 0 016 15V5.5zM8.5 6v3.5h15V6h-15zm1.5 6a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zm12 0a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zM9 19h3l-2.5 3.5H6L9 19zm14 0h-3l2.5 3.5H26L23 19z',
  power: 'M17.5 2l-9 12h6.2l-1.7 8 9.5-13h-6.6l1.6-7zM4 20.5h9v2H4v-2zm-2-4h7v2H2v-2z',
  water: 'M16 3c5 6.6 8 10.6 8 14.1A8 8 0 018 17.1C8 13.6 11 9.6 16 3zm-2.4 10.5a3.6 3.6 0 003.6 3.6',
  tax: 'M16 2.5l12 5.5v2.5H4V8l12-5.5zM6.5 13h3v7.5h-3V13zm6 0h3v7.5h-3V13zm6 0h3v7.5h-3V13zM4 22.5h24V25H4v-2.5z',
  chance: 'M12.4 9.6a3.7 3.7 0 117 1.7c-.8 1.3-3.4 1.8-3.4 4.1v.6h-3v-.9c0-3 3.4-3.4 3.9-4.6a1.2 1.2 0 00-1.1-1.7c-.6 0-1.1.4-1.3.9l-2.1-.1zM16 18.4a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z',
  chest: 'M4 11h24v10.5c0 .8-.7 1.5-1.5 1.5h-21c-.8 0-1.5-.7-1.5-1.5V11zm1.2-2L7.8 4.4c.3-.6.9-.9 1.5-.9h13.4c.6 0 1.2.3 1.5.9L26.8 9H5.2zM14 13h4v3.5h-4V13z',
  go: 'M3 16h16.5l-5-5 2.5-2.5L27 19l-10 10.5-2.5-2.5 5-5H3v-6z',
  jail: 'M5 4h22v22H5V4zm3.5 3.5v15h2.6v-15H8.5zm6 0v15h3v-15h-3zm6.4 0v15h2.6v-15h-2.6z',
  parking: 'M7 3h18c1.1 0 2 .9 2 2v22c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm5 5v16h3.5v-5h3a5.5 5.5 0 000-11H12zm3.5 3h2.8a2.5 2.5 0 010 5h-2.8v-5z',
  police: 'M16 2l11 4v9.5C27 22.6 22.3 28.5 16 30 9.7 28.5 5 22.6 5 15.5V6l11-4zm-2 12.8l-2.5 2.5 4.5 4.5 7-7-2.5-2.5-4.5 4.5-2-2z',
};

function ArtSvg({ d, viewBox = '0 0 32 24', color, size, opacity = 0.5, stroke = false }) {
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={(size * (viewBox === '0 0 32 24' ? 24 : 32)) / 32}
      className="pointer-events-none shrink-0"
      style={{ color, opacity }}
      aria-hidden="true"
    >
      <path
        d={d}
        fill={stroke ? 'none' : 'currentColor'}
        stroke={stroke ? 'currentColor' : 'none'}
        strokeWidth={stroke ? 2 : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// `size` is the art's width in board design pixels; height follows the
// aspect ratio of whichever grid the drawing was made on.
export default function TileArt({ tile, tier = 0, accent, size = 34, corner = false }) {
  switch (tile.type) {
    case TILE_TYPES.PROPERTY:
      return <ArtSvg d={BUILDINGS[tier] || BUILDINGS[0]} color={accent} size={size} opacity={0.42} />;
    case TILE_TYPES.RAILROAD:
      return <ArtSvg d={SCENES.train} color={accent} size={size} opacity={0.55} />;
    case TILE_TYPES.UTILITY:
      return /water|вод|aqua/i.test(tile.name)
        ? <ArtSvg d={SCENES.water} color={accent} size={size * 0.8} opacity={0.5} />
        : <ArtSvg d={SCENES.power} color={accent} size={size * 0.8} opacity={0.55} />;
    case TILE_TYPES.TAX:
      return <ArtSvg d={SCENES.tax} color="#a8342a" size={size * 0.85} opacity={0.45} />;
    case TILE_TYPES.CHANCE:
      return <ArtSvg d={SCENES.chance} color="#c9982f" size={size * 0.75} opacity={0.55} />;
    case TILE_TYPES.CHEST:
      return <ArtSvg d={SCENES.chest} color="#1f7a5c" size={size * 0.85} opacity={0.5} />;
    case TILE_TYPES.GO:
      return <ArtSvg d={SCENES.go} viewBox="0 0 32 32" color="#1f7a5c" size={corner ? 44 : size} opacity={0.6} />;
    case TILE_TYPES.JAIL:
      return <ArtSvg d={SCENES.jail} viewBox="0 0 32 32" color="#7c5c2a" size={corner ? 42 : size} opacity={0.5} />;
    case TILE_TYPES.FREE_PARKING:
      return <ArtSvg d={SCENES.parking} viewBox="0 0 32 32" color="#3a6ea8" size={corner ? 42 : size} opacity={0.5} />;
    case TILE_TYPES.GO_TO_JAIL:
      return <ArtSvg d={SCENES.police} viewBox="0 0 32 32" color="#a8342a" size={corner ? 44 : size} opacity={0.5} />;
    default:
      return null;
  }
}
