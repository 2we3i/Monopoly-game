// ChpokGame.jsx
// The ЧПОК table. Everyone sits around one device: it deals the themes and
// letters, runs the timers and keeps the score, while the players shout
// their answers and the table decides whether they count. The rules live
// in engine.js; this file shows the current step, whose turn it is and
// what to do, and turns the table's verdict into an action.
//
// The game in progress is kept in sessionStorage, so a reload or a trip
// back to the section does not lose it.

import {
  useCallback, useEffect, useState,
} from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { navigate } from '../../../lib/router';
import LanguageSwitcher from '../../LanguageSwitcher';
import Modal from '../../Modal';
import Icon from '../../icons';
import { DashIcon } from '../../ui/dash';
import {
  ANSWER_SECONDS, BOMB_ROUNDS, DUEL_OPEN, ENGINE_VERSION, GAMES, JUDGE_COUNT, KNOCKOUT_LIMIT, MAX_PLAYERS, MIN_PLAYERS,
  THIRTY_SECONDS, THIRTY_TURNS, act, createGame, minPlayersFor, scoreValues, seatsAfter, shuffle, standings,
} from './engine';

const storageKey = (gameId) => `landmark_tabletop_${gameId}`;

function loadSaved(gameId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(gameId)) || 'null');
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

function persist(gameId, data) {
  try {
    sessionStorage.setItem(storageKey(gameId), JSON.stringify(data));
  } catch {
    // The game still works; it just will not survive a reload.
  }
}

function validSetup(gameId, setup) {
  return !!setup
    && Array.isArray(setup.names)
    && setup.names.length >= MIN_PLAYERS
    && setup.names.length <= MAX_PLAYERS
    && GAMES[gameId].modes.includes(setup.mode);
}

function useNow(active, interval = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

const secondsLeft = (ms, max) => Math.min(max, Math.max(0, Math.ceil(ms / 1000)));

function scoreLabel(game, seat, values) {
  if (game.mode === 'knockout') return `${values[seat]}/${KNOCKOUT_LIMIT}`;
  if (game.mode === 'duel') return `+${game.win[seat]} −${game.pen[seat]}`;
  return String(values[seat]);
}

// --- Cards and shared pieces ---------------------------------------------

function ThemeCard({
  text, faceDown = false, size = 'lg', selected = false, onClick,
}) {
  const Tag = onClick ? 'button' : 'div';
  const sizes = size === 'lg'
    ? 'min-h-[10rem] p-6 text-[clamp(1.15rem,3.8vw,1.75rem)] sm:min-h-[12rem] 4xl:min-h-[16rem] 4xl:text-[2.2rem]'
    : 'min-h-[7.5rem] p-4 text-[15px] 4xl:min-h-[10rem] 4xl:text-[19px]';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={`chpok-anim chpok-flip relative flex w-full items-center justify-center rounded-2xl border bg-[#050505] text-center font-bold leading-snug text-white shadow-lift transition-all duration-150 ${sizes} ${
        selected ? 'border-brass-light ring-2 ring-brass-light' : 'border-white/15'
      } ${onClick ? 'hover:-translate-y-0.5 hover:border-white/35 active:scale-[0.98]' : ''}`}
    >
      <span className="absolute left-3 top-2.5 text-[10px] font-black uppercase tracking-[0.22em] text-white/30">Чпок</span>
      {faceDown
        ? <span className="font-display text-[26px] font-black uppercase tracking-[0.2em] text-white/15">Чпок</span>
        : text}
    </Tag>
  );
}

const LETTER_SIZES = {
  lg: 'h-28 w-24 text-[64px] sm:h-36 sm:w-28 sm:text-[80px] 4xl:h-48 4xl:w-40 4xl:text-[110px]',
  md: 'h-20 w-16 text-[40px] sm:h-24 sm:w-20 sm:text-[52px] 4xl:h-32 4xl:w-28 4xl:text-[70px]',
  sm: 'h-12 w-10 text-[24px] 4xl:h-16 4xl:w-14 4xl:text-[32px]',
};

function LetterCard({
  letter, size = 'lg', selected = false, dim = false, onClick,
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={`chpok-anim chpok-flip flex shrink-0 select-none items-center justify-center rounded-xl border-2 bg-[#f7f3ea] font-display font-black leading-none text-ink shadow-lift transition-all duration-150 ${LETTER_SIZES[size]} ${
        selected ? '-translate-y-1 border-brass ring-4 ring-brass/60' : 'border-black/10'
      } ${dim ? 'opacity-40' : ''} ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
    >
      {letter}
    </Tag>
  );
}

function CardStage({ theme, children }) {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <ThemeCard key={theme} text={theme} />
      {children && <div className="flex flex-wrap items-end justify-center gap-2">{children}</div>}
    </div>
  );
}

function Pill({ children }) {
  return <span className="pill whitespace-nowrap bg-white/[0.06] text-parch/70">{children}</span>;
}

const BIG_BUTTON = {
  primary: 'btn-primary',
  success: 'btn-success',
};

function BigButton({
  tone = 'primary', disabled, onClick, children,
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${BIG_BUTTON[tone]} w-full py-4 text-[16px] 4xl:py-5 4xl:text-[19px]`}>
      {children}
    </button>
  );
}

