// MentionComposer.jsx
// The message box every chat shares.
//
//   @name   - a mention: typing "@" opens a list of the people in this
//             chat; picking one inserts "@Nickname".
//   @@      - a group message: typing "@@" opens a picker where several
//             players can be searched for, added and removed. While any
//             are selected, the message goes privately to exactly them
//             instead of to this chat.
//
// "@@" is recognised before "@" and removed from the text as soon as the
// picker opens, so the two never collide.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { DashIcon } from '../ui/dash';
import UserAvatar from '../social/UserAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';

const TOKEN_RE = /(^|\s)(@@|@)([^\s@]{0,32})$/u;

function detect(text, caret) {
  const match = text.slice(0, caret).match(TOKEN_RE);
  if (!match) return null;
  const token = match[2] + match[3];
  return {
    mode: match[2] === '@@' ? 'group' : 'mention', start: caret - token.length, end: caret, query: match[3],
  };
}

function rankByQuery(list, query) {
  const q = query.toLowerCase();
  return list
    .filter((c) => c.nickname && c.nickname.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.nickname.toLowerCase().startsWith(q)) - Number(!b.nickname.toLowerCase().startsWith(q)) || a.nickname.localeCompare(b.nickname));
}

export default function MentionComposer({
  value,
  onChange,
  onSubmit,
  onGroupSubmit,
  candidates = [],
  groupEnabled = false,
  groupSuggestions = [],
  searchUsers,
  multiline = false,
  maxLength = 300,
  placeholder,
  disabled = false,
  leading = null,
  size = 'sm',
}) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const pickerSearchRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [active, setActive] = useState(0);
  const [group, setGroup] = useState([]);
  const [groupQuery, setGroupQuery] = useState('');
  const [remote, setRemote] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const mentionOptions = useMemo(
    () => (menu?.mode === 'mention' ? rankByQuery(candidates, menu.query).slice(0, 8) : []),
    [menu, candidates],
  );

  useEffect(() => {
    if (menu?.mode !== 'group' || !groupEnabled || !searchUsers) return undefined;
    let alive = true;
    const id = setTimeout(() => {
      searchUsers(groupQuery).then((users) => { if (alive) setRemote(users); }).catch(() => {});
    }, 220);
    return () => { alive = false; clearTimeout(id); };
  }, [menu, groupQuery, groupEnabled, searchUsers]);

  const groupOptions = useMemo(() => {
    if (menu?.mode !== 'group') return [];
    const seen = new Set(group.map((g) => g.id));
    const merged = [];
    [...rankByQuery(groupSuggestions, groupQuery), ...remote].forEach((u) => {
      if (!u.id || seen.has(u.id)) return;
      seen.add(u.id);
      merged.push(u);
    });
    return merged.slice(0, 8);
  }, [menu, group, groupSuggestions, groupQuery, remote]);

  const focusInput = (caret) => requestAnimationFrame(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (caret != null) el.setSelectionRange(caret, caret);
  });

  const resize = (el) => {
    if (!multiline || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };

  const handleChange = (e) => {
    const text = e.target.value.slice(0, maxLength);
    const caret = e.target.selectionStart ?? text.length;
    setError(null);
    const found = detect(text, caret);
    if (found?.mode === 'group') {
      onChange(text.slice(0, found.start) + text.slice(found.end));
      setGroupQuery(found.query);
      setMenu({ mode: 'group', caret: found.start });
      requestAnimationFrame(() => pickerSearchRef.current?.focus());
      return;
    }
    onChange(text);
    setMenu(found);
    setActive(0);
    resize(e.target);
  };

  const pickMention = (candidate) => {
    if (!menu) return;
    const insert = `@${candidate.nickname} `;
    const next = (value.slice(0, menu.start) + insert + value.slice(menu.end)).slice(0, maxLength);
    onChange(next);
    setMenu(null);
    focusInput(menu.start + insert.length);
  };

  const addToGroup = (user) => {
    setGroup((list) => (list.some((u) => u.id === user.id) || list.length >= 19 ? list : [...list, user]));
    setGroupQuery('');
    pickerSearchRef.current?.focus();
  };

  const closePicker = () => {
    const caret = menu?.caret;
    setMenu(null);
    focusInput(caret);
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || busy || disabled) return;
    setMenu(null);
    if (group.length) {
      if (!onGroupSubmit) return;
      setBusy(true);
      try {
        await onGroupSubmit(group, text);
        setGroup([]);
        onChange('');
        if (inputRef.current) resize(inputRef.current);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    onSubmit(text);
    requestAnimationFrame(() => resize(inputRef.current));
  };

  const onKeyDown = (e) => {
    if (menu?.mode === 'mention' && mentionOptions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % mentionOptions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + mentionOptions.length) % mentionOptions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionOptions[active] || mentionOptions[0]); return; }
    }
    if (e.key === 'Escape' && menu) { e.preventDefault(); setMenu(null); return; }
    if (e.key === 'Backspace' && !value && group.length) { setGroup((list) => list.slice(0, -1)); return; }
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      submit();
    }
  };

  const textSize = size === 'md' ? 'text-[14px] 4xl:text-[16px]' : 'text-[12.5px] 4xl:text-[14px]';
  const common = {
    ref: inputRef,
    value,
    onChange: handleChange,
    onKeyDown,
    onBlur: () => setTimeout(() => setMenu((m) => (m?.mode === 'mention' ? null : m)), 150),
    disabled: disabled || busy,
    maxLength,
    placeholder: group.length ? t('chat.groupPlaceholder', { n: group.length }) : placeholder,
    className: `field min-w-0 flex-1 py-2 ${textSize} ${group.length ? 'border-violet-400/40' : ''}`,
    'aria-autocomplete': 'list',
  };

  return (
    <div className="relative">
      {group.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.06] px-2.5 pb-1.5 pt-2 text-[11.5px] 4xl:text-[13px]">
          <span className="font-semibold text-violet-300">{t('chat.groupTo')}</span>
          {group.map((u) => (
            <span key={u.id} className="inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-violet-500/15 py-0.5 pl-2 pr-1 text-violet-100 ring-1 ring-inset ring-violet-400/30">
              <span className="truncate">{u.nickname}</span>
              <button type="button" onClick={() => setGroup((list) => list.filter((x) => x.id !== u.id))} aria-label={t('chat.groupRemove', { name: u.nickname })} className="rounded-full p-0.5 hover:bg-white/10">
                <DashIcon name="close" className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => { setMenu({ mode: 'group', caret: value.length }); requestAnimationFrame(() => pickerSearchRef.current?.focus()); }} className="rounded-full px-1.5 py-0.5 text-violet-300 hover:bg-white/5">
            + {t('chat.groupAdd')}
          </button>
          <button type="button" onClick={() => setGroup([])} className="ml-auto rounded-md px-1.5 py-0.5 text-parch/45 hover:bg-white/5 hover:text-parch">
            {t('chat.groupClear')}
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 p-2">
        {leading}
        {multiline ? <textarea rows={1} {...common} style={{ resize: 'none' }} /> : <input {...common} />}
        <button
          type="button"
          onClick={submit}
          disabled={disabled || busy || !value.trim()}
          className={`btn-primary shrink-0 px-3 py-2 ${group.length ? 'from-violet-300 to-violet-500' : ''}`}
          aria-label={group.length ? t('chat.groupSend') : t('chat.send')}
          title={group.length ? t('chat.groupSend') : t('chat.send')}
        >
          <DashIcon name={group.length ? 'users' : 'send'} className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="px-3 pb-2 text-[11.5px] font-medium text-rent-light">{error}</p>}

      {menu?.mode === 'mention' && mentionOptions.length > 0 && (
        <ul role="listbox" className="absolute bottom-full left-2 right-2 z-50 mb-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#16181d] p-1 shadow-deep scrollbar-thin">
          <li className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{t('chat.mentionHint')}</li>
          {mentionOptions.map((c, i) => (
            <li key={c.key || c.id || c.nickname} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pickMention(c); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] 4xl:text-[15px] ${i === active ? 'bg-white/[0.08]' : ''}`}
              >
                <UserAvatar user={c} size="xs" frame={false} />
                <StyledName nickname={c.nickname} cosmetics={c.cosmetics} className="text-zinc-100" />
                {!c.id && <span className="ml-auto text-[10.5px] text-zinc-500">{t('common.guest')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu?.mode === 'group' && (
        <div className="absolute bottom-full left-2 right-2 z-50 mb-1 rounded-xl border border-violet-400/25 bg-[#16181d] p-2 shadow-deep" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); } }}>
          <div className="mb-2 flex items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><DashIcon name="users" className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-zinc-100 4xl:text-[14px]">{t('chat.groupTitle')}</p>
              <p className="text-[11px] leading-snug text-zinc-500 4xl:text-[12.5px]">{t('chat.groupHint')}</p>
            </div>
            <button type="button" onClick={closePicker} className="rounded-md px-2 py-1 text-[12px] font-semibold text-violet-300 hover:bg-white/5">{t('chat.groupDone')}</button>
          </div>
          {!groupEnabled ? (
            <p className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5 text-[12px] text-zinc-400">
              <DashIcon name="lock" className="mr-1 inline h-3.5 w-3.5" />
              {t('chat.groupGuest')}
            </p>
          ) : (
            <>
              <input
                ref={pickerSearchRef}
                value={groupQuery}
                onChange={(e) => setGroupQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); if (groupOptions[0]) addToGroup(groupOptions[0]); else closePicker(); }
                  if (e.key === 'Backspace' && !groupQuery && group.length) setGroup((list) => list.slice(0, -1));
                }}
                placeholder={t('chat.groupSearch')}
                className="field mb-1.5 py-1.5 text-[12.5px] 4xl:text-[14px]"
              />
              {group.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {group.map((u) => (
                    <button key={u.id} type="button" onClick={() => setGroup((list) => list.filter((x) => x.id !== u.id))} className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[11.5px] text-violet-100">
                      {u.nickname}
                      <DashIcon name="close" className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              <ul className="max-h-56 overflow-y-auto scrollbar-thin">
                {groupOptions.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-zinc-500">{t('chat.groupNoResults')}</li>}
                {groupOptions.map((u) => (
                  <li key={u.id}>
                    <button type="button" onClick={() => addToGroup(u)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.06] 4xl:text-[15px]">
                      <UserAvatar user={u} size="xs" online={u.online ?? null} frame={false} />
                      <StyledName nickname={u.nickname} cosmetics={u.cosmetics} className="text-zinc-100" />
                      <span className="ml-auto text-[11px] font-semibold text-violet-300">+ {t('chat.groupAdd')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
