// api.js
// Small REST surface for health checks and metadata the lobby needs
// before a room exists.

const express = require('express');
const roomManager = require('../game/RoomManager');
const { LAYOUT_OPTIONS } = require('../game/boardLayouts');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), rooms: roomManager.rooms.size });
});

router.get('/game-modes', (req, res) => {
  res.json({ modes: LAYOUT_OPTIONS });
});

router.get('/rooms/:code/exists', (req, res) => {
  const mgr = roomManager.getRoom(req.params.code);
  if (!mgr) return res.json({ exists: false });
  res.json({
    exists: true,
    phase: mgr.state.phase,
    modeId: mgr.state.modeId,
    playerCount: mgr.state.players.length,
    full: mgr.state.players.length >= 10,
  });
});

module.exports = router;
