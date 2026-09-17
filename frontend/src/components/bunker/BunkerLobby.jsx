// BunkerLobby.jsx
// The Bunker room before the game: the room code and invite link, who is
// here (each with their seat number), the scenario and rules this table
// will play, and the start button.
//
// The rules themselves live in BunkerSettings - this screen shows a
// summary of them and opens the full panel. Everything it shows comes from
// the server's own settings object, so it can never disagree with what the
// engine will actually deal.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import PlayerAvatar from '../PlayerAvatar';
import Icon from '../icons';
import SocialBar from '../social/SocialBar';
import { PlayerStatus, SpectatorStrip } from '../room/RoomStatus';
import FramedAvatar from '../../cosmetics/FramedAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';
import { useBunkerConfig } from '../../hooks/useBunker';
import BunkerSettings, { RulesSummary, SheetPreview } from './BunkerSettings';
import { CardFace } from './BunkerCards';

export default function BunkerLobby({
  state, actions, onLeave, openSettings = false, onSettingsOpened,
}) {
  const { t } = useTranslation();
  const config = useBunkerConfig();
  const [copied, setCopied] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (openSettings) {
      setSettingsOpen(true);
      onSettingsOpened?.();
    }
  }, [openSettings, onSettingsOpened]);

  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost;
  const humans = state.players.filter((p) => !p.isBot);
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

  // A sample of the action cards this table has left in its deck, so the
  // room can see what it is playing with before the first hand is dealt.
  const deckSample = s.actionCards.enabled ? s.actionCards.deck.slice(0, 8) : [];

  return (
    <div className="table-bunker min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 3xl:max-w-6xl 4xl:max-w-[1700px] 4xl:gap-6 4xl:py-10">
        {/* On a phone the title takes its own row: sharing one line with
            the toolbar squeezed it into a three-character column. */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-600 to-zinc-900 text-[20px] shadow-lift" aria-hidden="true">☢️</span>
          <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-auto">
            <h1 className="font-display text-[21px] font-black leading-tight text-parch 4xl:text-[28px]">{t('menu.bunker.title')}</h1>
            {/* The scenario is spelled out again in the rules panel, so on
                a narrow screen one line of it is enough. */}
            <p className="truncate text-[12px] text-parch/45">{t(`bunker.scenarioText.${s.scenario}`)}</p>
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
          {/* Who is here -------------------------------------------- */}
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
                // The badges on the right (offline, a drop countdown, ready)
                // wrap onto their own line rather than squeezing the
                // nickname down to a single letter on a phone.
                <li key={p.id} className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border px-3 py-2 ${p.ready || p.isHost ? 'border-go/35 bg-go/[0.06]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                  <span className="flex h-7 min-w-[2.25rem] items-center justify-center rounded-lg border border-white/10 bg-black/40 px-1 font-mono text-[12.5px] font-bold text-parch/75 tnum">№{p.number}</span>
                  <FramedAvatar cosmetics={p.cosmetics} join>
                    <PlayerAvatar player={{ ...p, color: p.isBot ? '#3f3f46' : '#52525b' }} sizeClassName="h-8 w-8 4xl:h-10 4xl:w-10" ringClassName="ring-2 ring-white/10" />
                  </FramedAvatar>
                  <span className="flex min-w-0 flex-1 basis-[6rem] items-center truncate text-[13.5px] font-semibold text-parch 4xl:text-[16px]">
                    <StyledName nickname={p.nickname} cosmetics={p.cosmetics} showTitle titleSize="xs" />
                    {p.isYou && <span className="ml-1.5 shrink-0 text-[11px] font-normal text-parch/40">{t('sidebar.you')}</span>}
                    {p.isBot && <span className="ml-1.5 shrink-0 rounded bg-white/[0.08] px-1 text-[9.5px] font-bold uppercase text-parch/45">{t('bunker.bot')}</span>}
                    {p.isGuest && !p.isBot && <span className="ml-1.5 shrink-0 text-[11px] font-normal text-parch/35">· {t('common.guest')}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {p.isHost && <Icon.crown className="h-4 w-4 shrink-0 text-brass" title={t('waiting.host')} />}
                    <PlayerStatus player={p} compact />
                    {p.isHost || p.isBot ? null : p.ready
                      ? <span className="pill bg-go/25 text-go-light"><Icon.check className="h-3 w-3" />{t('waiting.ready')}</span>
                      : <span className="pill bg-white/[0.07] text-parch/35">{t('mafia.notReady')}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <SpectatorStrip spectators={state.spectators} className="mt-2" />
            {Array.from({ length: Math.max(0, state.minPlayers - count) }).map((_, i) => (
              <div key={`empty-${i}`} className="bunker-hatch mt-1.5 rounded-xl px-3 py-2 text-center text-[12px] text-parch/30">
                {t('bunker.emptySeat', { n: count + i + 1 })}
              </div>
            ))}
          </section>

          {/* What this table plays ----------------------------------- */}
          <section className="bunker-plate flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Icon.settings className="h-4 w-4 text-parch/40" />
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('bunker.settings.title')}</h2>
              <button type="button" onClick={() => setSettingsOpen(true)} className="btn-ghost px-2.5 py-1.5 text-[12px]">
                <Icon.settings className="h-3.5 w-3.5" />
                {isHost ? t('mafia.edit') : t('mafia.view')}
              </button>
            </div>

            <div>
              <p className="section-label mb-1.5">{t('bunker.settings.tab.scenario')}</p>
              <h3 className="text-[16px] font-bold text-parch">{t(`bunker.scenario.${s.scenario}`)}</h3>
              <p className="mt-0.5 text-[12px] leading-snug text-parch/45">{t(`bunker.scenarioText.${s.scenario}`)}</p>
            </div>

            <div>
              <p className="section-label mb-1.5">{t('bunker.rulesAtAGlance')}</p>
              <RulesSummary state={state} t={t} />
            </div>

            <div>
              <p className="section-label mb-1.5">{t('bunker.sheetTitle')}</p>
              <SheetPreview state={state} t={t} />
            </div>

            <dl className="grid grid-cols-3 gap-2 text-center text-[12px]">
              {[
                ['bunker.settings.turnSec', s.turnSec],
                ['bunker.settings.discussSec', s.discussSec],
                ['bunker.settings.voteSec', s.voteSec],
              ].map(([key, value]) => (
                <div key={key} className="rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1.5">
                  <dt className="text-[10.5px] uppercase tracking-wide text-parch/35">{t(key)}</dt>
                  <dd className="font-semibold text-parch tnum">{value}{t('mafia.secondsShort')}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* The action cards in play ---------------------------------- */}
        {deckSample.length > 0 && (
          <section className="bunker-plate p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">🃏 {t('bunker.cards.deckTitle')}</h2>
              <span className="pill bg-white/[0.07] text-parch/55">
                {t('bunker.cards.deckCount', { n: s.actionCards.deck.length, hand: s.actionCards.perPlayer })}
              </span>
            </div>
            <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {deckSample.map((id) => <CardFace key={id} id={id} t={t} />)}
              {s.actionCards.deck.length > deckSample.length && (
                <button type="button" onClick={() => setSettingsOpen(true)} className="min-w-[5.5rem] shrink-0 rounded-xl border border-dashed border-white/15 px-2 text-[12px] text-parch/45 hover:border-white/30">
                  +{s.actionCards.deck.length - deckSample.length}
                </button>
              )}
            </div>
          </section>
        )}

        {/* How it is played ------------------------------------------ */}
        <section className="bunker-plate p-4">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('bunker.rulesTitle')}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-snug text-parch/60">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n}>
                {t(`bunker.rules.${n}`, {
                  round: state.firstVoteRound,
                  chars: (state.categories || []).length,
                  reveals: s.rounds.revealPerRound,
                })}
              </li>
            ))}
          </ol>
        </section>

        <div className="bunker-plate flex flex-wrap items-center gap-2 p-3">
          {!me && <p className="w-full text-center text-[12.5px] text-parch/45">{t('bunker.watchingLobby')}</p>}
          {!!me && !isHost && (
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
              {!enough && (
                <p className="w-full text-center text-[12px] text-parch/40">
                  {t('bunker.needMoreLong', { n: state.minPlayers })}
                  {humans.length < state.minPlayers && !s.players.bots && ` · ${t('bunker.botsHintShort')}`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {settingsOpen && (
        <BunkerSettings
          state={state}
          config={config}
          isHost={isHost}
          onPatch={actions.updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
