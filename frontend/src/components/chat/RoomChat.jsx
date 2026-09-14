// RoomChat.jsx
// The chat inside a game room, shared by Monopoly, Mafia and Citadels:
// styled names, clickable mentions, emotes, and the shared composer with
// "@" mentions and "@@" private group messages.
//
// Each game keeps its own rules about who may speak and who reads what -
// the server enforces them; this component only draws.

import {
  memo, useEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import { useCatalog } from '../../lib/catalog';
import { Emote, StyledName } from '../../cosmetics/Cosmetics';
import MentionComposer from './MentionComposer';
import MessageText from './MessageText';
import Icon from '../icons';

function EmotePicker({ onPick, disabled }) {
  const { t } = useTranslation();
  const social = useSocial();
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const emotes = useMemo(() => {
    if (!catalog) return [];
    const equipped = social.loadout.emote || [];
    return catalog.items
      .filter((i) => i.slot === 'emote' && social.ownedIds.has(i.id))
      .sort((a, b) => Number(!equipped.includes(a.id)) - Number(!equipped.includes(b.id)));
  }, [catalog, social.loadout, social.ownedIds]);

  if (!social.enabled || !emotes.length) return null;
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} className="btn-ghost px-2.5 py-2" aria-label={t('chat.emotes')} title={t('chat.emotes')}>
        <span className="text-[15px] leading-none">😊</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-xl border border-white/10 bg-[#16181d] p-2 shadow-deep 4xl:w-72">
          <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{t('chat.emotes')}</p>
          <div className="grid grid-cols-4 gap-1">
            {emotes.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.name.en}
                onClick={() => { onPick(item.id); setOpen(false); }}
                className="flex aspect-square items-center justify-center rounded-lg text-[22px] transition-colors hover:bg-white/[0.08] 4xl:text-[28px]"
              >
                {item.visual.glyph}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ChatLine = memo(({
  msg, myPlayerId, variant, nameTone, onOpenProfile, catalog, channelBadge,
}) => {
  const mine = msg.playerId === myPlayerId;
  const mentionsMe = msg.mentions?.some((m) => m.playerId === myPlayerId);
  const emote = msg.emote && catalog ? catalog.byId.get(msg.emote) : null;
  const name = (
    <button
      type="button"
      onClick={() => msg.accountId && onOpenProfile(msg.accountId)}
      className={`min-w-0 max-w-full ${msg.accountId ? 'hover:underline' : 'cursor-default'} ${nameTone ? nameTone(msg) : ''}`}
    >
      <StyledName nickname={msg.nickname} cosmetics={msg.cosmetics} />
    </button>
  );
  const body = (
    <>
      {emote && <Emote item={emote} size={msg.text ? 'sm' : 'md'} className={msg.text ? 'mr-1 align-middle' : ''} />}
      {msg.text && (
        <MessageText
          text={msg.text}
          mentions={msg.mentions}
          isMe={(m) => m.playerId === myPlayerId}
          onMention={(m) => m.accountId && onOpenProfile(m.accountId)}
        />
      )}
    </>
  );

  if (variant === 'bubbles') {
    return (
      <div className={`cv-row flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <span className="mb-0.5 flex max-w-full items-center gap-1.5 px-1 text-[10.5px] font-semibold text-parch/40 4xl:text-[12px]">
          {msg.color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: msg.color }} />}
          {name}
        </span>
        <span
          className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug 4xl:text-[15px] ${
            emote && !msg.text ? 'bg-transparent px-1' : mine ? 'rounded-br-sm bg-brass text-ink' : 'rounded-bl-sm bg-white/[0.07] text-parch'
          } ${mentionsMe ? 'ring-2 ring-brass-light/70' : ''}`}
        >
          {body}
        </span>
      </div>
    );
  }
  return (
    <p className={`cv-row text-[12.5px] leading-snug 4xl:text-[14.5px] ${mentionsMe ? '-mx-1.5 rounded-md bg-brass/10 px-1.5 py-0.5' : ''}`}>
      {channelBadge?.(msg)}
      <span className="font-bold">{name}</span>
      <span className="text-parch/40">: </span>
      <span className="text-parch/80">{body}</span>
    </p>
  );
});

export default function RoomChat({
  messages,
  onSend,
  players = [],
  myPlayerId,
  variant = 'lines',
  disabled = false,
  placeholder,
  renderSystem,
  nameTone,
  channelBadge,
  header = null,
  className = '',
  listClassName = '',
}) {
  const { t } = useTranslation();
  const social = useSocial();
  const catalog = useCatalog();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState(null);
  const scrollRef = useRef(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, notice]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(id);
  }, [notice]);

  const candidates = useMemo(() => players
    .filter((p) => p.id !== myPlayerId)
    .map((p) => ({
      key: p.id, id: p.accountId || null, nickname: p.nickname, avatarUrl: p.avatarUrl, cosmetics: p.cosmetics,
    })), [players, myPlayerId]);
  const groupSuggestions = useMemo(() => candidates.filter((c) => c.id && c.id !== social.myId), [candidates, social.myId]);

  const send = (value) => {
    onSend(value);
    setText('');
    nearBottom.current = true;
  };

  const sendGroup = async (recipients, value) => {
    await social.sendGroup(recipients.map((r) => r.id), value);
    setNotice(t('chat.groupSent', { names: recipients.map((r) => r.nickname).join(', ') }));
  };

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${className}`}>
      {header}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-2 ${variant === 'bubbles' ? 'space-y-2.5 py-3' : 'space-y-1'} ${listClassName}`}
      >
        {messages.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
              <Icon.chat className="h-5 w-5 text-parch/25" />
            </span>
            <p className="text-[12.5px] text-parch/40">{t('chat.noMessages')}</p>
            <p className="max-w-[16rem] text-[11px] text-parch/25">{t('chat.mentionTip')}</p>
          </div>
        )}
        {messages.map((msg, i) => (msg.system ? (
          // eslint-disable-next-line react/no-array-index-key
          <p key={`s${i}`} className="cv-row text-center text-[11px] italic text-parch/30 4xl:text-[12.5px]">{renderSystem ? renderSystem(msg) : msg.text}</p>
        ) : (
          <ChatLine
            // eslint-disable-next-line react/no-array-index-key
            key={`${msg.ts}-${msg.playerId}-${i}`}
            msg={msg}
            myPlayerId={myPlayerId}
            variant={variant}
            nameTone={nameTone}
            channelBadge={channelBadge}
            onOpenProfile={social.openProfile}
            catalog={catalog}
          />
        )))}
        {notice && (
          <p className="rounded-lg border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-center text-[11.5px] text-violet-200">
            🔒 {notice}
          </p>
        )}
      </div>
      <div className="shrink-0 border-t border-white/[0.07]">
        <MentionComposer
          value={text}
          onChange={setText}
          onSubmit={send}
          onGroupSubmit={sendGroup}
          candidates={candidates}
          groupEnabled={social.enabled}
          groupSuggestions={groupSuggestions}
          searchUsers={social.searchUsers}
          disabled={disabled}
          placeholder={placeholder || t('chat.placeholder')}
          leading={<EmotePicker disabled={disabled} onPick={(emote) => onSend('', { emote })} />}
        />
      </div>
    </div>
  );
}
