// MemeHypePhone.jsx
// A Meme Hype player's phone: a controller, not a small copy of the big
// screen. One thing at a time, big targets in thumb reach, and the action
// button always in the same place at the bottom.
//
//   lobby   - you are in, ready button
//   pick    - your hand; tap a meme, confirm at the bottom
//   vote    - the anonymous memes; tap one (never your own), confirm
//   reveal  - what your meme got
//   final   - your place and score

import { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { useMemeHype } from '../../../hooks/useMemeHype';
import { SurrenderButton } from '../../room/RoomStatus';
import {
  PhoneFrame, PhoneJoinForm, ReconnectStrip, usePhoneSeat,
} from '../../play/PhoneShell';
import MemeCard from './MemeCard';
import {
  Avatar, Confetti, StatusBadge, TimerRing,
} from './parts';

const vibrate = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not on this phone */ } };

function Situation({ state }) {
  const { t } = useTranslation();
  const total = state.phase === 'PICK' ? state.settings.pickSec : state.settings.voteSec;
  return (
    <div className="hype-panel flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-pink-300">
          {t('hype.game.situation', { n: state.round, of: state.settings.rounds })}
          {state.finalRound && ' · ×2'}
        </p>
        <p className="mt-1 text-[16px] font-bold leading-snug text-white">{state.situation?.text}</p>
      </div>
      {(state.phase === 'PICK' || state.phase === 'VOTE') && <TimerRing endsAt={state.phaseEndsAt} total={total} size={52} />}
    </div>
  );
}

function Waiting({ icon, title, note }) {
  return (
    <div className="hype-panel hype-pop flex flex-col items-center gap-2 p-6 text-center">
      <span className="hype-float text-[54px] leading-none">{icon}</span>
      <p className="text-[18px] font-black text-white">{title}</p>
      {note && <p className="text-[13px] text-white/55">{note}</p>}
    </div>
  );
}

