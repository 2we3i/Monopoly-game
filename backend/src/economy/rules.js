// rules.js
// The economy's numbers in one place: what a finished match pays, what
// achievements and win streaks pay, which special events are running and
// how the season leaderboard scores a result.
//
// Crowns are only ever earned by playing. Rewards are deliberately small
// next to shop prices (a common item is a couple of games, a legendary
// one is weeks of play) and several guards stop them being farmed: a
// match must last a minimum time, only a limited number of matches a day
// pay out, and a two-player game pays less than a full table.

const MIN_MATCH_MS = Number.isFinite(Number(process.env.ECONOMY_MIN_MATCH_MS))
  ? Number(process.env.ECONOMY_MIN_MATCH_MS)
  : 60 * 1000;

const DAILY_REWARDED_MATCHES = 15;

const MATCH_REWARDS = {
  participation: 10,
  // Ranked games (Monopoly, Citadels) pay by final place.
  place: { 1: 50, 2: 25, 3: 12 },
  // Team games (Mafia) pay the winning side.
  teamWin: 40,
  firstWinOfDay: 25,
};

// A small table is easier to win, so it pays a share of the full reward.
function tableMultiplier(playerCount) {
  if (playerCount <= 2) return 0.6;
  if (playerCount === 3) return 0.8;
  return 1;
}

// A place only counts as a podium finish when enough players were beaten
// to earn it: second place needs three players, third needs four.
function podiumPlace(place, playerCount) {
  if (!Number.isInteger(place) || place < 1) return null;
  if (place === 1) return 1;
  if (place === 2 && playerCount >= 3) return 2;
  if (place === 3 && playerCount >= 4) return 3;
  return null;
}

const STREAK_REWARDS = [
  { streak: 3, crowns: 30 },
  { streak: 5, crowns: 75 },
  { streak: 10, crowns: 200 },
];

const ACHIEVEMENT_REWARDS = {
  FIRST_GAME: 25,
  FIRST_WIN: 40,
  HOST: 50,
  VETERAN: 200,
  CHAMPION: 250,
  ALL_GAMES: 100,
  CITADEL_LORD: 75,
  MASTER_BUILDER: 150,
};

// Special events. The weekend festival runs every Saturday and Sunday
// (UTC) and multiplies match rewards; winning during it earns a badge.
const EVENTS = [
  {
    id: 'weekend_festival',
    multiplier: 1.25,
    isActive: (date) => [0, 6].includes(date.getUTCDay()),
  },
];

function activeEvents(now = Date.now()) {
  const date = new Date(now);
  return EVENTS.filter((e) => e.isActive(date)).map((e) => ({ id: e.id, multiplier: e.multiplier }));
}

function nextEventStart(now = Date.now()) {
  const d = new Date(now);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return null;
  const daysUntilSaturday = 6 - day;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilSaturday);
}

// Meteorological seasons, for the seasonal badges.
function seasonOf(ts) {
  const m = new Date(ts).getUTCMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

// The start of the season (as a timestamp) that `ts` falls in.
function seasonStart(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (m >= 2 && m <= 4) return Date.UTC(y, 2, 1);
  if (m >= 5 && m <= 7) return Date.UTC(y, 5, 1);
  if (m >= 8 && m <= 10) return Date.UTC(y, 8, 1);
  return m === 11 ? Date.UTC(y, 11, 1) : Date.UTC(y - 1, 11, 1);
}

// The leaderboard season is a calendar month.
function leaderboardSeason(now = Date.now()) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const id = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { id, start, end };
}

// Leaderboard points for one finished seat.
function seasonPoints({ result, place, playerCount }) {
  const podium = podiumPlace(place, playerCount);
  if (podium === 1) return 10;
  if (podium === 2) return 6;
  if (podium === 3) return 3;
  if (place == null && result === 'win') return 8;
  return 1;
}

const LEADERBOARD_MIN_MATCHES = 5;

function utcDay(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

module.exports = {
  MIN_MATCH_MS,
  DAILY_REWARDED_MATCHES,
  MATCH_REWARDS,
  STREAK_REWARDS,
  ACHIEVEMENT_REWARDS,
  LEADERBOARD_MIN_MATCHES,
  tableMultiplier,
  podiumPlace,
  activeEvents,
  nextEventStart,
  seasonOf,
  seasonStart,
  leaderboardSeason,
  seasonPoints,
  utcDay,
};
