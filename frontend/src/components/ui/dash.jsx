// dash.jsx
// The building blocks of the dark dashboard look shared by the admin
// panel and the profile page: cards, stat tiles, badges, a table, a bar
// chart, dialogs and a drawer. Graphite surfaces, hairline borders and a
// single brass accent - quieter than the game tables on purpose.

import { useEffect, useState } from 'react';

export const GAME_COLORS = {
  monopoly: '#d4a52c', mafia: '#e0574b', citadels: '#a57ae0', bunker: '#9aa3ad',
};

const ICONS = {
  chart: <><path d="M4 20V11" /><path d="M10 20V5" /><path d="M16 20v-8" /><path d="M3 20h18" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 01-8 0z" /><path d="M8 6H5a3 3 0 003 3M16 6h3a3 3 0 01-3 3" /><path d="M12 13v4M8 20h8" /></>,
  door: <><path d="M14 4h5v16h-5" /><path d="M10 12H3M6 9l-3 3 3 3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  power: <><path d="M12 3v8" /><path d="M6.3 7.3a8 8 0 1011.4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6" /></>,
  gamepad: <><rect x="2" y="7" width="20" height="11" rx="5" /><path d="M7 11v3M5.5 12.5h3" /><circle cx="16" cy="12" r="1" /><circle cx="18" cy="14" r="1" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  refresh: <><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  castle: <><path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12z" /><path d="M10 21v-5h4v5" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4M12 7.5v9" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  arrowLeft: <path d="M15 5l-7 7 7 7" />,
  check: <path d="M5 12l5 5 9-10" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  bell: <><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 004 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  send: <><path d="M4 12l16-8-6 16-2.5-6.5z" /><path d="M11.5 13.5L20 4" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 016 0V8" /></>,
  box: <><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></>,
  gift: <><rect x="3.5" y="9" width="17" height="11" rx="1.5" /><path d="M12 9v11M3.5 13h17" /><path d="M12 9c-1.5-3-5-3.5-5-1.2C7 9 12 9 12 9zm0 0c1.5-3 5-3.5 5-1.2C17 9 12 9 12 9z" /></>,
  at: <><circle cx="12" cy="12" r="3.5" /><path d="M15.5 12v1.5a2.5 2.5 0 005 0V12a8.5 8.5 0 10-3.3 6.7" /></>,
  medal: <><circle cx="12" cy="15" r="5" /><path d="M8.5 11L6 3h4l2 5 2-5h4l-2.5 8" /></>,
  flame: <path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.6 3.8-9.3 2.2 1.4 3.2 3.6 3.2 5.5 1-.7 1.7-2 1.8-3.2 2.3 1.9 4.2 4.3 4.2 7C18.5 18.3 16 21 12 21z" />,
  arrowUp: <><path d="M12 20V5" /><path d="M5.5 11.5L12 5l6.5 6.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  sort: <><path d="M7 4v16M3.5 16.5L7 20l3.5-3.5" /><path d="M17 20V4M13.5 7.5L17 4l3.5 3.5" /></>,
  filter: <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />,
  volume: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.5a4 4 0 018 0V10" /></>,
  expand: <><path d="M14 4h6v6M10 20H4v-6" /><path d="M20 4l-7 7M4 20l7-7" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 000 17c1.4 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.8-2.8h1.7a3.5 3.5 0 003.5-3.5c0-4.7-3.8-8.5-8.5-8.5z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10.5" cy="7.5" r="1.2" /><circle cx="15" cy="8" r="1.2" /></>,
};

