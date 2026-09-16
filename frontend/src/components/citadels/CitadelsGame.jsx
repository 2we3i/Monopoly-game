// CitadelsGame.jsx
// The Citadels table. Everything drawn here comes from the payload the
// server built for THIS player: other hands arrive only as counts, other
// roles only once the engine has called them, the draft pool only on your
// own pick. The buttons send intentions; the server decides the outcome.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useCitadelsConfig } from '../../hooks/useCitadels';
import PlayerAvatar from '../PlayerAvatar';
import Modal from '../Modal';
import Icon from '../icons';
import DistrictCard from './DistrictCard';
import {
  ROLE_GLYPH, TYPE_COLORS, TYPE_ORDER, TypeIcon,
} from './citadelsArt';
import { SEAT_COLORS } from './CitadelsLobby';
import { formatCitadelsLog } from './logFormat';
import RoomChat from '../chat/RoomChat';
import SocialBar from '../social/SocialBar';
import { SpectatorBanner, SpectatorStrip, SurrenderButton } from '../room/RoomStatus';
import { StyledName, VictoryMark, useLook } from '../../cosmetics/Cosmetics';
import { useOutcomeEffects, useTurnSound } from '../../cosmetics/useGameCosmetics';

function SeatVictoryMark({ cosmetics, place }) {
  const look = useLook(cosmetics);
  return <VictoryMark item={look.tokenVictory} place={place} />;
}

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

function useLookup(config, language) {
  return useMemo(() => {
    const roles = Object.fromEntries((config?.roles || []).map((r) => [r.id, r]));
    const districts = Object.fromEntries((config?.districts || []).map((d) => [d.id, d]));
    return {
      roles,
      roleOrder: config?.roleOrder || [],
      roleName: (id) => (roles[id] ? roles[id].name[language] || roles[id].name.en : id),
      roleText: (id) => (roles[id] ? roles[id].text[language] || roles[id].text.en : ''),
      district: (id) => districts[id] || null,
      districtName: (id) => (districts[id] ? districts[id].name[language] || districts[id].name.en : id),
    };
  }, [config, language]);
}

function TopBar({
  state, onLeave, t, actions, spectating,
}) {
  const seconds = useCountdown(state.phaseEndsAt);
  const lastRound = state.players.some((p) => p.completed) && state.phase !== 'GAME_OVER';
  return (
    <header className="panel flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="text-[26px]" aria-hidden="true">🏰</span>
      <div className="min-w-0 flex-1">
        <p className="section-label">{t('citadels.round', { n: Math.max(1, state.round) })} · {t('citadels.deck', { n: state.deckCount })}</p>
        <h1 className="font-display text-[20px] font-black leading-tight text-parch">{t(`citadels.phase.${state.phase}`)}</h1>
        {lastRound && <p className="text-[12px] font-semibold text-brass-light">🏁 {t('citadels.lastRound')}</p>}
      </div>
      {state.phaseEndsAt && (
        <div
          title={t('citadels.timer')}
          className={`rounded-xl border px-3 py-1.5 font-display text-[22px] font-black tnum ${seconds <= 10 ? 'animate-pulse border-rent-light/50 text-rent-light' : 'border-white/10 text-parch'}`}
        >
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </div>
      )}
      <SocialBar compact />
      {/* Giving up is in every mode where a player can be knocked out.
          It asks for a confirmation and then ends this player's game. */}
      {!spectating && actions?.surrender && state.phase !== 'GAME_OVER'
        && state.players.some((p) => p.isYou && !p.left) && (
        <SurrenderButton onSurrender={actions.surrender} />
      )}
      <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
    </header>
  );
}

const TRACK_STYLES = {
  pending: 'border-white/10 bg-white/[0.03] text-parch/65',
  faceUp: 'border-white/5 bg-black/30 text-parch/25',
  absent: 'border-white/5 bg-black/20 text-parch/35',
  called: 'border-go/40 bg-go/10 text-parch',
  current: 'border-brass-light bg-brass/20 text-parch shadow-[0_0_0_2px_rgba(227,187,92,0.35)]',
  killed: 'border-rent-light/50 bg-rent/20 text-rent-light',
};

