// CosmicGame.jsx
// The Cosmic Encounter table. Everything drawn here comes from the payload
// the server built for THIS player: other hands arrive only as counts,
// face-down encounter cards only as backs, deal cards only for the two
// sides of the deal. Every button names an intention; the server decides.

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import PlayerAvatar from '../PlayerAvatar';
import Modal from '../Modal';
import Icon from '../icons';
import RoomChat from '../chat/RoomChat';
import SocialBar from '../social/SocialBar';
import { SpectatorBanner, SpectatorStrip, SurrenderButton } from '../room/RoomStatus';
import { StyledName } from '../../cosmetics/Cosmetics';
import { useOutcomeEffects, useTurnSound } from '../../cosmetics/useGameCosmetics';
import CosmicBoard from './CosmicBoard';
import CosmicCard from './CosmicCard';
import { AlienBlurb } from './CosmicLobby';
import { AlienPortrait, ShipIcon, cosmicColor } from './cosmicArt';
import {
  cardLabel, cosmicLogText, destinyLabel, planetLabel,
} from './logFormat';

const PHASE_ORDER = ['START', 'REGROUP', 'DESTINY', 'LAUNCH', 'ALLIANCE', 'PLANNING', 'REVEAL', 'RESOLUTION'];
const ENCOUNTER_TYPES = ['attack', 'negotiate', 'morph'];

