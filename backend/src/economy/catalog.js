// catalog.js
// Every cosmetic item that exists. The catalogue lives on the server: the
// client renders an item from its `visual` description, but prices, what
// is for sale and how an item is earned are decided here and only here.
//
// Nothing in this file touches game rules. An item changes how a player
// LOOKS (a token, a name, a frame, a sound) - never what they can do.

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// The price band each rarity is expected to sit in. Kept next to the
// catalogue so a mispriced item is caught by the test suite.
const PRICE_BANDS = {
  common: [50, 150],
  uncommon: [150, 350],
  rare: [400, 800],
  epic: [1000, 1700],
  legendary: [2000, 3600],
  mythic: [6000, 9500],
};

const CATEGORIES = ['token', 'nickname', 'avatar', 'profile', 'effects', 'titles', 'badges', 'emotes', 'sounds'];

// slot -> how many items of that slot can be equipped at once.
const SLOTS = {
  token_shape: { category: 'token', capacity: 1 },
  token_frame: { category: 'token', capacity: 1 },
  token_aura: { category: 'token', capacity: 1 },
  token_trail: { category: 'token', capacity: 1 },
  token_victory: { category: 'token', capacity: 1 },
  name_style: { category: 'nickname', capacity: 1 },
  name_decor: { category: 'nickname', capacity: 1 },
  name_intro: { category: 'nickname', capacity: 1 },
  avatar_frame: { category: 'avatar', capacity: 1 },
  profile_bg: { category: 'profile', capacity: 1 },
  profile_card: { category: 'profile', capacity: 1 },
  effect_join: { category: 'effects', capacity: 1 },
  effect_win: { category: 'effects', capacity: 1 },
  effect_loss: { category: 'effects', capacity: 1 },
  effect_reward: { category: 'effects', capacity: 1 },
  effect_rankup: { category: 'effects', capacity: 1 },
  effect_podium: { category: 'effects', capacity: 1 },
  title: { category: 'titles', capacity: 1 },
  badge: { category: 'badges', capacity: 3 },
  emote: { category: 'emotes', capacity: 6 },
  sound_start: { category: 'sounds', capacity: 1 },
  sound_win: { category: 'sounds', capacity: 1 },
  sound_reward: { category: 'sounds', capacity: 1 },
  sound_event: { category: 'sounds', capacity: 1 },
};

const ITEMS = [];

// source: 'shop' (bought with crowns), 'starter' (everyone has it),
// 'achievement' | 'streak' | 'event' | 'season' | 'leaderboard' (earned).
function item(id, slot, rarity, price, en, ru, visual, extra = {}) {
  ITEMS.push({
    id,
    slot,
    category: SLOTS[slot].category,
    rarity,
    price: extra.source && extra.source !== 'shop' ? null : price,
    source: extra.source || 'shop',
    requirement: extra.requirement || null,
    name: { en, ru },
    visual,
    createdOrder: ITEMS.length,
  });
}

const earned = (source, requirement) => ({ source, requirement });

// --- token ---------------------------------------------------------------
item('token_shape_shield', 'token_shape', 'common', 80, 'Shield token', 'Фишка «Щит»', { shape: 'shield' });
item('token_shape_hex', 'token_shape', 'common', 90, 'Hexagon token', 'Фишка «Шестигранник»', { shape: 'hex' });
item('token_shape_diamond', 'token_shape', 'uncommon', 200, 'Diamond token', 'Фишка «Ромб»', { shape: 'diamond' });
item('token_shape_star', 'token_shape', 'rare', 520, 'Star token', 'Фишка «Звезда»', { shape: 'star' });
item('token_shape_crest', 'token_shape', 'epic', 1100, 'Royal crest', 'Королевский герб', { shape: 'crest' });

