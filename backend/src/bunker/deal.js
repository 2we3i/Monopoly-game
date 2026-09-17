// deal.js
// Dealing characters, baggage, secrets and action cards.
//
// Two things make this more than a shuffle. Rarity: a legendary item must
// turn up far less often than a common one, and a table can bend or ignore
// that. And slots: a character can hold up to four bags and two secrets,
// all drawn from one deck, and must never be dealt the same card twice.

const content = require('./content');
const actionCards = require('./actionCards');

function weightFor(entry, bias) {
  if (bias === 'flat') return 1;
  const base = content.RARITY_WEIGHT[entry.r || 'common'] || 1;
  if (bias === 'rare') {
    // Flatten towards the rare end without ever making a common card
    // impossible: the square root pulls the extremes together.
    return Math.sqrt(base);
  }
  return base;
}

// One entry out of `deck`, chosen by weight. Returns null for an empty deck.
function weightedPick(deck, bias, rng) {
  if (!deck.length) return null;
  const weights = deck.map((entry) => weightFor(entry, bias));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return deck[Math.floor(rng() * deck.length)];
  let roll = rng() * total;
  for (let i = 0; i < deck.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return deck[i];
  }
  return deck[deck.length - 1];
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Gender and age. Ages cluster in the middle years - three rolls averaged
// give a gentle bell rather than a flat spread.
function biologyCard(rng) {
  const gender = rng() < 0.5 ? 'male' : 'female';
  const age = 18 + Math.floor(((rng() + rng() + rng()) / 3) * 64);
  return { gender, age };
}

// A table's baggage shelf, narrowed to the rarities it allows. If a table
// allows only rarities that nothing has, the whole shelf comes back so the
// deal still works.
function baggageDeck(settings) {
  const allowed = settings.baggage.rarities;
  const deck = content.DECKS.baggage.filter((item) => allowed.includes(item.r || 'common'));
  return deck.length ? deck : content.DECKS.baggage;
}

function deckForKey(key, settings) {
  const def = content.categoryDef(key);
  if (!def || !def.deck) return [];
  if (def.deck === 'baggage') return baggageDeck(settings);
  return content.DECKS[def.deck] || [];
}

// Deals one whole table.
//
// `balanced` hands out each card at most once across the whole table, so no
// two players share a profession as long as the deck is big enough.
// `chaotic` draws freely - duplicates are part of the fun.
function dealTable(players, settings, rng = Math.random) {
  const bias = settings.characters.rarityBias;
  const balanced = settings.characters.randomness === 'balanced';
  const categories = settings.characters.categories;

  // What has already gone out, per deck, so `balanced` can avoid repeats.
  const usedByDeck = new Map();
  const takenBy = (deckName) => {
    if (!usedByDeck.has(deckName)) usedByDeck.set(deckName, new Set());
    return usedByDeck.get(deckName);
  };

  return players.map(() => {
    const hand = {};
    // Within one character, a slot group (the bags, the secrets) never
    // repeats even in chaotic mode - holding the same rifle twice is
    // nonsense rather than chaos.
    const ownedInSlot = new Map();

    categories.forEach((key) => {
      if (key === 'biology') {
        hand.biology = biologyCard(rng);
        return;
      }
      const def = content.categoryDef(key);
      if (!def || !def.deck) return;
      const slot = def.slot || key;
      if (!ownedInSlot.has(slot)) ownedInSlot.set(slot, new Set());
      const mine = ownedInSlot.get(slot);
      const used = takenBy(def.deck);

      let pool = deckForKey(key, settings).filter((entry) => !mine.has(entry.id));
      if (balanced) {
        const fresh = pool.filter((entry) => !used.has(entry.id));
        // Once a deck is exhausted the table starts repeating rather than
        // dealing nothing - a big table with a small deck still plays.
        if (fresh.length) pool = fresh;
      }
      const picked = weightedPick(pool, bias, rng);
      if (!picked) return;
      mine.add(picked.id);
      used.add(picked.id);
      hand[key] = { id: picked.id };
      // A hidden property is attached at the deal but stays sealed: only
      // an action card or an event ever turns it face up.
      if (settings.baggage.specialProperties && picked.hidden) {
        hand[key].property = picked.hidden;
      }
    });
    return hand;
  });
}

// A single replacement card for one slot, avoiding everything the player
// already holds in that slot group.
function drawReplacement(key, player, settings, rng = Math.random) {
  const def = content.categoryDef(key);
  if (!def || !def.deck) return null;
  const slot = def.slot || key;
  const owned = new Set(content.ALL_CATEGORY_KEYS
    .filter((k) => (content.categoryDef(k)?.slot || k) === slot && player.cards[k])
    .map((k) => player.cards[k].id));
  const pool = deckForKey(key, settings).filter((entry) => !owned.has(entry.id));
  const picked = weightedPick(pool, settings.characters.rarityBias, rng);
  if (!picked) return null;
  const out = { id: picked.id };
  if (settings.baggage.specialProperties && picked.hidden) out.property = picked.hidden;
  return out;
}

// The action cards one player starts with. A slot can come up empty when
// the table plays with a draw chance below one, which is how "probability
// of getting a card" is expressed.
function dealActionCards(settings, rng = Math.random) {
  if (!settings.actionCards.enabled || settings.actionCards.perPlayer <= 0) return [];
  const deck = settings.actionCards.deck.map((id) => actionCards.cardDef(id)).filter(Boolean);
  if (!deck.length) return [];
  // An action card carries its own weight rather than a rarity, so the
  // draw reads that directly instead of going through the rarity table.
  const total = deck.reduce((sum, d) => sum + (d.weight || 1), 0);
  const pickOne = () => {
    let roll = rng() * total;
    for (let i = 0; i < deck.length; i += 1) {
      roll -= deck[i].weight || 1;
      if (roll <= 0) return deck[i];
    }
    return deck[deck.length - 1];
  };

  const out = [];
  for (let i = 0; i < settings.actionCards.perPlayer; i += 1) {
    // A slot below the draw chance simply stays empty - that is how
    // "probability of getting a card" is expressed.
    if (rng() > settings.actionCards.drawChance) continue;
    out.push({ id: pickOne().id, usedAt: null });
  }
  return out;
}

// One extra action card, for the event that hands them out mid-game.
function drawActionCard(settings, rng = Math.random) {
  const [one] = dealActionCards({ ...settings, actionCards: { ...settings.actionCards, perPlayer: 1, drawChance: 1 } }, rng);
  return one || null;
}

module.exports = {
  shuffle, weightedPick, biologyCard, baggageDeck, deckForKey, dealTable, drawReplacement, dealActionCards, drawActionCard,
};
