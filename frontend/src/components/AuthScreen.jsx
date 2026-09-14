// AuthScreen.jsx
// The entry screen: continue as a guest, log in, or register.

import { useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

function DieGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none">
      <rect x="4" y="4" width="40" height="40" rx="10" fill="currentColor" />
      <circle cx="16" cy="16" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="32" cy="16" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="16" cy="32" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="32" cy="32" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="24" cy="24" r="3.4" fill="#211a0f" fillOpacity="0.85" />
    </svg>
  );
}

function GuestForm({ onContinue }) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!nickname.trim()) return setError(t('landing.errorNicknameRequired'));
    onContinue(nickname.trim());
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="guest-nickname" className="mb-1.5 block text-sm font-medium text-ink-soft">
          {t('landing.yourNickname')}
        </label>
        <input
          id="guest-nickname"
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          placeholder={t('landing.nicknamePlaceholder')}
          className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-brass"
        />
      </div>
      {error && <p className="text-sm font-medium text-rent">{error}</p>}
      <button type="submit" className="rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-3 font-semibold text-ink shadow-tile transition-transform active:scale-[0.98]">
        {t('auth.continueAsGuest')}
      </button>
    </form>
  );
}

function LoginForm({ onLogin, onSwitchToRegister }) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onLogin(nickname, password);
    } catch (err) {
      // A block is explained in the banner above the form, with its reason.
      setError(err.code === 'BLOCKED' ? t('blocked.title') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="login-nickname" className="mb-1.5 block text-sm font-medium text-ink-soft">{t('auth.nickname')}</label>
        <input
          id="login-nickname"
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          placeholder={t('landing.nicknamePlaceholder')}
          className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-brass"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-ink-soft">{t('auth.password')}</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink focus:border-brass"
        />
      </div>
      {error && <p className="text-sm font-medium text-rent">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-3 font-semibold text-ink shadow-tile transition-transform active:scale-[0.98] disabled:opacity-60">
        {busy ? t('auth.loggingIn') : t('auth.loginButton')}
      </button>
      <button type="button" onClick={onSwitchToRegister} className="text-center text-sm text-ink-faint underline decoration-ink-faint/40 underline-offset-4 transition-colors hover:text-ink">
        {t('auth.switchToRegister')}
      </button>
    </form>
  );
}

function RegisterForm({ onRegister, onSwitchToLogin }) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await onRegister(nickname, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="register-nickname" className="mb-1.5 block text-sm font-medium text-ink-soft">{t('auth.nickname')}</label>
        <input
          id="register-nickname"
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          placeholder={t('landing.nicknamePlaceholder')}
          className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-brass"
        />
      </div>
      <div>
        <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-ink-soft">{t('auth.password')}</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink focus:border-brass"
        />
      </div>
      <div>
        <label htmlFor="register-confirm" className="mb-1.5 block text-sm font-medium text-ink-soft">{t('auth.confirmPassword')}</label>
        <input
          id="register-confirm"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink focus:border-brass"
        />
      </div>
      {error && <p className="text-sm font-medium text-rent">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-3 font-semibold text-ink shadow-tile transition-transform active:scale-[0.98] disabled:opacity-60">
        {busy ? t('auth.registering') : t('auth.registerButton')}
      </button>
      <button type="button" onClick={onSwitchToLogin} className="text-center text-sm text-ink-faint underline decoration-ink-faint/40 underline-offset-4 transition-colors hover:text-ink">
        {t('auth.switchToLogin')}
      </button>
    </form>
  );
}

export default function AuthScreen({
  onGuestReady, auth, initialMode = null, onCancel,
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(initialMode);

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden px-6 py-12">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="absolute left-4 top-4 z-10 rounded-lg px-3 py-2 text-sm font-medium text-board/60 transition-colors hover:bg-white/5 hover:text-board sm:left-6 sm:top-6"
        >
          ← {t('menu.backToMenu')}
        </button>
      )}
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <LanguageSwitcher variant="dark" />
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-col">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-3">
            <DieGlyph className="h-11 w-11 text-brass drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]" />
            <h1 className="font-display text-[2.5rem] font-bold leading-none tracking-tight text-board">
              {t('app.title')}
            </h1>
          </div>
          <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-board/65">
            {t('app.tagline')}
          </p>
        </div>

        {auth.blocked && (
          <div role="alert" className="mb-4 rounded-2xl border border-rent-light/40 bg-rent/20 px-4 py-3 text-board">
            <p className="text-sm font-semibold">{t('blocked.title')}</p>
            {auth.blocked.reason && <p className="mt-0.5 text-sm text-board/80">{t('blocked.reason', { reason: auth.blocked.reason })}</p>}
            <p className="mt-1 text-xs text-board/55">{t('blocked.hint')}</p>
          </div>
        )}

        <div className="w-full rounded-2xl border border-brass/20 bg-board p-6 shadow-panel sm:p-7">
          {!mode && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setMode('guest')}
                className="rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-4 text-left font-semibold text-ink shadow-tile transition-transform active:scale-[0.98]"
              >
                <span className="block text-base">{t('auth.continueAsGuest')}</span>
                <span className="block text-xs font-normal text-ink/70">{t('auth.continueAsGuestSub')}</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="rounded-xl border-2 border-ink/12 px-5 py-4 text-left font-semibold text-ink transition-colors hover:border-brass/50 hover:bg-brass/5 active:scale-[0.98]"
              >
                <span className="block text-base">{t('auth.login')}</span>
                <span className="block text-xs font-normal text-ink-faint">{t('auth.loginSub')}</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className="rounded-xl border-2 border-ink/12 px-5 py-4 text-left font-semibold text-ink transition-colors hover:border-brass/50 hover:bg-brass/5 active:scale-[0.98]"
              >
                <span className="block text-base">{t('auth.register')}</span>
                <span className="block text-xs font-normal text-ink-faint">{t('auth.registerSub')}</span>
              </button>
            </div>
          )}

          {mode === 'guest' && (
            <div className="flex flex-col gap-4">
              <button type="button" onClick={() => setMode(null)} className="self-start text-sm text-ink-faint transition-colors hover:text-ink">
                {t('landing.back')}
              </button>
              <GuestForm onContinue={onGuestReady} />
            </div>
          )}

          {mode === 'login' && (
            <div className="flex flex-col gap-4">
              <button type="button" onClick={() => setMode(null)} className="self-start text-sm text-ink-faint transition-colors hover:text-ink">
                {t('landing.back')}
              </button>
              <LoginForm onLogin={auth.login} onSwitchToRegister={() => setMode('register')} />
            </div>
          )}

          {mode === 'register' && (
            <div className="flex flex-col gap-4">
              <button type="button" onClick={() => setMode(null)} className="self-start text-sm text-ink-faint transition-colors hover:text-ink">
                {t('landing.back')}
              </button>
              <RegisterForm onRegister={auth.register} onSwitchToLogin={() => setMode('login')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
