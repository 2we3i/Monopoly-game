// events.js
// Random events - things that happen TO the bunker rather than between the
// players. An event changes the shelter itself: how many places it has,
// how long the food lasts, which rooms still work, which skill has just
// become useless.
//
// Like the action cards, each event declares what it does; the engine only
// applies the declaration. A table can switch the whole system off, or pick
// which events are in the deck.

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
      // Never below one place, and never below the number of people who
      // are already inside - an event must not decide the game outright.
      const floor = Math.max(1, Math.min(game.seats, game.alivePlayers().length - 1));
      if (game.seats <= floor) return null;
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
