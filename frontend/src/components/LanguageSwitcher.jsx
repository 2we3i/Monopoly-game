// LanguageSwitcher.jsx
// A small dropdown for picking the UI language. This is a personal,
// per-browser preference (see LanguageContext) - it never affects what
// other players in the same room see.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

export default function LanguageSwitcher({ variant = 'light' }) {
  const { language, setLanguage, languages } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDark = variant === 'dark';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          isDark
            ? 'border-board-tile/25 text-board-tile/80 hover:border-brass/60 hover:text-board-tile'
            : 'border-ink/15 text-ink-soft hover:border-brass/50 hover:text-ink'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
        </svg>
        {languages[language].nativeLabel}
        <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-30 mt-1.5 min-w-[140px] overflow-hidden rounded-xl border border-brass/20 bg-board shadow-panel texture-parchment"
        >
          {Object.entries(languages).map(([code, meta]) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === language}
              onClick={() => {
                setLanguage(code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-brass/10 ${
                code === language ? 'font-semibold text-ink' : 'text-ink-soft'
              }`}
            >
              {meta.nativeLabel}
              {code === language && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-brass-deep" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
