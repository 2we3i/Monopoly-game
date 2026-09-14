// SocialBar.jsx
// The crown balance, the messages button and the notification bell, in
// one compact group that sits in every header - the main menu, each game
// and the platform pages.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import { useCatalog } from '../../lib/catalog';
import { navigate } from '../../lib/router';
import { timeAgo } from '../../lib/time';
import { DashIcon } from '../ui/dash';
import {
  NOTIFICATION_ICON, NOTIFICATION_TONE, describeNotification, runNotificationAction,
} from './notificationText';

export function CrownCoin({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="crown-coin" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff3cf" />
          <stop offset="45%" stopColor="#e3bb5c" />
          <stop offset="100%" stopColor="#96701c" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#crown-coin)" />
      <circle cx="12" cy="12" r="7.6" fill="none" stroke="#96701c" strokeOpacity="0.55" strokeWidth="1" />
      <path d="M7.2 15.2h9.6l.8-6-3.1 2.4L12 7.8l-2.5 3.8-3.1-2.4z" fill="#5c430f" fillOpacity="0.85" />
    </svg>
  );
}

function CountBadge({ n }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rent px-1 text-[10px] font-black leading-none text-white ring-2 ring-[#0a0b0d] 4xl:h-5 4xl:min-w-5 4xl:text-[11px]">
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function NotificationItem({ n, onClick, compact = false }) {
  const { t, language } = useTranslation();
  const catalog = useCatalog();
  const { title, body } = describeNotification(n, { t, language, catalog });
  const tone = NOTIFICATION_TONE[n.type] || '#94a3b8';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] ${n.read ? '' : 'bg-white/[0.03]'}`}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg 4xl:h-10 4xl:w-10" style={{ backgroundColor: `${tone}1f`, color: tone }}>
        <DashIcon name={NOTIFICATION_ICON[n.type] || 'bell'} className="h-4 w-4 4xl:h-5 4xl:w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold 4xl:text-[15px] ${n.read ? 'text-zinc-300' : 'text-zinc-50'}`}>{title}</span>
          {!compact && <span className="shrink-0 text-[10.5px] text-zinc-500 4xl:text-[12px]">{timeAgo(n.createdAt, t)}</span>}
          {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brass-light" />}
        </span>
        {body && <span className="mt-0.5 line-clamp-2 block break-words text-[12px] leading-snug text-zinc-400 [overflow-wrap:anywhere] 4xl:text-[13.5px]">{body}</span>}
      </span>
    </button>
  );
}

export function NotificationCenter({ onClose }) {
  const { t } = useTranslation();
  const social = useSocial();
  const [confirmClear, setConfirmClear] = useState(false);
  const { items, loaded, loading, hasMore } = social.notifications;

  useEffect(() => {
    social.loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex max-h-[min(70vh,640px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121418] text-zinc-200 shadow-deep 4xl:max-h-[min(70vh,860px)]">
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
        <h2 className="flex-1 text-[14px] font-semibold text-zinc-50 4xl:text-[16px]">
          {t('notif.title')}
          {social.unreadNotifications > 0 && <span className="ml-1.5 text-[12px] font-medium text-brass-light">{social.unreadNotifications}</span>}
        </h2>
        <button type="button" disabled={!social.unreadNotifications} onClick={social.readAllNotifications} className="rounded-md px-2 py-1 text-[11.5px] font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40 4xl:text-[13px]">
          {t('notif.readAll')}
        </button>
        {confirmClear ? (
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => { social.clearNotifications(); setConfirmClear(false); }} className="rounded-md bg-red-500/15 px-2 py-1 text-[11.5px] font-semibold text-red-300 hover:bg-red-500/25">{t('notif.clearConfirm')}</button>
            <button type="button" onClick={() => setConfirmClear(false)} className="rounded-md px-1.5 py-1 text-[11.5px] text-zinc-500 hover:text-zinc-200">{t('common.cancel')}</button>
          </span>
        ) : (
          <button type="button" disabled={!items.length} onClick={() => setConfirmClear(true)} className="rounded-md px-2 py-1 text-[11.5px] font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40 4xl:text-[13px]">
            {t('notif.clear')}
          </button>
        )}
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
        {!loaded && loading && <p className="py-10 text-center text-[12.5px] text-zinc-500">{t('common.loading')}</p>}
        {loaded && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <DashIcon name="bell" className="h-8 w-8 text-zinc-600" />
            <p className="text-[13px] text-zinc-400">{t('notif.empty')}</p>
          </div>
        )}
        {items.map((n) => (
          <div key={n.id} className="cv-row">
            <NotificationItem
              n={n}
              onClick={() => {
                if (!n.read) social.markNotificationRead(n.id);
                onClose?.();
                runNotificationAction(n, social);
              }}
            />
          </div>
        ))}
        {hasMore && (
          <button type="button" disabled={loading} onClick={() => social.loadNotifications({ more: true })} className="mt-1 w-full rounded-lg py-2 text-[12px] font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
            {loading ? t('common.loading') : t('notif.more')}
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationBell({ tone }) {
  const { t } = useTranslation();
  const social = useSocial();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t('notif.title')} title={t('notif.title')} className={tone}>
        <DashIcon name="bell" className="h-4 w-4 4xl:h-5 4xl:w-5" />
        <CountBadge n={social.unreadNotifications} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-[min(94vw,380px)] 4xl:w-[460px]">
          <NotificationCenter onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default function SocialBar({ compact = false, className = '' }) {
  const { t } = useTranslation();
  const social = useSocial();
  if (!social.enabled) return null;
  const iconButton = 'relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-parch/75 transition-colors hover:bg-white/[0.09] hover:text-parch 4xl:h-10 4xl:w-10';
  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => navigate('/shop')}
        title={t('wallet.openShop')}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-brass/30 bg-brass/10 px-2 text-[13px] font-bold text-brass-light transition-colors hover:bg-brass/20 4xl:h-10 4xl:px-3 4xl:text-[15px]"
      >
        <CrownCoin className="h-4 w-4 4xl:h-5 4xl:w-5" />
        <span className="tnum">{social.wallet ? social.wallet.balance.toLocaleString() : '—'}</span>
        {!compact && <span className="hidden text-[11px] font-semibold text-brass-light/70 xl:inline 4xl:text-[12.5px]">{t('wallet.shop')}</span>}
      </button>
      <button type="button" onClick={() => social.openMessenger()} aria-label={t('messages.title')} title={t('messages.title')} className={iconButton}>
        <DashIcon name="mail" className="h-4 w-4 4xl:h-5 4xl:w-5" />
        <CountBadge n={social.unreadMessages} />
      </button>
      <NotificationBell tone={iconButton} />
    </div>
  );
}
