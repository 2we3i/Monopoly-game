// PhoneShell.jsx
// What every party game's phone page has in common: the frame (one column,
// thumb-reachable footer, safe-area padding for notched phones), the
// "reconnecting" strip, the join form, and taking the seat back
// automatically when this phone already has one in the room.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import LanguageSwitcher from '../LanguageSwitcher';

const NICKNAME_KEY = 'landmark_nickname';

export function PhoneFrame({ children, footer, theme = 'table-night' }) {
  return (
    <div className={`${theme} flex min-h-[100dvh] flex-col`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-4">{children}</div>
      {footer && (
        <div
          className="sticky bottom-0 z-20 border-t border-white/[0.08] bg-black/70 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-md">{footer}</div>
        </div>
      )}
    </div>
  );
}

export function ReconnectStrip({ connected }) {
  const { t } = useTranslation();
  if (connected) return null;
  return (
    <div className="rounded-xl bg-rent px-3 py-2 text-center text-[13px] font-bold text-white">
      {t('app.reconnecting')}
    </div>
  );
}

export function PhoneJoinForm({
  roomCode, onJoin, busy, error, title, emoji, theme,
}) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) || '');
  const [touched, setTouched] = useState(false);
  const name = nickname.trim();

  return (
    <PhoneFrame theme={theme}>
      <header className="flex items-center gap-3 pt-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[24px]">{emoji}</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[21px] font-black leading-tight text-white">{title}</h1>
          <p className="text-[12.5px] text-white/50">{t('chpok.phone.joining', { code: roomCode })}</p>
        </div>
        <LanguageSwitcher variant="dark" />
      </header>

      <form
        className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (name) onJoin(name);
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold uppercase tracking-wide text-white/55">{t('landing.yourNickname')}</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            placeholder={t('landing.nicknamePlaceholder')}
            autoComplete="nickname"
            enterKeyHint="go"
            autoFocus
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3.5 text-[17px] text-white outline-none focus:border-amber-300/70"
          />
        </label>
        {touched && !name && <p className="text-[12.5px] text-rose-300">{t('landing.errorNicknameRequired')}</p>}
        {error && <p className="text-[12.5px] text-rose-300">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-4 text-[17px]">
          {busy ? t('landing.joiningRoom') : t('chpok.phone.takeSeat')}
        </button>
        <p className="text-center text-[12px] leading-relaxed text-white/40">{t('chpok.phone.joinHint')}</p>
      </form>
    </PhoneFrame>
  );
}

// Takes a seat in `roomCode` with the nickname this phone used before, and
// lets go of any other room the hook was still attached to. Returns the
// join handler for the form, and its error.
export function usePhoneSeat(room, roomCode) {
  const tried = useRef(false);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    if (!room.connected || tried.current) return;
    if (room.roomCode && room.roomCode !== roomCode) {
      room.clearRoom();
      return;
    }
    tried.current = true;
    const saved = localStorage.getItem(NICKNAME_KEY);
    if (!saved) return;
    room.joinRoom(roomCode, saved).catch(() => { tried.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.connected, room.roomCode, roomCode]);

  const join = (nickname) => {
    setJoinError(null);
    tried.current = true;
    room.joinRoom(roomCode, nickname).catch((err) => {
      tried.current = false;
      setJoinError(err.message);
    });
  };

  return { join, joinError, inRoom: !!room.state && room.roomCode === roomCode };
}