export function DashIcon({ name, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Card({
  title, subtitle, action, children, className = '', bodyClass = 'p-4',
}) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-[#121418] ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13.5px] font-semibold text-zinc-100 4xl:text-[16px]">{title}</h3>
            {subtitle && <p className="text-[11.5px] text-zinc-500 4xl:text-[13px]">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const TONES = {
  zinc: 'bg-white/[0.06] text-zinc-300 ring-white/10',
  green: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25',
  red: 'bg-red-500/10 text-red-300 ring-red-400/25',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-400/25',
  blue: 'bg-sky-500/10 text-sky-300 ring-sky-400/25',
  violet: 'bg-violet-500/10 text-violet-300 ring-violet-400/25',
};

export function Badge({ tone = 'zinc', dot = false, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset 4xl:text-[12.5px] ${TONES[tone] || TONES.zinc}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatCard({
  label, value, hint, icon, accent = '#d4a52c',
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#121418] p-4 transition-colors hover:border-white/[0.13] 4xl:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-medium leading-snug text-zinc-400 4xl:text-[13.5px]">{label}</p>
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1f`, color: accent }}>
            <DashIcon name={icon} />
          </span>
        )}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-zinc-50 tnum 4xl:text-[34px]">{value}</p>
      {hint && <p className="mt-1.5 text-[11.5px] leading-snug text-zinc-500 4xl:text-[13px]">{hint}</p>}
    </div>
  );
}

// A column chart built from plain elements, so it scales with its card.
// data: [{ key, label, total, parts: { [series]: n } }]
export function BarChart({
  data, colors, height = 170, labelEvery = 5, emptyText,
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const empty = data.every((d) => d.total === 0);
  return (
    <div>
      <div className="relative" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-white/[0.05]" style={{ bottom: `${f * 100}%` }} />
        ))}
        <span className="absolute -top-1 right-0 text-[10px] text-zinc-600 tnum">{max}</span>
        {empty && <p className="absolute inset-0 flex items-center justify-center text-[12px] text-zinc-500">{emptyText}</p>}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {data.map((d) => (
            <div
              key={d.key}
              className="group relative flex h-full flex-1 flex-col-reverse"
              title={`${d.label}: ${d.total}`}
            >
              {Object.entries(d.parts || {}).map(([series, n]) => (
                <div
                  key={series}
                  className="w-full first:rounded-b-[2px] last:rounded-t-[3px] transition-opacity group-hover:opacity-80"
                  style={{ height: `${(n / max) * 100}%`, backgroundColor: colors[series] || '#71717a' }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-[3px]">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 truncate text-center text-[10px] text-zinc-600">
            {i % labelEvery === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

// items: [{ key, label, value, color, sub }]
export function HBarList({ items, emptyText }) {
  const total = items.reduce((n, i) => n + i.value, 0);
  if (!items.length || total === 0) return <p className="py-6 text-center text-[12px] text-zinc-500">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline gap-2 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate text-zinc-200">{item.label}</span>
            <span className="text-zinc-400 tnum">{item.value}</span>
            <span className="w-10 text-right text-[11px] text-zinc-500 tnum">{Math.round((item.value / total) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color || '#d4a52c' }} />
          </div>
          {item.sub && <p className="mt-1 text-[11px] text-zinc-500">{item.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

// columns: [{ key, label, align, render }]
export function Table({
  columns, rows, rowKey, onRowClick, empty,
}) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-left text-[12.5px] 4xl:text-[14.5px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-[10.5px] uppercase tracking-wider text-zinc-500 4xl:text-[12px]">
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-zinc-500">{empty}</td></tr>
          ) : rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-white/[0.04] last:border-0 ${onRowClick ? 'cursor-pointer transition-colors hover:bg-white/[0.035]' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`whitespace-nowrap px-3 py-2.5 text-zinc-300 4xl:px-4 4xl:py-3 ${c.align === 'right' ? 'text-right tnum' : ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Dialog({
  title, children, footer, onClose, width = 'max-w-md',
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full ${width} animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-[#16181d] shadow-deep`}>
        <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
          <h2 className="flex-1 text-[15px] font-semibold text-zinc-100 4xl:text-[18px]">{title}</h2>
          <IconButton icon="close" onClick={onClose} label="Close" />
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-zinc-300 4xl:text-[15px]">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] bg-black/20 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({
  title, subtitle, onClose, children, footer,
}) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/55 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <aside className="flex h-full w-full max-w-2xl animate-slide-up flex-col 4xl:max-w-4xl border-l border-white/[0.08] bg-[#101216] shadow-deep sm:animate-fade-in">
        <header className="flex items-start gap-3 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold text-zinc-50">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-zinc-500">{subtitle}</p>}
          </div>
          <IconButton icon="close" onClick={onClose} label="Close" />
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap gap-2 border-t border-white/[0.07] bg-black/25 px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

const BUTTON_TONES = {
  default: 'border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:border-white/20',
  primary: 'bg-gradient-to-b from-brass-light to-brass text-ink hover:from-brass-soft hover:to-brass-light',
  danger: 'border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20',
  success: 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
  subtle: 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100',
};

export function Button({
  tone = 'default', icon, children, className = '', ...props
}) {
  return (
    <button
      type="button"
      className={`inline-flex select-none items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-all 4xl:px-4 4xl:py-2.5 4xl:text-[14.5px] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${BUTTON_TONES[tone]} ${className}`}
      {...props}
    >
      {icon && <DashIcon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function IconButton({ icon, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100">
      <DashIcon name={icon} className="h-4 w-4" />
    </button>
  );
}

export function Spinner({ block = false }) {
  const spinner = <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-brass-light" />;
  return block ? <div className="flex justify-center py-16">{spinner}</div> : spinner;
}

export function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-0.5 break-words text-[13px] text-zinc-200">{children}</div>
    </div>
  );
}

export function Segmented({ value, onChange, options, disabled }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-40 4xl:px-3 4xl:py-1.5 4xl:text-[14px] ${
            value === opt.value ? 'bg-white/[0.1] text-zinc-50 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label, copiedLabel }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" onClick={copy} title={label} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100">
      <DashIcon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />
      {copied ? copiedLabel : label}
    </button>
  );
}

export function ErrorState({ error, onRetry, retryLabel }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-400/20 bg-red-500/5 px-4 py-10 text-center">
      <p className="text-[13px] text-red-300">{error?.message || String(error)}</p>
      {onRetry && <Button icon="refresh" onClick={onRetry}>{retryLabel}</Button>}
    </div>
  );
}

export function ProgressBar({ value, max = 1, color = '#d4a52c' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
