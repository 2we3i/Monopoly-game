// time.js
// Short, human time labels for messages and notifications.

const locale = (language) => (language === 'ru' ? 'ru-RU' : 'en-GB');

export function clockTime(ts, language) {
  return new Date(ts).toLocaleTimeString(locale(language), { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(ts, t) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 45) return t('time.justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { n: hours });
  const days = Math.round(hours / 24);
  return t('time.daysAgo', { n: days });
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(ts, language, t) {
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86400000);
  const key = dayKey(ts);
  if (key === today) return t('time.today');
  if (key === yesterday) return t('time.yesterday');
  return new Date(ts).toLocaleDateString(locale(language), { day: 'numeric', month: 'long', year: 'numeric' });
}

// "12:04" today, "Mon" this week, a date otherwise - for conversation lists.
export function listTime(ts, language) {
  if (!ts) return '';
  const age = Date.now() - ts;
  if (dayKey(ts) === dayKey(Date.now())) return clockTime(ts, language);
  if (age < 6 * 86400000) return new Date(ts).toLocaleDateString(locale(language), { weekday: 'short' });
  return new Date(ts).toLocaleDateString(locale(language), { day: '2-digit', month: '2-digit' });
}
