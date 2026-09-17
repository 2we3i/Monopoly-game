// End-to-end tests of the Creator role over the real HTTP API and socket.io
// wire: who gets which powers, confirmations, the journal, crowns, the shop
// (including names for board squares), media, memes, boards, mode configs
// with versions, test matches that leave no trace, simulations, live games,
// error logs and platform settings.

const { registerAccount } = require('./helpers/testEnv');

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const errorLog = require('../src/platform/errorLog');

errorLog.install();

const apiRoutes = require('../src/routes/api');
const adminRoutes = require('../src/routes/admin');
const economyRoutes = require('../src/routes/economy');
const { router: authRoutes } = require('../src/routes/authRoutes');
const presence = require('../src/platform/presence');
const { registerSocketHandlers } = require('../src/socket/socketHandler');
const { registerMafiaHandlers } = require('../src/socket/mafiaHandler');
const accountsDb = require('../src/db/accounts');
const platformDb = require('../src/db/platform');
const community = require('../src/db/community');
const roomManager = require('../src/game/RoomManager');
const content = require('../src/memehype/content');
const layouts = require('../src/game/boardLayouts');
const economy = require('../src/economy/service');
const media = require('../src/platform/media');

const PORT = 4031;
const URL = `http://localhost:${PORT}`;
const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/economy', economyRoutes);
app.use('/api', apiRoutes);
app.use(media.MEDIA_URL, express.static(media.MEDIA_DIR));
app.use(errorLog.expressHandler);
const server = http.createServer(app);
const io = new Server(server);
presence.attach(io);
registerSocketHandlers(io);
registerMafiaHandlers(io);

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
function ok(msg) {
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function connect(token) {
  return new Promise((resolve) => {
    const s = ioClient(URL, { transports: ['websocket'], auth: token ? { token } : {} });
    s.on('connect', () => resolve(s));
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function uploadTo(path, token, fields = {}) {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(`${URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function run() {
  console.log('Creator tests');
  const owner = registerAccount('Owner');
  const helper = registerAccount('Helper');
  const player = registerAccount('Player');
  const other = registerAccount('Other');
  const sockets = [];
  const track = async (token) => {
    const s = await connect(token);
    sockets.push(s);
    return s;
  };

  // --- roles -------------------------------------------------------------------------
  accountsDb.makeSoleAdmin(owner.id);
  assert(accountsDb.roleOf(accountsDb.findById(owner.id)) === 'creator', 'with no creator appointed, the administrator acts as the Creator');
  let me = await api('GET', '/api/admin/me', { token: owner.token });
  assert(me.body.role === 'creator' && me.body.permissions.includes('economy.manage'), 'the bootstrap Creator has every permission');
  ok('upgrading keeps the owner in control: the existing administrator is the Creator until one is appointed');

  const noConfirm = await api('PUT', `/api/admin/users/${helper.id}/role`, { token: owner.token, body: { role: 'admin' } });
  assert(noConfirm.status === 428, `a role change without confirmation is refused (${noConfirm.status})`);
  const promote = await api('PUT', `/api/admin/users/${helper.id}/role`, { token: owner.token, body: { role: 'admin', confirm: true } });
  assert(promote.status === 200 && promote.body.role === 'admin', `the Creator appoints an administrator (${JSON.stringify(promote.body)})`);
  const appoint = await api('PUT', `/api/admin/users/${owner.id}/role`, { token: owner.token, body: { role: 'creator', confirm: true } });
  assert(appoint.status === 200 && accountsDb.roleOf(accountsDb.findById(owner.id)) === 'creator', 'the owner is appointed Creator explicitly');
  const selfDemote = await api('PUT', `/api/admin/users/${owner.id}/role`, { token: owner.token, body: { role: 'user', confirm: true } });
  assert(selfDemote.status === 400, 'the Creator cannot demote themselves');
  ok('roles change only with confirmation, and the Creator cannot lock themselves out');

  me = await api('GET', '/api/admin/me', { token: helper.token });
  assert(me.body.role === 'admin' && !me.body.permissions.includes('economy.manage'), 'an administrator keeps only the moderation permissions');
  const adminOverview = await api('GET', '/api/admin/overview', { token: helper.token });
  assert(adminOverview.status === 200, 'an administrator still sees the overview');
  for (const [method, path] of [['GET', '/api/admin/economy'], ['GET', '/api/admin/shop'], ['GET', '/api/admin/boards'], ['GET', '/api/admin/media'],
    ['GET', '/api/admin/memes'], ['GET', '/api/admin/settings'], ['GET', '/api/admin/access'], ['GET', '/api/admin/logs/audit'], ['GET', '/api/admin/games'],
    ['POST', `/api/admin/users/${player.id}/balance`], ['PUT', `/api/admin/users/${player.id}/role`], ['POST', '/api/admin/modes/mafia.classic/simulate']]) {
    // eslint-disable-next-line no-await-in-loop
    const res = await api(method, path, { token: helper.token, body: method === 'GET' ? undefined : { confirm: true, role: 'admin', mode: 'add', amount: 5, reason: 'nope' } });
    assert(res.status === 403, `an administrator is refused ${method} ${path} (${res.status})`);
  }
  const userTry = await api('GET', '/api/admin/economy', { token: player.token });
  assert(userTry.status === 403, 'a normal user is refused');
  const anon = await api('GET', '/api/admin/shop');
  assert(anon.status === 401, 'an anonymous caller is refused');
  const blockCreator = await api('POST', `/api/admin/users/${owner.id}/block`, { token: helper.token, body: { reason: 'coup attempt' } });
  assert(blockCreator.status === 400, 'an administrator cannot block the Creator');
  ok('administrators and users get none of the Creator\'s powers (checked on the server)');

  // --- crowns ------------------------------------------------------------------------
  const add = await api('POST', `/api/admin/users/${player.id}/balance`, {
    token: owner.token, body: { mode: 'add', amount: 5000, reason: 'tournament prize', confirm: true },
  });
  assert(add.status === 200 && add.body.before === 0 && add.body.after === 5000, `crowns are added (${JSON.stringify(add.body)})`);
  const remove = await api('POST', `/api/admin/users/${player.id}/balance`, {
    token: owner.token, body: { mode: 'remove', amount: 1000, reason: 'refund', confirm: true },
  });
  assert(remove.body.after === 4000, 'crowns are removed');
  const bigSet = await api('POST', `/api/admin/users/${player.id}/balance`, {
    token: owner.token, body: { mode: 'set', amount: 50000, reason: 'testing', confirm: true },
  });
  assert(bigSet.status === 428, 'a large change needs a second confirmation');
  const set = await api('POST', `/api/admin/users/${player.id}/balance`, {
    token: owner.token, body: {
      mode: 'set', amount: 50000, reason: 'testing', confirm: true, confirmLarge: true,
    },
  });
  assert(set.body.before === 4000 && set.body.after === 50000 && community.wallet(player.id).balance === 50000, 'a balance is set to an exact value');
  const noReason = await api('POST', `/api/admin/users/${player.id}/balance`, { token: owner.token, body: { mode: 'add', amount: 5, confirm: true } });
  assert(noReason.status === 400, 'a balance change needs a reason');
  const history = await api('GET', `/api/admin/users/${player.id}/economy`, { token: owner.token });
  assert(history.body.ledger.filter((e) => e.kind === 'admin').length === 3, 'every change is in the balance history');
  assert(community.wallet(player.id).earned === 0, 'crowns given by the Creator are not counted as earned by playing');
  const bulk = await api('POST', '/api/admin/economy/bulk', {
    token: owner.token, body: {
      accountIds: [other.id, helper.id], mode: 'add', amount: 300, reason: 'event bonus', confirm: true, confirmLarge: true,
    },
  });
  assert(bulk.body.changed === 2 && community.wallet(other.id).balance === 300, 'crowns go to several users at once');
  const journal = await api('GET', '/api/admin/logs/audit?action=BALANCE_CHANGED', { token: owner.token });
  const setEntry = journal.body.entries.find((e) => e.newValue?.balance === 50000);
  assert(setEntry && setEntry.oldValue.balance === 4000 && setEntry.reason === 'testing' && setEntry.adminName === 'Owner' && setEntry.adminRole === 'creator' && setEntry.targetLabel === 'Player',
    'the journal records who, the old and new balance, the reason and the user');
  ok('crowns: add, remove, set, bulk - with reasons, confirmations, history and the journal');

  // --- media and a name for a board square ----------------------------------------------------
  const uploaded = await uploadTo('/api/admin/media', owner.token, { title: 'Gold tower' });
  assert(uploaded.status === 200 && uploaded.body.asset.url.startsWith('/media/'), `a picture is uploaded (${JSON.stringify(uploaded.body)})`);
  const picture = uploaded.body.asset.url;
  const served = await fetch(`${URL}${picture}`);
  assert(served.status === 200, 'the uploaded picture is served');
  const badUpload = await fetch(`${URL}/api/admin/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
    body: (() => { const f = new FormData(); f.append('file', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'x.svg'); return f; })(),
  });
  assert(badUpload.status === 400, 'only real picture formats are accepted');

  const created = await api('POST', '/api/admin/shop/items', {
    token: owner.token,
    body: {
      id: 'tile_name_gold_tower',
      slot: 'tile_name',
      rarity: 'epic',
      price: 1500,
      name: { en: 'Gold Tower', ru: 'Золотая башня' },
      description: { en: 'Your name on Elm Street', ru: 'Ваше имя на улице Вязов' },
      image: picture,
      visual: { target: { layout: 'classic', tileId: 1 } },
    },
  });
  assert(created.status === 200 && created.body.item.slot === 'tile_name', `the Creator adds a square name to the shop (${JSON.stringify(created.body)})`);
  const catalogRes = await api('GET', '/api/economy/catalog');
  assert(catalogRes.body.categories.includes('fields') && catalogRes.body.items.some((i) => i.id === 'tile_name_gold_tower' && i.forSale), 'players see it in the shop');
  const bought = await api('POST', '/api/economy/buy', { token: player.token, body: { itemId: 'tile_name_gold_tower' } });
  assert(bought.status === 200 && bought.body.inventory.some((i) => i.itemId === 'tile_name_gold_tower'), `a player buys it (${JSON.stringify(bought.body)})`);
  const equipped = await api('POST', '/api/economy/equip', { token: player.token, body: { itemId: 'tile_name_gold_tower' } });
  assert(equipped.status === 200 && equipped.body.loadout.tile_name.includes('tile_name_gold_tower'), 'and chooses it');
  const mine = await api('GET', '/api/economy/me', { token: player.token });
  assert(mine.body.loadout.tile_name.includes('tile_name_gold_tower'), 'the choice is saved');

  const pSock = await track(player.token);
  const room = await emit(pSock, 'room:create', { token: player.token, modeId: 'classic' });
  assert(room.ok, `the player opens a Monopoly room (${room.error})`);
  const mgr = roomManager.getRoom(room.roomCode);
  mgr.state.properties[1].ownerId = player.id;
  const board = economy.decorateBoard(mgr.state.toJSON().board, mgr.state.properties, mgr.state.players, 'classic');
  assert(board[1].name === 'Gold Tower' && board[1].nameRu === 'Золотая башня' && board[1].image === picture, 'the owned square shows the bought name and picture');
  assert(mgr.state.layout.board[1].name === 'Elm Street', 'the rules engine keeps the real square');
  const otherBoard = economy.decorateBoard(mgr.state.toJSON().board, { ...mgr.state.properties, 1: { ...mgr.state.properties[1], ownerId: null } }, mgr.state.players, 'classic');
  assert(otherBoard[1].name === 'Elm Street', 'an unowned square keeps its name');

  const disable = await api('PUT', '/api/admin/shop/items/tile_name_gold_tower', { token: owner.token, body: { enabled: false } });
  assert(disable.status === 200 && disable.body.item.enabled === false, 'the Creator takes an item off sale');
  const buyDisabled = await api('POST', '/api/economy/buy', { token: other.token, body: { itemId: 'tile_name_gold_tower' } });
  assert(buyDisabled.status === 400 && buyDisabled.body.code === 'NOT_FOR_SALE', 'an item off sale cannot be bought');
  const reprice = await api('PUT', '/api/admin/shop/items/badge_clover', { token: owner.token, body: { price: 99 } });
  assert(reprice.body.item.price === 99, 'a built-in item gets a new price');
  const del = await api('DELETE', '/api/admin/shop/items/tile_name_gold_tower', { token: owner.token, body: { confirm: true } });
  assert(del.body.result === 'retired', 'an owned item is retired, not erased');
  assert(community.inventory(player.id).some((i) => i.itemId === 'tile_name_gold_tower'), 'the owner keeps a retired item');
  ok('shop: square names with pictures are created, bought, chosen, shown on the board, priced, disabled and retired');

  const grant = await api('POST', `/api/admin/users/${other.id}/items`, { token: owner.token, body: { itemId: 'title_master', reason: 'bug bounty' } });
  assert(grant.status === 200 && community.ownsItem(other.id, 'title_master'), 'the Creator gives an item');
  const revoke = await api('DELETE', `/api/admin/users/${other.id}/items/title_master`, { token: owner.token, body: { confirm: true } });
  assert(revoke.status === 200 && !community.ownsItem(other.id, 'title_master'), 'and takes it back');
  ok('items are given to and taken from users');

  // --- boards and squares -----------------------------------------------------------------------
  const bind = await api('PUT', `/api/admin/media/${uploaded.body.asset.id}`, {
    token: owner.token, body: { title: 'Tower picture', description: 'For the station', modeId: 'monopoly.classic', tile: { layoutId: 'classic', tileId: 5 } },
  });
  assert(bind.status === 200 && layouts.LAYOUTS.classic.board[5].image === picture, `a picture is linked to a square (${JSON.stringify(bind.body)})`);
  const replaced = await uploadTo(`/api/admin/media/${uploaded.body.asset.id}/replace`, owner.token);
  assert(replaced.status === 200 && replaced.body.url !== picture, 'a picture is replaced');
  assert(layouts.LAYOUTS.classic.board[5].image === replaced.body.url, 'the square shows the new picture at once');
  const library = await api('GET', '/api/admin/media', { token: owner.token });
  assert(library.body.media.some((m) => m.kind === 'meme') && library.body.media.some((m) => m.id === uploaded.body.asset.id && m.title === 'Tower picture'), 'the library lists game pictures and uploads with their titles');
  const tile = await api('PUT', '/api/admin/boards/classic/tiles/3', {
    token: owner.token, body: { tile: { name: 'Owner Avenue', nameRu: 'Проспект Создателя', price: 70, description: { en: 'Renamed', ru: 'Переименована' } } },
  });
  assert(tile.status === 200 && layouts.LAYOUTS.classic.board[3].name === 'Owner Avenue' && layouts.LAYOUTS.classic.board[3].price === 70, `a square is renamed and repriced (${JSON.stringify(tile.body)})`);
  const badTile = await api('PUT', '/api/admin/boards/classic/tiles/0', { token: owner.token, body: { tile: { type: 'PROPERTY' } } });
  assert(badTile.status === 400, 'a corner cannot become a property');
  assert(mgr.state.layout.board[3].name === 'Oak Avenue', 'a room created before the edit keeps its board');
  const newBoard = await api('POST', '/api/admin/boards', { token: owner.token, body: { id: 'owner-city', sideLength: 9, label: { en: 'Owner City', ru: 'Город Создателя' } } });
  assert(newBoard.status === 200 && layouts.LAYOUT_OPTIONS.some((o) => o.id === 'owner-city'), 'a new board is added');
  const modesList = await api('GET', '/api/admin/modes', { token: owner.token });
  assert(modesList.body.modes.some((m) => m.id === 'monopoly.owner-city'), 'the new board is a game mode');
  const cityRoom = await emit(pSock, 'room:create', { token: player.token, modeId: 'owner-city' });
  assert(cityRoom.ok && cityRoom.state.board.length === 36, 'a room plays on the new board');
  const deleteBoard = await api('DELETE', '/api/admin/boards/owner-city', { token: owner.token, body: { confirm: true } });
  assert(deleteBoard.status === 200 && !layouts.LAYOUTS['owner-city'], 'an added board is deleted');
  assert(roomManager.getRoom(cityRoom.roomCode).state.layout.board.length === 36, 'the running room keeps playing on it');
  const removed = await api('DELETE', `/api/admin/media/${uploaded.body.asset.id}`, { token: owner.token, body: { confirm: true } });
  assert(removed.status === 400, 'a picture in use is not deleted without saying so');
  const forced = await api('DELETE', `/api/admin/media/${uploaded.body.asset.id}`, { token: owner.token, body: { confirm: true, force: true } });
  assert(forced.status === 200 && !layouts.LAYOUTS.classic.board[5].image, 'deleting it takes it off the square');
  ok('boards and squares: pictures, names, prices, new boards, deletion - running games untouched');

  // --- memes --------------------------------------------------------------------------------------
  const memes = await api('GET', '/api/admin/memes', { token: owner.token });
  const firstMeme = memes.body.packs[0].byRating['16'].memes[0];
  const editMeme = await api('PUT', `/api/admin/memes/${firstMeme.id}`, { token: owner.token, body: { top: 'КОГДА СОЗДАТЕЛЬ', bottom: 'ВСЁ ПОМЕНЯЛ', title: 'Edited' } });
  assert(editMeme.status === 200 && content.memeById(firstMeme.id, '16').top === 'КОГДА СОЗДАТЕЛЬ', 'a meme caption changes at once');
  const memeUpload = await uploadTo('/api/admin/media', owner.token, { title: 'meme pic' });
  await api('PUT', `/api/admin/memes/${firstMeme.id}`, { token: owner.token, body: { image: memeUpload.body.asset.url } });
  assert(content.memeById(firstMeme.id, '16').image === memeUpload.body.asset.url, 'a meme picture is replaced at once');
  const newMeme = await api('POST', '/api/admin/memes', {
    token: owner.token, body: { pack: 'animals', rating: '16', art: '🦖', top: 'НОВЫЙ', bottom: 'МЕМ' },
  });
  assert(newMeme.status === 200 && content.memesFor('16', ['animals']).some((m) => m.id === newMeme.body.card.id), `a new meme enters the deck (${JSON.stringify(newMeme.body)})`);
  const delMeme = await api('DELETE', `/api/admin/memes/${newMeme.body.card.id}`, { token: owner.token, body: { confirm: true } });
  assert(delMeme.status === 200 && !content.memesFor('16', ['animals']).some((m) => m.id === newMeme.body.card.id), 'a deleted meme leaves the deck');
  assert(content.memeById(newMeme.body.card.id, '16'), 'a card already in a hand still resolves');
  const reset = await api('POST', `/api/admin/memes/${firstMeme.id}/reset`, { token: owner.token, body: { confirm: true } });
  assert(reset.status === 200 && content.memeById(firstMeme.id, '16').top === firstMeme.top, 'a meme is reset to the original');
  ok('memes: captions, pictures, new memes, deletion and reset take effect without a restart');

  // --- mode configs, versions and limits ------------------------------------------------------------
  const cfgGet = await api('GET', '/api/admin/modes/monopoly.classic/config', { token: owner.token });
  assert(cfgGet.body.config.rules.startingMoney === 1500 && cfgGet.body.config.version === 1, 'a mode starts with the shipped config');
  const saveCfg = await api('PUT', '/api/admin/modes/monopoly.classic/config', {
    token: owner.token, body: { confirm: true, note: 'rich start', config: { ...cfgGet.body.config, minPlayers: 3, rules: { ...cfgGet.body.config.rules, startingMoney: 2500 } } },
  });
  assert(saveCfg.status === 200 && saveCfg.body.config.version === 2, `a config is saved as a new version (${JSON.stringify(saveCfg.body).slice(0, 200)})`);
  const badCfg = await api('PUT', '/api/admin/modes/monopoly.classic/config', { token: owner.token, body: { confirm: true, config: { maxPlayers: 99 } } });
  assert(badCfg.status === 400, 'an impossible config is refused');
  const richRoom = await emit(pSock, 'room:create', { token: player.token, modeId: 'classic' });
  assert(richRoom.state.players[0].money === 2500, 'a new room uses the new rules');
  assert(mgr.state.players[0].money === 1500, 'the room created earlier keeps its rules');
  const oSock = await track(other.token);
  await emit(oSock, 'room:join', { token: other.token, roomCode: richRoom.roomCode });
  const startErr = new Promise((resolve) => pSock.once('game:error', resolve));
  pSock.emit('room:start');
  const refused = await Promise.race([startErr, sleep(1500).then(() => null)]);
  assert(refused && /at least 3/.test(refused.message), `the new minimum is enforced (${JSON.stringify(refused)})`);
  const restore = await api('POST', '/api/admin/modes/monopoly.classic/config/restore', { token: owner.token, body: { confirm: true, version: 1 } });
  assert(restore.status === 200 && restore.body.config.rules.startingMoney === 1500 && restore.body.config.version === 3, 'an old version is restored as a new one');
  ok('game modes: versioned configs, validation, new rooms only, player limits');

  // --- test matches and simulations --------------------------------------------------------------------
  const disableMafia = await api('PUT', '/api/admin/modes/mafia.classic', { token: owner.token, body: { status: 'disabled' } });
  assert(disableMafia.status === 200, 'a mode is switched off');
  const ownerSock = await track(owner.token);
  const refusedCreate = await emit(ownerSock, 'mafia:create', { token: owner.token, presetId: 'CLASSIC' });
  assert(refusedCreate.ok === false && refusedCreate.code === 'MODE_UNAVAILABLE', 'nobody opens a switched-off mode');
  const roomsBefore = platformDb.platformTotals().roomsCreated;
  const arm = await api('POST', '/api/admin/modes/mafia.classic/test-match', { token: owner.token });
  assert(arm.status === 200 && arm.body.armed.modeId === 'mafia.classic', 'the Creator arms a test match');
  const testRoom = await emit(ownerSock, 'mafia:create', { token: owner.token, presetId: 'CLASSIC' });
  assert(testRoom.ok, `the Creator opens the switched-off mode for a test (${testRoom.error})`);
  assert(platformDb.platformTotals().roomsCreated === roomsBefore, 'the test room is not written to the history');
  const testing = await api('GET', '/api/admin/testing', { token: owner.token });
  assert(testing.body.testRooms.some((r) => r.code === testRoom.roomCode), 'the test room is listed as a test');
  const sim = await api('POST', '/api/admin/modes/citadels.classic/simulate', { token: owner.token, body: { games: 2, players: 3 } });
  assert(sim.status === 200 && sim.body.result.played === 2 && sim.body.result.errors === 0, `a simulation plays bot games in memory (${JSON.stringify(sim.body).slice(0, 300)})`);
  const draft = await api('POST', '/api/admin/modes/monopoly.metropolis/simulate', { token: owner.token, body: { games: 1, config: { rules: { startingMoney: 300 } } } });
  assert(draft.status === 200 && draft.body.result.usedDraft, 'a draft config is tested before saving');
  await api('PUT', '/api/admin/modes/mafia.classic', { token: owner.token, body: { status: 'enabled' } });
  ok('testing: test matches in switched-off modes leave no trace; simulations run on saved and draft configs');

  // --- live games ------------------------------------------------------------------------------------------
  const games = await api('GET', '/api/admin/games', { token: owner.token });
  assert(games.body.live.some((g) => g.code === richRoom.roomCode), 'live games are listed');
  const detail = await api('GET', `/api/admin/games/${richRoom.roomCode}`, { token: owner.token });
  assert(detail.body.game.rawPlayers.length === 2 && detail.body.game.rawPlayers.every((p) => p.socketId === undefined) && Array.isArray(detail.body.game.log), 'a game shows its players\' state and log, without secrets');
  const endNoConfirm = await api('POST', `/api/admin/games/${richRoom.roomCode}/end`, { token: owner.token, body: {} });
  assert(endNoConfirm.status === 428, 'ending a game needs confirmation');
  const end = await api('POST', `/api/admin/games/${richRoom.roomCode}/end`, { token: owner.token, body: { confirm: true, reason: 'maintenance' } });
  assert(end.status === 200 && !roomManager.getRoom(richRoom.roomCode), 'the Creator ends a game');
  ok('live games: players, state and logs are visible; a game is ended with confirmation');

  // --- logs, settings, access ---------------------------------------------------------------------------------
  console.error('Match recording failed for catan: simulated failure');
  const errors = await api('GET', '/api/admin/logs/errors?gameType=catan', { token: owner.token });
  assert(errors.body.entries.some((e) => e.message.includes('simulated failure')), 'server errors are logged per game');
  const critical = await api('GET', '/api/admin/logs/audit?critical=1', { token: owner.token });
  ['USER_ROLE_CHANGED', 'BALANCE_CHANGED', 'SHOP_ITEM_DELETED', 'MODE_CONFIG_SAVED', 'MEME_DELETED', 'BOARD_DELETED', 'GAME_ENDED', 'MEDIA_DELETED']
    .forEach((action) => assert(critical.body.entries.some((e) => e.action === action), `the journal has ${action}`));

  const current = await api('GET', '/api/admin/settings', { token: owner.token });
  const closed = await api('PUT', '/api/admin/settings', {
    token: owner.token, body: { confirm: true, settings: { ...current.body.settings, platform: { ...current.body.settings.platform, registrationOpen: false, announcement: { en: 'Maintenance', ru: 'Техработы' } }, economy: { ...current.body.settings.economy, participation: 15 } } },
  });
  assert(closed.status === 200, 'settings are saved');
  const reg = await api('POST', '/api/auth/register', { body: { nickname: 'Latecomer', password: 'password123' } });
  assert(reg.status === 403, 'closed registration refuses new accounts');
  const pub = await api('GET', '/api/platform');
  assert(pub.body.announcement.ru === 'Техработы', 'the announcement is public');
  assert(require('../src/economy/rules').MATCH_REWARDS.participation === 15, 'economy numbers take effect'); // eslint-disable-line global-require
  await api('POST', '/api/admin/settings/reset', { token: owner.token, body: { confirm: true, section: 'platform' } });
  const reg2 = await api('POST', '/api/auth/register', { body: { nickname: 'Latecomer', password: 'password123' } });
  assert(reg2.status === 200 || reg2.status === 201, `registration reopens (${reg2.status})`);
  const accessRes = await api('GET', '/api/admin/access', { token: owner.token });
  assert(accessRes.body.staff.some((s) => s.id === helper.id && s.role === 'admin') && accessRes.body.matrix.admin.length < accessRes.body.matrix.creator.length, 'the access page lists staff and the permission matrix');
  ok('logs, errors, settings and access management');

  sockets.forEach((s) => s.close());
  io.close();
  server.close();
  console.log(`\nCreator tests: ${passed} passed`);
}

server.listen(PORT, async () => {
  try {
    await run();
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
});
