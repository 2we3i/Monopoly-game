// media.js
// The Creator's media library: every picture the games use in one place -
// meme pictures, pictures on board squares, pictures of shop items - plus
// the pictures uploaded from the panel. Each entry can be previewed,
// renamed, described, linked to a mode or a board square, replaced with a
// new file, or deleted.
//
// Replacing or deleting acts on the place the picture is used: a meme gets
// the new file (or falls back to its emoji), a square gets the new file (or
// none), an item gets the new file (or none). Uploaded files live in
// DATA_DIR/media and are served at /media.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('../config');
const creatorDb = require('../db/creator');
const boards = require('./boards');
const memeAdmin = require('../memehype/memeAdmin');
const shopAdmin = require('../economy/shopAdmin');
const catalog = require('../economy/catalog');
const { AccessError } = require('./access');

const MEDIA_DIR = path.join(DATA_DIR, 'media');
const MEDIA_URL = '/media';
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const MAX_BYTES = 8 * 1024 * 1024;

class MediaError extends AccessError {
  constructor(message, code = 'BAD_MEDIA') {
    super(message, code);
  }
}

function newFileName(mime) {
  return `${crypto.randomUUID()}${TYPES[mime] || '.bin'}`;
}

function urlOf(file) {
  return `${MEDIA_URL}/${encodeURIComponent(file)}`;
}

function fileOfUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(`${MEDIA_URL}/`)) return null;
  const name = decodeURIComponent(url.slice(MEDIA_URL.length + 1));
  return /^[\w.-]+$/.test(name) ? name : null;
}

// Every place a URL is used right now.
function usagesOf(url) {
  const out = [];
  memeAdmin.images().forEach((m) => { if (m.url === url) out.push({ kind: 'meme', id: m.memeId }); });
  boards.images().forEach((t) => { if (t.url === url) out.push({ kind: 'tile', id: `${t.layoutId}:${t.tileId}` }); });
  catalog.allItems().forEach((item) => { if (item.image === url) out.push({ kind: 'item', id: item.id }); });
  return out;
}

// The whole library, newest metadata first. Filtering and search are done
// by the caller (the panel) on this list.
function list() {
  const meta = new Map(creatorDb.listMedia({ includeDeleted: true }).map((m) => [m.id, m]));
  const entries = [];
  const withMeta = (entry) => {
    const m = meta.get(entry.id);
    return {
      ...entry,
      title: m?.title || entry.title || '',
      description: m?.description || '',
      modeId: m?.modeId || entry.modeId || null,
      tile: m?.tile || entry.tile || null,
      tags: m?.tags || [],
      updatedAt: m?.updatedAt || null,
    };
  };

  memeAdmin.images().forEach((img) => {
    entries.push(withMeta({
      id: `meme:${img.memeId}`,
      kind: 'meme',
      url: img.url,
      source: img.source,
      title: [img.top, img.bottom].filter(Boolean).join(' / ') || img.memeId,
      modeId: 'memehype.party',
      target: { memeId: img.memeId, pack: img.pack, rating: img.rating },
      enabled: img.enabled && !img.deleted,
      credit: img.credit || null,
    }));
  });
  boards.images().forEach((img) => {
    entries.push(withMeta({
      id: `tile:${img.layoutId}:${img.tileId}`,
      kind: 'tile',
      url: img.url,
      source: 'board',
      title: `${img.name} · ${img.nameRu}`,
      modeId: `monopoly.${img.layoutId}`,
      tile: { layoutId: img.layoutId, tileId: img.tileId },
      target: { layoutId: img.layoutId, tileId: img.tileId },
      enabled: true,
    }));
  });
  catalog.allItems().filter((item) => item.image).forEach((item) => {
    entries.push(withMeta({
      id: `item:${item.id}`,
      kind: 'item',
      url: item.image,
      source: 'shop',
      title: item.name?.en || item.id,
      target: { itemId: item.id },
      enabled: item.enabled !== false && !item.retired,
    }));
  });
  creatorDb.listMedia().filter((m) => m.kind === 'upload').forEach((m) => {
    entries.push({
      id: m.id,
      kind: 'upload',
      url: m.url,
      source: 'upload',
      title: m.title || m.file,
      description: m.description || '',
      modeId: m.modeId,
      tile: m.tile,
      tags: m.tags,
      size: m.size,
      mime: m.mime,
      createdAt: m.createdAt,
      createdBy: m.createdBy,
      updatedAt: m.updatedAt,
      target: null,
      enabled: true,
      usages: usagesOf(m.url),
    });
  });
  return entries;
}

function find(id) {
  return list().find((e) => e.id === id) || null;
}

function upload(file, { title = '', description = '', modeId = null } = {}, by) {
  if (!file) throw new MediaError('Choose a picture to upload.');
  const id = `up_${crypto.randomUUID()}`;
  return creatorDb.saveMedia({
    id,
    kind: 'upload',
    file: file.filename,
    url: urlOf(file.filename),
    mime: file.mimetype,
    size: file.size,
    title: String(title || file.originalname || '').slice(0, 120),
    description: String(description || '').slice(0, 1000),
    modeId: modeId || null,
  }, by);
}

