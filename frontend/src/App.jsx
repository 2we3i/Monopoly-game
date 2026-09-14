// App.jsx
// Platform shell. Flow: AuthScreen -> MainMenu -> one game or another.
//
// Each game owns its own socket and its own room state, and this file
// only decides which of them is on screen. A third game would add a hook
// and a branch here, and nothing else in the app would need to know.

import { useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useMafia } from './hooks/useMafia';
import { useAuth } from './hooks/useAuth';
import AuthScreen from './components/AuthScreen';
import MainMenu from './components/MainMenu';
import Lobby from './components/Lobby';
import GameUI from './components/GameUI';
import MafiaLobby from './components/mafia/MafiaLobby';
import MafiaGameScreen from './components/mafia/MafiaGameScreen';
import { useTranslation } from './i18n/LanguageContext';

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

function RehydratingScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-board/20 border-t-brass" />
      <p className="text-sm text-board/70">{t('app.rejoining')}</p>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [guestResolved, setGuestResolved] = useState(
    () => localStorage.getItem(GUEST_RESOLVED_KEY) === '1'
      || !!localStorage.getItem('landmark_room_code')
      || !!localStorage.getItem('landmark_mafia_room'),
  );

  if (auth.checking) return <RehydratingScreen />;

  // useSocket is only ever mounted once useAuth has FINISHED confirming
  // whatever token was in localStorage - its connect-and-auto-rejoin
  // effect runs on its own mount regardless of what the parent renders
  // afterward, so mounting it early with a not-yet-resolved token risks
  // the rejoin request firing before the real token is known.
  return <AppShell auth={auth} guestResolved={guestResolved} setGuestResolved={setGuestResolved} />;
}

function AppShell({ auth, guestResolved, setGuestResolved }) {
  const socket = useSocket(auth.token);
  const mafia = useMafia(auth.token, { enabled: true });
  const [hub, setHub] = useState(null); // null = main menu, 'monopoly' = its lobby
  const [joinError, setJoinError] = useState(null);
  const [joining, setJoining] = useState(false);

  const identityResolved = auth.isLoggedIn || guestResolved;
  const nickname = auth.isLoggedIn ? auth.account.nickname : (localStorage.getItem(NICKNAME_KEY) || '');

  if (!identityResolved && !socket.roomCode && !mafia.roomCode) {
    return (
      <AuthScreen
        auth={auth}
        onGuestReady={(name) => {
          localStorage.setItem(NICKNAME_KEY, name);
          localStorage.setItem(GUEST_RESOLVED_KEY, '1');
          setGuestResolved(true);
        }}
      />
    );
  }

  if (socket.rehydrating) return <RehydratingScreen />;

  // --- Mafia takes the screen whenever its room is live --------------
  if (mafia.state && mafia.roomCode) {
    const leave = () => { mafia.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={mafia.connected} connectionError={null} />
        {mafia.error && (
          <div className="fixed inset-x-0 top-0 z-40 bg-ink px-4 py-2 text-center text-sm font-medium text-board">
            {mafia.error}
          </div>
        )}
        {mafia.state.phase === 'LOBBY'
          ? (
            <MafiaLobby
              state={mafia.state}
              playerId={mafia.playerId}
              actions={mafia.actions}
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
        {socket.gameError && (
          <div className="fixed inset-x-0 top-0 z-40 bg-ink px-4 py-2 text-center text-sm font-medium text-board">
            {socket.gameError}
          </div>
        )}
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
            onSwitchIdentity={() => {
              if (auth.isLoggedIn) auth.logout();
              localStorage.removeItem(GUEST_RESOLVED_KEY);
              setGuestResolved(false);
            }}
          />
        )}
      </>
    );
  }

  // --- Main menu -----------------------------------------------------
  const play = async (game, presetId) => {
    setJoinError(null);
    if (game.id === 'mafia') {
      try {
        await mafia.createRoom(nickname, presetId || 'CLASSIC');
      } catch (err) {
        setJoinError(err.message);
      }
      return;
    }
    setHub('monopoly');
  };

  // A room code alone does not say which game it belongs to - the server
  // does, so the menu asks before deciding where to send the player.
  const joinByCode = async (code) => {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/exists`).then((r) => r.json());
      if (!res?.exists) throw new Error('notFound');
      if (res.gameType === 'mafia') {
        await mafia.joinRoom(code, nickname);
      } else {
        await socket.joinRoom(code, nickname);
      }
    } catch (err) {
      setJoinError(err.message === 'notFound' ? null : err.message);
      if (err.message === 'notFound') setJoinError('room-not-found');
    } finally {
      setJoining(false);
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
        joinError={joinError}
        joining={joining}
      />
    </>
  );
}
