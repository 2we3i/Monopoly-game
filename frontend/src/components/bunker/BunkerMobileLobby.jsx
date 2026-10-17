// BunkerMobileLobby.jsx
// The Bunker room before the game, on a phone. Same content as
// BunkerLobby - the code, who is here, the rules this table plays - but
// in the order a phone needs it: inviting people first (the system share
// sheet, or a QR code a friend scans off this screen), and the one button
// that matters, Ready or Start, pinned to the bottom edge instead of
// sitting at the end of a long page.
//
// Everything shown is the server's own settings object, so it can never
// disagree with what the engine will actually deal.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import PlayerAvatar from '../PlayerAvatar';
import Icon from '../icons';
import SocialBar from '../social/SocialBar';
import QrCode from '../ui/QrCode';
import { PlayerStatus, SpectatorStrip } from '../room/RoomStatus';
import FramedAvatar from '../../cosmetics/FramedAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';
import { useBunkerConfig } from '../../hooks/useBunker';
import BunkerSettings, { RulesSummary, SheetPreview } from './BunkerSettings';
import { CardFace } from './BunkerCards';

const shareGlyph = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8" />
    <path d="M5 12.5v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
  </svg>
);

// A block that folds away: the rules and the sheet are worth one tap to
// read, not a screen of scrolling on every visit.
function Fold({
  title, badge = null, children, defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bunker-plate overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3.5 py-3 text-left active:bg-white/[0.03]">
        <h2 className="min-w-0 flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{title}</h2>
        {badge}
        <Icon.chevronDown className={`h-4 w-4 shrink-0 text-parch/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-3">{children}</div>}
    </section>
  );
}

export default function BunkerMobileLobby({
  state, actions, onLeave, openSettings = false, onSettingsOpened,
}) {
  const { t } = useTranslation();
  const config = useBunkerConfig();
  const [copied, setCopied] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (openSettings) {
      setSettingsOpen(true);
      onSettingsOpened?.();
    }
  }, [openSettings, onSettingsOpened]);

  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost;
  const humans = state.players.filter((p) => !p.isBot);
  const count = state.players.length;
  const enough = count >= state.minPlayers;
  const s = state.settings;
  const link = `${window.location.origin}/?room=${state.roomCode}`;
  const waitingOn = humans.filter((p) => !p.isHost);
  const readyCount = waitingOn.filter((p) => p.ready).length;
  const deckSample = s.actionCards.enabled ? s.actionCards.deck.slice(0, 8) : [];

  const copy = async (kind, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* the code is on screen anyway */ }
  };

  // The phone's own share sheet when there is one - messengers, SMS -
  // and the link on the clipboard when there is not.
  const invite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: t('menu.bunker.title'), text: t('bunker.m.inviteText', { code: state.roomCode }), url: link });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    copy('link', link);
  };

  let status = null;
  if (!me) status = t('bunker.watchingLobby');
  else if (!enough) {
    status = `${t('bunker.needMoreLong', { n: state.minPlayers })}${humans.length < state.minPlayers && !s.players.bots && isHost ? ` · ${t('bunker.botsHintShort')}` : ''}`;
  } else if (isHost) status = waitingOn.length ? t('bunker.m.readyCount', { n: readyCount, m: waitingOn.length }) : null;
  else status = me.ready ? t('bunker.m.youReady') : t('bunker.m.pressReady');

  return (
    <div className="table-bunker phone-frame flex flex-col overflow-hidden">
      <header className="z-20 flex shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[#121315]/95 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-600 to-zinc-900 text-[19px]" aria-hidden="true">☢️</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[19px] font-black leading-tight text-parch">{t('menu.bunker.title')}</h1>
          <p className="truncate text-[12px] text-parch/45">{t(`bunker.scenario.${s.scenario}`)}</p>
        </div>
        <SocialBar compact />
        <button
          type="button"
          onClick={onLeave}
          aria-label={t('waiting.leave')}
          title={t('waiting.leave')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-parch/70 active:bg-white/10"
        >
          <Icon.close className="h-5 w-5" />
        </button>
      </header>

      <main className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3">
        {/* The code, and every way of passing it on. */}
        <section className="bunker-plate flex flex-col items-center gap-2.5 px-3.5 py-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-parch/40">{t('waiting.roomCode')}</span>
          <span className="font-mono text-[38px] font-black leading-none tracking-[0.22em] text-parch">{state.roomCode}</span>
          <button type="button" onClick={invite} className="btn-primary mt-1 w-full py-3 text-[15px]">
            {copied === 'link' ? <Icon.check className="h-4 w-4" /> : shareGlyph}
            {copied === 'link' ? t('waiting.copied') : t('bunker.m.invite')}
          </button>
          <div className="grid w-full grid-cols-2 gap-2">
            <button type="button" onClick={() => copy('code', state.roomCode)} className="btn-ghost py-2.5 text-[13px]">
              {copied === 'code' && <Icon.check className="h-3.5 w-3.5" />}
              {copied === 'code' ? t('waiting.copied') : t('bunker.m.copyCode')}
            </button>
            <button type="button" onClick={() => setQrOpen((v) => !v)} aria-expanded={qrOpen} className={`py-2.5 text-[13px] ${qrOpen ? 'btn-ghost bg-white/[0.09]' : 'btn-ghost'}`}>
              {t('bunker.m.qr')}
              <Icon.chevronDown className={`h-3.5 w-3.5 transition-transform ${qrOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {qrOpen && (
            <div className="animate-fade-in flex flex-col items-center gap-2 pt-1">
              <QrCode value={link} className="h-48 w-48 rounded-xl" title={t('bunker.m.qr')} />
              <p className="max-w-[16rem] text-center text-[12px] leading-snug text-parch/45">{t('bunker.m.qrHint')}</p>
            </div>
          )}
        </section>

        {/* Who is here. */}
        <section className="bunker-plate p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <Icon.users className="h-4 w-4 text-parch/40" />
            <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">
              {t('waiting.players')} · {count}/{s.maxPlayers}
            </h2>
            {!enough && <span className="pill bg-orange-500/15 text-orange-300">{t('bunker.needMore', { n: state.minPlayers - count })}</span>}
          </div>
          <ul className="flex flex-col gap-1.5">
            {state.players.map((p) => (
              <li key={p.id} className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${p.ready || p.isHost ? 'border-go/35 bg-go/[0.06]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                <span className="flex h-7 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 px-1 font-mono text-[12.5px] font-bold text-parch/75 tnum">№{p.number}</span>
                <FramedAvatar cosmetics={p.cosmetics} join>
                  <PlayerAvatar player={{ ...p, color: p.isBot ? '#3f3f46' : '#52525b' }} sizeClassName="h-8 w-8" ringClassName="ring-2 ring-white/10" />
                </FramedAvatar>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center text-[14.5px] font-semibold text-parch">
                    <StyledName nickname={p.nickname} cosmetics={p.cosmetics} />
                    {p.isYou && <span className="ml-1.5 shrink-0 text-[11px] font-normal text-parch/40">{t('sidebar.you')}</span>}
                    {p.isBot && <span className="ml-1.5 shrink-0 rounded bg-white/[0.08] px-1 text-[9.5px] font-bold uppercase text-parch/45">{t('bunker.bot')}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 pt-0.5">
                    {p.isHost && <span className="pill bg-brass/20 text-brass-light"><Icon.crown className="h-3 w-3" />{t('waiting.host')}</span>}
                    {!p.isHost && !p.isBot && (p.ready
                      ? <span className="pill bg-go/25 text-go-light"><Icon.check className="h-3 w-3" />{t('waiting.ready')}</span>
                      : <span className="pill bg-white/[0.07] text-parch/40">{t('mafia.notReady')}</span>)}
                    {p.isGuest && !p.isBot && <span className="pill bg-white/[0.05] text-parch/35">{t('common.guest')}</span>}
                    <PlayerStatus player={p} compact />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {Array.from({ length: Math.max(0, state.minPlayers - count) }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={`empty-${i}`} className="bunker-hatch mt-1.5 rounded-xl px-3 py-2.5 text-center text-[12.5px] text-parch/30">
              {t('bunker.emptySeat', { n: count + i + 1 })}
            </div>
          ))}
          <SpectatorStrip spectators={state.spectators} className="mt-2" />
        </section>

        {/* What this table plays. */}
        <section className="bunker-plate flex flex-col gap-3 p-3.5">
          <div className="flex items-center gap-2">
            <Icon.settings className="h-4 w-4 text-parch/40" />
            <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('bunker.settings.title')}</h2>
            <button type="button" onClick={() => setSettingsOpen(true)} className="btn-ghost px-3 py-2 text-[12.5px]">
              {isHost ? t('mafia.edit') : t('mafia.view')}
            </button>
          </div>
          <div>
            <h3 className="text-[16px] font-bold text-parch">{t(`bunker.scenario.${s.scenario}`)}</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-parch/50">{t(`bunker.scenarioText.${s.scenario}`)}</p>
          </div>
          <RulesSummary state={state} t={t} />
          <div>
            <p className="section-label mb-1.5">{t('bunker.m.timers')}</p>
            <dl className="grid grid-cols-3 gap-1.5 text-center">
              {[
                ['bunker.settings.turnSec', s.turnSec],
                ['bunker.settings.discussSec', s.discussSec],
                ['bunker.settings.voteSec', s.voteSec],
              ].map(([key, value]) => (
                <div key={key} className="rounded-lg border border-white/[0.07] bg-black/25 px-1.5 py-1.5">
                  <dt className="truncate text-[10.5px] uppercase tracking-wide text-parch/40">{t(key)}</dt>
                  <dd className="text-[15px] font-semibold text-parch tnum">{value}{t('mafia.secondsShort')}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <Fold title={t('bunker.m.sheetN', { n: (state.categories || []).length })}>
          <SheetPreview state={state} t={t} />
        </Fold>

        {deckSample.length > 0 && (
          <Fold title={t('bunker.m.deckN', { n: s.actionCards.deck.length })}>
            <p className="mb-2 text-[12.5px] text-parch/50">{t('bunker.cards.deckCount', { n: s.actionCards.deck.length, hand: s.actionCards.perPlayer })}</p>
            <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {deckSample.map((id) => <CardFace key={id} id={id} t={t} />)}
              {s.actionCards.deck.length > deckSample.length && (
                <button type="button" onClick={() => setSettingsOpen(true)} className="min-w-[5.5rem] shrink-0 rounded-xl border border-dashed border-white/15 px-2 text-[12px] text-parch/45">
                  +{s.actionCards.deck.length - deckSample.length}
                </button>
              )}
            </div>
          </Fold>
        )}

        <Fold title={t('bunker.rulesTitle')} defaultOpen={!!me && !isHost}>
          <ol className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n} className="flex gap-2.5 text-[13.5px] leading-snug text-parch/70">
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brass/20 text-[11px] font-bold text-brass-light tnum">{n}</span>
                <span className="min-w-0">
                  {t(`bunker.rules.${n}`, {
                    round: state.firstVoteRound,
                    chars: (state.categories || []).length,
                    reveals: s.rounds.revealPerRound,
                  })}
                </span>
              </li>
            ))}
          </ol>
        </Fold>
      </main>

      {/* The one button that matters, always under the thumb. */}
      <footer className="z-20 shrink-0 border-t border-white/[0.08] bg-[#121315]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
        {status && <p className="mb-2 text-center text-[12.5px] leading-snug text-parch/50">{status}</p>}
        {!!me && !isHost && (
          <button type="button" onClick={() => actions.setReady(!me.ready)} className={`${me.ready ? 'btn-ghost' : 'btn-success'} w-full py-3.5 text-[16px]`}>
            <Icon.check className="h-5 w-5" />
            {me.ready ? t('mafia.cancelReady') : t('mafia.imReady')}
          </button>
        )}
        {isHost && (
          <button type="button" onClick={actions.start} disabled={!enough} className="btn-primary w-full py-3.5 text-[16px]">
            ☢️ {t('bunker.start')}
          </button>
        )}
      </footer>

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
