// MafiaGameScreen.jsx
// The game itself. Which controls a player gets is decided entirely by
// the payload the server sent THEM - `you.role`, `you.canActTonight`,
// `you.teammates` - so a client that renders this file has no way to
// show information it was never given.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import PlayerAvatar from '../PlayerAvatar';
import Icon from '../icons';
import { Segmented } from './MafiaSettings';
import RoomChat from '../chat/RoomChat';
import SocialBar from '../social/SocialBar';
import { StyledName } from '../../cosmetics/Cosmetics';
import { useOutcomeEffects } from '../../cosmetics/useGameCosmetics';

const ROLE_THEME = {
  MAFIA: { color: '#a8342a', glyph: '🔪', team: 'MAFIA' },
  DON: { color: '#7c2019', glyph: '🎩', team: 'MAFIA' },
  SHERIFF: { color: '#3a6ea8', glyph: '🔎', team: 'TOWN' },
  DOCTOR: { color: '#1f7a5c', glyph: '💉', team: 'TOWN' },
  MANIAC: { color: '#7a5fb8', glyph: '🩸', team: 'NEUTRAL' },
  CIVILIAN: { color: '#5a6b7a', glyph: '👤', team: 'TOWN' },
};

function theme(role) {
  return ROLE_THEME[role] || ROLE_THEME.CIVILIAN;
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

function PhaseBanner({ phase, dayNumber, endsAt, event, onSkip, canSkip }) {
  const { t } = useTranslation();
  const seconds = useCountdown(endsAt);
  const isNight = phase === 'NIGHT';
  const total = seconds;

  return (
    <header
      className={`relative overflow-hidden rounded-2xl border p-4 transition-colors duration-500 ${
        isNight ? 'border-indigo-400/20 bg-[#0b1020]' : 'border-brass/25 bg-[#1b1508]'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-60">
        {isNight
          ? <div className="absolute right-6 top-3 h-12 w-12 rounded-full bg-slate-200/80 shadow-[0_0_40px_12px_rgba(190,200,255,0.25)]" />
          : <div className="absolute right-6 top-3 h-12 w-12 rounded-full bg-amber-300/80 shadow-[0_0_46px_14px_rgba(255,200,90,0.3)]" />}
      </div>

      <div className="relative flex flex-wrap items-center gap-3">
        <span className="text-[28px] leading-none">{isNight ? '🌙' : phase === 'VOTE' ? '⚖️' : '☀️'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-parch/40">
            {t('mafia.dayCounter', { n: Math.max(1, dayNumber) })}
          </p>
          <h1 className="font-display text-[22px] font-black leading-tight text-parch">
            {t(`mafia.phase.${phase}`)}
          </h1>
          {event && <p className="mt-0.5 text-[12px] font-semibold text-brass-light">⚡ {t(`mafia.event.${event}`)}</p>}
        </div>

        {endsAt && (
          <div className="flex items-center gap-2">
            <span className={`font-display text-[26px] font-black tnum ${total <= 5 ? 'animate-pulse text-rent-light' : 'text-parch'}`}>
              {String(Math.floor(total / 60)).padStart(1, '0')}:{String(total % 60).padStart(2, '0')}
            </span>
          </div>
        )}
        {canSkip && (
          <button type="button" onClick={onSkip} className="btn-ghost px-3 py-2 text-[12px]">
            {t('mafia.skipPhase')}
          </button>
        )}
      </div>
    </header>
  );
}

function RoleCard({ you, t }) {
  const th = theme(you.role);
  return (
    <section
      className="relative overflow-hidden rounded-2xl border p-4"
      style={{ borderColor: `${th.color}66`, background: `linear-gradient(135deg, ${th.color}22, rgba(0,0,0,0.25))` }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[26px]" style={{ backgroundColor: `${th.color}33` }}>
          {th.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-parch/40">{t('mafia.yourRole')}</p>
          <h2 className="font-display text-[20px] font-black leading-tight" style={{ color: th.color === '#5a6b7a' ? '#f4ecdc' : th.color }}>
            {t(`mafia.role.${you.role}`)}
          </h2>
          <p className="text-[12px] leading-snug text-parch/50">{t(`mafia.roleHint.${you.role}`)}</p>
        </div>
        {!you.alive && <span className="pill bg-black/50 text-parch/60">💀 {t('mafia.dead')}</span>}
      </div>

      {you.teammates?.length > 1 && (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-rent-light">{t('mafia.yourTeam')}</p>
          <div className="flex flex-wrap gap-1.5">
            {you.teammates.map((m) => (
              <span key={m.id} className={`pill ${m.alive ? 'bg-rent/25 text-rent-light' : 'bg-white/[0.06] text-parch/35 line-through'}`}>
                {m.nickname} · {t(`mafia.role.${m.role}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {you.hasDoubleVote && (
        <p className="mt-2 rounded-lg bg-brass/15 px-2.5 py-1.5 text-[11.5px] font-semibold text-brass-light">
          ⚡ {t('mafia.mod.doubleVote')}
        </p>
      )}
    </section>
  );
}

function PlayerTile({ player, phase, voteTally, onPick, selectable, selected, checked, t }) {
  const th = player.role ? theme(player.role) : null;
  const votes = voteTally?.[player.id] || 0;

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => onPick(player.id)}
      className={`group relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all ${
        !player.alive
          ? 'border-white/5 bg-black/30 opacity-50'
          : selected
            ? 'border-rent bg-rent/20 shadow-[0_0_0_1px_rgba(168,52,42,0.5)]'
            : checked
              ? 'border-sky-400/70 bg-sky-400/10 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]'
              : selectable
              ? 'cursor-pointer border-white/10 bg-white/[0.04] hover:-translate-y-0.5 hover:border-rent/50 hover:bg-rent/10'
              : 'border-white/[0.07] bg-white/[0.025]'
      }`}
    >
      <div className="relative">
        <PlayerAvatar
          player={{ ...player, color: th ? th.color : '#4b5fa8' }}
          sizeClassName="h-11 w-11"
          ringClassName="ring-2 ring-white/15"
        />
        {!player.alive && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[18px]">💀</span>
        )}
        {player.isYou && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-brass px-1 text-[9px] font-black text-ink">{t('mafia.youShort')}</span>
        )}
      </div>

      <span className="flex max-w-full justify-center truncate text-[12px] font-semibold text-parch 4xl:text-[14px]">
        <StyledName nickname={player.nickname} cosmetics={player.cosmetics} />
      </span>

      {player.role && (
        <span className="pill" style={{ backgroundColor: `${theme(player.role).color}33`, color: '#f4ecdc' }}>
          {theme(player.role).glyph} {t(`mafia.role.${player.role}`)}
        </span>
      )}

      {checked && (
        <span className="pill bg-sky-400/20 text-sky-200">🔎 {t('mafia.checking')}</span>
      )}
      {phase === 'VOTE' && votes > 0 && (
        <span className="pill bg-rent/30 text-rent-light tnum">⚖️ {votes}</span>
      )}
      {phase === 'VOTE' && player.votedFor && player.alive && (
        <span className="text-[10px] text-parch/35">{t('mafia.hasVoted')}</span>
      )}
      {!player.alive && player.deathCause && (
        <span className="text-[10px] text-parch/35">{t(`mafia.cause.${player.deathCause}`)}</span>
      )}
    </button>
  );
}

