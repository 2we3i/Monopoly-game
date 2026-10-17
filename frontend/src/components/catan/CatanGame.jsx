// CatanGame.jsx
// The Catan table. Everything drawn here comes from the payload the
// server built for THIS player: other hands arrive only as counts,
// hidden victory points only for their owner, and the clickable spots on
// the island only from this player's legal moves. Buttons send
// intentions; the server decides the outcome.

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import GameGuide from '../rules/GameGuide';
import PhoneGame, { PhoneIcon, PhoneStack, useUnread } from '../phone/PhoneGame';
import { usePhoneLayout } from '../../hooks/usePhoneLayout';
import PlayerAvatar from '../PlayerAvatar';
import Modal from '../Modal';
import Icon from '../icons';
import RoomChat from '../chat/RoomChat';
import SocialBar from '../social/SocialBar';
import { SpectatorBanner, SpectatorStrip, SurrenderButton } from '../room/RoomStatus';
import { StyledName } from '../../cosmetics/Cosmetics';
import { useOutcomeEffects, useTurnSound } from '../../cosmetics/useGameCosmetics';
import CatanBoard from './CatanBoard';
import {
  DieFace, RESOURCES, RESOURCE_COLORS, ResourceIcon, playerColor,
} from './catanArt';
import {
  CostChips, HandChips, PieceIcon, Stepper,
} from './CatanParts';
import { catanLogParts, visibleLog } from './logFormat';

const DEV_ORDER = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint'];
const DEV_GLYPH = {
  knight: '⚔️', roadBuilding: '🛤️', yearOfPlenty: '🌾', monopoly: '💰', victoryPoint: '🏆',
};

const sumHand = (hand) => RESOURCES.reduce((s, r) => s + (hand?.[r] || 0), 0);
const affords = (hand, cost) => RESOURCES.every((r) => (hand?.[r] || 0) >= (cost?.[r] || 0));
const emptyHand = () => Object.fromEntries(RESOURCES.map((r) => [r, 0]));
const avatarOf = (p) => ({ ...p, color: playerColor(p.color).fill });

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

// --- header ------------------------------------------------------------------

