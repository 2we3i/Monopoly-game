// logFormatter.js
// Turns a structured log entry into a localized display sentence.

import { getTileName } from '../boardData';

const LOG_TEMPLATES = {
  PLAYER_JOINED: { en: '{name} joined the room.', ru: '{name} присоединился к комнате.' },
  PLAYER_LEFT: { en: '{name} left the room.', ru: '{name} покинул комнату.' },
  PLAYER_DISCONNECTED: { en: '{name} disconnected.', ru: '{name} отключился.' },
  PLAYER_RECONNECTED: { en: '{name} reconnected.', ru: '{name} снова подключился.' },
  GAME_STARTED: { en: 'The game has started! Good luck.', ru: 'Игра началась! Удачи.' },
  NEW_TURN: { en: "It's {name}'s turn.", ru: 'Ход игрока {name}.' },
  WIN: { en: '{name} wins the game!', ru: '{name} побеждает в игре!' },
  SPEEDING_TO_JAIL: { en: '{name} rolled doubles three times in a row and was sent to Jail!', ru: '{name} трижды подряд выбросил дубль и отправляется в тюрьму!' },
  JAIL_DOUBLES_OUT: { en: '{name} rolled doubles and got out of Jail!', ru: '{name} выбросил дубль и вышел из тюрьмы!' },
  JAIL_FAILED_ATTEMPT: { en: '{name} failed to roll doubles in Jail (attempt {attempt}/{max}).', ru: '{name} не смог выбросить дубль в тюрьме (попытка {attempt} из {max}).' },
  PAID_JAIL_FINE: { en: '{name} paid ${amount} to get out of Jail.', ru: '{name} заплатил ${amount}, чтобы выйти из тюрьмы.' },
  USED_JAIL_CARD: { en: '{name} used a Get Out of Jail Free card.', ru: '{name} использовал карту освобождения из тюрьмы.' },
  COLLECTED_GO: { en: '{name} passed Start and collected ${amount}.', ru: '{name} прошёл через Старт и получил ${amount}.' },
  SENT_TO_JAIL: { en: '{name} was sent to Jail!', ru: '{name} отправляется в тюрьму!' },
  FREE_PARKING_COLLECT: { en: '{name} landed on Free Parking and collected ${amount}!', ru: '{name} попал на бесплатную парковку и получил ${amount}!' },
  PAID_TAX: { en: '{name} paid ${amount} in {tileName}.', ru: '{name} заплатил ${amount} ({tileName}).' },
  PAID_RENT: { en: '{name} paid ${amount} rent to {ownerName} for {tileName}.', ru: '{name} заплатил {ownerName} ${amount} аренды за {tileName}.' },
  DREW_CARD: { en: '{name} drew: {cardText}', ru: '{name} вытянул карту: {cardText}' },
  BOUGHT_PROPERTY: { en: '{name} bought {tileName} for ${amount}.', ru: '{name} купил {tileName} за ${amount}.' },
  DECLINED_PURCHASE: { en: '{name} declined to buy {tileName}.', ru: '{name} отказался покупать {tileName}.' },
  MORTGAGED: { en: '{name} mortgaged {tileName}.', ru: '{name} заложил {tileName}.' },
  UNMORTGAGED: { en: '{name} paid off the mortgage on {tileName}.', ru: '{name} погасил залог на {tileName}.' },
  BUILT_HOUSE: { en: '{name} built house #{houseNumber} on {tileName}.', ru: '{name} построил дом №{houseNumber} на {tileName}.' },
  BUILT_HOTEL: { en: '{name} built a hotel on {tileName}.', ru: '{name} построил отель на {tileName}.' },
  SOLD_HOUSE: { en: '{name} sold a house on {tileName}.', ru: '{name} продал дом на {tileName}.' },
  DOUBLES_AGAIN: { en: '{name} rolled doubles and goes again!', ru: '{name} выбросил дубль и ходит снова!' },
  BANKRUPTCY: { en: '{name} declared bankruptcy and is out of the game.', ru: '{name} объявил банкротство и выбывает из игры.' },
  AUTO_SKIPPED: { en: '{name} was auto-skipped after a long disconnect.', ru: '{name} был автоматически пропущен из-за долгого отключения.' },
  PLAYER_JOINED_CHAT: { en: '{name} joined.', ru: '{name} присоединился.' },
  TRADE_PROPOSED: { en: '{name} proposed a trade to {otherName}.', ru: '{name} предложил сделку игроку {otherName}.' },
  TRADE_ACCEPTED: { en: '{name} and {otherName} completed a trade.', ru: '{name} и {otherName} завершили сделку.' },
  TRADE_DECLINED: { en: '{name} declined a trade from {otherName}.', ru: '{name} отклонил сделку от {otherName}.' },
  TRADE_CANCELLED: { en: '{name} cancelled a trade offer.', ru: '{name} отменил предложение сделки.' },
  CUSTOM_PRICE_SET: { en: '{name} set a special rent of ${amount} for {targetName} on {tileName}.', ru: '{name} установил особую аренду ${amount} для {targetName} на {tileName}.' },
  CUSTOM_PRICE_CLEARED: { en: '{name} removed the special rent for {targetName} on {tileName}.', ru: '{name} убрал особую аренду для {targetName} на {tileName}.' },
};

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function formatLogEntry(entry, t, language, board) {
  if (!entry.type) {
    return entry.message;
  }
  const template = LOG_TEMPLATES[entry.type];
  if (!template) return entry.message;

  const localized = template[language] || template.en;
  const params = { ...(entry.params || {}) };

  if ('tileId' in params && board) {
    const tile = board[params.tileId];
    params.tileName = getTileName(tile, language);
  }
  if (params.cardText && typeof params.cardText === 'object') {
    params.cardText = params.cardText[language] || params.cardText.en;
  }

  return interpolate(localized, params);
}
