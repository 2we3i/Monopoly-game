// ChpokOnline.jsx
// The big screen of an online ЧПОК room: the QR code people scan to take a
// seat, the theme and letter of the round, who has answered, the cards
// during the vote, the count, and the table at the end.
//
// This screen shows and never decides. The server deals the round, closes
// the answers, opens and counts the vote and awards the points; everything
// here is drawn from the state it pushed, which is why two screens looking
// at the same room can never disagree.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { Segmented } from '../../mafia/MafiaSettings';
import QrCode from '../../ui/QrCode';
import Icon from '../../icons';
import PlayerAvatar from '../../PlayerAvatar';
import SocialBar from '../../social/SocialBar';
import {
  PhaseClock, PlayerStatus, SpectatorBanner, SpectatorStrip, SurrenderButton,
} from '../../room/RoomStatus';

export function joinLink(roomCode) {
  return `${window.location.origin}/play/${roomCode}`;
}

function Seat({ player, showScore = true }) {
  const { t } = useTranslation();
  const gone = player.left || player.exitReason;
  return (
    <li
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
        gone ? 'border-white/[0.05] bg-white/[0.015] opacity-60'
          : player.answered || player.voted ? 'border-go/40 bg-go/[0.08]' : 'border-white/[0.07] bg-white/[0.025]'
      }`}
    >
      <PlayerAvatar
        player={{ ...player, color: player.isHost ? '#c9982f' : '#4b5fa8' }}
        sizeClassName="h-8 w-8"
        ringClassName="ring-2 ring-white/15"
      />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-parch">
        {player.nickname}
        {player.device === 'phone' && (
          <span className="ml-1.5 align-middle text-[11px] font-normal text-parch/35" title={t('chpok.onPhone')}>📱</span>
        )}
      </span>
      {player.playing === false && <span className="pill bg-white/[0.07] text-parch/40">{t('chpok.screenSeat')}</span>}
      {showScore && player.playing !== false && <span className="pill bg-brass/20 text-brass-light tnum">{player.score}</span>}
      {player.isHost && <Icon.crown className="h-4 w-4 shrink-0 text-brass" title={t('waiting.host')} />}
      <PlayerStatus player={player} compact />
    </li>
  );
}

// --- the lobby ---------------------------------------------------------

export function ChpokLobby({
  state, actions, onLeave, spectating,
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(null);
  const link = joinLink(state.roomCode);
  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost;
  const active = state.players.filter((p) => !p.left && p.playing);
  const enough = active.length >= state.minPlayers;
  const s = state.settings;

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

  return (
    <div className="table-night min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 4xl:max-w-[1500px]">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rent to-rent-deep text-white shadow-lift">💥</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[20px] font-black leading-tight text-parch">{t('chpok.title')}</h1>
            <p className="text-[12px] text-parch/45">{t('chpok.lobbySubtitle')}</p>
          </div>
          <SocialBar compact />
          <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
        </header>

        {spectating && <SpectatorBanner onLeave={onLeave} />}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1.1fr)]">
          {/* Joining ------------------------------------------------- */}
          <section className="panel flex flex-col items-center gap-3 p-5 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-parch/40">{t('chpok.scanToJoin')}</p>
            <QrCode value={link} className="w-full max-w-[260px] rounded-xl" title={t('chpok.qrTitle')} />
            <button
              type="button"
              onClick={() => copy('code', state.roomCode)}
              className="flex items-center gap-3 rounded-xl px-3 py-1.5 transition-colors hover:bg-white/[0.05]"
            >
              <span className="font-display text-[30px] font-black tracking-[0.2em] text-parch">{state.roomCode}</span>
              {copied === 'code' ? <Icon.check className="h-5 w-5 text-go-light" /> : <Icon.scroll className="h-5 w-5 text-parch/40" />}
            </button>
            <p className="break-all text-[12px] text-parch/45">{link}</p>
            <button type="button" onClick={() => copy('link', link)} className="text-[12.5px] font-medium text-brass-light underline decoration-brass-light/40 underline-offset-4">
              {copied === 'link' ? t('waiting.copied') : t('chpok.copyLink')}
            </button>
            <p className="text-[12px] leading-relaxed text-parch/45">{t('chpok.scanHint')}</p>
          </section>

          {/* Players and rules --------------------------------------- */}
          <div className="flex flex-col gap-4">
            <section className="panel flex flex-col p-4">
              <div className="mb-3 flex items-center gap-2">
                <Icon.users className="h-4 w-4 text-parch/40" />
                <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">
                  {t('waiting.players')} · {active.length}/{state.maxPlayers}
                </h2>
                {!enough && (
                  <span className="pill bg-rent/20 text-rent-light">
                    {t('chpok.needMore', { n: state.minPlayers - active.length })}
                  </span>
                )}
              </div>
              {/* A room is usually one big screen and a phone each, but a
                  group with a single laptop plays from it too - so the
                  screen says for itself whether it is a seat or the table. */}
              {me && (
                <label className="mb-2 flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                  <input
                    type="checkbox"
                    checked={!me.playing}
                    onChange={(e) => actions.setPlaying(!e.target.checked)}
                    className="h-4 w-4 accent-brass"
                  />
                  <span className="min-w-0 flex-1 text-[12.5px] text-parch/60">{t('chpok.screenOnly')}</span>
                </label>
              )}
              {active.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[12.5px] text-parch/30">
                  {t('chpok.noPhonesYet')}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {state.players.map((p) => <Seat key={p.id} player={p} showScore={false} />)}
                </ul>
              )}
            </section>

            <section className="panel flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Icon.settings className="h-4 w-4 text-parch/40" />
                <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('chpok.rules')}</h2>
                {!isHost && <span className="pill bg-white/[0.06] text-parch/35">{t('throne.lobby.hostOnly')}</span>}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-parch/50">{t('chpok.box')}</span>
                <Segmented
                  disabled={!isHost}
                  value={s.box}
                  onChange={(v) => actions.updateSettings({ box: v })}
                  options={(state.options?.boxes || []).map((b) => ({ value: b, label: t(`chpok.box.${b}`) }))}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-parch/50">{t('chpok.rounds')}</span>
                {setting('rounds', state.options?.rounds || [], (v) => String(v))}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-parch/50">{t('chpok.answerTime')}</span>
                {setting('answerSec', state.options?.answerSec || [], (v) => `${v}s`)}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-parch/50">{t('chpok.voteTime')}</span>
                {setting('voteSec', state.options?.voteSec || [], (v) => `${v}s`)}
              </label>
            </section>
          </div>
        </div>

        <SpectatorStrip spectators={state.spectators} />

        {isHost && !spectating && (
          <div className="panel flex flex-wrap items-center gap-2 p-3">
            <button type="button" onClick={actions.start} disabled={!enough} className="btn-primary min-w-[220px] flex-1 py-3 text-[15px]">
              💥 {t('chpok.start')}
            </button>
            {!enough && (
              <p className="w-full text-center text-[12px] text-parch/40">{t('chpok.needMoreLong', { n: state.minPlayers })}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- the game ----------------------------------------------------------

function ThemeCard({ state }) {
  const { t } = useTranslation();
  return (
    <div className="panel flex flex-col items-center gap-3 px-5 py-6 text-center">
      <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-parch/40">
        <span>{t('chpok.roundOf', { n: state.round, of: state.settings.rounds })}</span>
        <PhaseClock endsAt={state.phaseEndsAt} />
      </div>
      <p className="max-w-2xl font-display text-[clamp(1.3rem,3.4vw,2.2rem)] font-black leading-tight text-parch">
        {state.theme}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[12px] uppercase tracking-wide text-parch/40">{t('chpok.startsWith')}</span>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-parch text-[26px] font-black text-ink">
          {state.letter}
        </span>
      </div>
    </div>
  );
}

// When the big screen holds a seat of its own it needs the same box a
// phone has - otherwise the round would sit there waiting on a player with
// no way to answer.
function ScreenAnswerBox({ state, actions }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState(null);
  const max = state.maxAnswerLength || 140;

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setProblem(null);
    const res = await actions.answer(value);
    setSending(false);
    if (res?.ok) setText('');
    else setProblem(res?.error || t('chpok.phone.sendFailed'));
  };

  if (state.you?.myAnswer) {
    return (
      <section className="panel flex flex-col gap-1 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-go-light">
          <Icon.check className="mr-1 inline h-3.5 w-3.5" />{t('chpok.phone.answerSent')}
        </p>
        <p className="break-words text-[15px] font-semibold text-parch">{state.you.myAnswer}</p>
        <p className="text-[12px] text-parch/40">{t('chpok.phone.noEdits')}</p>
      </section>
    );
  }

  return (
    <section className="panel flex flex-col gap-2 p-4">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('chpok.yourAnswer')}</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, max))}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={t('chpok.phone.answerPlaceholder', { letter: state.letter })}
        rows={2}
        className="w-full resize-none rounded-xl border border-white/12 bg-black/25 px-3.5 py-2.5 text-[15px] text-parch outline-none focus:border-brass/60"
      />
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[11.5px] text-parch/35">{t('chpok.phone.startWith', { letter: state.letter })}</span>
        <span className="text-[11.5px] text-parch/35 tnum">{text.length}/{max}</span>
        <button type="button" onClick={send} disabled={!text.trim() || sending} className="btn-primary px-5 py-2 text-[13.5px]">
          {sending ? t('chpok.phone.sending') : t('chpok.phone.send')}
        </button>
      </div>
      {problem && <p className="text-[12px] text-rent-light">{problem}</p>}
    </section>
  );
}

function AnswerBoard({ state }) {
  const { t } = useTranslation();
  const waiting = new Set(state.waitingOn || []);
  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('chpok.writingNow')}</h2>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {state.players.filter((p) => !p.left && p.playing).map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
              p.answered ? 'border-go/40 bg-go/[0.08]' : 'border-white/[0.07] bg-white/[0.025]'
            }`}
          >
            <PlayerAvatar player={{ ...p, color: '#4b5fa8' }} sizeClassName="h-7 w-7" ringClassName="ring-2 ring-white/10" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-parch">{p.nickname}</span>
            {p.answered
              ? <span className="pill bg-go/25 text-go-light"><Icon.check className="h-3 w-3" />{t('chpok.answered')}</span>
              : <span className="pill bg-white/[0.07] text-parch/35">{waiting.has(p.id) ? t('chpok.thinking') : '—'}</span>}
            <PlayerStatus player={p} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