function TopBar({
  state, onLeave, t, actions, spectating,
}) {
  const seconds = useCountdown(state.phaseEndsAt);
  const actorId = state.setup?.playerId || state.turn?.playerId;
  const actor = state.players.find((p) => p.id === actorId);
  const c = playerColor(actor?.color);
  return (
    <header className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      <span className="text-[24px] leading-none" aria-hidden="true">🏝️</span>
      <div className="min-w-0">
        <p className="section-label">{t('menu.catan.title')}</p>
        <h1 className="font-display text-[17px] font-black leading-tight text-parch">
          {t(`catan.phase.${state.phase}`)}
          {state.phase === 'SETUP' && state.setup && <span className="text-parch/45"> · {t('catan.setupRound', { n: state.setup.round })}</span>}
        </h1>
      </div>
      {actor && state.phase !== 'GAME_OVER' && (
        <div
          className="flex items-center gap-2 rounded-full border px-3 py-1"
          style={{ borderColor: `${c.fill}99`, backgroundColor: `${c.fill}26` }}
        >
          <span className="h-3 w-3 rounded-full ring-2 ring-black/30" style={{ backgroundColor: c.fill }} />
          <span className="text-[13.5px] font-bold text-parch">
            {actor.isYou ? t('catan.yourTurn') : t('catan.nameTurn', { name: actor.nickname })}
          </span>
        </div>
      )}
      <div className="flex-1" />
      <span className="pill bg-white/[0.06] normal-case tracking-normal text-parch/70">🏆 {t('catan.target', { n: state.settings.victoryPoints })}</span>
      {state.phaseEndsAt && (
        <div
          title={t('catan.timer')}
          className={`rounded-xl border px-2.5 py-1 font-display text-[18px] font-black tnum ${seconds <= 10 ? 'animate-pulse border-rent-light/50 text-rent-light' : 'border-white/10 text-parch'}`}
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

// --- dice and actions -----------------------------------------------------------

function DiceView({ state, t }) {
  const roll = state.lastRoll;
  const fresh = roll && roll.turn === state.turnNumber;
  const roller = roll && state.players.find((p) => p.id === roll.playerId);
  return (
    <div className="flex items-center gap-2.5">
      <div key={roll ? `${roll.turn}-${roll.dice.join('-')}` : 'none'} className={`flex gap-1.5 ${roll ? '' : 'opacity-40'}`}>
        <span className={`block ${roll ? 'animate-tumble' : ''}`}><DieFace value={roll?.dice[0] || 0} className="h-10 w-10" /></span>
        <span className={`block ${roll ? 'animate-tumble' : ''}`}><DieFace value={roll?.dice[1] || 0} className="h-10 w-10" red /></span>
      </div>
      <div className="min-w-[4.5rem]">
        {roll ? (
          <>
            <p className={`font-display text-[24px] font-black leading-none tnum ${roll.total === 7 ? 'text-rent-light' : 'text-parch'}`}>{roll.total}</p>
            <p className="max-w-[9rem] truncate text-[11px] text-parch/45">
              {roll.total === 7 && fresh ? `🗡️ ${t('catan.sevenRobber')}` : t('catan.rolledBy', { name: roller?.nickname || '' })}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-parch/45">{t('catan.noRollYet')}</p>
        )}
      </div>
    </div>
  );
}

function BuildButton({
  kind, color, label, cost, hand, reason, note, active, onClick, extra,
}) {
  return (
    <button
      type="button"
      disabled={!!reason}
      onClick={onClick}
      title={reason || note || ''}
      aria-pressed={active}
      className={`flex min-w-[9.5rem] flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all disabled:cursor-not-allowed ${
        active
          ? 'border-brass-light bg-brass/20 shadow-[0_0_0_2px_rgba(227,187,92,0.35)]'
          : 'border-white/10 bg-white/[0.04] enabled:hover:-translate-y-0.5 enabled:hover:border-white/25 enabled:hover:bg-white/[0.08]'
      } ${reason ? 'opacity-60' : ''}`}
    >
      <PieceIcon kind={kind} color={color} className="h-8 w-8 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold leading-tight text-parch">{label}</span>
        <span className="mt-0.5 block">{extra || <CostChips cost={cost} hand={hand} size="h-3.5 w-3.5" />}</span>
        <span className={`mt-0.5 block truncate text-[10.5px] ${reason ? 'text-parch/50' : 'text-parch/35'}`}>{reason || note}</span>
      </span>
    </button>
  );
}

function ActionPanel({
  state, actions, mode, pickMode, onTrade, t,
}) {
  const {
    you, turn, setup, costs,
  } = state;
  if (!you) return null;
  const nameOf = (id) => state.players.find((p) => p.id === id)?.nickname || '…';

  if (state.phase === 'SETUP' && setup) {
    const mine = you.setupTurn;
    const placing = setup.step === 'SETTLEMENT';
    return (
      <section className={`panel flex items-center gap-3 p-3 ${mine ? 'border-brass/40 shadow-[0_0_0_1px_rgba(227,187,92,0.18)]' : ''}`}>
        <PieceIcon kind={placing ? 'settlement' : 'road'} color={state.players.find((p) => p.id === setup.playerId)?.color} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`font-display text-[16px] font-bold ${mine ? 'text-brass-light' : 'text-parch'}`}>
            {mine
              ? t(placing ? 'catan.setup.placeSettlement' : 'catan.setup.placeRoad')
              : t(placing ? 'catan.setup.waiting' : 'catan.setup.waitingRoad', { name: nameOf(setup.playerId) })}
          </p>
          <p className="text-[12px] text-parch/50">{setup.round === 2 ? t('catan.setup.round2Hint') : t('catan.setup.round1Hint')}</p>
        </div>
      </section>
    );
  }
  if (state.phase !== 'PLAY' || !turn) return null;

  const mine = you.isYourTurn;
  const { step } = turn;
  const hand = you.resources;
  const knightReady = you.devCards.some((c) => c.type === 'knight' && c.playable) && !turn.devPlayed;
  let body;

  if (!mine) {
    body = <p className="text-[13.5px] text-parch/75">{t(`catan.other.${step}`, { name: nameOf(turn.playerId) })}</p>;
  } else if (step === 'ROLL') {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={actions.roll} className="btn-primary px-6 py-3 text-[16px]">🎲 {t('catan.roll')}</button>
        {knightReady && (
          <button type="button" onClick={() => actions.playDev('knight')} className="btn-ghost px-3 py-2.5 text-[13px]">⚔️ {t('catan.playKnight')}</button>
        )}
      </div>
    );
  } else if (step === 'DISCARD') {
    body = <p className="text-[13.5px] text-parch/75">{t('catan.discardWaiting', { names: Object.keys(turn.discards || {}).map(nameOf).join(', ') })}</p>;
  } else if (step === 'ROBBER') {
    body = <p className="text-[14px] font-semibold text-brass-light">🗡️ {t('catan.robberHint')}</p>;
  } else if (step === 'STEAL') {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-parch/75">🗡️ {t('catan.stealHint')}</span>
        {(turn.stealFrom || []).map((id) => {
          const p = state.players.find((x) => x.id === id);
          return (
            <button key={id} type="button" onClick={() => actions.steal(id)} className="btn-ghost px-3 py-2 text-[13px]">
              <span className="h-3 w-3 rounded-full ring-1 ring-black/40" style={{ backgroundColor: playerColor(p?.color).fill }} />
              {p?.nickname} · 🂠 {p?.resourceCount}
            </button>
          );
        })}
      </div>
    );
  } else {
    const left = you.piecesLeft;
    const free = turn.freeRoads > 0;
    const spotsFor = { road: you.legal.roads, settlement: you.legal.settlements, city: you.legal.cities };
    const reasonFor = (kind) => {
      if (kind === 'dev') {
        if (state.devDeckCount === 0) return t('catan.cant.deckEmpty');
        return affords(hand, costs.dev) ? null : t('catan.cant.resources');
      }
      if (left[kind] <= 0) return t('catan.cant.noPieces');
      if (!(kind === 'road' && free) && !affords(hand, costs[kind])) return t('catan.cant.resources');
      if (!spotsFor[kind].length) return t('catan.cant.noSpot');
      return null;
    };
    body = (
      <div className="flex flex-col gap-2">
        {free && <p className="rounded-lg bg-go/15 px-3 py-1.5 text-[12.5px] font-semibold text-go-light">🛤️ {t('catan.freeRoads', { n: turn.freeRoads })}</p>}
        <div className="flex flex-wrap gap-2">
          {['road', 'settlement', 'city'].map((kind) => (
            <BuildButton
              key={kind}
              kind={kind}
              color={you.color}
              label={t(`catan.build.${kind}`)}
              cost={costs[kind]}
              hand={hand}
              reason={reasonFor(kind)}
              note={t('catan.piecesLeft', { n: left[kind] })}
              active={mode === kind}
              onClick={() => pickMode(kind)}
              extra={kind === 'road' && free ? <span className="text-[11px] font-bold text-go-light">{t('catan.free')}</span> : null}
            />
          ))}
          <BuildButton
            kind="dev"
            color={you.color}
            label={t('catan.buyDev')}
            cost={costs.dev}
            hand={hand}
            reason={reasonFor('dev')}
            note={t('catan.piecesLeft', { n: state.devDeckCount })}
            onClick={actions.buyDev}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onTrade} className="btn-ghost flex-1 py-2.5 text-[14px]">⇄ {t('catan.trade')}</button>
          <button type="button" onClick={actions.endTurn} className="btn-primary flex-1 py-2.5 text-[14px]">
            {t('catan.endTurn')}
            <Icon.chevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className={`panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center ${mine ? 'border-brass/40 shadow-[0_0_0_1px_rgba(227,187,92,0.18)]' : ''}`}>
      <div className="shrink-0 sm:border-r sm:border-white/[0.08] sm:pr-3"><DiceView state={state} t={t} /></div>
      <div className="min-w-0 flex-1">{body}</div>
    </section>
  );
}

// --- your hand -------------------------------------------------------------------

function HandPanel({
  state, actions, onDevChoice, t,
}) {
  const { you, turn } = state;
  const rates = you.tradeRates || {};
  const groups = DEV_ORDER
    .map((type) => {
      const cards = you.devCards.filter((c) => c.type === type);
      return cards.length ? { type, count: cards.length, playable: cards.some((c) => c.playable) } : null;
    })
    .filter(Boolean);
  const canPlay = (type) => {
    if (state.phase !== 'PLAY' || !turn || !you.isYourTurn || turn.devPlayed) return false;
    if (type === 'knight') return turn.step === 'ROLL' || turn.step === 'MAIN';
    return turn.step === 'MAIN';
  };
  const play = (type) => {
    if (type === 'yearOfPlenty' || type === 'monopoly') onDevChoice(type);
    else actions.playDev(type);
  };

  return (
    <section className="panel flex flex-col gap-3 p-3 md:flex-row">
      <div className="min-w-0 flex-1">
        <p className="section-label mb-2">{t('catan.hand', { n: sumHand(you.resources) })}</p>
        <div className="grid grid-cols-5 gap-1.5">
          {RESOURCES.map((r) => (
            <div
              key={r}
              title={t(`catan.resource.${r}`)}
              className={`relative flex flex-col items-center rounded-xl border px-1 py-1.5 transition-colors ${you.resources[r] ? 'bg-white/[0.06]' : 'bg-black/20'}`}
              style={{ borderColor: `${RESOURCE_COLORS[r]}${you.resources[r] ? 'aa' : '40'}` }}
            >
              <ResourceIcon resource={r} className={`h-7 w-7 ${you.resources[r] ? '' : 'opacity-45'}`} />
              <span className={`font-display text-[20px] font-black leading-none tnum ${you.resources[r] ? 'text-parch' : 'text-parch/35'}`}>{you.resources[r]}</span>
              <span className="mt-0.5 max-w-full truncate text-[10px] text-parch/50">{t(`catan.resource.${r}`)}</span>
              {rates[r] < 4 && (
                <span className="absolute -right-1 -top-1.5 rounded-full bg-sky-600 px-1.5 text-[9.5px] font-black text-white shadow" title={t('catan.rateHint', { n: rates[r] })}>
                  {rates[r]}:1
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 md:w-[46%]">
        <p className="section-label mb-2">{t('catan.devCards')} · {you.devCards.length}</p>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 py-3 text-center text-[12px] text-parch/35">{t('catan.noDevCards')}</p>
        ) : (
          <ul className="scrollbar-thin flex max-h-[7.5rem] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {groups.map((g) => (
              <li key={g.type} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-1.5" title={t(`catan.dev.${g.type}.text`)}>
                <span className="text-[18px]" aria-hidden="true">{DEV_GLYPH[g.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-parch">
                    {t(`catan.dev.${g.type}.name`)}
                    {g.count > 1 && <span className="text-parch/45"> ×{g.count}</span>}
                  </span>
                  <span className="block truncate text-[10.5px] text-parch/45">{t(`catan.dev.${g.type}.text`)}</span>
                </span>
                {g.type === 'victoryPoint' ? (
                  <span className="pill bg-brass/20 text-brass-light">+{g.count}</span>
                ) : (
                  <button
                    type="button"
                    disabled={!g.playable || !canPlay(g.type)}
                    onClick={() => play(g.type)}
                    title={g.playable ? '' : t('catan.devNew')}
                    className="shrink-0 rounded-lg bg-brass px-2.5 py-1 text-[11.5px] font-bold text-ink transition-colors enabled:hover:bg-brass-light disabled:bg-white/[0.06] disabled:text-parch/35"
                  >
                    {g.playable ? t('catan.play') : t('catan.devNewShort')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// --- side panels -----------------------------------------------------------------

function PlayersPanel({ state, t }) {
  const ordered = state.order?.length
    ? state.order.map((id) => state.players.find((p) => p.id === id)).filter(Boolean)
    : state.players;
  const target = state.settings.victoryPoints;
  return (
    <section className="panel p-3">
      <p className="section-label mb-2">{t('catan.players')}</p>
      <ul className="flex flex-col gap-1.5">
        {ordered.map((p) => {
          const c = playerColor(p.color);
          const points = p.isYou && state.you && state.phase !== 'GAME_OVER' ? state.you.points : p.points;
          const badges = p.longestRoad || p.largestArmy || p.mustDiscard > 0 || !p.connected || p.left || (p.isYou && state.you?.hiddenPoints > 0);
          return (
            <li key={p.id} className={`relative overflow-hidden rounded-xl border py-2 pl-3 pr-2.5 ${p.isCurrent ? 'border-brass-light/70 bg-brass/10' : 'border-white/[0.07] bg-white/[0.025]'}`}>
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: c.fill }} />
              <div className="flex items-center gap-2">
                <span className={`rounded-full ${p.isCurrent ? 'animate-turn-ring' : ''}`}>
                  <PlayerAvatar player={avatarOf(p)} sizeClassName="h-8 w-8" ringClassName="ring-2 ring-white/20" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[13px] font-semibold text-parch">
                    <StyledName nickname={p.nickname} cosmetics={p.cosmetics} />
                    {p.isYou && <span className="text-[10.5px] font-normal text-parch/40">({t('waiting.you')})</span>}
                    {p.isHost && <Icon.crown className="h-3.5 w-3.5 shrink-0 text-brass" />}
                  </p>
                  <p className="flex flex-wrap gap-x-2 text-[11px] text-parch/55 tnum">
                    <span title={t('catan.cards')}>🂠 {p.resourceCount}</span>
                    <span title={t('catan.devCount')}>📜 {p.devCardCount}</span>
                    <span title={t('catan.knights')}>⚔️ {p.knights}</span>
                    <span title={t('catan.roadLength')}>🛤️ {p.roadLength}</span>
                  </p>
                </div>
                <div className="text-right" title={t('catan.points')}>
                  <p className="font-display text-[22px] font-black leading-none tnum" style={{ color: c.text }}>{points}</p>
                  <p className="text-[9.5px] uppercase tracking-wide text-parch/40">/ {target}</p>
                </div>
              </div>
              {badges && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.longestRoad && <span className="pill bg-amber-500/20 normal-case tracking-normal text-amber-200">🛤️ {t('catan.longestRoad')} +2</span>}
                  {p.largestArmy && <span className="pill bg-rose-500/20 normal-case tracking-normal text-rose-200">⚔️ {t('catan.largestArmy')} +2</span>}
                  {p.mustDiscard > 0 && <span className="pill bg-rent/30 normal-case tracking-normal text-rent-light">{t('catan.mustDiscard', { n: p.mustDiscard })}</span>}
                  {p.isYou && state.you?.hiddenPoints > 0 && state.phase !== 'GAME_OVER' && (
                    <span className="pill bg-brass/15 normal-case tracking-normal text-brass-light">🏆 {t('catan.hiddenPoints', { n: state.you.hiddenPoints })}</span>
                  )}
                  {p.left
                    ? <span className="pill bg-white/[0.06] text-parch/40">{t('catan.left')}</span>
                    : !p.connected && <span className="pill bg-white/[0.06] text-parch/40">{t('waiting.offline')}</span>}
                </div>
              )}
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/30">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (points / target) * 100)}%`, backgroundColor: c.fill }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[0.07] pt-2 text-[11px] text-parch/55">
        <span className="font-semibold uppercase tracking-wide text-parch/40">{t('catan.bank')}</span>
        {RESOURCES.map((r) => (
          <span key={r} className="inline-flex items-center gap-0.5 tnum" title={t(`catan.resource.${r}`)}>
            <ResourceIcon resource={r} className="h-3.5 w-3.5" />
            {state.bank[r]}
          </span>
        ))}
        <span className="tnum" title={t('catan.devDeck')}>📜 {state.devDeckCount}</span>
      </div>
    </section>
  );
}

function TradeOfferPanel({ state, actions, t }) {
  const { trade, you } = state;
  const from = state.players.find((p) => p.id === trade.fromId);
  const mine = trade.fromId === you?.id;
  const forMe = !!you && trade.to.includes(you.id);
  const myResponse = forMe ? trade.responses[you.id] : null;
  const canAfford = forMe && affords(you.resources, trade.get);
  return (
    <section className={`panel animate-slide-up p-3 ${forMe && !myResponse ? 'border-sky-300/60 shadow-[0_0_0_2px_rgba(125,200,255,0.25)]' : 'border-sky-400/30'}`}>
      <p className="section-label mb-1.5">⇄ {mine ? t('catan.offer.mine') : t('catan.offer.from', { name: from?.nickname || '' })}</p>
      <div className="grid grid-cols-[auto,1fr] items-center gap-x-2 gap-y-1.5 rounded-xl bg-black/25 px-2.5 py-2 text-[12px]">
        <span className="text-parch/50">{forMe ? t('catan.offer.youGet') : t('catan.offer.offers')}</span>
        <HandChips hand={trade.give} />
        <span className="text-parch/50">{forMe ? t('catan.offer.youGive') : t('catan.offer.asks')}</span>
        <HandChips hand={trade.get} />
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {trade.to.map((id) => {
          const p = state.players.find((x) => x.id === id);
          const r = trade.responses[id];
          return (
            <li key={id} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40" style={{ backgroundColor: playerColor(p?.color).fill }} />
              <span className="min-w-0 flex-1 truncate text-parch/80">
                {p?.nickname}
                {p?.isYou && <span className="text-parch/40"> ({t('waiting.you')})</span>}
              </span>
              {r === 'accept' && <span className="text-go-light">✓ {t('catan.offer.accepted')}</span>}
              {r === 'decline' && <span className="text-parch/40">✕ {t('catan.offer.declined')}</span>}
              {!r && <span className="text-parch/35">… {t('catan.offer.waiting')}</span>}
              {mine && r === 'accept' && (
                <button type="button" onClick={() => actions.confirmTrade(trade.id, id)} className="rounded-lg bg-go px-2 py-0.5 text-[11.5px] font-bold text-white transition-colors hover:bg-go-light">
                  {t('catan.offer.confirm')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {mine && <button type="button" onClick={actions.cancelTrade} className="btn-quiet mt-2 w-full py-1.5 text-[12px]">{t('catan.offer.cancel')}</button>}
      {forMe && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" disabled={!canAfford || myResponse === 'accept'} onClick={() => actions.respondTrade(trade.id, true)} className="btn-success py-2 text-[13px]">
            {t('catan.offer.accept')}
          </button>
          <button type="button" disabled={myResponse === 'decline'} onClick={() => actions.respondTrade(trade.id, false)} className="btn-ghost py-2 text-[13px]">
            {t('catan.offer.decline')}
          </button>
          {!canAfford && <p className="col-span-2 text-center text-[11px] text-rent-light">{t('catan.offer.cantAfford')}</p>}
        </div>
      )}
    </section>
  );
}

function LogList({ log, t, className = 'scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-2' }) {
  const ref = useRef(null);
  const entries = useMemo(() => visibleLog(log), [log]);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length]);
  return (
    <ul ref={ref} className={className}>
      {entries.map((e, i) => (
        <li key={`${e.ts}-${i}`} className="flex gap-2 py-[3px] text-[11.5px] leading-snug text-parch/70">
          <span className="w-5 shrink-0 text-right text-parch/25 tnum">{e.turn || '·'}</span>
          <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {catanLogParts(e, t).map((part, j) => (part.res ? (
              // eslint-disable-next-line react/no-array-index-key
              <span key={j} className="inline-flex items-center gap-0.5 font-semibold text-parch/85" title={t(`catan.resource.${part.res}`)}>
                <ResourceIcon resource={part.res} className="h-3.5 w-3.5" />
                {part.n > 1 ? `×${part.n}` : ''}
              </span>
            ) : (
              // eslint-disable-next-line react/no-array-index-key
              <span key={j}>{part.text}</span>
            )))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SidePanel({
  state, chat, actions, t,
}) {
  const [tab, setTab] = useState('log');
  const [seen, setSeen] = useState(chat.length);
  useEffect(() => {
    if (tab === 'chat') setSeen(chat.length);
  }, [tab, chat.length]);
  const unread = Math.max(0, chat.length - seen);
  const me = state.players.find((p) => p.isYou);
  return (
    <section className="panel flex h-[22rem] shrink-0 flex-col overflow-hidden p-0 lg:h-auto lg:min-h-[17rem] lg:flex-1">
      <div className="flex shrink-0 border-b border-white/[0.07]">
        {['log', 'chat'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${tab === id ? 'border-b-2 border-brass text-parch' : 'text-parch/45 hover:text-parch/75'}`}
          >
            {id === 'log' ? `📜 ${t('catan.logTitle')}` : `💬 ${t('catan.chat')}`}
            {id === 'chat' && unread > 0 && tab !== 'chat' && <span className="rounded-full bg-rent px-1.5 text-[10px] text-white">{unread}</span>}
          </button>
        ))}
      </div>
      {tab === 'log' ? (
        <LogList log={state.log} t={t} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <RoomChat
            messages={chat}
            onSend={actions.sendChat}
            players={state.players}
            myPlayerId={me?.id}
            renderSystem={(m) => t(`catan.system.${m.type}`, m.params)}
            nameTone={() => 'text-sky-200'}
          />
        </div>
      )}
    </section>
  );
}

// --- dialogs -------------------------------------------------------------------

function ResourcePickButton({
  resource, selected, disabled, onClick, top, bottom,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition-colors disabled:opacity-35 ${selected ? 'border-brass-light bg-brass/20' : 'border-white/10 bg-white/[0.04] enabled:hover:bg-white/[0.09]'}`}
    >
      <ResourceIcon resource={resource} className="h-7 w-7" />
      <span className="text-[11px] font-bold text-parch">{top}</span>
      <span className="text-[10px] text-parch/45 tnum">{bottom}</span>
    </button>
  );
}

function TradeModal({
  state, actions, onClose, t,
}) {
  const { you } = state;
  const rates = you.tradeRates;
  const others = state.players.filter((p) => !p.isYou && !p.left);
  const [tab, setTab] = useState('bank');
  const [give, setGive] = useState(null);
  const [get, setGet] = useState(null);
  const [amount, setAmount] = useState(1);
  const [offer, setOffer] = useState(emptyHand);
  const [want, setWant] = useState(emptyHand);
  const [targets, setTargets] = useState(() => others.map((p) => p.id));

  const maxAmount = give && get ? Math.max(0, Math.min(Math.floor(you.resources[give] / rates[give]), state.bank[get], 10)) : 0;
  useEffect(() => {
    setAmount((a) => Math.max(1, Math.min(a, maxAmount || 1)));
  }, [maxAmount]);
  // A resource you can no longer afford to give stops being selected.
  useEffect(() => {
    if (give && you.resources[give] < rates[give]) setGive(null);
  }, [give, you.resources, rates]);

  const clash = RESOURCES.some((r) => offer[r] && want[r]);
  const offerOk = sumHand(offer) > 0 && sumHand(want) > 0 && !clash && targets.length > 0 && affords(you.resources, offer);

  return (
    <Modal onClose={onClose} title={t('catan.tradeModal.title')} icon={<span className="text-[18px]">⇄</span>} widthClass="max-w-xl">
      <div className="mb-4 flex rounded-xl border border-white/10 bg-black/25 p-1">
        {['bank', 'players'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition-colors ${tab === id ? 'bg-white/[0.12] text-parch' : 'text-parch/50 hover:text-parch'}`}
          >
            {t(`catan.tradeModal.${id}Tab`)}
          </button>
        ))}
      </div>

      {tab === 'bank' ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="section-label mb-2">{t('catan.tradeModal.give')}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {RESOURCES.map((r) => (
                <ResourcePickButton
                  key={r}
                  resource={r}
                  selected={give === r}
                  disabled={you.resources[r] < rates[r]}
                  onClick={() => { setGive(r); if (get === r) setGet(null); }}
                  top={`${rates[r]}:1`}
                  bottom={t('catan.tradeModal.have', { n: you.resources[r] })}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="section-label mb-2">{t('catan.tradeModal.get')}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {RESOURCES.map((r) => (
                <ResourcePickButton
                  key={r}
                  resource={r}
                  selected={get === r}
                  disabled={r === give || state.bank[r] <= 0}
                  onClick={() => setGet(r)}
                  top={t(`catan.resource.${r}`)}
                  bottom={t('catan.tradeModal.bankHas', { n: state.bank[r] })}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2.5">
            <span className="flex items-center gap-2 text-[13px] text-parch/80">
              {give && get ? (
                <>
                  <span className="inline-flex items-center gap-0.5 font-bold tnum"><ResourceIcon resource={give} className="h-5 w-5" />×{rates[give] * amount}</span>
                  <span aria-hidden="true">→</span>
                  <span className="inline-flex items-center gap-0.5 font-bold tnum"><ResourceIcon resource={get} className="h-5 w-5" />×{amount}</span>
                </>
              ) : t('catan.tradeModal.pick')}
            </span>
            <span className="flex items-center gap-2">
              <Stepper value={amount} onChange={setAmount} min={1} max={Math.max(1, maxAmount)} />
              <button
                type="button"
                disabled={!give || !get || maxAmount < 1}
                onClick={() => { actions.bankTrade(give, get, amount); setGet(null); }}
                className="btn-primary px-4 py-2 text-[13px]"
              >
                {t('catan.tradeModal.trade')}
              </button>
            </span>
          </div>
          <p className="text-[11.5px] leading-snug text-parch/40">{t('catan.tradeModal.portHint')}</p>
        </div>
      ) : others.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-parch/50">{t('catan.tradeModal.nobody')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            <div className="grid grid-cols-[1fr,auto,auto] items-center gap-x-3 bg-white/[0.04] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-parch/45">
              <span>{t('catan.tradeModal.resource')}</span>
              <span className="w-[4.6rem] text-center">{t('catan.tradeModal.offer')}</span>
              <span className="w-[4.6rem] text-center">{t('catan.tradeModal.request')}</span>
            </div>
            {RESOURCES.map((r) => (
              <div key={r} className="grid grid-cols-[1fr,auto,auto] items-center gap-x-3 border-t border-white/[0.05] px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-parch">
                  <ResourceIcon resource={r} className="h-5 w-5 shrink-0" />
                  <span className="truncate">{t(`catan.resource.${r}`)}</span>
                  <span className="text-[11px] text-parch/40 tnum">({you.resources[r]})</span>
                </span>
                <Stepper value={offer[r]} max={you.resources[r]} onChange={(v) => setOffer((o) => ({ ...o, [r]: v }))} />
                <Stepper value={want[r]} max={19} onChange={(v) => setWant((w) => ({ ...w, [r]: v }))} />
              </div>
            ))}
          </div>
          <div>
            <p className="section-label mb-1.5">{t('catan.tradeModal.recipients')}</p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((p) => {
                const on = targets.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTargets((cur) => (on ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                    className={`pill cursor-pointer px-2.5 py-1.5 text-[12px] normal-case tracking-normal transition-colors ${on ? 'bg-sky-500/30 text-parch' : 'bg-white/[0.06] text-parch/50'}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/40" style={{ backgroundColor: playerColor(p.color).fill }} />
                    {p.nickname} · 🂠 {p.resourceCount}
                  </button>
                );
              })}
            </div>
          </div>
          {clash && <p className="text-[11.5px] text-rent-light">{t('catan.tradeModal.sameResource')}</p>}
          <button
            type="button"
            disabled={!offerOk}
            onClick={() => { actions.proposeTrade({ give: offer, get: want, to: targets }); onClose(); }}
            className="btn-primary py-2.5"
          >
            {t('catan.tradeModal.send')}
          </button>
        </div>
      )}
    </Modal>
  );
}

// Not dismissable: the game waits for these cards.
function DiscardDialog({ state, actions, t }) {
  const { you } = state;
  const need = you.mustDiscard;
  const [pick, setPick] = useState(emptyHand);
  const chosen = sumHand(pick);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg animate-scale-in rounded-t-2xl border border-white/12 bg-felt-700/95 p-5 shadow-deep sm:rounded-2xl">
        <h2 className="font-display text-[20px] font-bold text-parch">🗡️ {t('catan.discard.title', { n: need })}</h2>
        <p className="mt-1 text-[12.5px] text-parch/55">{t('catan.discard.hint')}</p>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {RESOURCES.map((r) => (
            <div key={r} className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-0.5 py-2">
              <ResourceIcon resource={r} className="h-7 w-7" />
              <span className="text-[11px] text-parch/50 tnum">{pick[r]} / {you.resources[r]}</span>
              <Stepper
                compact
                value={pick[r]}
                max={Math.min(you.resources[r], pick[r] + need - chosen)}
                onChange={(v) => setPick((p) => ({ ...p, [r]: v }))}
              />
            </div>
          ))}
        </div>
        <button type="button" disabled={chosen !== need} onClick={() => actions.discard(pick)} className="btn-primary mt-4 w-full py-3">
          {t('catan.discard.confirm', { n: chosen, total: need })}
        </button>
      </div>
    </div>
  );
}

function DevChoiceModal({
  type, state, onPlay, onClose, t,
}) {
  const [picks, setPicks] = useState([]);
  const title = t(`catan.dev.${type}.name`);
  if (type === 'monopoly') {
    return (
      <Modal onClose={onClose} title={title} subtitle={t('catan.dev.monopoly.text')} icon={<span className="text-[18px]">💰</span>}>
        <p className="mb-3 text-[13px] text-parch/70">{t('catan.monopolyPick')}</p>
        <div className="grid grid-cols-5 gap-1.5">
          {RESOURCES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onPlay({ resource: r })}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] py-3 transition-colors hover:border-brass-light/60 hover:bg-brass/10"
            >
              <ResourceIcon resource={r} className="h-8 w-8" />
              <span className="text-[11px] font-semibold text-parch/80">{t(`catan.resource.${r}`)}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  const count = (r) => picks.filter((x) => x === r).length;
  return (
    <Modal
      onClose={onClose}
      title={title}
      subtitle={t('catan.dev.yearOfPlenty.text')}
      icon={<span className="text-[18px]">🌾</span>}
      footer={(
        <button type="button" disabled={picks.length !== 2} onClick={() => onPlay({ resources: picks })} className="btn-primary w-full py-2.5">
          {t('catan.confirm')}
        </button>
      )}
    >
      <p className="mb-3 text-[13px] text-parch/70">{t('catan.yopPick')}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {RESOURCES.map((r) => (
          <ResourcePickButton
            key={r}
            resource={r}
            selected={count(r) > 0}
            disabled={picks.length >= 2 || state.bank[r] <= count(r)}
            onClick={() => setPicks((cur) => [...cur, r])}
            top={t(`catan.resource.${r}`)}
            bottom={t('catan.tradeModal.bankHas', { n: state.bank[r] })}
          />
        ))}
      </div>
      <div className="mt-3 flex min-h-[2.25rem] flex-wrap items-center gap-2">
        {picks.map((r, i) => (
          <button
            // eslint-disable-next-line react/no-array-index-key
            key={`${r}${i}`}
            type="button"
            onClick={() => setPicks((cur) => cur.filter((_, j) => j !== i))}
            className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2 py-1 text-[12px] text-parch hover:bg-white/[0.14]"
          >
            <ResourceIcon resource={r} className="h-5 w-5" />
            {t(`catan.resource.${r}`)} ✕
          </button>
        ))}
      </div>
    </Modal>
  );
}

function GameOver({
  state, actions, onLeave, t,
}) {
  const { standings } = state.results;
  const isHost = !!state.you?.isHost;
  const myId = state.you?.id;
  const [hidden, setHidden] = useState(false);
  const myPlace = standings.findIndex((s) => s.playerId === myId) + 1;
  const podium = (myPlace === 2 && standings.length >= 3) || (myPlace === 3 && standings.length >= 4);
  let outcome = null;
  if (myPlace) outcome = myPlace === 1 ? 'win' : podium ? 'podium' : 'loss';
  useOutcomeEffects(outcome, `catan-${state.results.winnerId}-${state.turnNumber}`);
  const cosmeticsOf = (id) => state.players.find((p) => p.id === id)?.cosmetics;

  if (hidden) {
    return (
      <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
        <button type="button" onClick={() => setHidden(false)} className="btn-primary px-5 py-3 shadow-deep">🏆 {t('catan.showResults')}</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-white/12 bg-[#0c1a22]/95 p-5 shadow-deep">
        <div className="mb-4 text-center">
          <p className="section-label">{t('catan.gameOver')}</p>
          <h2 className="font-display text-[30px] font-black leading-tight text-brass-light">🏆 {t('catan.winner', { name: standings[0]?.nickname })}</h2>
        </div>
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-white/[0.04] text-[10.5px] uppercase tracking-wide text-parch/45">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 text-left">{t('catan.player')}</th>
                <th className="px-2 text-right" title={t('catan.score.settlements')}>🏠</th>
                <th className="px-2 text-right" title={t('catan.score.cities')}>🏙️</th>
                <th className="px-2 text-right" title={t('catan.longestRoad')}>🛤️</th>
                <th className="px-2 text-right" title={t('catan.largestArmy')}>⚔️</th>
                <th className="px-2 text-right" title={t('catan.score.victoryCards')}>📜</th>
                <th className="px-2 text-right">{t('catan.score.total')}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.playerId} className={`border-t border-white/[0.05] ${i === 0 ? 'bg-brass/10' : ''}`}>
                  <td className="px-2 py-2 text-parch/50">{i + 1}</td>
                  <td className="max-w-[14rem] px-2 font-semibold text-parch">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40" style={{ backgroundColor: playerColor(s.color).fill }} />
                      <StyledName nickname={s.nickname} cosmetics={cosmeticsOf(s.playerId)} showTitle titleSize="xs" />
                    </span>
                  </td>
                  <td className="px-2 text-right tnum text-parch/80">{s.settlements}</td>
                  <td className="px-2 text-right tnum text-parch/80">{s.cities}</td>
                  <td className="px-2 text-right tnum text-parch/80">{s.longestRoad ? '+2' : '—'}</td>
                  <td className="px-2 text-right tnum text-parch/80">{s.largestArmy ? '+2' : '—'}</td>
                  <td className="px-2 text-right tnum text-parch/80">{s.victoryCards || '—'}</td>
                  <td className="px-2 text-right text-[15px] font-bold text-brass-light tnum">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-parch/40">{t('catan.scoreHint')}</p>
        {isHost ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => actions.restart(true)} className="btn-primary py-3">🏝️ {t('mafia.newGame')}</button>
            <button type="button" onClick={() => actions.restart(false)} className="btn-ghost py-3">
              <Icon.settings className="h-4 w-4" />
              {t('mafia.changeSettings')}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-[12px] text-parch/45">{t('mafia.waitingForHost')}</p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setHidden(true)} className="btn-quiet py-2.5">🗺️ {t('catan.viewBoard')}</button>
          <button type="button" onClick={onLeave} className="btn-quiet py-2.5">{t('mafia.backToMenu')}</button>
        </div>
      </div>
    </div>
  );
}

function ModeHint({
  mode, cancellable, onCancel, t,
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full animate-slide-up items-center gap-2 rounded-full border border-brass-light/40 bg-felt-800/90 px-3.5 py-1.5 text-[13px] font-semibold text-parch shadow-lift backdrop-blur-md">
        <span className="truncate">{t(`catan.modeHint.${mode}`)}</span>
        {cancellable && (
          <button type="button" onClick={onCancel} className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11.5px] text-parch/80 transition-colors hover:bg-white/20">
            {t('catan.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}

// --- the table -------------------------------------------------------------------

export default function CatanGame({
  state, chat, actions, onLeave, spectating,
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [devChoice, setDevChoice] = useState(null);
  const { you, turn, setup } = state;

  const isMyMain = state.phase === 'PLAY' && !!you?.isYourTurn && turn?.step === 'MAIN';
  const phone = usePhoneLayout();
  const [phoneTab, setPhoneTab] = useState('island');
  const unread = useUnread(chat, phone && phoneTab === 'chat', you?.id);
  useTurnSound(!!you?.setupTurn || !!(state.phase === 'PLAY' && you?.isYourTurn && turn?.step === 'ROLL'));

  useEffect(() => {
    if (!isMyMain) {
      setPicked(null);
      setTradeOpen(false);
      setDevChoice(null);
    }
  }, [isMyMain]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setPicked(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // What a click on the island does right now. Placement during setup and
  // moving the robber are forced by the game; building is the player's pick.
  let forced = null;
  if (state.phase === 'SETUP' && you?.setupTurn && setup) forced = setup.step === 'SETTLEMENT' ? 'settlement' : 'road';
  else if (state.phase === 'PLAY' && you?.isYourTurn && turn?.step === 'ROBBER') forced = 'robber';
  const mode = forced || (isMyMain ? (picked || (turn.freeRoads > 0 ? 'road' : null)) : null);

  const pickMode = (kind) => setPicked((cur) => (cur === kind ? null : kind));
  const onVertex = (id) => {
    if (mode === 'settlement') actions.buildSettlement(id);
    else if (mode === 'city') actions.buildCity(id);
    setPicked(null);
  };
  const onEdge = (id) => {
    if (mode === 'road') actions.buildRoad(id);
    setPicked(null);
  };
  const onHex = (id) => {
    if (mode === 'robber') actions.moveRobber(id);
  };

  const board = (
    <>
      {state.board && (
        <CatanBoard state={state} mode={mode} onVertex={onVertex} onEdge={onEdge} onHex={onHex} t={t} />
      )}
      {mode && <ModeHint mode={mode} cancellable={!forced && !!picked} onCancel={() => setPicked(null)} t={t} />}
    </>
  );
  const dialogs = (
    <>
      {tradeOpen && isMyMain && <TradeModal state={state} actions={actions} onClose={() => setTradeOpen(false)} t={t} />}
      {devChoice && isMyMain && (
        <DevChoiceModal
          type={devChoice}
          state={state}
          onPlay={(payload) => { actions.playDev(devChoice, payload); setDevChoice(null); }}
          onClose={() => setDevChoice(null)}
          t={t}
        />
      )}
      {you?.mustDiscard > 0 && <DiscardDialog key={`${state.turnNumber}-${you.mustDiscard}`} state={state} actions={actions} t={t} />}
      {state.phase === 'GAME_OVER' && state.results && <GameOver state={state} actions={actions} onLeave={onLeave} t={t} />}
    </>
  );

  if (phone) {
    const actorId = state.setup?.playerId || turn?.playerId;
    const actor = state.players.find((p) => p.id === actorId);
    const needed = !spectating && (!!you?.setupTurn || (state.phase === 'PLAY' && !!you?.isYourTurn));
    const offer = state.trade && state.phase === 'PLAY' ? state.trade : null;
    const offerForMe = !!offer && !!you && offer.to.includes(you.id) && !offer.responses[you.id];
    const canSurrender = !spectating && actions?.surrender && state.phase !== 'GAME_OVER' && state.players.some((p) => p.isYou && !p.left);
    return (
      <PhoneGame
        gameId="catan"
        state={state}
        theme="table-catan"
        kicker={`🏝️ ${t(`catan.phase.${state.phase}`)}${state.phase === 'SETUP' && state.setup ? ` · ${t('catan.setupRound', { n: state.setup.round })}` : ''} · 🏆 ${state.settings.victoryPoints}`}
        title={actor && state.phase !== 'GAME_OVER' ? (actor.isYou ? t('catan.yourTurn') : t('catan.nameTurn', { name: actor.nickname })) : t(`catan.phase.${state.phase}`)}
        endsAt={state.phaseEndsAt}
        tabs={[
          {
            id: 'island',
            label: t('phone.catan.island'),
            icon: <PhoneIcon.map />,
            fill: true,
            keep: true,
            content: <div className="relative min-h-0 flex-1">{board}</div>,
            // The island and what to do on it are one screen: picking
            // "build a road" lights the spots on the island right above.
            footer: (
              <div className="scrollbar-thin max-h-[46vh] overflow-y-auto border-t border-white/[0.08] bg-black/45 p-2 backdrop-blur-xl">
                {offer && <div className="mb-2"><TradeOfferPanel state={state} actions={actions} t={t} /></div>}
                <ActionPanel state={state} actions={actions} mode={mode} pickMode={pickMode} onTrade={() => setTradeOpen(true)} t={t} />
              </div>
            ),
          },
          ...(you && state.phase !== 'LOBBY' ? [{
            id: 'hand',
            label: t('phone.catan.hand'),
            icon: <PhoneIcon.cards />,
            content: (
              <PhoneStack>
                <HandPanel state={state} actions={actions} onDevChoice={setDevChoice} t={t} />
              </PhoneStack>
            ),
          }] : []),
          {
            id: 'players',
            label: t('catan.players'),
            icon: <Icon.users />,
            content: (
              <PhoneStack>
                {spectating && <SpectatorBanner onLeave={onLeave} />}
                <PlayersPanel state={state} t={t} />
                <SpectatorStrip spectators={state.spectators} />
              </PhoneStack>
            ),
          },
          {
            id: 'log',
            label: t('catan.logTitle'),
            icon: <PhoneIcon.log />,
            fill: true,
            content: <LogList log={state.log} t={t} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 [&_li]:text-[13px]" />,
          },
          {
            id: 'chat',
            label: t('catan.chat'),
            icon: <Icon.chat />,
            badge: unread,
            fill: true,
            content: (
              <RoomChat
                messages={chat}
                onSend={actions.sendChat}
                players={state.players}
                myPlayerId={you?.id}
                renderSystem={(m) => t(`catan.system.${m.type}`, m.params)}
                nameTone={() => 'text-sky-200'}
                className="min-h-0 flex-1"
              />
            ),
          },
        ]}
        tab={phoneTab}
        onTab={setPhoneTab}
        act={{
          tab: 'island',
          active: needed || offerForMe,
          text: offerForMe && !needed ? t('phone.catan.goOffer') : t('catan.yourTurn'),
        }}
        resetKey={`${state.phase}-${state.turnNumber}-${turn?.step || ''}`}
        roomCode={state.roomCode}
        onLeave={onLeave}
        onSurrender={canSurrender ? actions.surrender : null}
      >
        {dialogs}
      </PhoneGame>
    );
  }

  return (
    <div className="table-catan flex min-h-screen flex-col lg:h-[100dvh] lg:min-h-0">
      <div className="mx-auto flex w-full max-w-[1760px] flex-1 flex-col gap-3 px-3 py-3 lg:min-h-0 4xl:max-w-[2500px] 4xl:gap-4 4xl:px-6">
        <TopBar state={state} onLeave={onLeave} t={t} actions={actions} spectating={spectating} />
        {spectating && <SpectatorBanner onLeave={onLeave} />}
        <SpectatorStrip spectators={state.spectators} />
        {/* What this player has to do right now, with the rules one
            tap away - the same strip every game here uses. */}
        <GameGuide gameId="catan" state={state} className="panel shrink-0" />
        <div className="grid flex-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr),22rem] 3xl:grid-cols-[minmax(0,1fr),26rem] 4xl:grid-cols-[minmax(0,1fr),32rem]">
          <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
            <div className="relative h-[60vh] min-h-[320px] lg:h-auto lg:min-h-[280px] lg:flex-1">
              {board}
            </div>
            <ActionPanel state={state} actions={actions} mode={mode} pickMode={pickMode} onTrade={() => setTradeOpen(true)} t={t} />
            {you && state.phase !== 'LOBBY' && <HandPanel state={state} actions={actions} onDevChoice={setDevChoice} t={t} />}
          </div>
          <aside className="scrollbar-thin flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
            <PlayersPanel state={state} t={t} />
            {state.trade && state.phase === 'PLAY' && <TradeOfferPanel state={state} actions={actions} t={t} />}
            <SidePanel state={state} chat={chat} actions={actions} t={t} />
          </aside>
        </div>
      </div>

      {dialogs}
    </div>
  );
}
