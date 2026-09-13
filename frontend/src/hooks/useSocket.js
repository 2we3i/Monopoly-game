// useSocket.js
// Central hook for all real-time communication with the game server.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const PLAYER_ID_KEY = 'landmark_player_id';
const ROOM_CODE_KEY = 'landmark_room_code';
const NICKNAME_KEY = 'landmark_nickname';

function uuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
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

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export function useSocket(authToken) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameError, setGameError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [playerId, setPlayerId] = useState(getOrCreatePlayerId);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_CODE_KEY) || null);
  const [joining, setJoining] = useState(false);
  const [rehydrating, setRehydrating] = useState(() => !!localStorage.getItem(ROOM_CODE_KEY));
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

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
      setTimeout(() => setGameError((current) => (current === err.message ? null : current)), 5000);
    });
    socket.on('chat:message', (msg) => setChatMessages((prev) => [...prev.slice(-199), msg]));
    socket.on('chat:system', (msg) => {
      setChatMessages((prev) => [...prev.slice(-199), { system: true, text: msg.message, type: msg.type, params: msg.params, ts: Date.now() }]);
    });

    const savedRoom = localStorage.getItem(ROOM_CODE_KEY);
    if (savedRoom) {
      const attemptRejoin = () => {
        socket.emit('room:join', { roomCode: savedRoom, playerId, nickname: localStorage.getItem(NICKNAME_KEY), token: authTokenRef.current }, (res) => {
          if (res?.ok) {
            setRoomCode(res.roomCode);
            setGameState(res.state);
            setPlayerId(res.playerId);
          } else {
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

  const createRoom = useCallback((nickname, modeId) => new Promise((resolve, reject) => {
    setJoining(true);
    localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('room:create', { nickname, playerId, modeId, token: authTokenRef.current }, (res) => {
      setJoining(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_CODE_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setGameState(res.state);
        setPlayerId(res.playerId);
        resolve(res);
      } else {
        reject(new Error(res?.error || 'Failed to create room.'));
      }
    });
  }), [playerId]);

  const joinRoom = useCallback((code, nickname) => new Promise((resolve, reject) => {
    setJoining(true);
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('room:join', { roomCode: code, nickname, playerId, token: authTokenRef.current }, (res) => {
      setJoining(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_CODE_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setGameState(res.state);
        setPlayerId(res.playerId);
        resolve(res);
      } else {
        reject(new Error(res?.error || 'Failed to join room.'));
      }
    });
  }), [playerId]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    localStorage.removeItem(ROOM_CODE_KEY);
    setRoomCode(null);
    setGameState(null);
    setChatMessages([]);
    socketRef.current.disconnect();
    socketRef.current.connect();
  }, []);

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
    proposeTrade: (trade) => send('game:proposeTrade', trade),
    acceptTrade: (tradeId) => send('game:acceptTrade', { tradeId }),
    declineTrade: (tradeId) => send('game:declineTrade', { tradeId }),
    cancelTrade: (tradeId) => send('game:cancelTrade', { tradeId }),
    setCustomPrice: (tileId, targetPlayerId, amount) => send('game:setCustomPrice', { tileId, targetPlayerId, amount }),
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