function useCountdown(endsAt) {
  const [left, setLeft] = useState(() => (endsAt ? Math.max(0, endsAt - Date.now()) : 0));
  useEffect(() => {
    if (!endsAt) { setLeft(0); return undefined; }
    setLeft(Math.max(0, endsAt - Date.now()));
    const id = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return Math.ceil(left / 1000);
}

const sum = (map) => Object.values(map || {}).reduce((s, n) => s + n, 0);
const avatarOf = (p) => ({ ...p, color: cosmicColor(p?.color).fill });

function Timer({ endsAt, t, big = false }) {
  const seconds = useCountdown(endsAt);
  if (!endsAt) return null;
  return (
    <span
      title={t('cosmic.timer')}
      className={`rounded-xl border px-2.5 py-1 font-display font-black tnum ${big ? 'text-[26px]' : 'text-[17px]'} ${seconds <= 10 ? 'animate-pulse border-rent-light/50 text-rent-light' : 'border-white/10 text-parch'}`}
    >
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}

function PlayerChip({ player, t, suffix }) {
  if (!player) return <span className="text-parch/40">—</span>;
  const c = cosmicColor(player.color);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40" style={{ backgroundColor: c.fill }} />
      <span className="truncate font-semibold" style={{ color: c.text }}>{player.nickname}</span>
      {player.isYou && <span className="text-[10.5px] text-parch/40">({t('waiting.you')})</span>}
      {suffix}
    </span>
  );
}

// --- header and phase track ----------------------------------------------------

function TopBar({
  state, onLeave, t, actions, spectating,
}) {
  const enc = state.encounter;
  const current = state.players.find((p) => p.id === state.turnPlayerId);
  const c = cosmicColor(current?.color);
  const phaseIndex = enc ? PHASE_ORDER.indexOf(enc.phase) : -1;
  return (
    <header className="panel flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[24px] leading-none" aria-hidden="true">🛸</span>
        <div className="min-w-0">
          <p className="section-label">{t('menu.cosmic.title')}</p>
          <h1 className="font-display text-[17px] font-black leading-tight text-parch">
            {state.phase === 'PLAY' && enc ? t(`cosmic.phase.${enc.phase}`) : t(`cosmic.gamePhase.${state.phase}`)}
            {state.phase === 'PLAY' && enc && <span className="text-parch/45"> · {t('cosmic.encounterNumber', { n: enc.number })}</span>}
          </h1>
        </div>
        {current && state.phase === 'PLAY' && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1" style={{ borderColor: `${c.fill}99`, backgroundColor: `${c.fill}26` }}>
            <span className="h-3 w-3 rounded-full ring-2 ring-black/30" style={{ backgroundColor: c.fill }} />
            <span className="text-[13.5px] font-bold text-parch">
              {current.isYou ? t('cosmic.yourTurn') : t('cosmic.nameTurn', { name: current.nickname })}
            </span>
          </div>
        )}
        <div className="flex-1" />
        <span className="pill hidden bg-white/[0.06] normal-case tracking-normal text-parch/70 sm:inline-flex">🏆 {t('cosmic.goal', { n: state.winColonies })}</span>
        <Timer endsAt={state.phaseEndsAt} t={t} />
        <SocialBar compact />
        {/* Giving up is in every mode where a player can be knocked out.
          It asks for a confirmation and then ends this player's game. */}
      {!spectating && actions?.surrender && state.phase !== 'GAME_OVER'
        && state.players.some((p) => p.isYou && !p.left) && (
        <SurrenderButton onSurrender={actions.surrender} />
      )}
      <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
      </div>
      {state.phase === 'PLAY' && enc && (
        <ol className="scrollbar-thin flex gap-1 overflow-x-auto pb-0.5" aria-label={t('cosmic.phaseTrack')}>
          {PHASE_ORDER.map((ph, i) => {
            const done = i < phaseIndex;
            const now = i === phaseIndex;
            return (
              <li
                key={ph}
                aria-current={now ? 'step' : undefined}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  now ? 'border-violet-300 bg-violet-500/30 text-white shadow-[0_0_0_2px_rgba(180,139,255,0.3)]'
                    : done ? 'border-white/10 bg-white/[0.04] text-parch/45' : 'border-white/[0.06] text-parch/35'
                }`}
              >
                <span className="tnum">{i + 1}</span>
                {done ? '✓ ' : ''}
                {t(`cosmic.phase.${ph}`)}
              </li>
            );
          })}
        </ol>
      )}
    </header>
  );
}

// --- the encounter at a glance --------------------------------------------------

function SideColumn({
  state, side, t,
}) {
  const enc = state.encounter;
  const mainId = side === 'offense' ? enc.aggressorId : enc.defenderId;
  const main = state.players.find((p) => p.id === mainId);
  const allies = Object.entries(enc.allies).filter(([, s]) => s === side).map(([id]) => state.players.find((p) => p.id === id));
  const shipsMain = side === 'offense'
    ? enc.gate[mainId] || 0
    : (state.planets.find((pl) => pl.id === enc.targetPlanetId)?.ships[mainId] || 0);
  const card = enc.cards[side];
  const eff = enc.effective?.[side];
  const tot = enc.totals?.[side];
  const reinf = enc.reinforcements.filter((r) => r.side === side);
  const won = enc.outcome && enc.outcome.type === side;
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border p-2.5 ${won ? 'border-go-light/60 bg-go/10' : side === 'offense' ? 'border-amber-300/25 bg-amber-400/[0.05]' : 'border-rose-300/25 bg-rose-400/[0.05]'}`}>
      <p className="section-label">{t(`cosmic.role.${side}`)}</p>
      {main ? (
        <div className="flex items-center gap-2">
          {main.alienId && <AlienPortrait id={main.alienId} className="h-8 w-8" rounded="rounded-lg" />}
          <div className="min-w-0 text-[13px]">
            <PlayerChip player={main} t={t} />
            <p className="flex items-center gap-1 text-[11.5px] text-parch/60">
              <ShipIcon color={main.color} className="h-3.5 w-4" />
              {t(side === 'offense' ? 'cosmic.shipsOnGate' : 'cosmic.shipsOnPlanet', { n: shipsMain })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-parch/40">{t('cosmic.notChosen')}</p>
      )}
      {allies.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11.5px]">
          {allies.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5 text-parch/70">
              <span className="text-parch/40">+</span>
              <PlayerChip player={a} t={t} />
              <span className="ml-auto inline-flex items-center gap-0.5 tnum"><ShipIcon color={a.color} className="h-3 w-3.5" />{(side === 'offense' ? enc.gate : enc.defense)[a.id] || 0}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        {card ? <CosmicCard card={card.hidden ? null : card} size="sm" /> : <div className="h-[4.6rem] w-[3.3rem] rounded-lg border border-dashed border-white/15" />}
        <div className="min-w-0 text-[11px] text-parch/55">
          {!card && t('cosmic.cardNotChosen')}
          {card?.hidden && t('cosmic.cardFaceDown')}
          {eff && (
            <p className="font-semibold text-parch/80">
              {t(`cosmic.card.${eff.type}`)}{eff.type === 'attack' ? ` ${eff.value}` : ''}
              {eff.morph ? ` (${t('cosmic.card.morph')})` : ''}
              {eff.controlled ? ` (${t('cosmic.artifact.emotionControl.name')})` : ''}
            </p>
          )}
          {reinf.length > 0 && <p>{t('cosmic.reinforcementsSum', { n: reinf.reduce((s, r) => s + r.value, 0) })}</p>}
          {tot && (
            <p className="font-display text-[20px] font-black leading-tight text-parch tnum" title={t('cosmic.totalBreakdown', tot)}>
              {tot.total}
              <span className="ml-1 text-[10.5px] font-normal text-parch/45">= {tot.card} + {tot.ships}{tot.reinforcements ? ` + ${tot.reinforcements}` : ''}{tot.tokens ? ` + ${tot.tokens}` : ''}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EncounterStrip({ state, t }) {
  const enc = state.encounter;
  if (!enc) return null;
  const planet = enc.targetPlanetId;
  return (
    <section className="panel flex flex-col gap-2 p-2.5 md:flex-row md:items-stretch">
      <SideColumn state={state} side="offense" t={t} />
      <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-2 text-center">
        <p className="section-label">{t('cosmic.destinyCard')}</p>
        <p className="text-[12.5px] font-semibold text-parch">{enc.destiny ? destinyLabel(enc.destiny, t) : '—'}</p>
        <p className="section-label mt-1">{t('cosmic.target')}</p>
        <p className="text-[12.5px] font-semibold text-amber-200">{planet ? planetLabel(planet, t) : '—'}</p>
        {enc.outcome && (
          <p className={`mt-1 rounded-full px-3 py-1 text-[12px] font-bold ${enc.outcome.type === 'offense' || (enc.outcome.type === 'deal' && enc.outcome.done) ? 'bg-go/25 text-go-light' : 'bg-white/10 text-parch/80'}`}>
            {t(`cosmic.outcome.${enc.outcome.type}${enc.outcome.type === 'deal' && enc.outcome.done !== undefined ? (enc.outcome.done ? '.done' : '.failed') : ''}`)}
          </p>
        )}
      </div>
      <SideColumn state={state} side="defense" t={t} />
    </section>
  );
}

// --- ship picker (launch and alliances) --------------------------------------------

function ShipPicker({
  state, selection, setSelection, limit, t,
}) {
  const ships = state.you?.legal?.ships || {};
  const total = sum(selection);
  const entries = Object.entries(ships);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] text-parch/60">
        {t('cosmic.shipsChosen', { n: total, max: limit })}
        <span className="ml-1 text-parch/40">· {t('cosmic.shipsPickHint')}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([planetId, n]) => {
          const chosen = selection[planetId] || 0;
          return (
            <span key={planetId} className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11.5px] ${chosen ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 bg-white/[0.04]'}`}>
              <span className="text-parch/75">{planetLabel(planetId, t)}</span>
              <span className="text-parch/40 tnum">({n})</span>
              <button type="button" disabled={!chosen} onClick={() => setSelection((s) => ({ ...s, [planetId]: chosen - 1 }))} className="flex h-5 w-5 items-center justify-center rounded bg-white/10 font-bold text-parch disabled:opacity-25" aria-label="−">−</button>
              <span className="w-3 text-center font-bold text-parch tnum">{chosen}</span>
              <button type="button" disabled={chosen >= n || total >= limit} onClick={() => setSelection((s) => ({ ...s, [planetId]: chosen + 1 }))} className="flex h-5 w-5 items-center justify-center rounded bg-white/10 font-bold text-parch disabled:opacity-25" aria-label="+">+</button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// --- the action panel: what this player can do right now ---------------------------------

function nameOf(state, id) {
  return state.players.find((p) => p.id === id)?.nickname || '…';
}

function ActionPanel({
  state, actions, t, ui, setUi,
}) {
  const enc = state.encounter;
  const you = state.you;
  if (!enc || !you || state.phase !== 'PLAY') return null;
  const isAggr = enc.aggressorId === you.id;
  const isDef = enc.defenderId === you.id;
  const legal = you.legal || {};
  const aggrName = nameOf(state, enc.aggressorId);
  const defName = nameOf(state, enc.defenderId);
  let body = null;
  let mine = false;

  const hint = (key, vars) => <p className="text-[13px] text-parch/70">{t(key, vars)}</p>;

  switch (enc.phase) {
    case 'START':
      if (isAggr) {
        mine = true;
        body = (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={actions.beginTurn} className="btn-primary px-5 py-2.5">▶ {t('cosmic.act.beginTurn')}</button>
            <span className="text-[12px] text-parch/50">{t('cosmic.hint.start')}</span>
          </div>
        );
      } else body = hint('cosmic.wait.START', { name: aggrName });
      break;
    case 'REGROUP': {
      const warpShips = state.warp?.[you.id] || 0;
      if (isAggr) {
        mine = true;
        body = warpShips > 0 && legal.regroupPlanets?.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-parch/80">{t('cosmic.hint.regroup', { n: warpShips })}</p>
            <div className="flex flex-wrap gap-1.5">
              {legal.regroupPlanets.map((id) => (
                <button key={id} type="button" onClick={() => actions.regroup(id)} className="btn-ghost px-2.5 py-1.5 text-[12px]">↩ {planetLabel(id, t)}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => actions.regroup(null)} className="btn-primary px-5 py-2.5">{t(warpShips ? 'cosmic.act.regroupGate' : 'cosmic.act.continue')}</button>
            <span className="text-[12px] text-parch/50">{t(warpShips ? 'cosmic.hint.regroupNoColony' : 'cosmic.hint.regroupEmpty')}</span>
          </div>
        );
      } else body = hint('cosmic.wait.REGROUP', { name: aggrName });
      break;
    }
    case 'DESTINY':
      if (!isAggr) {
        body = hint(enc.step === 'DRAW' ? 'cosmic.wait.DESTINY' : 'cosmic.wait.DESTINY_CHOICE', { name: aggrName });
        break;
      }
      mine = true;
      if (enc.step === 'DRAW') {
        body = (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={actions.drawDestiny} className="btn-primary px-5 py-2.5">🎴 {t('cosmic.act.drawDestiny')}</button>
            <span className="text-[12px] text-parch/50">{t('cosmic.hint.destiny')}</span>
          </div>
        );
      } else if (enc.step === 'CHOOSE_PLAYER') {
        body = (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-parch/80">{t(enc.destiny?.kind === 'wild' ? 'cosmic.hint.wild' : 'cosmic.hint.specialTie')}</p>
            <div className="flex flex-wrap gap-1.5">
              {enc.candidates.map((id) => (
                <button key={id} type="button" onClick={() => actions.chooseDefender(id)} className="btn-ghost px-3 py-1.5 text-[12.5px]">
                  <PlayerChip player={state.players.find((p) => p.id === id)} t={t} />
                </button>
              ))}
            </div>
          </div>
        );
      } else {
        const o = enc.ownOptions || { attack: [], restore: [] };
        body = (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-parch/80">{t('cosmic.hint.ownColor')}</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!o.attack.length} onClick={() => actions.ownColor('attack')} className="btn-ghost px-3 py-1.5 text-[12.5px]">⚔ {t('cosmic.act.ownAttack')}</button>
              <button type="button" disabled={!o.restore.length} onClick={() => actions.ownColor('restore')} className="btn-ghost px-3 py-1.5 text-[12.5px]">🏠 {t('cosmic.act.ownRestore')}</button>
              <button type="button" onClick={() => actions.ownColor('redraw')} className="btn-primary px-3 py-1.5 text-[12.5px]">🎴 {t('cosmic.act.redraw')}</button>
            </div>
          </div>
        );
      }
      break;
    case 'LAUNCH': {
      if (!isAggr) {
        body = hint('cosmic.wait.LAUNCH', { name: aggrName });
        break;
      }
      mine = true;
      const limit = Math.max(0, (legal.sendLimit || 4) - (legal.preloaded || 0));
      const planet = ui.target;
      const ownersHere = enc.launchMode === 'own' && planet
        ? Object.keys(state.planets.find((pl) => pl.id === planet)?.ships || {}).filter((id) => id !== you.id)
        : [];
      const total = sum(ui.selection);
      const ready = planet && (total >= 1 || legal.preloaded > 0) && (enc.launchMode !== 'own' || ui.defender);
      body = (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-parch/80">{t(`cosmic.hint.launch.${enc.launchMode}`, { name: defName })}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-parch/55">{t('cosmic.target')}:</span>
            {(legal.targets || []).map((id) => (
              <button key={id} type="button" onClick={() => setUi((u) => ({ ...u, target: id, defender: null }))} className={`rounded-lg border px-2 py-1 text-[12px] transition-colors ${planet === id ? 'border-amber-300 bg-amber-300/20 text-white' : 'border-white/10 bg-white/[0.04] text-parch/75 hover:bg-white/10'}`}>
                {planetLabel(id, t)}
              </button>
            ))}
          </div>
          {ownersHere.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-parch/55">{t('cosmic.whoseColony')}:</span>
              {ownersHere.map((id) => (
                <button key={id} type="button" onClick={() => setUi((u) => ({ ...u, defender: id }))} className={`rounded-lg border px-2 py-1 text-[12px] ${ui.defender === id ? 'border-rose-300 bg-rose-300/20' : 'border-white/10 bg-white/[0.04]'}`}>
                  <PlayerChip player={state.players.find((p) => p.id === id)} t={t} />
                </button>
              ))}
            </div>
          )}
          {limit > 0 ? (
            <ShipPicker state={state} selection={ui.selection} setSelection={(fn) => setUi((u) => ({ ...u, selection: fn(u.selection) }))} limit={limit} t={t} />
          ) : (
            <p className="text-[12px] text-parch/60">{t('cosmic.hint.preloaded', { n: legal.preloaded })}</p>
          )}
          <button type="button" disabled={!ready} onClick={() => actions.launch(planet, ui.selection, ui.defender)} className="btn-primary self-start px-5 py-2.5">
            🚀 {t('cosmic.act.launch', { n: total + (legal.preloaded || 0) })}
          </button>
        </div>
      );
      break;
    }
    case 'ALLIANCE': {
      const invitable = state.players.filter((p) => p.id !== enc.aggressorId && p.id !== enc.defenderId && !p.left);
      const mindPrompt = legal.mind?.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-fuchsia-500/10 px-2 py-1.5">
          <span className="text-[12px] text-fuchsia-100">🧠 {t('cosmic.alien.mind.power')}:</span>
          {legal.mind.map((id) => (
            <button key={id} type="button" onClick={() => actions.useMind(id)} className="btn-ghost px-2 py-1 text-[11.5px]">{t('cosmic.act.lookHand', { name: nameOf(state, id) })}</button>
          ))}
        </div>
      ) : null;
      if ((enc.step === 'INVITE_OFFENSE' && isAggr) || (enc.step === 'INVITE_DEFENSE' && isDef)) {
        mine = true;
        const chosen = ui.invites;
        body = (
          <div className="flex flex-col gap-2">
            {mindPrompt}
            <p className="text-[13px] text-parch/80">{t(`cosmic.hint.invite.${enc.step === 'INVITE_OFFENSE' ? 'offense' : 'defense'}`)}</p>
            {enc.step === 'INVITE_DEFENSE' && enc.invites.offense && (
              <p className="text-[12px] text-parch/50">{t('cosmic.offenseInvited', { names: enc.invites.offense.map((id) => nameOf(state, id)).join(', ') || t('cosmic.nobody') })}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {invitable.length === 0 && <span className="text-[12px] text-parch/45">{t('cosmic.nobodyToInvite')}</span>}
              {invitable.map((p) => {
                const on = chosen.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => setUi((u) => ({ ...u, invites: on ? u.invites.filter((x) => x !== p.id) : [...u.invites, p.id] }))} className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${on ? 'border-violet-300 bg-violet-500/30' : 'border-white/10 bg-white/[0.04] hover:bg-white/10'}`}>
                    <PlayerChip player={p} t={t} suffix={on ? <Icon.check className="h-3 w-3 text-violet-200" /> : null} />
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => actions.invite(chosen)} className="btn-primary self-start px-5 py-2.5">
              🤝 {chosen.length ? t('cosmic.act.invite', { n: chosen.length }) : t('cosmic.act.noAllies')}
            </button>
          </div>
        );
      } else if (enc.step === 'ACCEPT' && enc.responderId === you.id) {
        mine = true;
        const choices = legal.alliance || {};
        const limit = legal.sendLimit || 4;
        const total = sum(ui.selection);
        body = (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-parch/80">{t('cosmic.hint.accept', { offense: aggrName, defense: defName })}</p>
            <ShipPicker state={state} selection={ui.selection} setSelection={(fn) => setUi((u) => ({ ...u, selection: fn(u.selection) }))} limit={limit} t={t} />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!choices.offense || total < 1} onClick={() => actions.ally('offense', ui.selection)} className="btn-ghost border-amber-300/40 px-3 py-2 text-[12.5px]">⚔ {t('cosmic.act.joinOffense', { name: aggrName })}</button>
              <button type="button" disabled={!choices.defense || total < 1} onClick={() => actions.ally('defense', ui.selection)} className="btn-ghost border-rose-300/40 px-3 py-2 text-[12.5px]">🛡 {t('cosmic.act.joinDefense', { name: defName })}</button>
              <button type="button" onClick={() => actions.ally(null, {})} className="btn-quiet px-3 py-2 text-[12.5px]">{t('cosmic.act.declineBoth')}</button>
            </div>
          </div>
        );
      } else {
        body = (
          <div className="flex flex-col gap-1.5">
            {mindPrompt}
            {hint(`cosmic.wait.${enc.step}`, { name: enc.step === 'INVITE_DEFENSE' ? defName : enc.step === 'ACCEPT' ? nameOf(state, enc.responderId) : aggrName })}
          </div>
        );
      }
      break;
    }
    case 'PLANNING':
      if (enc.step === 'POWERS') {
        if (enc.power?.playerId === you.id) {
          mine = true;
          body = (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-parch/80">{t(`cosmic.powerPrompt.${enc.power.power}`, { name: nameOf(state, enc.aggressorId === you.id ? enc.defenderId : enc.aggressorId) })}</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => actions.usePower(enc.power.power, true)} className="btn-primary px-4 py-2">✨ {t('cosmic.act.usePower')}</button>
                <button type="button" onClick={() => actions.usePower(enc.power.power, false)} className="btn-ghost px-4 py-2">{t('cosmic.act.skipPower')}</button>
              </div>
            </div>
          );
        } else body = hint('cosmic.wait.POWERS', { name: nameOf(state, enc.power?.playerId) });
      } else if ((isAggr && !enc.chosen.offense) || (isDef && !enc.chosen.defense)) {
        mine = true;
        const oracleWait = enc.oracleId === you.id && !(isAggr ? enc.chosen.defense : enc.chosen.offense);
        const card = you.hand.find((c) => c.uid === ui.card);
        body = oracleWait ? hint('cosmic.hint.oracleWait') : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-parch/80">{card ? t('cosmic.hint.cardPicked', { card: cardLabel(card, t) }) : t('cosmic.hint.planning')}</p>
            <button type="button" disabled={!card || !ENCOUNTER_TYPES.includes(card.type)} onClick={() => { actions.selectCard(ui.card); setUi((u) => ({ ...u, card: null })); }} className="btn-primary px-5 py-2.5">
              🂠 {t('cosmic.act.playFaceDown')}
            </button>
          </div>
        );
      } else body = hint('cosmic.wait.SELECT', { offense: aggrName, defense: defName });
      break;
    case 'REVEAL': {
      const involved = [enc.aggressorId, enc.defenderId, ...Object.keys(enc.allies)].includes(you.id);
      const passed = !!enc.passes[you.id];
      if (involved) {
        mine = !passed;
        body = (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-parch/80">{t('cosmic.hint.reveal')}</p>
            <button type="button" disabled={passed} onClick={actions.pass} className="btn-primary px-5 py-2.5">
              {passed ? `✓ ${t('cosmic.act.passed')}` : t('cosmic.act.done')}
            </button>
          </div>
        );
      } else body = hint('cosmic.wait.REVEAL');
      break;
    }
    case 'RESOLUTION':
      if (enc.step === 'DEAL') body = hint('cosmic.hint.dealBelow');
      else if (enc.step === 'QUASH') {
        const passed = !!enc.passes[you.id];
        mine = !passed;
        body = (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-parch/80">{t('cosmic.hint.quash')}</p>
            <button type="button" disabled={passed} onClick={actions.pass} className="btn-primary px-4 py-2">{passed ? `✓ ${t('cosmic.act.passed')}` : t('cosmic.act.continue')}</button>
          </div>
        );
      } else if (enc.step === 'REWARDS') {
        const n = enc.rewards?.[you.id];
        if (n !== undefined) {
          mine = true;
          const cards = Math.min(ui.rewardCards ?? n, n);
          body = (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-parch/80">{t('cosmic.hint.rewards', { n })}</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[12.5px] text-parch/75">
                  <input type="range" min="0" max={n} value={cards} onChange={(e) => setUi((u) => ({ ...u, rewardCards: Number(e.target.value) }))} />
                  {t('cosmic.rewardsSplit', { cards, ships: n - cards })}
                </label>
                <button type="button" onClick={() => actions.rewards(cards)} className="btn-primary px-4 py-2">{t('cosmic.act.takeRewards')}</button>
              </div>
            </div>
          );
        } else body = hint('cosmic.wait.REWARDS');
      } else if (enc.step === 'CLONE') {
        if (enc.clone?.playerId === you.id) {
          mine = true;
          body = (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] text-parch/80">{t('cosmic.powerPrompt.clone')}</p>
              <button type="button" onClick={() => actions.clone(true)} className="btn-primary px-4 py-2">✨ {t('cosmic.act.keepCard')}</button>
              <button type="button" onClick={() => actions.clone(false)} className="btn-ghost px-4 py-2">{t('cosmic.act.discardCard')}</button>
            </div>
          );
        } else body = hint('cosmic.wait.CLONE', { name: nameOf(state, enc.clone?.playerId) });
      } else if (enc.step === 'FETCH') {
        if (enc.fetch?.fidoId === you.id) {
          mine = true;
          const others = state.players.filter((p) => p.id !== you.id && !p.left);
          body = (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-parch/80">{t('cosmic.powerPrompt.fido')}</p>
              <div className="flex flex-wrap gap-1.5">
                {(enc.discarded || []).map((c) => (
                  <CosmicCard key={c.uid} card={c} size="sm" selected={ui.fetchCard === c.uid} playable onClick={() => setUi((u) => ({ ...u, fetchCard: c.uid }))} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-parch/55">{t('cosmic.offerTo')}:</span>
                {others.map((p) => (
                  <button key={p.id} type="button" onClick={() => setUi((u) => ({ ...u, fetchTarget: p.id }))} className={`rounded-full border px-2 py-1 text-[12px] ${ui.fetchTarget === p.id ? 'border-violet-300 bg-violet-500/25' : 'border-white/10'}`}>
                    <PlayerChip player={p} t={t} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['card', 'ship'].map((r) => (
                  <button key={r} type="button" disabled={!ui.fetchCard || !ui.fetchTarget} onClick={() => actions.fetch({ cardUid: ui.fetchCard, targetId: ui.fetchTarget, reward: r })} className="btn-primary px-3 py-1.5 text-[12.5px]">
                    {t(`cosmic.act.fetchFor.${r}`)}
                  </button>
                ))}
                <button type="button" onClick={() => actions.fetch({})} className="btn-quiet px-3 py-1.5 text-[12.5px]">{t('cosmic.act.skipPower')}</button>
              </div>
            </div>
          );
        } else body = hint('cosmic.wait.FETCH', { name: nameOf(state, enc.fetch?.fidoId) });
      } else if (enc.step === 'FETCH_OFFER') {
        if (enc.fetch?.targetId === you.id) {
          mine = true;
          body = (
            <div className="flex flex-wrap items-center gap-2">
              {enc.fetch.card && <CosmicCard card={enc.fetch.card} size="sm" />}
              <p className="text-[13px] text-parch/80">{t('cosmic.hint.fetchOffer', { name: nameOf(state, enc.fetch.fidoId) })}</p>
              <button type="button" onClick={() => actions.fetchAnswer(true)} className="btn-success px-4 py-2">{t('cosmic.act.accept')}</button>
              <button type="button" onClick={() => actions.fetchAnswer(false)} className="btn-ghost px-4 py-2">{t('cosmic.act.decline')}</button>
            </div>
          );
        } else body = hint('cosmic.wait.FETCH_OFFER', { name: nameOf(state, enc.fetch?.targetId) });
      } else if (enc.step === 'NEXT') {
        if (isAggr) {
          mine = true;
          body = (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] text-parch/80">{t('cosmic.hint.next')}</p>
              <button type="button" onClick={() => actions.continueTurn(true)} className="btn-primary px-4 py-2">🚀 {t('cosmic.act.anotherEncounter')}</button>
              <button type="button" onClick={() => actions.continueTurn(false)} className="btn-ghost px-4 py-2">{t('cosmic.act.endTurn')}</button>
            </div>
          );
        } else body = hint('cosmic.wait.NEXT', { name: aggrName });
      }
      break;
    default:
      break;
  }

  return (
    <section className={`panel flex flex-col gap-1 p-3 ${mine ? 'border-violet-300/50 shadow-[0_0_0_1px_rgba(180,139,255,0.25)]' : ''}`}>
      <p className="section-label">{mine ? `✦ ${t('cosmic.yourMove')}` : t('cosmic.nextStep')}</p>
      {body}
    </section>
  );
}

// --- the hand ------------------------------------------------------------------------------

function HandPanel({
  state, actions, t, ui, setUi, onArtifact,
}) {
  const you = state.you;
  const enc = state.encounter;
  const [reinforcing, setReinforcing] = useState(null);
  if (!you) return null;
  const legalArtifacts = new Set(you.legal?.artifacts || []);
  const planning = enc?.phase === 'PLANNING' && enc.step === 'SELECT'
    && ((enc.aggressorId === you.id && !enc.chosen.offense) || (enc.defenderId === you.id && !enc.chosen.defense));
  const inWindow = enc?.phase === 'REVEAL' && enc.step === 'WINDOW'
    && [enc.aggressorId, enc.defenderId, ...Object.keys(enc.allies)].includes(you.id);
  const dealing = enc?.phase === 'RESOLUTION' && enc.step === 'DEAL' && [enc.aggressorId, enc.defenderId].includes(you.id);

  const order = { attack: 0, negotiate: 1, morph: 2, reinforcement: 3, artifact: 4 };
  const hand = [...you.hand].sort((a, b) => (order[a.type] - order[b.type]) || ((b.value || 0) - (a.value || 0)));

  return (
    <section className="panel p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="section-label flex-1">{t('cosmic.hand', { n: hand.length })}</p>
        {planning && <span className="pill bg-violet-500/25 normal-case tracking-normal text-violet-100">{t('cosmic.hint.pickEncounter')}</span>}
        {inWindow && <span className="pill bg-sky-500/25 normal-case tracking-normal text-sky-100">{t('cosmic.hint.reinforceNow')}</span>}
        {dealing && <span className="pill bg-emerald-500/25 normal-case tracking-normal text-emerald-100">{t('cosmic.hint.dealCards')}</span>}
      </div>
      {hand.length === 0 ? (
        <p className="py-3 text-center text-[12px] text-parch/40">{t('cosmic.emptyHand')}</p>
      ) : (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1.5 pt-2">
          {hand.map((card) => {
            const encounterCard = ENCOUNTER_TYPES.includes(card.type);
            let onClick;
            let playable = false;
            let disabled = false;
            let selected = false;
            if (planning) {
              if (encounterCard) {
                playable = true;
                selected = ui.card === card.uid;
                onClick = () => setUi((u) => ({ ...u, card: u.card === card.uid ? null : card.uid }));
              } else disabled = true;
            } else if (dealing) {
              playable = true;
              selected = ui.dealGive.includes(card.uid);
              onClick = () => setUi((u) => ({ ...u, dealGive: selected ? u.dealGive.filter((x) => x !== card.uid) : [...u.dealGive, card.uid] }));
            } else if (card.type === 'reinforcement' && inWindow) {
              playable = true;
              selected = reinforcing === card.uid;
              onClick = () => setReinforcing((r) => (r === card.uid ? null : card.uid));
            } else if (card.type === 'artifact' && legalArtifacts.has(card.uid)) {
              playable = true;
              onClick = () => onArtifact(card);
            }
            return (
              <CosmicCard
                key={card.uid}
                card={card}
                size="md"
                playable={playable}
                selected={selected}
                disabled={disabled}
                onClick={onClick}
                title={card.type === 'artifact' ? t(`cosmic.artifact.${card.artifact}.text`) : undefined}
              >
                {selected && card.type === 'reinforcement' && inWindow && (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => { actions.reinforce(card.uid, 'offense'); setReinforcing(null); }} className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink">⚔ {t('cosmic.role.offense')}</button>
                    <button type="button" onClick={() => { actions.reinforce(card.uid, 'defense'); setReinforcing(null); }} className="rounded bg-rose-400 px-1.5 py-0.5 text-[10px] font-bold text-ink">🛡 {t('cosmic.role.defense')}</button>
                  </span>
                )}
              </CosmicCard>
            );
          })}
        </div>
      )}
      {you.mindHand && (
        <div className="mt-2 rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/[0.07] p-2">
          <p className="mb-1 text-[11.5px] font-semibold text-fuchsia-100">🧠 {t('cosmic.mindSees', { name: nameOf(state, you.mindTarget) })}</p>
          <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
            {you.mindHand.map((c) => <CosmicCard key={c.uid} card={c} size="sm" />)}
          </div>
        </div>
      )}
    </section>
  );
}

// --- dialogs -----------------------------------------------------------------------------------

function ArtifactDialog({
  state, card, actions, onClose, t,
}) {
  const enc = state.encounter;
  const [targets, setTargets] = useState(() => Object.keys(enc?.allies || {}));
  const needsPlayer = card.artifact === 'cosmicZap' || card.artifact === 'plague';
  const players = state.players.filter((p) => !p.left && (card.artifact !== 'cosmicZap' || p.alienId));
  const play = (payload) => { actions.artifact(card.uid, payload); onClose(); };
  return (
    <Modal onClose={onClose} title={t(`cosmic.artifact.${card.artifact}.name`)} subtitle={t(`cosmic.artifact.${card.artifact}.text`)} icon={<span className="text-[18px]">✦</span>}>
      <div className="flex gap-3">
        <CosmicCard card={card} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {needsPlayer && (
            <>
              <p className="text-[13px] text-parch/70">{t('cosmic.chooseTarget')}</p>
              <div className="flex flex-wrap gap-1.5">
                {players.map((p) => (
                  <button key={p.id} type="button" onClick={() => play({ targetId: p.id })} className="btn-ghost px-2.5 py-1.5 text-[12.5px]">
                    <PlayerChip player={p} t={t} suffix={card.artifact === 'cosmicZap' && p.alienId ? <span className="text-parch/45">· {t(`cosmic.alien.${p.alienId}.name`)}</span> : null} />
                  </button>
                ))}
              </div>
            </>
          )}
          {card.artifact === 'forceField' && (
            <>
              <p className="text-[13px] text-parch/70">{t('cosmic.chooseAllies')}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(enc.allies).map((id) => {
                  const on = targets.includes(id);
                  return (
                    <button key={id} type="button" aria-pressed={on} onClick={() => setTargets((cur) => (on ? cur.filter((x) => x !== id) : [...cur, id]))} className={`rounded-full border px-2.5 py-1 text-[12px] ${on ? 'border-violet-300 bg-violet-500/25' : 'border-white/10'}`}>
                      <PlayerChip player={state.players.find((p) => p.id === id)} t={t} />
                    </button>
                  );
                })}
              </div>
              <button type="button" disabled={!targets.length} onClick={() => play({ targetIds: targets })} className="btn-primary self-start px-4 py-2">{t('cosmic.act.playArtifact')}</button>
            </>
          )}
          {!needsPlayer && card.artifact !== 'forceField' && (
            <button type="button" onClick={() => play({})} className="btn-primary self-start px-4 py-2">{t('cosmic.act.playArtifact')}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DealPanel({
  state, actions, t, ui, setUi,
}) {
  const enc = state.encounter;
  const you = state.you;
  const main = [enc.aggressorId, enc.defenderId].includes(you?.id);
  const opponentId = you?.id === enc.aggressorId ? enc.defenderId : enc.aggressorId;
  const opponent = state.players.find((p) => p.id === opponentId);
  const proposal = enc.deal?.proposal;
  const planets = state.planets;
  const colonyMeOptions = main ? planets.filter((pl) => pl.ships[opponentId] > 0 && !(pl.ships[you.id] > 0)) : [];
  const colonyOtherOptions = main ? planets.filter((pl) => pl.ships[you.id] > 0 && !(pl.ships[opponentId] > 0)) : [];
  const d = ui.deal;
  const setDeal = (patch) => setUi((u) => ({ ...u, deal: { ...u.deal, ...patch } }));
  const canPropose = ui.dealGive.length || d.take > 0 || d.colonyMe || d.colonyOther;

  const describe = (p) => {
    const byName = nameOf(state, p.by);
    const otherName = nameOf(state, p.by === enc.aggressorId ? enc.defenderId : enc.aggressorId);
    const parts = [];
    if (p.giveCount) parts.push(t('cosmic.deal.gives', { name: byName, n: p.giveCount, cards: p.give ? p.give.map((c) => cardLabel(c, t)).join(', ') : '' }));
    if (p.take) parts.push(t('cosmic.deal.takes', { name: byName, n: p.take, other: otherName }));
    if (p.colonyMe) parts.push(t('cosmic.deal.colony', { name: byName, planet: planetLabel(p.colonyMe, t) }));
    if (p.colonyOther) parts.push(t('cosmic.deal.colony', { name: otherName, planet: planetLabel(p.colonyOther, t) }));
    return parts;
  };

  return (
    <section className="panel animate-slide-up border-emerald-300/40 p-3 shadow-[0_0_0_1px_rgba(127,240,180,0.2)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-display text-[17px] font-bold text-parch">🤝 {t('cosmic.deal.title')}</p>
        <span className="flex-1 text-[12px] text-parch/55">{t('cosmic.deal.rules')}</span>
        <Timer endsAt={state.phaseEndsAt} t={t} big />
      </div>

      {proposal ? (
        <div className="mb-2 rounded-xl bg-black/25 p-2.5">
          <p className="section-label mb-1">{t('cosmic.deal.onTable', { name: nameOf(state, proposal.by) })}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-parch/85">
            {describe(proposal).map((line) => <li key={line}>{line}</li>)}
          </ul>
          {main && proposal.by !== you.id && (
            <button type="button" onClick={() => actions.acceptDeal(proposal.id)} className="btn-success mt-2 px-5 py-2">✓ {t('cosmic.deal.accept')}</button>
          )}
          {main && proposal.by === you.id && <p className="mt-1 text-[11.5px] text-parch/45">{t('cosmic.deal.waiting', { name: opponent?.nickname })}</p>}
        </div>
      ) : (
        <p className="mb-2 text-[12.5px] text-parch/55">{t('cosmic.deal.noOffer')}</p>
      )}

      {main ? (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <p className="section-label mb-1">{t('cosmic.deal.cards')}</p>
            <p className="text-[12px] text-parch/65">{t('cosmic.deal.giveHint', { n: ui.dealGive.length })}</p>
            <label className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-parch/75">
              {t('cosmic.deal.takeRandom', { name: opponent?.nickname })}
              <input type="number" min="0" max={Math.min(10, opponent?.handCount || 0)} value={d.take} onChange={(e) => setDeal({ take: Math.max(0, Math.min(Math.min(10, opponent?.handCount || 0), Number(e.target.value) || 0)) })} className="field w-16 py-1 text-center" />
            </label>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <p className="section-label mb-1">{t('cosmic.deal.colonies')}</p>
            <label className="flex flex-col gap-1 text-[12px] text-parch/70">
              {t('cosmic.deal.colonyMe', { name: opponent?.nickname })}
              <select value={d.colonyMe || ''} onChange={(e) => setDeal({ colonyMe: e.target.value || null })} className="field py-1">
                <option value="">{t('cosmic.deal.none')}</option>
                {colonyMeOptions.map((pl) => <option key={pl.id} value={pl.id}>{planetLabel(pl.id, t)}</option>)}
              </select>
            </label>
            <label className="mt-1.5 flex flex-col gap-1 text-[12px] text-parch/70">
              {t('cosmic.deal.colonyOther', { name: opponent?.nickname })}
              <select value={d.colonyOther || ''} onChange={(e) => setDeal({ colonyOther: e.target.value || null })} className="field py-1">
                <option value="">{t('cosmic.deal.none')}</option>
                {colonyOtherOptions.map((pl) => <option key={pl.id} value={pl.id}>{planetLabel(pl.id, t)}</option>)}
              </select>
            </label>
            <p className="mt-1 text-[11px] text-parch/40">{t('cosmic.deal.shipsNote')}</p>
          </div>
          <button
            type="button"
            disabled={!canPropose}
            onClick={() => actions.proposeDeal({
              give: ui.dealGive, take: d.take, colonyMe: d.colonyMe, colonyOther: d.colonyOther, shipsMe: 4, shipsOther: 4,
            })}
            className="btn-primary px-5 py-2.5 md:col-span-2"
          >
            📨 {t('cosmic.deal.propose')}
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-parch/50">{t('cosmic.deal.spectator', { offense: nameOf(state, enc.aggressorId), defense: nameOf(state, enc.defenderId) })}</p>
      )}
    </section>
  );
}

function AlienChoice({ state, actions, t }) {
  const you = state.you;
  const waiting = state.players.filter((p) => !p.hasChosenAlien);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-3xl animate-scale-in rounded-2xl border border-white/12 bg-[#0d0b22]/95 p-5 shadow-deep">
        <p className="section-label text-center">{t('cosmic.chooseAlien.label')}</p>
        <h2 className="text-center font-display text-[26px] font-black text-parch">{t('cosmic.chooseAlien.title')}</h2>
        <p className="mb-4 text-center text-[12.5px] text-parch/55">{t('cosmic.chooseAlien.hint')}</p>
        {you?.alienOptions && !you.alienId ? (
          <div className="grid gap-3 md:grid-cols-2">
            {you.alienOptions.map((id) => (
              <button key={id} type="button" onClick={() => actions.chooseAlien(id)} className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-all hover:-translate-y-1 hover:border-violet-300/60 hover:bg-violet-500/10">
                <AlienBlurb id={id} t={t} />
                <span className="btn-primary pointer-events-none self-start px-4 py-2">{t('cosmic.chooseAlien.pick')}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {you?.alienId && <div className="w-full max-w-md rounded-2xl border border-violet-300/30 bg-violet-500/10 p-4"><AlienBlurb id={you.alienId} t={t} /></div>}
            <p className="text-[13px] text-parch/60">{t('cosmic.chooseAlien.waiting', { names: waiting.map((p) => p.nickname).join(', ') })}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function GameOver({
  state, actions, onLeave, t,
}) {
  const { standings, winnerIds } = state.results;
  const isHost = !!state.you?.isHost;
  const [hidden, setHidden] = useState(false);
  const youWon = winnerIds.includes(state.you?.id);
  useOutcomeEffects(state.you ? (youWon ? 'win' : 'loss') : null, `cosmic-${winnerIds.join(',')}-${state.turnCount}`);
  const cosmeticsOf = (id) => state.players.find((p) => p.id === id)?.cosmetics;
  if (hidden) {
    return (
      <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
        <button type="button" onClick={() => setHidden(false)} className="btn-primary px-5 py-3 shadow-deep">🏆 {t('cosmic.showResults')}</button>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-white/12 bg-[#0d0b22]/95 p-5 shadow-deep">
        <div className="mb-4 text-center">
          <p className="section-label">{t('cosmic.gameOver')}</p>
          <h2 className="font-display text-[28px] font-black leading-tight text-brass-light">
            🏆 {winnerIds.length > 1 ? t('cosmic.sharedWin', { names: winnerIds.map((id) => nameOf(state, id)).join(', ') }) : t('cosmic.winner', { name: nameOf(state, winnerIds[0]) })}
          </h2>
        </div>
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-white/[0.04] text-[10.5px] uppercase tracking-wide text-parch/45">
                <th className="px-2 py-2 text-left">{t('cosmic.player')}</th>
                <th className="px-2 text-left">{t('cosmic.race')}</th>
                <th className="px-2 text-right">{t('cosmic.foreignColonies')}</th>
                <th className="px-2 text-right">{t('cosmic.homeColonies')}</th>
                <th className="px-2 text-right">{t('cosmic.warp')}</th>
                <th className="px-2 text-right">{t('cosmic.encountersWon')}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.playerId} className={`border-t border-white/[0.05] ${s.winner ? 'bg-brass/10' : ''}`}>
                  <td className="max-w-[12rem] px-2 py-2 font-semibold text-parch">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cosmicColor(s.color).fill }} />
                      <StyledName nickname={s.nickname} cosmetics={cosmeticsOf(s.playerId)} />
                      {s.winner && ' 🏆'}
                    </span>
                  </td>
                  <td className="px-2 text-parch/70">{s.alienId ? t(`cosmic.alien.${s.alienId}.name`) : '—'}</td>
                  <td className="px-2 text-right text-[15px] font-bold text-brass-light tnum">{s.foreignColonies}</td>
                  <td className="px-2 text-right tnum text-parch/75">{s.homeColonies}</td>
                  <td className="px-2 text-right tnum text-parch/75">{s.warp}</td>
                  <td className="px-2 text-right tnum text-parch/75">{s.wins}/{s.encounters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isHost ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => actions.restart(true)} className="btn-primary py-3">🛸 {t('mafia.newGame')}</button>
            <button type="button" onClick={() => actions.restart(false)} className="btn-ghost py-3"><Icon.settings className="h-4 w-4" />{t('mafia.changeSettings')}</button>
          </div>
        ) : (
          <p className="mt-4 text-center text-[12px] text-parch/45">{t('mafia.waitingForHost')}</p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setHidden(true)} className="btn-quiet py-2.5">🌌 {t('cosmic.viewBoard')}</button>
          <button type="button" onClick={onLeave} className="btn-quiet py-2.5">{t('mafia.backToMenu')}</button>
        </div>
      </div>
    </div>
  );
}

// --- side panels -------------------------------------------------------------------------------

function PlayersPanel({ state, t }) {
  const enc = state.encounter;
  const ordered = state.order?.length ? state.order.map((id) => state.players.find((p) => p.id === id)).filter(Boolean) : state.players;
  return (
    <section className="panel p-3">
      <p className="section-label mb-2">{t('cosmic.players')}</p>
      <ul className="flex flex-col gap-1.5">
        {ordered.map((p) => {
          const c = cosmicColor(p.color);
          const role = enc?.aggressorId === p.id ? 'offense' : enc?.defenderId === p.id ? 'defense' : enc?.allies?.[p.id] ? `ally.${enc.allies[p.id]}` : null;
          return (
            <li key={p.id} className={`relative overflow-hidden rounded-xl border py-2 pl-3 pr-2.5 ${p.isCurrent ? 'border-violet-300/70 bg-violet-500/10' : 'border-white/[0.07] bg-white/[0.025]'}`}>
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: c.fill }} />
              <div className="flex items-center gap-2">
                {p.alienId ? <AlienPortrait id={p.alienId} className="h-9 w-9" rounded="rounded-lg" /> : <PlayerAvatar player={avatarOf(p)} sizeClassName="h-9 w-9" ringClassName="ring-2 ring-white/20" />}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[13px] font-semibold text-parch">
                    <StyledName nickname={p.nickname} cosmetics={p.cosmetics} />
                    {p.isYou && <span className="text-[10.5px] font-normal text-parch/40">({t('waiting.you')})</span>}
                    {p.isHost && <Icon.crown className="h-3.5 w-3.5 shrink-0 text-brass" />}
                  </p>
                  <p className="truncate text-[11px]" style={{ color: c.text }} title={p.alienId ? t(`cosmic.alien.${p.alienId}.text`) : ''}>
                    {p.alienId ? t(`cosmic.alien.${p.alienId}.name`) : t('cosmic.alienHidden')}
                    {p.alienId && !p.powerActive && <span className="text-parch/45"> · {p.frozen ? t('cosmic.powerFrozen') : t('cosmic.powerLost')}</span>}
                    {p.tokens > 0 && <span className="text-parch/55"> · {t('cosmic.tokens', { n: p.tokens })}</span>}
                  </p>
                </div>
                <div className="text-right" title={t('cosmic.foreignColonies')}>
                  <p className="font-display text-[22px] font-black leading-none tnum" style={{ color: c.text }}>{p.foreignColonies}</p>
                  <p className="text-[9.5px] uppercase tracking-wide text-parch/40">/ {state.winColonies}</p>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-parch/60 tnum">
                <span title={t('cosmic.handCount')}>🂠 {p.handCount}</span>
                <span className="inline-flex items-center gap-0.5" title={t('cosmic.warpCount')}><ShipIcon color={p.color} className="h-3 w-3.5" />{t('cosmic.inWarpShort', { n: p.warp })}</span>
                <span title={t('cosmic.homeColonies')}>🏠 {p.homeColonies}/5</span>
                {role && <span className={`pill normal-case tracking-normal ${role === 'offense' ? 'bg-amber-400/25 text-amber-100' : role === 'defense' ? 'bg-rose-400/25 text-rose-100' : 'bg-white/10 text-parch/80'}`}>{t(`cosmic.role.${role}`)}</span>}
                {p.left ? <span className="pill bg-white/[0.06] text-parch/40">{t('cosmic.left')}</span> : !p.connected && <span className="pill bg-white/[0.06] text-parch/40">{t('waiting.offline')}</span>}
              </div>
              <div className="mt-1.5 flex h-1.5 gap-0.5">
                {Array.from({ length: state.winColonies }).map((_, i) => (
                  <span key={i} className="flex-1 rounded-full" style={{ backgroundColor: i < p.foreignColonies ? c.fill : 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DecksPanel({ state, t }) {
  const d = state.decks;
  return (
    <section className="panel grid grid-cols-2 gap-2 p-3">
      <div>
        <p className="section-label mb-1">{t('cosmic.cosmicDeck')}</p>
        <div className="flex items-center gap-2">
          <CosmicCard card={null} size="sm" />
          <div className="text-[11.5px] text-parch/60">
            <p className="tnum">{t('cosmic.cardsLeft', { n: d.cosmic })}</p>
            <p className="tnum">{t('cosmic.discardCount', { n: d.cosmicDiscard })}</p>
            {d.cosmicTop && <p className="truncate text-parch/45">{cardLabel(d.cosmicTop, t)}</p>}
          </div>
        </div>
      </div>
      <div>
        <p className="section-label mb-1">{t('cosmic.destinyDeck')}</p>
        <div className="text-[11.5px] text-parch/60">
          <p className="tnum">{t('cosmic.cardsLeft', { n: d.destiny })}</p>
          <p className="tnum">{t('cosmic.discardCount', { n: d.destinyDiscard })}</p>
          {d.destinyTop && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-parch/80">
              {d.destinyTop.kind === 'color' && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cosmicColor(d.destinyTop.color).fill }} />}
              {destinyLabel(d.destinyTop, t)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SidePanel({
  state, chat, actions, t,
}) {
  const [tab, setTab] = useState('log');
  const [seen, setSeen] = useState(chat.length);
  const ref = useRef(null);
  useEffect(() => { if (tab === 'chat') setSeen(chat.length); }, [tab, chat.length]);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [state.log.length, tab]);
  const unread = Math.max(0, chat.length - seen);
  const me = state.players.find((p) => p.isYou);
  return (
    <section className="panel flex h-[22rem] shrink-0 flex-col overflow-hidden p-0 lg:h-auto lg:min-h-[16rem] lg:flex-1">
      <div className="flex shrink-0 border-b border-white/[0.07]">
        {['log', 'chat'].map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${tab === id ? 'border-b-2 border-violet-400 text-parch' : 'text-parch/45 hover:text-parch/75'}`}>
            {id === 'log' ? `📜 ${t('cosmic.logTitle')}` : `💬 ${t('cosmic.chat')}`}
            {id === 'chat' && unread > 0 && tab !== 'chat' && <span className="rounded-full bg-rent px-1.5 text-[10px] text-white">{unread}</span>}
          </button>
        ))}
      </div>
      {tab === 'log' ? (
        <ul ref={ref} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {state.log.map((e, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={`${e.ts}-${i}`} className="flex gap-2 py-[3px] text-[11.5px] leading-snug text-parch/70">
              <span className="w-5 shrink-0 text-right text-parch/25 tnum">{e.turn || '·'}</span>
              <span>{cosmicLogText(e, t)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <RoomChat messages={chat} onSend={actions.sendChat} players={state.players} myPlayerId={me?.id} renderSystem={(m) => t(`cosmic.system.${m.type}`, m.params)} nameTone={() => 'text-violet-200'} />
        </div>
      )}
    </section>
  );
}

// --- the table ------------------------------------------------------------------------------------

const EMPTY_UI = {
  target: null, defender: null, selection: {}, invites: [], card: null, dealGive: [], deal: { take: 0, colonyMe: null, colonyOther: null }, rewardCards: null, fetchCard: null, fetchTarget: null,
};

export default function CosmicGame({
  state, chat, actions, onLeave, spectating,
}) {
  const { t } = useTranslation();
  const [ui, setUi] = useState(EMPTY_UI);
  const [artifactCard, setArtifactCard] = useState(null);
  const enc = state.encounter;
  const you = state.you;
  const stepKey = enc ? `${state.turnCount}:${enc.number}:${enc.phase}:${enc.step}:${enc.acceptIndex ?? ''}:${enc.power?.power || ''}` : state.phase;

  // A new step starts with a clean selection.
  useEffect(() => { setUi(EMPTY_UI); }, [stepKey]);

  const myMove = !!state.players.find((p) => p.isYou)?.isCurrent;
  useTurnSound(myMove);

  const isAggr = enc?.aggressorId === you?.id;
  const launching = state.phase === 'PLAY' && enc?.phase === 'LAUNCH' && isAggr;
  const accepting = state.phase === 'PLAY' && enc?.phase === 'ALLIANCE' && enc.step === 'ACCEPT' && enc.responderId === you?.id;
  const regrouping = state.phase === 'PLAY' && enc?.phase === 'REGROUP' && isAggr && (state.warp?.[you?.id] || 0) > 0;
  const limit = launching ? Math.max(0, (you.legal.sendLimit || 4) - (you.legal.preloaded || 0)) : (you?.legal?.sendLimit || 4);

  const clickablePlanets = useMemo(() => {
    if (launching) return you.legal.targets || [];
    if (regrouping) return you.legal.regroupPlanets || [];
    return [];
  }, [launching, regrouping, you]);

  const onPlanet = (planetId) => {
    if (launching) setUi((u) => ({ ...u, target: planetId, defender: null }));
    else if (regrouping) actions.regroup(planetId);
  };
  const onStack = (planetId) => {
    setUi((u) => {
      const have = you.legal.ships?.[planetId] || 0;
      const chosen = u.selection[planetId] || 0;
      if (chosen >= have || Object.values(u.selection).reduce((s, n) => s + n, 0) >= limit) return u;
      return { ...u, selection: { ...u.selection, [planetId]: chosen + 1 } };
    });
  };

  return (
    <div className="table-cosmic flex min-h-screen flex-col lg:h-[100dvh] lg:min-h-0">
      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 px-3 py-3 lg:min-h-0 4xl:max-w-[2500px]">
        <TopBar state={state} onLeave={onLeave} t={t} actions={actions} spectating={spectating} />
        {spectating && <SpectatorBanner onLeave={onLeave} />}
        <SpectatorStrip spectators={state.spectators} />
        <div className="grid flex-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr),23rem] 3xl:grid-cols-[minmax(0,1fr),27rem]">
          <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
            <div className="relative h-[58vh] min-h-[320px] lg:h-auto lg:min-h-[260px] lg:flex-1">
              {state.planets.length > 0 && (
                <CosmicBoard
                  state={state}
                  t={t}
                  clickablePlanets={clickablePlanets}
                  selection={launching || accepting ? ui.selection : {}}
                  stackClickable={launching || accepting}
                  onPlanet={onPlanet}
                  onStack={onStack}
                />
              )}
            </div>
            {state.phase === 'PLAY' && enc && enc.phase !== 'START' && enc.phase !== 'REGROUP' && <EncounterStrip state={state} t={t} />}
            {state.phase === 'PLAY' && enc?.phase === 'RESOLUTION' && enc.step === 'DEAL' && <DealPanel state={state} actions={actions} t={t} ui={ui} setUi={setUi} />}
            <ActionPanel state={state} actions={actions} t={t} ui={ui} setUi={setUi} />
            <HandPanel state={state} actions={actions} t={t} ui={ui} setUi={setUi} onArtifact={setArtifactCard} />
          </div>
          <aside className="scrollbar-thin flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
            <PlayersPanel state={state} t={t} />
            <DecksPanel state={state} t={t} />
            <SidePanel state={state} chat={chat} actions={actions} t={t} />
          </aside>
        </div>
      </div>

      {state.phase === 'ALIENS' && <AlienChoice state={state} actions={actions} t={t} />}
      {artifactCard && <ArtifactDialog state={state} card={artifactCard} actions={actions} onClose={() => setArtifactCard(null)} t={t} />}
      {state.phase === 'GAME_OVER' && state.results && <GameOver state={state} actions={actions} onLeave={onLeave} t={t} />}
    </div>
  );
}