function ActionPanel({ state, onVote, nightMode, setNightMode, t }) {
  const { you, phase } = state;
  if (!you) return null;

  if (!you.alive) {
    return (
      <div className="panel p-4 text-center">
        <p className="text-[13px] text-parch/50">💀 {t('mafia.deadHint')}</p>
      </div>
    );
  }

  if (phase === 'NIGHT') {
    if (!you.canActTonight) {
      return (
        <div className="panel flex items-center gap-3 p-4">
          <span className="text-[22px]">😴</span>
          <p className="text-[13px] text-parch/50">{t('mafia.sleepHint')}</p>
        </div>
      );
    }
    const label = {
      KILL: t('mafia.action.kill'),
      HEAL: t('mafia.action.heal'),
      INVESTIGATE: t('mafia.action.investigate'),
    }[you.action] || t('mafia.action.act');

    // The Don has two picks a night: the shot and the sheriff check.
    // One switch decides which of them a tap on a player sets.
    if (you.secondaryAction === 'CHECK_SHERIFF') {
      const checking = nightMode === 'secondary';
      return (
        <div className="panel flex flex-col gap-2.5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[13px] font-bold text-parch">
              {checking ? t('mafia.action.donCheck') : label}
            </p>
            <Segmented
              value={nightMode}
              onChange={setNightMode}
              options={[
                { value: 'primary', label: `🔪 ${t('mafia.donMode.kill')}` },
                { value: 'secondary', label: `🔎 ${t('mafia.donMode.check')}` },
              ]}
            />
          </div>
          <p className="text-[12px] text-parch/45">
            {you.myNightTarget ? `✓ ${t('mafia.donMode.kill')}` : `○ ${t('mafia.donMode.kill')}`}
            {' · '}
            {you.myNightSecondary ? `✓ ${t('mafia.donMode.check')}` : `○ ${t('mafia.donMode.check')}`}
            {' — '}
            {you.myNightTarget && you.myNightSecondary ? t('mafia.targetChosen') : t('mafia.donBothHint')}
          </p>
        </div>
      );
    }

    return (
      <div className="panel p-4">
        <p className="mb-1 text-[13px] font-bold text-parch">{label}</p>
        <p className="text-[12px] text-parch/45">
          {you.myNightTarget ? t('mafia.targetChosen') : t('mafia.chooseTarget')}
        </p>
      </div>
    );
  }

  if (phase === 'VOTE') {
    return (
      <div className="panel flex flex-wrap items-center gap-2 p-4">
        <p className="min-w-0 flex-1 text-[13px] text-parch/60">
          {you.myVote ? t('mafia.voteCast') : t('mafia.voteHint')}
        </p>
        {state.settings.day.allowAbstain && (
          <button
            type="button"
            onClick={() => onVote('SKIP')}
            className={`${you.myVote === 'SKIP' ? 'btn-primary' : 'btn-ghost'} px-4 py-2.5 text-[13px]`}
          >
            {t('mafia.abstain')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <p className="text-[13px] text-parch/50">{t(`mafia.phaseHint.${phase}`)}</p>
    </div>
  );
}

function ResultsFeed({ state, t }) {
  const { lastNight, lastVote, you } = state;
  const items = [];

  (you?.results || []).slice(-4).forEach((r, i) => {
    let text = null;
    if (r.type === 'CHECK_RESULT') {
      text = t(r.params.isMafia ? 'mafia.result.checkMafia' : 'mafia.result.checkClean', { name: r.params.targetName });
    } else if (r.type === 'DON_CHECK_RESULT') {
      text = t(r.params.isSheriff ? 'mafia.result.donSheriff' : 'mafia.result.donNotSheriff', { name: r.params.targetName });
    } else if (r.type === 'HEAL_SAVED') {
      text = t('mafia.result.healed', { name: r.params.targetName });
    } else if (r.type === 'SURVIVED_IMMORTAL') {
      text = t('mafia.result.immortal');
    } else if (r.type === 'INSOMNIA_PEEK') {
      text = t(r.params.isMafia ? 'mafia.result.peekMafia' : 'mafia.result.peekClean', { name: r.params.targetName });
    } else if (r.type === 'ROLE_SWAPPED') {
      text = t('mafia.result.roleSwapped', { role: t(`mafia.role.${r.params.role}`) });
    }
    if (text) items.push({ key: `priv-${i}`, tone: 'private', text });
  });

  if (lastNight?.deaths?.length) {
    lastNight.deaths.forEach((d, i) => items.push({
      key: `death-${i}`,
      tone: 'bad',
      text: t('mafia.result.died', { name: d.name, cause: t(`mafia.cause.${d.cause}`) }),
    }));
  } else if (lastNight) {
    items.push({ key: 'quiet', tone: 'good', text: t('mafia.result.quietNight') });
  }

  if (lastVote?.executedName) {
    items.push({
      key: 'exec',
      tone: 'bad',
      text: t('mafia.result.executed', { name: lastVote.executedName }),
    });
  } else if (lastVote && lastVote.outcome !== 'REVOTE') {
    items.push({ key: 'noexec', tone: 'good', text: t('mafia.result.noExecution') });
  }

  if (items.length === 0) return null;

  return (
    <section className="panel flex flex-col gap-1.5 p-3">
      <p className="section-label">{t('mafia.whatHappened')}</p>
      {items.map((item) => (
        <p
          key={item.key}
          className={`animate-slide-up rounded-lg px-2.5 py-1.5 text-[12.5px] ${
            item.tone === 'bad' ? 'bg-rent/15 text-rent-light'
              : item.tone === 'private' ? 'bg-brass/15 text-brass-light'
                : 'bg-go/12 text-go-light'
          }`}
        >
          {item.text}
        </p>
      ))}
    </section>
  );
}

function HistoryPanel({ history, t }) {
  if (!history?.length) return null;
  const recent = history.slice(-40);
  return (
    <section className="panel flex max-h-56 flex-col overflow-hidden p-0">
      <p className="section-label border-b border-white/[0.07] px-3 py-2">{t('mafia.history')}</p>
      <ul className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        {recent.map((h, i) => (
          <li key={`${h.ts}-${i}`} className="flex gap-2 py-[3px] text-[11.5px] text-parch/60">
            <span className="shrink-0 text-parch/25 tnum">{h.day || '-'}</span>
            <span>{t(`mafia.log.${h.type}`, {
              ...h.params,
              deaths: (h.params?.deaths || []).map((d) => d.name).join(', ') || t('mafia.nobody'),
            })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChatBox({
  chat, phase, you, players, onSend, t,
}) {
  const isNight = phase === 'NIGHT';
  const canSpeak = you?.alive && (!isNight || ['MAFIA', 'DON'].includes(you.role));
  const channelLabel = !you?.alive ? t('mafia.chat.dead') : isNight ? t('mafia.chat.mafia') : t('mafia.chat.town');

  return (
    <section className="panel flex h-[22rem] flex-col overflow-hidden lg:h-[28rem] 4xl:h-[40rem]">
      <RoomChat
        messages={chat}
        onSend={onSend}
        players={players}
        myPlayerId={you?.id}
        disabled={!canSpeak}
        placeholder={canSpeak ? t('chat.placeholder') : t('mafia.cannotSpeak')}
        renderSystem={(m) => t(`mafia.system.${m.type}`, m.params)}
        nameTone={(m) => (m.channel === 'MAFIA' ? 'text-rent-light' : m.channel === 'DEAD' ? 'text-parch/35' : 'text-brass-light')}
        channelBadge={(m) => {
          if (m.channel === 'MAFIA') return <span className="mr-1" title={t('mafia.chat.mafia')}>🔪</span>;
          if (m.channel === 'DEAD') return <span className="mr-1" title={t('mafia.chat.dead')}>☠️</span>;
          return null;
        }}
        header={<p className="section-label shrink-0 border-b border-white/[0.07] px-3 py-2">💬 {channelLabel}</p>}
      />
    </section>
  );
}

const STAT_KEYS = ['votes', 'votesOnMafia', 'votesReceived', 'kills', 'saves', 'mafiaFound'];

function GameOverScreen({ state, isHost, actions, onLeave, t }) {
  const winner = state.winner;
  const tone = winner === 'MAFIA' ? '#a8342a' : winner === 'MANIAC' ? '#7a5fb8' : '#1f7a5c';
  const reveal = state.reveal || [];
  const myRole = state.you?.role;
  const iWon = winner === 'MAFIA'
    ? ['MAFIA', 'DON'].includes(myRole)
    : winner === 'MANIAC'
      ? myRole === 'MANIAC'
      : winner !== 'NOBODY' && !!myRole && !['MAFIA', 'DON', 'MANIAC'].includes(myRole);
  useOutcomeEffects(state.you ? (iWon ? 'win' : 'loss') : null, `${winner}-${state.dayNumber}`);
  const cosmeticsOf = (id) => state.players.find((p) => p.id === id)?.cosmetics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg animate-scale-in rounded-2xl border border-white/12 bg-felt-800/95 p-5 shadow-deep">
        <div className="mb-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-parch/40">{t('mafia.gameOver')}</p>
          <h2 className="font-display text-[30px] font-black leading-tight" style={{ color: tone }}>
            {t(`mafia.winner.${winner}`)}
          </h2>
        </div>

        <div className="mb-4 overflow-hidden rounded-xl border border-white/[0.08]">
          <p className="section-label border-b border-white/[0.07] bg-white/[0.03] px-3 py-1.5">{t('mafia.allRoles')}</p>
          <ul className="divide-y divide-white/[0.06]">
            {reveal.map((p) => {
              const stats = p.stats ? STAT_KEYS.filter((k) => p.stats[k] > 0) : [];
              return (
                <li key={p.id} className="flex flex-col gap-1 px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[16px]">{theme(p.role).glyph}</span>
                    <span className="flex min-w-0 flex-1 truncate text-[13px] font-semibold text-parch">
                      <StyledName nickname={p.nickname} cosmetics={cosmeticsOf(p.id)} />
                    </span>
                    <span className="pill" style={{ backgroundColor: `${theme(p.role).color}33`, color: '#f4ecdc' }}>
                      {t(`mafia.role.${p.role}`)}
                    </span>
                  </div>
                  {!p.alive && (
                    <p className="pl-[26px] text-[11px] text-parch/40">
                      💀 {t('mafia.diedOn', { n: p.deathDay })} · {t(`mafia.cause.${p.deathCause}`)}
                      {p.killedBy?.length > 0 && (
                        <> · {t(p.deathCause === 'VOTE' ? 'mafia.killedBy.vote' : 'mafia.killedBy.hand', { names: p.killedBy.join(', ') })}</>
                      )}
                    </p>
                  )}
                  {stats.length > 0 && (
                    <p className="flex flex-wrap gap-x-2.5 pl-[26px] text-[11px] text-parch/35 tnum">
                      {stats.map((k) => <span key={k}>{t(`mafia.stats.${k}`, { n: p.stats[k] })}</span>)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <HistoryPanel history={state.history} t={t} />

        {isHost ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => actions.restart(true)} className="btn-primary py-3">
              🔪 {t('mafia.newGame')}
            </button>
            <button type="button" onClick={() => actions.restart(false)} className="btn-ghost py-3">
              <Icon.settings className="h-4 w-4" />
              {t('mafia.changeSettings')}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-[12px] text-parch/45">{t('mafia.waitingForHost')}</p>
        )}
        <button type="button" onClick={onLeave} className="btn-quiet mt-2 w-full py-2.5">
          {t('mafia.backToMenu')}
        </button>
      </div>
    </div>
  );
}

export default function MafiaGameScreen({ state, chat, actions, onLeave }) {
  const { t } = useTranslation();
  const { you, phase } = state;
  const isHost = !!you?.isHost;

  const [nightMode, setNightMode] = useState('primary');
  // Every night starts on the shot, never on last night's leftover mode.
  useEffect(() => { setNightMode('primary'); }, [phase, state.dayNumber]);

  const canPickNight = phase === 'NIGHT' && you?.alive && you?.canActTonight;
  const canPickVote = phase === 'VOTE' && you?.alive;
  const checkingNow = canPickNight && nightMode === 'secondary' && !!you?.secondaryAction;
  const selectedId = phase === 'NIGHT' ? you?.myNightTarget : you?.myVote;
  const checkedId = phase === 'NIGHT' ? you?.myNightSecondary : null;

  const pick = (targetId) => {
    if (checkingNow) actions.donCheck(targetId);
    else if (canPickNight) actions.nightAction(targetId);
    else if (canPickVote) actions.vote(targetId);
  };

  const selectable = (player) => {
    if (!player.alive) return false;
    if (canPickNight) {
      if (player.id === you.id) {
        return !checkingNow && you.role === 'DOCTOR' && !!state.settings.fun?.modifiers?.doctorSelfHeal;
      }
      return true;
    }
    if (canPickVote) return true;
    return false;
  };

  return (
    <div className={`min-h-screen transition-colors duration-700 ${phase === 'NIGHT' ? 'table-night' : 'table-dawn'}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-4 3xl:max-w-[1500px] 4xl:max-w-[2100px] 4xl:gap-5 4xl:px-8 4xl:py-8 5xl:max-w-[2800px]">
        <PhaseBanner
          phase={phase}
          dayNumber={state.dayNumber}
          endsAt={state.phaseEndsAt}
          event={state.activeEvent}
          canSkip={isHost && !['GAME_OVER', 'LOBBY'].includes(phase)}
          onSkip={actions.skipPhase}
        />

        <div className="grid gap-3 lg:grid-cols-[1fr,20rem] 3xl:grid-cols-[1fr,25rem] 4xl:grid-cols-[1fr,34rem] 4xl:gap-5">
          <div className="flex flex-col gap-3">
            {you && <RoleCard you={you} t={t} />}

            <section className="panel p-3">
              <p className="section-label mb-2">
                {phase === 'NIGHT' ? t('mafia.pickTarget') : phase === 'VOTE' ? t('mafia.pickVote') : t('mafia.playersAlive')}
                {' · '}
                {state.players.filter((p) => p.alive).length}/{state.players.length}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-8 4xl:gap-3">
                {state.players.map((p) => (
                  <PlayerTile
                    key={p.id}
                    player={p}
                    phase={phase}
                    voteTally={state.voteTally}
                    onPick={pick}
                    selectable={selectable(p)}
                    selected={selectedId === p.id}
                    checked={checkedId === p.id}
                    t={t}
                  />
                ))}
              </div>
            </section>

            <ActionPanel state={state} onVote={actions.vote} nightMode={nightMode} setNightMode={setNightMode} t={t} />
            <ResultsFeed state={state} t={t} />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex justify-end"><SocialBar compact /></div>
            <ChatBox chat={chat} phase={phase} you={you} players={state.players} onSend={actions.sendChat} t={t} />
            {state.settings.info.showHistory && <HistoryPanel history={state.history} t={t} />}
            <button type="button" onClick={onLeave} className="btn-quiet py-2 text-[12.5px]">
              {t('waiting.leave')}
            </button>
          </div>
        </div>
      </div>

      {phase === 'GAME_OVER' && <GameOverScreen state={state} isHost={isHost} actions={actions} onLeave={onLeave} t={t} />}
    </div>
  );
}
