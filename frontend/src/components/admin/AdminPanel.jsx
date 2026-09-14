// AdminPanel.jsx
// The admin dashboard shell: access check, navigation, and one section at
// a time. The access check here only decides what to render - the server
// answers every /api/admin call with 401/403 unless the caller really is
// the administrator, so opening /admin by URL gets a normal user nothing.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { apiFetch } from '../../lib/api';
import { navigate } from '../../lib/router';
import LanguageSwitcher from '../LanguageSwitcher';
import {
  Badge, Button, DashIcon, Spinner,
} from '../ui/dash';
import OverviewSection from './OverviewSection';
import LobbiesSection from './LobbiesSection';
import UsersSection from './UsersSection';
import ModesSection from './ModesSection';

const SECTIONS = [
  { id: 'overview', icon: 'chart', component: OverviewSection },
  { id: 'lobbies', icon: 'grid', component: LobbiesSection },
  { id: 'users', icon: 'users', component: UsersSection },
  { id: 'modes', icon: 'gamepad', component: ModesSection },
];

function AccessDenied({ anon }) {
  const { t } = useTranslation();
  return (
    <div className="dash-bg flex min-h-screen items-center justify-center px-4 text-zinc-200">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#121418] p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
          <DashIcon name="shield" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-[17px] font-semibold text-zinc-50">{t('admin.denied.title')}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{anon ? t('admin.denied.anonText') : t('admin.denied.text')}</p>
        <Button tone="primary" className="mt-5 w-full" onClick={() => navigate('/')}>{t('admin.backToSite')}</Button>
      </div>
    </div>
  );
}

export default function AdminPanel({ auth }) {
  const { t } = useTranslation();
  const [access, setAccess] = useState('checking');
  const [section, setSection] = useState(() => {
    const hash = window.location.hash.slice(1);
    return SECTIONS.some((s) => s.id === hash) ? hash : 'overview';
  });

  useEffect(() => {
    if (!auth.token) {
      setAccess('anon');
      return undefined;
    }
    let alive = true;
    apiFetch('/api/admin/me', { token: auth.token })
      .then(() => { if (alive) setAccess('ok'); })
      .catch((err) => { if (alive) setAccess(err.status === 401 ? 'anon' : 'denied'); });
    return () => { alive = false; };
  }, [auth.token]);

  const go = (id) => {
    setSection(id);
    window.history.replaceState({}, '', `/admin#${id}`);
  };

  if (access === 'checking') {
    return <div className="dash-bg flex min-h-screen items-center justify-center"><Spinner /></div>;
  }
  if (access !== 'ok') return <AccessDenied anon={access === 'anon'} />;

  const Section = SECTIONS.find((s) => s.id === section).component;

  return (
    <div className="dash-bg min-h-screen text-zinc-200 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0d0e11] lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brass-light to-brass-deep text-ink shadow-lift">
            <DashIcon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-tight text-zinc-100">Landmark</p>
            <p className="text-[11px] text-zinc-500">{t('admin.panel')}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                section === s.id ? 'bg-white/[0.08] text-zinc-50' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
              }`}
            >
              <DashIcon name={s.icon} />
              {t(`admin.nav.${s.id}`)}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass/20 text-[13px] font-bold text-brass-light">
              {auth.account.nickname.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-zinc-200">{auth.account.nickname}</p>
              <Badge tone="amber">{t('admin.roleAdmin')}</Badge>
            </div>
          </div>
          <Button tone="subtle" icon="door" className="w-full justify-start" onClick={() => navigate('/')}>{t('admin.backToSite')}</Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0a0b0d]/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <h1 className="flex-1 text-[17px] font-semibold tracking-tight text-zinc-50">{t(`admin.nav.${section}`)}</h1>
            <LanguageSwitcher variant="dark" />
            <span className="lg:hidden"><Button tone="subtle" icon="door" onClick={() => navigate('/')}>{t('admin.backToSite')}</Button></span>
          </div>
          <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${
                  section === s.id ? 'bg-white/[0.09] text-zinc-50' : 'text-zinc-400'
                }`}
              >
                <DashIcon name={s.icon} className="h-3.5 w-3.5" />
                {t(`admin.nav.${s.id}`)}
              </button>
            ))}
          </nav>
        </header>
        <main className="px-4 py-6 lg:px-8">
          <Section token={auth.token} admin={auth.account} />
        </main>
      </div>
    </div>
  );
}
