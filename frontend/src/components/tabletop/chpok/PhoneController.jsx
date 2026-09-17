// PhoneController.jsx
// What a phone shows after it scans the QR code on the big screen.
//
// The page is reached at /play/<ROOM CODE>, so the code is already in the
// URL by the time it opens: the phone asks for a name and nothing else.
// From then on it shows one thing at a time - write your answer, or pick
// the best one - because it is being looked at in a hand, in a room where
// the interesting screen is the big one.
//
// It says exactly two things to the server per round, each once. Nothing
// here decides anything: whether an answer is accepted, whether a vote
// counts, and what it was worth are all the server's to say.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { useChpok } from '../../../hooks/useChpok';
import { PhaseClock, SurrenderButton } from '../../room/RoomStatus';
import LanguageSwitcher from '../../LanguageSwitcher';
import Icon from '../../icons';

const NICKNAME_KEY = 'landmark_nickname';

function Shell({ children, footer }) {
  return (
    <div className="table-night flex min-h-[100dvh] flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-4">{children}</div>
      {footer && <div className="sticky bottom-0 border-t border-white/[0.07] bg-felt-800/95 px-4 py-3 backdrop-blur">{footer}</div>}
    </div>
  );
}

function Banner({ connected }) {
  const { t } = useTranslation();
  if (connected) return null;
  return (
    <div className="rounded-xl bg-rent px-3 py-2 text-center text-[12.5px] font-medium text-white">
      {t('app.reconnecting')}
    </div>
  );
}

// --- joining -----------------------------------------------------------

function JoinForm({ roomCode, onJoin, busy, error }) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) || '');
  const [touched, setTouched] = useState(false);
  const name = nickname.trim();

  return (
    <Shell>
      <header className="flex items-center gap-3 pt-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rent to-rent-deep text-white shadow-lift">💥</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[20px] font-black leading-tight text-parch">{t('chpok.title')}</h1>
          <p className="text-[12px] text-parch/45">{t('chpok.phone.joining', { code: roomCode })}</p>
        </div>
        <LanguageSwitcher variant="dark" />
      </header>

      <form
        className="panel mt-4 flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (name) onJoin(name);
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-parch/50">{t('landing.yourNickname')}</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            placeholder={t('landing.nicknamePlaceholder')}
            autoComplete="nickname"
            autoFocus
            className="w-full rounded-xl border border-white/12 bg-black/25 px-3.5 py-3 text-[16px] text-parch outline-none focus:border-brass/60"
          />
        </label>
        {touched && !name && <p className="text-[12px] text-rent-light">{t('landing.errorNicknameRequired')}</p>}
        {error && <p className="text-[12px] text-rent-light">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-[15px]">
          {busy ? t('landing.joiningRoom') : t('chpok.phone.takeSeat')}
        </button>
        <p className="text-center text-[11.5px] leading-relaxed text-parch/35">{t('chpok.phone.joinHint')}</p>
      </form>
    </Shell>
  );
}

// --- the round ---------------------------------------------------------

function AnswerStep({ state, actions }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null);
  const sent = state.you?.myAnswer;
  const max = state.maxAnswerLength || 140;

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setProblem(null);
    const res = await actions.answer(value);
    setSending(false);
    if (!res?.ok) setProblem(res?.error || t('chpok.phone.sendFailed'));
  };

  if (sent) {
    return (
      <>
        <div className="panel flex flex-col gap-2 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-go-light">
            <Icon.check className="mr-1 inline h-3.5 w-3.5" />
            {t('chpok.phone.answerSent')}
          </p>
          <p className="break-words text-[16px] font-semibold leading-snug text-parch">{sent}</p>
          <p className="text-[12px] text-parch/40">{t('chpok.phone.noEdits')}</p>
        </div>
        <p className="px-1 text-center text-[13px] text-parch/50">
          {t('chpok.phone.waitingOthers', { n: (state.waitingOn || []).length })}
        </p>
      </>
    );
  }

  return (
    <>
      <div className="panel flex flex-col gap-2 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, max))}
          placeholder={state.letter ? t('chpok.phone.answerPlaceholder', { letter: state.letter }) : t('chpok.phone.answerAny')}
          rows={3}
          autoFocus
          className="w-full resize-none rounded-xl border border-white/12 bg-black/25 px-3.5 py-3 text-[17px] leading-snug text-parch outline-none focus:border-brass/60"
        />
        <div className="flex items-center justify-between text-[11.5px] text-parch/35">
          <span>{state.letter ? t('chpok.phone.startWith', { letter: state.letter }) : t('chpok.event.anyLetter')}</span>
          <span className="tnum">{text.length}/{max}</span>
        </div>
        {problem && <p className="text-[12px] text-rent-light">{problem}</p>}
      </div>
      <button type="button" onClick={send} disabled={!text.trim() || sending} className="btn-primary w-full py-4 text-[16px]">
        {sending ? t('chpok.phone.sending') : t('chpok.phone.send')}
      </button>
    </>
  );
}

