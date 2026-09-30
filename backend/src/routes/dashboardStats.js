// dashboardStats.js
// Статистика платформы для личного дашборда: GET /api/stats
//
// Ничего нового не записывает — читает то, что платформа уже ведёт для админки:
// историю матчей (platform.db), живые комнаты (registry), кто онлайн (presence),
// аккаунты и журнал ошибок. Доступ только с заголовком
//   Authorization: Bearer <STATS_TOKEN>
// Без переменной окружения STATS_TOKEN (≥ 16 символов) эндпоинт выключен и отвечает 401.

const crypto = require('crypto');
const express = require('express');
const accountsDb = require('../db/accounts');
const platformDb = require('../db/platform');
const creatorDb = require('../db/creator');
const presence = require('../platform/presence');
const registry = require('../platform/registry');
const modes = require('../platform/modes');

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;

// У Монополии в каталоге режимы названы по картам («Классика»…), поэтому название игры — отдельно
const GAME_NAMES = {
  monopoly: 'Монополия',
  mafia: 'Мафия',
  catan: 'Катан',
  bunker: 'Бункер',
  citadels: 'Цитадели',
  cosmic: 'Космик',
  throne: 'Игра престолов',
  chpok: 'Чпок',
  memehype: 'Мемхайп',
};

function tokenOk(header) {
  const expected = process.env.STATS_TOKEN || '';
  if (expected.length < 16) return false;
  const got = Buffer.from(String(header || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(expected);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function collect() {
  const now = Date.now();
  const db = platformDb.connection;
  const one = (sql, ...args) => db.prepare(sql).get(...args);

  // Живые комнаты и игроки онлайн — так же, как в обзоре админки
  const rooms = registry.listRooms().filter((r) => !r.test);
  const onlineIds = presence.onlineAccountIds();
  const seatedOnline = new Set();
  rooms.forEach((room) => room.players.forEach((p) => {
    if (!p.connected) return;
    seatedOnline.add(p.accountId ? `a:${p.accountId}` : `g:${room.code}:${p.id}`);
  }));
  onlineIds.forEach((id) => seatedOnline.add(`a:${id}`));

  const accounts = accountsDb.listAll();
  const month = now - 30 * DAY;
  const finished30 = one("SELECT AVG(duration_ms) v, COUNT(*) n FROM matches WHERE status = 'finished' AND started_at >= ?", month);
  const avgPlayers30 = one('SELECT AVG(player_count) v FROM matches WHERE started_at >= ?', month).v || 0;
  const unique30 = one(
    `SELECT COUNT(DISTINCT COALESCE(mp.account_id, 'g:' || mp.player_id)) n
       FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE m.started_at >= ?`,
    month,
  ).n;
  const errors24 = Object.values(creatorDb.errorCountsByGame(now - DAY)).reduce((s, n) => s + n, 0);

  const metrics = [
    { key: 'rooms_active', label: 'Идёт игр сейчас', value: rooms.filter((r) => r.stage === 'active').length },
    { key: 'rooms_lobby', label: 'Комнат в лобби', value: rooms.filter((r) => r.stage === 'lobby').length },
    { key: 'players_online', label: 'Игроков онлайн', value: seatedOnline.size },
    { key: 'accounts_online', label: 'Аккаунтов онлайн', value: onlineIds.size },
    { key: 'games_today', label: 'Игр сегодня', value: one('SELECT COUNT(*) n FROM matches WHERE started_at >= ?', startOfToday()).n },
    { key: 'games_week', label: 'Игр за неделю', value: one('SELECT COUNT(*) n FROM matches WHERE started_at >= ?', now - 7 * DAY).n },
    { key: 'games_month', label: 'Игр за месяц', value: one('SELECT COUNT(*) n FROM matches WHERE started_at >= ?', month).n },
    { key: 'games_finished_30d', label: 'Доиграно за месяц', value: finished30.n },
    { key: 'avg_game_minutes', label: 'Средняя длительность игры', value: finished30.v ? Math.round(finished30.v / 60000) : 0, unit: 'мин' },
    { key: 'avg_players', label: 'Игроков в партии (в среднем)', value: Math.round(avgPlayers30 * 10) / 10 },
    { key: 'unique_players_30d', label: 'Уникальных игроков за 30 дней', value: unique30 },
    { key: 'users_total', label: 'Аккаунтов всего', value: accounts.length },
    { key: 'users_new_week', label: 'Новых аккаунтов за неделю', value: accounts.filter((a) => a.created_at >= now - 7 * DAY).length },
    { key: 'errors_24h', label: 'Ошибок сервера за сутки', value: errors24 },
    { key: 'uptime_hours', label: 'Аптайм процесса', value: Math.round(process.uptime() / 360) / 10, unit: 'ч' },
  ];

  // Популярность игр за 30 дней: по ключу на каждый тип игры
  const catalog = modes.catalog();
  db.prepare('SELECT game_type, COUNT(*) n FROM matches WHERE started_at >= ? GROUP BY game_type ORDER BY n DESC').all(month).forEach((r) => {
    const key = `games_30d_${String(r.game_type).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.slice(0, 63);
    const mode = catalog.find((m) => m.gameId === r.game_type || m.id === r.game_type);
    const label = GAME_NAMES[r.game_type] || (mode && (mode.label?.ru || mode.label?.en)) || r.game_type;
    metrics.push({ key, label: `Игр за 30 дней: ${label}`, value: r.n });
  });

  return { generatedAt: new Date(now).toISOString(), metrics };
}

router.get('/stats', (req, res) => {
  if (!tokenOk(req.headers.authorization)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.json(collect());
});

module.exports = router;
