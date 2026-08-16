// api.js
// Small REST surface. Almost everything gameplay-related happens over
// WebSocket (see socket/socketHandler.js) - this is just for health checks
// and a convenience endpoint to check if a room code exists before joining.

const express = require('express');
const roomManager = require('../game/RoomManager');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), rooms: roomManager.rooms.size });
});

router.get('/rooms/:code/exists', (req, res) => {
  const mgr = roomManager.getRoom(req.params.code);
  if (!mgr) return res.json({ exists: false });
  res.json({
    exists: true,
    phase: mgr.state.phase,
    playerCount: mgr.state.players.length,
    full: mgr.state.players.length >= 10,
  });
});

module.exports = router;
