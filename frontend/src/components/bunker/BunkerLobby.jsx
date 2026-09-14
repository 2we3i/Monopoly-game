// BunkerLobby.jsx
// The Bunker room before the game: the room code and invite link, who is
// here (each with their seat number), the table's rules - capacity, places
// in the bunker, timers - and the start button.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import PlayerAvatar from '../PlayerAvatar';
import Icon from '../icons';
import SocialBar from '../social/SocialBar';
import FramedAvatar from '../../cosmetics/FramedAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';
import { Segmented } from '../mafia/MafiaSettings';
import { CHAR_ORDER, CharIcon } from './bunkerText';

export default function BunkerLobby({
  state, actions, onLeave, openSettings = false, onSettingsOpened,
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (openSettings) onSettingsOpened?.();
  }, [openSettings, onSettingsOpened]);

  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost;
  const enough = state.players.length >= state.minPlayers;
  const s = state.settings;
  const count = state.players.length;

  const copy = async (kind, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* the code is on screen anyway */ }
  };

  const setting = (key, values, format) => (
    <Segmented
      disabled={!isHost}
      value={s[key]}
      onChange={(v) => actions.updateSettings({ [key]: Number(v) })}
      options={values.map((v) => ({ value: v, label: format(v) }))}
    />
  );

  const capacityOptions = [4, 6, 8, 10, 12, 16].filter((n) => n >= count);
  const seatOptions = [0, ...Array.from({ length: Math.max(0, Math.min(8, Math.max(count, state.minPlayers) - 1)) }, (_, i) => i + 1)];

  return (
    <div className="table-bunker min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 3xl:max-w-6xl 4xl:max-w-[1700px] 4xl:gap-6 4xl:py-10">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-600 to-zinc-900 text-[20px] shadow-lift" aria-hidden="true">☢️</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[21px] font-black leading-tight text-parch 4xl:text-[28px]">{t('menu.bunker.title')}</h1>
            <p className="text-[12px] text-parch/45">{t('bunker.lobbySubtitle')}</p>
          </div>
          <SocialBar compact />
          <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
        </header>

        <section className="bunker-plate flex flex-col items-center gap-2 py-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-parch/40">{t('waiting.roomCode')}</span>
          <span className="font-mono text-[36px] font-black tracking-[0.25em] text-parch 4xl:text-[46px]">{state.roomCode}</span>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => copy('code', state.roomCode)} className="btn-ghost px-3 py-1.5 text-[12.5px]">
              {copied === 'code' && <Icon.check className="h-3.5 w-3.5" />}
              {copied === 'code' ? t('waiting.copied') : t('waiting.copy')}
            </button>
            <button type="button" onClick={() => copy('link', `${window.location.origin}/?room=${state.roomCode}`)} className="btn-ghost px-3 py-1.5 text-[12.5px]">
              {copied === 'link' && <Icon.check className="h-3.5 w-3.5" />}
              {copied === 'link' ? t('waiting.copied') : t('waiting.copyInviteLink')}
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
          <section className="bunker-plate flex flex-col p-4">
            <div className="mb-3 flex items-center gap-2">
              <Icon.users className="h-4 w-4 text-parch/40" />
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">
                {t('waiting.players')} · {count}/{s.maxPlayers}
              </h2>
              {!enough && <span className="pill bg-orange-500/15 text-orange-300">{t('bunker.needMore', { n: state.minPlayers - count })}</span>}
            </div>
            <ul className="flex flex-col gap-1.5">
              {state.players.map((p) => (
                <li key={p.id} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${p.ready || p.isHost ? 'border-go/35 bg-go/[0.06]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                  <span className="flex h-7 min-w-[2.25rem] items-center justify-center rounded-lg border border-white/10 bg-black/40 px-1 font-mono text-[12.5px] font-bold text-parch/75 tnum">№{p.number}</span>
                  <FramedAvatar cosmetics={p.cosmetics} join>
                    <PlayerAvatar player={{ ...p, color: '#52525b' }} sizeClassName="h-8 w-8 4xl:h-10 4xl:w-10" ringClassName="ring-2 ring-white/10" />
                  </FramedAvatar>
                  <span className="flex min-w-0 flex-1 items-center truncate text-[13.5px] font-semibold text-parch 4xl:text-[16px]">
                    <StyledName nickname={p.nickname} cosmetics={p.cosmetics} showTitle titleSize="xs" />
                    {p.isYou && <span className="ml-1.5 shrink-0 text-[11px] font-normal text-parch/40">{t('sidebar.you')}</span>}
                    {p.isGuest && <span className="ml-1.5 shrink-0 text-[11px] font-normal text-parch/35">· {t('common.guest')}</span>}
                  </span>
                  {p.isHost && <Icon.crown className="h-4 w-4 shrink-0 text-brass" title={t('waiting.host')} />}
                  {!p.connected && <span className="pill bg-white/10 text-parch/40">{t('waiting.offline')}</span>}
                  {p.isHost ? null : p.ready
                    ? <span className="pill bg-go/25 text-go-light"><Icon.check className="h-3 w-3" />{t('waiting.ready')}</span>
                    : <span className="pill bg-white/[0.07] text-parch/35">{t('mafia.notReady')}</span>}
                </li>
              ))}
            </ul>
            {Array.from({ length: Math.max(0, state.minPlayers - count) }).map((_, i) => (
              <div key={`empty-${i}`} className="bunker-hatch mt-1.5 rounded-xl px-3 py-2 text-center text-[12px] text-parch/30">
                {t('bunker.emptySeat', { n: count + i + 1 })}
              </div>
            ))}
          </section>

          <section className="bunker-plate flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Icon.settings className="h-4 w-4 text-parch/40" />
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('bunker.settings.title')}</h2>
              {!isHost && <span className="text-[11px] text-parch/35">{t('bunker.settings.hostOnly')}</span>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
              <span className="text-[13px] font-semibold text-parch">{t('bunker.settings.maxPlayers')}</span>
              {setting('maxPlayers', capacityOptions, (v) => String(v))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-semibold text-parch">{t('bunker.settings.seats')}</p>
                <p className="text-[11.5px] text-parch/40">{t('bunker.settings.seatsHint', { n: state.seats })}</p>
              </div>
              {setting('seats', seatOptions, (v) => (v === 0 ? t('bunker.settings.seatsAuto') : String(v)))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
              <span className="text-[13px] font-semibold text-parch">{t('bunker.settings.turnSec')}</span>
              {setting('turnSec', [30, 60, 90], (v) => `${v}${t('mafia.secondsShort')}`)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
              <span className="text-[13px] font-semibold text-parch">{t('bunker.settings.discussSec')}</span>
              {setting('discussSec', [60, 120, 180, 300], (v) => `${v}${t('mafia.secondsShort')}`)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
              <span className="text-[13px] font-semibold text-parch">{t('bunker.settings.voteSec')}</span>
              {setting('voteSec', [30, 60, 90], (v) => `${v}${t('mafia.secondsShort')}`)}
            </div>
          </section>
        </div>

        <section className="bunker-plate p-4">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('bunker.rulesTitle')}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-snug text-parch/60">
            {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`bunker.rules.${n}`, { round: state.firstVoteRound })}</li>)}
          </ol>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CHAR_ORDER.map((key) => (
              <span key={key} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/25 px-2 py-1 text-[12px] text-parch/70">
                <CharIcon name={key} className="h-3.5 w-3.5 text-parch/45" />
                {t(`bunker.char.${key}`)}
              </span>
            ))}
          </div>
        </section>

        <div className="bunker-plate flex flex-wrap items-center gap-2 p-3">
          {!isHost && (
            <button type="button" onClick={() => actions.setReady(!me?.ready)} className={`${me?.ready ? 'btn-ghost' : 'btn-success'} flex-1 py-3 text-[15px]`}>
              <Icon.check className="h-4 w-4" />
              {me?.ready ? t('mafia.cancelReady') : t('mafia.imReady')}
            </button>
          )}
          {isHost && (
            <>
              <button type="button" onClick={actions.start} disabled={!enough} className="btn-primary min-w-[200px] flex-1 py-3 text-[15px]">
                ☢️ {t('bunker.start')}
              </button>
              {!enough && <p className="w-full text-center text-[12px] text-parch/40">{t('bunker.needMoreLong', { n: state.minPlayers })}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
