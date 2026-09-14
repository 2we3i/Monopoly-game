// roomChat.js
// What the three games' room chats share: validating an emote, finding
// the players a message mentions, attaching the sender's name style, and
// notifying a mentioned player who has an account.
//
// A mention notification is only sent to a player who is allowed to read
// the message - Mafia's night channel must not leak through a
// notification preview.

const economy = require('../economy/service');
const { notify } = require('./notify');
const { findMentions } = require('./mentions');

const MAX_TEXT = 300;
const MENTION_COOLDOWN_MS = 15 * 1000;
const lastMention = new Map();

// sender: { id, accountId, nickname }; players: [{ id, accountId, nickname }]
function prepareRoomMessage({ text, emote, sender, players }) {
  const clean = String(text || '').trim().slice(0, MAX_TEXT);
  const emoteId = emote && sender.accountId && economy.ownsEmote(sender.accountId, emote) ? emote : null;
  if (!clean && !emoteId) return null;
  const candidates = players
    .filter((p) => p.id !== sender.id)
    .map((p) => ({ playerId: p.id, accountId: p.accountId || null, nickname: p.nickname }));
  const mentions = clean ? findMentions(clean, candidates) : [];
  return {
    playerId: sender.id,
    accountId: sender.accountId || null,
    nickname: sender.nickname,
    text: clean,
    emote: emoteId,
    mentions: mentions.map((m) => ({ playerId: m.playerId, accountId: m.accountId, nickname: m.nickname })),
    cosmetics: economy.cosmeticIds(sender.accountId),
    ts: Date.now(),
  };
}

function notifyMentions(message, { players, context, canRead = () => true }) {
  message.mentions.forEach((m) => {
    if (!m.accountId || m.accountId === message.accountId) return;
    const player = players.find((p) => p.id === m.playerId);
    if (player && !canRead(player)) return;
    const key = `${message.playerId}>${m.accountId}`;
    if (Date.now() - (lastMention.get(key) || 0) < MENTION_COOLDOWN_MS) return;
    lastMention.set(key, Date.now());
    // Repeated mentions by the same player in the same room collapse into
    // one unread notification with a count, like messages in a chat.
    notify(m.accountId, 'mention', {
      from: { id: message.accountId, playerId: message.playerId, nickname: message.nickname },
      excerpt: message.text.slice(0, 140),
      context,
    }, { groupKey: `mention:${context.gameType || 'room'}:${context.roomCode || ''}:${message.playerId}` });
  });
}

// Adds each registered player's account id (already their player id) and
// visible cosmetics to a room payload's player list.
function decoratePlayers(list, accountIdOf) {
  if (!Array.isArray(list)) return list;
  return list.map((p) => {
    const accountId = accountIdOf(p);
    return accountId ? { ...p, accountId, cosmetics: economy.cosmeticIds(accountId) } : p;
  });
}

module.exports = { prepareRoomMessage, notifyMentions, decoratePlayers };