function VoteStep({ state, actions }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(null);
  const [problem, setProblem] = useState(null);
  const myVote = state.you?.myVote;

  const pick = async (answerId) => {
    if (myVote || pending) return;
    setPending(answerId);
    setProblem(null);
    const res = await actions.vote(answerId);
    setPending(null);
    if (!res?.ok) setProblem(res?.error || t('chpok.phone.voteFailed'));
  };

  return (
    <>
      <p className="px-1 text-[13px] text-parch/55">
        {myVote ? t('chpok.phone.voted') : t('chpok.phone.pickBest')}
      </p>
      <ul className="flex flex-col gap-2">
        {state.answers.map((a) => {
          const chosen = myVote === a.id;
          const disabled = a.mine || !!myVote || !!pending;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => pick(a.id)}
                disabled={disabled}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  chosen ? 'border-go/60 bg-go/[0.14]'
                    : a.mine ? 'border-white/[0.06] bg-white/[0.02] opacity-55'
                      : 'border-white/[0.1] bg-white/[0.04] active:bg-white/[0.08]'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brass/20 text-[13px] font-black text-brass-light tnum">
                  {a.index}
                </span>
                <span className="min-w-0 flex-1 break-words text-[15px] leading-snug text-parch">{a.text}</span>
                {a.mine && <span className="pill shrink-0 bg-white/[0.07] text-parch/40">{t('chpok.phone.yours')}</span>}
                {chosen && <Icon.check className="h-5 w-5 shrink-0 text-go-light" />}
              </button>
            </li>
          );
        })}
      </ul>
      {problem && <p className="px-1 text-[12px] text-rent-light">{problem}</p>}
      {myVote && (
        <p className="px-1 text-center text-[13px] text-parch/50">
          {t('chpok.phone.waitingVotes', { n: (state.waitingOn || []).length })}
        </p>
      )}
    </>
  );
}

