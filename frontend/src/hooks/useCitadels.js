// useCitadels.js
// Client side of Citadels. Same shape as useMafia: its own socket, a
// per-player state pushed by the server, and actions that only ever name
// an intention ("build card c17") - never a result.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';
import { bindRejoin, forgetRoom, rememberRoom } from '../lib/roomSession';

const ROOM_KEY = 'landmark_citadels_room';
const NICKNAME_KEY = 'landmark_nickname';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

let configPromise = null;
// Static reference data (role and district cards), fetched once.
export function loadCitadelsConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/citadels/config').then((r) => r.json()).catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export function useCitadelsConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCitadelsConfig().then((c) => { if (alive) setConfig(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return config;
}

export function useCitadels(authToken) {
  const socketRef = useRef(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [chat, setChat] = useState([]);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_KEY) || null);
  // A watcher is in the room but has no seat in it.
  const [spectating, setSpectating] = useState(false);
  const [settingsRequested, setSettingsRequested] = useState(false);
  const playerId = getPlayerId();

  const clearRoom = useCallback(() => {
    forgetRoom(ROOM_KEY);
    setRoomCode(null);
    setState(null);
    setChat([]);
    setSpectating(false);
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      auth: (cb) => cb({ token: authTokenRef.current }),
    });
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('citadels:state', (next) => {
      setState(next);
      setSpectating(!!next.spectating);
    });
    socket.on('citadels:chat', (msg) => setChat((prev) => [...prev.slice(-149), msg]));
    socket.on('citadels:system', (msg) => setChat((prev) => [...prev.slice(-149), { ...msg, system: true, ts: Date.now() }]));
    socket.on('citadels:error', (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== 'citadels') return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    bindRejoin(socket, {
      joinEvent: 'citadels:join',
      spectateEvent: 'citadels:spectate',
      roomKey: ROOM_KEY,
      nicknameKey: NICKNAME_KEY,
      playerId,
      getToken: () => authTokenRef.current,
      getGuestKey,
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
  }, []);

  useEffect(() => {
    socketRef.current?.emit('presence:identify', { token: authToken });
  }, [authToken]);

  const request = useCallback((event, payload, fallback, watching = false) => new Promise((resolve, reject) => {
    socketRef.current.emit(event, payload, (res) => {
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
    return request('citadels:create', {
      nickname, playerId, settings, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not create the room.');
  }, [playerId, request]);

  const joinRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('citadels:join', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not join the room.').catch((err) => {
      // A room that will not seat us is still a room we may watch.
      if (err.code !== 'SEAT_GONE') throw err;
      return request('citadels:spectate', {
        roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
      }, 'Could not watch the room.', true);
    });
  }, [playerId, request]);

  const spectateRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('citadels:spectate', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not watch the room.', true);
  }, [playerId, request]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit(spectating ? 'citadels:unspectate' : 'citadels:leave');
    clearRoom();
  }, [clearRoom, spectating]);

  const emit = useCallback((event, payload = {}) => {
    socketRef.current?.emit(event, payload);
  }, []);

  return {
    connected,
    state,
    error,
    chat,
    roomCode,
    spectating,
    playerId,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    settingsRequested,
    clearSettingsRequest: () => setSettingsRequested(false),
    actions: {
      // Giving up is final: the seat goes, and the player stays on as a
      // watcher. The confirmation happens before this is ever called.
      surrender: () => new Promise((resolve) => {
        socketRef.current?.emit('citadels:surrender', {}, (res) => {
          if (res?.ok) {
            rememberRoom(ROOM_KEY, localStorage.getItem(ROOM_KEY), true);
            setSpectating(true);
          }
          resolve(res);
        });
      }),
      updateSettings: (settings) => emit('citadels:settings', { settings }),
      setReady: (ready) => emit('citadels:ready', { ready }),
      start: () => emit('citadels:start'),
      restart: (startNow) => {
        setSettingsRequested(!startNow);
        emit('citadels:restart', { startNow });
      },
      pick: (roleId) => emit('citadels:pick', { roleId }),
      takeGold: () => emit('citadels:gold'),
      draw: () => emit('citadels:draw'),
      keep: (cardUid) => emit('citadels:keep', { cardUid }),
      income: () => emit('citadels:income'),
      build: (cardUid) => emit('citadels:build', { cardUid }),
      ability: (payload) => emit('citadels:ability', payload),
      useDistrict: (districtId, cardUid) => emit('citadels:useDistrict', { districtId, cardUid }),
      endTurn: () => emit('citadels:endTurn'),
      sendChat: (text, extra = {}) => emit('citadels:chat', { ...extra, text }),
    },
  };
}

export default useCitadels;
