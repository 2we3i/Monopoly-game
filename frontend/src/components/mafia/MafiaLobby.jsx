// MafiaLobby.jsx
// The room before the game: who is here, what the rules are, and the one
// button that starts it. The host edits the rules in place and everyone
// else watches them change - the settings panel is the same component
// for both, read-only for guests.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import PlayerAvatar from '../PlayerAvatar';
import MafiaSettingsModal from './MafiaSettings';
import Icon from '../icons';
import SocialBar from '../social/SocialBar';
import FramedAvatar from '../../cosmetics/FramedAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';

function SummaryPill({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-white/[0.07] text-parch/70',
    mafia: 'bg-rent/25 text-rent-light',
    neutral: 'bg-violet-500/25 text-violet-200',
    fun: 'bg-brass/25 text-brass-light',
  };
  return <span className={`pill ${tones[tone]}`}>{children}</span>;
}

export default function MafiaLobby({
  state, playerId, actions, onLeave, openSettings = false, onSettingsOpened, minPlayers = 4,
}) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(openSettings);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (openSettings) {
      setSettingsOpen(true);
      onSettingsOpened?.();
    }
  }, [openSettings, onSettingsOpened]);

  const me = state.players.find((p) => p.id === playerId);
  const isHost = !!me?.isHost;
  const enough = state.players.length >= minPlayers;
  const settings = state.settings;
  const fun = settings.fun || {};
  const activeMods = Object.entries(fun.modifiers || {}).filter(([, on]) => on).map(([key]) => key);

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* the code is on screen anyway */ }
  };
  const copyCode = () => copyText(state.roomCode);
  const copyLink = () => copyText(`${window.location.origin}/?room=${state.roomCode}`);

  return (
    <div className="table-night min-h-screen">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6 3xl:max-w-5xl 4xl:max-w-[1600px] 4xl:gap-6 4xl:py-10">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rent to-rent-deep text-white shadow-lift">
            🔪
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[20px] font-black leading-tight text-parch">{t('menu.mafia.title')}</h1>
            <p className="text-[12px] text-parch/45">{t('mafia.lobbySubtitle')}</p>
          </div>
          <SocialBar compact />
          <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">
            {t('waiting.leave')}
          </button>
        </header>

        {/* Room code ------------------------------------------------ */}
        <button
          type="button"
          onClick={copyCode}
          className="panel flex items-center justify-center gap-4 py-5 transition-colors hover:bg-white/[0.05]"
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-parch/40">{t('waiting.roomCode')}</span>
          <span className="font-display text-[34px] font-black tracking-[0.2em] text-parch">{state.roomCode}</span>
          {copied
            ? <Icon.check className="h-5 w-5 text-go-light" />
            : <Icon.scroll className="h-5 w-5 text-parch/40" />}
        </button>
        <button type="button" onClick={copyLink} className="-mt-2 self-center text-[12.5px] font-medium text-brass-light underline decoration-brass-light/40 underline-offset-4 hover:decoration-brass-light">
          {t('waiting.copyInviteLink')}
        </button>

        <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
          {/* Players ----------------------------------------------- */}
          <section className="panel flex flex-col p-4">
            <div className="mb-3 flex items-center gap-2">
              <Icon.users className="h-4 w-4 text-parch/40" />
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">
                {t('waiting.players')} · {state.players.length}/15
              </h2>
              {!enough && (
                <span className="pill bg-rent/20 text-rent-light">
                  {t('mafia.needMore', { count: minPlayers - state.players.length })}
                </span>
              )}
            </div>

            <ul className="flex flex-col gap-1.5">
              {state.players.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
                    p.ready ? 'border-go/40 bg-go/[0.08]' : 'border-white/[0.07] bg-white/[0.025]'
                  }`}
                >
                  <FramedAvatar cosmetics={p.cosmetics} join>
                    <PlayerAvatar player={{ ...p, color: p.isHost ? '#c9982f' : '#4b5fa8' }} sizeClassName="h-8 w-8 4xl:h-10 4xl:w-10" ringClassName="ring-2 ring-white/15" />
                  </FramedAvatar>
                  <span className="flex min-w-0 flex-1 items-center truncate text-[13.5px] font-semibold text-parch 4xl:text-[16px]">
                    <StyledName nickname={p.nickname} cosmetics={p.cosmetics} showTitle titleSize="xs" />
                    {p.id === playerId && <span className="ml-1.5 text-[11px] font-normal text-parch/40">{t('sidebar.you')}</span>}
                    {p.isGuest && <span className="ml-1.5 text-[11px] font-normal text-parch/35">· {t('common.guest')}</span>}
                  </span>
                  {p.isHost && <Icon.crown className="h-4 w-4 shrink-0 text-brass" title={t('waiting.host')} />}
                  {!p.connected && <span className="pill bg-white/10 text-parch/40">{t('waiting.offline')}</span>}
                  {p.ready
                    ? <span className="pill bg-go/25 text-go-light"><Icon.check className="h-3 w-3" />{t('waiting.ready')}</span>
                    : <span className="pill bg-white/[0.07] text-parch/35">{t('mafia.notReady')}</span>}
                </li>
              ))}
            </ul>

            {Array.from({ length: Math.max(0, minPlayers - state.players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="mt-1.5 rounded-xl border border-dashed border-white/10 px-3 py-2 text-center text-[12px] text-parch/25">
                {t('mafia.emptySeat')}
              </div>
            ))}
          </section>

          {/* Rules summary ----------------------------------------- */}
          <section className="panel flex flex-col p-4">
            <div className="mb-3 flex items-center gap-2">
              <Icon.scroll className="h-4 w-4 text-parch/40" />
              <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('mafia.rulesSummary')}</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="btn-ghost px-2.5 py-1.5 text-[12px]"
              >
                <Icon.settings className="h-3.5 w-3.5" />
                {isHost ? t('mafia.edit') : t('mafia.view')}
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(state.roleSummary || {}).filter(([, n]) => n > 0).map(([id, n]) => (
                <SummaryPill key={id} tone={['MAFIA', 'DON'].includes(id) ? 'mafia' : id === 'MANIAC' ? 'neutral' : 'default'}>
                  {t(`mafia.role.${id}`)} · {n}
                </SummaryPill>
              ))}
            </div>

            <dl className="flex flex-col gap-1.5 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-parch/45">{t('mafia.nightDuration')}</dt>
                <dd className="font-semibold text-parch/80 tnum">{settings.night.durationSec}{t('mafia.secondsShort')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-parch/45">{t('mafia.discussion')}</dt>
                <dd className="font-semibold text-parch/80 tnum">{settings.day.discussionSec}{t('mafia.secondsShort')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-parch/45">{t('mafia.voteDuration')}</dt>
                <dd className="font-semibold text-parch/80 tnum">{settings.day.voteSec}{t('mafia.secondsShort')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-parch/45">{t('mafia.tieResolution')}</dt>
                <dd className="font-semibold text-parch/80">{t(`mafia.tie.${settings.day.tieResolution}`)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-parch/45">{t('mafia.info.revealRoleOnDeath')}</dt>
                <dd className="font-semibold text-parch/80">{settings.info.revealRoleOnDeath ? t('mafia.yes') : t('mafia.no')}</dd>
              </div>
            </dl>

            {fun.enabled && (
              <div className="mt-3 rounded-xl border border-brass/30 bg-brass/[0.08] p-2.5">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brass-light">🎉 {t('mafia.funSection')}</p>
                <div className="flex flex-wrap gap-1">
                  {activeMods.length === 0
                    ? <span className="text-[11.5px] text-parch/40">{t('mafia.noModifiers')}</span>
                    : activeMods.map((key) => <SummaryPill key={key} tone="fun">{t(`mafia.mod.${key}`)}</SummaryPill>)}
                </div>
              </div>
            )}

            {isHost && (
              <button type="button" onClick={actions.randomSettings} className="btn-ghost mt-3 w-full py-2.5 text-[12.5px]">
                🎲 {t('mafia.randomSettings')}
              </button>
            )}
          </section>
        </div>

        {/* Actions -------------------------------------------------- */}
        <div className="panel flex flex-wrap items-center gap-2 p-3">
          {!isHost && (
            <button
              type="button"
              onClick={() => actions.setReady(!me?.ready)}
              className={`${me?.ready ? 'btn-ghost' : 'btn-success'} flex-1 py-3 text-[15px]`}
            >
              <Icon.check className="h-4 w-4" />
              {me?.ready ? t('mafia.cancelReady') : t('mafia.imReady')}
            </button>
          )}
          {isHost && (
            <>
              <button
                type="button"
                onClick={actions.start}
                disabled={!enough}
                className="btn-primary min-w-[200px] flex-1 py-3 text-[15px]"
              >
                🔪 {t('mafia.startGame')}
              </button>
              {!enough && (
                <p className="w-full text-center text-[12px] text-parch/40">
                  {t('mafia.needMoreLong', { count: minPlayers })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {settingsOpen && (
        <MafiaSettingsModal
          settings={settings}
          roleSummary={state.roleSummary}
          playerCount={state.players.length}
          isHost={isHost}
          onPatch={actions.updateSettings}
          onPreset={actions.applyPreset}
          onRandom={actions.randomSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
