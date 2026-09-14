// App.jsx
// Platform shell. Pages: the games (AuthScreen -> MainMenu -> a game),
// the player's profile and the admin panel.
//
// Each game owns its own socket and its own room state, and this file
// only decides which of them is on screen. Permissions shown here (a
// guest cannot create a game, only the admin sees the panel) are for the
// player's convenience - the server enforces every one of them itself.

import { useEffect, useRef, useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useMafia } from './hooks/useMafia';
import { useCitadels } from './hooks/useCitadels';
import { useAuth } from './hooks/useAuth';
import AuthScreen from './components/AuthScreen';
import MainMenu from './components/MainMenu';
import Lobby from './components/Lobby';
import GameUI from './components/GameUI';
import GuestGate from './components/GuestGate';
import MafiaLobby from './components/mafia/MafiaLobby';
import MafiaGameScreen from './components/mafia/MafiaGameScreen';
import CitadelsLobby from './components/citadels/CitadelsLobby';
import CitadelsGame from './components/citadels/CitadelsGame';
import ProfilePage from './components/profile/ProfilePage';
import AdminPanel from './components/admin/AdminPanel';
import { useTranslation } from './i18n/LanguageContext';
import { usePathname } from './lib/router';

const GUEST_RESOLVED_KEY = 'landmark_guest_resolved';
const NICKNAME_KEY = 'landmark_nickname';

function ConnectionBanner({ connected, connectionError }) {
  const { t } = useTranslation();
  if (connected) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-rent px-4 py-2 text-center text-sm font-medium text-white">
      {connectionError ? `${t('app.connectionIssue', { error: connectionError })} ` : ''}
      {t('app.reconnecting')}
    </div>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-40 bg-ink px-4 py-2 text-center text-sm font-medium text-board">
      {message}
    </div>
  );
}

function RehydratingScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-board/20 border-t-brass" />
      <p className="text-sm text-board/70">{t('app.rejoining')}</p>
    </div>
  );
}

// Explains app-wide events (a room closed by the admin, a removal) that
// arrive while the player is looking at something else.
function NoticeToast() {
  const { t } = useTranslation();
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    const onNotice = (e) => setNotice(e.detail || {});
    window.addEventListener('landmark:notice', onNotice);
    return () => window.removeEventListener('landmark:notice', onNotice);
  }, []);
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(id);
  }, [notice]);
  if (!notice) return null;
  const key = `notice.${notice.reason}`;
  const text = t(key) === key ? t('notice.roomRemoved') : t(key);
  return (
    <div role="status" className="fixed inset-x-0 bottom-5 z-[80] flex justify-center px-4">
      <div className="flex max-w-md animate-slide-up items-start gap-3 rounded-2xl border border-white/15 bg-felt-800/95 px-4 py-3 text-[13.5px] text-parch shadow-deep backdrop-blur">
        <span aria-hidden="true">⚠️</span>
        <p className="flex-1">{text}</p>
        <button type="button" onClick={() => setNotice(null)} className="text-parch/50 hover:text-parch" aria-label="Close">✕</button>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const pathname = usePathname();
  const [guestResolved, setGuestResolved] = useState(
    () => localStorage.getItem(GUEST_RESOLVED_KEY) === '1'
      || !!localStorage.getItem('landmark_room_code')
      || !!localStorage.getItem('landmark_mafia_room')
      || !!localStorage.getItem('landmark_citadels_room'),
  );

  if (auth.checking) return <RehydratingScreen />;
  if (pathname.startsWith('/admin')) return <AdminPanel auth={auth} />;
  if (pathname.startsWith('/profile')) return <ProfilePage auth={auth} />;

  // The game hooks are only ever mounted once useAuth has FINISHED
  // confirming whatever token was in localStorage - their connect-and-
  // auto-rejoin effects run on mount, and a rejoin fired with a not-yet-
  // resolved token could claim the wrong identity.
  return (
    <>
      <AppShell auth={auth} guestResolved={guestResolved} setGuestResolved={setGuestResolved} />
      <NoticeToast />
    </>
  );
}

