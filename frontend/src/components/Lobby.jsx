// Lobby.jsx
// Handles three sub-states:
//  1. Landing: no room yet -> choose create or join
//  2. Waiting room: in a room, phase === 'LOBBY' -> show players, host can start
//  3. (Game itself is handled by GameUI once phase !== 'LOBBY')

import { useState } from 'react';
import HeroBoard from './HeroBoard';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslation } from '../i18n/LanguageContext';

function DieGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none">
      <rect x="4" y="4" width="40" height="40" rx="10" fill="currentColor" />
      <circle cx="16" cy="16" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="32" cy="16" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="16" cy="32" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="32" cy="32" r="3.4" fill="#211a0f" fillOpacity="0.85" />
      <circle cx="24" cy="24" r="3.4" fill="#211a0f" fillOpacity="0.85" />
    </svg>
  );
}

function PlayerSlot({ player, isMe }) {
  const { t } = useTranslation();
  return (
    <div
      className={`animate-rise-in flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        isMe ? 'border-brass bg-brass/10 shadow-brass' : 'border-board-line bg-board-tile'
      }`}
    >
      <span className="relative shrink-0">
        <span
          className="block h-9 w-9 rounded-full shadow-token ring-2 ring-white/60"
          style={{ backgroundColor: player.color }}
          aria-hidden="true"
        />
        {player.isHost && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brass text-[8px] shadow-token ring-2 ring-board-tile">
            ★
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">
          {player.nickname}
          {isMe && <span className="ml-1.5 text-xs font-normal text-ink-faint">({t('waiting.you')})</span>}
        </p>
        <p className="text-xs text-ink-faint">
          {player.isHost ? t('waiting.host') : t('waiting.ready')}
          {!player.connected && ` · ${t('waiting.offline')}`}
        </p>
      </div>
    </div>
  );
}

function LandingScreen({ onCreate, onJoin, joining, savedNickname }) {
  const { t } = useTranslation();
  const urlRoomCode = new URLSearchParams(window.location.search).get('room');
  const [mode, setMode] = useState(urlRoomCode ? 'join' : null);
  const [nickname, setNickname] = useState(savedNickname);
  const [roomCode, setRoomCode] = useState(urlRoomCode ? urlRoomCode.toUpperCase() : '');
  const [error, setError] = useState('');

  const submitCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!nickname.trim()) return setError(t('landing.errorNicknameRequired'));
    try {
      await onCreate(nickname.trim());
    } catch (err) {
      setError(err.message);
    }
  };

  const submitJoin = async (e) => {
    e.preventDefault();
    setError('');
    if (!nickname.trim()) return setError(t('landing.errorNicknameRequired'));
    if (!roomCode.trim()) return setError(t('landing.errorRoomCodeRequired'));
    try {
      await onJoin(roomCode.trim().toUpperCase(), nickname.trim());
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <LanguageSwitcher variant="dark" />
      </div>

      {/* Hero board fills the space beside the card on wide viewports
          instead of leaving it empty. Hidden below lg: at narrow widths
          there's no room for it to sit *beside* the content without
          colliding with it, so it's better omitted than fighting the
          text for attention. */}
      <div className="pointer-events-none absolute inset-0 hidden lg:flex lg:items-center lg:justify-end lg:pr-[6vw]">
        <div className="opacity-90 lg:-translate-y-[3vh]">
          <HeroBoard className="lg:scale-100" />
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-6 py-16 lg:flex-row lg:items-center lg:justify-start lg:gap-16 lg:py-12">
        <div className="w-full lg:max-w-md">
          <div className="mb-8 lg:mb-10 lg:text-left">
            <div className="mb-4 inline-flex items-center gap-3">
              <DieGlyph className="h-11 w-11 text-brass drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]" />
              <h1 className="font-display text-[2.75rem] font-bold leading-none tracking-tight text-board-tile">
                {t('app.title')}
              </h1>
            </div>
            <p className="max-w-sm text-[15px] leading-relaxed text-board-tile/65">
              {t('app.tagline')}
            </p>
          </div>

          <div className="w-full rounded-2xl border border-brass/20 bg-board p-6 shadow-board texture-parchment sm:p-7">
            {!mode && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setMode('create')}
                  className="shimmer-sweep group relative rounded-xl bg-gradient-to-b from-brass-bright to-brass px-5 py-4 text-left font-semibold text-brass-ink shadow-tile transition-transform active:scale-[0.98]"
                >
                  <span className="block text-base">{t('landing.hostGame')}</span>
                  <span className="block text-xs font-normal text-brass-ink/70">{t('landing.hostGameSub')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('join')}
                  className="rounded-xl border-2 border-ink/12 px-5 py-4 text-left font-semibold text-ink transition-colors hover:border-brass/50 hover:bg-brass/5 active:scale-[0.98]"
                >
                  <span className="block text-base">{t('landing.joinGame')}</span>
                  <span className="block text-xs font-normal text-ink-faint">{t('landing.joinGameSub')}</span>
                </button>
              </div>
            )}

            {mode === 'create' && (
              <form onSubmit={submitCreate} className="animate-rise-in flex flex-col gap-4">
                <button type="button" onClick={() => setMode(null)} className="self-start text-sm text-ink-faint transition-colors hover:text-ink">
                  {t('landing.back')}
                </button>
                <div>
                  <label htmlFor="nickname-create" className="mb-1.5 block text-sm font-medium text-ink-soft">
                    {t('landing.yourNickname')}
                  </label>
                  <input
                    id="nickname-create"
                    autoFocus
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={20}
                    placeholder={t('landing.nicknamePlaceholder')}
                    className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-brass"
                  />
                </div>
                {error && <p className="text-sm font-medium text-rent">{error}</p>}
                <button
                  type="submit"
                  disabled={joining}
                  className="rounded-xl bg-gradient-to-b from-brass-bright to-brass px-5 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {joining ? t('landing.creatingRoom') : t('landing.createRoom')}
                </button>
                <p className="text-center text-xs text-ink-faint">
                  {t('landing.createRoomHint')}
                </p>
              </form>
            )}

            {mode === 'join' && (
              <form onSubmit={submitJoin} className="animate-rise-in flex flex-col gap-4">
                <button type="button" onClick={() => setMode(null)} className="self-start text-sm text-ink-faint transition-colors hover:text-ink">
                  {t('landing.back')}
                </button>
                <div>
                  <label htmlFor="nickname-join" className="mb-1.5 block text-sm font-medium text-ink-soft">
                    {t('landing.yourNickname')}
                  </label>
                  <input
                    id="nickname-join"
                    autoFocus
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={20}
                    placeholder={t('landing.nicknamePlaceholder')}
                    className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-brass"
                  />
                </div>
                <div>
                  <label htmlFor="room-code" className="mb-1.5 block text-sm font-medium text-ink-soft">
                    {t('landing.roomCode')}
                  </label>
                  <input
                    id="room-code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={5}
                    placeholder={t('landing.roomCodePlaceholder')}
                    className="w-full rounded-lg border border-board-line bg-board-tile px-3.5 py-2.5 font-mono text-lg uppercase tracking-[0.3em] text-ink placeholder:tracking-normal placeholder:text-ink-faint focus:border-brass"
                  />
                </div>
                {error && <p className="text-sm font-medium text-rent">{error}</p>}
                <button
                  type="submit"
                  disabled={joining}
                  className="rounded-xl bg-gradient-to-b from-brass-bright to-brass px-5 py-3 font-semibold text-brass-ink shadow-tile transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {joining ? t('landing.joiningRoom') : t('landing.joinRoom')}
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-board-tile/45">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-go" />
              {t('app.feature.realtime')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brass-bright" />
              {t('app.feature.players')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rent" />
              {t('app.feature.free')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WaitingRoom({ gameState, playerId, onStart, onLeave, roomCode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const me = gameState.players.find((p) => p.id === playerId);
  const isHost = me?.isHost;
  const canStart = gameState.players.length >= 2;
  const seatsLeft = 10 - gameState.players.length;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available, ignore */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}?room=${roomCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available, ignore */
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 8%, rgba(240,197,99,0.18) 0%, transparent 70%)' }}
      />

      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LanguageSwitcher variant="dark" />
      </div>

      <div className="mx-auto flex max-w-2xl flex-col justify-center" style={{ minHeight: 'calc(100vh - 6rem)' }}>
        <div className="mb-7 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-board-tile/50">{t('waiting.roomCode')}</p>
          <div className="flex items-center justify-center gap-3">
            <p className="font-display text-6xl font-bold tracking-[0.15em] text-board-tile drop-shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
              {roomCode}
            </p>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-lg border border-board-tile/25 px-3 py-2 text-sm font-medium text-board-tile/80 transition-colors hover:border-brass/60 hover:bg-white/5 hover:text-board-tile"
            >
              {copied ? t('waiting.copied') : t('waiting.copy')}
            </button>
          </div>
          <button type="button" onClick={copyLink} className="mt-2.5 text-sm text-brass-bright underline decoration-brass-bright/40 underline-offset-4 transition-colors hover:decoration-brass-bright">
            {t('waiting.copyInviteLink')}
          </button>
        </div>

        <div className="rounded-2xl border border-brass/20 bg-board p-6 shadow-board texture-parchment sm:p-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">
              {t('waiting.players')} <span className="text-ink-faint">({gameState.players.length}/10)</span>
            </h2>
            <button type="button" onClick={onLeave} className="text-sm text-ink-faint transition-colors hover:text-rent">
              {t('waiting.leave')}
            </button>
          </div>

          <div className="grid max-h-[42vh] grid-cols-1 gap-2.5 overflow-y-auto scrollbar-thin sm:grid-cols-2">
            {gameState.players.map((p) => (
              <PlayerSlot key={p.id} player={p} isMe={p.id === playerId} />
            ))}
          </div>

          {seatsLeft > 0 && (
            <p className="mt-3 text-center text-xs text-ink-faint">
              {t(seatsLeft === 1 ? 'waiting.seatOpen' : 'waiting.seatsOpen', { count: seatsLeft })}
            </p>
          )}

          <div className="mt-6 border-t border-board-line/70 pt-5">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={onStart}
                  disabled={!canStart}
                  className="w-full rounded-xl bg-gradient-to-b from-brass-bright to-brass px-5 py-3.5 font-semibold text-brass-ink shadow-tile transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {canStart ? t('waiting.startGame') : t('waiting.needMorePlayers')}
                </button>
                <p className="mt-2 text-center text-xs text-ink-faint">
                  {t('waiting.hostOnlyHint')}
                </p>
              </>
            ) : (
              <p className="flex items-center justify-center gap-2 text-center text-sm text-ink-faint">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass" />
                {t('waiting.waitingForHost')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Lobby({ gameState, playerId, roomCode, onCreate, onJoin, onStart, onLeave, joining, savedNickname }) {
  if (!gameState || !roomCode) {
    return <LandingScreen onCreate={onCreate} onJoin={onJoin} joining={joining} savedNickname={savedNickname} />;
  }
  return (
    <WaitingRoom
      gameState={gameState}
      playerId={playerId}
      onStart={onStart}
      onLeave={onLeave}
      roomCode={roomCode}
    />
  );
}
