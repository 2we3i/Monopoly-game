// MessageText.jsx
// A message body with its mentions turned into clickable chips. The
// server already decided who is mentioned; this only finds where in the
// text each "@nickname" is, with the same word-boundary rules.

import { memo, useMemo } from 'react';

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function segment(text, mentions) {
  if (!mentions?.length || !text.includes('@')) return [{ text }];
  const lower = text.toLowerCase();
  const ranges = [];
  [...mentions]
    .filter((m) => m.nickname)
    .sort((a, b) => b.nickname.length - a.nickname.length)
    .forEach((m) => {
      const needle = `@${m.nickname.toLowerCase()}`;
      let index = lower.indexOf(needle);
      while (index !== -1) {
        const end = index + needle.length;
        const before = index > 0 ? text[index - 1] : '';
        const after = text[end] || '';
        const ok = before !== '@' && !(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after));
        if (ok && !ranges.some(([s, e]) => index < e && end > s)) ranges.push([index, end, m]);
        index = lower.indexOf(needle, index + 1);
      }
    });
  if (!ranges.length) return [{ text }];
  ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = 0;
  ranges.forEach(([s, e, m]) => {
    if (s > cursor) out.push({ text: text.slice(cursor, s) });
    out.push({ text: text.slice(s, e), mention: m });
    cursor = e;
  });
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

const MessageText = memo(({
  text, mentions, isMe = () => false, onMention, className = '',
}) => {
  const parts = useMemo(() => segment(text || '', mentions), [text, mentions]);
  return (
    <span className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}>
      {parts.map((part, i) => (part.mention ? (
        <button
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          type="button"
          onClick={(e) => { e.stopPropagation(); onMention?.(part.mention); }}
          className={`mention-chip ${isMe(part.mention) ? 'is-me' : ''}`}
        >
          {part.text}
        </button>
      ) : (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i}>{part.text}</span>
      )))}
    </span>
  );
});

export default MessageText;
