// AdminPanel.jsx
// The control panel shell: access check, grouped side navigation, and one
// section at a time. Administrators see the moderation sections they always
// had; the Creator - the owner of the platform - sees everything. Which
// sections appear comes from the permissions the server returns for the
// account (GET /api/admin/me), and every API call is checked again on the
// server, so opening /admin by URL gives a normal user nothing.

import { useEffect, useMemo, useState } from 'react';
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
import GamesSection from './creator/GamesSection';
import TestingSection from './creator/TestingSection';
import MapsSection from './creator/MapsSection';
import FieldsSection from './creator/FieldsSection';
import MemesSection from './creator/MemesSection';
import MediaSection from './creator/MediaSection';
import ShopSection from './creator/ShopSection';
import EconomySection from './creator/EconomySection';
import BotsSection from './creator/BotsSection';
import StatsSection from './creator/StatsSection';
import LogsSection from './creator/LogsSection';
import SettingsSection from './creator/SettingsSection';
import AccessSection from './creator/AccessSection';
import { CreatorProvider } from './kit';
import SocialBar from '../social/SocialBar';

// The order of the sidebar; `perm` is what the server must allow.
const GROUPS = [
  {
    id: 'platform',
    sections: [
      { id: 'overview', icon: 'chart', perm: 'overview.view', component: OverviewSection },
      { id: 'stats', icon: 'star', perm: 'stats.view', component: StatsSection },
    ],
  },
  {
    id: 'people',
    sections: [
      { id: 'users', icon: 'users', perm: 'users.view', component: UsersSection },
      { id: 'access', icon: 'lock', perm: 'access.manage', component: AccessSection },
    ],
  },
  {
    id: 'play',
    sections: [
      { id: 'lobbies', icon: 'grid', perm: 'lobbies.view', component: LobbiesSection },
      { id: 'games', icon: 'play', perm: 'games.view', component: GamesSection },
      { id: 'modes', icon: 'gamepad', perm: 'modes.view', component: ModesSection },
      { id: 'testing', icon: 'flag', perm: 'modes.test', component: TestingSection },
      { id: 'bots', icon: 'sparkles', perm: 'bots.manage', component: BotsSection },
    ],
  },
  {
    id: 'content',
    sections: [
      { id: 'maps', icon: 'castle', perm: 'maps.manage', component: MapsSection },
      { id: 'fields', icon: 'box', perm: 'fields.manage', component: FieldsSection },
      { id: 'memes', icon: 'heart', perm: 'memes.manage', component: MemesSection },
      { id: 'media', icon: 'eye', perm: 'media.manage', component: MediaSection },
    ],
  },
  {
    id: 'economy',
    sections: [
      { id: 'shop', icon: 'bag', perm: 'shop.manage', component: ShopSection },
      { id: 'economy', icon: 'coin', perm: 'economy.view', component: EconomySection },
    ],
  },
  {
    id: 'system',
    sections: [
      { id: 'logs', icon: 'filter', perm: 'logs.view', component: LogsSection },
      { id: 'settings', icon: 'palette', perm: 'settings.manage', component: SettingsSection },
    ],
  },
];

const ALL_SECTIONS = GROUPS.flatMap((g) => g.sections);

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

function NavButton({
  section, active, onClick, compact = false,
}) {
  const { t } = useTranslation();
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${active ? 'bg-white/[0.09] text-zinc-50' : 'text-zinc-400'}`}
      >
        <DashIcon name={section.icon} className="h-3.5 w-3.5" />
        {t(`admin.nav.${section.id}`)}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors 4xl:py-2.5 4xl:text-[15px] ${
        active ? 'bg-white/[0.08] text-zinc-50 shadow-[inset_2px_0_0_0_#e3bb5c]' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
      }`}
    >
      <DashIcon name={section.icon} className={`h-4 w-4 ${active ? 'text-brass-light' : ''}`} />
      {t(`admin.nav.${section.id}`)}
    </button>
  );
}

