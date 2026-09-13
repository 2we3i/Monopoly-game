// PlayerAvatar.jsx
// Renders a player's avatar image if they have one, falling back to a
// plain color dot otherwise.

import { useState } from 'react';

export default function PlayerAvatar({ player, sizeClassName = 'h-9 w-9', ringClassName = 'ring-2 ring-white/50', title }) {
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
      className={`block ${sizeClassName} rounded-full shadow-token ${ringClassName}`}
      style={{ backgroundColor: player.color }}
      aria-hidden={title ? undefined : 'true'}
    />
  );
}
