// BunkerGame.jsx
// The Bunker table. Everything drawn here comes from the payload the server
// built for THIS player: other players' hidden cards are not in it at all,
// so a closed card on screen is closed for real. Buttons send intentions -
// reveal, vote, skip - and the server decides what happens.

import {
  memo, useEffect, useMemo, useState,
} from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useBunkerConfig } from '../../hooks/useBunker';
import PlayerAvatar from '../PlayerAvatar';
import Icon from '../icons';
import RoomChat from '../chat/RoomChat';
import SocialBar from '../social/SocialBar';
import { SpectatorBanner, SpectatorStrip, SurrenderButton } from '../room/RoomStatus';
import FramedAvatar from '../../cosmetics/FramedAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';
import { useOutcomeEffects, useTurnSound } from '../../cosmetics/useGameCosmetics';
import {
  charOrder, CharIcon, cardText, cardDetail, catastropheOf, formatBunkerLog, monthsText, roomName, votesText, RARITY_TONE,
} from './bunkerText';
import {
  HandPanel, CardHistory, PrivateFeed, EventBanner,
} from './BunkerCards';

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

function Timer({ endsAt, t }) {
  const seconds = useCountdown(endsAt);
  if (!endsAt) return null;
  const warn = seconds <= 10;
  return (
    <div
      title={t('bunker.timer')}
      className={`bunker-plate flex items-center gap-2 px-3 py-1.5 font-mono text-[22px] font-bold tnum 4xl:px-4 4xl:text-[30px] ${warn ? 'bunker-warn text-orange-300' : 'text-parch'}`}
    >
      <Icon.warning className={`h-4 w-4 ${warn ? 'text-orange-300' : 'text-parch/35'}`} />
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </div>
  );
}

