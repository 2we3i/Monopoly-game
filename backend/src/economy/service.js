// service.js
// The game economy: crowns, the shop, the inventory and what each player
// has equipped, match rewards, win streaks, events and the leaderboard.
//
// Everything is decided here from server state. A client names an item
// it wants to buy or equip; the price, the balance, ownership and the
// slot rules are checked against the database, and rewards are paid only
// from the recorded match history - never from anything a client sends.

const catalog = require('./catalog');
const rules = require('./rules');
const { achievementsFor } = require('./achievements');
const community = require('../db/community');
const platformDb = require('../db/platform');
const accountsDb = require('../db/accounts');
const presence = require('../platform/presence');
const { notify } = require('../social/notify');

class EconomyError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'EconomyError';
    this.code = code;
    this.status = status;
  }
}

// The slots other players see in a room: how a token, a name and a
// frame look. Sounds, emotes and personal effects stay private.
const VISIBLE_SLOTS = [
  'token_shape', 'token_frame', 'token_aura', 'token_trail', 'token_victory',
  'name_style', 'name_decor', 'name_intro', 'avatar_frame', 'title', 'badge',
  'effect_join', 'profile_bg', 'profile_card',
];

const loadoutCache = new Map();
const starterChecked = new Set();

function ensureStarter(accountId) {
  if (!accountId || starterChecked.has(accountId)) return;
  community.ensureWallet(accountId);
  catalog.starterItems().forEach((item) => community.grantItem(accountId, item.id, 'starter'));
  starterChecked.add(accountId);
}

function owns(accountId, item) {
  if (!accountId || !item) return false;
  return item.source === 'starter' || community.ownsItem(accountId, item.id);
}

// { slot: itemId } for single slots and { slot: [itemIds] } for slots
// that hold several items (badges, emotes).
function loadout(accountId) {
  if (!accountId) return {};
  if (loadoutCache.has(accountId)) return loadoutCache.get(accountId);
  const out = {};
  community.equipped(accountId).forEach((row) => {
    const item = catalog.getItem(row.itemId);
    const slot = catalog.SLOTS[row.slot];
    if (!item || !slot || item.slot !== row.slot) return;
    if (slot.capacity > 1) (out[row.slot] || (out[row.slot] = [])).push(item.id);
    else out[row.slot] = item.id;
  });
  loadoutCache.set(accountId, out);
  return out;
}

// What a room payload carries about a player's looks: item ids only. The
// client already has the catalogue and resolves how each one is drawn.
function cosmeticIds(accountId) {
  if (!accountId) return null;
  const full = loadout(accountId);
  const out = {};
  VISIBLE_SLOTS.forEach((slot) => { if (full[slot]) out[slot] = full[slot]; });
  return Object.keys(out).length ? out : null;
}

function invalidate(accountId) {
  loadoutCache.delete(accountId);
}

function walletView(accountId) {
  ensureStarter(accountId);
  return {
    ...community.wallet(accountId),
    events: rules.activeEvents(),
    nextEventAt: rules.nextEventStart(),
  };
}

function pushWallet(accountId) {
  presence.emitToAccount(accountId, 'wallet:update', { wallet: walletView(accountId) });
}

function pushLoadout(accountId) {
  presence.emitToAccount(accountId, 'loadout:update', { loadout: loadout(accountId) });
}

function publicCatalog() {
  return {
    rarities: catalog.RARITIES,
    categories: catalog.CATEGORIES,
    slots: catalog.SLOTS,
    priceBands: catalog.PRICE_BANDS,
    items: catalog.ITEMS.map(({ createdOrder, ...item }) => ({ ...item, order: createdOrder })),
    // How crowns are earned, so the shop can explain it with the real numbers.
    rules: {
      match: rules.MATCH_REWARDS,
      streaks: rules.STREAK_REWARDS,
      achievements: rules.ACHIEVEMENT_REWARDS,
      dailyRewardedMatches: rules.DAILY_REWARDED_MATCHES,
      minMatchMinutes: Math.round(rules.MIN_MATCH_MS / 60000),
      smallTableMultipliers: { 2: rules.tableMultiplier(2), 3: rules.tableMultiplier(3) },
      leaderboardMinMatches: rules.LEADERBOARD_MIN_MATCHES,
      events: [{ id: 'weekend_festival', multiplier: 1.25 }],
    },
  };
}

