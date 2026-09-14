// roles.js
// The characters of Citadels, as data.
//
// The engine never branches on a role's name. It reads the fields below:
//
//   rank               the order roles are called in each round (1..n)
//   incomeType         a district type this role collects income from
//   takesCrown         the holder becomes first to choose next round
//   resourceBonusGold  extra gold whenever the holder takes resources
//   turnStartCards     cards drawn automatically when the role is called
//   buildLimit         districts that may be built in one turn (default 1)
//   protectsCity       the Warlord cannot touch this player's city
//   ability            key into abilities.js for the role's active power
//
// A new role is a new entry here (and an ability in abilities.js if it
// has an active one); drafting, calling order, the role track in the UI
// and the stats all pick it up from this table.

const ROLES = {
  ASSASSIN: {
    id: 'ASSASSIN',
    rank: 1,
    ability: 'KILL_ROLE',
    name: { en: 'Assassin', ru: 'Убийца' },
    text: {
      en: 'Secretly name a role. Its holder loses their whole turn.',
      ru: 'Тайно назовите роль. Её владелец пропустит весь ход.',
    },
  },
  THIEF: {
    id: 'THIEF',
    rank: 2,
    ability: 'ROB_ROLE',
    name: { en: 'Thief', ru: 'Вор' },
    text: {
      en: 'Secretly name a role. When it is called, you take all its gold before it can act.',
      ru: 'Тайно назовите роль. Когда её вызовут, вы заберёте всё её золото раньше, чем она начнёт ход.',
    },
  },
  MAGICIAN: {
    id: 'MAGICIAN',
    rank: 3,
    ability: 'MAGIC',
    name: { en: 'Magician', ru: 'Чародей' },
    text: {
      en: 'Swap your hand with another player, or discard cards and draw as many.',
      ru: 'Обменяйтесь картами с игроком или сбросьте карты и возьмите столько же.',
    },
  },
  KING: {
    id: 'KING',
    rank: 4,
    incomeType: 'RESIDENTIAL',
    takesCrown: true,
    name: { en: 'King', ru: 'Король' },
    text: {
      en: 'Takes the crown and picks first next round. Income from residential districts.',
      ru: 'Забирает корону и выбирает роль первым в следующем раунде. Доход с жилых кварталов.',
    },
  },
  BISHOP: {
    id: 'BISHOP',
    rank: 5,
    incomeType: 'RELIGIOUS',
    protectsCity: true,
    name: { en: 'Bishop', ru: 'Епископ' },
    text: {
      en: 'The Warlord cannot destroy your districts. Income from religious districts.',
      ru: 'Кондотьер не может разрушать ваши кварталы. Доход с религиозных кварталов.',
    },
  },
  MERCHANT: {
    id: 'MERCHANT',
    rank: 6,
    incomeType: 'TRADE',
    resourceBonusGold: 1,
    name: { en: 'Merchant', ru: 'Купец' },
    text: {
      en: '+1 gold whenever you take resources. Income from trade districts.',
      ru: '+1 золото при получении ресурсов. Доход с торговых кварталов.',
    },
  },
  ARCHITECT: {
    id: 'ARCHITECT',
    rank: 7,
    turnStartCards: 2,
    buildLimit: 3,
    name: { en: 'Architect', ru: 'Зодчий' },
    text: {
      en: 'Draw 2 extra cards when called. Build up to 3 districts.',
      ru: 'Берёт 2 дополнительные карты. Может построить до 3 кварталов.',
    },
  },
  WARLORD: {
    id: 'WARLORD',
    rank: 8,
    incomeType: 'MILITARY',
    ability: 'DESTROY',
    name: { en: 'Warlord', ru: 'Кондотьер' },
    text: {
      en: 'Destroy a district by paying its cost minus 1. Income from military districts.',
      ru: 'Разрушьте квартал, заплатив его стоимость минус 1. Доход с военных кварталов.',
    },
  },
};

const ROLE_ORDER = Object.values(ROLES).sort((a, b) => a.rank - b.rank).map((r) => r.id);

function roleDef(id) {
  return ROLES[id] || null;
}

module.exports = { ROLES, ROLE_ORDER, roleDef };
