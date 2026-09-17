// parts.jsx
// Small pieces the Meme Hype big screen and phone share.

import { useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { useNow } from '../../../hooks/useNow';
import Modal from '../../Modal';
import { DropCountdown } from '../../room/RoomStatus';

// 🟢 ready · 🟡 choosing · 🔵 voting · ⚪ waiting · 🔴 out. The server
// decides the status; this only draws it.
const STATUS = {
  ready: { dot: '🟢', cls: 'bg-emerald-500/20 text-emerald-200' },
  picking: { dot: '🟡', cls: 'bg-amber-400/20 text-amber-100' },
  voting: { dot: '🔵', cls: 'bg-sky-500/20 text-sky-100' },
  waiting: { dot: '⚪', cls: 'bg-white/10 text-white/60' },
  left: { dot: '🔴', cls: 'bg-rose-500/20 text-rose-200' },
  screen: { dot: '📺', cls: 'bg-white/10 text-white/50' },
};

export function StatusBadge({ player }) {
  const { t } = useTranslation();
  if (player.dropsAt) return <DropCountdown dropsAt={player.dropsAt} />;
  let key = player.status || 'waiting';
  let label = t(`hype.status.${key}`);
  if (key === 'left') {
    if (player.surrendered || player.exitReason === 'surrender') label = t('room.surrendered');
    else if (player.exitReason === 'timeout') label = t('hype.status.out');
  } else if (!player.connected) {
    key = 'waiting';
    label = t('room.offline');
  }
  const s = STATUS[key] || STATUS.waiting;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold ${s.cls}`}>
      <span aria-hidden="true">{s.dot}</span>
      {label}
    </span>
  );
}

// A stable colour per player, for the avatar circle.
const COLORS = ['#ff4fa3', '#ffcf3f', '#4fd8ff', '#7cf07a', '#b28bff', '#ff8a5c', '#5cffd6', '#ff6b6b'];
export function colorFor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  return COLORS[h % COLORS.length];
}

export function Avatar({ player, size = 40 }) {
  const color = colorFor(player.id);
  return player.avatarUrl ? (
    <img src={player.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, boxShadow: `0 0 0 3px ${color}` }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black text-[#140c26]"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {(player.nickname || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

// A countdown ring that always shows how much of the phase is left.
export function TimerRing({ endsAt, total, size = 64 }) {
  const now = useNow(!!endsAt, 200);
  if (!endsAt) return null;
  const left = Math.max(0, (endsAt - now) / 1000);
  const frac = total ? Math.min(1, left / total) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const urgent = left <= 10;
  return (
    <div className={`relative shrink-0 ${urgent ? 'hype-tick' : ''}`} style={{ width: size, height: size }} aria-label={`${Math.ceil(left)}s`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle
          cx="32" cy="32" r={r} fill="none" strokeLinecap="round" strokeWidth="6"
          stroke={urgent ? '#ff4f6d' : '#ffcf3f'}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-black tabular-nums text-white ${size >= 60 ? 'text-[20px]' : 'text-[15px]'}`}>
        {Math.ceil(left)}
      </span>
    </div>
  );
}

export function Confetti({ count = 60 }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 2.4 + Math.random() * 2,
    color: COLORS[i % COLORS.length],
    rotate: Math.random() * 360,
  })), [count]);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className="hype-confetti-piece"
          style={{
            left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// 18+ is never a single tap: the host confirms it, and the server refuses
// the switch unless the request says so.
export function AdultConfirm({ onConfirm, onCancel }) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  return (
    <Modal
      onClose={onCancel}
      title={t('hype.adult.title')}
      subtitle={t('hype.adult.subtitle')}
      icon={<span className="text-[18px]">🔞</span>}
      widthClass="max-w-md"
      footer={(
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn-quiet flex-1 py-2.5">{t('hype.adult.cancel')}</button>
          <button type="button" disabled={!checked} onClick={onConfirm} className="btn-danger flex-1 py-2.5">{t('hype.adult.confirm')}</button>
        </div>
      )}
    >
      <p className="text-[13.5px] leading-relaxed text-parch/75">{t('hype.adult.body')}</p>
      <label className="mt-4 flex items-start gap-2.5 text-[13px] text-parch/80">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-500" />
        {t('hype.adult.check')}
      </label>
    </Modal>
  );
}

export function packTitle(pack, language) {
  return pack?.title?.[language] || pack?.title?.ru || pack?.id || '';
}
