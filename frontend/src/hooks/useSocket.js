// useSocket.js
// Central hook for all real-time communication with the Monopoly server.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';
import { bindRejoin, forgetRoom, rememberRoom } from '../lib/roomSession';

const ROOM_CODE_KEY = 'landmark_room_code';
const NICKNAME_KEY = 'landmark_nickname';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

// Remembers when each state arrived: with the server's own serverTime it
// gives the offset between the two clocks, so auction countdowns agree on
// every screen.
function stamp(state) {
  return state ? { ...state, receivedAt: Date.now() } : state;
}

export function useSocket(authToken) {
  const socketRef = useRef(null);
  // joinRoom may need to fall back to watching, which is defined after it.
  const spectateRoomRef = useRef(() => Promise.reject(new Error('not ready')));
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameError, setGameError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [playerId, setPlayerId] = useState(getPlayerId);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_CODE_KEY) || null);
  const [joining, setJoining] = useState(false);
  const [rehydrating, setRehydrating] = useState(() => !!localStorage.getItem(ROOM_CODE_KEY));
  // A watcher is in the room but has no seat in it.
  const [spectating, setSpectating] = useState(false);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const clearRoom = useCallback(() => {
    forgetRoom(ROOM_CODE_KEY);
    setRoomCode(null);
    setGameState(null);
    setChatMessages([]);
    setSpectating(false);
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

    socket.on('game:state', (state) => setGameState(stamp(state)));
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

    // Re-announced on EVERY connect, not just the first: a reconnect is a
    // new socket on the server, with none of this one's room bindings.
    bindRejoin(socket, {
      joinEvent: 'room:join',
      spectateEvent: 'room:spectate',
      roomKey: ROOM_CODE_KEY,
      nicknameKey: NICKNAME_KEY,
      playerId,
      getToken: () => authTokenRef.current,
      getGuestKey,
      onJoined: (res) => {
        setRoomCode(res.roomCode);
        setGameState(stamp(res.state));
        setPlayerId(res.playerId);
        setSpectating(false);
        setRehydrating(false);
      },
      onWatching: (res) => {
        setRoomCode(res.roomCode);
        setGameState(stamp(res.state));
        setSpectating(true);
        setRehydrating(false);
      },
      onLost: () => {
        setRoomCode(null);
        setGameState(null);
        setSpectating(false);
        setRehydrating(false);
      },
      onIdle: () => setRehydrating(false),
    });

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
        rememberRoom(ROOM_CODE_KEY, res.roomCode, false);
        setRoomCode(res.roomCode);
        setGameState(stamp(res.state));
        setPlayerId(res.playerId);
        setSpectating(false);
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
        rememberRoom(ROOM_CODE_KEY, res.roomCode, false);
        setRoomCode(res.roomCode);
        setGameState(stamp(res.state));
        setPlayerId(res.playerId);
        setSpectating(false);
        resolve(res);
      } else {
        const err = new Error(res?.error || 'Failed to join room.');
        err.code = res?.code || null;
        // A room that will not seat us is still a room we may watch.
        if (err.code === 'SEAT_GONE') {
          // eslint-disable-next-line no-use-before-define
          spectateRoomRef.current(code, nickname).then(resolve, reject);
          return;
        }
        reject(err);
      }
    });
  }), [playerId]);

  // Watching takes no seat: the server sends the same public board, and
  // this client simply has no events with which to act on it.
  const spectateRoom = useCallback((code, nickname) => new Promise((resolve, reject) => {
    setJoining(true);
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('room:spectate', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, (res) => {
      setJoining(false);
      if (res?.ok) {
        rememberRoom(ROOM_CODE_KEY, res.roomCode, true);
        setRoomCode(res.roomCode);
        setGameState(stamp(res.state));
        setSpectating(true);
        resolve(res);
      } else {
        const err = new Error(res?.error || 'Failed to watch this room.');
        err.code = res?.code || null;
        reject(err);
      }
    });
  }), [playerId]);
  spectateRoomRef.current = spectateRoom;

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit(spectating ? 'room:unspectate' : 'room:leave');
    clearRoom();
    socketRef.current.disconnect();
    socketRef.current.connect();
  }, [clearRoom, spectating]);

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
    sellToBank: (tileId) => send('game:sellToBank', { tileId }),
    placeBid: (auctionId, amount) => send('game:placeBid', { auctionId, amount }),
    withdrawAuction: (auctionId) => send('game:withdrawAuction', { auctionId }),
    sendChat: (text, extra = {}) => send('chat:message', { ...extra, text }),
    // Giving up is final: mid-game it is a bankruptcy, and the player
    // stays on as a watcher. The confirmation happens before this call.
    surrender: () => new Promise((resolve) => {
      socketRef.current?.emit('room:surrender', {}, (res) => {
        if (res?.ok) {
          rememberRoom(ROOM_CODE_KEY, localStorage.getItem(ROOM_CODE_KEY), true);
          setSpectating(true);
        }
        resolve(res);
      });
    }),
  };

  return {
    connected,
    connectionError,
    gameState,
    gameError,
    chatMessages,
    playerId,
    roomCode,
    spectating,
    joining,
    rehydrating,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    savedNickname: localStorage.getItem(NICKNAME_KEY) || '',
    ...actions,
  };
}
