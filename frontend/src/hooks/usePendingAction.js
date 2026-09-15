// usePendingAction.js
// Marks one action as "on its way" from the click until the next room
// state arrives (or a few seconds pass - a refused action gets no new
// state, and its error banner explains why). Buttons read it to show a
// busy label and to ignore a second click while the first is in flight,
// which is what keeps a double click from sending a bid or a sale twice.

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePendingAction(stateStamp, timeoutMs = 4000) {
  const [pending, setPendingState] = useState(null);
  const pendingRef = useRef(null);
  const timer = useRef(null);

  const setPending = useCallback((value) => {
    pendingRef.current = value;
    setPendingState(value);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    setPending(null);
  }, [stateStamp, setPending]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback((key, fn) => {
    if (pendingRef.current) return false;
    setPending(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPending(null), timeoutMs);
    fn();
    return true;
  }, [setPending, timeoutMs]);

  return [pending, run];
}
