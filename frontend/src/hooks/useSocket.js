// useSocket.js
// Central hook for all real-time communication with the game server.
//
// Reconnection design: a persistent `playerId` (a random UUID) is generated
// once per browser and stored in localStorage. If the tab reloads or the
// connection drops and reconnects, we send the SAME playerId when rejoining
// a room, so the server recognizes us as the same seat rather than a new
// player (see GameManager.reconnectPlayer on the backend). The roomCode is
// also cached so a page refresh can attempt to silently rejoin.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const PLAYER_ID_KEY = 'landmark_player_id';
const ROOM_CODE_KEY = 'landmark_room_code';
const NICKNAME_KEY = 'landmark_nickname';

function uuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

// The backend URL: same-origin by default (works when the frontend is
// served BY the backend, or via the Vite dev proxy). Can be overridden at
// build time for a split deployment (e.g. frontend on a static host, backend
// on a VPS) by setting VITE_SERVER_URL.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameError, setGameError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [playerId] = useState(getOrCreatePlayerId);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_CODE_KEY) || null);
  const [joining, setJoining] = useState(false);
  // True from mount until we've either (a) confirmed there's no saved room
  // to rejoin, or (b) finished attempting to rejoin a saved one. The Lobby
  // landing screen should not render while this is true, or a returning
  // player briefly sees "Host a new game" before snapping into their
  // in-progress game, which reads as broken.
  const [rehydrating, setRehydrating] = useState(() => !!localStorage.getItem(ROOM_CODE_KEY));

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnectionError(null);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => setConnectionError(err.message));

    socket.on('game:state', (state) => setGameState(state));
    socket.on('game:error', (err) => {
      setGameError(err.message);
      // auto-clear after a few seconds so old errors don't linger in the UI
      setTimeout(() => setGameError((current) => (current === err.message ? null : current)), 5000);
    });
    socket.on('chat:message', (msg) => setChatMessages((prev) => [...prev.slice(-199), msg]));
    socket.on('chat:system', (msg) => {
      setChatMessages((prev) => [...prev.slice(-199), { system: true, text: msg.message, type: msg.type, params: msg.params, ts: Date.now() }]);
    });

    // Auto-rejoin: if this browser previously joined a room (survives page
    // reloads and reopening the tab), silently attempt to rejoin it using
    // the same persistent playerId as soon as we connect. The server
    // recognizes the playerId and restores our seat (GameManager.
    // reconnectPlayer) rather than treating us as a brand new player.
    // We only need this on the FIRST connect after mount - subsequent
    // reconnects (e.g. wifi blip) are handled by socket.io's own
    // reconnection plus the server keeping our seat until we come back.
    const savedRoom = localStorage.getItem(ROOM_CODE_KEY);
    if (savedRoom) {
      const attemptRejoin = () => {
        socket.emit('room:join', { roomCode: savedRoom, playerId, nickname: localStorage.getItem(NICKNAME_KEY) }, (res) => {
          if (res?.ok) {
            setRoomCode(res.roomCode);
            setGameState(res.state);
          } else {
            // The room no longer exists, or our seat was removed (e.g. we
            // were in the lobby and the room emptied out) - clear the
            // stale pointer so we fall through to the normal landing
            // screen instead of retrying forever.
            localStorage.removeItem(ROOM_CODE_KEY);
            setRoomCode(null);
          }
          setRehydrating(false);
        });
      };
      if (socket.connected) attemptRejoin();
      else socket.once('connect', attemptRejoin);
    } else {
      setRehydrating(false);
    }

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((nickname) => new Promise((resolve, reject) => {
    setJoining(true);
    localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('room:create', { nickname, playerId }, (res) => {
      setJoining(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_CODE_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setGameState(res.state);
        resolve(res);
      } else {
        reject(new Error(res?.error || 'Failed to create room.'));
      }
    });
  }), [playerId]);

  const joinRoom = useCallback((code, nickname) => new Promise((resolve, reject) => {
    setJoining(true);
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('room:join', { roomCode: code, nickname, playerId }, (res) => {
      setJoining(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_CODE_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setGameState(res.state);
        resolve(res);
      } else {
        reject(new Error(res?.error || 'Failed to join room.'));
      }
    });
  }), [playerId]);

  const leaveRoom = useCallback(() => {
    localStorage.removeItem(ROOM_CODE_KEY);
    setRoomCode(null);
    setGameState(null);
    setChatMessages([]);
    socketRef.current.disconnect();
    socketRef.current.connect();
  }, []);

  // Generic emitter for gameplay intents - fire and forget, server responds
  // via the 'game:state' or 'game:error' broadcast/event, not an ack.
  const send = useCallback((event, payload) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const actions = {
    startGame: () => send('room:start'),
    rollDice: () => send('game:rollDice'),
    payJailFine: () => send('game:payJailFine'),
    useJailCard: () => send('game:useJailCard'),
    buyProperty: (tileId) => send('game:buyProperty', { tileId }),
    declinePurchase: (tileId) => send('game:declinePurchase', { tileId }),
    acknowledgeCard: () => send('game:acknowledgeCard'),
    buildHouse: (tileId) => send('game:buildHouse', { tileId }),
    sellHouse: (tileId) => send('game:sellHouse', { tileId }),
    mortgage: (tileId) => send('game:mortgage', { tileId }),
    unmortgage: (tileId) => send('game:unmortgage', { tileId }),
    endTurn: () => send('game:endTurn'),
    declareBankruptcy: () => send('game:declareBankruptcy'),
    sendChat: (text) => send('chat:message', { text }),
  };

  return {
    connected,
    connectionError,
    gameState,
    gameError,
    chatMessages,
    playerId,
    roomCode,
    joining,
    rehydrating,
    createRoom,
    joinRoom,
    leaveRoom,
    savedNickname: localStorage.getItem(NICKNAME_KEY) || '',
    ...actions,
  };
}
