// useChpok.js
// Client side of online ЧПОК, used by two very different screens: the big
// one the room is played on, and the phone in each player's hand. Both run
// the same hook - the server decides what each of them may see, and the
// only difference the client makes is the `device` it announces, which
// decides which of the two screens is drawn.
//
// Reconnecting is handled by lib/roomSession: the seat is re-announced on
// every connect, so a phone that drops out of signal for a moment walks
// straight back into the round it was in.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';
import { bindRejoin, forgetRoom, rememberRoom } from '../lib/roomSession';

const ROOM_KEY = 'landmark_chpok_room';
const NICKNAME_KEY = 'landmark_nickname';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

let configPromise = null;
export function loadChpokConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/chpok/config').then((r) => r.json()).catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export function useChpokConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let alive = true;
    loadChpokConfig().then((c) => { if (alive) setConfig(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return config;
}

export function useChpok(authToken, { device = 'screen', enabled = true } = {}) {
  const socketRef = useRef(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const deviceRef = useRef(device);
  deviceRef.current = device;

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [chat, setChat] = useState([]);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_KEY) || null);
  const [spectating, setSpectating] = useState(false);
  const [busy, setBusy] = useState(false);
  const playerId = getPlayerId();

  const clearRoom = useCallback(() => {
    forgetRoom(ROOM_KEY);
    setRoomCode(null);
    setState(null);
    setChat([]);
    setSpectating(false);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      auth: (cb) => cb({ token: authTokenRef.current }),
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('chpok:state', (next) => {
      setState(next);
      setSpectating(!!next.spectating);
    });
    socket.on('chpok:chat', (msg) => setChat((prev) => [...prev.slice(-149), msg]));
    socket.on('chpok:system', (msg) => setChat((prev) => [...prev.slice(-149), { ...msg, system: true, ts: Date.now() }]));
    socket.on('chpok:error', (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== 'chpok') return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    bindRejoin(socket, {
      joinEvent: 'chpok:join',
      spectateEvent: 'chpok:spectate',
      roomKey: ROOM_KEY,
      nicknameKey: NICKNAME_KEY,
      playerId,
      getToken: () => authTokenRef.current,
      getGuestKey,
      // Which device this seat is played from travels on every announce,
      // not just the first: a phone that reconnects is still a phone.
      extra: () => ({ device: deviceRef.current }),
      onJoined: (res) => {
        setRoomCode(res.roomCode);
        setState(res.state);
        setSpectating(false);
      },
      onWatching: (res) => {
        setRoomCode(res.roomCode);
        setState(res.state);
        setSpectating(true);
      },
      onLost: () => {
        setRoomCode(null);
        setState(null);
        setSpectating(false);
      },
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    socketRef.current?.emit('presence:identify', { token: authToken });
  }, [authToken]);

  const emit = useCallback((event, payload = {}) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const request = useCallback((event, payload, fallback, watching = false) => new Promise((resolve, reject) => {
    setBusy(true);
    socketRef.current.emit(event, payload, (res) => {
      setBusy(false);
      if (res?.ok) {
        rememberRoom(ROOM_KEY, res.roomCode, watching);
        setRoomCode(res.roomCode);
        setState(res.state);
        setSpectating(watching || !!res.spectator);
        resolve(res);
      } else {
        const err = new Error(res?.error || fallback);
        err.code = res?.code || null;
        reject(err);
      }
    });
  }), []);

  const createRoom = useCallback((nickname, settings) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('chpok:create', {
      nickname, playerId, settings, device: deviceRef.current, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not create the room.');
  }, [playerId, request]);

  const joinRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('chpok:join', {
      roomCode: code, nickname, playerId, device: deviceRef.current, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not join the room.').catch((err) => {
      // A room that will not seat us is still a room we may watch.
      if (err.code !== 'SEAT_GONE') throw err;
      return request('chpok:spectate', {
        roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
      }, 'Could not watch the room.', true);
    });
  }, [playerId, request]);

  const spectateRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('chpok:spectate', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not watch the room.', true);
  }, [playerId, request]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit(spectating ? 'chpok:unspectate' : 'chpok:leave');
    clearRoom();
  }, [clearRoom, spectating]);

  // An answer and a vote are the only two things a phone ever says, and it
  // says each of them once. Both report back so the phone can show that it
  // was refused rather than silently doing nothing.
  const ack = useCallback((event, payload) => new Promise((resolve) => {
    socketRef.current?.emit(event, payload, (res) => resolve(res || { ok: false }));
  }), []);

  return {
    connected,
    state,
    error,
    chat,
    roomCode,
    spectating,
    busy,
    playerId,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    clearRoom,
    actions: {
      updateSettings: (settings) => emit('chpok:settings', { settings }),
      setReady: (ready) => emit('chpok:ready', { ready }),
      setPlaying: (playing) => emit('chpok:playing', { playing }),
      start: () => emit('chpok:start'),
      skip: () => emit('chpok:skip'),
      restart: (startNow) => emit('chpok:restart', { startNow }),
      answer: (text) => ack('chpok:answer', { text }),
      vote: (answerId) => ack('chpok:vote', { answerId }),
      sendChat: (text, extra = {}) => emit('chpok:chat', { ...extra, text }),
      surrender: () => new Promise((resolve) => {
        socketRef.current?.emit('chpok:surrender', {}, (res) => {
          if (res?.ok) {
            rememberRoom(ROOM_KEY, localStorage.getItem(ROOM_KEY), true);
            setSpectating(true);
          }
          resolve(res);
        });
      }),
    },
  };
}

export default useChpok;
