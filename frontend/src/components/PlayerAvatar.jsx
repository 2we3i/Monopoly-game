// PlayerAvatar.jsx
// One player's visual identity, used everywhere: board token, player
// list, dock, trade screens. An uploaded photo wins when there is one;
// otherwise the player gets their playing piece on their own color,
// which is far easier to pick out of a crowded board than a plain dot
// and stays recognisable down to a few pixels.

import { useState } from 'react';
import PieceGlyph, { pieceIdFor } from './tokenArt';
import { isLightColor } from '../colorUtils';

export default function PlayerAvatar({
  player, sizeClassName = 'h-9 w-9', ringClassName = 'ring-2 ring-white/50', title, showPiece = true,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!player.avatarUrl && !imageFailed;

  if (showImage) {
    return (
      <img
        src={player.avatarUrl}
        alt=""
        title={title}
        className={`block ${sizeClassName} rounded-full object-cover shadow-token ${ringClassName}`}
        onError={() => setImageFailed(true)}
        draggable={false}
      />
    );
  }

  return (
    <span
      title={title}
      className={`flex items-center justify-center overflow-hidden rounded-full shadow-token ${sizeClassName} ${ringClassName}`}
      style={{ backgroundColor: player.color }}
      aria-hidden={title ? undefined : 'true'}
    >
      {showPiece && (
        <PieceGlyph
          piece={pieceIdFor(player)}
          className="h-[68%] w-[68%]"
          // A light token (yellow, amber) needs a dark piece on it; a
          // dark one needs a light piece. Same rule as the board's
          // house markers.
          style={{ color: isLightColor(player.color) ? 'rgba(31,36,23,0.78)' : 'rgba(255,255,255,0.92)' }}
        />
      )}
    </span>
  );
}
