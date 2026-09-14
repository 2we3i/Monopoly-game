// FramedAvatar.jsx
// A room player's avatar with their avatar frame, and - when `join` is
// set - their entrance effect played once as they appear in a list.

import { useState } from 'react';
import { AvatarFrame, useLook } from './Cosmetics';
import { EffectStage } from './effects';

export default function FramedAvatar({ cosmetics, join = false, children }) {
  const look = useLook(cosmetics);
  const [playKey] = useState(1);
  const framed = <AvatarFrame item={look.avatarFrame}>{children}</AvatarFrame>;
  if (!join || !look.effectJoin) return framed;
  return (
    <span className="relative inline-flex shrink-0">
      {framed}
      <span className="pointer-events-none absolute -inset-4">
        <EffectStage visual={look.effectJoin.visual} playKey={playKey} className="h-full w-full" />
      </span>
    </span>
  );
}
