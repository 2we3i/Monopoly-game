// PlayPage.jsx
// Where every party-game QR code points: /play/<ROOM CODE>.
//
// One link format for every game - the phone does not need to know what it
// scanned. It asks the server which game the code belongs to and opens that
// game's controller; a code that no longer exists says so plainly instead
// of showing an empty join form.

import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { PhoneFrame } from './PhoneShell';

const ChpokPhone = lazy(() => import('../tabletop/chpok/PhoneController'));
const MemeHypePhone = lazy(() => import('../tabletop/memehype/MemeHypePhone'));

const PHONES = { chpok: ChpokPhone, memehype: MemeHypePhone };

function Centered({ children }) {
  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">{children}</div>
    </PhoneFrame>
  );
}

export default function PlayPage({ roomCode, auth }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setKind(undefined);
    fetch(`/api/rooms/${encodeURIComponent(roomCode)}/exists`)
      .then((r) => r.json())
      .then((res) => { if (alive) setKind(res?.exists ? res.gameType : null); })
      .catch(() => { if (alive) setKind('offline'); });
    return () => { alive = false; };
  }, [roomCode, attempt]);

  const loading = (
    <Centered>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-amber-300" />
      <p className="text-[14px] text-white/60">{t('play.looking', { code: roomCode })}</p>
    </Centered>
  );

  if (kind === undefined) return loading;

  const Phone = PHONES[kind];
  if (Phone) {
    return (
      <Suspense fallback={loading}>
        <Phone roomCode={roomCode} auth={auth} />
      </Suspense>
    );
  }

  return (
    <Centered>
      <span className="text-[54px]">{kind === 'offline' ? '📡' : '🤷'}</span>
      <p className="text-[18px] font-black text-white">
        {kind === 'offline' ? t('play.offline') : kind ? t('play.notAPhoneGame') : t('play.notFound', { code: roomCode })}
      </p>
      <p className="text-[13px] text-white/55">{t('play.hint')}</p>
      <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn-primary px-6 py-3">{t('play.retry')}</button>
    </Centered>
  );
}