function PickStep({ state, actions, setFooter }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null);
  const { you } = state;
  const hand = you?.hand || [];

  // A card chosen from an earlier hand is not in this one.
  useEffect(() => {
    if (selected && !hand.some((m) => m.id === selected)) setSelected(null);
  }, [hand, selected]);

  const confirm = async () => {
    if (!selected || sending) return;
    setSending(true);
    setProblem(null);
    const res = await actions.pick(selected);
    setSending(false);
    if (res?.ok) vibrate(30);
    else setProblem(res?.error || t('chpok.phone.sendFailed'));
  };

  useEffect(() => {
    if (!you?.canPick) {
      setFooter(null);
      return;
    }
    setFooter(
      <button type="button" onClick={confirm} disabled={!selected || sending} className="hype-btn w-full py-4 text-[18px]">
        {sending ? '…' : selected ? `✅ ${t('hype.phone.playThis')}` : t('hype.phone.tapAMeme')}
      </button>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sending, you?.canPick]);

  if (you?.myPick) {
    return (
      <>
        <div className="hype-pop mx-auto w-2/3">
          <MemeCard meme={you.myPick.meme} size="md" />
        </div>
        <Waiting
          icon="😎"
          title={you.myPick.auto ? t('hype.phone.autoPicked') : t('hype.phone.picked')}
          note={t('hype.phone.waitingFor', { n: state.waitingOn.length })}
        />
      </>
    );
  }
  if (!you?.canPick) return <Waiting icon="⏳" title={t('hype.phone.sitOut')} />;

  return (
    <>
      <p className="px-1 text-[13px] font-bold text-white/60">{t('hype.phone.yourHand')}</p>
      <div className="grid grid-cols-2 gap-3">
        {hand.map((m, i) => {
          const on = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => { setSelected(m.id); vibrate(10); }}
              aria-pressed={on}
              className={`hype-pop rounded-2xl transition ${on ? 'scale-[1.03] ring-4 ring-amber-300' : 'opacity-90 active:scale-95'}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <MemeCard meme={m} size="md" />
            </button>
          );
        })}
      </div>
      {problem && <p className="text-center text-[13px] font-bold text-rose-300">{problem}</p>}
    </>
  );
}

function VoteStep({ state, actions, setFooter }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null);
  const { you } = state;
  const chosen = state.cards.find((c) => c.id === selected);

  const confirm = async () => {
    if (!selected || sending) return;
    setSending(true);
    setProblem(null);
    const res = await actions.vote(selected);
    setSending(false);
    if (res?.ok) vibrate(30);
    else setProblem(res?.error || t('chpok.phone.voteFailed'));
  };

  useEffect(() => {
    if (!you?.canVote) {
      setFooter(null);
      return;
    }
    setFooter(
      <button type="button" onClick={confirm} disabled={!selected || sending} className="hype-btn w-full py-4 text-[18px]">
        {sending ? '…' : chosen ? `🗳️ ${t('hype.phone.voteFor', { n: chosen.index })}` : t('hype.phone.tapToVote')}
      </button>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sending, you?.canVote]);

  if (you?.myVote) {
    const mine = state.cards.find((c) => c.id === you.myVote);
    return (
      <>
        {mine && <div className="hype-pop mx-auto w-2/3"><MemeCard meme={mine.meme} size="md" label={`MEM #${mine.index}`} /></div>}
        <Waiting icon="🗳️" title={t('hype.phone.voted')} note={t('hype.phone.waitingFor', { n: state.waitingOn.length })} />
      </>
    );
  }
  if (!you?.canVote) return <Waiting icon="👀" title={t('hype.phone.watchVote')} />;

  return (
    <>
      <p className="px-1 text-[13px] font-bold text-white/60">{t('hype.phone.pickFunniest')}</p>
      <div className="grid grid-cols-2 gap-3">
        {state.cards.map((c, i) => {
          const on = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={c.mine}
              onClick={() => { setSelected(c.id); vibrate(10); }}
              aria-pressed={on}
              className={`hype-flip relative rounded-2xl transition ${on ? 'scale-[1.03] ring-4 ring-sky-400' : ''} ${c.mine ? 'opacity-40' : 'active:scale-95'}`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <MemeCard meme={c.meme} size="md" label={`MEM #${c.index}`} />
              {c.mine && (
                <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/75 py-1 text-center text-[12px] font-black text-white">
                  {t('hype.phone.yours')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {problem && <p className="text-center text-[13px] font-bold text-rose-300">{problem}</p>}
    </>
  );
}

function RevealStep({ state }) {
  const { t } = useTranslation();
  const result = state.roundResult;
  const mine = result?.entries.find((e) => e.playerId === state.you?.id);
  const winner = result?.entries.find((e) => e.winner);
  return (
    <>
      {mine?.winner && <Confetti count={40} />}
      {mine ? (
        <div className={`hype-panel hype-pop flex flex-col items-center gap-2 p-4 text-center ${mine.winner ? 'hype-winner' : ''}`}>
          <p className="text-[13px] font-black uppercase tracking-wide text-white/60">
            {mine.winner ? `🏆 ${t('hype.phone.youWon')}` : t('hype.phone.yourMeme')}
          </p>
          <div className="w-1/2"><MemeCard meme={mine.meme} size="sm" /></div>
          <p className="hype-bump text-[40px] font-black text-amber-200 tabular-nums">+{mine.points}</p>
          <p className="text-[14px] text-white/65">{t('hype.game.votes', { n: mine.votes })}</p>
        </div>
      ) : (
        <Waiting icon="🙈" title={t('hype.phone.noMeme')} />
      )}
      {winner && !mine?.winner && (
        <div className="hype-panel flex items-center gap-3 p-3">
          <div className="w-16 shrink-0"><MemeCard meme={winner.meme} size="sm" /></div>
          <p className="text-[14px] text-white/80">🏆 <b>{winner.nickname}</b> · {t('hype.game.votes', { n: winner.votes })}</p>
        </div>
      )}
    </>
  );
}

function FinalStep({ state }) {
  const { t } = useTranslation();
  const results = state.results;
  const index = results ? results.standings.findIndex((r) => r.playerId === state.you?.id) : -1;
  const row = index >= 0 ? results.standings[index] : null;
  const won = row && results.winnerIds.includes(row.playerId);
  return (
    <>
      {won && <Confetti count={70} />}
      <div className="hype-panel hype-pop flex flex-col items-center gap-1 p-6 text-center">
        <span className="text-[60px] leading-none">{['🥇', '🥈', '🥉'][index] || '🎉'}</span>
        <p className="text-[22px] font-black text-white">{t('hype.phone.place', { n: index + 1 })}</p>
        <p className="text-[44px] font-black text-amber-200 tabular-nums">{row?.score ?? 0}</p>
        <p className="text-[13.5px] text-white/60">
          {t('hype.phone.finalStats', { wins: row?.roundWins ?? 0, votes: row?.votesReceived ?? 0 })}
        </p>
      </div>
      <ol className="flex flex-col gap-1.5">
        {(results?.standings || []).map((r, i) => (
          <li key={r.playerId} className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2">
            <span className="w-5 text-center font-black text-white/45 tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-bold text-white">{r.nickname}</span>
            <span className="font-black text-amber-200 tabular-nums">{r.score}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-[12.5px] text-white/45">{t('chpok.phone.waitHost')}</p>
    </>
  );
}

export default function MemeHypePhone({ roomCode, auth }) {
  const { t } = useTranslation();
  const room = useMemeHype(auth.token, { device: 'phone' });
  const { join, joinError, inRoom } = usePhoneSeat(room, roomCode);
  const [footer, setFooter] = useState(null);
  const { state } = room;

  useEffect(() => { document.title = `Meme Hype · ${roomCode}`; }, [roomCode]);

  if (!inRoom) {
    return (
      <PhoneJoinForm
        roomCode={roomCode}
        busy={room.busy}
        error={joinError}
        onJoin={join}
        title="MEME HYPE"
        emoji="😂"
        theme="table-hype"
      />
    );
  }

  const me = state.players.find((p) => p.isYou);
  const out = room.spectating || !me || me.left || !!me.exitReason;

  let step;
  if (out && state.phase === 'LOBBY') {
    // A new match is being set up: whoever was out of the last one may
    // take a seat again.
    step = (
      <div className="hype-panel flex flex-col items-center gap-3 p-5 text-center">
        <span className="text-[54px]">🎟️</span>
        <p className="text-[17px] font-black text-white">{t('hype.phone.newMatch')}</p>
        <button
          type="button"
          onClick={() => join(localStorage.getItem('landmark_nickname') || 'Player')}
          className="hype-btn w-full py-5 text-[20px]"
        >
          {t('chpok.phone.takeSeat')}
        </button>
        {joinError && <p className="text-[13px] text-rose-300">{joinError}</p>}
      </div>
    );
  } else if (out) {
    step = <Waiting icon="📺" title={t('chpok.phone.outOfGame')} note={t('chpok.phone.watchOnBigScreen')} />;
  } else if (state.phase === 'LOBBY') {
    step = (
      <div className="hype-panel flex flex-col items-center gap-3 p-5 text-center">
        <Avatar player={me} size={84} />
        <p className="text-[22px] font-black text-white">{me.nickname}</p>
        <StatusBadge player={me} />
        <p className="text-[13.5px] text-white/60">{t('hype.phone.connected')}</p>
        <button
          type="button"
          onClick={() => { room.actions.setReady(!me.ready); vibrate(20); }}
          className={`w-full rounded-2xl py-5 text-[20px] font-black ${me.ready ? 'bg-white/10 text-white' : 'hype-btn'}`}
        >
          {me.ready ? t('mafia.cancelReady') : `👍 ${t('mafia.imReady')}`}
        </button>
      </div>
    );
  } else if (state.phase === 'PICK') {
    step = <PickStep key={`p${state.round}`} state={state} actions={room.actions} setFooter={setFooter} />;
  } else if (state.phase === 'VOTE') {
    step = <VoteStep key={`v${state.round}`} state={state} actions={room.actions} setFooter={setFooter} />;
  } else if (state.phase === 'REVEAL') {
    step = <RevealStep state={state} />;
  } else {
    step = <FinalStep state={state} />;
  }

  const actionPhase = !out && (state.phase === 'PICK' || state.phase === 'VOTE');

  return (
    <PhoneFrame
      theme="table-hype"
      footer={!out && state.phase !== 'GAME_OVER' && (
        <div className="flex flex-col gap-2">
          {actionPhase && footer}
          <div className="flex items-center gap-2">
            <Avatar player={me} size={28} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white/70">{me.nickname}</span>
            <span key={me.score} className="hype-bump rounded-lg bg-amber-300/20 px-2 py-1 text-[15px] font-black text-amber-200 tabular-nums">{me.score}</span>
            {state.phase !== 'LOBBY' && (
              <SurrenderButton onSurrender={room.actions.surrender} className="btn-danger px-3 py-2 text-[12.5px]" />
            )}
          </div>
        </div>
      )}
    >
      <ReconnectStrip connected={room.connected} />
      <header className="flex items-center gap-2">
        <span className="hype-title font-display text-[20px] font-black">MEME HYPE</span>
        <span className="min-w-0 flex-1 truncate text-right text-[12px] font-bold text-white/50">{t(`hype.phase.${state.phase}`)}</span>
      </header>
      {room.error && <p className="rounded-xl bg-rose-500/20 px-3 py-2 text-[13px] text-rose-200">{room.error}</p>}
      {!out && (state.phase === 'PICK' || state.phase === 'VOTE' || state.phase === 'REVEAL') && <Situation state={state} />}
      {step}
    </PhoneFrame>
  );
}
