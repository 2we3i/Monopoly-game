// UserAvatar.jsx
// An account's avatar outside a game room: the uploaded photo or the
// initial, inside the player's equipped avatar frame, with an optional
// online dot.

import { useState } from 'react';
import { AvatarFrame, useLook } from '../../cosmetics/Cosmetics';

const SIZES = {
  xs: 'h-6 w-6 text-[11px]',
  sm: 'h-8 w-8 text-[13px]',
  md: 'h-10 w-10 text-[15px] 4xl:h-12 4xl:w-12',
  lg: 'h-14 w-14 text-[22px] 4xl:h-16 4xl:w-16',
  xl: 'h-20 w-20 text-[32px] 4xl:h-24 4xl:w-24',
};

export default function UserAvatar({
  user, size = 'md', online = null, frame = true, look: givenLook,
}) {
  const [failed, setFailed] = useState(false);
  const resolved = useLook(givenLook ? null : user?.cosmetics);
  const look = givenLook || resolved;
  const sizeClass = SIZES[size] || SIZES.md;
  const src = user?.avatarPath || user?.avatarUrl;
  const inner = src && !failed ? (
    <img src={src} alt="" className={`${sizeClass} rounded-full object-cover`} onError={() => setFailed(true)} draggable={false} />
  ) : (
    <span className={`${sizeClass} flex items-center justify-center rounded-full bg-gradient-to-br from-brass/40 to-brass-deep/40 font-display font-black text-brass-light`}>
      {(user?.nickname || '?').slice(0, 1).toUpperCase()}
    </span>
  );
  return (
    <span className="relative inline-flex shrink-0">
      <AvatarFrame item={frame ? look.avatarFrame : null} thickness={size === 'xl' || size === 'lg' ? 4 : 3}>{inner}</AvatarFrame>
      {online != null && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#121418] ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
      )}
    </span>
  );
}
