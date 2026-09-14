// ProfileMenu.jsx
// Replaces the plain identity chip for logged-in users with a small
// dropdown offering avatar upload and log out. Guests render as the
// original simple click-to-switch-identity chip.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { navigate } from '../lib/router';

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function AvatarUploadButton({ auth }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pickFile = () => fileInputRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    // Client-side checks are a UX nicety only - the server independently
    // enforces its own type and size limits, so a request that somehow
    // bypassed this check would still be rejected correctly server-side.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('profile.avatarTypeError'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(t('profile.avatarSizeError'));
      return;
    }
    setUploading(true);
    try {
      await auth.uploadAvatar(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        className="flex items-center justify-center gap-2 rounded-lg border-2 border-ink/12 px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-brass/50 hover:bg-brass/5 disabled:opacity-60"
      >
        {uploading ? (
          t('profile.uploadingAvatar')
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="M21 15l-4.5-4.5a2 2 0 00-2.8 0L7 17" />
            </svg>
            {t('profile.changeAvatar')}
          </>
        )}
      </button>
      {error && <p className="text-xs font-medium text-rent">{error}</p>}
    </div>
  );
}

export default function ProfileMenu({ auth, savedNickname, onSwitchIdentity }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!auth.isLoggedIn) {
    return (
      <button
        type="button"
        onClick={onSwitchIdentity}
        className="flex items-center gap-1.5 rounded-lg border border-board/25 px-2.5 py-1.5 text-xs font-medium text-board/80 transition-colors hover:border-brass/60 hover:text-board"
      >
        {savedNickname}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-board/25 px-2.5 py-1.5 text-xs font-medium text-board/80 transition-colors hover:border-brass/60 hover:text-board"
      >
        {auth.account.avatarPath && (
          <img src={auth.account.avatarPath} alt="" className="h-4 w-4 rounded-full object-cover" />
        )}
        {t('auth.loggedInAs', { name: auth.account.nickname })}
        <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-brass/20 bg-board p-3 shadow-panel">
          <div className="mb-3 flex items-center gap-2.5">
            {auth.account.avatarPath ? (
              <img src={auth.account.avatarPath} alt="" className="h-10 w-10 rounded-full object-cover shadow-token ring-2 ring-white/50" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brass/20 text-sm font-bold text-brass-deep">
                {auth.account.nickname.slice(0, 1).toUpperCase()}
              </span>
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{auth.account.nickname}</p>
          </div>

          <div className="mb-2 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/profile'); }}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-brass/10"
            >
              {t('profile.open')}
            </button>
            {auth.isAdmin && (
              <button
                type="button"
                onClick={() => { setOpen(false); navigate('/admin'); }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-brass/10"
              >
                {t('admin.open')}
              </button>
            )}
          </div>

          <AvatarUploadButton auth={auth} />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSwitchIdentity();
            }}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rent transition-colors hover:bg-rent/10"
          >
            {t('auth.logOut')}
          </button>
        </div>
      )}
    </div>
  );
}
