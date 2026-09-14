// BoardTile.jsx
// One tile of the board, drawn in the board's own fixed pixel design
// space (see boardData.js geometry helpers). Everything here is sized in
// design pixels; the viewport's zoom transform scales the whole thing.

import { memo } from 'react';
import { TILE_TYPES, getTileName, tileAccentColor } from '../boardData';
import TileArt from './tileArt';
import { hexToRgba, isLightColor } from '../colorUtils';
import Icon from './icons';

const BAND = 22;
// Zoomed far out the name is gone, so the color band is doing all the
// work of telling groups apart - it gets thicker to compensate.
const BAND_MIN = 34;
const OWNER_BAR = 8;

const INNER_SIDE = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };
const OUTER_SIDE = { bottom: 'bottom', top: 'top', left: 'left', right: 'right' };

function bandStyle(orientation, color, thickness) {
  const vertical = orientation === 'left' || orientation === 'right';
  const side = INNER_SIDE[orientation] || 'top';
  return {
    position: 'absolute',
    backgroundColor: color,
    [side]: 0,
    ...(vertical ? { top: 0, bottom: 0, width: thickness } : { left: 0, right: 0, height: thickness }),
  };
}

function ownerBarStyle(orientation, color) {
  const vertical = orientation === 'left' || orientation === 'right';
  const side = OUTER_SIDE[orientation] || 'bottom';
  return {
    position: 'absolute',
    backgroundColor: color,
    [side]: 0,
    ...(vertical ? { top: 0, bottom: 0, width: OWNER_BAR } : { left: 0, right: 0, height: OWNER_BAR }),
  };
}

function bodyPadding(orientation, hasBand, hasOwner) {
  const inner = (hasBand ? BAND : 0) + 5;
  const outer = (hasOwner ? OWNER_BAR : 0) + 5;
  switch (orientation) {
    case 'bottom': return { paddingTop: inner, paddingBottom: outer, paddingLeft: 4, paddingRight: 4 };
    case 'top': return { paddingBottom: inner, paddingTop: outer, paddingLeft: 4, paddingRight: 4 };
    case 'left': return { paddingRight: inner, paddingLeft: outer, paddingTop: 4, paddingBottom: 4 };
    case 'right': return { paddingLeft: inner, paddingRight: outer, paddingTop: 4, paddingBottom: 4 };
    default: return { padding: 6 };
  }
}

function Houses({ houses, orientation, color }) {
  if (!houses) return null;
  const vertical = orientation === 'left' || orientation === 'right';
  const dark = isLightColor(color);
  if (houses >= 5) {
    return (
      <span
        className="flex items-center justify-center rounded-[2px] px-1 py-[1px] text-[8px] font-black leading-none tracking-wider"
        style={{ backgroundColor: '#a8342a', color: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
      >
        H
      </span>
    );
  }
  return (
    <span className={`flex items-center justify-center gap-[2px] ${vertical ? 'flex-col' : ''}`}>
      {Array.from({ length: houses }).map((_, i) => (
        <span
          key={i}
          className="block h-[7px] w-[7px] rounded-[1.5px]"
          style={{
            backgroundColor: dark ? '#1f7a5c' : '#4fc39a',
            boxShadow: '0 1px 1.5px rgba(0,0,0,0.4)',
            border: `1px solid ${dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.25)'}`,
          }}
        />
      ))}
    </span>
  );
}

const MORTGAGE_HATCH = 'repeating-linear-gradient(45deg, rgba(31,36,23,0.16) 0 5px, transparent 5px 11px)';

function TileShell({ rect, selected, dimmed, onSelect, onHover, children, title, tile, interactive = true }) {
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      {...(interactive ? { type: 'button', onClick: onSelect } : {})}
      data-tile-id={tile.id}
      data-tile-type={tile.type}
      onMouseEnter={onHover ? (e) => onHover(e.currentTarget) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      title={title}
      className={`group absolute overflow-hidden rounded-[5px] text-left transition-[box-shadow,transform] duration-150
        ${interactive ? 'cursor-pointer hover:z-20 hover:shadow-deed-hover' : ''}
        ${selected ? 'z-20 ring-[3px] ring-brass ring-offset-1 ring-offset-board' : ''}
        ${dimmed ? 'opacity-[0.55]' : ''}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        backgroundColor: '#fbf6ea',
        border: '1px solid rgba(31,36,23,0.22)',
        boxShadow: '0 1px 1px rgba(31,36,23,0.10), 0 4px 10px -8px rgba(31,36,23,0.6)',
      }}
    >
      {children}
    </Tag>
  );
}

// --- Property / railroad / utility ---------------------------------

function OwnableTile({ tile, propState, owner, monopoly, orientation, detail, rect, selected, onSelect, onHover, language, art, tier }) {
  const accent = tileAccentColor(tile);
  const name = getTileName(tile, language);
  const isProperty = tile.type === TILE_TYPES.PROPERTY;
  const showBand = isProperty || detail !== 'min';
  const vertical = orientation === 'left' || orientation === 'right';
  const minimal = detail === 'min';

  // Artwork is dropped before the name is: at 'mid' the tile is only
  // about 40-60 screen pixels across, and a picture that small next to
  // two lines of type reads as clutter rather than illustration.
  const showArt = art && detail === 'full';

  return (
    <TileShell tile={tile} rect={rect} selected={selected} onSelect={onSelect} onHover={onHover} title={`${name} · $${tile.price}`}>
      {/* Owner wash: the strongest "who owns this" signal at any zoom. */}
      {owner && (
        <span
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(${vertical ? '90deg' : '0deg'}, ${hexToRgba(owner.color, 0.3)} 0%, ${hexToRgba(owner.color, 0.06)} 60%, transparent 100%)` }}
        />
      )}

      {/* Color-group band on the edge facing the middle of the board. */}
      {showBand && (
        <span
          className="pointer-events-none flex items-center justify-center gap-[3px] overflow-hidden"
          style={{
            ...bandStyle(orientation, accent, minimal ? BAND_MIN : BAND),
            boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.28)',
            flexDirection: vertical ? 'column' : 'row',
          }}
        >
          <Houses houses={propState?.houses} orientation={orientation} color={accent} />
          {monopoly && !propState?.houses && (
            <span
              className="block h-[6px] w-[6px] rotate-45 rounded-[1px]"
              style={{ backgroundColor: isLightColor(accent) ? 'rgba(31,36,23,0.7)' : 'rgba(255,255,255,0.9)' }}
            />
          )}
        </span>
      )}

      {/* Ownership stripe on the outer edge. */}
      {owner && <span className="pointer-events-none" style={{ ...ownerBarStyle(orientation, owner.color), boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)' }} />}

      {!minimal && (
        <span
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
          style={bodyPadding(orientation, showBand, !!owner)}
        >
          {showArt && (
            tile.image
              ? (
                <img
                  src={tile.image}
                  alt=""
                  draggable={false}
                  className="mb-[2px] w-full shrink-0 rounded-[2px] object-cover"
                  style={{ height: 30 }}
                />
              )
              : <TileArt tile={tile} tier={tier} accent={accent} size={34} />
          )}
          {/* The name keeps its size at every detail level - what drops
              away first is the price, because two lines of tiny type are
              harder to read than one line of the same type. */}
          <span
            className="w-full font-semibold leading-[1.08] text-ink"
            style={{
              fontSize: 11.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              letterSpacing: '-0.01em',
            }}
          >
            {name}
          </span>
          {detail === 'full' && (
            <span className="mt-[3px] rounded-full bg-ink/[0.07] px-[5px] py-[1px] text-[9.5px] font-bold leading-[1.3] text-ink-soft tnum">
              ${tile.price}
            </span>
          )}
        </span>
      )}

      {propState?.mortgaged && (
        <>
          <span className="pointer-events-none absolute inset-0" style={{ backgroundImage: MORTGAGE_HATCH }} />
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-ink/85 px-[5px] py-[2px] text-[8px] font-black uppercase tracking-wider text-board">
            <Icon.lock className="mr-[2px] inline h-[9px] w-[9px] align-[-1px]" />MTG
          </span>
        </>
      )}
    </TileShell>
  );
}