function TaskBanner({
  who, role, task, aside,
}) {
  const { t } = useTranslation();
  return (
    <section className="panel flex flex-wrap items-center gap-3 px-4 py-3 4xl:px-6 4xl:py-4" aria-live="polite">
      <div className="min-w-0 flex-1 basis-56">
        <p className="section-label">{role || t('tabletop.turn')}</p>
        <p className="truncate font-display text-[21px] font-black leading-tight text-parch 4xl:text-[28px]">{who ?? t('tabletop.everyone')}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-parch/75 4xl:text-[16px]">
          <span className="font-semibold text-brass-light">{t('tabletop.todo')}:</span>
          {' '}
          {task}
        </p>
      </div>
      {aside}
    </section>
  );
}

function BigTimer({ seconds, warn = false, label }) {
  const { t } = useTranslation();
  return (
    <div role="timer" className={`panel flex min-w-[5.5rem] flex-col items-center px-4 py-2 4xl:min-w-[7rem] ${warn ? 'border-rent-light/60' : ''}`}>
      <span className="section-label">{label || t('tabletop.timer')}</span>
      <span className={`font-mono text-[34px] font-black leading-none tnum 4xl:text-[44px] ${warn ? 'text-rent-light' : 'text-parch'}`}>{seconds}</span>
    </div>
  );
}