export default function AdminPanel({ auth }) {
  const { t } = useTranslation();
  const [access, setAccess] = useState('checking');
  const [me, setMe] = useState(null);
  const [section, setSection] = useState(() => window.location.hash.slice(1) || 'overview');

  useEffect(() => {
    if (!auth.token) {
      setAccess('anon');
      return undefined;
    }
    let alive = true;
    apiFetch('/api/admin/me', { token: auth.token })
      .then((data) => {
        if (!alive) return;
        setMe(data);
        setAccess('ok');
      })
      .catch((err) => { if (alive) setAccess(err.status === 401 ? 'anon' : 'denied'); });
    return () => { alive = false; };
  }, [auth.token]);

  const groups = useMemo(() => GROUPS
    .map((g) => ({ ...g, sections: g.sections.filter((s) => me?.permissions?.includes(s.perm)) }))
    .filter((g) => g.sections.length), [me]);
  const visible = groups.flatMap((g) => g.sections);

  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.slice(1);
      if (ALL_SECTIONS.some((s) => s.id === id)) setSection(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => {
    setSection(id);
    window.history.replaceState({}, '', `/admin#${id}`);
    window.scrollTo({ top: 0 });
  };

  if (access === 'checking') {
    return <div className="dash-bg flex min-h-screen items-center justify-center"><Spinner /></div>;
  }
  if (access !== 'ok') return <AccessDenied anon={access === 'anon'} />;

  const current = visible.find((s) => s.id === section) || visible[0];
  const Section = current.component;
  const isCreator = me.role === 'creator';

  return (
    <CreatorProvider token={auth.token} me={me}>
      <div className="dash-bg min-h-screen text-zinc-200 lg:flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#0b0c0f] lg:flex 4xl:w-80">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-ink shadow-lift ${isCreator ? 'bg-gradient-to-br from-zinc-100 to-zinc-400' : 'bg-gradient-to-br from-brass-light to-brass-deep'}`}>
              <DashIcon name={isCreator ? 'sparkles' : 'shield'} className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[14px] font-semibold leading-tight text-zinc-100 4xl:text-[17px]">Landmark</p>
              <p className="text-[11px] text-zinc-500 4xl:text-[13px]">{isCreator ? t('creator.panel') : t('admin.panel')}</p>
            </div>
          </div>
          <nav className="scrollbar-thin flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-0.5">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600 4xl:text-[11.5px]">{t(`creator.group.${g.id}`)}</p>
                {g.sections.map((s) => <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => go(s.id)} />)}
              </div>
            ))}
          </nav>
          <div className="border-t border-white/[0.06] p-3">
            <div className="mb-2 flex items-center gap-2 px-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[13px] font-bold text-zinc-100">
                {auth.account.nickname.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-medium text-zinc-200">{auth.account.nickname}</p>
                <Badge tone={isCreator ? 'violet' : 'amber'}>{isCreator ? t('creator.role.creator') : t('admin.roleAdmin')}</Badge>
              </div>
            </div>
            <Button tone="subtle" icon="door" className="w-full justify-start" onClick={() => navigate('/')}>{t('admin.backToSite')}</Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0a0b0d]/85 backdrop-blur">
            {/* On a phone the section title takes its own row: the buttons
                beside it used to squeeze it down to nothing. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 lg:flex-nowrap lg:px-8 4xl:px-12">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <h1 className="truncate text-[17px] font-semibold tracking-tight text-zinc-50 4xl:text-[22px]">{t(`admin.nav.${current.id}`)}</h1>
                <p className="hidden truncate text-[11.5px] text-zinc-500 sm:block 4xl:text-[13px]">{t(`creator.sectionHint.${current.id}`)}</p>
              </div>
              <SocialBar compact className="max-sm:ml-auto" />
              <LanguageSwitcher variant="dark" />
              <span className="lg:hidden" title={t('admin.backToSite')}>
                <Button tone="subtle" icon="door" onClick={() => navigate('/')}><span className="hidden sm:inline">{t('admin.backToSite')}</span></Button>
              </span>
            </div>
            <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
              {visible.map((s) => <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => go(s.id)} compact />)}
            </nav>
          </header>
          <main className="px-4 py-6 lg:px-8 3xl:px-10 4xl:mx-auto 4xl:max-w-[3000px] 4xl:px-12 4xl:py-10">
            <Section token={auth.token} admin={auth.account} me={me} go={go} />
          </main>
        </div>
      </div>
    </CreatorProvider>
  );
}
