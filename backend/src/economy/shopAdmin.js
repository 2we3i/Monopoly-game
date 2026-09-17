// shopAdmin.js
// The Creator's shop controls: change any item (price, rarity, names,
// description, picture), put it on or off sale, and create new items -
// including names for board squares with their own picture. Everything is
// stored in shop_items and installed over the catalogue in catalog.js.
//
// An item somebody owns is never erased: deleting it retires it (no longer
// sold, still in their inventory). An item nobody owns is removed outright.

const creatorDb = require('../db/creator');
const catalog = require('./catalog');
const { EconomyError } = require('./service');
// eslint-disable-next-line global-require
const invalidateLoadouts = () => require('./service').invalidateAll();

const ID_PATTERN = /^[a-z0-9_]{3,60}$/;
const SOURCES = ['shop', 'starter', 'achievement', 'streak', 'event', 'season', 'leaderboard', 'hidden'];
const TILE_TYPES = ['PROPERTY', 'RAILROAD', 'UTILITY'];
const LOCAL_IMAGE = /^(\/|https?:\/\/)/;

function install() {
  let rows = [];
  try {
    rows = creatorDb.listShopRows();
  } catch {
    rows = [];
  }
  catalog.install(rows);
  invalidateLoadouts();
}

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function names(value, field, required = true) {
  const out = { en: text(value?.en, 80), ru: text(value?.ru, 80) };
  if (!out.en && !out.ru) {
    if (required) throw new EconomyError(`${field} is required.`, 'BAD_ITEM');
    return null;
  }
  return { en: out.en || out.ru, ru: out.ru || out.en };
}

function descriptions(value) {
  const out = { en: text(value?.en, 400), ru: text(value?.ru, 400) };
  return out.en || out.ru ? out : null;
}

function image(value) {
  if (value === null || value === '') return null;
  if (value === undefined) return undefined;
  const url = text(value, 500);
  if (!LOCAL_IMAGE.test(url)) throw new EconomyError('A picture must be a /path or an http(s) address.', 'BAD_ITEM');
  return url;
}

function price(value, required) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new EconomyError('A price is required for an item on sale.', 'BAD_ITEM');
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10000000) throw new EconomyError('The price must be a whole number from 1 to 10 000 000.', 'BAD_ITEM');
  return n;
}

function tileTarget(value) {
  const src = value && typeof value === 'object' ? value : {};
  const layout = text(src.layout, 40) || '*';
  const target = { layout };
  if (src.tileId !== undefined && src.tileId !== null && src.tileId !== '') {
    const id = Number(src.tileId);
    if (!Number.isInteger(id) || id < 0) throw new EconomyError('Pick the square this name is for.', 'BAD_ITEM');
    if (layout === '*') throw new EconomyError('A single square needs a board.', 'BAD_ITEM');
    target.tileId = id;
  } else if (src.group) {
    target.group = text(src.group, 30);
  } else if (src.tileType) {
    if (!TILE_TYPES.includes(src.tileType)) throw new EconomyError('Unknown kind of square.', 'BAD_ITEM');
    target.tileType = src.tileType;
  }
  return target;
}

function cleanVisual(slot, visual, nameValue) {
  const v = visual && typeof visual === 'object' ? visual : {};
  const json = JSON.stringify(v);
  if (json.length > 4000) throw new EconomyError('The item look is too large.', 'BAD_ITEM');
  if (slot === 'tile_name') {
    return {
      names: names(v.names || nameValue, 'The square name'),
      glyph: text(v.glyph, 8) || '🏷️',
      colors: Array.isArray(v.colors) ? v.colors.slice(0, 4).map((c) => text(c, 20)) : ['#e3bb5c', '#3d2e0f'],
      target: tileTarget(v.target),
    };
  }
  return JSON.parse(json);
}

function listForCreator() {
  const rows = new Map(creatorDb.listShopRows().map((r) => [r.id, r]));
  return catalog.allItems().map((item) => ({
    ...item,
    forSale: catalog.forSale(item),
    edited: rows.has(item.id) && !item.custom,
    updatedAt: rows.get(item.id)?.updatedAt || null,
    updatedBy: rows.get(item.id)?.updatedBy || null,
    owners: creatorDb.itemOwnerCount(item.id),
  }));
}