function RevealStep({ state }) {
  const { t } = useTranslation();
  const result = state.roundResult;
  const mine = result?.entries.find((e) => e.playerId === state.you?.id);
  return (
    <>
      {mine ? (
        <div className="panel flex flex-col gap-1 p-4 text-center">
          <p className="text-[12px] uppercase tracking-wide text-parch/40">{t('chpok.phone.yourRound')}</p>
          <p className="break-words text-[15px] font-semibold text-parch">{mine.text}</p>
          <p className="text-[22px] font-black text-brass-light tnum">+{mine.points}</p>
          <p className="text-[12px] text-parch/45">{t('chpok.votes', { n: mine.votes })}</p>
        </div>
      ) : (
        <p className="px-1 text-center text-[13px] text-parch/45">{t('chpok.phone.noAnswerThisRound')}</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {(result?.entries || []).map((e) => (
          <li
            key={e.answerId}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              result.winners.includes(e.playerId) ? 'border-brass/45 bg-brass/[0.1]' : 'border-white/[0.07] bg-white/[0.025]'
            }`}
          >
            <span className="min-w-0 flex-1 break-words text-[13.5px] text-parch">{e.text}</span>
            <span className="pill bg-white/[0.07] text-parch/60">{e.nickname}</span>
            <span className="pill bg-go/20 text-go-light tnum">{e.votes}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function FinalStep({ state }) {
  const { t } = useTranslation();
  const results = state.results;
  const place = results ? results.standings.findIndex((r) => r.playerId === state.you?.id) + 1 : 0;
  return (
    <>
      <div className="panel flex flex-col items-center gap-1 p-5 text-center">
        <p className="font-display text-[22px] font-black text-parch">{t('chpok.gameOver')}</p>
        {place > 0 && <p className="text-[13px] text-parch/50">{t('chpok.phone.yourPlace', { n: place })}</p>}
        <p className="text-[30px] font-black text-brass-light tnum">{state.you?.score ?? 0}</p>
      </div>
      <ol className="flex flex-col gap-1.5">
        {(results?.standings || []).map((row, i) => (
          <li key={row.playerId} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
            <span className="w-5 text-center text-[12.5px] font-black text-parch/40 tnum">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-parch">{row.nickname}</span>
            <span className="pill bg-brass/20 text-brass-light tnum">{row.score}</span>
          </li>
        ))}
      </ol>
      <p className="px-1 text-center text-[12.5px] text-parch/45">{t('chpok.phone.waitHost')}</p>
    </>
  );
}

// --- the page ----------------------------------------------------------

export default function PhoneController({ roomCode, auth }) {
  const { t } = useTranslation();
  const chpok = useChpok(auth.token, { device: 'phone' });
  const [joinError, setJoinError] = useState(null);
  const tried = useRef(false);

  const { state } = chpok;
  const inThisRoom = state && chpok.roomCode === roomCode;

  // A phone that already has a seat in THIS room walks straight back in;
  // one that is somehow still attached to another room lets go of it first.
  useEffect(() => {
    if (!chpok.connected || tried.current) return;
    if (chpok.roomCode && chpok.roomCode !== roomCode) {
      chpok.clearRoom();
      return;
    }
    tried.current = true;
    const saved = localStorage.getItem(NICKNAME_KEY);
    if (!saved) return;
    chpok.joinRoom(roomCode, saved).catch(() => { tried.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chpok.connected, chpok.roomCode, roomCode]);

  useEffect(() => { document.title = `ЧПОК · ${roomCode}`; }, [roomCode]);

  if (auth.checking) return <Shell><p className="pt-10 text-center text-[13px] text-parch/50">{t('app.rejoining')}</p></Shell>;

  if (!inThisRoom) {
    return (
      <JoinForm
        roomCode={roomCode}
        busy={chpok.busy}
        error={joinError}
        onJoin={(nickname) => {
          setJoinError(null);
          tried.current = true;
          chpok.joinRoom(roomCode, nickname).catch((err) => {
            tried.current = false;
            setJoinError(err.message);
          });
        }}
      />
    );
  }

  const me = state.players.find((p) => p.isYou);
  const out = !me || me.left || !!me.exitReason;

  let step = null;
  if ((chpok.spectating || out) && state.phase === 'LOBBY') {
    // A new game is being set up: whoever was out of the last one may sit
    // down again.
    step = (
      <div className="panel flex flex-col gap-3 p-4 text-center">
        <p className="text-[14px] text-parch/70">{t('hype.phone.newMatch')}</p>
        <button
          type="button"
          onClick={() => chpok.joinRoom(roomCode, localStorage.getItem(NICKNAME_KEY) || 'Player').catch((err) => setJoinError(err.message))}
          className="btn-primary w-full py-3.5 text-[15px]"
        >
          {t('chpok.phone.takeSeat')}
        </button>
        {joinError && <p className="text-[12px] text-rent-light">{joinError}</p>}
      </div>
    );
  } else if (chpok.spectating || out) {
    step = (
      <div className="panel flex flex-col gap-2 p-4 text-center">
        <p className="text-[13.5px] text-parch/70">{t('chpok.phone.outOfGame')}</p>
        <p className="text-[12px] text-parch/40">{t('chpok.phone.watchOnBigScreen')}</p>
      </div>
    );
  } else if (state.phase === 'LOBBY') {
    step = (
      <div className="panel flex flex-col gap-3 p-4 text-center">
        <p className="text-[14px] text-parch/70">{t('chpok.phone.seatTaken')}</p>
        <p className="text-[12.5px] text-parch/40">{t('chpok.phone.waitStart')}</p>
        <button
          type="button"
          onClick={() => chpok.actions.setReady(!me?.ready)}
          className={`${me?.ready ? 'btn-ghost' : 'btn-success'} w-full py-3.5 text-[15px]`}
        >
          <Icon.check className="h-4 w-4" />
          {me?.ready ? t('mafia.cancelReady') : t('mafia.imReady')}
        </button>
      </div>
    );
  } else if (state.phase === 'ANSWER') {
    step = <AnswerStep state={state} actions={chpok.actions} />;
  } else if (state.phase === 'VOTE') {
    step = <VoteStep state={state} actions={chpok.actions} />;
  } else if (state.phase === 'REVEAL') {
    step = <RevealStep state={state} />;
  } else if (state.phase === 'GAME_OVER') {
    step = <FinalStep state={state} />;
  }

  const inRound = state.phase === 'ANSWER' || state.phase === 'VOTE';

  return (
    <Shell
      footer={!out && state.phase !== 'GAME_OVER' && (
        <div className="mx-auto flex max-w-md items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-parch/40">{me?.nickname}</span>
          <span className="pill bg-brass/20 text-brass-light tnum">{state.you?.score ?? 0}</span>
          <SurrenderButton onSurrender={chpok.actions.surrender} className="btn-danger px-3 py-2 text-[12px]" />
        </div>
      )}
    >
      <Banner connected={chpok.connected} />

      <header className="flex items-center gap-2">
        <span className="pill bg-white/[0.06] font-display tracking-[0.18em] text-parch/60">{state.roomCode}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-parch/45">{t(`chpok.phase.${state.phase}`)}</span>
        {inRound && <PhaseClock endsAt={state.phaseEndsAt} className="text-[13px]" />}
        <LanguageSwitcher variant="dark" />
      </header>

      {chpok.error && <p className="rounded-xl bg-rent/20 px-3 py-2 text-[12.5px] text-rent-light">{chpok.error}</p>}

      {state.phase !== 'LOBBY' && state.phase !== 'GAME_OVER' && (
        <div className="panel flex flex-col items-center gap-2 px-4 py-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.16em] text-parch/35">
            {t('chpok.roundOf', { n: state.round, of: state.settings.rounds })}
          </p>
          {state.event && state.event !== 'normal' && (
            <span className="rounded-full bg-brass/25 px-3 py-1 text-[12px] font-black text-brass-light">
              {t(`chpok.event.${state.event}`)}
            </span>
          )}
          <p className="text-[18px] font-bold leading-snug text-parch">{state.theme}</p>
          <span className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-parch px-2 text-[24px] font-black text-ink">
            {state.letter || '★'}
          </span>
        </div>
      )}

      {step}
    </Shell>
  );
}