function accountEconomy(accountId) {
  ensureStarter(accountId);
  return {
    wallet: walletView(accountId),
    inventory: community.inventory(accountId),
    loadout: loadout(accountId),
    favorites: community.favorites(accountId),
    ledger: community.ledgerFor(accountId, 25),
  };
}

// --- shop and inventory -----------------------------------------------------

function buy(accountId, itemId) {
  ensureStarter(accountId);
  const item = catalog.getItem(itemId);
  if (!item) throw new EconomyError('Unknown item.', 'UNKNOWN_ITEM', 404);
  if (item.source !== 'shop' || !item.price) throw new EconomyError('This item cannot be bought - it is earned by playing.', 'NOT_FOR_SALE');
  if (owns(accountId, item)) throw new EconomyError('You already own this item.', 'ALREADY_OWNED', 409);

  community.transaction(() => {
    const paid = community.applyLedger({
      accountId, amount: -item.price, kind: 'purchase', ref: item.id, details: { price: item.price },
    });
    if (!paid) throw new EconomyError('Not enough crowns.', 'INSUFFICIENT_FUNDS', 402);
    community.grantItem(accountId, item.id, 'shop');
  })();

  notify(accountId, 'purchase', { itemId: item.id, price: item.price });
  pushWallet(accountId);
  return { item: item.id, wallet: walletView(accountId), inventory: community.inventory(accountId) };
}

function equip(accountId, itemId) {
  ensureStarter(accountId);
  const item = catalog.getItem(itemId);
  if (!item) throw new EconomyError('Unknown item.', 'UNKNOWN_ITEM', 404);
  if (!owns(accountId, item)) throw new EconomyError('You do not own this item.', 'NOT_OWNED', 403);
  const { capacity } = catalog.SLOTS[item.slot];

  community.transaction(() => {
    const inSlot = community.equipped(accountId).filter((r) => r.slot === item.slot);
    if (inSlot.some((r) => r.itemId === item.id)) return;
    if (capacity === 1) {
      community.equipAt(accountId, item.slot, 0, item.id);
      return;
    }
    if (inSlot.length >= capacity) {
      // A full multi-slot drops the item equipped longest ago.
      const oldest = [...inSlot].sort((a, b) => a.equippedAt - b.equippedAt)[0];
      community.unequip(accountId, oldest.itemId);
      community.compactSlot(accountId, item.slot);
    }
    const count = community.equipped(accountId).filter((r) => r.slot === item.slot).length;
    community.equipAt(accountId, item.slot, count, item.id);
  })();

  invalidate(accountId);
  pushLoadout(accountId);
  return loadout(accountId);
}

function unequip(accountId, itemId) {
  const item = catalog.getItem(itemId);
  if (!item) throw new EconomyError('Unknown item.', 'UNKNOWN_ITEM', 404);
  community.transaction(() => {
    community.unequip(accountId, item.id);
    community.compactSlot(accountId, item.slot);
  })();
  invalidate(accountId);
  pushLoadout(accountId);
  return loadout(accountId);
}

function setFavorite(accountId, itemId, on) {
  const item = catalog.getItem(itemId);
  if (!item) throw new EconomyError('Unknown item.', 'UNKNOWN_ITEM', 404);
  community.setFavorite(accountId, item.id, !!on);
  return community.favorites(accountId);
}

function ownsEmote(accountId, emoteId) {
  const item = catalog.getItem(emoteId);
  return !!item && item.slot === 'emote' && owns(accountId, item);
}

// --- leaderboard --------------------------------------------------------------

function rankSeats(seats) {
  const byAccount = new Map();
  seats.forEach((s) => {
    const row = byAccount.get(s.accountId) || {
      accountId: s.accountId, points: 0, matches: 0, wins: 0, podiums: 0,
    };
    row.points += rules.seasonPoints(s);
    row.matches += 1;
    const podium = rules.podiumPlace(s.place, s.playerCount);
    if (podium === 1 || (s.place == null && s.result === 'win')) row.wins += 1;
    if (podium) row.podiums += 1;
    byAccount.set(s.accountId, row);
  });
  return [...byAccount.values()]
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.matches - b.matches || a.accountId.localeCompare(b.accountId))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

function seasonSeats({ excludeMatchId = null } = {}) {
  const season = rules.leaderboardSeason();
  const seats = platformDb.finishedSeats(season.start, season.end);
  return excludeMatchId ? seats.filter((s) => s.matchId !== excludeMatchId) : seats;
}

