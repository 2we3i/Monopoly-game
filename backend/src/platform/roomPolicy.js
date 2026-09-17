// roomPolicy.js
// Puts the Creator's per-mode limits in front of a live room without
// touching the rules engines: every room object gets thin wrappers around
// addPlayer (the player limit and the guest switch), its start method (the
// minimum) and updateSettings (locked settings). The engines keep checking
// their own hard limits underneath.

const modeConfig = require('./modeConfig');

function seatedCount(room) {
  const players = room.state ? room.state.players : room.players;
  if (!Array.isArray(players)) return 0;
  if (typeof room.activePlayers === 'function' && !room.state) {
    // Party rooms: a big screen that only shows the game is not a player.
    return room.activePlayers().length;
  }
  return players.filter((p) => !p.left).length;
}

function findSeat(room, playerId) {
  if (room.state && typeof room.state.getPlayer === 'function') return room.state.getPlayer(playerId);
  return typeof room.getPlayer === 'function' ? room.getPlayer(playerId) : null;
}

// modeIdOf(room) -> the room's mode id (a Monopoly room's board decides it).
function apply(room, modeIdOf) {
  if (!room || room.__policy) return room;
  Object.defineProperty(room, '__policy', { value: true, enumerable: false });

  const addPlayer = room.addPlayer.bind(room);
  room.addPlayer = (args = {}) => {
    const existing = findSeat(room, args.playerId);
    const screenOnly = args.device === 'screen' && typeof room.screenPlaysByDefault === 'function'
      && !room.screenPlaysByDefault(seatedCount(room) === 0);
    if (!existing && !screenOnly) modeConfig.assertCanSeat(modeIdOf(room), seatedCount(room), args.accountId || null);
    return addPlayer(args);
  };

  const startName = typeof room.startGame === 'function' ? 'startGame' : 'start';
  if (typeof room[startName] === 'function') {
    const start = room[startName].bind(room);
    room[startName] = (...args) => {
      modeConfig.assertCanStart(modeIdOf(room), seatedCount(room));
      return start(...args);
    };
  }

  if (typeof room.updateSettings === 'function') {
    const updateSettings = room.updateSettings.bind(room);
    room.updateSettings = (playerId, patch, ...rest) => updateSettings(playerId, modeConfig.applyLocked(modeIdOf(room), patch), ...rest);
  }
  return room;
}

module.exports = { apply, seatedCount };
