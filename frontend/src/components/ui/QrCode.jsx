// QrCode.jsx
// A real, scannable QR code drawn as one SVG path.
//
// The symbol is computed in the browser from the text it is asked to
// carry (see lib/qr.js), so what a phone's camera reads is exactly the
// link this room needs - there is no image service in the middle and
// nothing to go stale when the room code changes.

import { useMemo } from 'react';
import { encode, toSvgPath, viewBoxOf } from '../../lib/qr';

export default function QrCode({
  value, className = '', title = 'QR code', quietZone = 3, tone = '#0b0d10',
}) {
  const symbol = useMemo(() => {
    try {
      const modules = encode(value);
      return { path: toSvgPath(modules, quietZone), viewBox: viewBoxOf(modules, quietZone) };
    } catch {
      // A link too long to encode is a bug, not something to crash on:
      // the room code beside the code is still enough to join by hand.
      return null;
    }
  }, [value, quietZone]);

  if (!symbol) return null;

  return (
    <svg
      viewBox={symbol.viewBox}
      className={className}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <title>{title}</title>
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={symbol.path} fill={tone} />
    </svg>
  );
}