// --- Special (non-ownable) tiles -----------------------------------

const SPECIAL_META = {
  [TILE_TYPES.CHANCE]: { icon: Icon.chance, color: '#c9982f', wash: 'rgba(201,152,47,0.14)' },
  [TILE_TYPES.CHEST]: { icon: Icon.chest, color: '#1f7a5c', wash: 'rgba(31,122,92,0.13)' },
  [TILE_TYPES.TAX]: { icon: Icon.tax, color: '#a8342a', wash: 'rgba(168,52,42,0.11)' },
  [TILE_TYPES.GO]: { icon: Icon.go, color: '#1f7a5c', wash: 'rgba(31,122,92,0.16)' },
  [TILE_TYPES.JAIL]: { icon: Icon.jail, color: '#7c5c2a', wash: 'rgba(168,52,42,0.10)' },
  [TILE_TYPES.GO_TO_JAIL]: { icon: Icon.police, color: '#a8342a', wash: 'rgba(168,52,42,0.16)' },
  [TILE_TYPES.FREE_PARKING]: { icon: Icon.parking, color: '#3a6ea8', wash: 'rgba(58,110,168,0.14)' },
};

function SpecialTile({ tile, rect, detail, corner, selected, onSelect, onHover, language, art }) {
  const meta = SPECIAL_META[tile.type] || { icon: Icon.scroll, color: '#4a4f3d', wash: 'transparent' };
  const IconCmp = meta.icon;
  const name = getTileName(tile, language);
  const minimal = detail === 'min' && !corner;

  return (
    <TileShell tile={tile} rect={rect} selected={selected} onSelect={onSelect} onHover={onHover} title={name} interactive>
      <span className="pointer-events-none absolute inset-0" style={{ backgroundColor: meta.wash }} />
      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[3px] px-[4px] text-center">
        {art && !minimal
          ? <TileArt tile={tile} accent={meta.color} size={corner ? 46 : 30} corner={corner} />
          : (
            <IconCmp
              className="shrink-0"
              style={{ color: meta.color, width: corner ? 32 : minimal ? 20 : 22, height: corner ? 32 : minimal ? 20 : 22 }}
            />
          )}
        {!minimal && (
          <span
            className="font-bold uppercase leading-[1.1] tracking-[0.02em] text-ink"
            style={{ fontSize: corner ? 10 : 9, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {name}
          </span>
        )}
        {!minimal && tile.amount != null && (
          <span className="rounded-full bg-ink/[0.08] px-[5px] py-[1px] text-[9px] font-bold leading-[1.3] text-rent tnum">
            -${tile.amount}
          </span>
        )}

      </span>
    </TileShell>
  );
}

function BoardTile(props) {
  const { tile } = props;
  if (tile.type === TILE_TYPES.PROPERTY || tile.type === TILE_TYPES.RAILROAD || tile.type === TILE_TYPES.UTILITY) {
    return <OwnableTile {...props} />;
  }
  return <SpecialTile {...props} corner={props.orientation === 'corner'} />;
}

export default memo(BoardTile);