item('token_frame_bronze', 'token_frame', 'common', 60, 'Bronze rim', 'Бронзовый обод', { style: 'solid', colors: ['#b0763c'] });
item('token_frame_silver', 'token_frame', 'common', 70, 'Silver rim', 'Серебряный обод', { style: 'solid', colors: ['#d8dde3'] });
item('token_frame_gold', 'token_frame', 'uncommon', 240, 'Gold rim', 'Золотой обод', { style: 'solid', colors: ['#e3bb5c'] });
item('token_frame_double', 'token_frame', 'rare', 480, 'Double brass rim', 'Двойной латунный обод', { style: 'double', colors: ['#e3bb5c', '#96701c'] });
item('token_frame_prism', 'token_frame', 'epic', 1300, 'Prism rim', 'Призматический обод', { style: 'gradient', colors: ['#60a5fa', '#a78bfa', '#f472b6', '#fbbf24'] });
item('token_frame_master_builder', 'token_frame', 'rare', null, 'Master builder rim', 'Обод мастера-строителя', { style: 'double', colors: ['#a57ae0', '#e3bb5c'] }, earned('achievement', { achievement: 'MASTER_BUILDER' }));
item('token_frame_eclipse', 'token_frame', 'mythic', 7000, 'Eclipse rim', 'Обод «Затмение»', { style: 'gradient', animated: true, colors: ['#1f1729', '#e3bb5c', '#1f1729', '#f0d79a'] });

item('token_aura_soft', 'token_aura', 'common', 100, 'Soft glow', 'Мягкое свечение', { kind: 'glow', colors: ['#ffffff'] });
item('token_aura_emerald', 'token_aura', 'uncommon', 220, 'Emerald pulse', 'Изумрудный пульс', { kind: 'pulse', colors: ['#4fc39a'] });
item('token_aura_ember', 'token_aura', 'rare', 600, 'Ember glow', 'Тлеющий жар', { kind: 'flicker', colors: ['#f97316', '#fbbf24'] });
item('token_aura_sparkle', 'token_aura', 'epic', 1400, 'Sparkles', 'Искры', { kind: 'sparkle', colors: ['#fde68a', '#ffffff'] });
item('token_aura_orbit', 'token_aura', 'legendary', 2600, 'Orbiting moons', 'Орбита лун', { kind: 'orbit', colors: ['#e3bb5c', '#a5b4fc'] });
item('token_aura_void', 'token_aura', 'mythic', 8000, 'Void swirl', 'Вихрь бездны', { kind: 'void', colors: ['#7c3aed', '#1e1b4b', '#f0abfc'] });

