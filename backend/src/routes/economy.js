// economy.js
// REST surface of the game economy: the catalogue, the player's wallet,
// inventory and loadout, buying and equipping, and the leaderboard.

const express = require('express');
const accounts = require('../db/accounts');
const sessionToken = require('../auth/sessionToken');
const economy = require('../economy/service');

const router = express.Router();

function attachAccount(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const accountId = token ? sessionToken.verify(token) : null;
  req.accountRow = accountId ? accounts.findById(accountId) : null;
  req.accountId = req.accountRow && !accounts.isBlocked(req.accountRow) ? req.accountRow.id : null;
  next();
}
router.use(attachAccount);

function requireAuth(req, res, next) {
  if (!req.accountRow) return res.status(401).json({ error: 'Log in to use the shop.', code: 'AUTH_REQUIRED' });
  if (accounts.isBlocked(req.accountRow)) return res.status(403).json({ error: 'This account is blocked.', code: 'BLOCKED' });
  next();
}

function handle(fn) {
  return (req, res) => {
    try {
      res.json(fn(req, res));
    } catch (err) {
      if (err instanceof economy.EconomyError) return res.status(err.status).json({ error: err.message, code: err.code });
      // eslint-disable-next-line no-console
      console.error('Economy request failed:', err);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };
}

const itemIdOf = (req) => (typeof req.body?.itemId === 'string' ? req.body.itemId.slice(0, 80) : '');

router.get('/catalog', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(economy.publicCatalog());
});

router.get('/me', requireAuth, handle((req) => economy.accountEconomy(req.accountId)));
router.post('/buy', requireAuth, handle((req) => economy.buy(req.accountId, itemIdOf(req))));
router.post('/equip', requireAuth, handle((req) => ({ loadout: economy.equip(req.accountId, itemIdOf(req)) })));
router.post('/unequip', requireAuth, handle((req) => ({ loadout: economy.unequip(req.accountId, itemIdOf(req)) })));
router.post('/favorite', requireAuth, handle((req) => ({ favorites: economy.setFavorite(req.accountId, itemIdOf(req), req.body?.on !== false) })));

router.get('/leaderboard', handle((req) => economy.leaderboard(req.query.scope === 'all' ? 'all' : 'season', req.accountId)));
router.post('/leaderboard/claim', requireAuth, handle((req) => economy.claimLeaderboardRewards(req.accountId)));

module.exports = router;