function Scoreboard({ game, active }) {
  const { t } = useTranslation();
  const values = scoreValues(game);
  return (
    <section className="panel p-3 4xl:p-4">
      <p className="section-label mb-2">{t(`tabletop.unit.${game.mode}`)}</p>
      <ul className="flex flex-wrap gap-1.5">
        {game.players.map((name, seat) => {
          const on = active === seat;
          const out = !!game.out?.[seat];
          return (
            <li
              key={seat}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[13px] 4xl:text-[15px] ${
                on ? 'animate-turn-ring border-brass/60 bg-brass/15 text-parch' : 'border-white/[0.08] bg-white/[0.04] text-parch/80'
              } ${out ? 'opacity-45' : ''}`}
            >
              <span className={`max-w-[9rem] truncate font-semibold ${out ? 'line-through' : ''}`}>{name}</span>
              <span className="rounded-md bg-black/35 px-1.5 font-mono text-[12px] font-bold tnum text-parch">{scoreLabel(game, seat, values)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Notices({ notices }) {
  const { t } = useTranslation();
  if (!notices?.length) return null;
  return (
    <ul className="flex flex-col gap-1.5" aria-live="polite">
      {notices.map((n, i) => (
        <li
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className={`flex animate-slide-up items-start gap-2 rounded-xl border px-3 py-2 text-[13.5px] 4xl:text-[16px] ${
            n.drink ? 'border-brass/35 bg-brass/10 text-brass-soft' : 'border-white/[0.08] bg-white/[0.04] text-parch/85'
          }`}
        >
          <span aria-hidden="true">{n.drink ? '🍺' : '•'}</span>
          <span>{t(n.key, n.vars)}</span>
        </li>
      ))}
    </ul>
  );
}

function PlayerPicker({
  players, exclude = [], onPick, label,
}) {
  return (
    <section>
      <p className="section-label mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {players.map((name, seat) => (exclude.includes(seat) ? null : (
          <button key={seat} type="button" onClick={() => onPick(seat)} className="btn-ghost min-w-0 py-3 text-[14px]">
            <span className="truncate">{name}</span>
          </button>
        )))}
      </div>
    </section>
  );
}

function VerdictPanel({
  name, hint, onChange, acceptHint = false, children,
}) {
  const { t } = useTranslation();
  return (
    <section className="panel flex animate-slide-up flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="section-label">{t('tabletop.answeredFirst')}</p>
          <p className="truncate font-display text-[20px] font-black text-parch">{name}</p>
          {hint && <p className="mt-0.5 text-[13px] text-parch/65">{hint}</p>}
        </div>
        <button type="button" onClick={onChange} className="btn-quiet px-3 py-2 text-[12.5px]">{t('tabletop.changePlayer')}</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
      {acceptHint && <p className="text-[12px] text-parch/45">{t('tabletop.acceptHint')}</p>}
    </section>
  );
}

// --- Box 1 ---------------------------------------------------------------

function KnockoutTable({ game, dispatch }) {
  const { t } = useTranslation();
  const answering = game.phase === 'answer';
  const now = useNow(answering);

  if (!answering) {
    return (
      <>
        <TaskBanner who={game.players[game.leader]} task={t('tabletop.knockout.readyTask')} />
        <BigButton onClick={() => dispatch({ type: 'reveal' })}>{t('tabletop.knockout.reveal')}</BigButton>
        <Scoreboard game={game} active={game.leader} />
      </>
    );
  }

  const letter = game.letters[game.letters.length - 1];
  const left = secondsLeft(game.turnStartedAt + ANSWER_SECONDS * 1000 - now, ANSWER_SECONDS);
  return (
    <>
      <TaskBanner
        who={game.players[game.answerer]}
        task={t('tabletop.knockout.answerTask', { letter })}
        aside={<BigTimer seconds={left} warn={left === 0} label={left === 0 ? t('tabletop.timeUp') : undefined} />}
      />
      <CardStage theme={game.theme}>
        {game.letters.slice(-4, -1).map((l, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <LetterCard key={`${game.letters.length}-${i}`} letter={l} size="sm" dim />
        ))}
        <LetterCard key={`${letter}-${game.letters.length}`} letter={letter} />
      </CardStage>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => dispatch({ type: 'answered' })} className="btn-success py-4 text-[15.5px]">
          <Icon.check className="h-5 w-5" />
          {t('tabletop.knockout.answered')}
        </button>
        <button type="button" onClick={() => dispatch({ type: 'failed' })} className="btn-danger py-4 text-[15.5px]">
          <Icon.close className="h-5 w-5" />
          {t('tabletop.knockout.failed')}
        </button>
      </div>
      <p className="text-center text-[12px] text-parch/45">{t('tabletop.acceptHint')}</p>
      <Scoreboard game={game} active={game.answerer} />
    </>
  );
}

function AlphabetTable({ game, dispatch }) {
  const { t } = useTranslation();
  const [player, setPlayer] = useState(null);
  const [picked, setPicked] = useState([]);
  useEffect(() => { setPlayer(null); setPicked([]); }, [game.seq]);

  const reset = () => { setPlayer(null); setPicked([]); };
  const toggle = (i) => setPicked((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]));
  const choosing = player !== null;

  return (
    <>
      <TaskBanner task={t('tabletop.alphabet.task')} aside={<Pill>{t('tabletop.lettersLeft', { n: game.white.deck.length })}</Pill>} />
      <ThemeCard key={game.theme} text={game.theme} />
      <div className="flex flex-wrap justify-center gap-2">
        {game.open.map((letter, i) => (
          <LetterCard
            // eslint-disable-next-line react/no-array-index-key
            key={`${letter}-${i}`}
            letter={letter}
            size="md"
            selected={picked.includes(i)}
            onClick={choosing ? () => toggle(i) : undefined}
          />
        ))}
      </div>
      {choosing ? (
        <VerdictPanel name={game.players[player]} hint={t('tabletop.alphabet.pickLetters')} onChange={reset} acceptHint>
          <button type="button" disabled={picked.length < 2} onClick={() => dispatch({ type: 'capture', player, letters: picked })} className="btn-success py-3.5">
            <Icon.check className="h-4 w-4" />
            {t('tabletop.alphabet.take', { n: picked.length })}
          </button>
          <button type="button" onClick={reset} className="btn-danger py-3.5">
            <Icon.close className="h-4 w-4" />
            {t('tabletop.notAccepted')}
          </button>
        </VerdictPanel>
      ) : (
        <>
          <PlayerPicker players={game.players} onPick={setPlayer} label={t('tabletop.whoFirst')} />
          <button type="button" onClick={() => dispatch({ type: 'addLetter' })} className="btn-ghost w-full py-3">{t('tabletop.alphabet.addLetter')}</button>
        </>
      )}
      <Scoreboard game={game} />
    </>
  );
}

function PartyTable({ game, dispatch }) {
  const { t } = useTranslation();
  const [player, setPlayer] = useState(null);
  useEffect(() => { setPlayer(null); }, [game.seq]);

  return (
    <>
      <TaskBanner task={t('tabletop.party.task', { letter: game.letter })} aside={<Pill>{t('tabletop.themesLeft', { n: game.black.deck.length })}</Pill>} />
      <CardStage theme={game.theme}>
        <LetterCard key={game.letter} letter={game.letter} />
      </CardStage>
      {player === null ? (
        <>
          <PlayerPicker players={game.players} onPick={setPlayer} label={t('tabletop.whoFirst')} />
          <button type="button" onClick={() => dispatch({ type: 'nobody' })} className="btn-ghost w-full py-3">{t('tabletop.party.nobody')}</button>
        </>
      ) : (
        <VerdictPanel name={game.players[player]} onChange={() => setPlayer(null)} acceptHint>
          <button type="button" onClick={() => dispatch({ type: 'win', player })} className="btn-success py-3.5">
            <Icon.check className="h-4 w-4" />
            <span className="truncate">{t('tabletop.party.award', { name: game.players[player] })}</span>
          </button>
          <button type="button" onClick={() => dispatch({ type: 'reject', player })} className="btn-danger py-3.5">
            <Icon.close className="h-4 w-4" />
            {t('tabletop.notAccepted')}
          </button>
        </VerdictPanel>
      )}
      <Scoreboard game={game} />
    </>
  );
}

function JudgeTable({ game, dispatch }) {
  const { t } = useTranslation();
  const answering = game.phase === 'answers';
  const now = useNow(answering, 200);
  const role = t('tabletop.judge.role');
  const judge = game.players[game.judge];

  if (!answering) {
    return (
      <>
        <TaskBanner role={role} who={judge} task={t('tabletop.judge.readyTask')} aside={<Pill>{t('tabletop.themesLeft', { n: game.black.deck.length })}</Pill>} />
        <BigButton onClick={() => dispatch({ type: 'deal' })}>{t('tabletop.judge.deal')}</BigButton>
        <Scoreboard game={game} active={game.judge} />
      </>
    );
  }

  const elapsed = Math.max(0, now - game.countdownFrom);
  const done = elapsed >= JUDGE_COUNT * 1000;
  const count = Math.min(JUDGE_COUNT, Math.floor(elapsed / 1000) + 1);
  return (
    <>
      <TaskBanner
        role={role}
        who={judge}
        task={t(done ? 'tabletop.judge.answerTask' : 'tabletop.judge.countTask')}
        aside={<BigTimer seconds={count} label={t('tabletop.judge.count')} />}
      />
      <ThemeCard key={game.theme} text={game.theme} />
      <section>
        <p className="section-label mb-2">{t('tabletop.judge.order')}</p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {seatsAfter(game.players.length, game.judge).map((seat, k) => (
            <li key={seat} className="panel-flat flex items-center gap-3 p-2.5">
              <span className="w-4 text-center font-mono text-[12px] text-parch/40">{k + 1}</span>
              <LetterCard letter={game.hands[seat]} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-parch">{game.players[seat]}</span>
              <button type="button" disabled={!done} onClick={() => dispatch({ type: 'award', player: seat })} className="btn-primary px-3 py-2 text-[13px]">
                {t('tabletop.judge.best')}
              </button>
            </li>
          ))}
        </ol>
      </section>
      <Scoreboard game={game} active={game.judge} />
    </>
  );
}

function ThirtyTable({ game, dispatch }) {
  const { t } = useTranslation();
  const running = game.phase === 'running';
  const now = useNow(running);
  const [stealing, setStealing] = useState(false);
  const expired = running && now >= game.endsAt;

  useEffect(() => {
    if (expired) dispatch({ type: 'end', endsAt: game.endsAt });
  }, [expired, game.endsAt, dispatch]);
  useEffect(() => { setStealing(false); }, [game.seq]);

  const name = game.players[game.current];
  const turn = game.turns.reduce((sum, n) => sum + n, 0) + 1;
  const turnPill = <Pill>{t('tabletop.thirty.turnOf', { k: turn, n: game.players.length * THIRTY_TURNS })}</Pill>;

  if (!running) {
    return (
      <>
        <TaskBanner who={name} task={t('tabletop.thirty.readyTask')} aside={turnPill} />
        <BigButton onClick={() => dispatch({ type: 'start' })}>{t('tabletop.thirty.start')}</BigButton>
        <Scoreboard game={game} active={game.current} />
      </>
    );
  }

  const left = secondsLeft(game.endsAt - now, THIRTY_SECONDS);
  return (
    <>
      <TaskBanner who={name} task={t('tabletop.thirty.runTask', { letter: game.letter })} aside={<BigTimer seconds={left} warn={left <= 5} />} />
      <CardStage theme={game.theme}>
        <LetterCard key={`${game.letter}-${game.count}-${game.passes}`} letter={game.letter} />
      </CardStage>
      <BigButton tone="success" disabled={expired} onClick={() => dispatch({ type: 'score' })}>
        <Icon.check className="h-5 w-5" />
        {t('tabletop.thirty.score')}
      </BigButton>
      <p className="text-center font-mono text-[15px] font-bold tnum text-parch/75">{t('tabletop.thirty.count', { n: game.count })}</p>
      {game.alcohol && (stealing ? (
        <PlayerPicker players={game.players} exclude={[game.current]} onPick={(seat) => dispatch({ type: 'steal', player: seat })} label={t('tabletop.thirty.steal')} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={expired} onClick={() => dispatch({ type: 'pass' })} className="btn-ghost py-3">{t('tabletop.thirty.pass')}</button>
          <button type="button" disabled={expired} onClick={() => setStealing(true)} className="btn-ghost py-3">{t('tabletop.thirty.steal')}</button>
        </div>
      ))}
      <div className="flex justify-center">{turnPill}</div>
      <Scoreboard game={game} active={game.current} />
    </>
  );
}

// --- Box 2 ---------------------------------------------------------------

function TalentTable({ game, dispatch }) {
  const { t } = useTranslation();
  // Whose hand is on screen right now. Reset whenever the device has to
  // change hands, so the next player's cards never show before they ask.
  const [shownFor, setShownFor] = useState(null);
  const [card, setCard] = useState(null);
  useEffect(() => { setCard(null); }, [game.seq]);
  useEffect(() => { setShownFor(null); }, [game.pickIndex, game.phase]);

  const host = game.players[game.host];
  const role = t('tabletop.talent.host');

  if (game.phase === 'ready') {
    return (
      <>
        <TaskBanner role={role} who={host} task={t('tabletop.talent.readyTask')} aside={<Pill>{t('tabletop.themesLeft', { n: game.black.deck.length })}</Pill>} />
        <BigButton onClick={() => dispatch({ type: 'reveal' })}>{t('tabletop.talent.reveal')}</BigButton>
        <Scoreboard game={game} active={game.host} />
      </>
    );
  }

  if (game.phase === 'hostAnswer') {
    return (
      <>
        <TaskBanner role={role} who={host} task={t('tabletop.talent.hostTask', { letter: game.letter })} />
        <CardStage theme={game.theme}>
          <LetterCard letter={game.letter} />
        </CardStage>
        <BigButton onClick={() => dispatch({ type: 'toPick' })}>{t('tabletop.talent.toPick')}</BigButton>
        <Scoreboard game={game} active={game.host} />
      </>
    );
  }

  if (game.phase === 'pick') {
    const seat = game.queue[game.pickIndex];
    const name = game.players[seat];
    const progress = <Pill>{t('tabletop.talent.progress', { k: game.pickIndex, n: game.queue.length })}</Pill>;

    if (shownFor !== seat) {
      return (
        <>
          <section className="panel flex animate-scale-in flex-col items-center gap-3 px-5 py-10 text-center 4xl:py-16">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brass/15 text-brass-light">
              <Icon.eye className="h-6 w-6" />
            </span>
            <h2 className="font-display text-[clamp(1.4rem,4.5vw,2rem)] font-black leading-tight text-parch">{t('tabletop.talent.passTo', { name })}</h2>
            <p className="max-w-sm text-[13.5px] text-parch/60">{t('tabletop.talent.noPeeking', { name })}</p>
            {progress}
            <button type="button" onClick={() => setShownFor(seat)} className="btn-primary mt-2 px-6 py-3.5 text-[15px]">
              {t('tabletop.talent.showHand', { name })}
            </button>
          </section>
          <Scoreboard game={game} active={game.host} />
        </>
      );
    }

    return (
      <>
        <TaskBanner who={name} task={t('tabletop.talent.pickTask', { letter: game.letter })} aside={<LetterCard letter={game.letter} size="sm" />} />
        <p className="text-[12.5px] text-parch/50">{t('tabletop.talent.hostTheme', { name: host, theme: game.theme })}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {game.hands[seat].map((text, k) => (
            // eslint-disable-next-line react/no-array-index-key
            <ThemeCard key={`${text}-${k}`} text={text} size="sm" selected={card === k} onClick={() => setCard(k)} />
          ))}
        </div>
        <BigButton disabled={card === null} onClick={() => dispatch({ type: 'submit', player: seat, card })}>{t('tabletop.talent.submit')}</BigButton>
        {game.alcohol && (
          <button type="button" onClick={() => dispatch({ type: 'redraw', player: seat })} className="btn-ghost w-full py-3">{t('tabletop.talent.redraw')}</button>
        )}
        <div className="flex justify-center">{progress}</div>
      </>
    );
  }

  const allOpen = game.revealed >= game.submissions.length;
  return (
    <>
      <TaskBanner role={role} who={host} task={t(allOpen ? 'tabletop.talent.chooseTask' : 'tabletop.talent.revealTask')} aside={<LetterCard letter={game.letter} size="sm" />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {game.submissions.map((sub, k) => (k < game.revealed ? (
          // eslint-disable-next-line react/no-array-index-key
          <ThemeCard key={`open-${k}`} text={sub.card} size="sm" selected={card === k} onClick={allOpen ? () => setCard(k) : undefined} />
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <ThemeCard key={`closed-${k}`} faceDown size="sm" />
        )))}
      </div>
      {allOpen ? (
        <BigButton disabled={card === null} onClick={() => dispatch({ type: 'choose', submission: card })}>{t('tabletop.talent.choose')}</BigButton>
      ) : (
        <BigButton onClick={() => dispatch({ type: 'revealNext' })}>{t('tabletop.talent.revealNext')}</BigButton>
      )}
      <Scoreboard game={game} active={game.host} />
    </>
  );
}

function BombTable({ game, dispatch }) {
  const { t } = useTranslation();
  const running = game.phase === 'running';
  const now = useNow(running, 250);
  const expired = running && now >= game.endsAt;

  useEffect(() => {
    if (expired) dispatch({ type: 'boom', endsAt: game.endsAt });
  }, [expired, game.endsAt, dispatch]);

  const roundPill = <Pill>{t('tabletop.bomb.round', { r: game.round, n: BOMB_ROUNDS })}</Pill>;

  if (!running) {
    return (
      <>
        <TaskBanner who={game.players[game.first]} task={t('tabletop.bomb.readyTask')} aside={roundPill} />
        <BigButton onClick={() => dispatch({ type: 'start' })}>{t('tabletop.bomb.start')}</BigButton>
        <Scoreboard game={game} active={game.first} />
      </>
    );
  }

  // Like a kitchen timer turned away from the table: no seconds, only a
  // fuse that ticks faster near the end.
  const hurry = game.endsAt - now < 15000;
  return (
    <>
      <TaskBanner
        who={game.players[game.holder]}
        task={t('tabletop.bomb.runTask', { letter: game.letter })}
        aside={(
          <div role="timer" className={`panel flex items-center gap-2 px-3 py-2 ${hurry ? 'border-rent-light/50' : ''}`}>
            <span className={`chpok-anim inline-block text-[26px] ${hurry ? 'chpok-tick-fast' : 'chpok-tick'}`} aria-hidden="true">💣</span>
            <span className="text-[12px] font-semibold text-parch/60">{t('tabletop.bomb.ticking')}</span>
          </div>
        )}
      />
      <CardStage theme={game.theme}>
        <LetterCard key={`${game.letter}-${game.holder}`} letter={game.letter} />
      </CardStage>
      <BigButton tone="success" disabled={expired} onClick={() => dispatch({ type: 'pass' })}>{t('tabletop.bomb.pass')}</BigButton>
      {game.alcohol && (
        <button type="button" disabled={expired || game.skipUsed[game.holder]} onClick={() => dispatch({ type: 'skip' })} className="btn-ghost w-full py-3">
          {t('tabletop.bomb.skip')}
        </button>
      )}
      <div className="flex justify-center">{roundPill}</div>
      <Scoreboard game={game} active={game.holder} />
    </>
  );
}

function DuelTable({ game, dispatch }) {
  const { t } = useTranslation();
  const [player, setPlayer] = useState(null);
  const [picked, setPicked] = useState([]);
  useEffect(() => { setPlayer(null); setPicked([]); }, [game.seq]);

  const reset = () => { setPlayer(null); setPicked([]); };
  const toggle = (i) => setPicked((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]));
  const choosing = player !== null;
  const rounds = Math.floor(game.white.deck.length / DUEL_OPEN) + 1;

  return (
    <>
      <TaskBanner task={t('tabletop.duel.task')} aside={<Pill>{t('tabletop.duel.roundsLeft', { n: rounds })}</Pill>} />
      <ThemeCard key={game.theme} text={game.theme} />
      <div className="flex flex-wrap justify-center gap-2">
        {game.open.map((letter, i) => (
          <LetterCard
            // eslint-disable-next-line react/no-array-index-key
            key={`${letter}-${i}`}
            letter={letter}
            size="md"
            selected={picked.includes(i)}
            onClick={choosing ? () => toggle(i) : undefined}
          />
        ))}
      </div>
      {choosing ? (
        <VerdictPanel name={game.players[player]} hint={t('tabletop.duel.pickLetters')} onChange={reset}>
          <div className="sm:col-span-2">
            <button type="button" onClick={() => dispatch({ type: 'claim', player, letters: picked })} className="btn-success w-full py-3.5">
              <Icon.check className="h-4 w-4" />
              {t('tabletop.duel.claim', { win: picked.length, pen: game.open.length - picked.length })}
            </button>
          </div>
        </VerdictPanel>
      ) : (
        <PlayerPicker players={game.players} onPick={setPlayer} label={t('tabletop.whoFirst')} />
      )}
      <Scoreboard game={game} />
    </>
  );
}

const TABLES = {
  knockout: KnockoutTable,
  alphabet: AlphabetTable,
  party: PartyTable,
  judge: JudgeTable,
  thirty: ThirtyTable,
  talent: TalentTable,
  bomb: BombTable,
  duel: DuelTable,
};

// --- Setup, rules and results ----------------------------------------------

function Setup({
  gameId, setup, onChange, onStart, onRules,
}) {
  const { t } = useTranslation();
  const { names } = setup;
  const min = minPlayersFor(setup.mode);
  const tooFew = names.length < min;

  const setName = (i, value) => onChange({ ...setup, names: names.map((n, k) => (k === i ? value : n)) });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section className="panel flex flex-col gap-3 p-4 4xl:p-6">
        <div>
          <p className="section-label">{t('tabletop.setup.players', { min: MIN_PLAYERS, max: MAX_PLAYERS })}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-parch/50">{t('tabletop.setup.playersHint')}</p>
        </div>
        <ol className="flex flex-col gap-2">
          {names.map((name, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-[12px] text-parch/40">{i + 1}</span>
              <input
                value={name}
                maxLength={20}
                onChange={(e) => setName(i, e.target.value)}
                aria-label={t('tabletop.setup.playerName', { n: i + 1 })}
                className="field flex-1"
              />
              <button
                type="button"
                disabled={names.length <= MIN_PLAYERS}
                onClick={() => onChange({ ...setup, names: names.filter((_, k) => k !== i) })}
                title={t('tabletop.setup.remove')}
                aria-label={t('tabletop.setup.remove')}
                className="btn-quiet px-2 py-2"
              >
                <Icon.close className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={names.length >= MAX_PLAYERS}
            onClick={() => onChange({ ...setup, names: [...names, t('tabletop.playerN', { n: names.length + 1 })] })}
            className="btn-ghost px-3 py-2 text-[13px]"
          >
            <Icon.plus className="h-4 w-4" />
            {t('tabletop.setup.addPlayer')}
          </button>
          <button type="button" onClick={() => onChange({ ...setup, names: shuffle(names) })} className="btn-quiet px-3 py-2 text-[13px]">
            <Icon.refresh className="h-4 w-4" />
            {t('tabletop.setup.shuffle')}
          </button>
        </div>
      </section>

      <section className="panel flex flex-col gap-3 p-4 4xl:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="section-label flex-1">{t('tabletop.setup.mode')}</p>
          <button type="button" onClick={() => onRules(setup.mode)} className="btn-quiet px-2.5 py-1.5 text-[12.5px]">
            <Icon.scroll className="h-4 w-4" />
            {t('tabletop.setup.modeRules')}
          </button>
        </div>
        <div role="radiogroup" aria-label={t('tabletop.setup.mode')} className="grid gap-2">
          {GAMES[gameId].modes.map((mode, k) => {
            const on = setup.mode === mode;
            const modeMin = minPlayersFor(mode);
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ ...setup, mode })}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  on ? 'border-brass/60 bg-brass/10' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold ${on ? 'bg-brass text-ink' : 'bg-white/10 text-parch/60'}`}>
                  {k + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold text-parch 4xl:text-[17px]">{t(`tabletop.mode.${mode}.name`)}</span>
                    {modeMin > MIN_PLAYERS && <Pill>{t('tabletop.setup.minPlayers', { n: modeMin })}</Pill>}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-parch/55 4xl:text-[14.5px]">{t(`tabletop.mode.${mode}.summary`)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="section-label mt-1">{t('tabletop.setup.options')}</p>
        <label className="panel-flat flex cursor-pointer items-start gap-3 p-3">
          <input type="checkbox" checked={setup.alcohol} onChange={(e) => onChange({ ...setup, alcohol: e.target.checked })} className="mt-1 h-4 w-4 accent-[#c9982f]" />
          <span>
            <span className="block text-[14px] font-semibold text-parch">{t('tabletop.setup.alcohol')}</span>
            <span className="block text-[12.5px] leading-snug text-parch/50">{t('tabletop.setup.alcoholHint')}</span>
          </span>
        </label>
        {gameId === 'chpok2' && (
          <label className="panel-flat flex cursor-pointer items-start gap-3 p-3">
            <input type="checkbox" checked={setup.withFirstBox} onChange={(e) => onChange({ ...setup, withFirstBox: e.target.checked })} className="mt-1 h-4 w-4 accent-[#c9982f]" />
            <span>
              <span className="block text-[14px] font-semibold text-parch">{t('tabletop.setup.firstBox')}</span>
              <span className="block text-[12.5px] leading-snug text-parch/50">{t('tabletop.setup.firstBoxHint')}</span>
            </span>
          </label>
        )}

        {tooFew && <p className="text-[12.5px] font-semibold text-rent-light">{t('tabletop.setup.needPlayers', { n: min })}</p>}
        <BigButton disabled={tooFew} onClick={onStart}>
          <Icon.chevronRight className="h-5 w-5" />
          {t('tabletop.setup.start')}
        </BigButton>
        <p className="text-center text-[12px] text-parch/40">{t('tabletop.setup.deviceHint')}</p>
      </section>
    </div>
  );
}

function RulesModal({ mode, onClose }) {
  const { t } = useTranslation();
  const list = (key) => t(key).split('|');
  return (
    <Modal onClose={onClose} title={t(`tabletop.mode.${mode}.name`)} subtitle={t('tabletop.rules.source')} icon={<Icon.scroll className="h-5 w-5" />} widthClass="max-w-xl">
      <p className="section-label mb-2">{t('tabletop.rules.how')}</p>
      <ol className="flex flex-col gap-2">
        {list(`tabletop.mode.${mode}.rules`).map((step, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-parch/85">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brass/20 font-mono text-[11px] font-bold text-brass-light">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <p className="section-label mb-1.5 mt-4">{t('tabletop.rules.end')}</p>
      <p className="text-[13.5px] leading-snug text-parch/85">{t(`tabletop.mode.${mode}.end`)}</p>
      <p className="section-label mb-1.5 mt-4">{t('tabletop.rules.alcohol')}</p>
      <ul className="flex flex-col gap-1.5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
        {list(`tabletop.mode.${mode}.alcohol`).map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} className="text-[12.5px] leading-snug text-parch/60">🍺 {line}</li>
        ))}
      </ul>
    </Modal>
  );
}

function ConfirmDialog({
  title, text, onConfirm, onClose,
}) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onClose}
      title={title}
      icon={<Icon.warning className="h-5 w-5" />}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-quiet px-4">{t('common.cancel')}</button>
          <button type="button" onClick={onConfirm} className="btn-primary px-4">{t('tabletop.confirm')}</button>
        </div>
      )}
    >
      <p className="text-[14px] text-parch/75">{text}</p>
    </Modal>
  );
}

