// settings.js
// Platform-wide switches the Creator controls from the panel:
//
//   economy.*   what games pay (participation, places, team wins, first win
//               of the day, streaks, achievements), the daily cap, the
//               minimum game length and the weekend festival multiplier
//   platform.*  whether new accounts can register, whether the shop sells,
//               and an announcement shown to everybody
//
// The economy numbers live in economy/rules.js; saving here writes them
// into that module (in place), so the reward code reads the new values on
// its very next payout. Nothing saved means the numbers the code ships.

const creatorDb = require('../db/creator');
const rules = require('../economy/rules');
const { AccessError } = require('./access');

const DEFAULTS = {
  economy: {
    participation: rules.MATCH_REWARDS.participation,
    place1: rules.MATCH_REWARDS.place[1],
    place2: rules.MATCH_REWARDS.place[2],
    place3: rules.MATCH_REWARDS.place[3],
    teamWin: rules.MATCH_REWARDS.teamWin,
    firstWinOfDay: rules.MATCH_REWARDS.firstWinOfDay,
    dailyRewardedMatches: rules.DAILY_REWARDED_MATCHES,
    minMatchSeconds: Math.round(rules.MIN_MATCH_MS / 1000),
    festivalMultiplier: (rules.EVENTS.find((e) => e.id === 'weekend_festival') || {}).multiplier || 1.25,
    streak3: (rules.STREAK_REWARDS.find((s) => s.streak === 3) || {}).crowns || 0,
    streak5: (rules.STREAK_REWARDS.find((s) => s.streak === 5) || {}).crowns || 0,
    streak10: (rules.STREAK_REWARDS.find((s) => s.streak === 10) || {}).crowns || 0,
    achievements: { ...rules.ACHIEVEMENT_REWARDS },
  },
  platform: {
    registrationOpen: true,
    shopOpen: true,
    announcement: { en: '', ru: '' },
    announcementTone: 'info',
  },
};

let current = JSON.parse(JSON.stringify(DEFAULTS));

function int(value, min, max, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new AccessError(`${name} must be a whole number from ${min} to ${max}.`, 'BAD_SETTING');
  return n;
}

function validate(input) {
  const src = input && typeof input === 'object' ? input : {};
  const e = { ...DEFAULTS.economy, ...(src.economy || {}) };
  const p = { ...DEFAULTS.platform, ...(src.platform || {}) };
  const multiplier = Number(e.festivalMultiplier);
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5) {
    throw new AccessError('The festival multiplier must be between 1 and 5.', 'BAD_SETTING');
  }
  const achievements = {};
  Object.keys(DEFAULTS.economy.achievements).forEach((id) => {
    achievements[id] = int(e.achievements?.[id] ?? DEFAULTS.economy.achievements[id], 0, 100000, `Achievement ${id}`);
  });
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    economy: {
      participation: int(e.participation, 0, 100000, 'Participation reward'),
      place1: int(e.place1, 0, 100000, '1st place reward'),
      place2: int(e.place2, 0, 100000, '2nd place reward'),
      place3: int(e.place3, 0, 100000, '3rd place reward'),
      teamWin: int(e.teamWin, 0, 100000, 'Team win reward'),
      firstWinOfDay: int(e.firstWinOfDay, 0, 100000, 'First win of the day'),
      dailyRewardedMatches: int(e.dailyRewardedMatches, 0, 1000, 'Rewarded games per day'),
      minMatchSeconds: int(e.minMatchSeconds, 0, 3600, 'Minimum game length'),
      festivalMultiplier: Math.round(multiplier * 100) / 100,
      streak3: int(e.streak3, 0, 100000, '3-win streak reward'),
      streak5: int(e.streak5, 0, 100000, '5-win streak reward'),
      streak10: int(e.streak10, 0, 100000, '10-win streak reward'),
      achievements,
    },
    platform: {
      registrationOpen: p.registrationOpen !== false,
      shopOpen: p.shopOpen !== false,
      announcement: { en: text(p.announcement?.en, 500), ru: text(p.announcement?.ru, 500) },
      announcementTone: ['info', 'warning', 'success'].includes(p.announcementTone) ? p.announcementTone : 'info',
    },
  };
}

// Writes the economy numbers into economy/rules.js.
function applyEconomy(e) {
  rules.MATCH_REWARDS.participation = e.participation;
  rules.MATCH_REWARDS.place[1] = e.place1;
  rules.MATCH_REWARDS.place[2] = e.place2;
  rules.MATCH_REWARDS.place[3] = e.place3;
  rules.MATCH_REWARDS.teamWin = e.teamWin;
  rules.MATCH_REWARDS.firstWinOfDay = e.firstWinOfDay;
  rules.DAILY_REWARDED_MATCHES = e.dailyRewardedMatches;
  // The environment variable still wins for tests that shorten games.
  if (!process.env.ECONOMY_MIN_MATCH_MS) rules.MIN_MATCH_MS = e.minMatchSeconds * 1000;
  rules.EVENTS.forEach((ev) => { if (ev.id === 'weekend_festival') ev.multiplier = e.festivalMultiplier; });
  rules.STREAK_REWARDS.forEach((s) => {
    const value = e[`streak${s.streak}`];
    if (Number.isInteger(value)) s.crowns = value;
  });
  Object.assign(rules.ACHIEVEMENT_REWARDS, e.achievements);
}

function load() {
  let stored = {};
  try {
    stored = creatorDb.getSettings();
  } catch {
    stored = {};
  }
  try {
    current = validate({ economy: stored.economy, platform: stored.platform });
  } catch {
    current = JSON.parse(JSON.stringify(DEFAULTS));
  }
  if (stored.economy) applyEconomy(current.economy);
  return current;
}

function get() {
  return current;
}

function save(input, by) {
  const next = validate(input);
  creatorDb.setSetting('economy', next.economy, by);
  creatorDb.setSetting('platform', next.platform, by);
  current = next;
  applyEconomy(next.economy);
  return current;
}

function reset(section, by) {
  const next = JSON.parse(JSON.stringify(current));
  next[section] = JSON.parse(JSON.stringify(DEFAULTS[section]));
  return save(next, by);
}

function publicSettings() {
  return {
    registrationOpen: current.platform.registrationOpen,
    shopOpen: current.platform.shopOpen,
    announcement: current.platform.announcement,
    announcementTone: current.platform.announcementTone,
  };
}

module.exports = {
  DEFAULTS, load, get, save, reset, validate, publicSettings,
};
