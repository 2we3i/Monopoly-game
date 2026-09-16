// RoomStatus.jsx
// The parts of a room that look the same in every game: who is connected,
// who dropped out and how long they have left to come back, who gave up,
// who is watching, and the button to give up yourself.
//
// Every one of these reads the room state the SERVER sent - `connected`,
// `left`, `exitReason`, `dropsAt`, `spectators` - so what a player sees
// here is the room as the server has it, never a guess made locally.

import { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useNow } from '../../hooks/useNow';
import Modal from '../Modal';
import Icon from '../icons';

// --- one player's standing -------------------------------------------

// The seconds left before a disconnected player stops being a player. The
// deadline is the server's; this only counts down to it, so every screen
// in the room shows the same number.
export function DropCountdown({ dropsAt, className = '' }) {
  const { t } = useTranslation();
  const now = useNow(!!dropsAt, 250);
  if (!dropsAt) return null;
  const left = Math.max(0, Math.ceil((dropsAt - now) / 1000));
  return (
    <span className={`pill bg-rent/25 text-rent-light tnum ${className}`} title={t('room.dropHint')}>
      <Icon.warning className="h-3 w-3" />
      {t('room.dropsIn', { n: left })}
    </span>
  );
}

// Everything a row in a player list needs to say about someone's standing,
// in the order it matters: gone for good, then away, then here.
export function PlayerStatus({ player, compact = false }) {
  const { t } = useTranslation();
  if (!player) return null;

  if (player.surrendered || player.exitReason === 'surrender') {
    return <span className="pill bg-rent/25 text-rent-light"><Icon.flag className="h-3 w-3" />{t('room.surrendered')}</span>;
  }
  if (player.exitReason === 'timeout') {
    return <span className="pill bg-white/10 text-parch/45">{t('room.droppedOut')}</span>;
  }
  if (player.exitReason === 'kicked') {
    return <span className="pill bg-white/10 text-parch/45">{t('room.removed')}</span>;
  }
  if (player.left || player.exitReason === 'left') {
    return <span className="pill bg-white/10 text-parch/45">{t('room.leftGame')}</span>;
  }
  if (player.dropsAt) return <DropCountdown dropsAt={player.dropsAt} />;
  if (!player.connected) {
    return <span className="pill bg-white/10 text-parch/40">{t('room.offline')}</span>;
  }
  if (compact) return null;
  return <span className="pill bg-go/20 text-go-light"><span className="h-1.5 w-1.5 rounded-full bg-current" />{t('room.online')}</span>;
}

// --- the gallery ------------------------------------------------------

// Who is watching. Deliberately separate from the player list: a watcher
// is in the room but not in the game, and the two must never look alike.
export function SpectatorStrip({ spectators = [], className = '' }) {
  const { t } = useTranslation();
  if (!spectators || spectators.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 ${className}`}>
      <Icon.eye className="h-4 w-4 shrink-0 text-parch/35" />
      <span className="text-[11px] font-bold uppercase tracking-wide text-parch/40">
        {t('room.watching', { n: spectators.length })}
      </span>
      {spectators.slice(0, 12).map((s) => (
        <span key={s.id} className="pill bg-white/[0.06] text-parch/60">{s.nickname}</span>
      ))}
      {spectators.length > 12 && <span className="pill bg-white/[0.06] text-parch/40">+{spectators.length - 12}</span>}
    </div>
  );
}

// A watcher's own banner: they are here, and nothing they do reaches the
// game. Saying so once, plainly, is better than a screen of dead buttons.
export function SpectatorBanner({ onLeave, className = '' }) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-brass/30 bg-brass/[0.08] px-3 py-2 ${className}`}>
      <Icon.eye className="h-4 w-4 shrink-0 text-brass-light" />
      <p className="min-w-0 flex-1 text-[12.5px] text-parch/70">{t('room.youAreWatching')}</p>
      {onLeave && (
        <button type="button" onClick={onLeave} className="btn-quiet px-3 py-1.5 text-[12px]">{t('waiting.leave')}</button>
      )}
    </div>
  );
}

// --- giving up --------------------------------------------------------

// Surrender is in every mode where a player can be knocked out, and it
// always asks first: it is not undoable, and the seat does not come back.
export function SurrenderButton({
  onSurrender, disabled = false, className = 'btn-danger px-3 py-2 text-[12.5px]', label,
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onSurrender?.();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setAsking(true)} disabled={disabled || busy} className={className}>
        <Icon.flag className="h-3.5 w-3.5" />
        {label || t('room.surrender')}
      </button>
      {asking && (
        <Modal
          onClose={() => !busy && setAsking(false)}
          title={t('room.surrenderTitle')}
          subtitle={t('room.surrenderSubtitle')}
          icon={<Icon.flag className="h-5 w-5" />}
          widthClass="max-w-sm"
          footer={(
            <div className="flex gap-2">
              <button type="button" onClick={() => setAsking(false)} disabled={busy} className="btn-quiet flex-1 py-2.5">
                {t('room.surrenderCancel')}
              </button>
              <button type="button" onClick={confirm} disabled={busy} className="btn-danger flex-1 py-2.5">
                {busy ? t('room.surrendering') : t('room.surrenderConfirm')}
              </button>
            </div>
          )}
        >
          <p className="text-[13.5px] leading-relaxed text-parch/70">{t('room.surrenderBody')}</p>
        </Modal>
      )}
    </>
  );
}

// --- the room's own clock ---------------------------------------------

// The phase deadline the server set, as a number that keeps moving. Used
// by every screen that shows "time left in this phase".
export function PhaseClock({ endsAt, className = '', label = null }) {
  const now = useNow(!!endsAt, 250);
  if (!endsAt) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const urgent = left <= 10;
  return (
    <span className={`tnum font-semibold ${urgent ? 'text-rent-light' : 'text-parch/70'} ${className}`}>
      {label ? `${label} ` : ''}
      {left}s
    </span>
  );
}

export default PlayerStatus;
