// Modal.jsx
// Shared dialog shell: one backdrop, one header layout, one close
// behaviour (Escape, backdrop click, explicit button) for every dialog in
// the game, so a player learns how to dismiss a panel exactly once.

import { useEffect } from 'react';
import Icon from './icons';

export default function Modal({
  onClose, title, subtitle, icon, children, footer, widthClass = 'max-w-lg', bodyClass = '', accent,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`flex max-h-[92vh] w-full ${widthClass} animate-scale-in flex-col overflow-hidden rounded-t-2xl border border-white/12 bg-felt-700/95 shadow-deep backdrop-blur-2xl sm:rounded-2xl`}
      >
        {accent && <div className="h-1.5 w-full shrink-0" style={{ background: accent }} />}

        {(title || icon) && (
          <header className="flex shrink-0 items-start gap-3 border-b border-white/[0.08] px-5 py-3.5">
            {icon && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brass/15 text-brass-light">
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-[19px] font-bold leading-tight text-parch">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-parch/45">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 shrink-0 rounded-lg p-1.5 text-parch/40 transition-colors hover:bg-white/10 hover:text-parch"
            >
              <Icon.close className="h-5 w-5" />
            </button>
          </header>
        )}

        {/* A plain block, not a flex column: inside a flex column every
            child becomes shrinkable, which silently squashes tall content
            (a full rent table, a long property list) instead of letting
            the body scroll. Dialogs that genuinely need a flex body ask
            for it through bodyClass. */}
        <div className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5 ${bodyClass}`}>
          {children}
        </div>

        {footer && (
          <footer className="shrink-0 border-t border-white/[0.08] bg-black/20 px-5 py-3.5">{footer}</footer>
        )}
      </div>
    </div>
  );
}
