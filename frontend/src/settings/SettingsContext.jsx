// SettingsContext.jsx
// Player-local display preferences. None of these touch game state or
// reach the server - they are personal to this browser, which is why
// they live in localStorage rather than in the room.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'landmark_settings';

export const DEFAULT_SETTINGS = {
  // 'auto' hides a tile's name once it would render too small to read;
  // 'always' keeps it no matter what, 'never' keeps the board graphic.
  tileLabels: 'auto',
  showTooltips: true,
  // Illustrations on the squares. On by default - they are what makes
  // the board look like a board rather than a spreadsheet.
  tileArt: true,
  showActivityLog: true,
  animations: true,
  // Wheel/trackpad zoom speed multiplier.
  zoomSpeed: 1,
  // Board tokens can be pinned to a comfortable minimum on-screen size.
  largeTokens: false,
};

const SettingsContext = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Merge rather than replace: a stored blob written by an older build
    // is missing whatever keys were added since, and those must fall
    // back to their defaults instead of becoming undefined.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* private mode / storage disabled - settings just stay session-local */
    }
  }, [settings]);

  // A player who turned animations off in the OS should not have to turn
  // them off here as well.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) setSettings((s) => ({ ...s, animations: false }));
  }, []);

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
