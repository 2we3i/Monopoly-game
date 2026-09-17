// chpokHandler.js
// Real-time layer for online ЧПОК: one big screen, a phone per player.
//
// Everything a party room needs - joining by the QR code, the phase clock,
// spectators, the twenty-second grace, surrender - is the shared party
// handler. What is ЧПОК's own is the two things a phone may say each
// round, once each: its answer and its vote.

const roomManager = require('../game/RoomManager');
const {
  ChpokError, MAX_PLAYERS, MIN_PLAYERS,
} = require('../chpok/ChpokGame');
const { createPartyHandler } = require('../party/partyHandler');
const { idString } = require('./roomSockets');

const MODE_ID = 'chpok.party';

const handler = createPartyHandler({
  type: 'chpok',
  modeId: MODE_ID,
  label: 'a ЧПОК room',
  ErrorClass: ChpokError,
  store: {
    rooms: () => roomManager.chpokRooms.values(),
    get: (code) => roomManager.getChpokRoom(code),
    create: (hostId, settings, meta) => roomManager.createChpokRoom(hostId, settings, meta),
    persist: (code) => roomManager.persistChpok(code),
    remove: (code, reason) => roomManager.deleteChpokRoom(code, reason),
  },
  settled: (game) => game.settled(),
  moves: {
    answer: (game, playerId, p) => game.submitAnswer(playerId, p.text),
    vote: (game, playerId, p) => game.castVote(playerId, idString(p.answerId, 40)),
  },
  details: (game) => ({ rating: game.settings.rating, packs: game.settings.packs.join(', ') }),
});

module.exports = {
  registerChpokHandlers: handler.register, MIN_PLAYERS, MAX_PLAYERS, MODE_ID,
};
