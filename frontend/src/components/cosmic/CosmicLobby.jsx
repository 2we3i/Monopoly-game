// CosmicLobby.jsx
// The Cosmic Encounter room before the game: who is here and in which
// colour, the table's timer, the rules in brief, and the races that may be
// dealt - each with its portrait and power.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import PlayerAvatar from '../PlayerAvatar';
import Icon from '../icons';
import SocialBar from '../social/SocialBar';
import FramedAvatar from '../../cosmetics/FramedAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';
import { Segmented } from '../mafia/MafiaSettings';
import { AlienPortrait, cosmicColor } from './cosmicArt';

export const SEAT_COLORS = ['red', 'blue', 'yellow', 'green', 'purple'];
export const ALIEN_ORDER = ['macron', 'parasite', 'clone', 'zombie', 'oracle', 'trader', 'mind', 'fido', 'warrior', 'machine'];
export const ALIEN_COMPLEXITY = {
  macron: 'green', parasite: 'green', clone: 'green', zombie: 'green', oracle: 'green', trader: 'green', mind: 'yellow', fido: 'yellow', warrior: 'yellow', machine: 'yellow',
};

export function AlienBlurb({ id, t, compact = false }) {
  const lamp = { green: 'bg-emerald-400', yellow: 'bg-amber-300', red: 'bg-rose-400' }[ALIEN_COMPLEXITY[id]];
  return (
    <div className="flex min-w-0 items-start gap-3">
      <AlienPortrait id={id} className={compact ? 'h-11 w-11' : 'h-14 w-14'} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-bold text-parch">
          {t(`cosmic.alien.${id}.name`)}
          <span className={`h-2 w-2 rounded-full ${lamp}`} title={t(`cosmic.complexity.${ALIEN_COMPLEXITY[id]}`)} />
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-200/70">{t(`cosmic.alien.${id}.power`)}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-parch/65">{t(compact ? `cosmic.alien.${id}.short` : `cosmic.alien.${id}.text`)}</p>
        {!compact && <p className="mt-1 text-[11px] text-parch/40">{t(`cosmic.alien.${id}.when`)}</p>}
      </div>
    </div>
  );
}

