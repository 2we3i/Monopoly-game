// Lobby.jsx
// Identity is already resolved on AuthScreen before this renders, so
// these forms only collect what's still needed: mode (hosting) or room
// code (joining) - never a nickname again.

import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';
import PlayerAvatar from './PlayerAvatar';
import ProfileMenu from './ProfileMenu';
import SocialBar from './social/SocialBar';
import ShareRoom from './phone/ShareRoom';
import FramedAvatar from '../cosmetics/FramedAvatar';
import { isTestArmed } from '../lib/testMatch';
import { StyledName, useLook } from '../cosmetics/Cosmetics';

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

function useGameModes() {
  const [modes, setModes] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/game-modes')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setModes(data.modes || []);
      })
      .catch(() => {
        if (!cancelled) setModes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { modes };
}

function ModePicker({ modes, selectedId, onSelect, language, t }) {
  if (!modes) {
    return <div className="h-24 animate-pulse rounded-lg bg-board-line/40" />;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {modes.map((mode) => {
        const isSelected = mode.id === selectedId;
        const testArmed = isTestArmed('monopoly', mode.id);
        const unavailable = mode.available === false && !testArmed;
        const label = mode.label[language] || mode.label.en;
        const description = mode.description[language] || mode.description.en;
        return (
          <button
            key={mode.id}
            type="button"
            disabled={unavailable}
            onClick={() => onSelect(mode.id)}
            className={`rounded-xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected ? 'border-brass bg-brass/10' : 'border-ink/10 hover:border-brass/40'
            }`}
          >
            <p className="text-sm font-semibold text-ink">{label}</p>
            <p className="mt-0.5 text-xs leading-snug text-ink-faint">{description}</p>
            <p className="mt-1.5 text-[11px] font-medium text-brass-deep">
              {unavailable ? t('menu.unavailable') : t('landing.tiles', { count: mode.tileCount })}
              {testArmed && ` · ${t('creator.test.badge')}`}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function PlayerSlot({ player, isMe }) {
  const { t } = useTranslation();
  const look = useLook(player.cosmetics);
  // Name styles are drawn for dark surfaces; on the parchment card a
  // styled name sits on its own small dark plate.
  const styled = !!(look.nameStyle || look.nameDecor);
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        isMe ? 'border-brass bg-brass/10' : 'border-board-line bg-board-tile'
      }`}
    >
      <span className="relative shrink-0">
        <FramedAvatar cosmetics={player.cosmetics} join>
          <PlayerAvatar player={player} sizeClassName="h-9 w-9 4xl:h-11 4xl:w-11" ringClassName="ring-2 ring-white/60" />
        </FramedAvatar>
        {player.isHost && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brass text-[8px] shadow-token ring-2 ring-board-tile">
            ★
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 font-semibold text-ink 4xl:text-[17px]">
          {styled ? (
            <span className="inline-flex min-w-0 max-w-full rounded-md bg-felt-800 px-1.5 py-0.5">
              <StyledName nickname={player.nickname} look={look} intro className="text-parch" />
            </span>
          ) : <span className="truncate">{player.nickname}</span>}
          {isMe && <span className="shrink-0 text-xs font-normal text-ink-faint">({t('waiting.you')})</span>}
        </p>
        <p className="text-xs text-ink-faint">
          {player.isHost ? t('waiting.host') : t('waiting.ready')}
          {player.isGuest && ` · ${t('common.guest')}`}
          {!player.connected && ` · ${t('waiting.offline')}`}
        </p>
      </div>
    </div>
  );
}

function LandingScreen({
  onCreate, onJoin, joining, savedNickname, auth, onSwitchIdentity, onBackToMenu, onRequireAccount,
}) {
  const { t, language } = useTranslation();
  const [mode, setMode] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const { modes } = useGameModes();
  const [selectedModeId, setSelectedModeId] = useState(null);
  const isGuest = !auth?.isLoggedIn;

  useEffect(() => {
    if (modes && modes.length > 0 && !selectedModeId) {
      const firstAvailable = modes.find((m) => isTestArmed('monopoly', m.id)) || modes.find((m) => m.available !== false);
      if (firstAvailable) setSelectedModeId(firstAvailable.id);
    }
  }, [modes, selectedModeId]);

  const submitCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onCreate(savedNickname, selectedModeId);
    } catch (err) {
      if (err.code === 'GUEST_CANNOT_CREATE') onRequireAccount?.();
      setError(err.message);
    }
  };

  const submitJoin = async (e) => {
    e.preventDefault();
    setError('');
    if (!roomCode.trim()) return setError(t('landing.errorRoomCodeRequired'));
    try {
      await onJoin(roomCode.trim().toUpperCase(), savedNickname);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden px-6 py-12">
      {onBackToMenu && (
        <button
          type="button"
          onClick={onBackToMenu}
          className="absolute left-4 top-4 z-10 rounded-lg px-3 py-2 text-sm font-medium text-board/60 transition-colors hover:bg-white/5 hover:text-board sm:left-6 sm:top-6"
        >
          ← {t('menu.backToMenu')}
        </button>
      )}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-6 sm:top-6">
        <SocialBar compact />
        <ProfileMenu auth={auth} savedNickname={savedNickname} onSwitchIdentity={onSwitchIdentity} />
        <LanguageSwitcher variant="dark" />
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-col 4xl:max-w-xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-3">
            <DieGlyph className="h-11 w-11 text-brass drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]" />
            <h1 className="font-display text-[2.5rem] font-bold leading-none tracking-tight text-board">
              {t('app.title')}
            </h1>
          </div>
          <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-board/65">
            {t('app.tagline')}
          </p>
        </div>

        <div className="w-full rounded-2xl border border-brass/20 bg-board p-6 shadow-panel sm:p-7">
          {!mode && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => (isGuest ? onRequireAccount?.() : setMode('create'))}
                className="rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-4 text-left font-semibold text-ink shadow-tile transition-transform active:scale-[0.98]"
              >
                <span className="block text-base">{isGuest ? `🔒 ${t('landing.hostGame')}` : t('landing.hostGame')}</span>
                <span className="block text-xs font-normal text-ink/70">{isGuest ? t('gate.subtitle') : t('landing.hostGameSub')}</span>
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
            <form onSubmit={submitCreate} className="flex flex-col gap-4">
              <button type="button" onClick={() => setMode(null)} className="self-start text-sm text-ink-faint transition-colors hover:text-ink">
                {t('landing.back')}
              </button>
              <div>
                <p className="mb-1.5 block text-sm font-medium text-ink-soft">{t('landing.gameMode')}</p>
                <ModePicker modes={modes} selectedId={selectedModeId} onSelect={setSelectedModeId} language={language} t={t} />
              </div>
              {error && <p className="text-sm font-medium text-rent">{error}</p>}
              <button
                type="submit"
                disabled={joining}
                className="rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-3 font-semibold text-ink shadow-tile transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {joining ? t('landing.creatingRoom') : t('landing.createRoom')}
              </button>
              <p className="text-center text-xs text-ink-faint">
                {t('landing.createRoomHint')}
              </p>
            </form>
          )}

          {mode === 'join' && (
            <form onSubmit={submitJoin} className="flex flex-col gap-4">
              <button type="button" onClick={() => setMode(null)} className="self-start text-sm text-ink-faint transition-colors hover:text-ink">
                {t('landing.back')}
              </button>
              <div>
                <label htmlFor="room-code" className="mb-1.5 block text-sm font-medium text-ink-soft">
                  {t('landing.roomCode')}
                </label>
                <input
                  id="room-code"
                  autoFocus
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
                className="rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-3 font-semibold text-ink shadow-tile transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {joining ? t('landing.joiningRoom') : t('landing.joinRoom')}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-board/45">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-go" />
            {t('app.feature.realtime')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brass-light" />
            {t('app.feature.players')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rent" />
            {t('app.feature.free')}
          </span>
        </div>
      </div>
    </div>
  );
}

function WaitingRoom({ gameState, playerId, onStart, onLeave, roomCode }) {
  const { t, language } = useTranslation();
  const [copied, setCopied] = useState(false);
  const me = gameState.players.find((p) => p.id === playerId);
  const isHost = me?.isHost;
  const canStart = gameState.players.length >= 2;
  const seatsLeft = 10 - gameState.players.length;
  const { modes } = useGameModes();
  const activeMode = modes?.find((m) => m.id === gameState.modeId);
  const modeLabel = activeMode ? (activeMode.label[language] || activeMode.label.en) : gameState.modeId;

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
    <div className="relative min-h-screen overflow-clip px-4 py-16 sm:px-6 sm:py-12">
      <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
        <SocialBar compact />
        <LanguageSwitcher variant="dark" />
      </div>

      <div className="mx-auto flex max-w-2xl flex-col justify-center 3xl:max-w-3xl 4xl:max-w-5xl" style={{ minHeight: 'calc(100vh - 6rem)' }}>
        <div className="mb-7 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-board/50">{t('waiting.roomCode')}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <p className="font-display text-5xl font-bold tracking-[0.15em] text-board drop-shadow-[0_2px_12px_rgba(0,0,0,0.4)] sm:text-6xl">
              {roomCode}
            </p>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-lg border border-board/25 px-3 py-2 text-sm font-medium text-board/80 transition-colors hover:border-brass/60 hover:bg-white/5 hover:text-board"
            >
              {copied ? t('waiting.copied') : t('waiting.copy')}
            </button>
          </div>
          <button type="button" onClick={copyLink} className="mt-2.5 text-sm max-md:hidden text-brass-light underline decoration-brass-light/40 underline-offset-4 transition-colors hover:decoration-brass-light">
            {t('waiting.copyInviteLink')}
          </button>
          {activeMode && (
            <p className="mt-2 text-xs font-medium text-board/50">{t('waiting.gameMode', { mode: modeLabel })}</p>
          )}
          <ShareRoom code={roomCode} className="mx-auto mt-4 max-w-sm text-board" />
        </div>

        <div className="rounded-2xl border border-brass/20 bg-board p-6 shadow-panel sm:p-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">
              {t('waiting.players')} <span className="text-ink-faint">({gameState.players.length}/10)</span>
            </h2>
            <button type="button" onClick={onLeave} className="text-sm text-ink-faint transition-colors hover:text-rent">
              {t('waiting.leave')}
            </button>
          </div>

          <div className="grid max-h-[42vh] grid-cols-1 gap-2.5 overflow-y-auto scrollbar-thin sm:grid-cols-2 4xl:grid-cols-3 4xl:gap-3.5">
            {gameState.players.map((p) => (
              <PlayerSlot key={p.id} player={p} isMe={p.id === playerId} />
            ))}
          </div>

          {seatsLeft > 0 && (
            <p className="mt-3 text-center text-xs text-ink-faint">
              {t(seatsLeft === 1 ? 'waiting.seatOpen' : 'waiting.seatsOpen', { count: seatsLeft })}
            </p>
          )}

          {/* On a phone the start button stays under the thumb. */}
          <div className="phone-dock -mx-6 mt-6 rounded-b-2xl border-t border-board-line/70 bg-board px-6 pb-1 pt-5 sm:-mx-7 sm:px-7">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={onStart}
                  disabled={!canStart}
                  className="w-full rounded-xl bg-gradient-to-b from-brass-light to-brass px-5 py-3.5 font-semibold text-ink shadow-tile transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
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

export default function Lobby({
  gameState, playerId, roomCode, onCreate, onJoin, onStart, onLeave, onBackToMenu, joining, savedNickname, auth, onSwitchIdentity, onRequireAccount,
}) {
  if (!gameState || !roomCode) {
    return (
      <LandingScreen
        onCreate={onCreate}
        onJoin={onJoin}
        joining={joining}
        savedNickname={savedNickname}
        auth={auth}
        onSwitchIdentity={onSwitchIdentity}
        onBackToMenu={onBackToMenu}
        onRequireAccount={onRequireAccount}
      />
    );
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