function Results({ game, onAgain, onSettings }) {
  const { t } = useTranslation();
  const values = scoreValues(game);
  const winners = game.winners.map((seat) => game.players[seat]);
  return (
    <section className="panel animate-scale-in overflow-hidden">
      <div className="flex flex-col items-center gap-2 border-b border-white/[0.08] bg-gradient-to-b from-brass/15 to-transparent px-5 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brass-light to-brass-deep text-ink shadow-lift">
          <DashIcon name="trophy" className="h-7 w-7" />
        </span>
        <p className="section-label">{t('tabletop.results.title')}</p>
        <p className="text-[13px] text-parch/55">{t(winners.length > 1 ? 'tabletop.results.winners' : 'tabletop.results.winner')}</p>
        <h2 className="font-display text-[clamp(1.6rem,5vw,2.4rem)] font-black leading-tight text-parch">{winners.join(', ')}</h2>
      </div>
      <div className="p-4 4xl:p-6">
        <p className="section-label mb-2">{t('tabletop.results.standings')} · {t(`tabletop.unit.${game.mode}`)}</p>
        <ol className="flex flex-col gap-1.5">
          {standings(game).map((row, k) => {
            const won = game.winners.includes(row.index);
            return (
              <li key={row.index} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${won ? 'border-brass/50 bg-brass/10' : 'border-white/[0.07] bg-white/[0.03]'}`}>
                <span className="w-6 text-center font-mono text-[13px] font-bold text-parch/50">{k + 1}</span>
                <span className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${row.out ? 'text-parch/45 line-through' : 'text-parch'}`}>{row.name}</span>
                <span className="font-mono text-[14px] font-bold tnum text-parch">{scoreLabel(game, row.index, values)}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={onAgain} className="btn-primary py-3">
            <Icon.refresh className="h-4 w-4" />
            {t('tabletop.results.again')}
          </button>
          <button type="button" onClick={onSettings} className="btn-ghost py-3">
            <Icon.settings className="h-4 w-4" />
            {t('tabletop.results.settings')}
          </button>
          <button type="button" onClick={() => navigate('/tabletop')} className="btn-quiet py-3">
            <DashIcon name="arrowLeft" className="h-4 w-4" />
            {t('tabletop.back')}
          </button>
        </div>
      </div>
    </section>
  );
}

// --- The table -----------------------------------------------------------

export default function ChpokGame({ gameId }) {
  const { t } = useTranslation();
  const [saved] = useState(() => loadSaved(gameId));
  const [setup, setSetup] = useState(() => (validSetup(gameId, saved?.setup) ? saved.setup : {
    names: [1, 2, 3].map((n) => t('tabletop.playerN', { n })),
    mode: GAMES[gameId].modes[0],
    alcohol: false,
    withFirstBox: false,
  }));
  const [game, setGame] = useState(() => (
    saved?.game?.v === ENGINE_VERSION && saved.game.game === gameId ? saved.game : null
  ));
  const [rulesFor, setRulesFor] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { persist(gameId, { setup, game }); }, [gameId, setup, game]);

  const stage = game ? game.phase === 'over' ? 'over' : 'play' : 'setup';
  useEffect(() => { window.scrollTo(0, 0); }, [stage]);

  const dispatch = useCallback((action) => setGame((current) => (current ? act(current, action) : current)), []);

  const start = () => {
    const names = setup.names.map((name, i) => name.trim() || t('tabletop.playerN', { n: i + 1 }));
    setGame(createGame({
      game: gameId, mode: setup.mode, alcohol: setup.alcohol, withFirstBox: setup.withFirstBox, names,
    }));
  };

  const Table = game ? TABLES[game.mode] : null;

  return (
    <div className="table-chpok min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0b0a0c]/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 3xl:max-w-6xl 4xl:max-w-[1700px] 4xl:px-10 4xl:py-3.5">
          <button type="button" onClick={() => navigate('/tabletop')} className="btn-quiet shrink-0 px-2.5 py-1.5 text-[13px]" aria-label={t('tabletop.back')}>
            <DashIcon name="arrowLeft" className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabletop.back')}</span>
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 rounded-md bg-rent/85 px-1.5 py-0.5 text-[11px] font-black text-white">18+</span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[18px] font-black leading-tight text-parch 4xl:text-[24px]">{t(`menu.${gameId}.title`)}</h1>
              {game && <p className="truncate text-[11.5px] text-parch/50 4xl:text-[14px]">{t(`tabletop.mode.${game.mode}.name`)}</p>}
            </div>
          </div>
          {game && (
            <button type="button" onClick={() => setRulesFor(game.mode)} className="btn-quiet shrink-0 px-2.5 py-1.5 text-[13px]" aria-label={t('tabletop.rules')}>
              <Icon.scroll className="h-4 w-4" />
              <span className="hidden sm:inline">{t('tabletop.rules')}</span>
            </button>
          )}
          {game && (
            <button
              type="button"
              onClick={() => (stage === 'over' ? setGame(null) : setConfirm('new'))}
              className="btn-ghost shrink-0 px-2.5 py-1.5 text-[13px]"
              aria-label={t('tabletop.newGame')}
            >
              <Icon.refresh className="h-4 w-4" />
              <span className="hidden sm:inline">{t('tabletop.newGame')}</span>
            </button>
          )}
          <LanguageSwitcher variant="dark" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 3xl:max-w-6xl 4xl:max-w-[1700px] 4xl:gap-6 4xl:px-10 4xl:py-8">
        {stage === 'setup' && (
          <Setup gameId={gameId} setup={setup} onChange={setSetup} onStart={start} onRules={setRulesFor} />
        )}
        {stage === 'over' && (
          <>
            <Notices notices={game.notices} />
            <Results game={game} onAgain={start} onSettings={() => setGame(null)} />
          </>
        )}
        {stage === 'play' && (
          <>
            <Notices key={game.seq} notices={game.notices} />
            <Table game={game} dispatch={dispatch} />
            <div className="flex justify-center">
              <button type="button" onClick={() => setConfirm('finish')} className="btn-quiet px-3 py-2 text-[12.5px]">
                <Icon.flag className="h-4 w-4" />
                {t('tabletop.finishEarly')}
              </button>
            </div>
          </>
        )}
      </main>

      {rulesFor && <RulesModal mode={rulesFor} onClose={() => setRulesFor(null)} />}
      {confirm === 'new' && (
        <ConfirmDialog
          title={t('tabletop.confirmNew.title')}
          text={t('tabletop.confirmNew.text')}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); setGame(null); }}
        />
      )}
      {confirm === 'finish' && (
        <ConfirmDialog
          title={t('tabletop.confirmFinish.title')}
          text={t('tabletop.confirmFinish.text')}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); dispatch({ type: 'finish' }); }}
        />
      )}
    </div>
  );
}
