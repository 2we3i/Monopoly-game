// BunkerMobile.jsx
// The Bunker on a phone, built on the frame every game's phone layout
// shares (components/phone/PhoneGame.jsx): the round, the phase and the
// clock always on screen, and five tabs -
//
//   Game     the action of the moment (reveal a card, argue, vote, the
//            result), what was revealed this round, and your action cards
//   Me       your own character: what the table knows, what only you know
//   Players  everyone, one row each, opened with a tap
//   Shelter  the catastrophe, the shelter, the last vote and the history
//   Chat     the room chat at full height
//
// Everything drawn comes from the same per-player payload as the desktop
// table and the same intentions are sent; the server still decides what
// happens.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useBunkerConfig } from '../../hooks/useBunker';
import PlayerAvatar from '../PlayerAvatar';
import Icon from '../icons';
import RoomChat from '../chat/RoomChat';
import { PlayerStatus, SpectatorBanner, SpectatorStrip } from '../room/RoomStatus';
import FramedAvatar from '../../cosmetics/FramedAvatar';
import { StyledName } from '../../cosmetics/Cosmetics';
import { useOutcomeEffects, useTurnSound } from '../../cosmetics/useGameCosmetics';
import PhoneGame, {
  PhoneIcon, PhoneStack, Sheet, useUnread,
} from '../phone/PhoneGame';
import {
  charOrder, CharIcon, cardText, cardDetail, formatBunkerLog, RARITY_TONE,
} from './bunkerText';
import {
  HandPanel, CardHistory, PrivateFeed, EventBanner,
} from './BunkerCards';
import {
  BunkerInfo, EffectPills, VoteConfirm, Tally, ResultPanel,
} from './BunkerGame';

// --- small parts ------------------------------------------------------

function SeatBadge({ number, className = '' }) {
  return (
    <span className={`flex h-8 min-w-[2.4rem] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/45 px-1 font-mono text-[13px] font-bold text-parch/80 tnum ${className}`}>
      №{number}
    </span>
  );
}

function Avatar({ player, size = 'h-9 w-9' }) {
  const out = player.status === 'excluded';
  return (
    <FramedAvatar cosmetics={player.cosmetics}>
      <PlayerAvatar player={{ ...player, color: out ? '#3f3f46' : '#52525b' }} sizeClassName={size} ringClassName="ring-1 ring-white/15" />
    </FramedAvatar>
  );
}

function SectionTitle({ children, right = null, className = '' }) {
  return (
    <div className={`flex items-center gap-2 px-1 ${className}`}>
      <h2 className="min-w-0 flex-1 text-[12px] font-bold uppercase tracking-[0.12em] text-parch/50">{children}</h2>
      {right}
    </div>
  );
}

// One characteristic, laid out for a narrow screen: the name small on top,
// the card itself large underneath, so a long profession never gets
// squeezed into a column beside its label.
function CardLine({
  name, card, config, language, t, isPublic = true, blind = false, fresh = false, dense = false, muted = false,
}) {
  const isItem = name.startsWith('baggage');
  const detail = card ? cardDetail(config, name, card, language) : null;
  let value;
  if (card) value = cardText(config, name, card, language, t);
  else if (blind) value = t('bunker.m.blindCard');
  else value = t('bunker.hidden');
  return (
    <li
      className={`flex items-start gap-2.5 rounded-xl border px-3 ${dense ? 'py-2' : 'py-2.5'} ${
        isPublic ? 'border-white/[0.08] bg-white/[0.04]' : 'border-dashed border-white/[0.12] bg-black/30'
      } ${fresh ? 'bunker-anim bunker-reveal' : ''}`}
    >
      {detail?.glyph && isItem
        ? <span className="mt-px w-5 shrink-0 text-center text-[17px] leading-none" aria-hidden="true">{detail.glyph}</span>
        : <CharIcon name={name} className={`mt-px h-5 w-5 shrink-0 ${isPublic ? 'text-parch/55' : 'text-parch/30'}`} />}
      <span className="min-w-0 flex-1">
        <span className={`flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${muted ? 'text-parch/30 line-through' : 'text-parch/45'}`}>
          {t(`bunker.char.${name}`)}
          {fresh && <span className="rounded bg-brass/25 px-1 py-px text-[9.5px] tracking-wide text-brass-light">{t('bunker.m.new')}</span>}
        </span>
        <span className={`mt-0.5 break-words font-semibold leading-snug ${dense ? 'text-[14px]' : 'text-[15px]'} ${
          card ? `block ${isPublic ? 'text-parch' : 'text-parch/80'}` : 'flex items-center gap-1.5 text-parch/35'
        }`}
        >
          {!card && <Icon.lock className="h-3.5 w-3.5 shrink-0" />}
          {value}
          {card && isPublic && detail?.absurd && (
            <span
              title={t('bunker.absurdHint')}
              className="ml-1.5 whitespace-nowrap rounded border border-fuchsia-400/30 bg-fuchsia-400/[0.10] px-1 py-px align-middle text-[9.5px] font-bold uppercase tracking-wide text-fuchsia-200"
            >
              {t('bunker.absurdBadge')}
            </span>
          )}
        </span>
        {isItem && detail && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <span className={`rounded border px-1 py-px text-[9.5px] font-bold uppercase tracking-wide ${RARITY_TONE[detail.rarity]}`}>
              {t(`bunker.rarity.${detail.rarity}`)}
            </span>
            {detail.property
              ? <span className="rounded bg-orange-500/15 px-1 py-px text-[11px] text-orange-200">⚠ {detail.property}</span>
              : detail.hasHidden && <span className="rounded bg-white/[0.06] px-1 py-px text-[11px] text-parch/40">🔒 {t('bunker.sealed')}</span>}
          </span>
        )}
        {isItem && detail?.description && !dense && (
          <span className="mt-1 block text-[12px] leading-snug text-parch/40">{detail.description}</span>
        )}
      </span>
    </li>
  );
}

// --- the Game tab -------------------------------------------------------

