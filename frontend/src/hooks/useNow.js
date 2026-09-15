// useNow.js
// The current time, refreshed on an interval while `active` - for
// countdowns that have to keep moving between server updates.

import { useEffect, useState } from 'react';

export function useNow(active = true, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
