// useChpok.js
// Client side of online ЧПОК, used by the big screen and by every phone.
// The room itself is the shared party-room client (usePartyRoom); what a
// ЧПОК phone may say is its answer and its vote, each once per round.

import { useEffect, useState } from 'react';
import { usePartyRoom } from './usePartyRoom';

let configPromise = null;
export function loadChpokConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/chpok/config').then((r) => r.json()).catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export function useChpokConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let alive = true;
    loadChpokConfig().then((c) => { if (alive) setConfig(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return config;
}

const MOVES = {
  answer: (text) => ({ text }),
  vote: (answerId) => ({ answerId }),
};

export function useChpok(authToken, { device = 'screen', enabled = true } = {}) {
  return usePartyRoom('chpok', authToken, { device, enabled, moves: MOVES });
}

export default useChpok;
