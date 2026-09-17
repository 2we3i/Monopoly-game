// api.js
// Small REST surface for health checks and metadata the lobby needs
// before a room exists.

const express = require('express');
const roomManager = require('../game/RoomManager');
const { LAYOUT_OPTIONS } = require('../game/boardLayouts');
const mafiaSettings = require('../mafia/settings');
const { CONFIGURABLE_ROLES, ROLES } = require('../mafia/roles');
const citadels = require('../citadels/CitadelsGame');
const { ROLES: CITADELS_ROLES, ROLE_ORDER } = require('../citadels/roles');
const { DISTRICTS, TYPE_LIST } = require('../citadels/districts');
const bunker = require('../bunker/BunkerGame');
const bunkerCards = require('../bunker/cards');
const bunkerContent = require('../bunker/content');
const bunkerSettings = require('../bunker/settings');
const catan = require('../catan/CatanGame');
const cosmic = require('../cosmic/CosmicGame');
const throne = require('../throne/ThroneGame');
const chpok = require('../chpok/ChpokGame');
const chpokPacks = require('../chpok/packs');
const memeHype = require('../memehype/MemeHypeGame');
const memeContent = require('../memehype/content');
const modes = require('../platform/modes');
const registry = require('../platform/registry');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    rooms: roomManager.roomCount(),
  });
});

function monopolyModes() {
  return LAYOUT_OPTIONS.map((opt) => ({ ...opt, available: modes.isAvailable(modes.monopolyModeId(opt.id)) }));
}

// The catalogue the main menu renders. Games are described by the server
// so a new mode becomes selectable without shipping a new client, and a
// mode the admin switched off is marked unavailable for new games.
router.get('/games', (req, res) => {
  res.json({
    games: [
      {
        id: 'monopoly',
        minPlayers: 2,
        maxPlayers: 10,
        modes: monopolyModes(),
        available: modes.gameAvailable('monopoly'),
      },
      {
        id: 'mafia',
        minPlayers: mafiaSettings.MIN_PLAYERS,
        maxPlayers: mafiaSettings.MAX_PLAYERS,
        presets: Object.keys(mafiaSettings.PRESETS),
        available: modes.gameAvailable('mafia'),
      },
      {
        id: 'citadels',
        minPlayers: citadels.MIN_PLAYERS,
        maxPlayers: citadels.MAX_PLAYERS,
        available: modes.gameAvailable('citadels'),
      },
      {
        id: 'bunker',
        minPlayers: bunker.MIN_PLAYERS,
        maxPlayers: bunker.MAX_PLAYERS,
        available: modes.gameAvailable('bunker'),
      },
      {
        id: 'catan',
        minPlayers: catan.MIN_PLAYERS,
        maxPlayers: catan.MAX_PLAYERS,
        available: modes.gameAvailable('catan'),
      },
      {
        id: 'cosmic',
        minPlayers: cosmic.MIN_PLAYERS,
        maxPlayers: cosmic.MAX_PLAYERS,
        available: modes.gameAvailable('cosmic'),
      },
      {
        id: 'throne',
        minPlayers: throne.MIN_PLAYERS,
        maxPlayers: throne.MAX_PLAYERS,
        available: throne.isAvailable() && modes.gameAvailable('throne'),
      },
      {
        id: 'chpok',
        minPlayers: chpok.MIN_PLAYERS,
        maxPlayers: chpok.MAX_PLAYERS,
        // 18+: the front door never lists it. It is offered on the board
        // games page, behind the age gate that section already has.
        adult: true,
        available: modes.gameAvailable('chpok'),
      },
      {
        id: 'memehype',
        minPlayers: memeHype.MIN_PLAYERS,
        maxPlayers: memeHype.MAX_PLAYERS,
        // Listed on the board games page, where its 16+/18+ modes are chosen.
        tabletop: true,
        available: modes.gameAvailable('memehype'),
      },
    ],
  });
});

