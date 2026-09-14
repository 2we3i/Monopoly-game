// router.js
// The app has three top-level pages - the games, the player's profile and
// the admin panel - so a full router would be dead weight. This is the
// History API plus one event.

import { useEffect, useState } from 'react';

export function navigate(path) {
  if (window.location.pathname + window.location.hash === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('landmark:navigate'));
}

export function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener('landmark:navigate', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('landmark:navigate', update);
    };
  }, []);
  return pathname;
}
