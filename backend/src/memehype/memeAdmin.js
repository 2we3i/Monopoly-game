// memeAdmin.js
// The Creator's meme editor: change the captions, emoji, background or
// picture of any Meme Hype card, switch cards and whole packs on or off,
// add new memes and situations, and delete them. Changes are stored in
// platform.db and installed into content/index.js at once - the next card
// dealt already shows them, without a restart.

const creatorDb = require('../db/creator');
const content = require('./content');
const { AccessError } = require('../platform/access');

class MemeError extends AccessError {
  constructor(message, code = 'BAD_MEME') {
    super(message, code);
  }
}

const LOCAL_IMAGE = /^(\/|https?:\/\/)/;

function install() {
  let overrides = {};
  let custom = [];
  try {
    overrides = creatorDb.memeOverrides();
    custom = creatorDb.customMemes();
  } catch {
    overrides = {};
    custom = [];
  }
  content.install({ overrides, custom });
}

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : undefined;
}

function findCard(id) {
  const meme = content.memeById(id, id.split('.')[1]);
  if (meme) return { kind: 'meme', card: meme };
  const situation = content.situationById(id);
  if (situation) return { kind: 'situation', card: situation };
  return null;
}

function list() {
  const overrides = creatorDb.memeOverrides();
  return {
    ratings: content.RATINGS,
    packs: content.PACKS.map((pack) => ({
      id: pack.id,
      title: pack.title,
      description: pack.description,
      emoji: pack.emoji,
      accent: pack.accent,
      enabled: pack.enabled,
      palette: pack.palette,
      byRating: Object.fromEntries(content.RATINGS.map((rating) => [rating, {
        memes: pack.byRating[rating].memes.map((m) => ({
          ...m,
          overridden: !!overrides[m.id],
        })),
        situations: pack.byRating[rating].situations.map((s) => ({
          ...s,
          overridden: !!overrides[s.id],
        })),
      }])),
    })),
  };
}

function cleanMemePatch(input) {
  const src = input && typeof input === 'object' ? input : {};
  const patch = {};
  ['art', 'top', 'bottom'].forEach((key) => {
    const value = text(src[key], key === 'art' ? 16 : 120);
    if (value !== undefined) patch[key] = value;
  });
  if (typeof src.bg === 'string') patch.bg = src.bg.slice(0, 20);
  if (src.image === '' || src.image === null) patch.image = '';
  else if (typeof src.image === 'string') {
    if (!LOCAL_IMAGE.test(src.image)) throw new MemeError('A picture must be a /path or an http(s) address.');
    patch.image = src.image.slice(0, 500);
  }
  if (src.enabled !== undefined) patch.enabled = src.enabled !== false;
  if (src.weight !== undefined) {
    const w = Number(src.weight);
    if (!Number.isFinite(w) || w <= 0 || w > 10) throw new MemeError('The weight must be between 0 and 10.');
    patch.weight = w;
  }
  const title = text(src.title, 120);
  if (title !== undefined) patch.title = title;
  const description = text(src.description, 400);
  if (description !== undefined) patch.description = description;
  return patch;
}

function cleanSituationPatch(input) {
  const src = input && typeof input === 'object' ? input : {};
  const patch = {};
  const t = text(src.text, 300);
  if (t !== undefined) {
    if (!t) throw new MemeError('A situation needs a text.');
    patch.text = t;
  }
  const category = text(src.category, 40);
  if (category) patch.category = category;
  if (src.enabled !== undefined) patch.enabled = src.enabled !== false;
  return patch;
}

// Changes a card. Returns { before, after }.
function update(id, input, by) {
  const found = findCard(String(id || ''));
  if (!found) throw new MemeError('Card not found.', 'UNKNOWN_MEME');
  const before = { ...found.card };
  const patch = found.kind === 'meme' ? cleanMemePatch(input) : cleanSituationPatch(input);
  if (found.card.custom) {
    const row = creatorDb.customMemes().find((r) => r.id === id);
    creatorDb.updateCustomMeme(id, { ...(row?.data || {}), ...patch, image: patch.image === '' ? null : (patch.image ?? row?.data?.image ?? null) });
  } else {
    const existing = creatorDb.memeOverrides()[id] || {};
    creatorDb.saveMemeOverride(id, { ...existing, ...patch }, by);
  }
  install();
  return { before, after: { ...findCard(id).card } };
}

// Drops every change to a built-in card.
function reset(id) {
  const found = findCard(String(id || ''));
  if (!found || found.card.custom) throw new MemeError('Only a built-in card can be reset.');
  const before = { ...found.card };
  creatorDb.clearMemeOverride(id);
  install();
  return { before, after: { ...findCard(id).card } };
}

function create(input, by) {
  const src = input && typeof input === 'object' ? input : {};
  const pack = content.BASE_PACKS.find((p) => p.id === src.pack);
  if (!pack) throw new MemeError('Pick a pack.');
  if (!content.RATINGS.includes(String(src.rating))) throw new MemeError('Pick an age rating.');
  const kind = src.kind === 'situation' ? 'situation' : 'meme';
  let data;
  if (kind === 'situation') {
    data = { kind, ...cleanSituationPatch(src) };
    if (!data.text) throw new MemeError('A situation needs a text.');
  } else {
    const patch = cleanMemePatch(src);
    if (!patch.art && !patch.image && !patch.top && !patch.bottom) throw new MemeError('A meme needs a picture, an emoji or a caption.');
    data = {
      kind, ...patch, image: patch.image || null, bg: pack.palette[patch.bg] ? patch.bg : Object.keys(pack.palette)[0],
    };
  }
  const id = creatorDb.addCustomMeme({
    pack: pack.id, rating: String(src.rating), data, by,
  });
  // Situations and memes share the counter; the id says which one it is.
  install();
  return findCard(id)?.card || { id };
}

function remove(id, by) {
  const found = findCard(String(id || ''));
  if (!found) throw new MemeError('Card not found.', 'UNKNOWN_MEME');
  const before = { ...found.card };
  if (found.card.custom) creatorDb.deleteCustomMeme(id);
  else creatorDb.saveMemeOverride(id, { ...(creatorDb.memeOverrides()[id] || {}), deleted: true, enabled: false }, by);
  install();
  return before;
}

function restore(id, by) {
  const found = findCard(String(id || ''));
  if (!found) throw new MemeError('Card not found.', 'UNKNOWN_MEME');
  if (found.card.custom) throw new MemeError('A deleted custom card cannot be restored.');
  const existing = { ...(creatorDb.memeOverrides()[id] || {}) };
  delete existing.deleted;
  existing.enabled = true;
  creatorDb.saveMemeOverride(id, existing, by);
  install();
  return findCard(id).card;
}

function setPackEnabled(packId, enabled, by) {
  if (!content.BASE_PACKS.some((p) => p.id === packId)) throw new MemeError('Pack not found.');
  creatorDb.saveMemeOverride(`pack:${packId}`, { enabled: !!enabled }, by);
  install();
  return content.PACKS.find((p) => p.id === packId).enabled;
}

// Every meme picture, for the media library.
function images() {
  const out = [];
  content.PACKS.forEach((pack) => content.RATINGS.forEach((rating) => {
    pack.byRating[rating].memes.forEach((m) => {
      if (m.image) {
        out.push({
          memeId: m.id, pack: pack.id, rating, url: m.image, source: m.imageSource, top: m.top, bottom: m.bottom, enabled: m.enabled, deleted: !!m.deleted, credit: m.credit,
        });
      }
    });
  }));
  return out;
}

module.exports = {
  MemeError, install, list, update, reset, create, remove, restore, setPackEnabled, images, findCard,
};
