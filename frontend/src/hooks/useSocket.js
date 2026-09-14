// useSocket.js
// Central hook for all real-time communication with the Monopoly server.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';

const ROOM_CODE_KEY = 'landmark_room_code';
const NICKNAME_KEY = 'landmark_nickname';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export function useSocket(authToken) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameError, setGameError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [playerId, setPlayerId] = useState(getPlayerId);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_CODE_KEY) || null);
  const [joining, setJoining] = useState(false);
  const [rehydrating, setRehydrating] = useState(() => !!localStorage.getItem(ROOM_CODE_KEY));
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const clearRoom = useCallback(() => {
    localStorage.removeItem(ROOM_CODE_KEY);
    setRoomCode(null);
    setGameState(null);
    setChatMessages([]);
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      // Read on every (re)connect, so presence always sees the current session.
      auth: (cb) => cb({ token: authTokenRef.current }),
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
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== 'monopoly') return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    const savedRoom = localStorage.getItem(ROOM_CODE_KEY);
    if (savedRoom) {
      const attemptRejoin = () => {
        socket.emit('room:join', {
          roomCode: savedRoom,
          playerId,
          nickname: localStorage.getItem(NICKNAME_KEY),
          token: authTokenRef.current,
          guestKey: getGuestKey(),
        }, (res) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logging in or out on an open connection re-announces who this is.
  useEffect(() => {
    socketRef.current?.emit('presence:identify', { token: authToken });
  }, [authToken]);

  const createRoom = useCallback((nickname, modeId) => new Promise((resolve, reject) => {
    setJoining(true);
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('room:create', {
      nickname, playerId, modeId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, (res) => {
      setJoining(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_CODE_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setGameState(res.state);
        setPlayerId(res.playerId);
        resolve(res);
      } else {
        const err = new Error(res?.error || 'Failed to create room.');
        err.code = res?.code || null;
        reject(err);
      }
    });
  }), [playerId]);

  const joinRoom = useCallback((code, nickname) => new Promise((resolve, reject) => {
    setJoining(true);
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('room:join', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, (res) => {
      setJoining(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_CODE_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setGameState(res.state);
        setPlayerId(res.playerId);
        resolve(res);
      } else {
        const err = new Error(res?.error || 'Failed to join room.');
        err.code = res?.code || null;
        reject(err);
      }
    });
  }), [playerId]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    clearRoom();
    socketRef.current.disconnect();
    socketRef.current.connect();
  }, [clearRoom]);

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
    sendChat: (text, extra = {}) => send('chat:message', { ...extra, text }),
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
