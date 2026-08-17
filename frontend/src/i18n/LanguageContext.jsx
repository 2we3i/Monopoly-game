// LanguageContext.jsx
// Provides the current language and a t() translation function to the
// whole app. The choice is a personal, per-browser preference (stored in
// localStorage) - it does NOT sync between players in a room. Two people
// in the same game can each view the UI in their own language; the
// server has no concept of language at all, it only ever sends
// structured data (player names, tile ids, amounts) which each client
// formats into its own locale's sentences.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGES, TRANSLATIONS } from './translations';

const STORAGE_KEY = 'landmark_language';
const LanguageContext = createContext(null);

function detectInitialLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && TRANSLATIONS[saved]) return saved;
  // Fall back to the browser's own language if it's one we support, so a
  // Russian-locale browser gets Russian by default on first visit without
  // needing to find the switcher first.
  const browserLang = (navigator.language || '').slice(0, 2);
  if (TRANSLATIONS[browserLang]) return browserLang;
  return DEFAULT_LANGUAGE;
}

// Very small {placeholder} interpolator - avoids pulling in a full i18n
// library for a handful of variable substitutions (names, counts, amounts).
function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(detectInitialLanguage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang) => {
    if (TRANSLATIONS[lang]) setLanguageState(lang);
  }, []);

  const t = useCallback((key, vars) => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS[DEFAULT_LANGUAGE];
    const template = dict[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key;
    return interpolate(template, vars);
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t, languages: LANGUAGES }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation must be used within a LanguageProvider');
  return ctx;
}
