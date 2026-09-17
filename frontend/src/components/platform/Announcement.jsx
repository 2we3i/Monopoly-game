// Announcement.jsx
// The message the Creator set in the panel's settings, shown to everyone
// at the top of the site until they dismiss it (a new message shows again).

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';

const KEY = 'landmark_announcement_dismissed';
const TONES = {
  info: 'border-sky-400/30 bg-sky-950/90 text-sky-100',
  warning: 'border-amber-400/30 bg-amber-950/90 text-amber-100',
  success: 'border-emerald-400/30 bg-emerald-950/90 text-emerald-100',
};

export default function Announcement() {
  const { language } = useTranslation();
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    let alive = true;
    fetch('/api/platform')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (alive) setData(json); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const text = data?.announcement?.[language] || data?.announcement?.en || data?.announcement?.ru || '';
  if (!text || dismissed === text) return null;

  const dismiss = () => {
    setDismissed(text);
    try {
      localStorage.setItem(KEY, text);
    } catch { /* storage unavailable */ }
  };

  return (
    <div role="status" className={`fixed inset-x-0 top-0 z-[80] flex items-center gap-3 border-b px-4 py-2 text-[13px] backdrop-blur 4xl:text-[16px] ${TONES[data.announcementTone] || TONES.info}`}>
      <span className="min-w-0 flex-1 text-center">{text}</span>
      <button type="button" onClick={dismiss} aria-label="Close" className="rounded-md px-2 py-0.5 text-[16px] leading-none opacity-70 hover:opacity-100">×</button>
    </div>
  );
}
