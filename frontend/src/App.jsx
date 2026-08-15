// App.jsx
// Top-level component. Decides whether to show the Lobby (no room, or room
// still in LOBBY phase) or the GameUI (room's phase has moved past LOBBY),
// and renders a connection-status banner when the socket drops.

import { useSocket } from './hooks/useSocket';
import Lobby from './components/Lobby';
import GameUI from './components/GameUI';

function ConnectionBanner({ connected, connectionError }) {
  if (connected) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-rent px-4 py-2 text-center text-sm font-medium text-white">
      {connectionError ? `Connection issue: ${connectionError}. ` : ''}
      Reconnecting…
    </div>
  );
}

function RehydratingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-board/20 border-t-brass" />
      <p className="text-sm text-board/70">Rejoining your game…</p>
    </div>
  );
}

export default function App() {
  const socket = useSocket();
  const inGame = socket.gameState && socket.gameState.phase !== 'LOBBY';

  if (socket.rehydrating) {
    return <RehydratingScreen />;
  }

  return (
    <>
      <ConnectionBanner connected={socket.connected} connectionError={socket.connectionError} />

      {socket.gameError && (
        <div className="fixed inset-x-0 top-0 z-50 animate-pop-in bg-rent px-4 py-2 text-center text-sm font-medium text-white">
          {socket.gameError}
        </div>
      )}

      {inGame ? (
        <GameUI
          gameState={socket.gameState}
          playerId={socket.playerId}
          actions={{
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
          savedNickname={socket.savedNickname}
        />
      )}
    </>
  );
}
