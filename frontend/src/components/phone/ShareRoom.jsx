// ShareRoom.jsx
// The two ways a phone passes a room on, under any lobby's room code: the
// phone's own share sheet (messengers, SMS) - or the link on the clipboard
// where there is none - and a QR code a friend scans straight off this
// screen. Drawn only in the phone layout; a desktop lobby already has its
// copy buttons and is rarely in a friend's camera's reach.

import { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { usePhoneLayout } from '../../hooks/usePhoneLayout';
import QrCode from '../ui/QrCode';
import Icon from '../icons';
import { PhoneIcon } from './PhoneGame';

export default function ShareRoom({ code, className = '' }) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!phone || !code) return null;
  const link = `${window.location.origin}/?room=${code}`;

  const invite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Landmark', text: t('phone.inviteText', { code }), url: link });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* the code is on screen anyway */ }
  };

  return (
    <div className={`flex w-full flex-col items-center gap-2 ${className}`}>
      <div className="grid w-full grid-cols-[1fr,auto] gap-2">
        <button type="button" onClick={invite} className="btn-primary py-3 text-[15px]">
          {copied ? <Icon.check className="h-4 w-4" /> : <PhoneIcon.share className="h-4 w-4" />}
          {copied ? t('waiting.copied') : t('phone.invite')}
        </button>
        <button type="button" onClick={() => setQr((v) => !v)} aria-expanded={qr} className="btn-ghost whitespace-nowrap px-4 py-3 text-[14px]">
          {t('phone.qr')}
          <Icon.chevronDown className={`h-3.5 w-3.5 transition-transform ${qr ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {qr && (
        <div className="flex animate-fade-in flex-col items-center gap-2 pt-1">
          <QrCode value={link} className="h-48 w-48 rounded-xl" title={t('phone.qr')} />
          <p className="max-w-[16rem] text-center text-[12px] leading-snug opacity-60">{t('phone.qrHint')}</p>
        </div>
      )}
    </div>
  );
}