function VoteBoard({ state, actions }) {
  const { t } = useTranslation();
  // Only seats that play are counted: a screen that is just the table
  // never votes, so it must not be one of the votes the room waits on.
  const voters = state.players.filter((p) => !p.left && p.playing).length;
  const voted = state.players.filter((p) => !p.left && p.playing && p.voted).length;
  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('chpok.voteNow')}</h2>
        <span className="pill bg-white/[0.06] text-parch/55 tnum">{t('chpok.votesIn', { n: voted, of: voters })}</span>
        <PhaseClock endsAt={state.phaseEndsAt} />
      </div>
      <p className="mb-3 text-[12.5px] text-parch/45">{t('chpok.voteHint')}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {state.answers.map((a) => {
          // The screen votes from here only when it holds a seat of its
          // own; otherwise the cards are simply something to read out.
          const canPick = !!state.you?.canVote && !a.mine;
          const chosen = state.you?.myVote === a.id;
          const Row = canPick ? 'button' : 'div';
          return (
            <li key={a.id}>
              <Row
                {...(canPick ? { type: 'button', onClick: () => actions.vote(a.id) } : {})}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left ${
                  chosen ? 'border-go/60 bg-go/[0.14]'
                    : canPick ? 'border-white/[0.12] bg-white/[0.04] transition-colors hover:border-brass/50 hover:bg-white/[0.07]'
                      : 'border-white/[0.08] bg-white/[0.03]'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brass/20 text-[13px] font-black text-brass-light tnum">
                  {a.index}
                </span>
                <p className="min-w-0 flex-1 break-words text-[14.5px] leading-snug text-parch">{a.text}</p>
                {a.mine && <span className="pill shrink-0 bg-white/[0.07] text-parch/40">{t('chpok.phone.yours')}</span>}
                {chosen && <Icon.check className="h-5 w-5 shrink-0 text-go-light" />}
              </Row>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RevealBoard({ state }) {
  const { t } = useTranslation();
  const result = state.roundResult;
  if (!result) return null;
  if (result.entries.length === 0) {
    return (
      <section className="panel p-6 text-center text-[13.5px] text-parch/50">{t('chpok.nobodyAnswered')}</section>
    );
  }
  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('chpok.roundResult')}</h2>
        <PhaseClock endsAt={state.phaseEndsAt} />
      </div>
      <ul className="flex flex-col gap-2">
        {result.entries.map((e) => {
          const won = result.winners.includes(e.playerId);
          return (
            <li
              key={e.answerId}
              className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-3 ${
                won ? 'border-brass/45 bg-brass/[0.1]' : 'border-white/[0.07] bg-white/[0.025]'
              }`}
            >
              <p className="min-w-[12rem] flex-1 break-words text-[15px] font-semibold leading-snug text-parch">{e.text}</p>
              <span className="pill bg-white/[0.07] text-parch/65">{e.nickname}</span>
              <span className="pill bg-go/20 text-go-light tnum">{t('chpok.votes', { n: e.votes })}</span>
              <span className="pill bg-brass/20 text-brass-light tnum">+{e.points}</span>
              {won && <span className="pill bg-brass/30 text-brass-light">🏆 {t('chpok.bestAnswer')}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FinalBoard({ state, actions, isHost }) {
  const { t } = useTranslation();
  const results = state.results;
  if (!results) return null;
  return (
    <section className="panel p-5">
      <h2 className="mb-1 text-center font-display text-[24px] font-black text-parch">{t('chpok.gameOver')}</h2>
      <p className="mb-4 text-center text-[12.5px] text-parch/45">{t(`chpok.endReason.${results.reason}`)}</p>
      <ol className="flex flex-col gap-1.5">
        {results.standings.map((row, i) => (
          <li
            key={row.playerId}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              results.winnerIds.includes(row.playerId) ? 'border-brass/45 bg-brass/[0.1]' : 'border-white/[0.07] bg-white/[0.025]'
            }`}
          >
            <span className="w-6 text-center text-[13px] font-black text-parch/45 tnum">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-parch">{row.nickname}</span>
            {row.left && <PlayerStatus player={{ ...row, left: true, surrendered: row.exitReason === 'surrender' }} />}
            <span className="pill bg-brass/20 text-brass-light tnum">{row.score}</span>
          </li>
        ))}
      </ol>
      {isHost && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => actions.restart(false)} className="btn-primary flex-1 py-2.5 text-[13.5px]">
            {t('chpok.newGame')}
          </button>
        </div>
      )}
    </section>
  );
}

export function ChpokScreen({
  state, actions, onLeave, spectating,
}) {
  const { t } = useTranslation();
  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost;
  const link = joinLink(state.roomCode);
  const board = useMemo(() => {
    if (state.phase === 'ANSWER') {
      return (
        <>
          {state.you?.playing && !state.you.left && <ScreenAnswerBox state={state} actions={actions} />}
          <AnswerBoard state={state} />
        </>
      );
    }
    if (state.phase === 'VOTE') return <VoteBoard state={state} actions={actions} />;
    if (state.phase === 'REVEAL') return <RevealBoard state={state} />;
    if (state.phase === 'GAME_OVER') return <FinalBoard state={state} actions={actions} isHost={isHost} />;
    return null;
  }, [state, actions, isHost]);

  return (
    <div className="table-night min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 4xl:max-w-[1500px]">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rent to-rent-deep text-white shadow-lift">💥</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[18px] font-black leading-tight text-parch">{t('chpok.title')}</h1>
            <p className="text-[12px] text-parch/45">{t(`chpok.phase.${state.phase}`)}</p>
          </div>
          <span className="pill bg-white/[0.06] font-display tracking-[0.2em] text-parch/70">{state.roomCode}</span>
          {isHost && !spectating && state.phase !== 'GAME_OVER' && (
            <button type="button" onClick={actions.skip} className="btn-ghost px-3 py-2 text-[12.5px]">
              {t('chpok.skipPhase')}
            </button>
          )}
          {!spectating && me && !me.left && me.playing && state.phase !== 'GAME_OVER' && (
            <SurrenderButton onSurrender={actions.surrender} />
          )}
          <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
        </header>

        {spectating && <SpectatorBanner onLeave={onLeave} />}

        {state.phase !== 'GAME_OVER' && <ThemeCard state={state} />}

        {board}

        <section className="panel p-4">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-parch/60">{t('chpok.scores')}</h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {[...state.players].sort((a, b) => (a.left - b.left) || b.score - a.score).map((p) => (
              <Seat key={p.id} player={p} />
            ))}
          </ul>
        </section>

        <SpectatorStrip spectators={state.spectators} />

        {/* Latecomers can still scan in between rounds. */}
        {state.settings.allowLateJoin && state.phase !== 'GAME_OVER' && (
          <div className="panel flex flex-wrap items-center gap-4 p-4">
            <QrCode value={link} className="h-24 w-24 shrink-0 rounded-lg" title={t('chpok.qrTitle')} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-parch">{t('chpok.lateJoinTitle')}</p>
              <p className="text-[12px] text-parch/45">{t('chpok.lateJoinHint')}</p>
              <p className="mt-1 break-all text-[11.5px] text-parch/35">{link}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// The one component App renders: the lobby before the game, the table
// after it starts.
export default function ChpokOnline(props) {
  const { state } = props;
  useEffect(() => { document.title = `ЧПОК · ${state.roomCode}`; }, [state.roomCode]);
  return state.phase === 'LOBBY' ? <ChpokLobby {...props} /> : <ChpokScreen {...props} />;
}