function create(input, by) {
  const src = input && typeof input === 'object' ? input : {};
  const id = text(src.id, 60).toLowerCase() || `custom_${Date.now().toString(36)}`;
  if (!ID_PATTERN.test(id)) throw new EconomyError('An item id is 3-60 characters: latin letters, digits and _.', 'BAD_ITEM');
  if (catalog.getItem(id)) throw new EconomyError('An item with this id already exists.', 'ITEM_EXISTS', 409);
  if (!catalog.SLOTS[src.slot]) throw new EconomyError('Unknown item slot.', 'BAD_ITEM');
  if (!catalog.RARITIES.includes(src.rarity)) throw new EconomyError('Unknown rarity.', 'BAD_ITEM');
  const source = SOURCES.includes(src.source) ? src.source : 'shop';
  const name = names(src.name, 'A name');
  const data = {
    slot: src.slot,
    rarity: src.rarity,
    source,
    price: source === 'shop' ? price(src.price, true) : null,
    name,
    description: descriptions(src.description),
    image: image(src.image) || null,
    visual: cleanVisual(src.slot, src.visual, name),
    enabled: src.enabled !== false,
  };
  creatorDb.saveShopRow({
    id, custom: true, data, by,
  });
  install();
  return catalog.getItem(id);
}

function update(id, input, by) {
  const item = catalog.getItem(id);
  if (!item) throw new EconomyError('Unknown item.', 'UNKNOWN_ITEM', 404);
  const src = input && typeof input === 'object' ? input : {};
  const row = creatorDb.getShopRow(id);
  const before = { ...item };
  if (item.custom) {
    const data = { ...(row?.data || {}) };
    if (src.rarity !== undefined) {
      if (!catalog.RARITIES.includes(src.rarity)) throw new EconomyError('Unknown rarity.', 'BAD_ITEM');
      data.rarity = src.rarity;
    }
    if (src.source !== undefined) data.source = SOURCES.includes(src.source) ? src.source : 'shop';
    if (src.name !== undefined) data.name = names(src.name, 'A name');
    if (src.description !== undefined) data.description = descriptions(src.description);
    if (src.image !== undefined) data.image = image(src.image);
    if (src.visual !== undefined) data.visual = cleanVisual(data.slot, src.visual, data.name);
    if (src.enabled !== undefined) data.enabled = src.enabled !== false;
    if (src.price !== undefined || data.source === 'shop') data.price = data.source === 'shop' ? price(src.price ?? data.price, true) : null;
    creatorDb.saveShopRow({
      id, custom: true, data, by,
    });
  } else {
    const data = { ...(row?.data || {}) };
    if (src.rarity !== undefined) {
      if (!catalog.RARITIES.includes(src.rarity)) throw new EconomyError('Unknown rarity.', 'BAD_ITEM');
      data.rarity = src.rarity;
    }
    if (src.price !== undefined) {
      if (item.source !== 'shop') throw new EconomyError('This item is earned, not sold - it has no price.', 'BAD_ITEM');
      data.price = price(src.price, true);
    }
    if (src.name !== undefined) data.name = names(src.name, 'A name');
    if (src.description !== undefined) data.description = descriptions(src.description);
    if (src.image !== undefined) data.image = image(src.image);
    if (src.enabled !== undefined) data.enabled = src.enabled !== false;
    creatorDb.saveShopRow({
      id, custom: false, data, by,
    });
  }
  install();
  return { before, after: catalog.getItem(id) };
}

// Built-in items go back to how the code ships them.
function reset(id) {
  const item = catalog.getItem(id);
  if (!item || item.custom) throw new EconomyError('Only a built-in item can be reset.', 'BAD_ITEM');
  const before = { ...item };
  creatorDb.removeShopRow(id);
  install();
  return { before, after: catalog.getItem(id) };
}

function remove(id, by) {
  const item = catalog.getItem(id);
  if (!item) throw new EconomyError('Unknown item.', 'UNKNOWN_ITEM', 404);
  const owners = creatorDb.itemOwnerCount(id);
  const before = { ...item, owners };
  if (!item.custom) {
    // A built-in item cannot vanish from the code: it is taken off sale.
    const row = creatorDb.getShopRow(id);
    creatorDb.saveShopRow({
      id, custom: false, data: { ...(row?.data || {}), enabled: false }, by,
    });
    install();
    return { before, result: 'disabled' };
  }
  if (owners > 0) {
    creatorDb.markShopRowDeleted(id, by);
    install();
    return { before, result: 'retired' };
  }
  creatorDb.removeShopRow(id);
  install();
  return { before, result: 'deleted' };
}

module.exports = {
  install, listForCreator, create, update, reset, remove, SOURCES,
};
