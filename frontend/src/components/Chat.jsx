// Chat.jsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { formatLogEntry } from '../i18n/logFormatter';
import Icon from './icons';

export default function Chat({ messages, onSend, playerId, board }) {
  const { t, language } = useTranslation();
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const submit = (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSend(clean);
    setText('');
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5">
              <Icon.chat className="h-5 w-5 text-parch/25" />
            </span>
            <p className="text-[12.5px] text-parch/40">{t('chat.noMessages')}</p>
          </div>
        )}
        {messages.map((msg, i) =>
          msg.system ? (
            <p key={i} className="text-center text-[11px] italic text-parch/30">
              {formatLogEntry(msg, t, language, board)}
            </p>
          ) : (
            <div key={i} className={`flex flex-col ${msg.playerId === playerId ? 'items-end' : 'items-start'}`}>
              <span className="mb-0.5 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold text-parch/40">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: msg.color }} />
                {msg.nickname}
              </span>
              <span
                className={`max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${
                  msg.playerId === playerId
                    ? 'rounded-br-sm bg-brass text-ink'
                    : 'rounded-bl-sm bg-white/[0.07] text-parch'
                }`}
              >
                {msg.text}
              </span>
            </div>
          ),
        )}
      </div>
      <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-white/[0.08] p-2.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={t('chat.placeholder')}
          className="field min-w-0 flex-1 py-2"
        />
        <button type="submit" disabled={!text.trim()} className="btn-primary shrink-0 px-3 py-2">
          <Icon.chevronRight className="h-4 w-4" />
          <span className="sr-only">{t('chat.send')}</span>
        </button>
      </form>
    </div>
  );
}