function personOf(accountId) {
  const row = accountsDb.findById(accountId);
  if (!row || accountsDb.isBlocked(row)) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatarPath: row.avatar_path || null,
    cosmetics: cosmeticIds(row.id),
  };
}

function leaderboard(scope = 'season', viewerId = null, limit = 50) {
  const season = rules.leaderboardSeason();
  const seats = scope === 'all' ? platformDb.finishedSeats() : platformDb.finishedSeats(season.start, season.end);
  const ranked = rankSeats(seats)
    .map((row) => ({ ...row, player: personOf(row.accountId) }))
    .filter((row) => row.player)
    .map((row, i) => ({ ...row, rank: i + 1 }));
  const me = viewerId ? ranked.find((r) => r.accountId === viewerId) || null : null;
  return {
    scope: scope === 'all' ? 'all' : 'season',
    season,
    minMatches: rules.LEADERBOARD_MIN_MATCHES,
    rows: ranked.slice(0, limit),
    me,
    total: ranked.length,
  };
}

function ranksFor(accountId) {
  const season = rankSeats(seasonSeats()).find((r) => r.accountId === accountId) || null;
  const all = rankSeats(platformDb.finishedSeats()).find((r) => r.accountId === accountId) || null;
  return { season, all };
}

function claimLeaderboardRewards(accountId) {
  const mine = rankSeats(seasonSeats()).find((r) => r.accountId === accountId);
  if (!mine || mine.matches < rules.LEADERBOARD_MIN_MATCHES) {
    throw new EconomyError(`Finish at least ${rules.LEADERBOARD_MIN_MATCHES} games this season to claim leaderboard rewards.`, 'NOT_ELIGIBLE');
  }
  const granted = catalog.itemsWithRequirement('leaderboard')
    .filter((item) => mine.rank <= item.requirement.top)
    .filter((item) => community.grantItem(accountId, item.id, 'leaderboard'))
    .map((item) => item.id);
  granted.forEach((itemId) => notify(accountId, 'item_granted', { itemId, reason: 'leaderboard', rank: mine.rank }));
  return { rank: mine.rank, granted };
}

// --- match rewards ------------------------------------------------------------

function dayStart(ts) {
  return Date.parse(`${rules.utcDay(ts)}T00:00:00Z`);
}

function grantEarned(accountId, source, test, reason, granted) {
  catalog.itemsWithRequirement(source).forEach((item) => {
    if (test(item.requirement) && community.grantItem(accountId, item.id, source)) {
      granted.push({ itemId: item.id, reason });
    }
  });
}

