// achievements.js
// Achievements are derived from the match history, so they appear for
// games played before the achievement existed too. Shared by the profile
// endpoints and by the reward system, which pays each one out once.

function achievementsFor(stats, citadels) {
  const games = Object.keys(stats.byGame);
  const list = [
    { id: 'FIRST_GAME', current: stats.played, target: 1 },
    { id: 'FIRST_WIN', current: stats.wins, target: 1 },
    { id: 'HOST', current: stats.created, target: 5 },
    { id: 'VETERAN', current: stats.played, target: 25 },
    { id: 'CHAMPION', current: stats.wins, target: 10 },
    { id: 'ALL_GAMES', current: ['monopoly', 'mafia', 'citadels', 'bunker', 'catan', 'cosmic'].filter((g) => games.includes(g)).length, target: 3 },
    { id: 'CITADEL_LORD', current: citadels.wins, target: 1 },
    { id: 'MASTER_BUILDER', current: Math.round(citadels.avgBuildings * 10) / 10, target: 7 },
  ];
  return list.map((a) => ({ ...a, unlocked: a.current >= a.target }));
}

module.exports = { achievementsFor };
