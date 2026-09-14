// api.js
// Small REST surface for health checks and metadata the lobby needs
// before a room exists.

const express = require('express');
const roomManager = require('../game/RoomManager');
const { LAYOUT_OPTIONS } = require('../game/boardLayouts');
const mafiaSettings = require('../mafia/settings');
const { CONFIGURABLE_ROLES, ROLES } = require('../mafia/roles');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    rooms: roomManager.rooms.size + roomManager.mafiaRooms.size,
  });
});

// The catalogue the main menu renders. Games are described by the server
// so a new mode becomes selectable without shipping a new client.
router.get('/games', (req, res) => {
  res.json({
    games: [
      {
        id: 'monopoly',
        minPlayers: 2,
        maxPlayers: 10,
        modes: LAYOUT_OPTIONS,
      },
      {
        id: 'mafia',
        minPlayers: mafiaSettings.MIN_PLAYERS,
        maxPlayers: mafiaSettings.MAX_PLAYERS,
        presets: Object.keys(mafiaSettings.PRESETS),
      },
    ],
  });
});

// Everything the Mafia lobby needs to render its settings screen without
// hard-coding the rules: the shape of a settings object, the presets,
// the configurable roles and the player limits all come from the engine.
router.get('/mafia/config', (req, res) => {
  res.json({
    minPlayers: mafiaSettings.MIN_PLAYERS,
    maxPlayers: mafiaSettings.MAX_PLAYERS,
    defaults: mafiaSettings.DEFAULT_SETTINGS,
    presets: Object.keys(mafiaSettings.PRESETS).map((id) => ({
      id,
      settings: mafiaSettings.presetSettings(id),
    })),
    roles: CONFIGURABLE_ROLES.map((id) => ({ id, team: ROLES[id].team, actsAtNight: !!ROLES[id].actsAtNight })),
    allRoles: Object.values(ROLES).map((r) => ({ id: r.id, team: r.team, actsAtNight: !!r.actsAtNight })),
    modifiers: Object.keys(mafiaSettings.DEFAULT_SETTINGS.fun.modifiers),
  });
});

router.get('/game-modes', (req, res) => {
  res.json({ modes: LAYOUT_OPTIONS });
});

router.get('/rooms/:code/exists', (req, res) => {
  const mafia = roomManager.getMafiaRoom(req.params.code);
  if (mafia) {
    return res.json({
      exists: true,
      gameType: 'mafia',
      phase: mafia.phase,
      playerCount: mafia.players.length,
      full: mafia.players.length >= mafiaSettings.MAX_PLAYERS,
    });
  }
  const mgr = roomManager.getRoom(req.params.code);
  if (!mgr) return res.json({ exists: false });
  res.json({
    exists: true,
    gameType: 'monopoly',
    phase: mgr.state.phase,
    modeId: mgr.state.modeId,
    playerCount: mgr.state.players.length,
    full: mgr.state.players.length >= 10,
  });
});

module.exports = router;
