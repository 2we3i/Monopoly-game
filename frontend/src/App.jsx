// App.jsx
// Platform shell. Pages: the games (AuthScreen -> MainMenu -> a game),
// the player's profile, shop, inventory, messages, leaderboard, other
// players' profiles, and the admin panel.
//
// Each game owns its own socket and its own room state. Those hooks stay
// mounted while the player visits the platform pages, so opening the shop
// or a message in the middle of a game never drops them from the room.
// Permissions shown here (a guest cannot create a game, only the admin
// sees the panel) are for the player's convenience - the server enforces
// every one of them itself.

import {
  Suspense, lazy, useEffect, useRef, useState,
} from 'react';
import { useSocket } from './hooks/useSocket';
import { useMafia } from './hooks/useMafia';
import { useCitadels } from './hooks/useCitadels';
import { useBunker } from './hooks/useBunker';
import { useCatan } from './hooks/useCatan';
import { useCosmic } from './hooks/useCosmic';
import { useThrone } from './hooks/useThrone';
import { useChpok } from './hooks/useChpok';
import { useAuth } from './hooks/useAuth';
import AuthScreen from './components/AuthScreen';
import MainMenu from './components/MainMenu';
import GuestGate from './components/GuestGate';
import { PlatformNavContext } from './components/platform/PlatformShell';
import { SocialProvider } from './social/SocialContext';
import ToastStack from './components/social/ToastStack';
import ProfilePeek from './components/social/ProfilePeek';
import { MessengerDrawer } from './components/social/Messenger';
import { EffectHost } from './cosmetics/effects';
import { useStartSound } from './cosmetics/useGameCosmetics';
import { useSettings } from './settings/SettingsContext';
import { useTranslation } from './i18n/LanguageContext';
import { navigate, usePathname } from './lib/router';

const Lobby = lazy(() => import('./components/Lobby'));
const GameUI = lazy(() => import('./components/GameUI'));
const MafiaLobby = lazy(() => import('./components/mafia/MafiaLobby'));
const MafiaGameScreen = lazy(() => import('./components/mafia/MafiaGameScreen'));
const CitadelsLobby = lazy(() => import('./components/citadels/CitadelsLobby'));
const CitadelsGame = lazy(() => import('./components/citadels/CitadelsGame'));
const BunkerLobby = lazy(() => import('./components/bunker/BunkerLobby'));
const BunkerGame = lazy(() => import('./components/bunker/BunkerGame'));
const CatanLobby = lazy(() => import('./components/catan/CatanLobby'));
const CatanGame = lazy(() => import('./components/catan/CatanGame'));
const CosmicLobby = lazy(() => import('./components/cosmic/CosmicLobby'));
const CosmicGame = lazy(() => import('./components/cosmic/CosmicGame'));
const ThroneLobby = lazy(() => import('./components/tabletop/throne/ThroneLobby'));
const ThroneOnline = lazy(() => import('./components/tabletop/throne/ThroneOnline'));
const ChpokOnline = lazy(() => import('./components/tabletop/chpok/ChpokOnline'));
const PhoneController = lazy(() => import('./components/tabletop/chpok/PhoneController'));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));
const ShopPage = lazy(() => import('./components/shop/ShopPage'));
const InventoryPage = lazy(() => import('./components/shop/InventoryPage'));
const MessagesPage = lazy(() => import('./components/social/MessagesPage'));
const LeaderboardPage = lazy(() => import('./components/social/LeaderboardPage'));
const PublicProfilePage = lazy(() => import('./components/social/PublicProfilePage'));
const TabletopPage = lazy(() => import('./components/tabletop/TabletopPage'));

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

function platformPage(pathname) {
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/shop')) return 'shop';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/messages')) return 'messages';
  if (pathname.startsWith('/leaderboard')) return 'leaderboard';
  if (pathname.startsWith('/u/')) return 'user';
  if (pathname.startsWith('/tabletop')) return 'tabletop';
  return null;
}

