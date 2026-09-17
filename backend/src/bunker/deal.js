// deal.js
// Dealing characters, baggage, secrets and action cards.
//
// Two things make this more than a shuffle. Rarity: a legendary item must
// turn up far less often than a common one, and a table can bend or ignore
// that. And slots: a character can hold up to four bags and two secrets,
// all drawn from one deck, and must never be dealt the same card twice.

const content = require('./content');
const actionCards = require('./actionCards');

// How much of the ridiculous shelf a table wants. 'off' removes it
// altogether, 'only' plays nothing else, and the three in between decide
// how often an absurd card turns up next to a serious one.
const ABSURD_WEIGHT = {
  off: 0, light: 0.35, normal: 1, full: 3, only: 1,
};

function weightFor(entry, bias, absurdity = 'normal') {
  const absurdFactor = entry.a ? (ABSURD_WEIGHT[absurdity] ?? 1) : 1;
  if (absurdFactor === 0) return 0;
  if (bias === 'flat') return absurdFactor;
  const base = content.RARITY_WEIGHT[entry.r || 'common'] || 1;
  if (bias === 'rare') {
    // Flatten towards the rare end without ever making a common card
    // impossible: the square root pulls the extremes together.
    return Math.sqrt(base) * absurdFactor;
  }
  return base * absurdFactor;
}

// One entry out of `deck`, chosen by weight. Returns null for an empty deck.
function weightedPick(deck, bias, rng, absurdity = 'normal') {
  if (!deck.length) return null;
  const weights = deck.map((entry) => weightFor(entry, bias, absurdity));
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

// How absurd this table is playing. Unknown values (an old save, a hand
// written config) read as 'normal', which is the catalogue's own weights.
function absurdityOf(settings) {
  const level = settings?.characters?.absurdity;
  return ABSURD_WEIGHT[level] === undefined ? 'normal' : level;
}

// The deck a key is dealt from, narrowed to what the table allows. The
// absurdity dial only ever REMOVES cards here: making them more or less
// likely is the weighting's job, so a table at 'light' can still be dealt
// a ghost hunter.
function deckForKey(key, settings) {
  const def = content.categoryDef(key);
  if (!def || !def.deck) return [];
  const base = def.deck === 'baggage' ? baggageDeck(settings) : content.DECKS[def.deck] || [];
  const absurdity = absurdityOf(settings);
  if (absurdity === 'off') {
    const straight = base.filter((entry) => !entry.a);
    return straight.length ? straight : base;
  }
  if (absurdity === 'only') {
    const silly = base.filter((entry) => entry.a);
    // A deck with nothing absurd in it still has to deal something.
    return silly.length ? silly : base;
  }
  return base;
}

// Deals one whole table.
//
// `balanced` hands out each card at most once across the whole table, so no
// two players share a profession as long as the deck is big enough.
// `chaotic` draws freely - duplicates are part of the fun.
function dealTable(players, settings, rng = Math.random) {
  const bias = settings.characters.rarityBias;
  const absurdity = absurdityOf(settings);
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
      const picked = weightedPick(pool, bias, rng, absurdity);
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
  const picked = weightedPick(pool, settings.characters.rarityBias, rng, absurdityOf(settings));
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
  ABSURD_WEIGHT,
  absurdityOf,
  shuffle, weightedPick, biologyCard, baggageDeck, deckForKey, dealTable, drawReplacement, dealActionCards, drawActionCard,
};
