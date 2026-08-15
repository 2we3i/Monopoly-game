// Chat.jsx
// Simple scrolling chat log + input. System messages (joins/leaves) render
// distinctly from player messages. Auto-scrolls to the latest message.

import { useEffect, useRef, useState } from 'react';

export default function Chat({ messages, onSend, playerId }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const submit = (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSend(clean);
    setText('');
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-3.5 py-3">
        {messages.length === 0 && (
          <p className="mt-4 text-center text-sm text-ink-faint">No messages yet. Say hi!</p>
        )}
        {messages.map((msg, i) =>
          msg.system ? (
            <p key={i} className="text-center text-xs italic text-ink-faint">
              {msg.text}
            </p>
          ) : (
            <div key={i} className={`flex flex-col ${msg.playerId === playerId ? 'items-end' : 'items-start'}`}>
              <span className="mb-0.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: msg.color }} />
                {msg.nickname}
              </span>
              <span
                className={`max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm ${
                  msg.playerId === playerId
                    ? 'rounded-tr-sm bg-brass text-ink'
                    : 'rounded-tl-sm bg-board-tile text-ink'
                }`}
              >
                {msg.text}
              </span>
            </div>
          ),
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-board-line/60 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Type a message…"
          className="min-w-0 flex-1 rounded-lg border border-board-line bg-board-tile px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brass"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="shrink-0 rounded-lg bg-brass px-3.5 py-2 text-sm font-semibold text-ink transition-transform active:scale-95 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
