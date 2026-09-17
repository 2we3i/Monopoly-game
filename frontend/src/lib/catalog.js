// catalog.js
// The cosmetics catalogue, fetched once from the server and shared by
// every screen. The server owns prices and availability; the client only
// uses this to draw items and to show what is for sale.

import { useEffect, useState } from 'react';

let promise = null;
let cached = null;

export const RARITY_META = {
  common: { color: '#a1a1aa', soft: 'rgba(161,161,170,0.14)', glow: 'rgba(161,161,170,0.25)' },
  uncommon: { color: '#4ade80', soft: 'rgba(74,222,128,0.12)', glow: 'rgba(74,222,128,0.28)' },
  rare: { color: '#60a5fa', soft: 'rgba(96,165,250,0.13)', glow: 'rgba(96,165,250,0.32)' },
  epic: { color: '#c084fc', soft: 'rgba(192,132,252,0.14)', glow: 'rgba(192,132,252,0.36)' },
  legendary: { color: '#fbbf24', soft: 'rgba(251,191,36,0.14)', glow: 'rgba(251,191,36,0.4)' },
  mythic: {
    color: '#f472b6', soft: 'rgba(244,114,182,0.15)', glow: 'rgba(244,114,182,0.45)', gradient: 'linear-gradient(90deg,#f472b6,#a78bfa,#22d3ee)',
  },
};

function build(data) {
  const byId = new Map(data.items.map((item) => [item.id, item]));
  return { ...data, byId };
}

export function loadCatalog() {
  if (cached) return Promise.resolve(cached);
  if (!promise) {
    promise = fetch('/api/economy/catalog')
      .then((r) => {
        if (!r.ok) throw new Error(`Catalogue unavailable (${r.status})`);
        return r.json();
      })
      .then((data) => {
        cached = build(data);
        return cached;
      })
      .catch((err) => {
        promise = null;
        throw err;
      });
  }
  return promise;
}

export function useCatalog() {
  const [catalog, setCatalog] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    loadCatalog().then((c) => { if (alive) setCatalog(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return catalog;
}

export function itemName(item, language) {
  if (!item) return '';
  return item.name[language] || item.name.en;
}

// Resolves a { slot: itemId | [itemIds] } loadout into item objects.
export function resolveLook(catalog, ids) {
  const pick = (id) => (catalog && typeof id === 'string' ? catalog.byId.get(id) || null : null);
  const list = (value) => (Array.isArray(value) ? value.map(pick).filter(Boolean) : []);
  const l = ids || {};
  return {
    tokenShape: pick(l.token_shape),
    tokenFrame: pick(l.token_frame),
    tokenAura: pick(l.token_aura),
    tokenTrail: pick(l.token_trail),
    tokenVictory: pick(l.token_victory),
    nameStyle: pick(l.name_style),
    nameDecor: pick(l.name_decor),
    nameIntro: pick(l.name_intro),
    avatarFrame: pick(l.avatar_frame),
    profileBg: pick(l.profile_bg),
    profileCard: pick(l.profile_card),
    title: pick(l.title),
    badges: list(l.badge),
    emotes: list(l.emote),
    effectJoin: pick(l.effect_join),
    effectWin: pick(l.effect_win),
    effectLoss: pick(l.effect_loss),
    effectReward: pick(l.effect_reward),
    effectRankup: pick(l.effect_rankup),
    effectPodium: pick(l.effect_podium),
    soundStart: pick(l.sound_start),
    soundWin: pick(l.sound_win),
    soundReward: pick(l.sound_reward),
    soundEvent: pick(l.sound_event),
  };
}

// A loadout with one slot swapped for another item - how a preview shows
// "your look, wearing this".
export function withItem(ids, item) {
  if (!item) return ids || {};
  const next = { ...(ids || {}) };
  const multi = item.slot === 'badge' || item.slot === 'emote' || item.slot === 'tile_name';
  if (multi) {
    const current = Array.isArray(next[item.slot]) ? next[item.slot] : [];
    const limit = { badge: 3, emote: 6, tile_name: 24 }[item.slot];
    next[item.slot] = current.includes(item.id) ? current : [item.id, ...current].slice(0, limit);
  } else {
    next[item.slot] = item.id;
  }
  return next;
}