export default function CosmicLobby({
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

  const copy = async (kind, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* the code is on screen anyway */ }
  };

  return (
    <div className="table-cosmic min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 3xl:max-w-6xl 4xl:max-w-[1700px] 4xl:gap-6 4xl:py-10">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/80 to-indigo-900 text-[20px] shadow-lift">🛸</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[21px] font-black leading-tight text-parch">{t('menu.cosmic.title')}</h1>
            <p className="text-[12px] text-parch/45">{t('cosmic.lobbySubtitle')}</p>
          </div>
          <SocialBar compact />
          <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
        </header>

        <section className="panel flex flex-col items-center gap-2 py-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-parch/40">{t('waiting.roomCode')}</span>
          <span className="font-display text-[36px] font-black tracking-[0.2em] text-parch">{state.roomCode}</span>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => copy('code', state.roomCode)} className="btn-ghost px-3 py-1.5 text-[12.5px]">
              {copied === 'code' ? <Icon.check className="h-3.5 w-3.5" /> : null}
              {copied === 'code' ? t('waiting.copied') : t('waiting.copy')}
            </button>
            <button type="button" onClick={() => copy('link', `${window.location.origin}/?room=${state.roomCode}`)} className="btn-ghost px-3 py-1.5 text-[12.5px]">
              {copied === 'link' ? <Icon.check className="h-3.5 w-3.5" /> : null}
              {copied === 'link' ? t('waiting.copied') : t('waiting.copyInviteLink')}
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
          <section className="panel flex flex-col p-4">
            <div className="mb-3 flex items-center gap-2">
              <Icon.users className="h-4 w-4 text-parch/40" />
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">
                {t('waiting.players')} · {state.players.length}/{state.maxPlayers}
              </h2>
              {!enough && <span className="pill bg-rent/20 text-rent-light">{t('cosmic.needMore', { n: state.minPlayers - state.players.length })}</span>}
            </div>
            <ul className="flex flex-col gap-1.5">
              {state.players.map((p, i) => {
                const color = SEAT_COLORS[i % SEAT_COLORS.length];
                return (
                  <li key={p.id} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${p.ready || p.isHost ? 'border-go/35 bg-go/[0.07]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                    <FramedAvatar cosmetics={p.cosmetics} join>
                      <PlayerAvatar player={{ ...p, color: cosmicColor(color).fill }} sizeClassName="h-8 w-8 4xl:h-10 4xl:w-10" ringClassName="ring-2 ring-white/15" />
                    </FramedAvatar>
                    <span className="flex min-w-0 flex-1 items-center truncate text-[13.5px] font-semibold text-parch 4xl:text-[16px]">
                      <StyledName nickname={p.nickname} cosmetics={p.cosmetics} showTitle titleSize="xs" />
                      {p.isYou && <span className="ml-1.5 text-[11px] font-normal text-parch/40">{t('sidebar.you')}</span>}
                      {p.isGuest && <span className="ml-1.5 hidden text-[11px] font-normal text-parch/35 sm:inline">· {t('common.guest')}</span>}
                    </span>
                    <span className="pill bg-white/[0.06] normal-case tracking-normal text-parch/60" title={t('cosmic.seatColor')}>
                      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/40" style={{ backgroundColor: cosmicColor(color).fill }} />
                      <span className="hidden sm:inline">{t(`cosmic.color.${color}`)}</span>
                    </span>
                    {p.isHost && <Icon.crown className="h-4 w-4 shrink-0 text-brass" title={t('waiting.host')} />}
                    {!p.connected && <span className="pill bg-white/10 text-parch/40">{t('waiting.offline')}</span>}
                    {p.isHost ? null : p.ready
                      ? <span className="pill bg-go/25 text-go-light"><Icon.check className="h-3 w-3" />{t('waiting.ready')}</span>
                      : <span className="pill bg-white/[0.07] text-parch/35">{t('mafia.notReady')}</span>}
                  </li>
                );
              })}
            </ul>
            {Array.from({ length: Math.max(0, state.maxPlayers - state.players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="mt-1.5 rounded-xl border border-dashed border-white/10 px-3 py-2 text-center text-[12px] text-parch/25">
                {t('mafia.emptySeat')}
              </div>
            ))}
          </section>

          <section className="panel flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Icon.settings className="h-4 w-4 text-parch/40" />
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('cosmic.settings.title')}</h2>
              {!isHost && <span className="text-[11px] text-parch/35">{t('cosmic.settings.hostOnly')}</span>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
              <div>
                <p className="text-[13px] font-semibold text-parch">{t('cosmic.settings.turnSec')}</p>
                <p className="text-[11.5px] text-parch/40">{t('cosmic.settings.turnSecHint')}</p>
              </div>
              <Segmented
                disabled={!isHost}
                value={state.settings.turnSec}
                onChange={(v) => actions.updateSettings({ turnSec: Number(v) })}
                options={[0, 60, 90, 120, 180].map((v) => ({ value: v, label: v ? `${v}${t('mafia.secondsShort')}` : t('cosmic.settings.noTimer') }))}
              />
            </div>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-[12px] leading-snug text-parch/55">
              {[1, 2, 3, 4, 5, 6].map((n) => <li key={n}>{t(`cosmic.rules.${n}`)}</li>)}
            </ol>
          </section>
        </div>

        <section className="panel p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('cosmic.racesTitle')}</h2>
          <p className="mb-3 text-[12px] text-parch/45">{t('cosmic.racesHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ALIEN_ORDER.map((id) => (
              <div key={id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <AlienBlurb id={id} t={t} compact />
              </div>
            ))}
          </div>
        </section>

        <div className="panel flex flex-wrap items-center gap-2 p-3">
          {!isHost && (
            <button type="button" onClick={() => actions.setReady(!me?.ready)} className={`${me?.ready ? 'btn-ghost' : 'btn-success'} flex-1 py-3 text-[15px]`}>
              <Icon.check className="h-4 w-4" />
              {me?.ready ? t('mafia.cancelReady') : t('mafia.imReady')}
            </button>
          )}
          {isHost && (
            <>
              <button type="button" onClick={actions.start} disabled={!enough} className="btn-primary min-w-[200px] flex-1 py-3 text-[15px]">
                🛸 {t('cosmic.start')}
              </button>
              {!enough && <p className="w-full text-center text-[12px] text-parch/40">{t('cosmic.needMoreLong', { n: state.minPlayers })}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
