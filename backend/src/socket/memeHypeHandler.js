// memeHypeHandler.js
// Real-time layer for Meme Hype. The room - joining by QR code, the phase
// clock, spectators, the twenty seconds, surrender - is the shared party
// handler, exactly as for ЧПОК. What a Meme Hype phone may do is play one
// meme from its hand and cast one vote per round.

const roomManager = require('../game/RoomManager');
const { MemeHypeError, MIN_PLAYERS, MAX_PLAYERS } = require('../memehype/MemeHypeGame');
const { createPartyHandler } = require('../party/partyHandler');
const { idString } = require('./roomSockets');

const MODE_ID = 'memehype.party';

const handler = createPartyHandler({
  type: 'memehype',
  modeId: MODE_ID,
  label: 'a Meme Hype room',
  ErrorClass: MemeHypeError,
  store: {
    rooms: () => roomManager.memeHypeRooms.values(),
    get: (code) => roomManager.getMemeHypeRoom(code),
    create: (hostId, settings, meta) => roomManager.createMemeHypeRoom(hostId, settings, meta),
    persist: (code) => roomManager.persistMemeHype(code),
    remove: (code, reason) => roomManager.deleteMemeHypeRoom(code, reason),
  },
  settled: (game) => game.settled(),
  moves: {
    pick: (game, playerId, p) => game.pick(playerId, idString(p.memeId, 60)),
    vote: (game, playerId, p) => game.vote(playerId, idString(p.pickId, 40)),
  },
  details: (game) => ({ rating: game.settings.rating, packs: game.settings.packs.join(', ') }),
});

module.exports = {
  registerMemeHypeHandlers: handler.register, MIN_PLAYERS, MAX_PLAYERS, MODE_ID,
};
