// App.jsx
// Flow: AuthScreen -> Lobby -> GameUI.

import { useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useAuth } from './hooks/useAuth';
import AuthScreen from './components/AuthScreen';
import Lobby from './components/Lobby';
import GameUI from './components/GameUI';
import { useTranslation } from './i18n/LanguageContext';

const GUEST_RESOLVED_KEY = 'landmark_guest_resolved';

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
  const [guestResolved, setGuestResolved] = useState(() => localStorage.getItem(GUEST_RESOLVED_KEY) === '1' || !!localStorage.getItem('landmark_room_code'));

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

  const identityResolved = auth.isLoggedIn || guestResolved;
  if (!identityResolved && !socket.roomCode) {
    return (
      <AuthScreen
        auth={auth}
        onGuestReady={(nickname) => {
          localStorage.setItem('landmark_nickname', nickname);
          localStorage.setItem(GUEST_RESOLVED_KEY, '1');
          setGuestResolved(true);
        }}
      />
    );
  }

  if (socket.rehydrating) return <RehydratingScreen />;

  const inGame = socket.gameState && socket.gameState.phase !== 'LOBBY';

  return (
    <>
      <ConnectionBanner connected={socket.connected} connectionError={socket.connectionError} />
      {socket.gameError && (
        <div className="fixed inset-x-0 top-0 z-40 bg-ink px-4 py-2 text-center text-sm font-medium text-board">
          {socket.gameError}
        </div>
      )}
      {inGame ? (
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
          onLeave={socket.leaveRoom}
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
          onLeave={socket.leaveRoom}
          joining={socket.joining}
          savedNickname={auth.isLoggedIn ? auth.account.nickname : socket.savedNickname}
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