function RevealPicker({
  state, me, sheet, config, language, t, onReveal,
}) {
  const [pick, setPick] = useState(null);
  useEffect(() => { setPick(null); }, [state.turn?.playerId, state.round, state.turn?.index]);

  const required = state.you.requiredKey;
  const blind = state.you.blind || [];
  const held = sheet.filter((k) => !me.heldKeys || me.heldKeys.includes(k));
  const open = held.filter((k) => me.revealed.includes(k));
  // In round one only the profession may be opened: the other cards are
  // not choices, so they are not drawn as if they were.
  const options = held.filter((k) => !me.revealed.includes(k) && (!required || required === k));

  return (
    <section className="bunker-plate p-3.5 ring-1 ring-brass-light/45">
      <p className="section-label text-brass-light">{t('bunker.yourTurn')}</p>
      <h2 className="mt-0.5 text-[18px] font-bold leading-snug text-parch">{required ? t('bunker.revealProfession') : t('bunker.revealChoose')}</h2>
      {!required && <p className="mt-1 text-[13px] leading-snug text-parch/55">{t('bunker.m.pickCard')}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {options.map((name) => {
          const card = me.cards?.[name];
          const isBlind = !card && blind.includes(name);
          const detail = card ? cardDetail(config, name, card, language) : null;
          return (
            <li key={name}>
              <button
                type="button"
                onClick={() => setPick(name)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.12] bg-black/30 px-3 py-3 text-left transition-colors active:border-brass-light active:bg-brass/15"
              >
                {detail?.glyph && name.startsWith('baggage')
                  ? <span className="w-6 shrink-0 text-center text-[19px] leading-none" aria-hidden="true">{detail.glyph}</span>
                  : <CharIcon name={name} className="h-6 w-6 shrink-0 text-parch/55" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-parch/45">{t(`bunker.char.${name}`)}</span>
                  <span className={`block break-words text-[15px] font-semibold leading-snug ${isBlind ? 'text-orange-200/80' : 'text-parch'}`}>
                    {card ? cardText(config, name, card, language, t) : t('bunker.m.blindCard')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-lg bg-brass/15 px-2.5 py-1.5 text-[12.5px] font-bold text-brass-light">
                  <Icon.eye className="h-4 w-4" />
                  {t('bunker.revealButton')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-parch/35">{t('bunker.m.alreadyOpen')}:</span>
          {open.map((k) => (
            <span key={k} className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[11.5px] text-parch/55">{t(`bunker.char.${k}`)}</span>
          ))}
        </div>
      )}

      {pick && (
        <Sheet
          title={t('bunker.m.confirmTitle')}
          onClose={() => setPick(null)}
          footer={(
            <div className="grid grid-cols-[1fr,2fr] gap-2">
              <button type="button" onClick={() => setPick(null)} className="btn-quiet py-3">{t('common.cancel')}</button>
              <button type="button" onClick={() => { onReveal(pick); setPick(null); }} className="btn-primary py-3 text-[15px]">
                <Icon.eye className="h-4 w-4" />
                {t('bunker.revealButton')}
              </button>
            </div>
          )}
        >
          <ul>
            <CardLine name={pick} card={me.cards?.[pick] || null} blind={blind.includes(pick)} config={config} language={language} t={t} />
          </ul>
          <p className="mt-3 text-[13px] leading-snug text-parch/55">{t('bunker.m.confirmNote')}</p>
        </Sheet>
      )}
    </section>
  );
}

function WaitingReveal({ state, t }) {
  const turnPlayer = state.players.find((p) => p.id === state.turn?.playerId);
  const index = (state.turn?.index || 0) + 1;
  const total = state.turn?.total || 0;
  return (
    <section className="bunker-plate p-3.5">
      <div className="flex items-center gap-3">
        {turnPlayer ? <Avatar player={turnPlayer} size="h-11 w-11" /> : <span className="h-3 w-3 animate-pulse rounded-full bg-brass-light" />}
        <div className="min-w-0 flex-1">
          <p className="section-label">{t('bunker.revealingNow')}</p>
          <p className="truncate text-[16px] font-bold text-parch">
            {turnPlayer ? `№${turnPlayer.number} ${turnPlayer.nickname}` : t('bunker.waiting')}
          </p>
        </div>
        <span className="shrink-0 text-[12.5px] text-parch/45 tnum">{t('bunker.m.turnProgress', { i: Math.min(index, total || index), n: total })}</span>
      </div>
      {total > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-brass-light/70 transition-all duration-300" style={{ width: `${((index - 1) / total) * 100}%` }} />
        </div>
      )}
      {state.round === 1 && <p className="mt-2 text-[12.5px] text-parch/45">{t('bunker.m.requiredProfession')}</p>}
    </section>
  );
}

function RevealStage({
  state, me, sheet, config, language, t, actions,
}) {
  if (state.you?.blockedFromRevealing && state.turn?.playerId === state.you?.id) {
    return (
      <section className="bunker-plate flex items-center gap-3 border-rent/30 bg-rent/[0.07] p-3.5">
        <span className="text-[24px]" aria-hidden="true">🤐</span>
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-rent-light">{t('bunker.blockedFromRevealing')}</p>
      </section>
    );
  }
  if (state.you?.canReveal && me) {
    return <RevealPicker state={state} me={me} sheet={sheet} config={config} language={language} t={t} onReveal={actions.reveal} />;
  }
  return <WaitingReveal state={state} t={t} />;
}

// What each player has put on the table this round, in seat order. On a
// phone this is the one list that lets you follow the round without
// opening every player.
function RoundReveals({
  state, config, language, t,
}) {
  const alive = state.players.filter((p) => p.status === 'alive');
  const done = alive.filter((p) => p.revealedThisRound);
  return (
    <section className="bunker-plate p-3.5">
      <SectionTitle right={<span className="font-mono text-[12px] text-parch/40 tnum">{done.length}/{alive.length}</span>}>
        {t('bunker.m.openedThisRound')}
      </SectionTitle>
      {done.length === 0 ? (
        <p className="mt-2 px-1 text-[13px] text-parch/40">{t('bunker.m.nothingYet')}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {done.map((p) => {
            const key = p.revealedThisRound;
            const card = p.cards?.[key];
            return (
              <li key={p.id} className="bunker-anim bunker-round flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                <span className="mt-px shrink-0 font-mono text-[12.5px] font-bold text-parch/50 tnum">№{p.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-parch/55">
                    {p.nickname}
                    {p.isYou && <span className="text-parch/35"> · {t('waiting.you')}</span>}
                    {' · '}
                    {t(`bunker.char.${key}`)}
                  </span>
                  <span className="block break-words text-[14.5px] font-semibold leading-snug text-parch">
                    {card ? cardText(config, key, card, language, t) : '—'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PhoneDiscussion({
  state, t, actions, onTab,
}) {
  return (
    <section className="bunker-plate p-3.5">
      <div className="flex items-start gap-3">
        <Icon.chat className="mt-0.5 h-6 w-6 shrink-0 text-parch/45" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold leading-snug text-parch">{t('bunker.discussTitle')}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-parch/60">{t('bunker.discussText', { n: Math.max(0, state.aliveCount - state.seats) })}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-parch/40">{t('bunker.m.discussTip')}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onTab('players')} className="btn-ghost py-2.5 text-[13px]">
          <Icon.users className="h-4 w-4" />
          {t('bunker.m.toPlayers')}
        </button>
        <button type="button" onClick={() => onTab('chat')} className="btn-ghost py-2.5 text-[13px]">
          <Icon.chat className="h-4 w-4" />
          {t('bunker.m.toChat')}
        </button>
      </div>
      {state.you?.isHost && (
        <button type="button" onClick={actions.skip} className="btn-primary mt-2 w-full py-3 text-[14.5px]">
          {t('bunker.toVote')}
          <Icon.chevronRight className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

// One candidate in the vote: who they are, what they have shown, and the
// button. Their open cards fold out underneath, so the choice can be made
// without leaving the vote.
function VoteRow({
  player, state, sheet, config, language, t, onChoose, onWithdraw,
}) {
  const [open, setOpen] = useState(false);
  const self = player.id === state.you?.id;
  const chosen = (state.you?.myVotes || []).includes(player.id);
  const canChange = state.settings.voting.allowChange;
  const shielded = (player.effects || []).includes('protected');
  const live = state.vote.live || [];
  const votes = live.find((r) => r.playerId === player.id)?.votes || 0;
  const held = sheet.filter((k) => !player.heldKeys || player.heldKeys.includes(k));
  const opened = held.filter((k) => player.revealed.includes(k));
  const prof = player.revealed.includes('profession') ? player.cards?.profession : null;

  let button = null;
  if (self) {
    button = <span className="shrink-0 px-2 text-[12px] text-parch/40">{t('sidebar.you')}</span>;
  } else if (chosen) {
    button = canChange ? (
      <button type="button" onClick={() => onWithdraw(player.id)} className="flex shrink-0 flex-col items-center rounded-xl border border-orange-400/60 bg-orange-500/15 px-2.5 py-1.5 text-orange-200">
        <span className="text-[12.5px] font-bold">✓ {t('bunker.m.yourVote')}</span>
        <span className="text-[10.5px] text-orange-200/70">{t('bunker.m.withdraw')}</span>
      </button>
    ) : (
      <span className="shrink-0 rounded-xl border border-orange-400/60 bg-orange-500/15 px-2.5 py-2 text-[12.5px] font-bold text-orange-200">✓ {t('bunker.m.yourVote')}</span>
    );
  } else if (state.you?.canVote) {
    button = (
      <button type="button" onClick={() => onChoose(player.id)} className="btn-danger shrink-0 px-3.5 py-2.5 text-[13.5px]">
        {t('bunker.m.against')}
      </button>
    );
  }

  return (
    <li className={`overflow-hidden rounded-2xl border ${chosen ? 'border-orange-400/55 bg-orange-500/[0.07]' : 'border-white/[0.09] bg-black/25'}`}>
      {/* The seat number rides on the name here rather than in its own
          box: the vote button needs the width on a narrow phone. */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar player={player} size="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 text-[15px] font-semibold text-parch">
            <span className="shrink-0 font-mono text-[12.5px] font-bold text-parch/50 tnum">№{player.number}</span>
            <StyledName nickname={player.nickname} cosmetics={player.cosmetics} />
            {shielded && <span title={t('bunker.effect.protected.text')} aria-hidden="true">🛡️</span>}
          </p>
          <p className="truncate text-[12.5px] text-parch/50">
            {prof ? cardText(config, 'profession', prof, language, t) : t('bunker.m.profUnknown')}
          </p>
        </div>
        {!state.vote.secret && votes > 0 && (
          <span className="shrink-0 rounded-lg bg-orange-500/20 px-2 py-1 text-[13px] font-bold text-orange-200 tnum">
            {votes}
          </span>
        )}
        {button}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 border-t border-white/[0.06] px-3 py-2 text-left text-[12.5px] font-semibold text-parch/50 active:bg-white/[0.04]"
      >
        <CharIcon name="extra" className="h-3.5 w-3.5" />
        <span className="flex-1">{t('bunker.m.showCards', { n: opened.length })}</span>
        <Icon.chevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          {opened.length === 0
            ? <p className="text-[12.5px] text-parch/40">{t('bunker.m.noOpenCards')}</p>
            : (
              <ul className="flex flex-col gap-1.5">
                {opened.map((k) => <CardLine key={k} name={k} card={player.cards?.[k] || null} config={config} language={language} t={t} dense />)}
              </ul>
            )}
        </div>
      )}
    </li>
  );
}

function PhoneVote({
  state, sheet, config, language, t, actions,
}) {
  const [pending, setPending] = useState(null);
  const vote = state.vote;
  const candidates = state.players.filter((p) => vote.candidates.includes(p.id));
  const mine = state.you?.myVotes || [];
  const myVote = state.players.find((p) => p.id === mine[0]);
  const multi = vote.mode === 'multi';
  const allowChange = state.settings.voting.allowChange;
  const progress = vote.voterCount ? (vote.votedCount / vote.voterCount) * 100 : 0;
  const missing = Math.max(0, (vote.voterCount || 0) - (vote.votedCount || 0));
  const pendingPlayer = pending ? state.players.find((p) => p.id === pending) : null;
  const alert = vote.revote || state.finalVote;

  let headline = t('bunker.waitVotes');
  if (state.you?.canVote) headline = multi ? t('bunker.voteHintMulti', { n: state.you.votesLeft }) : t('bunker.m.voteQuestion');
  else if (multi && mine.length) headline = t('bunker.votedForMany', { n: mine.length });
  else if (myVote) headline = t('bunker.votedFor', { number: myVote.number, name: myVote.nickname });
  else if (state.you?.status === 'excluded') headline = t('bunker.spectatorVote');

  return (
    <section className={`bunker-plate p-3.5 ${alert ? 'bunker-warn' : ''}`}>
      <p className={`section-label ${alert ? 'text-orange-300' : ''}`}>
        {state.finalVote ? t('bunker.finalVoteTitle') : vote.revote ? t('bunker.revoteTitle') : t('bunker.voteTitle')}
      </p>
      <h2 className="mt-0.5 text-[18px] font-bold leading-snug text-parch">{headline}</h2>
      {state.you?.canVote && (
        <p className="mt-1 text-[13px] leading-snug text-parch/55">
          {t('bunker.m.voteHint')}
          {' '}
          {allowChange ? t('bunker.m.voteHintChange') : t('bunker.m.voteHintFinal')}
        </p>
      )}
      {state.finalVote && <p className="mt-1 text-[12.5px] text-orange-200/85">{t('bunker.finalVoteText', { n: Math.max(0, state.aliveCount - state.seats) })}</p>}
      {vote.reason && vote.reason !== 'normal' && <p className="mt-1 text-[12.5px] text-orange-200/85">{t(`bunker.voteReason.${vote.reason}`)}</p>}

      {(vote.secret || multi) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {vote.secret && <span className="pill bg-white/[0.07] text-parch/60">🕶️ {t('bunker.secretVoteBadge')}</span>}
          {multi && <span className="pill bg-white/[0.07] text-parch/60">{t('bunker.multiVoteBadge', { n: vote.votesPerPlayer })}</span>}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-parch/60 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <span className="shrink-0 font-mono text-[12.5px] text-parch/55 tnum">{t('bunker.votedCount', { n: vote.votedCount, m: vote.voterCount })}</span>
      </div>
      {/* Who has already voted - never who for. */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {state.players.filter((p) => p.status === 'alive').map((p) => (
          <span
            key={p.id}
            title={p.hasVoted ? p.nickname : `${p.nickname} · ${t('bunker.notVotedYet')}`}
            className={`rounded-md border px-1.5 py-px font-mono text-[11.5px] tnum ${
              p.hasVoted ? 'border-go/35 bg-go/[0.10] text-go-light' : 'border-white/[0.08] bg-black/25 text-parch/35'
            }`}
          >
            {p.hasVoted ? '✓' : '·'}№{p.number}
          </span>
        ))}
        {missing > 0 && <span className="ml-1 text-[11.5px] text-parch/35">{t('bunker.needVotes', { n: missing })}</span>}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {candidates.map((p) => (
          <VoteRow
            key={p.id}
            player={p}
            state={state}
            sheet={sheet}
            config={config}
            language={language}
            t={t}
            onChoose={setPending}
            onWithdraw={actions.vote}
          />
        ))}
      </ul>

      {pendingPlayer && (
        <VoteConfirm
          target={pendingPlayer}
          state={state}
          t={t}
          onConfirm={() => { actions.vote(pendingPlayer.id); setPending(null); }}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

function Situation({ state, t }) {
  const extra = Math.max(0, state.aliveCount - state.seats);
  const excluded = state.players.filter((p) => p.status === 'excluded').length;
  const tiles = [
    { label: t('bunker.seatsLabel'), value: state.seats },
    { label: t('bunker.aliveLabel'), value: state.aliveCount, warn: extra <= 1 && state.phase !== 'GAME_OVER' },
    { label: t('bunker.excludedLabel'), value: excluded },
    { label: t('bunker.roundLabel'), value: state.totalRounds > 0 ? `${Math.max(1, state.round)}/${state.totalRounds}` : Math.max(1, state.round) },
  ];
  return (
    <section>
      <div className="grid grid-cols-4 gap-1.5">
        {tiles.map((tile) => (
          <div key={tile.label} className="bunker-plate px-2 py-2 text-center">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-parch/40">{tile.label}</p>
            <p className={`font-display text-[21px] font-black leading-tight tnum ${tile.warn ? 'text-orange-300' : 'text-parch'}`}>{tile.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-1.5 px-1 text-center text-[12px] text-parch/40">
        {extra > 0
          ? t('bunker.m.situation', { seats: state.seats, alive: state.aliveCount, extra })
          : t('bunker.m.situationDone', { seats: state.seats, alive: state.aliveCount })}
        {' · '}
        {state.round < state.firstVoteRound ? t('bunker.noVoteYet') : t('bunker.voteEachRound')}
      </p>
    </section>
  );
}

function TableEffects({ state, t }) {
  if (!(state.tableEffects || []).length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      <span className="section-label">{t('bunker.tableEffects')}</span>
      {[...new Set(state.tableEffects)].map((e) => (
        <span key={e} className="pill bg-orange-500/15 text-orange-200" title={t(`bunker.effect.${e}.text`)}>
          {t(`bunker.effect.${e}.name`)}
        </span>
      ))}
    </div>
  );
}

function GameTab({
  state, me, sheet, config, language, t, actions, spectating, onTab, onLeave, onShowResults,
}) {
  const { phase } = state;
  return (
    <>
      {spectating && <SpectatorBanner onLeave={onLeave} />}
      {me?.status === 'excluded' && phase !== 'GAME_OVER' && (
        <p className="bunker-plate border-orange-500/30 px-3.5 py-2.5 text-[13px] leading-snug text-orange-200/90">⚠ {t('bunker.spectatorBanner')}</p>
      )}

      <EventBanner state={state} t={t} />
      <TableEffects state={state} t={t} />

      {phase === 'REVEAL' && <RevealStage state={state} me={me} sheet={sheet} config={config} language={language} t={t} actions={actions} />}
      {phase === 'DISCUSSION' && <PhoneDiscussion state={state} t={t} actions={actions} onTab={onTab} />}
      {phase === 'VOTE' && state.vote && <PhoneVote state={state} sheet={sheet} config={config} language={language} t={t} actions={actions} />}
      {phase === 'RESULT' && <ResultPanel state={state} t={t} language={language} actions={actions} />}
      {phase === 'GAME_OVER' && state.results && (
        <section className="bunker-plate p-3.5 text-center">
          <p className="section-label">{t('bunker.gameOver')}</p>
          <p className="mt-1 font-display text-[20px] font-black text-parch">{t(`bunker.verdict.${state.results.verdict}.title`)}</p>
          <button type="button" onClick={onShowResults} className="btn-primary mt-3 w-full py-3">{t('bunker.m.showResults')}</button>
        </section>
      )}

      {/* The hand sits right under the action of the moment, because a
          card is almost always played in reaction to it. */}
      {phase !== 'GAME_OVER' && (
        <HandPanel state={state} config={config} language={language} t={t} onPlay={actions.playCard} spectating={spectating} />
      )}

      {(phase === 'REVEAL' || phase === 'DISCUSSION') && <RoundReveals state={state} config={config} language={language} t={t} />}

      <Situation state={state} t={t} />
    </>
  );
}

// --- the Me tab ----------------------------------------------------------

function MeTab({
  state, me, sheet, config, language, t, spectating,
}) {
  if (spectating || !me) {
    return (
      <section className="bunker-plate flex items-center gap-3 p-4">
        <Icon.eye className="h-6 w-6 shrink-0 text-parch/40" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-parch/65">{t('bunker.m.spectatorMe')}</p>
      </section>
    );
  }
  const out = me.status === 'excluded';
  const blind = state.you?.blind || [];
  const held = sheet.filter((k) => !me.heldKeys || me.heldKeys.includes(k));
  const open = held.filter((k) => me.revealed.includes(k));
  const secret = held.filter((k) => !me.revealed.includes(k));
  const share = held.length ? (open.length / held.length) * 100 : 0;

  return (
    <>
      <section className={`bunker-plate p-3.5 ${out ? 'border-orange-500/30' : 'border-brass/25'}`}>
        <div className="flex items-center gap-3">
          <Avatar player={me} size="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-[17px] font-bold text-parch">
              <span className="font-mono text-parch/55 tnum">№{me.number}</span>
              <StyledName nickname={me.nickname} cosmetics={me.cosmetics} />
            </p>
            <p className={`text-[12.5px] font-semibold ${out ? 'text-orange-300' : 'text-go-light'}`}>
              {out ? t('bunker.m.statusOut') : t('bunker.m.statusIn')}
              {out && <span className="font-normal text-parch/45"> · {t(`bunker.outReason.${me.exclusionReason || 'vote'}`, { round: me.excludedRound })}</span>}
            </p>
          </div>
        </div>
        <EffectPills effects={me.effects} t={t} />
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-brass-light/70" style={{ width: `${share}%` }} />
          </div>
          <span className="shrink-0 text-[12px] text-parch/50 tnum">{t('bunker.m.openedOf', { n: open.length, m: held.length })}</span>
        </div>
      </section>

      <section>
        <SectionTitle className="mb-2">
          <span className="inline-flex items-center gap-1.5"><Icon.eye className="h-3.5 w-3.5" />{t('bunker.m.openToAll', { n: open.length })}</span>
        </SectionTitle>
        {open.length === 0
          ? <p className="bunker-hatch rounded-xl px-3 py-3 text-center text-[13px] text-parch/40">{t('bunker.m.noneOpen')}</p>
          : (
            <ul className="flex flex-col gap-1.5">
              {open.map((k) => (
                <CardLine key={k} name={k} card={me.cards?.[k] || null} config={config} language={language} t={t} fresh={me.revealedThisRound === k} />
              ))}
            </ul>
          )}
      </section>

      <section>
        <SectionTitle className="mb-2">
          <span className="inline-flex items-center gap-1.5"><Icon.lock className="h-3.5 w-3.5" />{t('bunker.m.onlyYou', { n: secret.length })}</span>
        </SectionTitle>
        {secret.length === 0
          ? <p className="bunker-hatch rounded-xl px-3 py-3 text-center text-[13px] text-parch/40">{t('bunker.m.allOpen')}</p>
          : (
            <ul className="flex flex-col gap-1.5">
              {secret.map((k) => (
                <CardLine key={k} name={k} card={me.cards?.[k] || null} blind={blind.includes(k)} isPublic={false} config={config} language={language} t={t} />
              ))}
            </ul>
          )}
      </section>

      <PrivateFeed state={state} config={config} language={language} t={t} />
    </>
  );
}

// --- the Players tab -----------------------------------------------------

function PlayerRow({
  player, state, sheet, config, language, t, open, onToggle,
}) {
  const out = player.status === 'excluded';
  const held = sheet.filter((k) => !player.heldKeys || player.heldKeys.includes(k));
  const opened = out ? held : held.filter((k) => player.revealed.includes(k));
  const hidden = held.filter((k) => !opened.includes(k));
  const prof = out || player.revealed.includes('profession') ? player.cards?.profession : null;
  const fresh = player.revealedThisRound;
  const myVote = (state.you?.myVotes || []).includes(player.id);

  const pills = [];
  if (!out && player.isCurrent) pills.push(<span key="cur" className="pill bg-brass/25 text-brass-light">{t('bunker.revealingNow')}</span>);
  if (!out && state.phase === 'VOTE') {
    pills.push(player.hasVoted
      ? <span key="v" className="pill bg-go/20 text-go-light">✓ {t('bunker.hasVoted')}</span>
      : <span key="v" className="pill bg-white/[0.06] text-parch/40">{t('bunker.thinking')}</span>);
  }
  if (myVote) pills.push(<span key="mine" className="pill bg-orange-500/20 text-orange-200">✓ {t('bunker.yourVoteHere')}</span>);

  return (
    <li className={`overflow-hidden rounded-2xl border ${
      !out && player.isCurrent ? 'border-brass-light/60 bg-brass/[0.06]' : player.isYou ? 'border-brass/25 bg-white/[0.03]' : 'border-white/[0.08] bg-white/[0.03]'
    } ${out ? 'opacity-80 grayscale-[0.6]' : ''}`}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-white/[0.03]">
        <SeatBadge number={player.number} />
        <Avatar player={player} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-[15px] font-semibold text-parch">
            <StyledName nickname={player.nickname} cosmetics={player.cosmetics} />
            {player.isYou && <span className="shrink-0 text-[11px] font-normal text-parch/45">({t('waiting.you')})</span>}
            {player.isBot && <span className="shrink-0 rounded bg-white/[0.08] px-1 text-[9.5px] font-bold uppercase text-parch/45">{t('bunker.bot')}</span>}
            {player.isHost && <Icon.crown className="h-3.5 w-3.5 shrink-0 text-brass/80" title={t('waiting.host')} />}
          </span>
          <span className={`block truncate text-[12.5px] ${prof ? 'text-parch/65' : 'text-parch/35'}`}>
            {prof ? cardText(config, 'profession', prof, language, t) : t('bunker.m.profUnknown')}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1.5">
            {/* How many action cards a player still holds is public; which
                ones they are never is. */}
            {player.cardsInHand > 0 && !out && (
              <span className="rounded-md bg-violet-400/[0.12] px-1 text-[11px] font-bold text-violet-200 tnum" title={t('bunker.cards.inHand', { n: player.cardsInHand })}>
                🃏{player.cardsInHand}
              </span>
            )}
            <span className="font-mono text-[12px] text-parch/50 tnum" title={t('bunker.m.openCount', { n: opened.length, m: held.length })}>{opened.length}/{held.length}</span>
          </span>
          <Icon.chevronDown className={`h-4 w-4 text-parch/40 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {(out || pills.length > 0 || (fresh && !out) || (player.effects || []).length > 0 || !player.connected || player.left) && (
        <div className="-mt-1 flex flex-col gap-1.5 px-3 pb-2.5">
          {out && (
            <p className="flex flex-wrap items-center gap-x-2 text-[12px]">
              <span className="font-mono font-black uppercase tracking-[0.14em] text-orange-300">{t('bunker.outside')}</span>
              <span className="text-parch/45">{t(`bunker.outReason.${player.exclusionReason || 'vote'}`, { round: player.excludedRound })}</span>
            </p>
          )}
          {fresh && !out && player.cards?.[fresh] && (
            <p className="truncate text-[12.5px] text-parch/60">
              <span className="font-semibold text-brass-light">{t('bunker.m.new')}:</span>
              {' '}
              {t(`bunker.char.${fresh}`)}
              {' — '}
              <b className="font-semibold text-parch">{cardText(config, fresh, player.cards[fresh], language, t)}</b>
            </p>
          )}
          {(pills.length > 0 || !player.connected || player.left) && (
            <div className="flex flex-wrap items-center gap-1">
              {pills}
              {(!player.connected || player.left) && <PlayerStatus player={player} compact />}
            </div>
          )}
          <EffectPills effects={player.effects} t={t} />
        </div>
      )}

      {open && (
        <div className="border-t border-white/[0.06] px-3 pb-3 pt-2.5">
          {opened.length === 0
            ? <p className="text-[13px] text-parch/40">{t('bunker.m.noOpenCards')}</p>
            : (
              <ul className="flex flex-col gap-1.5">
                {opened.map((k) => (
                  <CardLine key={k} name={k} card={player.cards?.[k] || null} config={config} language={language} t={t} dense fresh={fresh === k && !out} />
                ))}
              </ul>
            )}
          {hidden.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-parch/40">
              <Icon.lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('bunker.m.hiddenRest', { list: hidden.map((k) => t(`bunker.char.${k}`)).join(', ') })}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function PlayersTab({
  state, sheet, config, language, t,
}) {
  const [openIds, setOpenIds] = useState(() => new Set());
  const alive = state.players.filter((p) => p.status !== 'excluded');
  const out = state.players.filter((p) => p.status === 'excluded');
  const allOpen = state.players.length > 0 && state.players.every((p) => openIds.has(p.id));
  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const row = (p) => (
    <PlayerRow
      key={p.id}
      player={p}
      state={state}
      sheet={sheet}
      config={config}
      language={language}
      t={t}
      open={openIds.has(p.id)}
      onToggle={() => toggle(p.id)}
    />
  );
  return (
    <>
      <SectionTitle
        right={(
          <button
            type="button"
            onClick={() => setOpenIds(allOpen ? new Set() : new Set(state.players.map((p) => p.id)))}
            className="rounded-lg px-2 py-1 text-[12.5px] font-semibold text-brass-light active:bg-white/[0.06]"
          >
            {allOpen ? t('bunker.m.collapseAll') : t('bunker.m.expandAll')}
          </button>
        )}
      >
        {t('bunker.m.inGame', { n: alive.length })}
      </SectionTitle>
      <ul className="flex flex-col gap-2">{alive.map(row)}</ul>
      {out.length > 0 && (
        <>
          <SectionTitle className="mt-2">
            <span className="text-orange-300/80">{t('bunker.m.outsideN', { n: out.length })}</span>
          </SectionTitle>
          <ul className="flex flex-col gap-2">{out.map(row)}</ul>
        </>
      )}
      <SpectatorStrip spectators={state.spectators} />
    </>
  );
}

// --- the Shelter tab -----------------------------------------------------

function PhoneLog({
  log, config, language, t,
}) {
  const [all, setAll] = useState(false);
  const entries = useMemo(() => log.filter((e) => e.type !== 'VOTE_CAST').slice().reverse(), [log]);
  const shown = all ? entries : entries.slice(0, 25);
  if (!entries.length) return null;
  return (
    <section className="bunker-plate p-3.5">
      <SectionTitle className="mb-2">📜 {t('bunker.history')}</SectionTitle>
      <ol className="flex flex-col gap-1.5">
        {shown.map((e, i) => (
          <li
            // eslint-disable-next-line react/no-array-index-key
            key={`${e.ts}-${i}`}
            className={`text-[13px] leading-snug ${
              e.type === 'ROUND_STARTED' ? 'pt-1.5 text-[11.5px] font-bold uppercase tracking-wide text-parch/45'
                : ['EXCLUDED', 'EXCLUDED_BY_LOT', 'PLAYER_LEFT'].includes(e.type) ? 'text-orange-300/90'
                  : 'text-parch/70'
            }`}
          >
            {formatBunkerLog(e, { t, config, language })}
          </li>
        ))}
      </ol>
      {entries.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="btn-quiet mt-2 w-full py-2 text-[13px]">
          <Icon.chevronDown className="h-4 w-4" />
          {entries.length - shown.length}
        </button>
      )}
    </section>
  );
}

function ShelterTab({
  state, config, language, t, lastTally,
}) {
  return (
    <>
      <BunkerInfo state={state} config={config} language={language} t={t} />
      <Situation state={state} t={t} />
      <TableEffects state={state} t={t} />
      {lastTally && state.phase !== 'RESULT' && lastTally.tally.length > 0 && (
        <section className="bunker-plate p-3.5">
          <p className="section-label mb-2">{t('bunker.lastVote', { round: lastTally.round })}</p>
          <Tally vote={lastTally} players={state.players} t={t} language={language} />
        </section>
      )}
      <CardHistory state={state} t={t} />
      <PhoneLog log={state.log} config={config} language={language} t={t} />
      <SpectatorStrip spectators={state.spectators} />
    </>
  );
}

// --- the end of the game -----------------------------------------------

function ResultPerson({
  player, state, sheet, config, language, t, tone, note = null,
}) {
  const [open, setOpen] = useState(false);
  const muted = state.results?.mutedCategories || [];
  const held = sheet.filter((k) => !player.heldKeys || player.heldKeys.includes(k));
  const prof = player.cards?.profession;
  return (
    <li className={`overflow-hidden rounded-2xl border ${tone}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <SeatBadge number={player.number} />
        <Avatar player={player} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-[15px] font-semibold text-parch">
            <StyledName nickname={player.nickname} cosmetics={player.cosmetics} />
            {player.isYou && <span className="shrink-0 text-[11px] font-normal text-parch/45">({t('waiting.you')})</span>}
          </span>
          <span className="block truncate text-[12.5px] text-parch/55">
            {prof ? cardText(config, 'profession', prof, language, t) : '—'}
            {note && <span className="text-parch/40"> · {note}</span>}
          </span>
        </span>
        <Icon.chevronDown className={`h-4 w-4 shrink-0 text-parch/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 border-t border-white/[0.06] px-3 pb-3 pt-2.5">
          {held.map((k) => (
            <CardLine key={k} name={k} card={player.cards?.[k] || null} config={config} language={language} t={t} dense muted={muted.includes(k)} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PhoneGameOver({
  state, config, language, t, actions, onLeave, sheet, onHide,
}) {
  const { results } = state;
  const me = state.players.find((p) => p.isYou);
  const survived = !!me && results.survivorIds.includes(me.id);
  useOutcomeEffects(me ? (survived ? 'win' : 'loss') : null, `${state.roomCode}-${state.round}-${results.survivorIds.join(',')}`);
  const survivors = state.players.filter((p) => results.survivorIds.includes(p.id));
  const byId = (id) => state.players.find((p) => p.id === id);
  const isHost = !!state.you?.isHost;

  return (
    <div className="table-bunker fixed inset-0 z-40 flex flex-col" role="dialog" aria-modal="true" aria-label={t('bunker.gameOver')}>
      <div className="flex shrink-0 items-center justify-end px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onHide}
          aria-label={t('phone.close')}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-parch/50 active:bg-white/10"
        >
          <Icon.close className="h-5 w-5" />
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        <div className="animate-scale-in text-center">
          <span className="text-[44px] leading-none" aria-hidden="true">{me ? (survived ? '🛡️' : '☢️') : '🚪'}</span>
          <p className="section-label mt-2">{t('bunker.gameOver')}</p>
          <h2 className={`mt-1 font-display text-[28px] font-black leading-tight ${me && !survived ? 'text-orange-300' : 'text-parch'}`}>
            {me ? (survived ? t('bunker.youSurvived') : t('bunker.youOutside')) : t('bunker.survivorsTitle')}
          </h2>
          <div className="bunker-plate mt-3 px-3.5 py-3 text-left">
            <p className="text-[15px] font-bold text-parch">{t(`bunker.verdict.${results.verdict}.title`)}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-parch/60">{t(`bunker.verdict.${results.verdict}.text`)}</p>
            <p className="mt-2 text-[12px] text-parch/40">{t('bunker.summary', { rounds: results.rounds, seats: results.seats, score: results.colonyScore })}</p>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <span className="pill bg-brass/20 text-brass-light">{t(`bunker.scenario.${results.scenario || state.scenario}`)}</span>
            {results.cardsPlayed > 0 && <span className="pill bg-violet-400/20 text-violet-200">{t('bunker.endCards', { n: results.cardsPlayed })}</span>}
            {(results.events || []).length > 0 && <span className="pill bg-orange-400/20 text-orange-200">{t('bunker.endEvents', { n: results.events.length })}</span>}
          </div>
        </div>

        <h3 className="mb-2 mt-5 px-1 text-[12.5px] font-bold uppercase tracking-wide text-go-light">{t('bunker.survivors', { n: survivors.length })}</h3>
        <ul className="flex flex-col gap-2">
          {survivors.map((p) => (
            <ResultPerson key={p.id} player={p} state={state} sheet={sheet} config={config} language={language} t={t} tone="border-go/30 bg-go/[0.06]" />
          ))}
        </ul>

        {results.excluded.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 px-1 text-[12.5px] font-bold uppercase tracking-wide text-orange-300/90">{t('bunker.excludedTitle')}</h3>
            <ul className="flex flex-col gap-2">
              {results.excluded.map((row) => {
                const p = byId(row.playerId);
                if (!p) return null;
                return (
                  <ResultPerson
                    key={row.playerId}
                    player={p}
                    state={state}
                    sheet={sheet}
                    config={config}
                    language={language}
                    t={t}
                    tone="border-white/[0.08] bg-black/25"
                    note={t(`bunker.outReason.${row.reason || 'vote'}`, { round: row.round })}
                  />
                );
              })}
            </ul>
          </>
        )}
      </div>
      <footer className="shrink-0 border-t border-white/[0.08] bg-[#121315]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {isHost ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => actions.restart(true)} className="btn-primary py-3">☢️ {t('bunker.newGame')}</button>
            <button type="button" onClick={() => actions.restart(false)} className="btn-ghost py-3">
              <Icon.settings className="h-4 w-4" />
              {t('mafia.changeSettings')}
            </button>
          </div>
        ) : (
          <p className="pb-1 text-center text-[12.5px] text-parch/45">{t('mafia.waitingForHost')}</p>
        )}
        <button type="button" onClick={onLeave} className="btn-quiet mt-1.5 w-full py-2.5">{t('mafia.backToMenu')}</button>
      </footer>
    </div>
  );
}

// --- the screen ----------------------------------------------------------
export default function BunkerMobile({
  state, chat, actions, onLeave, spectating,
}) {
  const { t, language } = useTranslation();
  const config = useBunkerConfig();
  const me = state.players.find((p) => p.isYou);
  // The characteristics THIS table deals - not a fixed seven.
  const sheet = useMemo(() => charOrder(state), [state.categories]);
  const [tab, setTab] = useState('table');
  const [resultsHidden, setResultsHidden] = useState(false);
  const [lastTally, setLastTally] = useState(null);

  const mustAct = !spectating && (!!state.you?.canReveal || !!state.you?.canVote);
  const unread = useUnread(chat, tab === 'chat', me?.id);
  useTurnSound(mustAct);

  // Keep the last finished vote on the Shelter tab after the next round.
  useEffect(() => {
    if (state.lastVote && state.lastVote.outcome !== 'tie') setLastTally(state.lastVote);
  }, [state.lastVote]);
  useEffect(() => {
    if (state.phase === 'LOBBY') setLastTally(null);
    if (state.phase !== 'GAME_OVER') setResultsHidden(false);
  }, [state.phase]);

  if (!config) {
    return (
      <div className="table-bunker phone-frame flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-brass" />
      </div>
    );
  }

  const inGame = !spectating && !!me && !me.left && me.status === 'alive' && state.phase !== 'GAME_OVER';
  const showResults = state.phase === 'GAME_OVER' && state.results && !resultsHidden;

  const tabs = [
    {
      id: 'table',
      label: t('bunker.m.tab.table'),
      icon: <Icon.target />,
      content: (
        <PhoneStack>
          <GameTab
            state={state}
            me={me}
            sheet={sheet}
            config={config}
            language={language}
            t={t}
            actions={actions}
            spectating={spectating}
            onTab={setTab}
            onLeave={onLeave}
            onShowResults={() => setResultsHidden(false)}
          />
        </PhoneStack>
      ),
    },
    {
      id: 'me',
      label: t('bunker.m.tab.me'),
      icon: <CharIcon name="biology" />,
      content: <PhoneStack><MeTab state={state} me={me} sheet={sheet} config={config} language={language} t={t} spectating={spectating} /></PhoneStack>,
    },
    {
      id: 'players',
      label: t('bunker.m.tab.players'),
      icon: <Icon.users />,
      content: <PhoneStack><PlayersTab state={state} sheet={sheet} config={config} language={language} t={t} /></PhoneStack>,
    },
    {
      id: 'bunker',
      label: t('bunker.m.tab.bunker'),
      icon: <PhoneIcon.hatch />,
      content: <PhoneStack><ShelterTab state={state} config={config} language={language} t={t} lastTally={lastTally} /></PhoneStack>,
    },
    {
      id: 'chat',
      label: t('bunker.m.tab.chat'),
      icon: <Icon.chat />,
      badge: unread,
      fill: true,
      content: (
        <RoomChat
          messages={chat}
          onSend={actions.sendChat}
          players={state.players}
          myPlayerId={me?.id}
          renderSystem={(m) => t(`bunker.system.${m.type}`, m.params)}
          nameTone={(m) => (m.excluded ? 'text-parch/40' : 'text-parch')}
          channelBadge={(m) => (m.number ? <span className="mr-1 font-mono text-parch/40">№{m.number}</span> : null)}
          variant="bubbles"
          className="min-h-0 flex-1"
        />
      ),
    },
  ];

  return (
    <PhoneGame
      gameId="bunker"
      state={state}
      theme="table-bunker"
      kicker={`☢️ ${t('menu.bunker.title')} · ${t('bunker.roundN', { n: Math.max(1, state.round) })}${state.totalRounds > 0 ? ` / ${state.totalRounds}` : ''}`}
      title={t(`bunker.m.phase.${state.phase}`)}
      endsAt={state.phaseEndsAt}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      act={{ tab: 'table', active: mustAct, text: state.you?.canVote ? t('bunker.m.goVote') : t('bunker.m.goReveal') }}
      resetKey={`${state.phase}-${state.round}`}
      roomCode={state.roomCode}
      onLeave={onLeave}
      onSurrender={inGame ? actions.surrender : null}
      leaveHint={inGame ? t('bunker.m.leaveHint') : null}
    >
      {showResults && (
        <PhoneGameOver
          state={state}
          config={config}
          language={language}
          t={t}
          actions={actions}
          onLeave={onLeave}
          sheet={sheet}
          onHide={() => setResultsHidden(true)}
        />
      )}
    </PhoneGame>
  );
}