function TopBar({
  state, onLeave, t, actions, spectating,
}) {
  return (
    // On a phone the title takes its own row: squeezed into the same line
    // as the clock it collapsed into a two-character column and the two
    // overlapped.
    <header className="bunker-plate flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 4xl:px-6 4xl:py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-[22px] 4xl:h-14 4xl:w-14 4xl:text-[28px]" aria-hidden="true">☢️</span>
      <div key={`${state.phase}-${state.round}`} className="bunker-anim bunker-round min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
        <p className="section-label truncate">{t('menu.bunker.title')} · {t('bunker.roundN', { n: Math.max(1, state.round) })}</p>
        <h1 className="font-display text-[18px] font-black leading-tight text-parch sm:text-[20px] 4xl:text-[28px]">{t(`bunker.phase.${state.phase}`)}</h1>
      </div>
      <Timer endsAt={state.phaseEndsAt} t={t} />
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

function Stat({
  label, value, hint, tone = 'text-parch',
}) {
  return (
    <div className="bunker-plate px-3 py-2.5 4xl:px-4 4xl:py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-parch/40">{label}</p>
      <p className={`font-display text-[24px] font-black leading-tight tnum 4xl:text-[32px] ${tone}`}>{value}</p>
      {hint && <p className="text-[11.5px] text-parch/40">{hint}</p>}
    </div>
  );
}

function BunkerInfo({
  state, config, language, t,
}) {
  const cat = catastropheOf(config, state.catastrophe?.id, language);
  if (!cat || !state.bunker) return null;
  return (
    <section className="bunker-plate p-4 4xl:p-5">
      <p className="section-label mb-1">{t('bunker.catastrophe')}</p>
      <h2 className="text-[17px] font-bold text-parch 4xl:text-[21px]">{cat.name}</h2>
      <p className="mt-1 text-[13px] leading-snug text-parch/60">{cat.text}</p>
      <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-orange-300/90">
        <Icon.warning className="h-3.5 w-3.5" />
        {t('bunker.stay', { time: monthsText(cat.months, language) })}
      </p>
      <div className="my-3 h-px bg-white/[0.06]" />
      <p className="section-label mb-2">{t('bunker.shelter')}</p>
      <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-1.5">
          <dt className="text-parch/40">{t('bunker.area')}</dt>
          <dd className="font-semibold text-parch tnum">{state.bunker.area} {t('bunker.sqm')}</dd>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-1.5">
          <dt className="text-parch/40">{t('bunker.food')}</dt>
          <dd className={`font-semibold tnum ${state.bunker.foodMonths < cat.months ? 'text-orange-300' : 'text-parch'}`}>{monthsText(state.bunker.foodMonths, language)}</dd>
        </div>
      </dl>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {state.bunker.rooms.map((id) => (
          <li key={id} className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[12px] text-parch/75">{roomName(config, id, language)}</li>
        ))}
      </ul>
    </section>
  );
}

function CharRow({
  name, card, isOwn, isPublic, fresh, blind, config, language, t,
}) {
  const label = t(`bunker.char.${name}`);
  if (!card) {
    return (
      <li className="bunker-hatch flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] 4xl:py-2 4xl:text-[14px]">
        <CharIcon name={name} className="h-4 w-4 shrink-0 text-parch/25" />
        <span className="w-[6.5rem] shrink-0 text-parch/40 4xl:w-[8rem]">{label}</span>
        <span className="flex items-center gap-1.5 text-parch/30">
          <Icon.lock className="h-3.5 w-3.5" />
          {/* A card this table dealt face down to its own owner is a
              different kind of unknown from everyone else's secret. */}
          {blind ? t('bunker.blind') : t('bunker.hidden')}
        </span>
      </li>
    );
  }
  const detail = cardDetail(config, name, card, language);
  const isItem = name.startsWith('baggage');
  return (
    <li
      key={`${name}-${isPublic}`}
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] 4xl:py-2 4xl:text-[14px] ${
        isPublic ? 'border-white/[0.08] bg-white/[0.04]' : 'border-dashed border-white/[0.1] bg-black/25'
      } ${fresh ? 'bunker-anim bunker-reveal' : ''}`}
    >
      {detail?.glyph && isItem
        ? <span className="mt-px shrink-0 text-[15px] leading-none" aria-hidden="true">{detail.glyph}</span>
        : <CharIcon name={name} className={`mt-px h-4 w-4 shrink-0 ${isPublic ? 'text-parch/60' : 'text-parch/30'}`} />}
      <span className="w-[6.5rem] shrink-0 text-parch/45 4xl:w-[8rem]">{label}</span>
      <span className="min-w-0 flex-1">
        <span className={`block break-words font-semibold ${isPublic ? 'text-parch' : 'text-parch/65'}`}>
          {cardText(config, name, card, language, t)}
        </span>
        {/* An item says what it is and how rare it is; a sealed property
            is advertised as sealed, and shown once something opens it. */}
        {isItem && detail && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className={`rounded border px-1 py-px text-[9.5px] font-bold uppercase tracking-wide ${RARITY_TONE[detail.rarity]}`}>
              {t(`bunker.rarity.${detail.rarity}`)}
            </span>
            {detail.property
              ? <span className="rounded bg-orange-500/15 px-1 py-px text-[10px] text-orange-200">⚠ {detail.property}</span>
              : detail.hasHidden && <span className="rounded bg-white/[0.06] px-1 py-px text-[10px] text-parch/35">🔒 {t('bunker.sealed')}</span>}
          </span>
        )}
        {isItem && detail?.description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-parch/35">{detail.description}</span>
        )}
      </span>
      {isOwn && !isPublic && <Icon.eye className="mt-px h-3.5 w-3.5 shrink-0 text-parch/30" title={t('bunker.onlyYou')} />}
    </li>
  );
}

// The badges that say what a card or an event has done to a seat: who is
// protected, who is holding a double vote, who has been silenced, who is
// ill. These are public on purpose - a protection nobody can see would
// change nothing about how the table argues.
const EFFECT_TONE = {
  protected: 'bg-sky-400/20 text-sky-200',
  doubleVote: 'bg-brass/25 text-brass-light',
  blockReveal: 'bg-rent/20 text-rent-light',
  ill: 'bg-orange-500/20 text-orange-200',
};

function EffectPills({ effects, t }) {
  const shown = [...new Set(effects || [])].filter((e) => EFFECT_TONE[e]);
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((e) => (
        <span key={e} className={`pill ${EFFECT_TONE[e]}`} title={t(`bunker.effect.${e}.text`)}>
          {t(`bunker.effect.${e}.name`)}
        </span>
      ))}
    </div>
  );
}

const PlayerCard = memo(({
  player, state, config, language, t, canVote, onVote, sheet,
}) => {
  const out = player.status === 'excluded';
  const inVote = state.phase === 'VOTE';
  const highlight = player.isCurrent
    ? 'ring-2 ring-brass-light/70'
    : inVote && player.isCandidate && state.vote?.revote ? 'ring-1 ring-orange-400/55' : '';
  let status = null;
  if (out) status = null;
  else if (player.isCurrent) status = <span className="text-brass-light">{t('bunker.revealingNow')}</span>;
  else if (inVote) status = player.hasVoted ? <span className="text-go-light">✓ {t('bunker.hasVoted')}</span> : <span className="text-parch/40">{t('bunker.thinking')}</span>;
  else if (state.phase === 'REVEAL' && player.revealedThisRound) status = <span className="text-parch/50">✓ {t(`bunker.char.${player.revealedThisRound}`)}</span>;

  return (
    <article className={`bunker-plate flex flex-col gap-2 p-3 4xl:gap-2.5 4xl:p-4 ${highlight} ${player.isYou ? 'border-brass/30' : ''} ${out ? 'bunker-anim bunker-out' : ''}`}>
      <header className="flex items-center gap-2.5">
        <span className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border border-white/10 bg-black/45 px-1 font-mono text-[13px] font-bold text-parch/80 tnum 4xl:h-10 4xl:text-[15px]">№{player.number}</span>
        <FramedAvatar cosmetics={player.cosmetics}>
          <PlayerAvatar player={{ ...player, color: out ? '#3f3f46' : '#52525b' }} sizeClassName="h-8 w-8 4xl:h-10 4xl:w-10" ringClassName="ring-1 ring-white/15" />
        </FramedAvatar>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 text-[14px] font-semibold text-parch 4xl:text-[16px]">
            <StyledName nickname={player.nickname} cosmetics={player.cosmetics} />
            {player.isYou && <span className="shrink-0 text-[11px] font-normal text-parch/45">({t('waiting.you')})</span>}
            {player.isBot && <span className="shrink-0 rounded bg-white/[0.08] px-1 text-[9.5px] font-bold uppercase text-parch/45">{t('bunker.bot')}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-[11.5px]">
            {status}
            {!player.connected && !player.left && <span className="text-parch/35">{t('waiting.offline')}</span>}
          </p>
        </div>
        {/* How many action cards a player is still holding is public; which
            ones they are never is. */}
        {player.cardsInHand > 0 && !out && (
          <span className="shrink-0 rounded-lg border border-violet-400/25 bg-violet-400/[0.08] px-1.5 py-0.5 text-[11px] font-bold text-violet-200 tnum" title={t('bunker.cards.inHand', { n: player.cardsInHand })}>
            🃏{player.cardsInHand}
          </span>
        )}
        {player.isHost && <Icon.crown className="h-4 w-4 shrink-0 text-brass/80" title={t('waiting.host')} />}
      </header>

      <EffectPills effects={player.effects} t={t} />

      {out && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-orange-500/30 bg-orange-500/[0.07] px-2.5 py-1.5">
          <span className="bunker-anim bunker-stamp font-mono text-[12px] font-black uppercase tracking-[0.18em] text-orange-300">{t('bunker.outside')}</span>
          <span className="text-[11.5px] text-parch/50">{t(`bunker.outReason.${player.exclusionReason || 'vote'}`, { round: player.excludedRound })}</span>
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {sheet.map((name) => (
          <CharRow
            key={name}
            name={name}
            card={player.cards?.[name] || null}
            isOwn={player.isYou}
            isPublic={player.revealed.includes(name)}
            fresh={player.revealedThisRound === name || out}
            blind={player.isYou && (state.you?.blind || []).includes(name)}
            config={config}
            language={language}
            t={t}
          />
        ))}
      </ul>

      {canVote && player.isCandidate && !player.isYou && !out && (
        <button type="button" onClick={() => onVote(player.id)} className="btn-danger mt-1 py-2.5 text-[13.5px]">
          {t('bunker.voteAgainst', { number: player.number })}
        </button>
      )}
      {(state.you?.myVotes || []).includes(player.id) && (
        <p className="bunker-anim bunker-round mt-1 text-center text-[12px] font-semibold text-orange-300">✓ {t('bunker.yourVoteHere')}</p>
      )}
    </article>
  );
});

function RevealPanel({
  state, me, config, language, t, actions, sheet,
}) {
  const [pick, setPick] = useState(null);
  useEffect(() => { setPick(null); }, [state.turn?.playerId, state.round]);
  const turnPlayer = state.players.find((p) => p.id === state.turn?.playerId);

  if (state.you?.blockedFromRevealing && state.turn?.playerId === state.you?.id) {
    return (
      <section className="bunker-plate flex items-center gap-3 border-rent/30 bg-rent/[0.07] p-4">
        <span className="text-[22px]" aria-hidden="true">🤐</span>
        <p className="min-w-0 flex-1 text-[13.5px] text-rent-light">{t('bunker.blockedFromRevealing')}</p>
      </section>
    );
  }

  if (state.you?.canReveal && me) {
    const required = state.you.requiredKey;
    return (
      <section className="bunker-plate p-4 ring-1 ring-brass-light/45 4xl:p-5">
        <p className="section-label text-brass-light">{t('bunker.yourTurn')}</p>
        <h2 className="mt-0.5 text-[16px] font-bold text-parch 4xl:text-[20px]">{required ? t('bunker.revealProfession') : t('bunker.revealChoose')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
          {sheet.map((name) => {
            const done = me.revealed.includes(name);
            const allowed = !done && (!required || required === name);
            return (
              <button
                key={name}
                type="button"
                disabled={!allowed}
                onClick={() => setPick(name)}
                aria-pressed={pick === name}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 4xl:py-4 4xl:text-[14px] ${
                  pick === name ? 'border-brass-light bg-brass/15 text-parch' : 'border-white/10 bg-black/25 text-parch/75 hover:border-white/25 hover:bg-white/[0.05]'
                }`}
              >
                <CharIcon name={name} className="h-5 w-5" />
                {t(`bunker.char.${name}`)}
                {done && <span className="text-[10.5px] font-normal text-parch/45">{t('bunker.alreadyOpen')}</span>}
                {!done && (state.you?.blind || []).includes(name)
                  && <span className="text-[10.5px] font-normal text-orange-300/80">{t('bunker.blindShort')}</span>}
              </button>
            );
          })}
        </div>
        {pick && (
          <div className="bunker-anim bunker-round mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/35 p-3">
            <p className="min-w-0 flex-1 text-[13.5px] text-parch/75">
              {t('bunker.confirmReveal', { key: t(`bunker.char.${pick}`) })}
              {' '}
              <b className="text-parch">
                {me.cards[pick] ? cardText(config, pick, me.cards[pick], language, t) : t('bunker.blindValue')}
              </b>
            </p>
            <button type="button" onClick={() => { actions.reveal(pick); setPick(null); }} className="btn-primary px-5 py-2.5">
              <Icon.eye className="h-4 w-4" />
              {t('bunker.revealButton')}
            </button>
            <button type="button" onClick={() => setPick(null)} className="btn-quiet px-3 py-2.5">{t('common.cancel')}</button>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="bunker-plate flex flex-wrap items-center gap-3 p-4 4xl:p-5">
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brass-light" />
      <p className="min-w-0 flex-1 basis-[calc(100%-4.5rem)] text-[14px] text-parch/80 sm:basis-auto 4xl:text-[17px]">
        {turnPlayer ? t('bunker.turnOf', { number: turnPlayer.number, name: turnPlayer.nickname }) : t('bunker.waiting')}
        {state.round === 1 && <span className="ml-1 text-parch/45">· {t('bunker.roundOneHint')}</span>}
      </p>
      <span className="font-mono text-[12.5px] text-parch/45 tnum">{(state.turn?.index || 0) + 1}/{state.turn?.total || 0}</span>
    </section>
  );
}