item('token_trail_dust', 'token_trail', 'common', 90, 'Dust trail', 'Пыльный след', { kind: 'dust', colors: ['#d9c9a3'] });
item('token_trail_sparks', 'token_trail', 'uncommon', 260, 'Spark trail', 'След из искр', { kind: 'sparks', colors: ['#fbbf24', '#f97316'] });
item('token_trail_petals', 'token_trail', 'rare', 650, 'Petal trail', 'Лепестки', { kind: 'petals', colors: ['#f9a8d4', '#fbcfe8'] });
item('token_trail_comet', 'token_trail', 'epic', 1500, 'Comet tail', 'Хвост кометы', { kind: 'comet', colors: ['#93c5fd', '#ffffff'] });
item('token_trail_rainbow', 'token_trail', 'legendary', 3000, 'Rainbow road', 'Радужный путь', { kind: 'rainbow', colors: ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#a78bfa'] });

item('token_victory_medal', 'token_victory', 'uncommon', 280, 'Podium medal', 'Медаль призёра', { kind: 'medal', on: 'podium' });
item('token_victory_gold', 'token_victory', 'rare', 700, 'Golden burst', 'Золотая вспышка', { kind: 'burst', on: 'win', colors: ['#fde68a', '#e3bb5c'] });
item('token_victory_crown', 'token_victory', 'legendary', 2800, 'Descending crown', 'Нисходящая корона', { kind: 'crown', on: 'podium', colors: ['#e3bb5c'] });
item('token_victory_supernova', 'token_victory', 'mythic', 7500, 'Supernova', 'Сверхновая', { kind: 'supernova', on: 'win', colors: ['#ffffff', '#a78bfa', '#f472b6'] });

// --- nickname ------------------------------------------------------------
item('name_style_brass', 'name_style', 'common', 80, 'Brass ink', 'Латунные чернила', { color: '#e3bb5c' });
item('name_style_emerald', 'name_style', 'common', 80, 'Emerald ink', 'Изумрудные чернила', { color: '#4fc39a' });
item('name_style_ruby', 'name_style', 'common', 80, 'Ruby ink', 'Рубиновые чернила', { color: '#f08a7e' });
item('name_style_terminal', 'name_style', 'common', 70, 'Terminal', 'Терминал', { color: '#86efac', font: 'mono', caps: true });
item('name_style_serif', 'name_style', 'uncommon', 180, 'Storybook serif', 'Книжная антиква', { color: '#f4ecdc', font: 'display', italic: true });
item('name_style_shadow', 'name_style', 'uncommon', 220, 'Deep shadow', 'Глубокая тень', { color: '#f4ecdc', shadow: '0 2px 0 #000, 0 4px 10px rgba(0,0,0,0.8)' });
item('name_style_sunset', 'name_style', 'rare', 500, 'Sunset gradient', 'Градиент «Закат»', { gradient: ['#fb923c', '#f472b6'] });
item('name_style_ocean', 'name_style', 'rare', 500, 'Ocean gradient', 'Градиент «Океан»', { gradient: ['#22d3ee', '#3b82f6'] });
item('name_style_neon', 'name_style', 'epic', 1200, 'Neon glow', 'Неоновое свечение', { color: '#a5f3fc', glow: '#22d3ee' });
item('name_style_aurora', 'name_style', 'epic', 1500, 'Aurora', 'Северное сияние', { gradient: ['#4ade80', '#22d3ee', '#a78bfa', '#4ade80'], animated: true });
item('name_style_royal', 'name_style', 'legendary', 2800, 'Royal gold', 'Королевское золото', { gradient: ['#96701c', '#f0d79a', '#e3bb5c', '#96701c'], animated: true, glow: '#c9982f', font: 'display' });
item('name_style_inferno', 'name_style', 'mythic', null, 'Inferno', 'Инферно', { gradient: ['#fde047', '#f97316', '#dc2626', '#fde047'], animated: true, glow: '#f97316', font: 'display' }, earned('streak', { streak: 10 }));
item('name_style_cosmos', 'name_style', 'mythic', 8500, 'Cosmos', 'Космос', { gradient: ['#c4b5fd', '#f0abfc', '#67e8f9', '#c4b5fd'], animated: true, glow: '#8b5cf6', font: 'display', italic: true });

item('name_decor_dots', 'name_decor', 'common', 60, 'Dots', 'Точки', { prefix: '•', suffix: '•', color: '#94917f' });
item('name_decor_brackets', 'name_decor', 'uncommon', 250, 'Corner brackets', 'Уголки', { prefix: '「', suffix: '」', color: '#e3bb5c' });
item('name_decor_stars', 'name_decor', 'uncommon', 200, 'Twin stars', 'Звёзды', { prefix: '✦', suffix: '✦', color: '#fde68a' });
item('name_decor_crown', 'name_decor', 'rare', 550, 'Crown', 'Корона', { prefix: '♛', color: '#e3bb5c' });
item('name_decor_swords', 'name_decor', 'rare', 600, 'Crossed swords', 'Скрещённые мечи', { prefix: '⚔', color: '#cbd5e1' });
item('name_decor_wings', 'name_decor', 'legendary', 2400, 'Wings', 'Крылья', { prefix: '꧁', suffix: '꧂', color: '#f0d79a' });

item('name_intro_fade', 'name_intro', 'common', 90, 'Fade in', 'Проявление', { kind: 'fade' });
item('name_intro_slide', 'name_intro', 'uncommon', 200, 'Slide in', 'Выезд', { kind: 'slide' });
item('name_intro_typewriter', 'name_intro', 'rare', 500, 'Typewriter', 'Печатная машинка', { kind: 'typewriter' });
item('name_intro_shine', 'name_intro', 'epic', 1200, 'Shine sweep', 'Блик', { kind: 'shine' });
item('name_intro_glitch', 'name_intro', 'legendary', 2500, 'Glitch', 'Глитч', { kind: 'glitch' });

// --- avatar ----------------------------------------------------------------
item('avatar_frame_silver', 'avatar_frame', 'common', 80, 'Silver frame', 'Серебряная рамка', { kind: 'ring', colors: ['#d8dde3'] });
item('avatar_frame_brass', 'avatar_frame', 'common', 90, 'Brass frame', 'Латунная рамка', { kind: 'ring', colors: ['#e3bb5c'] });
item('avatar_frame_double', 'avatar_frame', 'uncommon', 240, 'Double frame', 'Двойная рамка', { kind: 'double', colors: ['#f4ecdc', '#4fc39a'] });
item('avatar_frame_laurel', 'avatar_frame', 'rare', 650, 'Laurel wreath', 'Лавровый венок', { kind: 'laurel', colors: ['#4fc39a', '#e3bb5c'] });
item('avatar_frame_master_builder', 'avatar_frame', 'rare', null, 'Architect frame', 'Рамка зодчего', { kind: 'double', colors: ['#a57ae0', '#e3bb5c'] }, earned('achievement', { achievement: 'MASTER_BUILDER' }));
item('avatar_frame_gradient', 'avatar_frame', 'epic', 1250, 'Prism frame', 'Призматическая рамка', { kind: 'gradient', colors: ['#60a5fa', '#a78bfa', '#f472b6'] });
item('avatar_frame_contender', 'avatar_frame', 'epic', null, 'Contender frame', 'Рамка претендента', { kind: 'gradient', colors: ['#e3bb5c', '#f4ecdc', '#e3bb5c'] }, earned('leaderboard', { top: 10 }));
item('avatar_frame_animated', 'avatar_frame', 'legendary', 3000, 'Spinning halo', 'Вращающийся нимб', { kind: 'gradient', animated: true, colors: ['#fbbf24', '#f472b6', '#60a5fa', '#fbbf24'] });
item('avatar_frame_phoenix', 'avatar_frame', 'mythic', 9000, 'Phoenix flame', 'Пламя феникса', { kind: 'flame', animated: true, colors: ['#fde047', '#f97316', '#dc2626'] });

// --- profile ---------------------------------------------------------------
item('profile_bg_felt', 'profile_bg', 'common', 100, 'Card-table felt', 'Сукно игрового стола', { colors: ['#155040', '#0a2b20'], pattern: 'none' });
item('profile_bg_night', 'profile_bg', 'common', 100, 'Midnight', 'Полночь', { colors: ['#1e2a4a', '#0b0e1c'], pattern: 'none' });
item('profile_bg_parchment', 'profile_bg', 'uncommon', 250, 'Old parchment', 'Старый пергамент', { colors: ['#4a3b22', '#1b1710'], pattern: 'dots' });
item('profile_bg_citadel', 'profile_bg', 'uncommon', 280, 'Citadel dusk', 'Сумерки цитадели', { colors: ['#3b2a57', '#140f1c'], pattern: 'none' });
item('profile_bg_stars', 'profile_bg', 'rare', 700, 'Starfield', 'Звёздное небо', { colors: ['#111827', '#030712'], pattern: 'stars' });
item('profile_bg_aurora', 'profile_bg', 'epic', 1500, 'Aurora sky', 'Небо с сиянием', { colors: ['#064e3b', '#312e81', '#0f172a'], pattern: 'none', animated: true });
item('profile_bg_gilded', 'profile_bg', 'legendary', 3200, 'Gilded hall', 'Позолоченный зал', { colors: ['#3d2e0f', '#15110a'], pattern: 'grid', accent: '#e3bb5c' });

item('profile_card_glass', 'profile_card', 'common', 120, 'Frosted glass', 'Матовое стекло', { border: 'rgba(255,255,255,0.18)', accent: '#e4e4e7' });
item('profile_card_brass', 'profile_card', 'uncommon', 300, 'Brass plate', 'Латунная пластина', { border: 'rgba(227,187,92,0.45)', accent: '#e3bb5c' });
item('profile_card_obsidian', 'profile_card', 'rare', 750, 'Obsidian', 'Обсидиан', { border: 'rgba(167,139,250,0.4)', accent: '#a78bfa' });
item('profile_card_royal', 'profile_card', 'epic', 1600, 'Royal ornament', 'Королевский орнамент', { border: 'rgba(240,215,154,0.6)', accent: '#f0d79a', corners: true });

// --- effects ---------------------------------------------------------------
item('effect_join_sparkle', 'effect_join', 'common', 90, 'Sparkle entrance', 'Искристое появление', { kind: 'sparkle', colors: ['#fde68a'] });
item('effect_join_portal', 'effect_join', 'rare', 600, 'Portal entrance', 'Появление из портала', { kind: 'portal', colors: ['#a78bfa', '#22d3ee'] });
item('effect_join_lightning', 'effect_join', 'epic', 1300, 'Lightning entrance', 'Удар молнии', { kind: 'lightning', colors: ['#e0f2fe', '#60a5fa'] });

item('effect_win_confetti', 'effect_win', 'common', 120, 'Confetti', 'Конфетти', { kind: 'confetti', colors: ['#e3bb5c', '#4fc39a', '#e0695c', '#60a5fa'] });
item('effect_win_fireworks', 'effect_win', 'rare', 700, 'Fireworks', 'Фейерверк', { kind: 'fireworks', colors: ['#fde68a', '#f472b6', '#60a5fa'] });
item('effect_win_goldrain', 'effect_win', 'epic', 1500, 'Gold rain', 'Золотой дождь', { kind: 'coins', colors: ['#e3bb5c', '#f0d79a'] });
item('effect_win_supernova', 'effect_win', 'mythic', 7500, 'Supernova victory', 'Победная сверхновая', { kind: 'shockwave', colors: ['#ffffff', '#a78bfa', '#f472b6'] });

item('effect_loss_rain', 'effect_loss', 'common', 60, 'Quiet rain', 'Тихий дождь', { kind: 'rain', colors: ['#93c5fd'] });
item('effect_loss_ash', 'effect_loss', 'uncommon', 200, 'Falling ash', 'Падающий пепел', { kind: 'ash', colors: ['#a1a1aa'] });
item('effect_loss_gg', 'effect_loss', 'uncommon', 180, 'Good game banner', 'Баннер «Хорошая игра»', { kind: 'banner', colors: ['#e3bb5c'] });

item('effect_reward_coins', 'effect_reward', 'common', 100, 'Coin shower', 'Дождь монет', { kind: 'coins', colors: ['#e3bb5c'] });
item('effect_reward_chest', 'effect_reward', 'rare', 550, 'Treasure glow', 'Сияние сокровищ', { kind: 'spotlight', colors: ['#fde68a'] });
item('effect_reward_starburst', 'effect_reward', 'epic', 1200, 'Starburst', 'Звёздный взрыв', { kind: 'fireworks', colors: ['#fde68a', '#ffffff'] });

item('effect_rankup_arrow', 'effect_rankup', 'uncommon', 220, 'Rising arrow', 'Стрела вверх', { kind: 'rise', colors: ['#4fc39a'] });
item('effect_rankup_laurels', 'effect_rankup', 'rare', 650, 'Laurels', 'Лавры', { kind: 'confetti', colors: ['#4fc39a', '#e3bb5c'] });
item('effect_rankup_throne', 'effect_rankup', 'legendary', 2600, 'Throne light', 'Свет трона', { kind: 'spotlight', colors: ['#f0d79a', '#e3bb5c'] });

item('effect_podium_medals', 'effect_podium', 'uncommon', 260, 'Medal toss', 'Россыпь медалей', { kind: 'coins', colors: ['#e3bb5c', '#d8dde3', '#b0763c'] });
item('effect_podium_spotlight', 'effect_podium', 'epic', 1300, 'Podium spotlight', 'Прожектор пьедестала', { kind: 'spotlight', colors: ['#f4ecdc'] });

// --- titles ----------------------------------------------------------------
const title = (id, rarity, price, en, ru, color, extra) => item(id, 'title', rarity, price, en, ru, { text: { en, ru }, color }, extra);
title('title_rookie', 'common', null, 'Rookie', 'Новичок', '#cfc4ae', earned('starter'));
title('title_strategist', 'uncommon', 200, 'Strategist', 'Стратег', '#93c5fd');
title('title_tycoon', 'rare', 600, 'Tycoon', 'Магнат', '#e3bb5c');
title('title_don', 'rare', 650, 'The Don', 'Дон', '#f08a7e');
title('title_architect', 'rare', 650, 'Architect', 'Зодчий', '#c4b5fd');
title('title_elite', 'epic', 1400, 'Elite', 'Элита', '#67e8f9');
title('title_master', 'legendary', 2800, 'Master', 'Мастер', '#f0d79a');
title('title_winner', 'uncommon', null, 'Winner', 'Победитель', '#4fc39a', earned('achievement', { achievement: 'FIRST_WIN' }));
title('title_veteran', 'rare', null, 'Veteran', 'Ветеран', '#a3a3a3', earned('achievement', { achievement: 'VETERAN' }));
title('title_champion', 'epic', null, 'Champion', 'Чемпион', '#fbbf24', earned('achievement', { achievement: 'CHAMPION' }));
title('title_citadel_lord', 'rare', null, 'Lord of Citadels', 'Владыка цитаделей', '#a57ae0', earned('achievement', { achievement: 'CITADEL_LORD' }));
title('title_unstoppable', 'legendary', null, 'Unstoppable', 'Неудержимый', '#fb923c', earned('streak', { streak: 5 }));
title('title_season_legend', 'mythic', null, 'Legend of the Season', 'Легенда сезона', '#f0abfc', earned('leaderboard', { top: 1 }));

// --- badges ----------------------------------------------------------------
const badge = (id, rarity, price, en, ru, glyph, colors, extra) => item(id, 'badge', rarity, price, en, ru, { glyph, colors }, extra);
badge('badge_first_game', 'common', null, 'First game', 'Первая партия', '🎲', ['#3f9463', '#155a43'], earned('achievement', { achievement: 'FIRST_GAME' }));
badge('badge_host', 'uncommon', null, 'Host', 'Хозяин стола', '🚩', ['#a8342a', '#7c2019'], earned('achievement', { achievement: 'HOST' }));
badge('badge_polymath', 'rare', null, 'Polymath', 'Мастер на все игры', '🧭', ['#3a6ea8', '#1e3a66'], earned('achievement', { achievement: 'ALL_GAMES' }));
badge('badge_champion', 'epic', null, 'Champion', 'Чемпион', '🏆', ['#e3bb5c', '#96701c'], earned('achievement', { achievement: 'CHAMPION' }));
badge('badge_streak_3', 'uncommon', null, 'Hot streak', 'Серия побед', '🔥', ['#f97316', '#9a3412'], earned('streak', { streak: 3 }));
badge('badge_on_fire', 'epic', null, 'On fire', 'В ударе', '☄️', ['#dc2626', '#7f1d1d'], earned('streak', { streak: 5 }));
badge('badge_podium', 'legendary', null, 'Season podium', 'Пьедестал сезона', '🥇', ['#f0d79a', '#96701c'], earned('leaderboard', { top: 3 }));
badge('badge_festival', 'rare', null, 'Festival winner', 'Победитель фестиваля', '🎪', ['#db2777', '#831843'], earned('event', { event: 'weekend_festival', wins: 1 }));
badge('badge_spring', 'rare', null, 'Spring season', 'Весенний сезон', '🌸', ['#f9a8d4', '#9d174d'], earned('season', { season: 'spring', matches: 10 }));
badge('badge_summer', 'rare', null, 'Summer season', 'Летний сезон', '☀️', ['#fbbf24', '#b45309'], earned('season', { season: 'summer', matches: 10 }));
badge('badge_autumn', 'rare', null, 'Autumn season', 'Осенний сезон', '🍂', ['#ea580c', '#7c2d12'], earned('season', { season: 'autumn', matches: 10 }));
badge('badge_winter', 'rare', null, 'Winter season', 'Зимний сезон', '❄️', ['#7dd3fc', '#1e3a8a'], earned('season', { season: 'winter', matches: 10 }));
badge('badge_clover', 'common', 80, 'Lucky clover', 'Клевер удачи', '🍀', ['#22c55e', '#14532d']);
badge('badge_target', 'common', 80, 'Bullseye', 'В яблочко', '🎯', ['#ef4444', '#7f1d1d']);
badge('badge_moon', 'uncommon', 220, 'Night owl', 'Ночная сова', '🌙', ['#6366f1', '#1e1b4b']);
badge('badge_gem', 'rare', 600, 'Gem', 'Самоцвет', '💎', ['#22d3ee', '#155e75']);
badge('badge_dragon', 'epic', 1400, 'Dragon', 'Дракон', '🐉', ['#16a34a', '#052e16']);
badge('badge_trident', 'legendary', 3000, 'Trident', 'Трезубец', '🔱', ['#e3bb5c', '#1e3a8a']);
badge('badge_infinity', 'mythic', 7000, 'Infinity', 'Бесконечность', '♾️', ['#f0abfc', '#4c1d95']);

// --- emotes ----------------------------------------------------------------
const emote = (id, rarity, price, en, ru, glyph, anim, extra) => item(id, 'emote', rarity, price, en, ru, { glyph, anim }, extra);
emote('emote_wave', 'common', null, 'Wave', 'Привет', '👋', 'shake', earned('starter'));
emote('emote_gg', 'common', null, 'Good game', 'Хорошая игра', '🤝', 'pulse', earned('starter'));
emote('emote_laugh', 'common', 50, 'Laugh', 'Смех', '😂', 'bounce');
emote('emote_think', 'common', 50, 'Hmm', 'Хм', '🤔', 'float');
emote('emote_wow', 'common', 60, 'Wow', 'Ого', '😮', 'pulse');
emote('emote_angry', 'uncommon', 150, 'Grr', 'Грр', '😤', 'shake');
emote('emote_cool', 'uncommon', 160, 'Cool', 'Круто', '😎', 'bounce');
emote('emote_money', 'rare', 450, 'Money bags', 'При деньгах', '🤑', 'bounce');
emote('emote_skull', 'rare', 450, 'I am dead', 'Я всё', '💀', 'shake');
emote('emote_crown', 'epic', 1000, 'Crowned', 'Коронован', '👑', 'float');
emote('emote_fire', 'epic', 1000, 'On fire', 'Жара', '🔥', 'pulse');
emote('emote_dragon', 'legendary', 2200, 'Dragon roar', 'Рёв дракона', '🐲', 'spin');

// --- sounds ----------------------------------------------------------------
item('sound_start_drum', 'sound_start', 'common', 80, 'Drum roll start', 'Барабанная дробь', { preset: 'drum' });
item('sound_start_horn', 'sound_start', 'rare', 500, 'Herald horn', 'Рог глашатая', { preset: 'horn' });
item('sound_win_fanfare', 'sound_win', 'uncommon', 220, 'Victory fanfare', 'Победные фанфары', { preset: 'fanfare' });
item('sound_win_choir', 'sound_win', 'epic', 1200, 'Celestial choir', 'Небесный хор', { preset: 'choir' });
item('sound_reward_coin', 'sound_reward', 'common', 70, 'Coin clink', 'Звон монет', { preset: 'coin' });
item('sound_reward_harp', 'sound_reward', 'rare', 480, 'Harp glissando', 'Арфа', { preset: 'harp' });
item('sound_event_bell', 'sound_event', 'common', 70, 'Tower bell', 'Колокол', { preset: 'bell' });
item('sound_event_arcade', 'sound_event', 'uncommon', 200, 'Arcade blip', 'Аркадный сигнал', { preset: 'arcade' });

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

function getItem(id) {
  return typeof id === 'string' ? BY_ID.get(id) || null : null;
}

function rarityRank(rarity) {
  return RARITIES.indexOf(rarity);
}

function starterItems() {
  return ITEMS.filter((i) => i.source === 'starter');
}

function itemsWithRequirement(source) {
  return ITEMS.filter((i) => i.source === source);
}

module.exports = {
  RARITIES,
  PRICE_BANDS,
  CATEGORIES,
  SLOTS,
  ITEMS,
  getItem,
  rarityRank,
  starterItems,
  itemsWithRequirement,
};
