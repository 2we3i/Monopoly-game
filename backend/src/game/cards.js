// cards.js
// Chance and Community Chest card decks.
// Each card has a `type` the GameManager interprets, plus display `text`.
// `text` is a { en, ru } object rather than a plain string, so the client
// can render whichever language the viewing player has selected - the
// server itself has no concept of language, it just carries both and lets
// each browser pick.
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
  { text: { en: 'Advance to Start. Collect $200.', ru: 'Дойдите до Старта. Получите $200.' }, type: 'MOVE_TO', tile: 0 },
  { text: { en: 'Advance to Meridian Point.', ru: 'Дойдите до Meridian Point.' }, type: 'MOVE_TO', tile: 39 },
  { text: { en: 'Advance to Aurora Avenue.', ru: 'Дойдите до Aurora Avenue.' }, type: 'MOVE_TO', tile: 37 },
  { text: { en: 'Advance to the nearest Railroad. Pay double rent if owned.', ru: 'Дойдите до ближайшей железной дороги. Если она занята, заплатите двойную аренду.' }, type: 'MOVE_TO_NEAREST_RAILROAD', doubleRent: true },
  { text: { en: 'Advance to the nearest Utility.', ru: 'Дойдите до ближайшей коммунальной службы.' }, type: 'MOVE_TO_NEAREST_UTILITY' },
  { text: { en: 'Bank pays you a dividend of $50.', ru: 'Банк выплачивает вам дивиденды в размере $50.' }, type: 'COLLECT', amount: 50 },
  { text: { en: 'Get out of Jail Free. This card may be kept.', ru: 'Освобождение из тюрьмы бесплатно. Эту карту можно оставить себе.' }, type: 'GET_OUT_OF_JAIL' },
  { text: { en: 'Go back 3 spaces.', ru: 'Вернитесь на 3 клетки назад.' }, type: 'MOVE_RELATIVE', steps: -3 },
  { text: { en: 'Go directly to Jail.', ru: 'Отправляйтесь прямо в тюрьму.' }, type: 'GO_TO_JAIL' },
  { text: { en: 'Make general repairs: $25 per house, $100 per hotel.', ru: 'Проведите ремонт: $25 за каждый дом, $100 за каждый отель.' }, type: 'REPAIRS', perHouse: 25, perHotel: 100 },
  { text: { en: 'Speeding fine: pay $15.', ru: 'Штраф за превышение скорости: заплатите $15.' }, type: 'PAY', amount: 15 },
  { text: { en: 'Take a trip to West Station.', ru: 'Отправляйтесь на West Station.' }, type: 'MOVE_TO', tile: 35 },
  { text: { en: 'You have been elected chairman. Pay each player $50.', ru: 'Вас избрали председателем. Заплатите каждому игроку по $50.' }, type: 'PAY_EACH_PLAYER', amount: 50 },
  { text: { en: 'Your building loan matures. Collect $150.', ru: 'Ваш строительный заём погашен. Получите $150.' }, type: 'COLLECT', amount: 150 },
  { text: { en: 'You win a crossword competition. Collect $100.', ru: 'Вы выиграли конкурс кроссвордов. Получите $100.' }, type: 'COLLECT', amount: 100 },
  { text: { en: 'Advance to Jail / Just Visiting (do not pass GO).', ru: 'Отправляйтесь в тюрьму (Старт не проходите).' }, type: 'MOVE_TO', tile: 10, noGoCollect: true },
];

const CHEST_TEMPLATE = [
  { text: { en: 'Advance to Start. Collect $200.', ru: 'Дойдите до Старта. Получите $200.' }, type: 'MOVE_TO', tile: 0 },
  { text: { en: 'Bank error in your favor. Collect $200.', ru: 'Ошибка банка в вашу пользу. Получите $200.' }, type: 'COLLECT', amount: 200 },
  { text: { en: 'Doctor’s fee. Pay $50.', ru: 'Оплата услуг врача. Заплатите $50.' }, type: 'PAY', amount: 50 },
  { text: { en: 'From sale of stock you get $50.', ru: 'От продажи акций вы получаете $50.' }, type: 'COLLECT', amount: 50 },
  { text: { en: 'Get Out of Jail Free. This card may be kept.', ru: 'Освобождение из тюрьмы бесплатно. Эту карту можно оставить себе.' }, type: 'GET_OUT_OF_JAIL' },
  { text: { en: 'Go directly to Jail.', ru: 'Отправляйтесь прямо в тюрьму.' }, type: 'GO_TO_JAIL' },
  { text: { en: 'Holiday fund matures. Collect $100.', ru: 'Отпускной фонд созрел. Получите $100.' }, type: 'COLLECT', amount: 100 },
  { text: { en: 'Income tax refund. Collect $20.', ru: 'Возврат подоходного налога. Получите $20.' }, type: 'COLLECT', amount: 20 },
  { text: { en: 'It is your birthday. Collect $10 from every player.', ru: 'У вас день рождения. Получите по $10 от каждого игрока.' }, type: 'COLLECT_EACH_PLAYER', amount: 10 },
  { text: { en: 'Life insurance matures. Collect $100.', ru: 'Страховка жизни созрела. Получите $100.' }, type: 'COLLECT', amount: 100 },
  { text: { en: 'Pay hospital fees of $100.', ru: 'Оплатите больничные счета в размере $100.' }, type: 'PAY', amount: 100 },
  { text: { en: 'Pay school fees of $50.', ru: 'Оплатите школьные взносы в размере $50.' }, type: 'PAY', amount: 50 },
  { text: { en: 'Receive $25 consultancy fee.', ru: 'Получите $25 за консультационные услуги.' }, type: 'COLLECT', amount: 25 },
  { text: { en: 'You are assessed for street repairs: $40 per house, $115 per hotel.', ru: 'С вас взимается сбор на ремонт улиц: $40 за дом, $115 за отель.' }, type: 'REPAIRS', perHouse: 40, perHotel: 115 },
  { text: { en: 'You have won second prize in a beauty contest. Collect $10.', ru: 'Вы заняли второе место в конкурсе красоты. Получите $10.' }, type: 'COLLECT', amount: 10 },
  { text: { en: 'You inherit $100.', ru: 'Вы получили наследство в размере $100.' }, type: 'COLLECT', amount: 100 },
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
