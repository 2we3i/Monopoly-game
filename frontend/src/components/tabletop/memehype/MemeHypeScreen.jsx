// MemeHypeScreen.jsx
// The big screen of a Meme Hype room: the lobby with its QR code, then the
// game - the situation, who has played, the anonymous memes during the
// vote, the reveal with authors and points, and the final table.
//
// This screen shows and never decides. Every phase change, every point
// and every status comes from the state the server pushed.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import GameGuide from '../../rules/GameGuide';
import { Segmented } from '../../mafia/MafiaSettings';
import QrCode from '../../ui/QrCode';
import SocialBar from '../../social/SocialBar';
import { SpectatorBanner, SpectatorStrip, SurrenderButton } from '../../room/RoomStatus';
import MemeCard from './MemeCard';
import {
  AdultConfirm, Avatar, Confetti, StatusBadge, TimerRing, packTitle,
} from './parts';

export const joinLink = (code) => `${window.location.origin}/play/${code}`;

// Who took the photos on the cards. Most are CC BY / CC BY-SA, which asks
// for the author and licence to be named; the list loads when opened.
function PhotoCredits({ rating }) {
  const { t } = useTranslation();
  const [credits, setCredits] = useState(null);
  const load = (e) => {
    if (!e.currentTarget.open || credits) return;
    fetch('/api/memehype/credits')
      .then((r) => r.json())
      .then((body) => setCredits(body.credits || []))
      .catch(() => setCredits([]));
  };
  const shown = (credits || []).filter((c) => c.rating === rating);
  return (
    <details onToggle={load} className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] text-white/60">
      <summary className="cursor-pointer select-none font-bold text-white/70">{t('hype.lobby.credits')}</summary>
      {credits === null && <p className="mt-2">…</p>}
      {credits && shown.length === 0 && <p className="mt-2">{t('hype.lobby.creditsNone')}</p>}
      {shown.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
          {shown.map((c) => (
            <li key={c.meme} className="leading-snug">
              <a href={c.source} target="_blank" rel="noopener noreferrer" className="text-white/80 underline decoration-white/20 hover:decoration-white/60">{c.title}</a>
              {' — '}
              {c.author}
              {' · '}
              {c.license}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Header({
  state, children, onLeave, subtitle,
}) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-wrap items-center gap-3">
      {/* On a phone the title takes its own row and the badges the next. */}
      <div className="min-w-0 flex-1 basis-full md:basis-auto">
        <h1 className="hype-title font-display text-[clamp(1.6rem,3.6vw,2.6rem)] font-black leading-none tracking-tight">MEME HYPE</h1>
        <p className="mt-1 line-clamp-2 text-[12.5px] font-semibold text-white/55 md:line-clamp-none">{subtitle}</p>
      </div>
      <span className="rounded-lg bg-white/10 px-2.5 py-1 font-display text-[15px] font-black tracking-[0.2em] text-white/80">{state.roomCode}</span>
      <span className={`rounded-lg px-2 py-1 text-[12px] font-black ${state.settings.rating === '18' ? 'bg-rose-600 text-white' : 'bg-sky-500/80 text-white'}`}>
        {state.settings.rating}+
      </span>
      {children}
      <SocialBar compact />
      <button type="button" onClick={onLeave} className="btn-quiet px-3 py-2 text-[12.5px]">{t('waiting.leave')}</button>
    </header>
  );
}

function PlayerRow({ player, rank = null, showScore = true }) {
  const { t } = useTranslation();
  const gone = player.left || player.exitReason;
  return (
    <li className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 ${gone ? 'opacity-55' : ''}`}>
      {rank !== null && <span className="w-5 text-center text-[13px] font-black text-white/40 tabular-nums">{rank}</span>}
      <Avatar player={player} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold text-white">
          {player.nickname}
          {player.isHost && <span className="ml-1.5 text-[12px]" title={t('waiting.host')}>👑</span>}
          {player.device === 'phone' && <span className="ml-1 text-[12px]" title={t('chpok.onPhone')}>📱</span>}
        </p>
        <StatusBadge player={player} />
      </div>
      {showScore && player.playing && (
        <span key={player.score} className="hype-bump rounded-xl bg-amber-300/15 px-2.5 py-1 text-[16px] font-black text-amber-200 tabular-nums">
          {player.score}
        </span>
      )}
    </li>
  );
}

// --- the lobby ---------------------------------------------------------

function Choice({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <p className="text-[12.5px] font-bold text-white/75">{label}</p>
        {hint && <p className="text-[11px] text-white/40">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Lobby({
  state, actions, onLeave, spectating,
}) {
  const { t, language } = useTranslation();
  const [askAdult, setAskAdult] = useState(false);
  const [problem, setProblem] = useState(null);
  const link = joinLink(state.roomCode);
  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost && !spectating;
  const playing = state.players.filter((p) => !p.left && p.playing);
  const enough = playing.length >= state.minPlayers;
  const s = state.settings;
  const set = (patch) => actions.updateSettings(patch);

  const togglePack = (id) => {
    const on = s.packs.includes(id);
    if (on && s.packs.length === 1) return; // at least one pack
    set({ packs: on ? s.packs.filter((p) => p !== id) : [...s.packs, id] });
  };

  const start = async () => {
    setProblem(null);
    const res = await actions.start();
    if (res && !res.ok) setProblem(res.error);
  };

  const seg = (key, values, fmt) => (
    <Segmented
      disabled={!isHost}
      value={s[key]}
      onChange={(v) => set({ [key]: Number.isNaN(Number(v)) ? v : Number(v) })}
      options={values.map((v) => ({ value: v, label: fmt(v) }))}
    />
  );

  return (
    <div className="table-hype min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 4xl:max-w-[1600px]">
        <Header state={state} onLeave={onLeave} subtitle={t('hype.lobby.subtitle')} />
        {spectating && <SpectatorBanner onLeave={onLeave} />}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)]">
          <section className="hype-panel flex flex-col items-center gap-3 p-5 text-center">
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-white/50">{t('hype.lobby.scan')}</p>
            <div className="hype-float rounded-2xl bg-white p-2 shadow-[0_0_40px_-8px_rgba(255,79,163,0.7)]">
              <QrCode value={link} className="w-[min(240px,60vw)]" title={t('chpok.qrTitle')} />
            </div>
            <p className="font-display text-[34px] font-black tracking-[0.25em] text-white">{state.roomCode}</p>
            <p className="break-all text-[12px] text-white/45">{link}</p>
            <p className="text-[13px] font-bold text-white/70">
              {t('hype.lobby.connected', { n: playing.length, max: s.maxPlayers })}
            </p>
            <div className="flex w-full flex-col gap-1.5 text-left">
              {state.players.length === 0 || playing.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/15 px-3 py-5 text-center text-[13px] text-white/40">{t('hype.lobby.noPlayers')}</p>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {state.players.filter((p) => p.playing || p.isYou).map((p) => (
                  <PlayerRow key={p.id} player={p} showScore={false} />
                ))}
              </ul>
            </div>
            {me && !spectating && (
              <label className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left">
                <input type="checkbox" checked={!!me.playing} onChange={(e) => actions.setPlaying(e.target.checked)} className="h-4 w-4 accent-pink-500" />
                <span className="text-[12.5px] text-white/65">{t('hype.lobby.screenPlays')}</span>
              </label>
            )}
            <SpectatorStrip spectators={state.spectators} className="w-full" />
          </section>

          <section className="hype-panel flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-black uppercase tracking-wide text-white/80">{t('hype.lobby.settings')}</h2>
              {!isHost && <span className="text-[11.5px] text-white/40">{t('throne.lobby.hostOnly')}</span>}
            </div>

            <Choice label={t('hype.lobby.rating')} hint={t(`hype.rating.hint${s.rating}`)}>
              <div className="grid grid-cols-2 gap-2">
                {state.options.ratings.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={!isHost}
                    onClick={() => {
                      if (r === s.rating) return;
                      if (r === '18') setAskAdult(true);
                      else set({ rating: r });
                    }}
                    className={`rounded-2xl border-2 px-3 py-3 text-left transition ${
                      s.rating === r
                        ? (r === '18' ? 'border-rose-500 bg-rose-500/20' : 'border-sky-400 bg-sky-400/20')
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                    }`}
                  >
                    <span className="block text-[20px] font-black text-white">{r}+</span>
                    <span className="block text-[11.5px] text-white/55">{t(`hype.rating.short${r}`)}</span>
                  </button>
                ))}
              </div>
            </Choice>

            <Choice label={t('hype.lobby.packs')} hint={t('hype.lobby.packsHint')}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {state.options.packs.map((pack) => {
                  const on = s.packs.includes(pack.id);
                  const size = pack.sizes[s.rating];
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => togglePack(pack.id)}
                      aria-pressed={on}
                      className={`flex flex-col gap-1 rounded-2xl border-2 p-3 text-left transition ${on ? 'bg-white/[0.08]' : 'border-white/10 bg-white/[0.02] opacity-70 hover:opacity-100'}`}
                      style={on ? { borderColor: pack.accent, boxShadow: `0 0 24px -10px ${pack.accent}` } : undefined}
                    >
                      <span className="text-[28px] leading-none">{pack.emoji}</span>
                      <span className="text-[13px] font-black leading-tight text-white">{packTitle(pack, language)}</span>
                      <span className="text-[11px] leading-snug text-white/50">{pack.description?.[language] || pack.description?.ru}</span>
                      <span className="text-[10.5px] font-bold text-white/40">
                        {t('hype.lobby.packSize', { s: size.situations, m: size.memes })}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2"><PhotoCredits rating={s.rating} /></div>
            </Choice>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Choice label={t('hype.lobby.maxPlayers')}>{seg('maxPlayers', state.options.maxPlayers, String)}</Choice>
              <Choice label={t('hype.lobby.rounds')}>{seg('rounds', state.options.rounds, String)}</Choice>
              <Choice label={t('hype.lobby.pickSec')}>{seg('pickSec', state.options.pickSec, (v) => `${v}s`)}</Choice>
              <Choice label={t('hype.lobby.voteSec')}>{seg('voteSec', state.options.voteSec, (v) => `${v}s`)}</Choice>
              <Choice label={t('hype.lobby.handSize')}>{seg('handSize', state.options.handSize, String)}</Choice>
              <Choice label={t('hype.lobby.onTimeout')}>
                <Segmented
                  disabled={!isHost}
                  value={s.onTimeout}
                  onChange={(v) => set({ onTimeout: v })}
                  options={state.options.onTimeout.map((v) => ({ value: v, label: t(`hype.timeout.${v}`) }))}
                />
              </Choice>
            </div>
          </section>
        </div>

        {isHost && (
          <div className="hype-panel flex flex-col items-center gap-2 p-4">
            <button type="button" onClick={start} disabled={!enough} className="hype-btn w-full max-w-md py-4 text-[20px]">
              🚀 {t('hype.lobby.start')}
            </button>
            <p className="text-center text-[12.5px] text-white/50">
              {enough ? t('hype.lobby.readyToGo', { n: playing.length }) : t('hype.lobby.needMore', { n: state.minPlayers - playing.length })}
            </p>
            {problem && <p className="text-center text-[12.5px] font-bold text-rose-300">{problem}</p>}
          </div>
        )}
      </div>

      {askAdult && (
        <AdultConfirm
          onCancel={() => setAskAdult(false)}
          onConfirm={() => {
            setAskAdult(false);
            set({ rating: '18', confirmAdult: true });
          }}
        />
      )}
    </div>
  );
}

// --- the game ----------------------------------------------------------

function Situation({ state }) {
  const { t } = useTranslation();
  const total = state.phase === 'PICK' ? state.settings.pickSec : state.phase === 'VOTE' ? state.settings.voteSec : 12;
  return (
    <section key={state.round} className="hype-panel hype-pop relative flex items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-pink-300">
          {t('hype.game.situation', { n: state.round, of: state.settings.rounds })}
          {state.finalRound && <span className="ml-2 rounded bg-amber-300 px-1.5 py-0.5 text-[#1a0b1f]">{t('hype.game.final')}</span>}
        </p>
        <p className="mt-2 font-display text-[clamp(1.4rem,3.2vw,2.5rem)] font-black leading-tight text-white">
          {state.situation?.text}
        </p>
      </div>
      <TimerRing endsAt={state.phaseEndsAt} total={total} size={78} />
    </section>
  );
}

function PickBoard({ state, actions }) {
  const { t } = useTranslation();
  const players = state.players.filter((p) => p.playing && !p.left);
  const you = state.you;
  return (
    <>
      <section className="hype-panel p-4">
        <h2 className="mb-3 text-[14px] font-black uppercase tracking-wide text-white/70">
          {t('hype.game.picking', { n: state.pickedCount, of: players.length })}
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {players.map((p) => (
            <li key={p.id} className="mx-auto flex w-full max-w-[170px] flex-col items-center gap-2 text-center">
              <div
                className={`flex aspect-[4/5] w-full items-center justify-center rounded-2xl border-2 text-[34px] transition ${
                  p.picked ? 'hype-pop border-emerald-400/60 bg-gradient-to-br from-pink-500/40 to-violet-600/40' : 'border-dashed border-white/15 bg-white/[0.03]'
                }`}
              >
                {p.picked ? '🃏' : <span className="hype-tick text-[26px]">🤔</span>}
              </div>
              <span className="w-full truncate text-[13px] font-bold text-white">{p.nickname}</span>
              <StatusBadge player={p} />
            </li>
          ))}
        </ul>
      </section>
      {/* A big screen that plays too needs its own hand - rare, but real. */}
      {you?.canPick && you.hand.length > 0 && (
        <section className="hype-panel p-4">
          <h2 className="mb-3 text-[14px] font-black uppercase tracking-wide text-white/70">{t('hype.phone.yourHand')}</h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {you.hand.map((m) => (
              <button key={m.id} type="button" onClick={() => actions.pick(m.id)} className="transition hover:-translate-y-1">
                <MemeCard meme={m} size="sm" />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function VoteBoard({ state, actions }) {
  const { t } = useTranslation();
  const voters = state.players.filter((p) => p.playing && !p.left);
  const voted = voters.filter((p) => p.voted).length;
  return (
    <section className="hype-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[14px] font-black uppercase tracking-wide text-white/70">{t('hype.game.vote')}</h2>
        <span className="rounded-full bg-sky-500/20 px-3 py-1 text-[12.5px] font-bold text-sky-100 tabular-nums">
          🔵 {t('hype.game.votesIn', { n: voted, of: voters.length })}
        </span>
      </div>
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {state.cards.map((c, i) => {
          const canPick = state.you?.canVote && !c.mine;
          const chosen = state.you?.myVote === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={!canPick}
              onClick={() => canPick && actions.vote(c.id)}
              className={`hype-flip rounded-2xl text-left ${chosen ? 'ring-4 ring-sky-400' : ''} ${canPick ? 'transition hover:-translate-y-1' : 'cursor-default'}`}
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              <MemeCard meme={c.meme} size="md" label={`MEM #${c.index}`} meta />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RevealBoard({ state }) {
  const { t } = useTranslation();
  const result = state.roundResult;
  if (!result) return null;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  if (result.entries.length === 0) {
    return <section className="hype-panel p-8 text-center text-[15px] text-white/60">{t('hype.game.nobodyPlayed')}</section>;
  }
  return (
    <section className="hype-panel relative p-4">
      {result.winners.length > 0 && <Confetti count={40} />}
      <h2 className="mb-3 text-[14px] font-black uppercase tracking-wide text-white/70">
        {t('hype.game.results')}
        {result.multiplier > 1 && <span className="ml-2 rounded bg-amber-300 px-1.5 py-0.5 text-[#1a0b1f]">×{result.multiplier}</span>}
      </h2>
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {result.entries.map((e, i) => (
          <div key={e.pickId} className="hype-flip flex flex-col gap-2" style={{ animationDelay: `${i * 0.15}s` }}>
            <div className={`rounded-2xl ${e.winner ? 'hype-winner' : ''}`}>
              <MemeCard meme={e.meme} size="md" label={`MEM #${e.index}`} meta />
            </div>
            <div className="flex items-center gap-2">
              <Avatar player={byId[e.playerId] || { id: e.playerId, nickname: e.nickname }} size={28} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-white">
                {e.winner && '🏆 '}
                {e.nickname}
              </span>
              <span className="hype-bump rounded-lg bg-amber-300/20 px-2 py-0.5 text-[14px] font-black text-amber-200" style={{ animationDelay: `${0.4 + i * 0.15}s` }}>
                +{e.points}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[12px] font-bold text-white/60">{t('hype.game.votes', { n: e.votes })}</span>
              {e.voters.map((v) => (byId[v] ? <Avatar key={v} player={byId[v]} size={18} /> : null))}
              {e.auto && <span className="rounded bg-white/10 px-1.5 text-[10.5px] text-white/50">{t('hype.game.auto')}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalBoard({ state, actions, isHost }) {
  const { t } = useTranslation();
  const results = state.results;
  if (!results) return null;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  const podium = results.standings.filter((r) => !r.left).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const heights = ['h-40', 'h-28', 'h-20'];
  const order = [1, 0, 2].filter((i) => podium[i]);
  return (
    <section className="hype-panel relative overflow-hidden p-6">
      {results.winnerIds.length > 0 && <Confetti count={90} />}
      <h2 className="hype-title text-center font-display text-[clamp(2rem,5vw,3.6rem)] font-black">🏆 {t('hype.final.title')}</h2>
      <p className="mb-6 text-center text-[13px] text-white/55">{t(`hype.final.reason.${results.reason}`)}</p>
      <div className="mx-auto mb-6 flex max-w-xl items-end justify-center gap-3">
        {order.map((i) => {
          const row = podium[i];
          return (
            <div key={row.playerId} className="hype-pop flex flex-1 flex-col items-center gap-2" style={{ animationDelay: `${0.3 * (2 - i)}s` }}>
              <Avatar player={byId[row.playerId] || { id: row.playerId, nickname: row.nickname }} size={i === 0 ? 72 : 52} />
              <span className="max-w-full truncate text-[15px] font-black text-white">{row.nickname}</span>
              <span className="text-[20px] font-black text-amber-200 tabular-nums">{row.score}</span>
              <div className={`flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b from-pink-500/60 to-violet-700/60 pt-2 text-[32px] ${heights[i]}`}>
                {medals[i]}
              </div>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-[14px]">
          <thead>
            <tr className="text-[11.5px] uppercase tracking-wide text-white/45">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">{t('hype.final.player')}</th>
              <th className="py-2 pr-2 text-right">{t('hype.final.score')}</th>
              <th className="py-2 pr-2 text-right">{t('hype.final.wins')}</th>
              <th className="py-2 text-right">{t('hype.final.votes')}</th>
            </tr>
          </thead>
          <tbody>
            {results.standings.map((row, i) => (
              <tr key={row.playerId} className={`border-t border-white/10 ${results.winnerIds.includes(row.playerId) ? 'text-amber-200' : 'text-white'}`}>
                <td className="py-2 pr-2 font-black tabular-nums">{i + 1}</td>
                <td className="py-2 pr-2 font-bold">
                  {row.nickname}
                  {row.left && <span className="ml-2 text-[11px] text-white/45">({row.exitReason === 'surrender' ? t('room.surrendered') : t('hype.status.out')})</span>}
                </td>
                <td className="py-2 pr-2 text-right font-black tabular-nums">{row.score}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{row.roundWins}</td>
                <td className="py-2 text-right tabular-nums">{row.votesReceived}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isHost && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => actions.restart(false)} className="hype-btn px-8 py-3 text-[17px]">🔁 {t('hype.final.again')}</button>
        </div>
      )}
    </section>
  );
}

function Game({
  state, actions, onLeave, spectating,
}) {
  const { t } = useTranslation();
  const me = state.players.find((p) => p.isYou);
  const isHost = !!me?.isHost && !spectating;
  const link = joinLink(state.roomCode);
  const standings = useMemo(
    () => [...state.players].filter((p) => p.playing).sort((a, b) => (a.left - b.left) || b.score - a.score),
    [state.players],
  );

  let board = null;
  if (state.phase === 'PICK') board = <PickBoard state={state} actions={actions} />;
  else if (state.phase === 'VOTE') board = <VoteBoard state={state} actions={actions} />;
  else if (state.phase === 'REVEAL') board = <RevealBoard state={state} />;
  else if (state.phase === 'GAME_OVER') board = <FinalBoard state={state} actions={actions} isHost={isHost} />;

  return (
    <div className="table-hype min-h-screen">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5">
        <Header state={state} onLeave={onLeave} subtitle={t(`hype.phase.${state.phase}`)}>
          {isHost && state.phase !== 'GAME_OVER' && (
            <button type="button" onClick={actions.skip} className="btn-ghost px-3 py-2 text-[12.5px]">⏭ {t('chpok.skipPhase')}</button>
          )}
          {!spectating && me?.playing && !me.left && state.phase !== 'GAME_OVER' && (
            <SurrenderButton onSurrender={actions.surrender} />
          )}
        </Header>
        {spectating && <SpectatorBanner onLeave={onLeave} />}

        {/* What this player has to do right now, with the rules one
            tap away - the same strip every game here uses. */}
        <GameGuide gameId="memehype" state={state} className="hype-panel" />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr),300px]">
          <div className="flex min-w-0 flex-col gap-4">
            {state.phase !== 'GAME_OVER' && <Situation state={state} />}
            {board}
          </div>
          <aside className="flex flex-col gap-3">
            <section className="hype-panel p-3">
              <h2 className="mb-2 text-[13px] font-black uppercase tracking-wide text-white/60">{t('hype.game.scores')}</h2>
              <ul className="flex flex-col gap-1.5">
                {standings.map((p, i) => <PlayerRow key={p.id} player={p} rank={i + 1} />)}
              </ul>
            </section>
            <SpectatorStrip spectators={state.spectators} />
            {state.settings.allowLateJoin && state.phase !== 'GAME_OVER' && state.players.filter((p) => p.playing && !p.left).length < state.maxPlayers && (
              <section className="hype-panel flex items-center gap-3 p-3">
                <div className="shrink-0 rounded-lg bg-white p-1"><QrCode value={link} className="h-20 w-20" title={t('chpok.qrTitle')} /></div>
                <p className="text-[12px] leading-snug text-white/55">{t('hype.game.lateJoin')}</p>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function MemeHypeScreen(props) {
  const { state } = props;
  useEffect(() => { document.title = `Meme Hype · ${state.roomCode}`; }, [state.roomCode]);
  return state.phase === 'LOBBY' ? <Lobby {...props} /> : <Game {...props} />;
}
