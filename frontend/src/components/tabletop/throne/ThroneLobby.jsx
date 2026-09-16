// ThroneLobby.jsx
// An online Iron Throne room before the war: the room code, the six great
// houses and who leads each (a player, the computer, or nobody), the war
// council's settings, readiness and the start button. Every change is a
// request; the server decides and pushes the new state to everyone.

import { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import PlayerAvatar from '../../PlayerAvatar';
import Icon from '../../icons';
import SocialBar from '../../social/SocialBar';
import { PlayerStatus, SpectatorStrip } from '../../room/RoomStatus';
import FramedAvatar from '../../../cosmetics/FramedAvatar';
import { StyledName } from '../../../cosmetics/Cosmetics';
import { Segmented } from '../../mafia/MafiaSettings';
import { HOUSES } from './houses';
import { IronThroneBadge, SigilBadge } from './throneArt';
import { RulesModal } from './ThronePanels';

export default function ThroneLobby({
  state, actions, onLeave, openSettings = false, onSettingsOpened,
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(null);
  const [rules, setRules] = useState(false);

  useEffect(() => {
    if (openSettings) onSettingsOpened?.();
  }, [openSettings, onSettingsOpened]);

  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost;
  const active = state.players.filter((p) => !p.left);
  const enough = active.length >= state.minPlayers;
  const s = state.settings;
  const atWar = state.houses.filter((h) => h.playerId || h.ai).length;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));

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

  const clock = (v) => {
    if (!v) return t('throne.lobby.noTimer');
    return v % 60 === 0 ? t('throne.lobby.min', { n: v / 60 }) : t('throne.lobby.sec', { n: v });
  };

  return (
    <div className="table-throne min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 3xl:max-w-6xl 4xl:max-w-[1700px] 4xl:gap-6 4xl:py-10">
        <header className="flex flex-wrap items-center gap-3">
          <IronThroneBadge className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="throne-heading text-[22px] leading-tight">{t('menu.throne.title')}</h1>
            <p className="text-[12px] text-[#e9dfc8]/50">{t('throne.lobby.subtitle')}</p>
          </div>
          <SocialBar compact />
          <button type="button" onClick={() => setRules(true)} className="btn-quiet px-3 py-2 text-[12.5px]">
            <Icon.scroll className="h-4 w-4" />
            {t('throne.rules.title')}
          </button>
          <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
        </header>

        <section className="throne-panel flex flex-col items-center gap-2 py-5">
          <span className="throne-label">{t('waiting.roomCode')}</span>
          <span className="font-display text-[36px] font-black tracking-[0.2em] text-[#f1e7cf]">{state.roomCode}</span>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => copy('code', state.roomCode)} className="throne-btn px-3 py-1.5">
              {copied === 'code' && <Icon.check className="h-3.5 w-3.5" />}
              {copied === 'code' ? t('waiting.copied') : t('waiting.copy')}
            </button>
            <button type="button" onClick={() => copy('link', `${window.location.origin}/?room=${state.roomCode}`)} className="throne-btn px-3 py-1.5">
              {copied === 'link' && <Icon.check className="h-3.5 w-3.5" />}
              {copied === 'link' ? t('waiting.copied') : t('waiting.copyInviteLink')}
            </button>
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <h2 className="throne-heading text-[18px]">{t('throne.lobby.houses')}</h2>
            <span className="text-[12px] text-[#e9dfc8]/50">{t('throne.lobby.houseCount', { n: atWar })}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {state.houses.map((seat) => {
              const holder = seat.playerId ? byId[seat.playerId] : null;
              const mine = holder?.isYou;
              return (
                <article
                  key={seat.id}
                  className={`throne-panel flex flex-col gap-2.5 p-3 ${holder || seat.ai ? '' : 'opacity-70'}`}
                  style={{ borderColor: mine ? HOUSES[seat.id].color : undefined }}
                >
                  <div className="flex items-center gap-3">
                    <SigilBadge house={seat.id} className="h-14 w-14 shrink-0" />
                    <div className="min-w-0">
                      <p className="throne-heading truncate text-[18px]" style={{ color: HOUSES[seat.id].color }}>{t(`throne.house.${seat.id}`)}</p>
                      <p className="truncate text-[12px] italic text-[#e9dfc8]/55">{t(`throne.words.${seat.id}`)}</p>
                    </div>
                  </div>
                  <div className="flex min-h-[2.25rem] items-center gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1.5">
                    {holder ? (
                      <>
                        <FramedAvatar cosmetics={holder.cosmetics} join>
                          <PlayerAvatar player={{ ...holder, color: HOUSES[seat.id].color }} sizeClassName="h-7 w-7" ringClassName="ring-2 ring-white/15" />
                        </FramedAvatar>
                        <span className="flex min-w-0 flex-1 items-center truncate text-[13px] font-semibold text-[#f1e7cf]">
                          <StyledName nickname={holder.nickname} cosmetics={holder.cosmetics} showTitle titleSize="xs" />
                        </span>
                        {holder.isHost && <Icon.crown className="h-4 w-4 shrink-0 text-brass" title={t('waiting.host')} />}
                        <PlayerStatus player={holder} compact />
                        {!holder.isHost && (holder.ready
                          ? <span className="pill bg-go/25 text-go-light"><Icon.check className="h-3 w-3" />{t('waiting.ready')}</span>
                          : <span className="pill bg-white/[0.07] text-parch/35">{t('mafia.notReady')}</span>)}
                      </>
                    ) : (
                      <span className="text-[12.5px] text-[#e9dfc8]/55">{seat.ai ? `⚙ ${t('throne.lobby.computer')}` : t('throne.lobby.free')}</span>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    {mine && <span className="throne-btn throne-btn-gold pointer-events-none">{t('throne.lobby.yours')}</span>}
                    {!holder && (
                      <button type="button" onClick={() => actions.chooseHouse(seat.id)} className="throne-btn">
                        {t('throne.lobby.take')}
                      </button>
                    )}
                    {!holder && isHost && (
                      <button type="button" onClick={() => actions.setAi(seat.id, !seat.ai)} className="throne-btn">
                        {seat.ai ? t('throne.lobby.aiOff') : t('throne.lobby.aiOn')}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-[#e9dfc8]/50">{t('throne.lobby.aiHint')}</p>
          <SpectatorStrip spectators={state.spectators} className="mt-2" />
        </section>

        <section className="throne-panel flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Icon.settings className="h-4 w-4 text-[#e9dfc8]/40" />
            <h2 className="throne-heading flex-1 text-[16px]">{t('throne.lobby.council')}</h2>
            {!isHost && <span className="text-[11px] text-[#e9dfc8]/40">{t('throne.lobby.hostOnly')}</span>}
          </div>
          {[
            ['roundLimit', state.options.rounds, (v) => String(v), 'rounds'],
            ['target', state.options.targets, (v) => String(v), 'target'],
            ['turnSec', state.options.turnSec, clock, 'turnSec'],
          ].map(([key, values, format, label]) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-semibold text-[#f1e7cf]">{t(`throne.lobby.${label}`)}</p>
                <p className="text-[11.5px] text-[#e9dfc8]/45">{t(`throne.lobby.${label}Hint`)}</p>
              </div>
              {setting(key, values, format)}
            </div>
          ))}
        </section>

        <div className="throne-panel flex flex-wrap items-center gap-2 p-3">
          {!isHost && (
            <button type="button" onClick={() => actions.setReady(!me?.ready)} className={`throne-btn flex-1 py-3 text-[15px] ${me?.ready ? '' : 'throne-btn-gold'}`}>
              <Icon.check className="h-4 w-4" />
              {me?.ready ? t('mafia.cancelReady') : t('mafia.imReady')}
            </button>
          )}
          {isHost && (
            <>
              <button type="button" onClick={actions.start} disabled={!enough} className="throne-btn throne-btn-gold min-w-[200px] flex-1 py-3 text-[15px]">
                ⚔ {t('throne.lobby.start')}
                {!enough && <span className="text-[12px] opacity-70">({t('throne.lobby.needMore', { n: state.minPlayers - active.length })})</span>}
              </button>
              {!enough && <p className="w-full text-center text-[12px] text-[#e9dfc8]/45">{t('throne.lobby.needMoreLong', { n: state.minPlayers })}</p>}
            </>
          )}
        </div>
      </div>
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </div>
  );
}
