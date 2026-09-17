// useBunker.js
// Client side of the Bunker. Same shape as useCitadels: its own socket, a
// per-player state pushed by the server, and actions that only name an
// intention ("reveal my health card", "vote for player 3").

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';
import { bindRejoin, forgetRoom, rememberRoom } from '../lib/roomSession';

const ROOM_KEY = 'landmark_bunker_room';
const NICKNAME_KEY = 'landmark_nickname';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

let configPromise = null;
// Card, catastrophe and room names, fetched once.
export function loadBunkerConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/bunker/config').then((r) => r.json()).catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export function useBunkerConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let alive = true;
    loadBunkerConfig().then((c) => { if (alive) setConfig(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return config;
}

export function useBunker(authToken) {
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
    socket.on('bunker:state', (next) => {
      setState(next);
      setSpectating(!!next.spectating);
    });
    socket.on('bunker:chat', (msg) => setChat((prev) => [...prev.slice(-199), msg]));
    socket.on('bunker:system', (msg) => setChat((prev) => [...prev.slice(-199), { ...msg, system: true, ts: Date.now() }]));
    socket.on('bunker:error', (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== 'bunker') return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    bindRejoin(socket, {
      joinEvent: 'bunker:join',
      spectateEvent: 'bunker:spectate',
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
    return request('bunker:create', {
      nickname, playerId, settings, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not create the room.');
  }, [playerId, request]);

  const joinRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('bunker:join', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not join the room.').catch((err) => {
      // A room that will not seat us is still a room we may watch.
      if (err.code !== 'SEAT_GONE') throw err;
      return request('bunker:spectate', {
        roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
      }, 'Could not watch the room.', true);
    });
  }, [playerId, request]);

  const spectateRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('bunker:spectate', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not watch the room.', true);
  }, [playerId, request]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit(spectating ? 'bunker:unspectate' : 'bunker:leave');
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
        socketRef.current?.emit('bunker:surrender', {}, (res) => {
          if (res?.ok) {
            rememberRoom(ROOM_KEY, localStorage.getItem(ROOM_KEY), true);
            setSpectating(true);
          }
          resolve(res);
        });
      }),
      updateSettings: (settings) => emit('bunker:settings', { settings }),
      setReady: (ready) => emit('bunker:ready', { ready }),
      start: () => emit('bunker:start'),
      restart: (startNow) => {
        setSettingsRequested(!startNow);
        emit('bunker:restart', { startNow });
      },
      openSettings: () => setSettingsRequested(true),
      reveal: (key) => emit('bunker:reveal', { key }),
      vote: (targetId) => emit('bunker:vote', { targetId }),
      skip: () => emit('bunker:skip'),
      // An action card names itself and what it is pointed at; the server
      // decides whether that is legal and what it does. The acknowledgement
      // is awaited so the card panel can tell the player it was refused.
      playCard: (card) => new Promise((resolve) => {
        socketRef.current?.emit('bunker:playCard', {
          cardId: card.cardId,
          index: card.index ?? null,
          targetId: card.targetId ?? null,
          key: card.key ?? null,
        }, (res) => resolve(res || { ok: false }));
      }),
      sendChat: (text, extra = {}) => emit('bunker:chat', { ...extra, text }),
    },
  };
}

export default useBunker;
