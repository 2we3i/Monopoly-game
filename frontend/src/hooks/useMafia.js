// useMafia.js
// Client side of the Mafia mode.
//
// It runs on its own socket rather than sharing the Monopoly one: the
// two games have separate event namespaces and separate reconnect rules,
// and keeping the connections apart means neither hook can break the
// other. The state this hook holds is whatever the SERVER decided this
// player may see - there is no client-side copy of anyone's role.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const ROOM_KEY = 'landmark_mafia_room';
const PLAYER_ID_KEY = 'landmark_player_id';
const NICKNAME_KEY = 'landmark_nickname';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

function storedPlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `p-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function useMafia(authToken, { enabled }) {
  const socketRef = useRef(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [chat, setChat] = useState([]);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_KEY) || null);
  const [busy, setBusy] = useState(false);
  const playerId = storedPlayerId();

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'], reconnectionDelay: 800 });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('mafia:state', (next) => setState(next));
    socket.on('mafia:chat', (msg) => setChat((prev) => [...prev.slice(-199), msg]));
    socket.on('mafia:system', (msg) => setChat((prev) => [...prev.slice(-199), { ...msg, system: true, ts: Date.now() }]));
    socket.on('mafia:error', (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });

    // A saved room code means "I was in a game" - rejoin it as soon as
    // the socket is up, exactly as the Monopoly side does.
    const saved = localStorage.getItem(ROOM_KEY);
    if (saved) {
      const rejoin = () => socket.emit('mafia:join', {
        roomCode: saved,
        playerId,
        nickname: localStorage.getItem(NICKNAME_KEY),
        token: authTokenRef.current,
      }, (res) => {
        if (res?.ok) {
          setRoomCode(res.roomCode);
          setState(res.state);
        } else {
          localStorage.removeItem(ROOM_KEY);
          setRoomCode(null);
        }
      });
      if (socket.connected) rejoin(); else socket.once('connect', rejoin);
    }

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const emit = useCallback((event, payload) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const createRoom = useCallback((nickname, presetId) => new Promise((resolve, reject) => {
    setBusy(true);
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('mafia:create', { nickname, playerId, presetId, token: authTokenRef.current }, (res) => {
      setBusy(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setState(res.state);
        resolve(res);
      } else reject(new Error(res?.error || 'Could not create the room.'));
    });
  }), [playerId]);

  const joinRoom = useCallback((code, nickname) => new Promise((resolve, reject) => {
    setBusy(true);
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    socketRef.current.emit('mafia:join', { roomCode: code, nickname, playerId, token: authTokenRef.current }, (res) => {
      setBusy(false);
      if (res?.ok) {
        localStorage.setItem(ROOM_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setState(res.state);
        resolve(res);
      } else reject(new Error(res?.error || 'Could not join the room.'));
    });
  }), [playerId]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('mafia:leave');
    localStorage.removeItem(ROOM_KEY);
    setRoomCode(null);
    setState(null);
    setChat([]);
  }, []);

  return {
    connected,
    state,
    error,
    chat,
    roomCode,
    busy,
    playerId,
    createRoom,
    joinRoom,
    leaveRoom,
    actions: {
      updateSettings: (settings) => emit('mafia:settings', { settings }),
      applyPreset: (presetId) => emit('mafia:preset', { presetId }),
      randomSettings: () => emit('mafia:randomSettings', {}),
      setReady: (ready) => emit('mafia:ready', { ready }),
      start: () => emit('mafia:start', {}),
      nightAction: (targetId) => emit('mafia:night', { targetId }),
      vote: (targetId) => emit('mafia:vote', { targetId }),
      skipPhase: () => emit('mafia:skipPhase', {}),
      sendChat: (text) => emit('mafia:chat', { text }),
    },
  };
}

export default useMafia;
