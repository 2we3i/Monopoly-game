// Messenger.jsx
// Private and group conversations: the conversation list with search and
// a new-chat picker, the history (loaded fifty at a time, older pages on
// demand), read receipts, and the shared composer with "@" mentions and
// "@@" group messages. Used as the /messages page and as a drawer over
// any other screen.

import {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import { apiFetch } from '../../lib/api';
import { navigate } from '../../lib/router';
import {
  clockTime, dayKey, dayLabel, listTime,
} from '../../lib/time';
import { StyledName } from '../../cosmetics/Cosmetics';
import { DashIcon } from '../ui/dash';
import UserAvatar from './UserAvatar';
import MentionComposer from '../chat/MentionComposer';
import MessageText from '../chat/MessageText';

const MAX_BODY = 2000;

function othersOf(conversation, myId) {
  return (conversation?.members || []).filter((m) => m.id !== myId);
}

function ConversationTitle({ conversation, myId, className = '' }) {
  const others = othersOf(conversation, myId);
  if (conversation.kind === 'direct' && others[0]) {
    return <StyledName nickname={others[0].nickname} cosmetics={others[0].cosmetics} className={className} />;
  }
  return <span className={`truncate ${className}`}>{others.map((m) => m.nickname).join(', ')}</span>;
}

function ConversationAvatar({ conversation, myId, size = 'md' }) {
  const others = othersOf(conversation, myId);
  if (conversation.kind === 'direct' && others[0]) {
    return <UserAvatar user={others[0]} size={size} online={others[0].online} />;
  }
  return (
    <span className="relative inline-flex h-10 w-10 shrink-0 4xl:h-12 4xl:w-12">
      <span className="absolute left-0 top-0"><UserAvatar user={others[0]} size="sm" frame={false} /></span>
      <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-[#121418]"><UserAvatar user={others[1] || others[0]} size="sm" frame={false} /></span>
    </span>
  );
}

function messageStatus(message, conversation, myId) {
  const others = othersOf(conversation, myId);
  if (!others.length) return 'sent';
  if (others.every((m) => m.lastReadId >= message.id)) return 'read';
  if (others.every((m) => m.lastDeliveredId >= message.id)) return 'delivered';
  return 'sent';
}

function StatusTicks({ status, t }) {
  const label = t(`messages.status.${status}`);
  return (
    <span title={label} aria-label={label} className={`inline-flex ${status === 'read' ? 'text-sky-300' : 'text-current opacity-70'}`}>
      <svg viewBox="0 0 18 12" className="h-3 w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6.5l3.2 3L10 2.5" />
        {status !== 'sent' && <path d="M7.5 9.5L8.3 10.2 16 2.5" />}
      </svg>
    </span>
  );
}

const MessageRow = memo(({
  message, mine, showSender, sender, status, t, language, myId, onOpenProfile,
}) => (
  <div className={`cv-row flex flex-col ${mine ? 'items-end' : 'items-start'} ${showSender ? 'mt-2.5' : 'mt-0.5'}`}>
    {showSender && sender && (
      <button type="button" onClick={() => onOpenProfile(sender.id)} className="mb-0.5 max-w-[70%] px-2 text-[11px] font-semibold text-zinc-400 hover:underline 4xl:text-[12.5px]">
        <StyledName nickname={sender.nickname} cosmetics={sender.cosmetics} />
      </button>
    )}
    <div
      className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-[13.5px] leading-snug sm:max-w-[72%] 4xl:max-w-[60%] 4xl:px-4 4xl:py-2 4xl:text-[15.5px] ${
        mine ? 'rounded-br-md bg-brass/90 text-ink' : 'rounded-bl-md bg-white/[0.07] text-zinc-100'
      }`}
    >
      <MessageText
        text={message.body}
        mentions={message.mentions}
        isMe={(m) => m.accountId === myId}
        onMention={(m) => onOpenProfile(m.accountId)}
      />
      <span className={`ml-2 inline-flex translate-y-0.5 items-center gap-1 whitespace-nowrap text-[10px] 4xl:text-[11.5px] ${mine ? 'text-ink/60' : 'text-zinc-500'}`}>
        {clockTime(message.createdAt, language)}
        {mine && <StatusTicks status={status} t={t} />}
      </span>
    </div>
  </div>
));

function NewConversation({ onOpen, onCancel }) {
  const { t } = useTranslation();
  const social = useSocial();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      social.searchUsers(query).then((users) => { if (alive) setResults(users); }).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(id); };
  }, [query, social]);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await onOpen(picked.map((u) => u.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100" aria-label={t('common.back')}>
          <DashIcon name="arrowLeft" className="h-4 w-4" />
        </button>
        <h3 className="flex-1 text-[14px] font-semibold text-zinc-100 4xl:text-[16px]">{t('messages.new')}</h3>
      </div>
      <div className="p-3">
        <div className="relative">
          <DashIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('messages.searchPlayers')} className="field pl-8 text-[13px] 4xl:text-[15px]" />
        </div>
        {picked.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {picked.map((u) => (
              <button key={u.id} type="button" onClick={() => setPicked((l) => l.filter((x) => x.id !== u.id))} className="inline-flex items-center gap-1 rounded-full bg-brass/15 px-2 py-0.5 text-[12px] text-brass-light ring-1 ring-inset ring-brass/30">
                {u.nickname}
                <DashIcon name="close" className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-zinc-500">{picked.length > 1 ? t('messages.groupHint', { n: picked.length + 1 }) : t('messages.pickHint')}</p>
      </div>
      <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5">
        {results.length === 0 && <li className="py-8 text-center text-[12.5px] text-zinc-500">{t('messages.noPlayers')}</li>}
        {results.map((u) => {
          const on = picked.some((p) => p.id === u.id);
          return (
            <li key={u.id} className="cv-row">
              <button
                type="button"
                onClick={() => setPicked((l) => (on ? l.filter((x) => x.id !== u.id) : [...l, u].slice(0, 19)))}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] ${on ? 'bg-brass/10' : ''}`}
              >
                <UserAvatar user={u} size="sm" online={u.online} />
                <StyledName nickname={u.nickname} cosmetics={u.cosmetics} showTitle className="text-[13.5px] text-zinc-100 4xl:text-[15px]" />
                <span className={`ml-auto flex h-5 w-5 items-center justify-center rounded-md border ${on ? 'border-brass bg-brass text-ink' : 'border-white/20'}`}>
                  {on && <DashIcon name="check" className="h-3.5 w-3.5" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/[0.07] p-3">
        {error && <p className="mb-2 text-[12px] text-red-300">{error}</p>}
        <button type="button" disabled={!picked.length || busy} onClick={open} className="btn-primary w-full py-2.5">
          <DashIcon name="mail" className="h-4 w-4" />
          {picked.length > 1 ? t('messages.startGroup') : t('messages.startChat')}
        </button>
      </div>
    </div>
  );
}

function Thread({
  conversation, messages, hasMore, loading, loadingOlder, onLoadOlder, onSend, onSendGroup, onBack, myId,
}) {
  const { t, language } = useTranslation();
  const social = useSocial();
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const nearBottom = useRef(true);
  const prependHeight = useRef(null);
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  const firstId = messages.length ? messages[0].id : 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependHeight.current != null) {
      el.scrollTop = el.scrollHeight - prependHeight.current;
      prependHeight.current = null;
    }
  }, [firstId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const mineLast = messages.length && messages[messages.length - 1].senderId === myId;
    if (nearBottom.current || mineLast) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  useEffect(() => { nearBottom.current = true; setText(''); }, [conversation.id]);

  const others = othersOf(conversation, myId);
  const byId = useMemo(() => new Map(conversation.members.map((m) => [m.id, m])), [conversation.members]);
  const candidates = useMemo(() => others.map((m) => ({ key: m.id, ...m })), [others]);

  const loadOlder = () => {
    if (!scrollRef.current) return;
    prependHeight.current = scrollRef.current.scrollHeight;
    onLoadOlder();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2.5 border-b border-white/[0.07] px-3 py-2.5 4xl:px-5 4xl:py-3.5">
        {onBack && (
          <button type="button" onClick={onBack} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 md:hidden" aria-label={t('common.back')}>
            <DashIcon name="arrowLeft" className="h-4 w-4" />
          </button>
        )}
        <ConversationAvatar conversation={conversation} myId={myId} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-zinc-50 4xl:text-[16.5px]">
            <ConversationTitle conversation={conversation} myId={myId} />
          </p>
          <p className="truncate text-[11.5px] text-zinc-500 4xl:text-[13px]">
            {conversation.kind === 'direct'
              ? (others[0]?.online ? t('social.online') : t('social.offline'))
              : t('messages.members', { n: conversation.members.length })}
          </p>
        </div>
        {conversation.kind === 'direct' && others[0] && (
          <button type="button" onClick={() => social.openProfile(others[0].id)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-white/[0.06] 4xl:text-[14px]">
            {t('social.profile')}
          </button>
        )}
      </header>
      {conversation.kind === 'group' && (
        <div className="flex gap-1 overflow-x-auto border-b border-white/[0.05] px-3 py-1.5 scrollbar-thin">
          {others.map((m) => (
            <button key={m.id} type="button" onClick={() => social.openProfile(m.id)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.04] py-0.5 pl-0.5 pr-2 text-[11.5px] text-zinc-300 hover:bg-white/[0.08]">
              <UserAvatar user={m} size="xs" frame={false} online={m.online} />
              {m.nickname}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4 4xl:px-8"
      >
        {hasMore && (
          <div className="flex justify-center py-2">
            <button type="button" disabled={loadingOlder} onClick={loadOlder} className="rounded-full border border-white/10 px-3 py-1 text-[11.5px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100">
              {loadingOlder ? t('common.loading') : t('messages.older')}
            </button>
          </div>
        )}
        {loading && <p className="py-10 text-center text-[12.5px] text-zinc-500">{t('common.loading')}</p>}
        {!loading && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <DashIcon name="mail" className="h-8 w-8 text-zinc-600" />
            <p className="text-[13px] text-zinc-400">{t('messages.emptyThread')}</p>
            <p className="max-w-xs text-[11.5px] text-zinc-500">{t('chat.mentionTip')}</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const mine = m.senderId === myId;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 4xl:text-[12px]">
                  <span className="h-px flex-1 bg-white/[0.06]" />
                  {dayLabel(m.createdAt, language, t)}
                  <span className="h-px flex-1 bg-white/[0.06]" />
                </div>
              )}
              <MessageRow
                message={m}
                mine={mine}
                showSender={conversation.kind === 'group' && !mine && (newDay || prev?.senderId !== m.senderId)}
                sender={byId.get(m.senderId)}
                status={mine ? messageStatus(m, conversation, myId) : null}
                t={t}
                language={language}
                myId={myId}
                onOpenProfile={social.openProfile}
              />
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-white/[0.07] bg-black/10">
        <MentionComposer
          value={text}
          onChange={setText}
          onSubmit={(value) => { onSend(value); setText(''); nearBottom.current = true; }}
          onGroupSubmit={onSendGroup}
          candidates={candidates}
          groupEnabled
          searchUsers={social.searchUsers}
          multiline
          maxLength={MAX_BODY}
          size="md"
          placeholder={t('messages.placeholder')}
        />
        {text.length > MAX_BODY - 200 && <p className="px-3 pb-1.5 text-right text-[11px] text-zinc-500 tnum">{text.length}/{MAX_BODY}</p>}
      </div>
    </div>
  );
}

export default function Messenger({ target, targetKey, onClose, layout = 'page' }) {
  const { t, language } = useTranslation();
  const social = useSocial();
  const { token, myId } = social;
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState('');
  const [thread, setThread] = useState(null);
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;

  const upsert = useCallback((conversation, { unread } = {}) => {
    setConversations((list) => {
      const current = list || [];
      const existing = current.find((c) => c.id === conversation.id);
      const merged = { ...existing, ...conversation, unread: unread ?? existing?.unread ?? 0 };
      return [merged, ...current.filter((c) => c.id !== conversation.id)]
        .sort((a, b) => (b.lastMessageAt || b.createdAt || 0) - (a.lastMessageAt || a.createdAt || 0));
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch('/api/social/conversations', { token })
      .then((res) => {
        setConversations(res.conversations);
        social.setUnreadMessages(res.unreadMessages);
      })
      .catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!target || !token) return;
    setComposing(false);
    if (target.conversationId) {
      setSelectedId(Number(target.conversationId));
    } else if (target.recipientIds?.length) {
      apiFetch('/api/social/conversations', { method: 'POST', token, body: { recipientIds: target.recipientIds } })
        .then((res) => {
          upsert(res.conversation);
          setSelectedId(res.conversation.id);
        })
        .catch(setError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, token]);

  useEffect(() => {
    social.setActiveConversation(selectedId);
    if (!selectedId || !token) {
      setThread(null);
      return undefined;
    }
    let alive = true;
    setThread({
      id: selectedId, messages: [], hasMore: false, loading: true, conversation: null,
    });
    apiFetch(`/api/social/conversations/${selectedId}/messages`, { token })
      .then((res) => {
        if (!alive) return;
        setThread({
          id: selectedId, messages: res.messages, hasMore: res.hasMore, loading: false, conversation: res.conversation,
        });
        upsert(res.conversation);
      })
      .catch((err) => { if (alive) setError(err); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, token]);

  useEffect(() => () => social.setActiveConversation(null), [social]);

  // Live updates.
  useEffect(() => social.subscribe('dm:message', ({ conversation, message }) => {
    const mine = message.senderId === myId;
    const open = selectedRef.current === conversation.id;
    setConversations((list) => {
      if (!list) return list;
      const existing = list.find((c) => c.id === conversation.id);
      const unread = mine || open ? 0 : (existing?.unread || 0) + 1;
      return [{ ...conversation, unread }, ...list.filter((c) => c.id !== conversation.id)];
    });
    setThread((th) => {
      if (!th || th.id !== conversation.id || th.messages.some((m) => m.id === message.id)) return th;
      return { ...th, messages: [...th.messages, message], conversation: { ...conversation } };
    });
  }), [social, myId]);

  useEffect(() => social.subscribe('dm:receipt', ({
    conversationId, accountId, lastReadId, lastDeliveredId,
  }) => {
    const patch = (c) => (c && c.id === conversationId ? {
      ...c,
      members: c.members.map((m) => (m.id === accountId ? { ...m, lastReadId, lastDeliveredId } : m)),
    } : c);
    setConversations((list) => (list ? list.map(patch) : list));
    setThread((th) => (th && th.id === conversationId ? { ...th, conversation: patch(th.conversation) } : th));
  }), [social]);

  // Mark what is on screen as read.
  const lastId = thread?.messages.length ? thread.messages[thread.messages.length - 1].id : 0;
  useEffect(() => {
    if (!thread || thread.loading || !lastId || !token) return;
    const myLastRead = thread.conversation?.members.find((m) => m.id === myId)?.lastReadId || 0;
    if (lastId <= myLastRead && !(conversations || []).find((c) => c.id === thread.id)?.unread) return;
    if (document.visibilityState === 'hidden') return;
    apiFetch(`/api/social/conversations/${thread.id}/read`, { method: 'POST', token, body: { upTo: lastId } })
      .then((res) => {
        social.setUnreadMessages(res.unreadMessages);
        setConversations((list) => (list ? list.map((c) => (c.id === thread.id ? { ...c, unread: 0, lastReadId: lastId } : c)) : list));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, lastId, thread?.loading]);

  const loadOlder = () => {
    if (!thread?.messages.length) return;
    setThread((th) => ({ ...th, loadingOlder: true }));
    apiFetch(`/api/social/conversations/${thread.id}/messages?before=${thread.messages[0].id}`, { token })
      .then((res) => setThread((th) => (th && th.id === thread.id ? {
        ...th, messages: [...res.messages, ...th.messages], hasMore: res.hasMore, loadingOlder: false,
      } : th)))
      .catch(() => setThread((th) => ({ ...th, loadingOlder: false })));
  };

  const send = async (body) => {
    try {
      const res = await apiFetch(`/api/social/conversations/${thread.id}/messages`, { method: 'POST', token, body: { body } });
      setThread((th) => (th && th.id === res.conversation.id && !th.messages.some((m) => m.id === res.message.id)
        ? { ...th, messages: [...th.messages, res.message] } : th));
      upsert(res.conversation, { unread: 0 });
    } catch (err) {
      setError(err);
    }
  };

  const sendGroup = async (recipients, body) => {
    const res = await social.sendGroup(recipients.map((r) => r.id), body);
    upsert(res.conversation, { unread: 0 });
    setSelectedId(res.conversation.id);
  };

  const openNew = async (recipientIds) => {
    const res = await apiFetch('/api/social/conversations', { method: 'POST', token, body: { recipientIds } });
    upsert(res.conversation);
    setComposing(false);
    setSelectedId(res.conversation.id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations || [];
    return (conversations || []).filter((c) => othersOf(c, myId).some((m) => m.nickname.toLowerCase().includes(q)));
  }, [conversations, query, myId]);

  if (!social.enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-zinc-400">
        <DashIcon name="lock" className="h-8 w-8" />
        <p>{t('messages.loginRequired')}</p>
      </div>
    );
  }

  const selectedConversation = thread?.conversation || (conversations || []).find((c) => c.id === selectedId);

  return (
    <div className="flex h-full min-h-0 overflow-hidden text-zinc-200">
      <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full min-w-0 shrink-0 flex-col border-white/[0.07] md:w-[300px] md:border-r lg:w-[330px] 3xl:w-[360px] 4xl:w-[440px]`}>
        {composing ? (
          <NewConversation onOpen={openNew} onCancel={() => setComposing(false)} />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5 4xl:py-3.5">
              <h2 className="flex-1 text-[15px] font-semibold text-zinc-50 4xl:text-[18px]">{t('messages.title')}</h2>
              <button type="button" onClick={() => setComposing(true)} className="flex items-center gap-1 rounded-lg bg-brass/15 px-2.5 py-1.5 text-[12px] font-semibold text-brass-light hover:bg-brass/25 4xl:text-[14px]">
                <DashIcon name="plus" className="h-3.5 w-3.5" />
                {t('messages.new')}
              </button>
              {layout === 'drawer' && (
                <>
                  <button type="button" onClick={() => { onClose?.(); navigate('/messages'); }} title={t('messages.openPage')} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-100">
                    <DashIcon name="expand" className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-100">
                    <DashIcon name="close" className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            <div className="px-3 py-2">
              <div className="relative">
                <DashIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('messages.search')} className="field pl-8 text-[13px] 4xl:text-[15px]" />
              </div>
            </div>
            <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
              {!conversations && !error && <li className="py-10 text-center text-[12.5px] text-zinc-500">{t('common.loading')}</li>}
              {error && <li className="py-6 text-center text-[12.5px] text-red-300">{error.message}</li>}
              {conversations && filtered.length === 0 && (
                <li className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                  <DashIcon name="mail" className="h-8 w-8 text-zinc-600" />
                  <p className="text-[13px] text-zinc-400">{query ? t('messages.noMatches') : t('messages.empty')}</p>
                  {!query && <button type="button" onClick={() => setComposing(true)} className="btn-primary mt-1 px-3 py-1.5 text-[12.5px]">{t('messages.new')}</button>}
                </li>
              )}
              {filtered.map((c) => {
                const last = c.lastMessage;
                const mineLast = last?.senderId === myId;
                return (
                  <li key={c.id} className="cv-row">
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors 4xl:py-3 ${selectedId === c.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}
                    >
                      <ConversationAvatar conversation={c} myId={myId} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[13.5px] 4xl:text-[15.5px] ${c.unread ? 'font-semibold text-zinc-50' : 'text-zinc-200'}`}>
                            <ConversationTitle conversation={c} myId={myId} />
                          </span>
                          <span className="shrink-0 text-[10.5px] text-zinc-500 4xl:text-[12px]">{listTime(c.lastMessageAt, language)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[12px] 4xl:text-[13.5px] ${c.unread ? 'text-zinc-300' : 'text-zinc-500'}`}>
                            {mineLast && `${t('messages.you')}: `}
                            {last?.body}
                          </span>
                          {c.unread > 0 && (
                            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brass px-1 text-[10px] font-black text-ink">
                              {c.unread > 99 ? '99+' : c.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>

      <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {selectedConversation && thread ? (
          <Thread
            conversation={selectedConversation}
            messages={thread.messages}
            hasMore={thread.hasMore}
            loading={thread.loading}
            loadingOlder={thread.loadingOlder}
            onLoadOlder={loadOlder}
            onSend={send}
            onSendGroup={sendGroup}
            onBack={() => setSelectedId(null)}
            myId={myId}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brass/10 text-brass-light 4xl:h-20 4xl:w-20">
              <DashIcon name="mail" className="h-7 w-7 4xl:h-10 4xl:w-10" />
            </span>
            <p className="text-[14px] font-semibold text-zinc-200 4xl:text-[17px]">{t('messages.pickConversation')}</p>
            <p className="max-w-sm text-[12.5px] text-zinc-500 4xl:text-[14px]">{t('messages.pickConversationHint')}</p>
            {layout === 'drawer' && (
              <button type="button" onClick={onClose} className="mt-2 rounded-lg px-3 py-1.5 text-[12.5px] text-zinc-400 hover:bg-white/5 md:hidden">{t('common.close')}</button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function MessengerDrawer() {
  const social = useSocial();
  const { open, target, seq } = social.messenger;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') social.closeMessenger(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, social]);
  if (!open || !social.enabled) return null;
  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/50 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) social.closeMessenger(); }}>
      <div className="flex h-full w-full max-w-[920px] animate-fade-in flex-col border-l border-white/[0.08] bg-[#101216] shadow-deep 4xl:max-w-[1280px]">
        <Messenger target={target} targetKey={seq} onClose={social.closeMessenger} layout="drawer" />
      </div>
    </div>
  );
}
