// usePhoneLayout.js
// Whether this screen should get a game's phone layout instead of the
// desktop table: a narrow portrait screen, or a phone turned sideways
// (short and touch-driven). A tablet or a narrow laptop window is not a
// phone - it keeps the full table.

import { useEffect, useState } from 'react';

const PHONE_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';

function matches() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;
}

export function usePhoneLayout() {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

export default usePhoneLayout;