// The calling order of every role this round - the "role order" indicator.
function RoleTrack({ state, lookup, t }) {
  const nameOf = (id) => state.players.find((p) => p.id === id)?.nickname || '';
  return (
    <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1" aria-label={t('citadels.trackLabel')}>
      {state.roleTrack.map((r) => (
        <div key={r.id} title={lookup.roleText(r.id)} className={`flex min-w-[100px] shrink-0 flex-col rounded-xl border px-2 py-1.5 ${TRACK_STYLES[r.state]}`}>
          <span className={`flex items-center gap-1 text-[11.5px] font-bold ${r.state === 'faceUp' ? 'line-through' : ''}`}>
            <span className="text-parch/40 tnum">{r.rank}</span>
            <span aria-hidden="true">{ROLE_GLYPH[r.id]}</span>
            <span className="truncate">{lookup.roleName(r.id)}</span>
          </span>
          <span className="truncate text-[10.5px] text-parch/50">
            {r.state === 'killed' && `💀 ${nameOf(r.playerId)}`}
            {(r.state === 'called' || r.state === 'current') && nameOf(r.playerId)}
            {['pending', 'faceUp', 'absent'].includes(r.state) && t(`citadels.track.${r.state}`)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlayerSeat({
  player, index, state, lookup, t, onOpenCity,
}) {
  let roleChip;
  if (player.role) {
    roleChip = <span className="pill bg-white/10 normal-case tracking-normal text-parch">{ROLE_GLYPH[player.role]} {lookup.roleName(player.role)}</span>;
  } else if (state.phase === 'DRAFT') {
    roleChip = player.hasPicked
      ? <span className="pill bg-go/15 normal-case tracking-normal text-go-light">✓ {t('citadels.picked')}</span>
      : <span className="pill bg-white/[0.06] normal-case tracking-normal text-parch/50">{t('citadels.choosing')}</span>;
  } else {
    roleChip = <span className="pill bg-white/[0.06] normal-case tracking-normal text-parch/40">❓ {t('citadels.hiddenRole')}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpenCity(player.id)}
      className={`panel flex min-w-[190px] shrink-0 flex-col gap-2 p-3 text-left transition-all hover:border-white/25 ${player.isCurrent ? 'ring-2 ring-brass-light/70' : ''} ${player.isYou ? 'border-brass/30' : ''}`}
    >
      <div className="flex items-center gap-2">
        <PlayerAvatar player={{ ...player, color: SEAT_COLORS[index % SEAT_COLORS.length] }} sizeClassName="h-9 w-9" ringClassName="ring-2 ring-white/15" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-parch">
            {player.crown && <span title={t('citadels.crown')}>👑 </span>}
            <StyledName nickname={player.nickname} cosmetics={player.cosmetics} />
            {player.isYou && <span className="ml-1 text-[10.5px] font-normal text-parch/40">({t('waiting.you')})</span>}
          </p>
          <p className="flex flex-wrap gap-x-2.5 text-[11.5px] text-parch/55 tnum">
            <span title={t('citadels.gold')}>🪙 {player.gold}</span>
            <span title={t('citadels.cards')}>🂠 {player.handCount}</span>
            <span title={t('citadels.districts')}>🏠 {player.city.length}/{state.settings.citySize}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {roleChip}
        {player.killed && <span className="pill bg-rent/30 text-rent-light">💀 {t('citadels.killed')}</span>}
        {player.robbed && <span className="pill bg-amber-500/20 text-amber-200">🎭 {t('citadels.robbed')}</span>}
        {player.completed && <span className="pill bg-go/25 text-go-light">🏁 {t('citadels.completed')}</span>}
        {player.isGuest && <span className="pill bg-white/[0.06] text-parch/40">{t('common.guest')}</span>}
        {!player.connected && <span className="pill bg-white/[0.06] text-parch/40">{t('waiting.offline')}</span>}
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-black/30">
        {player.city.map((c) => (
          <span key={c.uid} className="h-full flex-1" style={{ backgroundColor: TYPE_COLORS[lookup.district(c.districtId)?.type] }} />
        ))}
      </div>
    </button>
  );
}

function DraftPanel({
  state, lookup, actions, t,
}) {
  const { you } = state;
  const picker = state.players.find((p) => p.id === state.draft?.pickerId);
  return (
    <section className="panel p-4">
      {state.faceUp.length > 0 && (
        <p className="mb-3 text-[12px] text-parch/50">
          {t('citadels.faceUp')}: {state.faceUp.map((r) => `${ROLE_GLYPH[r]} ${lookup.roleName(r)}`).join(', ')}
        </p>
      )}
      {you?.canPick ? (
        <>
          <h2 className="font-display text-[19px] font-bold text-parch">{t('citadels.pickRole')}</h2>
          <p className="mb-3 text-[12.5px] text-parch/50">{t('citadels.pickRoleHint')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {you.draftOptions.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => actions.pick(id)}
                className="group flex flex-col gap-1 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-black/25 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brass-light/60 hover:bg-brass/10"
              >
                <span className="flex items-center justify-between">
                  <span className="text-[28px]" aria-hidden="true">{ROLE_GLYPH[id]}</span>
                  <span className="rounded-full bg-black/40 px-2 text-[11px] font-bold text-parch/60 tnum">{lookup.roles[id]?.rank}</span>
                </span>
                <span className="font-display text-[15px] font-bold text-parch">{lookup.roleName(id)}</span>
                <span className="text-[11.5px] leading-snug text-parch/55">{lookup.roleText(id)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-[14px] text-parch/80">{t('citadels.waitingPick', { name: picker?.nickname || '…' })}</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {state.draft.order.map((id, i) => {
              const p = state.players.find((x) => x.id === id);
              if (!p) return null;
              const tone = p.id === picker?.id ? 'bg-brass/30 text-brass-light' : p.hasPicked ? 'bg-go/20 text-go-light' : 'bg-white/[0.06] text-parch/50';
              return <span key={id} className={`pill normal-case tracking-normal ${tone}`}>{i + 1}. {p.nickname}</span>;
            })}
          </div>
          {you?.role && <p className="text-[12.5px] text-parch/60">{t('citadels.yourPick', { role: `${ROLE_GLYPH[you.role]} ${lookup.roleName(you.role)}` })}</p>}
        </div>
      )}
    </section>
  );
}

function chipClass(active) {
  return `pill cursor-pointer px-2.5 py-1.5 text-[12px] normal-case tracking-normal transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'bg-brass/40 text-parch' : 'bg-white/[0.07] text-parch/85 enabled:hover:bg-white/[0.14]'}`;
}

function AbilityPanel({
  state, lookup, actions, t, language,
}) {
  const { you } = state;
  const role = lookup.roles[you.role];
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  if (!role?.ability) return null;

  if (you.turn.abilityUsed) {
    return <span className="pill self-center bg-white/[0.06] normal-case tracking-normal text-parch/50">✓ {t('citadels.abilityUsed')}</span>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost px-3 py-2 text-[13px]">
        ✨ {t(`citadels.ability.${role.ability}`)}
      </button>
    );
  }

  const act = (payload) => {
    actions.ability(payload);
    setOpen(false);
    setSelected([]);
  };

  let body = null;
  if (role.ability === 'KILL_ROLE' || role.ability === 'ROB_ROLE') {
    const forbidden = role.ability === 'KILL_ROLE' ? ['ASSASSIN'] : ['ASSASSIN', 'THIEF'];
    body = (
      <>
        <p className="mb-2 text-[12px] text-parch/55">{t(`citadels.abilityHint.${role.ability}`)}</p>
        <div className="flex flex-wrap gap-1.5">
          {lookup.roleOrder.filter((id) => !forbidden.includes(id) && !state.faceUp.includes(id)).map((id) => (
            <button key={id} type="button" onClick={() => act({ targetRole: id })} className={chipClass(false)}>
              {ROLE_GLYPH[id]} {lookup.roleName(id)}
            </button>
          ))}
        </div>
      </>
    );
  } else if (role.ability === 'MAGIC') {
    const others = state.players.filter((p) => !p.isYou);
    body = (
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-[12px] text-parch/55">{t('citadels.magic.swapHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {others.map((p) => (
              <button key={p.id} type="button" onClick={() => act({ mode: 'SWAP', targetPlayerId: p.id })} className={chipClass(false)}>
                {p.nickname} · 🂠 {p.handCount}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[12px] text-parch/55">{t('citadels.magic.redrawHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {you.hand.map((c) => (
              <button
                key={c.uid}
                type="button"
                onClick={() => setSelected((cur) => (cur.includes(c.uid) ? cur.filter((u) => u !== c.uid) : [...cur, c.uid]))}
                className={chipClass(selected.includes(c.uid))}
              >
                {lookup.districtName(c.districtId)}
              </button>
            ))}
          </div>
          <button type="button" disabled={!selected.length} onClick={() => act({ mode: 'REDRAW', cardUids: selected })} className="btn-primary mt-2 px-3 py-1.5 text-[12px]">
            {t('citadels.magic.redraw', { n: selected.length })}
          </button>
        </div>
      </div>
    );
  } else if (role.ability === 'DESTROY') {
    body = (
      <div className="flex flex-col gap-2.5">
        <p className="text-[12px] text-parch/55">{t('citadels.abilityHint.DESTROY')}</p>
        {state.players.filter((p) => p.city.length > 0).map((p) => {
          const shielded = p.role === 'BISHOP' && !p.killed;
          const complete = p.city.length >= state.settings.citySize;
          return (
            <div key={p.id}>
              <p className="text-[12px] font-semibold text-parch/80">
                {p.nickname}
                {shielded && <span className="text-parch/45"> · {t('citadels.protected')}</span>}
                {complete && <span className="text-parch/45"> · {t('citadels.completed')}</span>}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.city.map((c) => {
                  const d = lookup.district(c.districtId);
                  if (!d) return null;
                  const wall = p.city.some((o) => o.uid !== c.uid && lookup.district(o.districtId)?.special?.wallTax);
                  const price = Math.max(0, d.cost - 1 + (wall ? 1 : 0));
                  const blocked = shielded || complete || d.special?.indestructible || price > you.gold;
                  return (
                    <button
                      key={c.uid}
                      type="button"
                      disabled={blocked}
                      onClick={() => act({ targetPlayerId: p.id, cardUid: c.uid })}
                      className={chipClass(false)}
                      style={{ boxShadow: `inset 3px 0 0 ${TYPE_COLORS[d.type]}` }}
                    >
                      {d.name[language] || d.name.en} · 🪙 {price}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 text-[13px] font-semibold text-parch">✨ {t(`citadels.ability.${role.ability}`)}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-parch/40 hover:text-parch" aria-label={t('common.close')}>✕</button>
      </div>
      {body}
    </div>
  );
}

function DistrictPowers({
  me, you, lookup, actions, t,
}) {
  const [labOpen, setLabOpen] = useState(false);
  const has = (id) => me.city.some((c) => c.districtId === id);
  const turn = you.turn;
  return (
    <>
      {has('SMITHY') && (
        <button
          type="button"
          disabled={turn.step !== 'ACTION' || turn.used.SMITHY || you.gold < 2}
          onClick={() => actions.useDistrict('SMITHY')}
          className="btn-ghost px-3 py-2 text-[13px]"
        >
          ⚒️ {t('citadels.useSmithy')}
        </button>
      )}
      {has('LABORATORY') && (labOpen ? (
        <div className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/25 p-2">
          <span className="text-[12px] text-parch/60">{t('citadels.labHint')}</span>
          {you.hand.map((c) => (
            <button key={c.uid} type="button" onClick={() => { actions.useDistrict('LABORATORY', c.uid); setLabOpen(false); }} className={chipClass(false)}>
              {lookup.districtName(c.districtId)}
            </button>
          ))}
          <button type="button" onClick={() => setLabOpen(false)} className="ml-auto text-parch/40 hover:text-parch" aria-label={t('common.close')}>✕</button>
        </div>
      ) : (
        <button
          type="button"
          disabled={turn.step !== 'ACTION' || turn.used.LABORATORY || you.hand.length === 0}
          onClick={() => setLabOpen(true)}
          className="btn-ghost px-3 py-2 text-[13px]"
        >
          ⚗️ {t('citadels.useLab')}
        </button>
      ))}
    </>
  );
}

function TurnPanel({
  state, me, lookup, actions, t, language,
}) {
  const { you, turn } = state;
  if (!turn) return null;
  const current = state.players.find((p) => p.id === turn.playerId);

  if (!you?.isYourTurn) {
    return (
      <section className="panel flex items-center gap-3 p-4">
        <span className="text-[30px]" aria-hidden="true">{ROLE_GLYPH[turn.roleId]}</span>
        <div className="min-w-0 flex-1">
          <p className="section-label">{t('citadels.nowPlaying')}</p>
          <p className="text-[15px] font-semibold text-parch">{lookup.roleName(turn.roleId)} — {current?.nickname}</p>
          <p className="text-[12px] text-parch/50">{t(`citadels.step.${turn.step}`)}</p>
        </div>
      </section>
    );
  }

  const my = you.turn;
  const role = lookup.roles[you.role];
  const incomeCount = role?.incomeType
    ? me.city.filter((c) => {
      const d = lookup.district(c.districtId);
      return d && (d.type === role.incomeType || d.special?.wildIncome);
    }).length
    : 0;

  return (
    <section className="panel flex flex-col gap-3 border-brass/40 p-4 shadow-[0_0_0_1px_rgba(227,187,92,0.18)]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[30px]" aria-hidden="true">{ROLE_GLYPH[you.role]}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[19px] font-bold text-parch">{t('citadels.yourTurn')} · {lookup.roleName(you.role)}</h2>
          <p className="text-[12px] text-parch/55">{lookup.roleText(you.role)}</p>
        </div>
        <button type="button" onClick={actions.endTurn} disabled={my.step !== 'ACTION'} className="btn-primary px-5 py-2.5">
          {t('citadels.endTurn')}
        </button>
      </div>

      {my.step === 'RESOURCE' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={actions.takeGold} className="btn-ghost flex-col gap-0.5 py-4 text-[14px]">
            <span className="text-[24px]" aria-hidden="true">🪙</span>
            {t('citadels.takeGold')}
            <span className="text-[11px] font-normal text-parch/45">{t('citadels.takeGoldHint')}</span>
          </button>
          <button type="button" onClick={actions.draw} className="btn-ghost flex-col gap-0.5 py-4 text-[14px]">
            <span className="text-[24px]" aria-hidden="true">🂠</span>
            {t('citadels.drawCards')}
            <span className="text-[11px] font-normal text-parch/45">{t('citadels.drawCardsHint')}</span>
          </button>
        </div>
      )}

      {my.step === 'CHOOSE' && you.drawn && (
        <div>
          <p className="mb-2 text-[13px] text-parch/70">{t('citadels.keepOne')}</p>
          <div className="flex flex-wrap gap-2">
            {you.drawn.map((c) => (
              <DistrictCard key={c.uid} district={lookup.district(c.districtId)} language={language} onClick={() => actions.keep(c.uid)} />
            ))}
          </div>
        </div>
      )}

      {my.step !== 'CHOOSE' && (
        <div className="flex flex-wrap items-start gap-2">
          {role?.incomeType && (
            <button type="button" onClick={actions.income} disabled={my.incomeTaken} className="btn-ghost px-3 py-2 text-[13px]">
              <TypeIcon type={role.incomeType} />
              {my.incomeTaken ? t('citadels.incomeTaken') : t('citadels.income', { n: incomeCount })}
            </button>
          )}
          <DistrictPowers me={me} you={you} lookup={lookup} actions={actions} t={t} />
          <AbilityPanel state={state} lookup={lookup} actions={actions} t={t} language={language} />
        </div>
      )}

      {you.secretTarget && (
        <p className="rounded-lg bg-rent/15 px-3 py-1.5 text-[12px] text-rent-light">🔒 {t('citadels.secretTarget', { role: lookup.roleName(you.secretTarget) })}</p>
      )}
      {my.step === 'ACTION' && <p className="text-[12px] text-parch/50">{t('citadels.buildHint', { left: Math.max(0, my.buildLimit - my.built) })}</p>}
    </section>
  );
}

function CityGrid({
  player, state, lookup, language, t,
}) {
  const types = new Set(player.city.map((c) => lookup.district(c.districtId)?.type));
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-black/30">
          <div className="h-full rounded-full bg-gradient-to-r from-brass to-brass-light" style={{ width: `${Math.min(100, (player.city.length / state.settings.citySize) * 100)}%` }} />
        </div>
        <div className="flex gap-1">
          {TYPE_ORDER.map((type) => (
            <span
              key={type}
              title={t(`citadels.type.${type}`)}
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${types.has(type) ? '' : 'opacity-25'}`}
              style={{ color: TYPE_COLORS[type], borderColor: `${TYPE_COLORS[type]}66` }}
            >
              <TypeIcon type={type} className="h-3 w-3" />
            </span>
          ))}
        </div>
      </div>
      {player.city.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-parch/40">{t('citadels.emptyCity')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {player.city.map((c) => <DistrictCard key={c.uid} district={lookup.district(c.districtId)} language={language} compact />)}
        </div>
      )}
    </>
  );
}

function HandPanel({
  state, me, lookup, actions, t, language,
}) {
  const { you } = state;
  const my = you.turn;
  const built = new Set(me.city.map((c) => c.districtId));
  return (
    <section className="panel p-3">
      <p className="section-label mb-2">{t('citadels.hand', { n: you.hand.length })}</p>
      {you.hand.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-parch/40">{t('citadels.emptyHand')}</p>
      ) : (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          {you.hand.map((c) => {
            const d = lookup.district(c.districtId);
            if (!d) return null;
            let reason = null;
            if (!you.isYourTurn) reason = t('citadels.cant.notTurn');
            else if (my.step !== 'ACTION') reason = t('citadels.cant.resourcesFirst');
            else if (my.built >= my.buildLimit) reason = t('citadels.cant.limit');
            else if (built.has(d.id)) reason = t('citadels.cant.duplicate');
            else if (d.cost > you.gold) reason = t('citadels.cant.gold', { n: d.cost - you.gold });
            return (
              <DistrictCard key={c.uid} district={d} language={language}>
                <button
                  type="button"
                  disabled={!!reason}
                  onClick={() => actions.build(c.uid)}
                  title={reason || ''}
                  className="mt-1 w-full rounded-md bg-brass px-1 py-1 text-[11px] font-bold text-ink transition-colors enabled:hover:bg-brass-light disabled:bg-white/[0.06] disabled:font-medium disabled:text-parch/40"
                >
                  {reason && you.isYourTurn ? reason : t('citadels.build')}
                </button>
              </DistrictCard>
            );
          })}
        </div>
      )}
    </section>
  );
}

function YouCard({
  state, me, lookup, t,
}) {
  const { you } = state;
  return (
    <section className="panel p-4">
      <p className="section-label">{t('citadels.yourRole')}</p>
      {you.role ? (
        <div className="mt-1.5 flex items-start gap-3">
          <span className="text-[34px] leading-none" aria-hidden="true">{ROLE_GLYPH[you.role]}</span>
          <div className="min-w-0">
            <p className="font-display text-[18px] font-bold text-parch">
              {lookup.roleName(you.role)} <span className="text-[12px] text-parch/40">#{lookup.roles[you.role]?.rank}</span>
            </p>
            <p className="text-[12px] leading-snug text-parch/55">{lookup.roleText(you.role)}</p>
            <p className="mt-1 text-[11px] text-parch/35">🔒 {t('citadels.roleSecretHint')}</p>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[13px] text-parch/50">{t('citadels.noRoleYet')}</p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-black/25 py-2">
          <p className="text-[19px] font-bold text-brass-light tnum">{you.gold}</p>
          <p className="text-[10px] uppercase tracking-wide text-parch/40">{t('citadels.gold')}</p>
        </div>
        <div className="rounded-xl bg-black/25 py-2">
          <p className="text-[19px] font-bold text-parch tnum">{you.hand.length}</p>
          <p className="text-[10px] uppercase tracking-wide text-parch/40">{t('citadels.cards')}</p>
        </div>
        <div className="rounded-xl bg-black/25 py-2">
          <p className="text-[19px] font-bold text-parch tnum">{me.city.length}/{state.settings.citySize}</p>
          <p className="text-[10px] uppercase tracking-wide text-parch/40">{t('citadels.districts')}</p>
        </div>
      </div>
    </section>
  );
}

function LogPanel({
  log, config, t, language,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);
  return (
    <section className="panel flex max-h-72 flex-col overflow-hidden p-0">
      <p className="section-label border-b border-white/[0.07] px-3 py-2">📜 {t('citadels.log')}</p>
      <ul ref={ref} className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        {log.map((entry, i) => (
          <li key={`${entry.ts}-${i}`} className="flex gap-2 py-[3px] text-[11.5px] leading-snug text-parch/65">
            <span className="shrink-0 text-parch/25 tnum">{entry.round || '·'}</span>
            <span>{formatCitadelsLog(entry, t, config, language)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChatPanel({
  chat, onSend, players, myPlayerId, t,
}) {
  return (
    <section className="panel flex h-[19rem] flex-col overflow-hidden 4xl:h-[30rem]">
      <RoomChat
        messages={chat}
        onSend={onSend}
        players={players}
        myPlayerId={myPlayerId}
        renderSystem={(m) => t(`citadels.system.${m.type}`, m.params)}
        nameTone={() => 'text-brass-light'}
        header={<p className="section-label shrink-0 border-b border-white/[0.07] px-3 py-2">💬 {t('citadels.chat')}</p>}
      />
    </section>
  );
}

function GameOver({
  state, lookup, actions, onLeave, t,
}) {
  const { standings } = state.results;
  const isHost = !!state.you?.isHost;
  const myId = state.players.find((p) => p.isYou)?.id;
  const myPlace = standings.findIndex((s) => s.playerId === myId) + 1;
  const podium = (myPlace === 2 && standings.length >= 3) || (myPlace === 3 && standings.length >= 4);
  useOutcomeEffects(myPlace ? (myPlace === 1 ? 'win' : podium ? 'podium' : 'loss') : null, `${state.round}-${standings[0]?.playerId}`);
  const cosmeticsOf = (id) => state.players.find((p) => p.id === id)?.cosmetics;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-white/12 bg-[#15110c]/95 p-5 shadow-deep">
        <div className="mb-4 text-center">
          <p className="section-label">{t('citadels.gameOver')}</p>
          <h2 className="font-display text-[30px] font-black leading-tight text-brass-light">👑 {t('citadels.winner', { name: standings[0]?.nickname })}</h2>
        </div>
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-white/[0.04] text-[10.5px] uppercase tracking-wide text-parch/45">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 text-left">{t('citadels.player')}</th>
                <th className="px-2 text-left">{t('citadels.role')}</th>
                <th className="px-2 text-right">{t('citadels.districts')}</th>
                <th className="px-2 text-right">{t('citadels.score.base')}</th>
                <th className="px-2 text-right">{t('citadels.score.diversity')}</th>
                <th className="px-2 text-right">{t('citadels.score.completion')}</th>
                <th className="px-2 text-right">{t('citadels.score.total')}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.playerId} className={`border-t border-white/[0.05] ${i === 0 ? 'bg-brass/10' : ''}`}>
                  <td className="px-2 py-2 text-parch/50">{i + 1}</td>
                  <td className="max-w-[14rem] px-2 font-semibold text-parch">
                    <span className="flex items-center gap-1">
                      <StyledName nickname={s.nickname} cosmetics={cosmeticsOf(s.playerId)} showTitle titleSize="xs" />
                      <SeatVictoryMark cosmetics={cosmeticsOf(s.playerId)} place={i + 1} />
                    </span>
                  </td>
                  <td className="px-2 text-parch/70">{ROLE_GLYPH[s.role]} {lookup.roleName(s.role)}</td>
                  <td className="px-2 text-right tnum text-parch/70">{s.buildings}</td>
                  <td className="px-2 text-right tnum text-parch/80">{s.base}</td>
                  <td className="px-2 text-right tnum text-parch/80">{s.diversity ? `+${s.diversity}` : '—'}</td>
                  <td className="px-2 text-right tnum text-parch/80">{s.completion ? `+${s.completion}` : '—'}</td>
                  <td className="px-2 text-right text-[15px] font-bold text-brass-light tnum">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-parch/40">{t('citadels.scoreHint')}</p>
        {isHost ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => actions.restart(true)} className="btn-primary py-3">🏰 {t('mafia.newGame')}</button>
            <button type="button" onClick={() => actions.restart(false)} className="btn-ghost py-3">
              <Icon.settings className="h-4 w-4" />
              {t('mafia.changeSettings')}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-[12px] text-parch/45">{t('mafia.waitingForHost')}</p>
        )}
        <button type="button" onClick={onLeave} className="btn-quiet mt-2 w-full py-2.5">{t('mafia.backToMenu')}</button>
      </div>
    </div>
  );
}

export default function CitadelsGame({
  state, chat, actions, onLeave, spectating,
}) {
  const { t, language } = useTranslation();
  const config = useCitadelsConfig();
  const lookup = useLookup(config, language);
  const [cityOfId, setCityOfId] = useState(null);
  const meNow = state.players.find((p) => p.isYou);
  useTurnSound((state.phase === 'TURNS' && !!meNow?.isCurrent) || (state.phase === 'DRAFT' && state.draft?.pickerId === meNow?.id));

  if (!config) {
    return (
      <div className="table-citadel flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-brass" />
      </div>
    );
  }

  const me = state.players.find((p) => p.isYou);
  const cityOf = state.players.find((p) => p.id === cityOfId);
  const cityOfIndex = state.players.findIndex((p) => p.id === cityOfId);

  return (
    <div className="table-citadel min-h-screen">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-4 3xl:max-w-[1760px] 4xl:max-w-[2360px] 4xl:gap-5 4xl:px-8 4xl:py-8 5xl:max-w-[3100px]">
        <TopBar state={state} onLeave={onLeave} t={t} actions={actions} spectating={spectating} />
        {spectating && <SpectatorBanner onLeave={onLeave} />}
        <SpectatorStrip spectators={state.spectators} />
        <RoleTrack state={state} lookup={lookup} t={t} />
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          {state.players.map((p, i) => (
            <PlayerSeat key={p.id} player={p} index={i} state={state} lookup={lookup} t={t} onOpenCity={setCityOfId} />
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr,21rem] 3xl:grid-cols-[1fr,26rem] 4xl:grid-cols-[1fr,36rem] 4xl:gap-5">
          <div className="flex min-w-0 flex-col gap-3">
            {state.phase === 'DRAFT' && <DraftPanel state={state} lookup={lookup} actions={actions} t={t} />}
            {state.phase === 'TURNS' && me && <TurnPanel state={state} me={me} lookup={lookup} actions={actions} t={t} language={language} />}
            {me && (
              <section className="panel p-3">
                <p className="section-label mb-2">{t('citadels.yourCity')} · {me.city.length}/{state.settings.citySize}</p>
                <CityGrid player={me} state={state} lookup={lookup} language={language} t={t} />
              </section>
            )}
            {state.you && me && <HandPanel state={state} me={me} lookup={lookup} actions={actions} t={t} language={language} />}
          </div>
          <div className="flex flex-col gap-3">
            {state.you && me && <YouCard state={state} me={me} lookup={lookup} t={t} />}
            <LogPanel log={state.log} config={config} t={t} language={language} />
            <ChatPanel chat={chat} onSend={actions.sendChat} players={state.players} myPlayerId={me?.id} t={t} />
          </div>
        </div>
      </div>

      {cityOf && (
        <Modal
          onClose={() => setCityOfId(null)}
          title={t('citadels.cityOf', { name: cityOf.nickname })}
          subtitle={`🪙 ${cityOf.gold} · 🂠 ${cityOf.handCount} · 🏠 ${cityOf.city.length}/${state.settings.citySize}`}
          icon={<PlayerAvatar player={{ ...cityOf, color: SEAT_COLORS[cityOfIndex % SEAT_COLORS.length] }} sizeClassName="h-8 w-8" ringClassName="" />}
          widthClass="max-w-3xl"
        >
          <CityGrid player={cityOf} state={state} lookup={lookup} language={language} t={t} />
        </Modal>
      )}

      {state.phase === 'GAME_OVER' && state.results && (
        <GameOver state={state} lookup={lookup} actions={actions} onLeave={onLeave} t={t} />
      )}
    </div>
  );
}
