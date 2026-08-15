// cards.js
// Chance and Community Chest card decks.
// Each card has a `type` the GameManager interprets, plus display `text`.
//
// Types:
//  MOVE_TO(tile)        - move to absolute tile id (collect GO if passed)
//  MOVE_RELATIVE(steps) - move forward/back N steps
//  COLLECT(amount)      - gain money from bank
//  PAY(amount)          - pay money to bank
//  PAY_EACH_PLAYER(amt) - pay every other player
//  COLLECT_EACH_PLAYER  - collect from every other player
//  GO_TO_JAIL            - send directly to jail
//  GET_OUT_OF_JAIL        - grants a usable "get out of jail free" card
//  REPAIRS(perHouse, perHotel) - pay based on houses/hotels owned

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CHANCE_TEMPLATE = [
  { text: 'Advance to Start. Collect $200.', type: 'MOVE_TO', tile: 0 },
  { text: 'Advance to Meridian Point.', type: 'MOVE_TO', tile: 39 },
  { text: 'Advance to Aurora Avenue.', type: 'MOVE_TO', tile: 37 },
  { text: 'Advance to the nearest Railroad. Pay double rent if owned.', type: 'MOVE_TO_NEAREST_RAILROAD', doubleRent: true },
  { text: 'Advance to the nearest Utility.', type: 'MOVE_TO_NEAREST_UTILITY' },
  { text: 'Bank pays you a dividend of $50.', type: 'COLLECT', amount: 50 },
  { text: 'Get out of Jail Free. This card may be kept.', type: 'GET_OUT_OF_JAIL' },
  { text: 'Go back 3 spaces.', type: 'MOVE_RELATIVE', steps: -3 },
  { text: 'Go directly to Jail.', type: 'GO_TO_JAIL' },
  { text: 'Make general repairs: $25 per house, $100 per hotel.', type: 'REPAIRS', perHouse: 25, perHotel: 100 },
  { text: 'Speeding fine: pay $15.', type: 'PAY', amount: 15 },
  { text: 'Take a trip to West Station.', type: 'MOVE_TO', tile: 35 },
  { text: 'You have been elected chairman. Pay each player $50.', type: 'PAY_EACH_PLAYER', amount: 50 },
  { text: 'Your building loan matures. Collect $150.', type: 'COLLECT', amount: 150 },
  { text: 'You win a crossword competition. Collect $100.', type: 'COLLECT', amount: 100 },
  { text: 'Advance to Jail / Just Visiting (do not pass GO).', type: 'MOVE_TO', tile: 10, noGoCollect: true },
];

const CHEST_TEMPLATE = [
  { text: 'Advance to Start. Collect $200.', type: 'MOVE_TO', tile: 0 },
  { text: 'Bank error in your favor. Collect $200.', type: 'COLLECT', amount: 200 },
  { text: 'Doctor’s fee. Pay $50.', type: 'PAY', amount: 50 },
  { text: 'From sale of stock you get $50.', type: 'COLLECT', amount: 50 },
  { text: 'Get Out of Jail Free. This card may be kept.', type: 'GET_OUT_OF_JAIL' },
  { text: 'Go directly to Jail.', type: 'GO_TO_JAIL' },
  { text: 'Holiday fund matures. Collect $100.', type: 'COLLECT', amount: 100 },
  { text: 'Income tax refund. Collect $20.', type: 'COLLECT', amount: 20 },
  { text: 'It is your birthday. Collect $10 from every player.', type: 'COLLECT_EACH_PLAYER', amount: 10 },
  { text: 'Life insurance matures. Collect $100.', type: 'COLLECT', amount: 100 },
  { text: 'Pay hospital fees of $100.', type: 'PAY', amount: 100 },
  { text: 'Pay school fees of $50.', type: 'PAY', amount: 50 },
  { text: 'Receive $25 consultancy fee.', type: 'COLLECT', amount: 25 },
  { text: 'You are assessed for street repairs: $40 per house, $115 per hotel.', type: 'REPAIRS', perHouse: 40, perHotel: 115 },
  { text: 'You have won second prize in a beauty contest. Collect $10.', type: 'COLLECT', amount: 10 },
  { text: 'You inherit $100.', type: 'COLLECT', amount: 100 },
];

class CardDeck {
  constructor(template) {
    this.template = template;
    this.deck = shuffle(template.map((c, i) => ({ ...c, id: i })));
    this.pointer = 0;
  }

  draw() {
    if (this.pointer >= this.deck.length) {
      this.deck = shuffle(this.template.map((c, i) => ({ ...c, id: i })));
      this.pointer = 0;
    }
    const card = this.deck[this.pointer];
    this.pointer += 1;
    return card;
  }

  // Serialize minimal state for persistence
  serialize() {
    return { order: this.deck.map((c) => c.id), pointer: this.pointer };
  }

  restore(state, template) {
    if (!state) return;
    this.deck = state.order.map((id) => ({ ...template[id], id }));
    this.pointer = state.pointer;
  }
}

module.exports = { CHANCE_TEMPLATE, CHEST_TEMPLATE, CardDeck };