function AppShell({ auth, guestResolved, setGuestResolved }) {
  const socket = useSocket(auth.token);
  const mafia = useMafia(auth.token, { enabled: true });
  const citadels = useCitadels(auth.token);
  const [hub, setHub] = useState(null); // null = main menu, 'monopoly' = its lobby
  const [joinError, setJoinError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  // 'login' | 'register' when the player asked to sign in from inside the app.
  const [authMode, setAuthMode] = useState(null);
  const inviteCode = useRef(new URLSearchParams(window.location.search).get('room'));

  const identityResolved = auth.isLoggedIn || guestResolved;
  const nickname = auth.isLoggedIn ? auth.account.nickname : (localStorage.getItem(NICKNAME_KEY) || '');
  const inAnyRoom = !!(socket.roomCode || mafia.roomCode || citadels.roomCode);

  useEffect(() => {
    if (auth.isLoggedIn) setAuthMode(null);
  }, [auth.isLoggedIn]);

  const openAuth = (mode) => {
    setGateOpen(false);
    setAuthMode(mode);
  };
  const requireAccount = () => setGateOpen(true);

  // A room code alone does not say which game it belongs to - the server
  // does, so the client asks before deciding where to send the player.
  const joinByCode = async (code) => {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/exists`).then((r) => r.json());
      if (!res?.exists) {
        setJoinError('room-not-found');
        return;
      }
      if (res.gameType === 'mafia') await mafia.joinRoom(code, nickname);
      else if (res.gameType === 'citadels') await citadels.joinRoom(code, nickname);
      else await socket.joinRoom(code, nickname);
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  // An invite link (/?room=CODE) joins as soon as the player has an
  // identity - straight away for a logged-in player, after the nickname
  // for a guest.
  useEffect(() => {
    const code = inviteCode.current;
    if (!code || !identityResolved || authMode) return;
    inviteCode.current = null;
    window.history.replaceState({}, '', window.location.pathname);
    if (!inAnyRoom) joinByCode(code.trim().toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityResolved, authMode]);

  const gate = gateOpen && (
    <GuestGate onClose={() => setGateOpen(false)} onLogin={() => openAuth('login')} onRegister={() => openAuth('register')} />
  );

  if ((!identityResolved && !inAnyRoom) || authMode || (auth.blocked && !auth.isLoggedIn)) {
    return (
      <AuthScreen
        key={authMode || 'root'}
        auth={auth}
        initialMode={authMode}
        onCancel={authMode && identityResolved ? () => setAuthMode(null) : undefined}
        onGuestReady={(name) => {
          localStorage.setItem(NICKNAME_KEY, name);
          localStorage.setItem(GUEST_RESOLVED_KEY, '1');
          auth.clearBlocked();
          setGuestResolved(true);
          setAuthMode(null);
        }}
      />
    );
  }

  if (socket.rehydrating) return <RehydratingScreen />;

  // --- Citadels ------------------------------------------------------
  if (citadels.state && citadels.roomCode) {
    const leave = () => { citadels.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={citadels.connected} connectionError={null} />
        <ErrorBanner message={citadels.error} />
        {citadels.state.phase === 'LOBBY'
          ? (
            <CitadelsLobby
              state={citadels.state}
              actions={citadels.actions}
              openSettings={citadels.settingsRequested}
              onSettingsOpened={citadels.clearSettingsRequest}
              onLeave={leave}
            />
          )
          : <CitadelsGame state={citadels.state} chat={citadels.chat} actions={citadels.actions} onLeave={leave} />}
      </>
    );
  }

  // --- Mafia ---------------------------------------------------------
  if (mafia.state && mafia.roomCode) {
    const leave = () => { mafia.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={mafia.connected} connectionError={null} />
        <ErrorBanner message={mafia.error} />
        {mafia.state.phase === 'LOBBY'
          ? (
            <MafiaLobby
              state={mafia.state}
              playerId={mafia.playerId}
              actions={mafia.actions}
              openSettings={mafia.settingsRequested}
              onSettingsOpened={mafia.clearSettingsRequest}
              onLeave={leave}
            />
          )
          : (
            <MafiaGameScreen
              state={mafia.state}
              chat={mafia.chat}
              actions={mafia.actions}
              onLeave={leave}
            />
          )}
      </>
    );
  }

  // --- Monopoly ------------------------------------------------------
  const inMonopolyGame = socket.gameState && socket.gameState.phase !== 'LOBBY';

  if (socket.gameState || hub === 'monopoly') {
    return (
      <>
        <ConnectionBanner connected={socket.connected} connectionError={socket.connectionError} />
        <ErrorBanner message={socket.gameError} />
        {inMonopolyGame ? (
          <GameUI
            gameState={socket.gameState}
            playerId={socket.playerId}
            actions={{
              startGame: socket.startGame,
              rollDice: socket.rollDice,
              payJailFine: socket.payJailFine,
              useJailCard: socket.useJailCard,
              buyProperty: socket.buyProperty,
              declinePurchase: socket.declinePurchase,
              acknowledgeCard: socket.acknowledgeCard,
              buildHouse: socket.buildHouse,
              sellHouse: socket.sellHouse,
              mortgage: socket.mortgage,
              unmortgage: socket.unmortgage,
              endTurn: socket.endTurn,
              declareBankruptcy: socket.declareBankruptcy,
              proposeTrade: socket.proposeTrade,
              acceptTrade: socket.acceptTrade,
              declineTrade: socket.declineTrade,
              cancelTrade: socket.cancelTrade,
              setCustomPrice: socket.setCustomPrice,
            }}
            onLeave={() => { socket.leaveRoom(); setHub(null); }}
            chatMessages={socket.chatMessages}
            sendChat={socket.sendChat}
          />
        ) : (
          <Lobby
            gameState={socket.gameState}
            playerId={socket.playerId}
            roomCode={socket.roomCode}
            onCreate={socket.createRoom}
            onJoin={socket.joinRoom}
            onStart={socket.startGame}
            onLeave={() => { socket.leaveRoom(); setHub(null); }}
            onBackToMenu={() => setHub(null)}
            joining={socket.joining}
            savedNickname={nickname}
            auth={auth}
            onRequireAccount={requireAccount}
            onSwitchIdentity={() => {
              if (auth.isLoggedIn) auth.logout();
              localStorage.removeItem(GUEST_RESOLVED_KEY);
              setGuestResolved(false);
            }}
          />
        )}
        {gate}
      </>
    );
  }

  // --- Main menu -----------------------------------------------------
  const play = async (game, presetId) => {
    setJoinError(null);
    if (!auth.isLoggedIn) {
      requireAccount();
      return;
    }
    try {
      if (game.id === 'mafia') await mafia.createRoom(nickname, presetId || 'CLASSIC');
      else if (game.id === 'citadels') await citadels.createRoom(nickname);
      else setHub('monopoly');
    } catch (err) {
      if (err.code === 'GUEST_CANNOT_CREATE') requireAccount();
      else setJoinError(err.message);
    }
  };

  return (
    <>
      <ConnectionBanner connected={socket.connected} connectionError={socket.connectionError} />
      <MainMenu
        auth={auth}
        onPlay={play}
        onConfigure={play}
        onJoinCode={joinByCode}
        joinError={joinError === 'room-not-found' ? null : joinError}
        joining={joining}
        onAuth={openAuth}
      />
      {gate}
    </>
  );
}
