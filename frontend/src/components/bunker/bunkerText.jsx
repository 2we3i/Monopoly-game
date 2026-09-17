// bunkerText.jsx
// Turning Bunker ids into words and pictures: card names, ages and
// durations with correct plurals, the event log, and the small icons for
// each characteristic.

// The order a character sheet is drawn in. A table plays with a SUBSET of
// this - `state.categories` says which - so every screen takes the state's
// list and sorts it by this one rather than assuming a fixed seven.
export const CHAR_ORDER = [
  'profession', 'biology', 'health', 'condition', 'hobby', 'skill', 'knowledge',
  'ability', 'trait', 'phobia', 'past', 'extra',
  'baggage', 'baggage2', 'baggage3', 'baggage4', 'secret', 'secret2',
];

// The characteristics a given game is playing with, in sheet order.
export function charOrder(state) {
  const inPlay = state?.categories;
  // A game from before any of the extra rows existed dealt the original
  // seven; its payload says so, and this is only the fallback for a
  // payload that says nothing at all.
  if (!Array.isArray(inPlay) || !inPlay.length) {
    return ['profession', 'biology', 'health', 'hobby', 'skill', 'trait', 'extra'];
  }
  return CHAR_ORDER.filter((k) => inPlay.includes(k));
}

export const RARITY_TONE = {
  common: 'text-parch/55 border-white/10 bg-white/[0.04]',
  uncommon: 'text-sky-200 border-sky-400/25 bg-sky-400/[0.07]',
  rare: 'text-violet-200 border-violet-400/30 bg-violet-400/[0.08]',
  legendary: 'text-amber-200 border-amber-400/35 bg-amber-400/[0.09]',
};

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

// A characteristic key and the deck it is dealt from are not the same
// thing: all four baggage slots share one deck, and both secrets share
// another.
export function deckOf(key) {
  if (key.startsWith('baggage')) return 'baggage';
  if (key.startsWith('secret')) return 'secret';
  return key;
}

export function cardEntry(config, key, card) {
  if (!card || !card.id) return null;
  return config?.cards?.[deckOf(key)]?.find((c) => c.id === card.id) || null;
}

export function cardText(config, key, card, language, t) {
  if (!card) return '';
  if (key === 'biology') return `${t(`bunker.gender.${card.gender}`)}, ${yearsText(card.age, language)}`;
  const entry = cardEntry(config, key, card);
  return entry ? entry.name[language] || entry.name.en : card.id;
}

// Everything a card carries beyond its name: the picture, the description,
// how rare it is, and the property that has been opened on it (if any).
export function cardDetail(config, key, card, language) {
  const entry = cardEntry(config, key, card);
  if (!entry) return null;
  const prop = card?.property ? config?.hiddenProperties?.[card.property] : null;
  return {
    glyph: entry.glyph || null,
    rarity: entry.rarity || 'common',
    // A card from the ridiculous shelf is marked as such: the joke is
    // meant to be visible, and the argument about whether it is useful
    // anyway is the point.
    absurd: !!entry.absurd,
    description: entry.description ? entry.description[language] || entry.description.en : null,
    hasHidden: !!entry.hasHidden,
    // Present only once the property has actually been turned face up -
    // the server strips it from the payload until then.
    property: prop ? prop.name[language] || prop.name.en : null,
  };
}

export function scenarioName(t, id) {
  return t(`bunker.scenario.${id}`);
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
    case 'FORCED_REVEAL':
      return t('bunker.log.FORCED_REVEAL', {
        number: p.number, name: p.name, key: t(`bunker.char.${p.key}`), value: cardText(config, p.key, p.card, language, t),
      });
    case 'HIDDEN_AGAIN':
      return t('bunker.log.HIDDEN_AGAIN', { number: p.number, name: p.name, key: t(`bunker.char.${p.key}`) });
    case 'PROPERTY_REVEALED':
      return t('bunker.log.PROPERTY_REVEALED', {
        number: p.number,
        name: p.name,
        key: t(`bunker.char.${p.key}`),
        property: config?.hiddenProperties?.[p.property]
          ? (config.hiddenProperties[p.property].name[language] || config.hiddenProperties[p.property].name.en)
          : p.property,
      });
    case 'CARD_PLAYED':
      return t('bunker.log.CARD_PLAYED', { number: p.number, name: p.name, card: t(`bunker.card.${p.cardId}.name`) });
    case 'EVENT':
      return t('bunker.log.EVENT', { event: t(`bunker.event.${p.event}.name`) });
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
  // Knowledge and skills: a hand holding a tool.
  skill: <><path d="M14.5 6.5a3.5 3.5 0 014.9 4.3l-8.6 8.6a2 2 0 01-2.8-2.8l7.6-7.6" /><path d="M4.5 12.5l4 4" /></>,
  // A secret: a sealed envelope.
  secret: <><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M4 7.5l8 6 8-6" /></>,
  // Knowledge: an open book.
  knowledge: <><path d="M12 6.5c-2-1.4-4-2-6.5-2v12c2.5 0 4.5.6 6.5 2 2-1.4 4-2 6.5-2v-12c-2.5 0-4.5.6-6.5 2z" /><path d="M12 6.5v12" /></>,
  // A condition or limitation: a body with a band across it.
  condition: <><circle cx="12" cy="6" r="2.6" /><path d="M7 20v-4.5a5 5 0 0110 0V20" /><path d="M5.5 12.5h13" /></>,
  // A past: an hourglass.
  past: <><path d="M7 3.5h10M7 20.5h10" /><path d="M8 3.5c0 4 4 5.2 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5.2-4 8.5s4 4.5 4 8.5" /></>,
  // A fear: an eye that has seen something.
  phobia: <><path d="M12 5.5c4.2 0 7.3 3.2 8.5 6.5-1.2 3.3-4.3 6.5-8.5 6.5S4.7 15.3 3.5 12C4.7 8.7 7.8 5.5 12 5.5z" /><circle cx="12" cy="12" r="2.4" /></>,
  // A special ability: a spark.
  ability: <><path d="M13 3.5L6 13h5l-1 7.5L18 11h-5z" /></>,
};
// The extra slots reuse their group's icon.
['baggage2', 'baggage3', 'baggage4'].forEach((k) => { ICON_PATHS[k] = ICON_PATHS.baggage; });
ICON_PATHS.secret2 = ICON_PATHS.secret;

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
