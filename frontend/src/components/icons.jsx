// icons.jsx
// One shared, visually consistent icon set. Every icon is a 24x24 stroke
// drawing that inherits currentColor, so any of them can be dropped into
// a tile, a button, or a log line and pick up the right color/size from
// its context.

// width/height default to 1em so an icon always has a sane size even if
// a caller forgets to size it; any className/style passed in overrides
// them, since the spread below comes last.
const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', width: '1em', height: '1em',
};

export const Icon = {
  go: (p) => (
    <svg {...base} {...p}><path d="M4 12h13M12 6l6 6-6 6" /><path d="M20 5v14" strokeWidth="2.4" /></svg>
  ),
  jail: (p) => (
    <svg {...base} {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M9 4v16M15 4v16" /></svg>
  ),
  parking: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M10 16.5V7.5h3.2a2.7 2.7 0 010 5.4H10" /></svg>
  ),
  police: (p) => (
    <svg {...base} {...p}><path d="M12 3l8 3v5.5c0 4.4-3.2 8-8 9.5-4.8-1.5-8-5.1-8-9.5V6l8-3z" /><path d="M9.5 12l1.8 1.8 3.4-3.6" /></svg>
  ),
  chance: (p) => (
    <svg {...base} {...p}><path d="M9.2 9a2.9 2.9 0 115.5 1.3c-.6 1-2.7 1.4-2.7 3.2" /><circle cx="12" cy="17.6" r="1.05" fill="currentColor" stroke="none" /></svg>
  ),
  chest: (p) => (
    <svg {...base} {...p}><rect x="3" y="9.5" width="18" height="10.5" rx="1.5" /><path d="M3 9.5l2.2-4.5h13.6L21 9.5M12 9.5v10.5" /><path d="M9.5 13.5h5" /></svg>
  ),
  tax: (p) => (
    <svg {...base} {...p}><path d="M12 3.5v17" /><path d="M16.5 7.5H10a2.6 2.6 0 000 5.2h4a2.6 2.6 0 010 5.2H7" /></svg>
  ),
  train: (p) => (
    <svg {...base} {...p}><rect x="5" y="3.5" width="14" height="12" rx="3" /><path d="M5 10h14M8 20l-2 1.5M16 20l2 1.5M7.5 15.5h9" /><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" /></svg>
  ),
  bolt: (p) => (
    <svg {...base} {...p}><path d="M13.5 2.5L4.5 13.5h6l-1 8 9-11h-6l1-8z" /></svg>
  ),
  droplet: (p) => (
    <svg {...base} {...p}><path d="M12 3c4 5.4 6.5 8.6 6.5 11.6a6.5 6.5 0 01-13 0C5.5 11.6 8 8.4 12 3z" /></svg>
  ),
  home: (p) => (
    <svg {...base} {...p}><path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z" /></svg>
  ),
  hotel: (p) => (
    <svg {...base} {...p}><path d="M4 20V7l8-4 8 4v13" /><path d="M9 20v-4.5h6V20M8 10h2M14 10h2" /></svg>
  ),
  cash: (p) => (
    <svg {...base} {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></svg>
  ),
  trade: (p) => (
    <svg {...base} {...p}><path d="M7 8H20l-3.2-3.2M17 16H4l3.2 3.2" /></svg>
  ),
  dice: (p) => (
    <svg {...base} {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></svg>
  ),
  check: (p) => (
    <svg {...base} {...p}><path d="M4.5 12.5l5 5 10-11" /></svg>
  ),
  close: (p) => (
    <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  plus: (p) => (
    <svg {...base} {...p} strokeWidth="2.2"><path d="M12 5.5v13M5.5 12h13" /></svg>
  ),
  minus: (p) => (
    <svg {...base} {...p} strokeWidth="2.2"><path d="M5.5 12h13" /></svg>
  ),
  fit: (p) => (
    <svg {...base} {...p}><path d="M4 9V5.5a1.5 1.5 0 011.5-1.5H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15" /></svg>
  ),
  target: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.6" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" /></svg>
  ),
  chevronDown: (p) => (
    <svg {...base} {...p}><path d="M6 9.5l6 6 6-6" /></svg>
  ),
  chevronUp: (p) => (
    <svg {...base} {...p}><path d="M6 14.5l6-6 6 6" /></svg>
  ),
  chevronRight: (p) => (
    <svg {...base} {...p}><path d="M9.5 6l6 6-6 6" /></svg>
  ),
  search: (p) => (
    <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
  ),
  users: (p) => (
    <svg {...base} {...p}><circle cx="9" cy="8" r="3.4" /><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4" /><path d="M16 5.2a3.4 3.4 0 010 6.6M17.5 14.9c2.1.6 3.5 2.3 3.5 5.1" /></svg>
  ),
  chat: (p) => (
    <svg {...base} {...p}><path d="M20.5 11.8c0 4-3.8 7.2-8.5 7.2a10 10 0 01-2.6-.3L4 21l1.2-3.6A6.9 6.9 0 013.5 11.8C3.5 7.9 7.3 4.7 12 4.7s8.5 3.2 8.5 7.1z" /></svg>
  ),
  bank: (p) => (
    <svg {...base} {...p}><path d="M3.5 9.5L12 4l8.5 5.5M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20.5h18" /></svg>
  ),
  lock: (p) => (
    <svg {...base} {...p}><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.5a4 4 0 018 0V10" /></svg>
  ),
  crown: (p) => (
    <svg {...base} {...p}><path d="M4 18h16M4.5 7.5l3.5 4 4-6 4 6 3.5-4L18 18H6L4.5 7.5z" /></svg>
  ),
  scroll: (p) => (
    <svg {...base} {...p}><path d="M6 4h11a2 2 0 012 2v12a2 2 0 01-2 2H6" /><path d="M6 4a2 2 0 00-2 2v1.5h4M9 9h7M9 13h7M9 17h4" /></svg>
  ),
  warning: (p) => (
    <svg {...base} {...p}><path d="M12 4.5L21 19.5H3L12 4.5z" /><path d="M12 10v4" /><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" /></svg>
  ),
  eye: (p) => (
    <svg {...base} {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
  ),
  settings: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="3.1" /><path d="M12 2.6l1.5 2.6 3-.3.6 3 2.6 1.5-1.3 2.6 1.3 2.6-2.6 1.5-.6 3-3-.3L12 21.4l-1.5-2.6-3 .3-.6-3L4.3 14.6l1.3-2.6-1.3-2.6 2.6-1.5.6-3 3 .3L12 2.6z" /></svg>
  ),
  refresh: (p) => (
    <svg {...base} {...p}><path d="M20 11.5A8 8 0 006.3 6.3L4 8.5M4 12.5a8 8 0 0013.7 5.2l2.3-2.2" /><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5" /></svg>
  ),
  flag: (p) => (
    <svg {...base} {...p}><path d="M6 21V4M6 4.5h11l-2 3.5 2 3.5H6" /></svg>
  ),
};

export default Icon;