function rewardSeat(match, seat, result) {
  const { accountId } = seat;
  if (!accountsDb.findById(accountId)) return null;
  ensureStarter(accountId);

  const playerCount = match.playerCount;
  const place = Number.isInteger(result.place) ? result.place : null;
  const podium = rules.podiumPlace(place, playerCount);
  const isWin = podium === 1 || (place == null && result.result === 'win');
  const endedAt = match.endedAt || Date.now();
  const events = rules.activeEvents(endedAt);
  const day = rules.utcDay(endedAt);
  const rankBefore = rankSeats(seasonSeats({ excludeMatchId: match.id })).find((r) => r.accountId === accountId)?.rank || null;

  const outcome = {
    accountId, reward: null, streak: null, achievements: [], granted: [], skipped: null,
  };

  community.transaction(() => {
    const tooShort = (match.durationMs || 0) < rules.MIN_MATCH_MS;
    const capped = community.ledgerCountSince(accountId, 'match', dayStart(endedAt)) >= rules.DAILY_REWARDED_MATCHES;
    if (tooShort) outcome.skipped = 'too_short';
    else if (capped) outcome.skipped = 'daily_cap';

    if (!outcome.skipped && !community.ledgerHas(accountId, 'match', match.id)) {
      const R = rules.MATCH_REWARDS;
      const multiplier = rules.tableMultiplier(playerCount);
      const breakdown = { participation: R.participation };
      if (podium) breakdown.place = Math.round(R.place[podium] * multiplier);
      else if (isWin) breakdown.win = Math.round(R.teamWin * multiplier);
      const subtotal = Object.values(breakdown).reduce((n, v) => n + v, 0);
      const eventMultiplier = events.reduce((m, e) => m * e.multiplier, 1);
      if (eventMultiplier > 1) breakdown.event = Math.round(subtotal * (eventMultiplier - 1));
      const amount = Object.values(breakdown).reduce((n, v) => n + v, 0);
      community.applyLedger({
        accountId,
        amount,
        kind: 'match',
        ref: match.id,
        details: {
          breakdown, gameType: match.gameType, place: podium, win: isWin, events: events.map((e) => e.id),
        },
      });
      let total = amount;
      if (isWin && community.applyLedger({
        accountId, amount: R.firstWinOfDay, kind: 'first_win_day', ref: day, details: { matchId: match.id },
      })) {
        breakdown.firstWin = R.firstWinOfDay;
        total += R.firstWinOfDay;
      }
      outcome.reward = { amount: total, breakdown };

      const streak = isWin ? community.wallet(accountId).winStreak + 1 : 0;
      community.setStreak(accountId, streak);
      rules.STREAK_REWARDS.forEach((s) => {
        if (streak === s.streak && community.applyLedger({
          accountId, amount: s.crowns, kind: 'streak', ref: `${s.streak}:${match.id}`,
        })) {
          outcome.streak = { streak, crowns: s.crowns };
        }
      });
      grantEarned(accountId, 'streak', (req) => streak >= req.streak, 'streak', outcome.granted);
      if (isWin && events.length) {
        grantEarned(accountId, 'event', (req) => events.some((e) => e.id === req.event), 'event', outcome.granted);
      }
    }

    // Seasonal badges and achievements pay out once each, whatever
    // happened to this particular match.
    const season = rules.seasonOf(endedAt);
    const seasonMatches = platformDb.finishedCountSince(accountId, rules.seasonStart(endedAt));
    grantEarned(accountId, 'season', (req) => req.season === season && seasonMatches >= req.matches, 'season', outcome.granted);

    const stats = platformDb.accountStats(accountId);
    const citadels = platformDb.citadelsStats(accountId);
    achievementsFor(stats, citadels).filter((a) => a.unlocked).forEach((a) => {
      const crowns = rules.ACHIEVEMENT_REWARDS[a.id] || 0;
      if (community.applyLedger({
        accountId, amount: crowns, kind: 'achievement', ref: a.id,
      })) {
        outcome.achievements.push({ id: a.id, crowns });
      }
      grantEarned(accountId, 'achievement', (req) => req.achievement === a.id, 'achievement', outcome.granted);
    });
  })();

  const rankAfter = rankSeats(seasonSeats()).find((r) => r.accountId === accountId)?.rank || null;
  const context = { gameType: match.gameType, matchId: match.id };

  if (outcome.reward) notify(accountId, 'reward', { ...context, amount: outcome.reward.amount, breakdown: outcome.reward.breakdown, place: podium });
  if (isWin) notify(accountId, 'win', { ...context, place: podium });
  else if (podium) notify(accountId, 'podium', { ...context, place: podium });
  if (outcome.streak) notify(accountId, 'streak', { ...context, ...outcome.streak });
  outcome.achievements.forEach((a) => notify(accountId, 'achievement', { achievement: a.id, crowns: a.crowns }));
  outcome.granted.forEach((g) => notify(accountId, 'item_granted', { itemId: g.itemId, reason: g.reason }));
  if (rankAfter && rankAfter <= 50 && (!rankBefore || rankAfter < rankBefore)) {
    notify(accountId, 'rank_up', { from: rankBefore, to: rankAfter, season: rules.leaderboardSeason().id });
    outcome.rankUp = { from: rankBefore, to: rankAfter };
  }
  pushWallet(accountId);
  return outcome;
}

// Called once, when the recorder closes a match. Guests earn nothing:
// there is no account to hold crowns.
function onMatchFinished(matchId, summary) {
  const match = platformDb.matchById(matchId);
  if (!match || match.status !== 'finished') return [];
  const results = summary?.results?.players || [];
  return (summary?.players || [])
    .filter((p) => p.accountId)
    .map((seat) => {
      try {
        return rewardSeat(match, seat, results.find((r) => r.playerId === seat.playerId) || {});
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Reward for match ${matchId} failed:`, err.message);
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = {
  EconomyError,
  VISIBLE_SLOTS,
  publicCatalog,
  accountEconomy,
  walletView,
  loadout,
  cosmeticIds,
  owns,
  ownsEmote,
  buy,
  equip,
  unequip,
  setFavorite,
  leaderboard,
  ranksFor,
  claimLeaderboardRewards,
  onMatchFinished,
  personOf,
};
