// mentions.js
// Finds "@nickname" mentions in a message.
//
// Only people who could actually be meant are matched - the players in
// the room, or the members of a conversation - and the longest nickname
// wins where names overlap ("@Anna Maria" is not also "@Anna"). "@@" is
// the composer's syntax for choosing a group of recipients; the composer
// removes it before sending, and a stray "@@name" left in the text is
// never read as a mention.

const WORD_CHAR = /[\p{L}\p{N}_]/u;

// candidates: [{ nickname, accountId?, playerId? }]
function findMentions(text, candidates) {
  if (typeof text !== 'string' || !text.includes('@')) return [];
  const lower = text.toLowerCase();
  const taken = [];
  const found = new Map();
  [...candidates]
    .filter((c) => c && typeof c.nickname === 'string' && c.nickname.trim())
    .sort((a, b) => b.nickname.length - a.nickname.length)
    .forEach((candidate) => {
      const needle = `@${candidate.nickname.toLowerCase()}`;
      let from = 0;
      let index = lower.indexOf(needle, from);
      while (index !== -1) {
        from = index + 1;
        const end = index + needle.length;
        const before = index > 0 ? text[index - 1] : '';
        const after = text[end] || '';
        const boundaryOk = before !== '@' && !(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after));
        const overlaps = taken.some(([s, e]) => index < e && end > s);
        if (boundaryOk && !overlaps) {
          taken.push([index, end]);
          const key = candidate.accountId || candidate.playerId || candidate.nickname;
          if (!found.has(key)) found.set(key, candidate);
        }
        index = lower.indexOf(needle, from);
      }
    });
  return [...found.values()];
}

module.exports = { findMentions };
