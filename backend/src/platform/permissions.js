// permissions.js
// What each role may do. Routes ask can(row, permission) instead of
// comparing role names, so a new power is one line here and the panel can
// show the whole matrix exactly as the server enforces it.
//
//   user     plays games
//   admin    the original moderation panel: statistics, lobbies, blocking
//            users and switching modes on or off
//   creator  the owner of the platform: everything

const accountsDb = require('../db/accounts');

const PERMISSIONS = [
  // what administrators always had
  'overview.view',
  'lobbies.view',
  'lobbies.manage',
  'users.view',
  'users.block',
  'modes.view',
  'modes.status',
  // the Creator's powers
  'users.roles',
  'economy.view',
  'economy.manage',
  'shop.manage',
  'items.grant',
  'games.view',
  'games.manage',
  'modes.edit',
  'modes.test',
  'maps.manage',
  'fields.manage',
  'memes.manage',
  'media.manage',
  'bots.manage',
  'stats.view',
  'logs.view',
  'errors.view',
  'settings.manage',
  'access.manage',
];

const ADMIN_PERMISSIONS = [
  'overview.view', 'lobbies.view', 'lobbies.manage', 'users.view', 'users.block', 'modes.view', 'modes.status',
];

const ROLE_PERMISSIONS = {
  user: [],
  admin: ADMIN_PERMISSIONS,
  creator: PERMISSIONS,
};

function permissionsOf(row) {
  if (!row || accountsDb.isBlocked(row)) return [];
  return ROLE_PERMISSIONS[accountsDb.roleOf(row)] || [];
}

function can(row, permission) {
  return permissionsOf(row).includes(permission);
}

module.exports = {
  PERMISSIONS, ROLE_PERMISSIONS, permissionsOf, can,
};
