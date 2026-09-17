// content/index.js
// The Meme Hype content system.
//
// Meme Hype
//   -> Packs (one file each, listed in PACK_FILES)
//      -> ratings '16' and '18', kept apart
//         -> situations and memes
//
// Pack files are written compactly (tuples); this module turns them into
// proper records once, at load time:
//
//   situation { id, pack, rating, category, text, weight, enabled }
//   meme      { id, pack, rating, art, top, bottom, colors: [from, to],
//               image, weight, enabled }
//
// A record's id is stable for its position in its pack, and every lookup
// takes a rating: this module is the age filter, so a 16+ room can never be
// dealt an 18+ card whatever a client asks for. Adding a pack is adding a
// file to PACK_FILES - nothing in the game logic needs to change.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RATINGS = ['16', '18'];

// A meme's picture, first match wins:
//   1. `image` in the pack file - a URL, or a file name inside custom/;
//   2. your own picture: images/custom/<meme id>.jpg|jpeg|png|webp|gif;
//   3. a photo found by scripts/find-meme-images.js (images/manifest.json).
//      It belongs to a meme only while the meme's content is what it was
//      when the photo was chosen - edit a caption and the card falls back
//      to its drawn art until a new photo is found;
//   4. otherwise the emoji art is drawn.
// Pictures are read when the server starts: restart it after adding one.
const IMAGES_DIR = path.join(__dirname, '..', 'images');
const IMAGE_URL = '/memes';
const CUSTOM_DIR = process.env.MEMEHYPE_CUSTOM_IMAGES || path.join(IMAGES_DIR, 'custom');
const CUSTOM_URL = `${IMAGE_URL}/custom`;
const CUSTOM_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// meme id -> file name, for every picture in custom/.
function loadCustom() {
  const out = {};
  let files = [];
  try {
    files = fs.readdirSync(CUSTOM_DIR);
  } catch {
    return out;
  }
  files.sort().forEach((file) => {
    const ext = path.extname(file).toLowerCase();
    if (CUSTOM_EXT.includes(ext)) out[file.slice(0, -ext.length)] = file;
  });
  return out;
}
const CUSTOM = loadCustom();
const customUrl = (file) => `${CUSTOM_URL}/${encodeURIComponent(file)}`;

// A pack file's `image`: a URL as it is, a bare name from custom/.
function packImage(image) {
  if (!image) return null;
  return /^(https?:)?///.test(image) || image.startsWith('/') ? image : customUrl(image);
}
function loadImages() {
  try {
    return JSON.parse(fs.readFileSync(path.join(IMAGES_DIR, 'manifest.json'), 'utf8'));
  } catch {
    return {};
  }
}
const IMAGES = loadImages();
const fingerprint = (m) => crypto.createHash('sha1').update(`${m.art}|${m.top}|${m.bottom}`).digest('hex').slice(0, 12);

const PACK_FILES = [
  require('./everyday'), // eslint-disable-line global-require
  require('./ussr'), // eslint-disable-line global-require
  require('./animals'), // eslint-disable-line global-require
];

function normalizePack(file) {
  const palette = file.palette || {};
  const fallback = Object.values(palette)[0] || ['#555', '#222'];
  const byRating = {};
  RATINGS.forEach((rating) => {
    const src = file.content?.[rating] || { situations: [], memes: [] };
    byRating[rating] = {
      situations: src.situations.map((row, i) => {
        const [category, text, extra = {}] = Array.isArray(row) ? row : [row.category, row.text, row];
        return {
          id: `${file.id}.${rating}.s${i + 1}`,
          pack: file.id,
          rating,
          category: category || 'misc',
          text,
          weight: extra.weight || 1,
          enabled: extra.enabled !== false,
        };
      }),
      memes: src.memes.map((row, i) => {
        const [art, top, bottom, bg, extra = {}] = Array.isArray(row)
          ? row
          : [row.art, row.top, row.bottom, row.bg, row];
        const id = `${file.id}.${rating}.m${i + 1}`;
        const photo = IMAGES[id];
        const own = { art: art || '', top: top || '', bottom: bottom || '' };
        const fits = photo && photo.fingerprint === fingerprint(own) && fs.existsSync(path.join(IMAGES_DIR, photo.file));
        const yours = packImage(extra.image) || (CUSTOM[id] ? customUrl(CUSTOM[id]) : null);
        return {
          id,
          pack: file.id,
          rating,
          art: art || '',
          top: top || '',
          bottom: bottom || '',
          colors: palette[bg] || fallback,
          image: yours || (fits ? `${IMAGE_URL}/${photo.file}` : null),
          imageSource: yours ? 'custom' : (fits ? 'found' : null),
          credit: !yours && fits
            ? {
              title: photo.title, author: photo.author, license: photo.license, source: photo.source,
            }
            : null,
          weight: extra.weight || 1,
          enabled: extra.enabled !== false,
        };
      }),
    };
  });
  return {
    id: file.id,
    order: file.order || 99,
    emoji: file.emoji,
    accent: file.accent,
    title: file.title,
    description: file.description,
    enabled: file.enabled !== false,
    byRating,
  };
}

const PACKS = PACK_FILES.map(normalizePack).sort((a, b) => a.order - b.order);
const PACK_IDS = PACKS.map((p) => p.id);
const MEMES_BY_ID = new Map();
PACKS.forEach((pack) => RATINGS.forEach((rating) => {
  pack.byRating[rating].memes.forEach((m) => MEMES_BY_ID.set(m.id, m));
}));

function packById(id) {
  return PACKS.find((p) => p.id === id && p.enabled) || null;
}

function pick(rating, packIds, kind) {
  if (!RATINGS.includes(rating)) return [];
  const out = [];
  packIds.forEach((id) => {
    const pack = packById(id);
    if (!pack) return;
    pack.byRating[rating][kind].forEach((item) => {
      if (item.enabled) out.push(item);
    });
  });
  return out;
}

const situationsFor = (rating, packIds) => pick(rating, packIds, 'situations');
const memesFor = (rating, packIds) => pick(rating, packIds, 'memes');

// A meme by id - but only if it belongs to the rating asked for.
function memeById(id, rating) {
  const meme = MEMES_BY_ID.get(id);
  return meme && meme.rating === rating ? meme : null;
}

// The shelf a lobby shows: names and how much is in each rating.
function catalog() {
  return PACKS.filter((p) => p.enabled).map((p) => ({
    id: p.id,
    emoji: p.emoji,
    accent: p.accent,
    title: p.title,
    description: p.description,
    sizes: Object.fromEntries(RATINGS.map((r) => [r, {
      situations: p.byRating[r].situations.length,
      memes: p.byRating[r].memes.length,
    }])),
  }));
}

// Everyone whose photo is on a card, for the credits list.
function credits() {
  return PACKS.flatMap((pack) => RATINGS.flatMap((rating) => pack.byRating[rating].memes))
    .filter((m) => m.credit)
    .map((m) => ({
      meme: m.id, pack: m.pack, rating: m.rating, image: m.image, ...m.credit,
    }));
}

// Files in custom/ that match no meme - usually a typo in the name.
function unmatchedCustom() {
  return Object.keys(CUSTOM).filter((id) => !MEMES_BY_ID.has(id)).map((id) => CUSTOM[id]);
}

module.exports = {
  IMAGES_DIR,
  IMAGE_URL,
  CUSTOM_DIR,
  CUSTOM_URL,
  CUSTOM_EXT,
  credits,
  unmatchedCustom,
  RATINGS, PACK_IDS, PACKS, packById, situationsFor, memesFor, memeById, catalog,
};
