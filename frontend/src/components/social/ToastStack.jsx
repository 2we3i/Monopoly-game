// ToastStack.jsx
// New notifications briefly shown in the corner, whatever screen the
// player is on. Clicking one does what clicking it in the centre does.

import { useEffect } from 'react';
import { useSocial } from '../../social/SocialContext';
import { DashIcon } from '../ui/dash';
import { NotificationItem } from './SocialBar';
import { runNotificationAction } from './notificationText';

function Toast({ toast, onDismiss, onOpen }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 6500);
    return () => clearTimeout(id);
  }, [onDismiss]);
  return (
    <div className="pointer-events-auto relative animate-slide-up overflow-hidden rounded-2xl border border-white/10 bg-[#121418]/95 pr-7 shadow-deep backdrop-blur">
      <NotificationItem n={toast.notification} onClick={onOpen} compact />
      <button type="button" onClick={onDismiss} aria-label="Close" className="absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-100">
        <DashIcon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ToastStack() {
  const social = useSocial();
  if (!social.toasts.length) return null;
  return (
    <div className="toast-stack pointer-events-none fixed bottom-4 right-4 z-[85] flex w-[min(92vw,360px)] flex-col gap-2 4xl:w-[440px]" role="status" aria-live="polite">
      {social.toasts.map((toast) => (
        <Toast
          key={toast.key}
          toast={toast}
          onDismiss={() => social.dismissToast(toast.key)}
          onOpen={() => {
            social.dismissToast(toast.key);
            if (!toast.notification.read) social.markNotificationRead(toast.notification.id);
            runNotificationAction(toast.notification, social);
          }}
        />
      ))}
    </div>
  );
}
