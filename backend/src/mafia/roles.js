// roles.js
// Every role the Mafia mode knows about, in one table.
//
// A role is data, not code: which team it wins with, whether it acts at
// night, in what order, and whether its holders recognise each other.
// The engine reads this table rather than branching on role names, so a
// new role is added here and picked up by role assignment, the night
// loop, the win check and the client payload without touching any of
// them.

const TEAMS = {
  TOWN: 'TOWN',
  MAFIA: 'MAFIA',
  NEUTRAL: 'NEUTRAL',
};

const ROLES = {
  CIVILIAN: {
    id: 'CIVILIAN',
    team: TEAMS.TOWN,
    actsAtNight: false,
    knowsTeammates: false,
    // Civilians are whatever seats are left over once every other role
    // has been handed out, so they have no count of their own.
    fillsRemainder: true,
    order: 99,
  },
  MAFIA: {
    id: 'MAFIA',
    team: TEAMS.MAFIA,
    actsAtNight: true,
    action: 'KILL',
    knowsTeammates: true,
    // The mafia act as one: every member nominates, and the shot is
    // resolved from the group's votes rather than one member's pick.
    collective: true,
    order: 10,
  },
  DON: {
    id: 'DON',
    team: TEAMS.MAFIA,
    actsAtNight: true,
    action: 'KILL',
    knowsTeammates: true,
    collective: true,
    // The Don breaks a tied mafia vote and, unlike the rank and file,
    // can check whether a player is the Sheriff.
    decidesMafiaTie: true,
    secondaryAction: 'CHECK_SHERIFF',
    requiresRole: 'MAFIA',
    order: 9,
  },
  SHERIFF: {
    id: 'SHERIFF',
    team: TEAMS.TOWN,
    actsAtNight: true,
    action: 'INVESTIGATE',
    knowsTeammates: false,
    order: 20,
  },
  DOCTOR: {
    id: 'DOCTOR',
    team: TEAMS.TOWN,
    actsAtNight: true,
    action: 'HEAL',
    knowsTeammates: false,
    order: 30,
  },
  MANIAC: {
    id: 'MANIAC',
    team: TEAMS.NEUTRAL,
    actsAtNight: true,
    action: 'KILL',
    knowsTeammates: false,
    // Wins alone: not with the town, not with the mafia.
    soloWin: true,
    order: 40,
  },
};

const ROLE_IDS = Object.keys(ROLES);

// The roles a host can set a count for, in the order they are offered.
const CONFIGURABLE_ROLES = ['MAFIA', 'DON', 'SHERIFF', 'DOCTOR', 'MANIAC'];

function roleDef(roleId) {
  return ROLES[roleId] || ROLES.CIVILIAN;
}

function isMafiaRole(roleId) {
  return roleDef(roleId).team === TEAMS.MAFIA;
}

// Night actions are resolved in a fixed order in MafiaGame.resolveNight
// because they interact: the doctor's save has to be known before a kill
// lands, and an investigation sees the board as it was before anyone
// died. That order is a rule of the game, not a host setting.

module.exports = { ROLES, ROLE_IDS, TEAMS, CONFIGURABLE_ROLES, roleDef, isMafiaRole };