export default function App() {
  const auth = useAuth();
  const pathname = usePathname();
  const { settings } = useSettings();
  const [guestResolved, setGuestResolved] = useState(
    () => localStorage.getItem(GUEST_RESOLVED_KEY) === '1'
      || !!localStorage.getItem('landmark_room_code')
      || !!localStorage.getItem('landmark_mafia_room')
      || !!localStorage.getItem('landmark_citadels_room')
      || !!localStorage.getItem('landmark_bunker_room')
      || !!localStorage.getItem('landmark_catan_room')
      || !!localStorage.getItem('landmark_cosmic_room')
      || !!localStorage.getItem('landmark_throne_room')
      || !!localStorage.getItem('landmark_chpok_room'),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('motion-off', !settings.animations);
  }, [settings.animations]);

  if (auth.checking) return <RehydratingScreen />;

  // /play/<CODE> is what a ЧПОК QR code points at. It is deliberately not
  // part of the platform shell: a phone that scanned a code wants a seat in
  // that room, not a games menu.
  if (pathname.startsWith('/play/')) {
    const code = decodeURIComponent(pathname.slice('/play/'.length)).trim().toUpperCase();
    return (
      <Suspense fallback={<RehydratingScreen />}>
        <PhoneController roomCode={code} auth={auth} />
        <NoticeToast />
      </Suspense>
    );
  }

  // The game hooks are only ever mounted once useAuth has FINISHED
  // confirming whatever token was in localStorage - their connect-and-
  // auto-rejoin effects run on mount, and a rejoin fired with a not-yet-
  // resolved token could claim the wrong identity.
  return (
    <SocialProvider auth={auth}>
      <Suspense fallback={<RehydratingScreen />}>
        {pathname.startsWith('/admin')
          ? <AdminPanel auth={auth} />
          : <AppShell auth={auth} pathname={pathname} guestResolved={guestResolved} setGuestResolved={setGuestResolved} />}
      </Suspense>
      <NoticeToast />
      <ToastStack />
      {!pathname.startsWith('/messages') && <MessengerDrawer />}
      <ProfilePeek />
      <EffectHost />
    </SocialProvider>
  );
}