// Bunker reference data: the names of every characteristic, item, action
// card, event and scenario, plus the shape of a settings object, so the
// lobby and the table can be drawn without hard-coding any content. Which
// cards a player holds is never part of this - only of their own payload,
// and neither are the scores, which stay on the server.
router.get('/bunker/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const legacy = bunkerCards.publicConfig();
  res.json({
    minPlayers: bunker.MIN_PLAYERS,
    maxPlayers: bunker.MAX_PLAYERS,
    firstVoteRound: bunker.FIRST_VOTE_ROUND,
    defaults: bunker.DEFAULT_SETTINGS,
    ...legacy,
    // The full catalogue, which extends the original decks rather than
    // replacing them: `cards` still answers to every id it used to.
    categories: bunkerContent.ALL_CATEGORY_KEYS,
    categoryDefs: bunkerContent.CATEGORIES,
    baggageKeys: bunkerContent.BAGGAGE_KEYS,
    secretKeys: bunkerContent.SECRET_KEYS,
    cards: { ...legacy.cards, ...bunkerContent.publicDecks() },
    hiddenProperties: bunkerContent.publicHiddenProperties(),
    rarities: bunkerContent.RARITIES,
    schema: bunkerSettings.schema(),
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

// Static Citadels reference data: role and district cards. The rules that
// use them live only on the server.
router.get('/citadels/config', (req, res) => {
  res.json({
    minPlayers: citadels.MIN_PLAYERS,
    maxPlayers: citadels.MAX_PLAYERS,
    defaults: citadels.DEFAULT_SETTINGS,
    roleOrder: ROLE_ORDER,
    roles: ROLE_ORDER.map((id) => {
      const r = CITADELS_ROLES[id];
      return {
        id: r.id, rank: r.rank, name: r.name, text: r.text, incomeType: r.incomeType || null, ability: r.ability || null,
      };
    }),
    types: TYPE_LIST,
    districts: DISTRICTS.map((d) => ({
      id: d.id, type: d.type, cost: d.cost, count: d.count, name: d.name, text: d.text || null, special: d.special || null,
    })),
  });
});

// What an online ЧПОК lobby needs before a room exists: the limits, the
// shape of a settings object and the options the host may pick from.
router.get('/chpok/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    minPlayers: chpok.MIN_PLAYERS,
    maxPlayers: chpok.MAX_PLAYERS,
    maxAnswerLength: chpok.MAX_ANSWER_LEN,
    defaults: chpok.DEFAULT_SETTINGS,
    packs: chpokPacks.catalog(),
    options: {
      rounds: chpok.ROUND_OPTIONS,
      answerSec: chpok.ANSWER_SEC_OPTIONS,
      voteSec: chpok.VOTE_SEC_OPTIONS,
    },
  });
});

// The Meme Hype shelf: packs and how many cards each age mode holds.
router.get('/memehype/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    minPlayers: memeHype.MIN_PLAYERS,
    maxPlayers: memeHype.MAX_PLAYERS,
    defaults: memeHype.DEFAULT_SETTINGS,
    ratings: memeContent.RATINGS,
    packs: memeContent.catalog(),
  });
});

// Who took the photos on the Meme Hype cards, and under which licence.
router.get('/memehype/credits', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ credits: memeContent.credits() });
});

// Platform switches every visitor needs: an announcement, and whether
// registration and the shop are open.
router.get('/platform', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  // eslint-disable-next-line global-require
  res.json(require('../platform/settings').publicSettings());
});

router.get('/game-modes', (req, res) => {
  res.json({ modes: monopolyModes() });
});

router.get('/rooms/:code/exists', (req, res) => {
  const found = registry.find(req.params.code);
  if (!found) return res.json({ exists: false });
  const summary = found.adapter.summary(found.room);
  res.json({
    exists: true,
    gameType: summary.gameType,
    phase: summary.phase,
    modeId: summary.modeId,
    playerCount: summary.players.length,
    full: summary.players.length >= summary.maxPlayers,
  });
});

module.exports = router;
