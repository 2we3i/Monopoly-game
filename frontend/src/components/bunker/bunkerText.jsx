// bunkerText.jsx
// Turning Bunker ids into words and pictures: card names, ages and
// durations with correct plurals, the event log, and the small icons for
// each characteristic.

export const CHAR_ORDER = ['profession', 'biology', 'health', 'hobby', 'baggage', 'trait', 'extra'];

function ruPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function yearsText(n, language) {
  if (language === 'ru') return `${n} ${ruPlural(n, 'год', 'года', 'лет')}`;
  return `${n} y.o.`;
}

export function monthsText(n, language) {
  if (language === 'ru') return `${n} ${ruPlural(n, 'месяц', 'месяца', 'месяцев')}`;
  return `${n} ${n === 1 ? 'month' : 'months'}`;
}

export function votesText(n, language) {
  if (language === 'ru') return `${n} ${ruPlural(n, 'голос', 'голоса', 'голосов')}`;
  return `${n} ${n === 1 ? 'vote' : 'votes'}`;
}

export function cardText(config, key, card, language, t) {
  if (!card) return '';
  if (key === 'biology') return `${t(`bunker.gender.${card.gender}`)}, ${yearsText(card.age, language)}`;
  const entry = config?.cards?.[key]?.find((c) => c.id === card.id);
  return entry ? entry.name[language] || entry.name.en : card.id;
}

export function catastropheOf(config, id, language) {
  const entry = config?.catastrophes?.find((c) => c.id === id);
  if (!entry) return null;
  return {
    name: entry.name[language] || entry.name.en,
    text: entry.text[language] || entry.text.en,
    months: entry.months,
  };
}

export function roomName(config, id, language) {
  const entry = config?.rooms?.find((r) => r.id === id);
  return entry ? entry.name[language] || entry.name.en : id;
}

export function formatBunkerLog(entry, { t, config, language }) {
  const p = entry.params || {};
  switch (entry.type) {
    case 'GAME_STARTED':
      return t('bunker.log.GAME_STARTED', { catastrophe: catastropheOf(config, p.catastrophe, language)?.name || '', seats: p.seats, players: p.players });
    case 'REVEALED':
    case 'AUTO_REVEALED':
      return t(`bunker.log.${entry.type}`, {
        number: p.number, name: p.name, key: t(`bunker.char.${p.key}`), value: cardText(config, p.key, p.card, language, t),
      });
    case 'EXCLUDED':
      return t('bunker.log.EXCLUDED', { number: p.number, name: p.name, votes: votesText(p.votes, language) });
    case 'REVOTE':
      return t('bunker.log.REVOTE', { names: (p.names || []).join(', ') });
    case 'NO_EXCLUSION':
      return t(`bunker.log.NO_EXCLUSION.${p.reason}`);
    case 'GAME_OVER':
      return t('bunker.log.GAME_OVER', { names: (p.names || []).join(', ') });
    default:
      return t(`bunker.log.${entry.type}`, p);
  }
}

const ICON_PATHS = {
  profession: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5M3.5 12.5h17" /></>,
  biology: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20.5c.8-4 3.6-6.5 7-6.5s6.2 2.5 7 6.5" /></>,
  health: <><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z" /><path d="M7.5 12h2.5l1.2-2.2 1.8 4.2 1.2-2h2.3" /></>,
  hobby: <><path d="M5 7h4a2 2 0 104 0h4v4a2 2 0 100 4v4h-4a2 2 0 10-4 0H5v-4a2 2 0 100-4z" /></>,
  baggage: <><rect x="5" y="8" width="14" height="12" rx="2.5" /><path d="M9 8V6a3 3 0 016 0v2M5 13h14" /></>,
  trait: <><path d="M4 7.5C4 5.6 7.6 4 12 4s8 1.6 8 3.5V12c0 4.4-3.6 8-8 8s-8-3.6-8-8z" /><path d="M8.5 10.5h.01M15.5 10.5h.01M9 15c1.8 1.2 4.2 1.2 6 0" /></>,
  extra: <><path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.9l-5 2.8 1.2-5.6L4 9.3l5.6-.6z" /></>,
};

export function CharIcon({ name, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

// The main menu picture: a sealed blast door under a single warning lamp.
export function BunkerArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="bunker-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2d31" />
          <stop offset="100%" stopColor="#0f1012" />
        </linearGradient>
        <radialGradient id="bunker-door" cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#5b6168" />
          <stop offset="100%" stopColor="#272a2e" />
        </radialGradient>
        <radialGradient id="bunker-lamp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" rx="6" fill="url(#bunker-wall)" />
      {[14, 30, 46, 62].map((y) => <rect key={y} x="0" y={y} width="120" height="0.7" fill="#000" opacity="0.35" />)}
      <circle cx="60" cy="9" r="9" fill="url(#bunker-lamp)" />
      <circle cx="60" cy="9" r="2.2" fill="#fdba74" />
      <circle cx="60" cy="47" r="25" fill="#16181b" />
      <circle cx="60" cy="47" r="21.5" fill="url(#bunker-door)" stroke="#0b0c0e" strokeWidth="1.5" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={i} cx={60 + Math.cos(a) * 18} cy={47 + Math.sin(a) * 18} r="1.3" fill="#1d1f22" />;
      })}
      <circle cx="60" cy="47" r="6.5" fill="none" stroke="#1d1f22" strokeWidth="2.2" />
      <path d="M60 36.5v21M49.5 47h21" stroke="#1d1f22" strokeWidth="2.2" strokeLinecap="round" />
      <g transform="translate(96 60)" opacity="0.75">
        <circle r="8" fill="#e5a50a" />
        <circle r="1.8" fill="#16181b" />
        {[0, 120, 240].map((deg) => (
          <path key={deg} d="M0 -2.6 L-3.2 -7.2 A7.6 7.6 0 0 1 3.2 -7.2 Z" fill="#16181b" transform={`rotate(${deg})`} />
        ))}
      </g>
    </svg>
  );
}