function DiscussionPanel({ state, t, actions }) {
  return (
    <section className="bunker-plate flex flex-wrap items-center gap-3 p-4 4xl:p-5">
      <Icon.chat className="h-6 w-6 shrink-0 text-parch/45" />
      <div className="min-w-0 flex-1 basis-[calc(100%-2.25rem)] sm:basis-auto">
        <h2 className="text-[16px] font-bold text-parch 4xl:text-[20px]">{t('bunker.discussTitle')}</h2>
        <p className="text-[13px] text-parch/55">{t('bunker.discussText', { n: state.aliveCount - state.seats })}</p>
      </div>
      {state.you?.isHost && (
        <button type="button" onClick={actions.skip} className="btn-ghost w-full justify-center px-4 py-2.5 sm:w-auto">
          {t('bunker.toVote')}
          <Icon.chevronRight className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

function VotePanel({ state, t, actions }) {
  const candidates = state.players.filter((p) => state.vote.candidates.includes(p.id));
  const mine = state.you?.myVotes || [];
  const myVote = state.players.find((p) => p.id === mine[0]);
  const progress = state.vote.voterCount ? (state.vote.votedCount / state.vote.voterCount) * 100 : 0;
  const multi = state.vote.mode === 'multi';
  const live = state.vote.live || [];
  const votesFor = (id) => live.find((r) => r.playerId === id)?.votes || 0;

  let headline = t('bunker.waitVotes');
  if (state.you?.canVote) {
    headline = multi ? t('bunker.voteHintMulti', { n: state.you.votesLeft }) : t('bunker.voteHint');
  } else if (multi && mine.length) headline = t('bunker.votedForMany', { n: mine.length });
  else if (myVote) headline = t('bunker.votedFor', { number: myVote.number, name: myVote.nickname });
  else if (state.you?.status === 'excluded') headline = t('bunker.spectatorVote');

  return (
    <section className={`bunker-plate p-4 4xl:p-5 ${state.vote.revote || state.finalVote ? 'bunker-warn' : ''}`}>
      <p className={`section-label ${state.vote.revote || state.finalVote ? 'text-orange-300' : ''}`}>
        {state.finalVote ? t('bunker.finalVoteTitle') : state.vote.revote ? t('bunker.revoteTitle') : t('bunker.voteTitle')}
      </p>
      <h2 className="mt-0.5 text-[16px] font-bold text-parch 4xl:text-[20px]">{headline}</h2>
      {state.finalVote && <p className="mt-1 text-[12.5px] text-orange-200/80">{t('bunker.finalVoteText', { n: Math.max(0, state.aliveCount - state.seats) })}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {state.vote.secret && <span className="pill bg-white/[0.07] text-parch/60">🕶️ {t('bunker.secretVoteBadge')}</span>}
        {multi && <span className="pill bg-white/[0.07] text-parch/60">{t('bunker.multiVoteBadge', { n: state.vote.votesPerPlayer })}</span>}
        {state.settings.voting.allowChange && <span className="pill bg-white/[0.07] text-parch/60">{t('bunker.changeVoteBadge')}</span>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-parch/60 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <span className="font-mono text-[12.5px] text-parch/55 tnum">{t('bunker.votedCount', { n: state.vote.votedCount, m: state.vote.voterCount })}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 4xl:grid-cols-4">
        {candidates.map((p) => {
          const self = p.id === state.you?.id;
          const chosen = mine.includes(p.id);
          const shielded = (p.effects || []).includes('protected');
          // With vote-changing on, tapping a chosen player takes the
          // ballot back rather than doing nothing.
          const clickable = (state.you?.canVote || (chosen && state.settings.voting.allowChange)) && !self;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!clickable}
              onClick={() => actions.vote(p.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed 4xl:py-3 ${
                chosen ? 'border-orange-400/60 bg-orange-500/10' : 'border-white/10 bg-black/25 enabled:hover:border-orange-400/40 enabled:hover:bg-orange-500/[0.06] disabled:opacity-50'
              }`}
            >
              <span className="font-mono text-[13px] font-bold text-parch/60 tnum">№{p.number}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-parch 4xl:text-[15.5px]">{p.nickname}</span>
              {shielded && <span title={t('bunker.effect.protected.text')} aria-hidden="true">🛡️</span>}
              {!state.vote.secret && votesFor(p.id) > 0 && (
                <span className="rounded bg-orange-500/20 px-1.5 text-[11.5px] font-bold text-orange-200 tnum">{votesFor(p.id)}</span>
              )}
              {self
                ? <span className="text-[11px] text-parch/40">{t('sidebar.you')}</span>
                : chosen
                  ? <span className="text-[12px] font-semibold text-orange-300">✓</span>
                  : state.you?.canVote && <span className="text-[12px] font-semibold text-orange-300">{t('bunker.vote')}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Tally({
  vote, players, t, language,
}) {
  const max = Math.max(1, ...vote.tally.map((r) => r.votes));
  const byId = (id) => players.find((p) => p.id === id);
  return (
    <ul className="flex flex-col gap-1.5">
      {vote.tally.map((row) => {
        const p = byId(row.playerId);
        if (!p) return null;
        const out = vote.excludedId === row.playerId;
        return (
          <li key={row.playerId}>
            <div className="mb-0.5 flex items-baseline gap-2 text-[12.5px]">
              <span className="font-mono text-parch/50 tnum">№{p.number}</span>
              <span className={`min-w-0 flex-1 truncate font-semibold ${out ? 'text-orange-300' : 'text-parch/85'}`}>{p.nickname}</span>
              <span className="text-parch/55 tnum">{votesText(row.votes, language)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
              <div className={`h-full rounded-full ${out ? 'bg-orange-400/80' : 'bg-parch/40'}`} style={{ width: `${(row.votes / max) * 100}%` }} />
            </div>
            {row.voters.length > 0 && (
              <p className="mt-0.5 text-[11px] text-parch/35">
                {t('bunker.votersList', { list: row.voters.map((id) => `№${byId(id)?.number ?? '?'}`).join(' ') })}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ResultPanel({
  state, t, language, actions,
}) {
  const vote = state.lastVote;
  if (!vote) return null;
  const out = state.players.find((p) => p.id === vote.excludedId);
  let headline = t(`bunker.outcome.${vote.outcome}`);
  if (out) headline = t(`bunker.outcome.${vote.outcome}`, { number: out.number, name: out.nickname });
  return (
    <section className="bunker-plate bunker-anim bunker-round p-4 4xl:p-5">
      <p className="section-label">{t('bunker.resultTitle', { round: vote.round })}</p>
      <h2 className={`mt-0.5 font-display text-[20px] font-black leading-tight 4xl:text-[26px] ${out ? 'text-orange-300' : 'text-parch'}`}>{headline}</h2>
      {vote.tally.length > 0 && <div className="mt-3"><Tally vote={vote} players={state.players} t={t} language={language} /></div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-full text-[12.5px] text-parch/45 sm:basis-auto">
          {state.aliveCount <= state.seats ? t('bunker.lastResult') : t('bunker.nextRoundSoon')}
        </p>
        {state.you?.isHost && (
          <button type="button" onClick={actions.skip} className="btn-ghost w-full justify-center px-4 py-2 sm:w-auto">
            {t('bunker.continue')}
            <Icon.chevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}

function History({
  log, config, language, t,
}) {
  const entries = useMemo(() => log.filter((e) => e.type !== 'VOTE_CAST').slice(-60).reverse(), [log]);
  return (
    <section className="bunker-plate flex max-h-[22rem] flex-col overflow-hidden 4xl:max-h-[34rem]">
      <p className="section-label shrink-0 border-b border-white/[0.07] px-3 py-2">📜 {t('bunker.history')}</p>
      <ol className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {entries.map((e, i) => (
          <li
            // eslint-disable-next-line react/no-array-index-key
            key={`${e.ts}-${i}`}
            className={`cv-row text-[12.5px] leading-snug 4xl:text-[14px] ${
              e.type === 'ROUND_STARTED' ? 'pt-1 font-bold uppercase tracking-wide text-parch/50'
                : ['EXCLUDED', 'EXCLUDED_BY_LOT', 'PLAYER_LEFT'].includes(e.type) ? 'text-orange-300/90'
                  : 'text-parch/70'
            }`}
          >
            {formatBunkerLog(e, { t, config, language })}
          </li>
        ))}
      </ol>
    </section>
  );
}

function GameOver({
  state, config, language, t, actions, onLeave, sheet,
}) {
  const { results } = state;
  const me = state.players.find((p) => p.isYou);
  const survived = !!me && results.survivorIds.includes(me.id);
  useOutcomeEffects(me ? (survived ? 'win' : 'loss') : null, `${state.roomCode}-${state.round}-${results.survivorIds.join(',')}`);
  const survivors = state.players.filter((p) => results.survivorIds.includes(p.id));
  const byId = (id) => state.players.find((p) => p.id === id);
  const isHost = !!state.you?.isHost;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md sm:items-center">
      <div className="bunker-plate w-full max-w-3xl animate-scale-in p-5 4xl:max-w-5xl 4xl:p-8">
        <div className="text-center">
          <p className="section-label">{t('bunker.gameOver')}</p>
          <h2 className="mt-1 font-display text-[30px] font-black leading-tight text-parch 4xl:text-[40px]">
            {me ? (survived ? t('bunker.youSurvived') : t('bunker.youOutside')) : t('bunker.survivorsTitle')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[13.5px] text-parch/60">
            <b className="text-parch">{t(`bunker.verdict.${results.verdict}.title`)}</b>
            {' — '}
            {t(`bunker.verdict.${results.verdict}.text`)}
          </p>
          <p className="mt-1 text-[12px] text-parch/40">{t('bunker.summary', { rounds: results.rounds, seats: results.seats, score: results.colonyScore })}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <span className="pill bg-brass/20 text-brass-light">{t(`bunker.scenario.${results.scenario || state.scenario}`)}</span>
            {results.cardsPlayed > 0 && <span className="pill bg-violet-400/20 text-violet-200">{t('bunker.endCards', { n: results.cardsPlayed })}</span>}
            {(results.events || []).length > 0 && <span className="pill bg-orange-400/20 text-orange-200">{t('bunker.endEvents', { n: results.events.length })}</span>}
            {(results.mutedCategories || []).length > 0 && (
              <span className="pill bg-white/[0.07] text-parch/55">
                {t('bunker.endMuted', { list: results.mutedCategories.map((k) => t(`bunker.char.${k}`)).join(', ') })}
              </span>
            )}
          </div>
        </div>

        <h3 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wide text-go-light">{t('bunker.survivors', { n: survivors.length })}</h3>
        <div className="grid gap-2 sm:grid-cols-2 4xl:grid-cols-3">
          {survivors.map((p) => (
            <div key={p.id} className="rounded-xl border border-go/30 bg-go/[0.06] p-3">
              <p className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold text-parch">
                <span className="font-mono text-parch/55 tnum">№{p.number}</span>
                <StyledName nickname={p.nickname} cosmetics={p.cosmetics} />
              </p>
              <ul className="space-y-0.5 text-[12px]">
                {sheet.map((name) => (
                  <li key={name} className="flex gap-2">
                    <span className={`w-[6rem] shrink-0 ${results.mutedCategories?.includes(name) ? 'text-parch/25 line-through' : 'text-parch/40'}`}>
                      {t(`bunker.char.${name}`)}
                    </span>
                    <span className="min-w-0 break-words text-parch/85">{cardText(config, name, p.cards[name], language, t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {results.excluded.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wide text-orange-300/90">{t('bunker.excludedTitle')}</h3>
            <ol className="flex flex-wrap gap-1.5">
              {results.excluded.map((row) => {
                const p = byId(row.playerId);
                return (
                  <li key={row.playerId} className="rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[12.5px] text-parch/70">
                    №{p?.number} {p?.nickname}
                    <span className="text-parch/40"> · {t(`bunker.outReason.${row.reason || 'vote'}`, { round: row.round })}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {isHost ? (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => actions.restart(true)} className="btn-primary py-3">☢️ {t('bunker.newGame')}</button>
            <button type="button" onClick={() => actions.restart(false)} className="btn-ghost py-3">
              <Icon.settings className="h-4 w-4" />
              {t('mafia.changeSettings')}
            </button>
          </div>
        ) : (
          <p className="mt-6 text-center text-[12.5px] text-parch/45">{t('mafia.waitingForHost')}</p>
        )}
        <button type="button" onClick={onLeave} className="btn-quiet mt-2 w-full py-2.5">{t('mafia.backToMenu')}</button>
      </div>
    </div>
  );
}

export default function BunkerGame({
  state, chat, actions, onLeave, spectating,
}) {
  const { t, language } = useTranslation();
  const config = useBunkerConfig();
  const me = state.players.find((p) => p.isYou);
  const [lastTally, setLastTally] = useState(null);
  // The characteristics THIS table deals - not a fixed seven.
  const sheet = useMemo(() => charOrder(state), [state.categories]);

  useTurnSound(!!state.you?.canReveal || !!state.you?.canVote);

  // Keep the last finished vote on screen after the next round begins.
  useEffect(() => {
    if (state.lastVote && state.lastVote.outcome !== 'tie') setLastTally(state.lastVote);
  }, [state.lastVote]);
  useEffect(() => {
    if (state.phase === 'LOBBY') setLastTally(null);
  }, [state.phase]);

  if (!config) {
    return (
      <div className="table-bunker flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-brass" />
      </div>
    );
  }

  const excludedCount = state.players.filter((p) => p.status === 'excluded').length;
  const voting = state.phase === 'VOTE';

  return (
    <div className="table-bunker min-h-screen">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-4 3xl:max-w-[1760px] 4xl:max-w-[2360px] 4xl:gap-5 4xl:px-8 4xl:py-8 5xl:max-w-[3100px]">
        <TopBar state={state} onLeave={onLeave} t={t} actions={actions} spectating={spectating} />
        {spectating && <SpectatorBanner onLeave={onLeave} />}
        <SpectatorStrip spectators={state.spectators} />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 4xl:gap-3">
          <Stat label={t('bunker.seatsLabel')} value={state.seats} hint={t('bunker.seatsHint')} />
          <Stat label={t('bunker.aliveLabel')} value={state.aliveCount} hint={t('bunker.aliveHint', { n: Math.max(0, state.aliveCount - state.seats) })} tone={state.aliveCount - state.seats <= 1 ? 'text-orange-300' : 'text-parch'} />
          <Stat label={t('bunker.excludedLabel')} value={excludedCount} />
          <Stat
            label={t('bunker.roundLabel')}
            value={state.totalRounds > 0 ? `${Math.max(1, state.round)}/${state.totalRounds}` : Math.max(1, state.round)}
            hint={state.round < state.firstVoteRound ? t('bunker.noVoteYet') : t('bunker.voteEachRound')}
          />
        </div>

        {/* What the table is being asked to do right now, in one line. */}
        <p className="bunker-plate px-4 py-2 text-[12.5px] text-parch/60">
          {t(`bunker.goal.${state.phase}`, { n: Math.max(0, state.aliveCount - state.seats) })}
        </p>

        <EventBanner state={state} t={t} />

        {me?.status === 'excluded' && state.phase !== 'GAME_OVER' && (
          <p className="bunker-plate border-orange-500/30 px-4 py-2.5 text-[13px] text-orange-200/90">⚠ {t('bunker.spectatorBanner')}</p>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),22rem] 3xl:grid-cols-[minmax(0,1fr),26rem] 4xl:grid-cols-[minmax(0,1fr),36rem] 4xl:gap-5">
          <div className="flex min-w-0 flex-col gap-3 4xl:gap-4">
            {state.phase === 'REVEAL' && <RevealPanel state={state} me={me} config={config} language={language} t={t} actions={actions} sheet={sheet} />}
            {state.phase === 'DISCUSSION' && <DiscussionPanel state={state} t={t} actions={actions} />}
            {voting && <VotePanel state={state} t={t} actions={actions} />}
            {state.phase === 'RESULT' && <ResultPanel state={state} t={t} language={language} actions={actions} />}

            {/* The hand sits directly under whatever the table is doing,
                because a card is almost always played in reaction to it. */}
            <HandPanel state={state} config={config} language={language} t={t} onPlay={actions.playCard} spectating={spectating} />
            <PrivateFeed state={state} config={config} language={language} t={t} />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:gap-4 5xl:grid-cols-5">
              {state.players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  state={state}
                  config={config}
                  language={language}
                  t={t}
                  sheet={sheet}
                  canVote={voting && !!state.you?.canVote}
                  onVote={actions.vote}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 4xl:gap-4">
            <BunkerInfo state={state} config={config} language={language} t={t} />
            {lastTally && state.phase !== 'RESULT' && lastTally.tally.length > 0 && (
              <section className="bunker-plate p-4">
                <p className="section-label mb-2">{t('bunker.lastVote', { round: lastTally.round })}</p>
                <Tally vote={lastTally} players={state.players} t={t} language={language} />
              </section>
            )}
            <CardHistory state={state} t={t} />
            <History log={state.log} config={config} language={language} t={t} />
            <section className="bunker-plate flex h-[20rem] flex-col overflow-hidden 4xl:h-[30rem]">
              <RoomChat
                messages={chat}
                onSend={actions.sendChat}
                players={state.players}
                myPlayerId={me?.id}
                renderSystem={(m) => t(`bunker.system.${m.type}`, m.params)}
                nameTone={(m) => (m.excluded ? 'text-parch/40' : 'text-parch')}
                channelBadge={(m) => (m.number ? <span className="mr-1 font-mono text-parch/40">№{m.number}</span> : null)}
                header={<p className="section-label shrink-0 border-b border-white/[0.07] px-3 py-2">💬 {t('bunker.chat')}</p>}
              />
            </section>
          </div>
        </div>
      </div>

      {state.phase === 'GAME_OVER' && state.results && (
        <GameOver state={state} config={config} language={language} t={t} actions={actions} onLeave={onLeave} sheet={sheet} />
      )}
    </div>
  );
}