function AppShell({
  auth, pathname, guestResolved, setGuestResolved,
}) {
  const socket = useSocket(auth.token);
  const mafia = useMafia(auth.token, { enabled: true });
  const citadels = useCitadels(auth.token);
  const bunker = useBunker(auth.token);
  const catan = useCatan(auth.token);
  const cosmic = useCosmic(auth.token);
  const throne = useThrone(auth.token);
  const chpok = useChpok(auth.token, { device: 'screen' });
  const [hub, setHub] = useState(null); // null = main menu, 'monopoly' = its lobby
  const [joinError, setJoinError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  // 'login' | 'register' when the player asked to sign in from inside the app.
  const [authMode, setAuthMode] = useState(null);
  const inviteCode = useRef(new URLSearchParams(window.location.search).get('room'));

  const identityResolved = auth.isLoggedIn || guestResolved;
  const nickname = auth.isLoggedIn ? auth.account.nickname : (localStorage.getItem(NICKNAME_KEY) || '');
  const inAnyRoom = !!(socket.roomCode || mafia.roomCode || citadels.roomCode || bunker.roomCode
    || catan.roomCode || cosmic.roomCode || throne.roomCode || chpok.roomCode);
  const page = platformPage(pathname);

  useStartSound(socket.gameState?.phase);
  useStartSound(mafia.state?.phase);
  useStartSound(citadels.state?.phase);
  useStartSound(bunker.state?.phase);
  useStartSound(catan.state?.phase);
  useStartSound(cosmic.state?.phase);
  useStartSound(throne.state?.phase);
  useStartSound(chpok.state?.phase);

  useEffect(() => {
    if (auth.isLoggedIn) setAuthMode(null);
  }, [auth.isLoggedIn]);

  const openAuth = (mode) => {
    setGateOpen(false);
    setAuthMode(mode);
  };
  const requireAccount = () => setGateOpen(true);

  // Platform pages ask for the login screen with an event.
  useEffect(() => {
    const onAuth = (e) => {
      navigate('/');
      openAuth(e.detail === 'register' ? 'register' : 'login');
    };
    window.addEventListener('landmark:auth', onAuth);
    return () => window.removeEventListener('landmark:auth', onAuth);
  }, []);

  // A room code alone does not say which game it belongs to - the server
  // does, so the client asks before deciding where to send the player.
  const HOOKS = {
    mafia, citadels, bunker, catan, cosmic, throne, chpok, monopoly: socket,
  };
  const joinByCode = async (code) => {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/exists`).then((r) => r.json());
      if (!res?.exists) {
        setJoinError('room-not-found');
        return;
      }
      const hook = HOOKS[res.gameType] || socket;
      try {
        await hook.joinRoom(code, nickname);
      } catch (err) {
        // A room that will not seat this player - already started, full,
        // or a seat they have already left - is still a room they may
        // watch. Only a refusal about WHO they are is worth reporting.
        const identityProblem = ['BANNED', 'BLOCKED', 'SEAT_TAKEN', 'IDENTITY_TAKEN', 'BAD_IDENTITY'].includes(err.code);
        if (identityProblem || !hook.spectateRoom) throw err;
        try {
          await hook.spectateRoom(code, nickname);
        } catch {
          throw err;
        }
      }
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

  if (page && !authMode) {
    const nav = { inRoom: inAnyRoom };
    let content;
    if (page === 'profile') content = <ProfilePage auth={auth} />;
    else if (page === 'shop') content = <ShopPage auth={auth} />;
    else if (page === 'inventory') content = <InventoryPage auth={auth} />;
    else if (page === 'messages') content = <MessagesPage auth={auth} />;
    else if (page === 'leaderboard') content = <LeaderboardPage auth={auth} />;
    else if (page === 'tabletop') {
      content = (
        <TabletopPage
          auth={auth}
          pathname={pathname}
          creating={chpok.busy}
          onPlayOnline={async () => {
            if (!auth.isLoggedIn) { requireAccount(); return; }
            // The room screen lives on the games side of the app, so the
            // page moves there before the room exists.
            navigate('/');
            try {
              await chpok.createRoom(nickname);
            } catch (err) {
              setJoinError(err.message);
            }
          }}
        />
      );
    }
    else content = <PublicProfilePage auth={auth} userId={decodeURIComponent(pathname.slice(3))} />;
    return <PlatformNavContext.Provider value={nav}>{content}</PlatformNavContext.Provider>;
  }

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

  // --- ЧПОК (the big screen) ------------------------------------------
  if (chpok.state && chpok.roomCode) {
    const leave = () => { chpok.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={chpok.connected} connectionError={null} />
        <ErrorBanner message={chpok.error} />
        <ChpokOnline
          state={chpok.state}
          actions={chpok.actions}
          spectating={chpok.spectating}
          onLeave={leave}
        />
      </>
    );
  }

  // --- The Iron Throne -----------------------------------------------
  if (throne.state && throne.roomCode) {
    const leave = () => { throne.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={throne.connected} connectionError={null} />
        <ErrorBanner message={throne.error} />
        {throne.state.phase === 'LOBBY'
          ? (
            <ThroneLobby
              state={throne.state}
              actions={throne.actions}
              openSettings={throne.settingsRequested}
              onSettingsOpened={throne.clearSettingsRequest}
              onLeave={leave}
            />
          )
          : (
            <ThroneOnline
              state={throne.state}
              chat={throne.chat}
              actions={throne.actions}
              spectating={throne.spectating}
              onLeave={leave}
            />
          )}
      </>
    );
  }

  // --- Cosmic Encounter ----------------------------------------------
  if (cosmic.state && cosmic.roomCode) {
    const leave = () => { cosmic.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={cosmic.connected} connectionError={null} />
        <ErrorBanner message={cosmic.error} />
        {cosmic.state.phase === 'LOBBY'
          ? (
            <CosmicLobby
              state={cosmic.state}
              actions={cosmic.actions}
              openSettings={cosmic.settingsRequested}
              onSettingsOpened={cosmic.clearSettingsRequest}
              onLeave={leave}
            />
          )
          : (
            <CosmicGame
              state={cosmic.state}
              chat={cosmic.chat}
              actions={cosmic.actions}
              spectating={cosmic.spectating}
              onLeave={leave}
            />
          )}
      </>
    );
  }

  // --- Catan ---------------------------------------------------------
  if (catan.state && catan.roomCode) {
    const leave = () => { catan.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={catan.connected} connectionError={null} />
        <ErrorBanner message={catan.error} />
        {catan.state.phase === 'LOBBY'
          ? (
            <CatanLobby
              state={catan.state}
              actions={catan.actions}
              openSettings={catan.settingsRequested}
              onSettingsOpened={catan.clearSettingsRequest}
              onLeave={leave}
            />
          )
          : (
            <CatanGame
              state={catan.state}
              chat={catan.chat}
              actions={catan.actions}
              spectating={catan.spectating}
              onLeave={leave}
            />
          )}
      </>
    );
  }

  // --- Bunker --------------------------------------------------------
  if (bunker.state && bunker.roomCode) {
    const leave = () => { bunker.leaveRoom(); setHub(null); };
    return (
      <>
        <ConnectionBanner connected={bunker.connected} connectionError={null} />
        <ErrorBanner message={bunker.error} />
        {bunker.state.phase === 'LOBBY'
          ? (
            <BunkerLobby
              state={bunker.state}
              actions={bunker.actions}
              openSettings={bunker.settingsRequested}
              onSettingsOpened={bunker.clearSettingsRequest}
              onLeave={leave}
            />
          )
          : (
            <BunkerGame
              state={bunker.state}
              chat={bunker.chat}
              actions={bunker.actions}
              spectating={bunker.spectating}
              onLeave={leave}
            />
          )}
      </>
    );
  }

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
          : (
            <CitadelsGame
              state={citadels.state}
              chat={citadels.chat}
              actions={citadels.actions}
              spectating={citadels.spectating}
              onLeave={leave}
            />
          )}
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
              spectating={mafia.spectating}
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
              sellToBank: socket.sellToBank,
              placeBid: socket.placeBid,
              withdrawAuction: socket.withdrawAuction,
              surrender: socket.surrender,
            }}
            spectating={socket.spectating}
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
      else if (game.id === 'bunker') await bunker.createRoom(nickname);
      else if (game.id === 'catan') await catan.createRoom(nickname);
      else if (game.id === 'cosmic') await cosmic.createRoom(nickname);
      else if (game.id === 'throne') await throne.createRoom(nickname);
      else if (game.id === 'chpok') await chpok.createRoom(nickname);
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
