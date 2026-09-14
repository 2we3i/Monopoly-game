// PlatformShell.jsx
// The frame around the platform pages - profile, shop, inventory,
// messages, leaderboard, a player's public profile: one header with the
// way back (to the menu, or straight back into a running game), the page
// tabs, the crown balance and notifications.

import { createContext, useContext } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { navigate } from '../../lib/router';
import LanguageSwitcher from '../LanguageSwitcher';
import SocialBar from '../social/SocialBar';
import { Button, DashIcon } from '../ui/dash';

export const PlatformNavContext = createContext({ inRoom: false });

const TABS = [
  { id: 'profile', path: '/profile', icon: 'user' },
  { id: 'shop', path: '/shop', icon: 'bag' },
  { id: 'inventory', path: '/inventory', icon: 'box' },
  { id: 'messages', path: '/messages', icon: 'mail' },
  { id: 'leaderboard', path: '/leaderboard', icon: 'trophy' },
];

export const PAGE_WIDTH = 'max-w-6xl 2xl:max-w-7xl 3xl:max-w-[1640px] 4xl:max-w-[2240px] 5xl:max-w-[2960px]';

export default function PlatformShell({
  auth, active, children, fullHeight = false,
}) {
  const { t } = useTranslation();
  const nav = useContext(PlatformNavContext);

  return (
    <div className={`dash-bg text-zinc-200 ${fullHeight ? 'flex h-screen flex-col overflow-hidden' : 'min-h-screen'}`}>
      <header className="sticky top-0 z-30 shrink-0 border-b border-white/[0.06] bg-[#0a0b0d]/85 backdrop-blur">
        <div className={`mx-auto flex flex-wrap items-center gap-2 px-4 py-2.5 4xl:gap-3 4xl:px-10 4xl:py-3.5 ${PAGE_WIDTH}`}>
          {nav.inRoom ? (
            <Button tone="primary" icon="play" onClick={() => navigate('/')}>{t('nav.returnToGame')}</Button>
          ) : (
            <Button tone="subtle" icon="arrowLeft" onClick={() => navigate('/')}>{t('menu.backToMenu')}</Button>
          )}
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-thin md:order-none md:mx-0 md:w-auto md:flex-1 md:justify-center md:pb-0" aria-label={t('nav.pages')}>
            {TABS.map((tab) => {
              const on = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(tab.path)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors 4xl:px-3.5 4xl:py-2 4xl:text-[15px] ${
                    on ? 'bg-white/[0.09] text-zinc-50' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'
                  }`}
                >
                  <DashIcon name={tab.icon} className="h-3.5 w-3.5 4xl:h-4 4xl:w-4" />
                  {t(`nav.${tab.id}`)}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <SocialBar compact />
            {auth.isAdmin && <Button icon="shield" onClick={() => navigate('/admin')} className="hidden sm:inline-flex">{t('admin.open')}</Button>}
            <LanguageSwitcher variant="dark" />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full px-4 4xl:px-10 ${PAGE_WIDTH} ${fullHeight ? 'flex min-h-0 flex-1 flex-col py-4' : 'py-6 4xl:py-10'}`}>
        {children}
      </main>
    </div>
  );
}

export function LoginRequired({ text }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#121418] px-6 py-12 text-center">
      <DashIcon name="lock" className="h-9 w-9 text-zinc-500" />
      <p className="text-[14px] text-zinc-300 4xl:text-[16px]">{text}</p>
      <div className="flex gap-2">
        <Button onClick={() => window.dispatchEvent(new CustomEvent('landmark:auth', { detail: 'login' }))}>{t('auth.login')}</Button>
        <Button tone="primary" onClick={() => window.dispatchEvent(new CustomEvent('landmark:auth', { detail: 'register' }))}>{t('auth.register')}</Button>
      </div>
    </div>
  );
}
