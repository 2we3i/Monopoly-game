// events.js
// Random events - things that happen TO the bunker rather than between the
// players. An event changes the shelter itself: how many places it has,
// how long the food lasts, which rooms still work, which skill has just
// become useless.
//
// Like the action cards, each event declares what it does; the engine only
// applies the declaration. A table can switch the whole system off, or pick
// which events are in the deck.

const content = require('./content');

const EVENTS = [
  {
    id: 'resource_loss',
    apply: (game) => {
      const before = game.bunker.foodMonths;
      game.bunker.foodMonths = Math.max(1, Math.round(before / 2));
      return { foodMonths: game.bunker.foodMonths, before };
    },
  },
  {
    id: 'room_lost',
    apply: (game) => {
      if (!game.bunker.rooms.length) return null;
      const idx = Math.floor(game.rng() * game.bunker.rooms.length);
      const [lost] = game.bunker.rooms.splice(idx, 1);
      return { room: lost };
    },
  },
  {
    id: 'new_resource',
    apply: (game) => {
      const gained = 3 + Math.floor(game.rng() * 9);
      game.bunker.foodMonths += gained;
      return { gained, foodMonths: game.bunker.foodMonths };
    },
  },
  {
    id: 'new_room',
    apply: (game, { rooms }) => {
      const available = rooms.filter((r) => !game.bunker.rooms.includes(r.id));
      if (!available.length) return null;
      const room = available[Math.floor(game.rng() * available.length)];
      game.bunker.rooms.push(room.id);
      return { room: room.id };
    },
  },
  {
    id: 'seats_lost',
    apply: (game) => {
      // Never below a single place: the shelter always holds someone.
      // (The old guard compared the seat count against itself, so this
      // event could only ever fire in a position the game was about to
      // end in - which is to say, almost never.)
      if (game.seats <= 1) return null;
      game.seats -= 1;
      return { seats: game.seats };
    },
  },
  {
    id: 'seats_gained',
    apply: (game) => {
      if (game.seats >= game.alivePlayers().length - 1) return null;
      game.seats += 1;
      return { seats: game.seats };
    },
  },
  {
    id: 'collapse',
    apply: (game) => {
      const before = game.bunker.area;
      game.bunker.area = Math.max(20, Math.round(before * 0.7));
      return { area: game.bunker.area, before };
    },
  },
  {
    id: 'skill_useless',
    apply: (game) => {
      // One category stops mattering for the final verdict. It is still
      // revealed and still argued about - it just no longer scores.
      const keys = game.categoriesInPlay().filter((k) => k !== 'biology' && !game.mutedCategories.includes(k));
      if (!keys.length) return null;
      const key = keys[Math.floor(game.rng() * keys.length)];
      game.mutedCategories.push(key);
      return { key };
    },
  },
  {
    id: 'illness',
    apply: (game) => {
      const alive = game.alivePlayers();
      if (!alive.length) return null;
      const victim = alive[Math.floor(game.rng() * alive.length)];
      game.addEffect('ill', { playerId: victim.id }, 'game');
      return { playerId: victim.id, name: victim.nickname, number: victim.number };
    },
  },
  {
    id: 'inspection',
    apply: (game) => {
      // Everyone still holding a closed card shows one, chosen for them.
      const opened = [];
      game.alivePlayers().forEach((p) => {
        const hidden = game.hiddenKeys(p);
        if (!hidden.length) return;
        const key = hidden[Math.floor(game.rng() * hidden.length)];
        game.forceReveal(p, key);
        opened.push({ playerId: p.id, key });
      });
      return opened.length ? { opened } : null;
    },
  },
  {
    id: 'blackout',
    apply: (game) => {
      // The next vote is taken in the dark: nobody sees who voted for whom.
      game.addEffect('secretVote', {}, 'nextVote');
      return {};
    },
  },
  {
    // Something in the shelter breaks. A room goes, and for one round
    // nobody can play an action card - there is no time for tricks while
    // the table is fixing a pump.
    id: 'equipment_failure',
    apply: (game) => {
      if (!game.bunker.rooms.length) return null;
      const idx = Math.floor(game.rng() * game.bunker.rooms.length);
      const [broken] = game.bunker.rooms.splice(idx, 1);
      game.addEffect('noCards', {}, 'round');
      return { room: broken };
    },
  },
  {
    // The water runs short. Everyone has to say more about themselves
    // than they meant to: the round gets an extra reveal.
    id: 'water_shortage',
    apply: (game) => {
      const before = game.bunker.foodMonths;
      game.bunker.foodMonths = Math.max(1, before - (2 + Math.floor(game.rng() * 4)));
      game.alivePlayers().forEach((p) => game.addEffect('extraReveal', { playerId: p.id }, 'round'));
      return { foodMonths: game.bunker.foodMonths, before };
    },
  },
  {
    // Two people are at each other's throats. They both have to open a
    // card, and this round's vote is between the two of them alone.
    id: 'argument',
    apply: (game) => {
      const alive = game.alivePlayers();
      if (alive.length < 3) return null;
      const pool = [...alive];
      const pick = () => pool.splice(Math.floor(game.rng() * pool.length), 1)[0];
      const a = pick();
      const b = pick();
      [a, b].forEach((p) => {
        const hidden = game.hiddenKeys(p);
        if (hidden.length) game.forceReveal(p, hidden[Math.floor(game.rng() * hidden.length)]);
      });
      game.addEffect('duel', { playerIds: [a.id, b.id] }, 'nextVote');
      return {
        a: a.nickname, aNumber: a.number, b: b.nickname, bNumber: b.number, playerIds: [a.id, b.id],
      };
    },
  },
  {
    // The lights go out. No action cards this round, and the bunker eats
    // through its stores faster in the cold.
    id: 'power_out',
    apply: (game) => {
      game.addEffect('noCards', {}, 'round');
      const before = game.bunker.foodMonths;
      game.bunker.foodMonths = Math.max(1, before - 1);
      game.addEffect('secretVote', {}, 'nextVote');
      return { foodMonths: game.bunker.foodMonths, before };
    },
  },
  {
    // Something is found in a sealed locker and handed to one person -
    // who does not get to look at it until they open it in front of
    // everyone.
    id: 'unknown_item',
    apply: (game) => {
      // The first baggage slot this game is NOT already playing with.
      const spare = content.BAGGAGE_KEYS.find((k) => !game.categoriesInPlay().includes(k));
      if (!spare) return null;
      const alive = game.alivePlayers();
      if (!alive.length) return null;
      const lucky = alive[Math.floor(game.rng() * alive.length)];
      const drawn = game.drawReplacement(spare, lucky);
      if (!drawn) return null;
      // The slot joins this game's character sheet, empty for everyone
      // else - which is exactly what it is.
      if (!game.categories) game.categories = [...game.categoriesInPlay()];
      game.categories = content.ALL_CATEGORY_KEYS
        .filter((k) => game.categories.includes(k) || k === spare);
      lucky.cards[spare] = drawn;
      // Sealed even from its owner until they open it.
      if (!lucky.blind.includes(spare)) lucky.blind.push(spare);
      return {
        key: spare, playerId: lucky.id, name: lucky.nickname, number: lucky.number,
      };
    },
  },
  {
    // The forecast changes: the surface stays deadly for longer, or
    // clears sooner than anyone dared hope.
    id: 'conditions_change',
    apply: (game) => {
      const current = game.catastropheMonths();
      const delta = game.rng() < 0.5 ? -(2 + Math.floor(game.rng() * 6)) : (3 + Math.floor(game.rng() * 10));
      const months = Math.max(2, current + delta);
      if (months === current) return null;
      game.catastrophe = { ...game.catastrophe, months };
      return { months, before: current, longer: months > current };
    },
  },
  {
    // The shelter needs one kind of person right now, and everybody who
    // has been quiet about it has to speak.
    id: 'specialist_needed',
    apply: (game) => {
      const keys = game.categoriesInPlay().filter((k) => k !== 'biology');
      if (!keys.length) return null;
      const key = keys[Math.floor(game.rng() * keys.length)];
      const opened = [];
      game.alivePlayers().forEach((p) => {
        if (p.revealed.includes(key) || p.cards[key] === undefined) return;
        if (game.forceReveal(p, key)) opened.push(p.id);
      });
      if (!opened.length) return null;
      return { key, count: opened.length };
    },
  },
  {
    // Part of the stores is contaminated - and whoever ate from it first
    // is ill for the rest of the game.
    id: 'contamination',
    apply: (game) => {
      const before = game.bunker.foodMonths;
      game.bunker.foodMonths = Math.max(1, Math.round(before * 0.65));
      const alive = game.alivePlayers().filter((p) => !game.hasEffect('ill', p.id));
      if (!alive.length) return { foodMonths: game.bunker.foodMonths, before };
      const victim = alive[Math.floor(game.rng() * alive.length)];
      game.addEffect('ill', { playerId: victim.id }, 'game');
      return {
        foodMonths: game.bunker.foodMonths, before, name: victim.nickname, number: victim.number,
      };
    },
  },
  {
    // The air will not stretch to everyone: this round's vote sends two
    // people out instead of one.
    id: 'double_exclusion',
    apply: (game) => {
      // Only when there is actually room to lose two people.
      if (game.alivePlayers().length - game.seats < 2) return null;
      if (game.hasEffect('doubleExclusion')) return null;
      game.addEffect('doubleExclusion', {}, 'nextVote');
      return {};
    },
  },
  {
    id: 'extra_cards',
    apply: (game) => {
      if (!game.settings.actionCards.enabled) return null;
      const dealt = [];
      game.alivePlayers().forEach((p) => {
        const drawn = game.dealActionCard(p);
        if (drawn) dealt.push({ playerId: p.id });
      });
      return dealt.length ? { count: dealt.length } : null;
    },
  },
];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));
const ALL_IDS = EVENTS.map((e) => e.id);

function eventDef(id) {
  return BY_ID.get(id) || null;
}

function catalogue() {
  return ALL_IDS.map((id) => ({ id }));
}

module.exports = { EVENTS, ALL_IDS, eventDef, catalogue };
