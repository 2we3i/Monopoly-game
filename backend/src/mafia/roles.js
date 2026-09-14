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

// Night actions run in a fixed order because they interact: the doctor's
// save has to be known before a kill is resolved, and an investigation
// must see the board as it was before anyone died.
function nightActionOrder(settings) {
  const configured = settings?.night?.actionOrder;
  const known = ROLE_IDS.filter((id) => roleDef(id).actsAtNight);
  if (!Array.isArray(configured) || configured.length === 0) {
    return known.sort((a, b) => roleDef(a).order - roleDef(b).order);
  }
  // Anything the host ordered explicitly comes first, in their order;
  // any role they did not mention keeps its default position after it,
  // so a partial or stale list can never drop a role from the night.
  const ordered = configured.filter((id) => known.includes(id));
  const rest = known.filter((id) => !ordered.includes(id)).sort((a, b) => roleDef(a).order - roleDef(b).order);
  return [...ordered, ...rest];
}

module.exports = { ROLES, ROLE_IDS, TEAMS, CONFIGURABLE_ROLES, roleDef, isMafiaRole, nightActionOrder };