// Where a picture shows is changed through the owner of that place.
function pointAt(entry, url, by) {
  if (entry.kind === 'meme') return memeAdmin.update(entry.target.memeId, { image: url || '' }, by);
  if (entry.kind === 'tile') return boards.saveTile(entry.target.layoutId, entry.target.tileId, { image: url || '' }, by);
  if (entry.kind === 'item') return shopAdmin.update(entry.target.itemId, { image: url || null }, by);
  return null;
}

function removeFileIfUnused(url) {
  const file = fileOfUrl(url);
  if (!file || usagesOf(url).length) return;
  if (creatorDb.listMedia().some((m) => m.url === url)) return;
  try {
    fs.unlinkSync(path.join(MEDIA_DIR, file));
  } catch { /* already gone */ }
}

// Replaces the picture of an entry with an uploaded file.
function replace(id, file, by) {
  const entry = find(id);
  if (!entry) throw new MediaError('Picture not found.', 'UNKNOWN_MEDIA');
  if (!file) throw new MediaError('Choose a picture to upload.');
  const url = urlOf(file.filename);
  const before = { url: entry.url };
  if (entry.kind === 'upload') {
    const usages = usagesOf(entry.url);
    creatorDb.saveMedia({
      id, file: file.filename, url, mime: file.mimetype, size: file.size,
    }, by);
    // Every place that showed the old upload shows the new one.
    usages.forEach((u) => {
      if (u.kind === 'meme') memeAdmin.update(u.id, { image: url }, by);
      if (u.kind === 'tile') {
        const [layoutId, tileId] = u.id.split(':');
        boards.saveTile(layoutId, Number(tileId), { image: url }, by);
      }
      if (u.kind === 'item') shopAdmin.update(u.id, { image: url }, by);
    });
    removeFileIfUnused(before.url);
  } else {
    creatorDb.saveMedia({
      id, kind: 'upload-replacement', file: file.filename, url, mime: file.mimetype, size: file.size,
    }, by);
    pointAt(entry, url, by);
  }
  return { before, after: { url } };
}

function update(id, input, by) {
  const entry = find(id);
  if (!entry) throw new MediaError('Picture not found.', 'UNKNOWN_MEDIA');
  const src = input && typeof input === 'object' ? input : {};
  const patch = {};
  if (src.title !== undefined) patch.title = String(src.title || '').trim().slice(0, 120);
  if (src.description !== undefined) patch.description = String(src.description || '').trim().slice(0, 1000);
  if (src.modeId !== undefined) patch.modeId = src.modeId ? String(src.modeId).slice(0, 60) : null;
  if (src.tags !== undefined) patch.tags = Array.isArray(src.tags) ? src.tags.map((t) => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [];
  const before = {
    title: entry.title, description: entry.description, modeId: entry.modeId, tile: entry.tile,
  };
  // Linking a picture to a board square puts it on that square.
  if (src.tile !== undefined) {
    if (src.tile && src.tile.layoutId !== undefined) {
      const tileId = Number(src.tile.tileId);
      boards.saveTile(String(src.tile.layoutId), tileId, { image: entry.url }, by);
      patch.tile = { layoutId: String(src.tile.layoutId), tileId };
    } else {
      patch.tile = null;
    }
  }
  // Linking a picture to a meme shows it on that meme.
  if (src.memeId) memeAdmin.update(String(src.memeId), { image: entry.url }, by);
  const kind = entry.kind === 'upload' ? 'upload' : 'meta';
  const saved = creatorDb.saveMedia({ id, kind, ...patch }, by);
  return { before, after: { ...before, ...patch }, saved };
}

function remove(id, { force = false } = {}, by) {
  const entry = find(id);
  if (!entry) throw new MediaError('Picture not found.', 'UNKNOWN_MEDIA');
  if (entry.kind === 'upload') {
    const usages = usagesOf(entry.url);
    if (usages.length && !force) {
      throw new MediaError(`This picture is used in ${usages.length} place(s). Confirm to remove it from them too.`, 'MEDIA_IN_USE');
    }
    usages.forEach((u) => {
      if (u.kind === 'meme') memeAdmin.update(u.id, { image: '' }, by);
      if (u.kind === 'tile') {
        const [layoutId, tileId] = u.id.split(':');
        boards.saveTile(layoutId, Number(tileId), { image: '' }, by);
      }
      if (u.kind === 'item') shopAdmin.update(u.id, { image: null }, by);
    });
    creatorDb.deleteMedia(id);
    const file = fileOfUrl(entry.url);
    if (file) {
      try {
        fs.unlinkSync(path.join(MEDIA_DIR, file));
      } catch { /* already gone */ }
    }
    return { entry, usages };
  }
  // A picture in use somewhere: take it off that place.
  pointAt(entry, null, by);
  removeFileIfUnused(entry.url);
  return { entry, usages: [{ kind: entry.kind, id: entry.id }] };
}

module.exports = {
  MEDIA_DIR, MEDIA_URL, TYPES, MAX_BYTES, MediaError, newFileName, list, find, upload, replace, update, remove, usagesOf,
};
