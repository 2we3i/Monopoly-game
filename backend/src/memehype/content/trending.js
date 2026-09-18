// trending.js
// МЕМЫ 4: «В тренде» - the pack that comes from the shared spreadsheet of
// memes rather than from a file written by hand.
//
// The sheet holds two columns, a meme's NAME and a LINK to where it comes
// from; scripts/sync-meme-sheet.js pulls it down and keeps the result in
// sheetData.json. This file turns that list into ordinary Meme Hype cards,
// so from the game's point of view nothing here is special: they shuffle,
// deal, score and can be edited in the Creator exactly like every other
// card.
//
// Two things are worth knowing:
//
//   * A card's id is built from its POSITION in this pack, so the rows in
//     sheetData.json are append-only and nothing is ever deleted from
//     them. That is what keeps an uploaded picture or a Creator edit
//     attached to the card it was made for.
//   * The sheet gives no picture. A card shows its name over drawn art
//     until somebody puts a real picture at images/custom/<card id>.jpg,
//     or the Creator sets one. The source link travels with the card so
//     whoever is looking for that picture knows where to look.
//
// A card that has dropped out of the sheet keeps playing; it is only
// marked (`missingSince`) so the next sync can report it.

const data = require('./sheetData.json');

const RATINGS = ['16', '18'];

const palette = {
  flame: ['#ffb37a', '#e2452c'],
  acid: ['#d8f07a', '#6aa02a'],
  violet: ['#d9b6ff', '#6d3fbf'],
  ocean: ['#8fd9f0', '#1f6f94'],
  gold: ['#ffe08a', '#c9982f'],
  ink: ['#9fa8c9', '#2b3050'],
  candy: ['#ffb3d9', '#d6377f'],
  steel: ['#c3ccd6', '#5a6672'],
};

// A meme's caption on the card. The sheet's name IS the caption: these are
// memes people already know by name, and the name is the joke.
function captionOf(name) {
  const text = String(name || '').trim();
  // A name with a parenthetical - "Да поебать мне (Райан Гослинг)" - reads
  // better as two lines: the phrase on top, who says it underneath.
  const match = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return { top: match[1].toUpperCase(), bottom: match[2].toUpperCase() };
  // A name built from a slash is two halves of one joke.
  const slash = text.split(' / ');
  if (slash.length === 2) return { top: slash[0].toUpperCase(), bottom: slash[1].toUpperCase() };
  return { top: '', bottom: text.toUpperCase() };
}

// The rows of the sheet, in order, as card tuples. A 16+ card is playable
// in an 18+ room too, so the adult shelf holds everything and the 16+
// shelf holds everything that is clean - which is how the other packs
// already work.
function memesFor(rating) {
  return data.rows
    .filter((row) => (rating === '18' ? true : row.rating !== '18'))
    .map((row) => {
      const caption = captionOf(row.name);
      return [row.art || '🔥', caption.top, caption.bottom, row.bg || 'flame', {
        title: row.name,
        // Where the meme came from, for whoever goes looking for a
        // picture. It is a reference for the people editing the pack, not
        // a caption - the card face never shows a URL.
        source: row.link || null,
        // The meme's own picture, taken from that page by
        // scripts/find-trending-images.js and kept with the row. It lives
        // on the row rather than under the card's id because one row is
        // dealt as two cards - the same meme on the 16+ and the 18+ shelf -
        // and both want the same picture. A Creator edit still overrides
        // it, as it does for every other card.
        image: row.image || null,
      }];
    });
}

// Situations that suit a pack of well-known memes: the card is the
// reaction, so the situation only has to set one up.
const SITUATIONS_16 = [
  ['chat', 'Когда в рабочем чате в 23:47 пишут «нужно обсудить»'],
  ['chat', 'Когда тебя добавили в беседу на 80 человек'],
  ['chat', 'Когда прочитал сообщение и забыл ответить на три дня'],
  ['chat', 'Когда в семейном чате опять переслали новость из 2014 года'],
  ['life', 'Когда пообещал себе лечь в 23:00'],
  ['life', 'Когда открыл холодильник в четвёртый раз, надеясь на чудо'],
  ['life', 'Когда собирался на 10 минут, а прошло два часа'],
  ['life', 'Когда наконец разобрал шкаф и нашёл там ещё один шкаф'],
  ['life', 'Когда решил начать новую жизнь с понедельника, в среду'],
  ['work', 'Когда на созвоне спрашивают «а что думает по этому поводу…» и называют тебя'],
  ['work', 'Когда дедлайн завтра, а ты только что открыл файл'],
  ['work', 'Когда починил баг и не понял, как'],
  ['work', 'Когда тебя хвалят при всех, и ты не знаешь, куда деть руки'],
  ['work', 'Когда «это займёт пять минут» длится третий час'],
  ['friends', 'Когда друг сказал «я выхожу» сорок минут назад'],
  ['friends', 'Когда все скинулись, а один «переведёт потом»'],
  ['friends', 'Когда вспомнили историю, где ты был главным героем и не знал об этом'],
  ['friends', 'Когда компания решает, куда идти, уже полчаса'],
  ['money', 'Когда посмотрел выписку за месяц'],
  ['money', 'Когда доставка стоит дороже заказа, но ты уже нажал'],
  ['money', 'Когда пришла зарплата и сразу ушла'],
  ['internet', 'Когда прочитал комментарии и пожалел'],
  ['internet', 'Когда залип в рекомендациях и потерял вечер'],
  ['internet', 'Когда кто-то не понял твою шутку и объясняет её тебе'],
  ['internet', 'Когда ищешь один факт, а через час читаешь про кальмаров'],
  ['life', 'Когда наступил на деталь конструктора босой ногой'],
  ['life', 'Когда попытался тихо открыть пакет ночью'],
  ['life', 'Когда сказал «ага» на вопрос, который не расслышал'],
  ['work', 'Когда включил камеру не вовремя'],
  ['friends', 'Когда тебе рассказывают спойлеры «просто одну деталь»'],
];

const SITUATIONS_18 = [
  ...SITUATIONS_16,
  ['life', 'Когда таксист решил рассказать тебе, как устроен мир'],
  ['life', 'Когда сосед начал сверлить ровно в тот момент, когда ты уснул'],
  ['work', 'Когда начальник пишет «на пару слов» и ставит точку'],
  ['friends', 'Когда кто-то предлагает «ещё по одной» в четвёртый раз'],
  ['money', 'Когда увидел новый тариф и цену за то же самое'],
];

module.exports = {
  id: 'trending',
  order: 4,
  emoji: '📈',
  accent: '#e2452c',
  title: { ru: 'МЕМЫ 4: «В тренде»', en: 'MEMES 4: “Trending”' },
  description: {
    ru: 'Мемы, которые знают все, — по общей таблице. Обновляется скриптом синхронизации.',
    en: 'The memes everyone already knows, straight from the shared sheet. Refreshed by the sync script.',
  },
  palette,
  // Where these cards come from, shown in the Creator's panel.
  source: { url: data.source, syncedAt: data.syncedAt, rows: data.rows.length },
  content: Object.fromEntries(RATINGS.map((rating) => [rating, {
    situations: rating === '18' ? SITUATIONS_18 : SITUATIONS_16,
    memes: memesFor(rating),
  }])),
};
