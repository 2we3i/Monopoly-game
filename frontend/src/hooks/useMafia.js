// useMafia.js
// Client side of the Mafia mode.
//
// It runs on its own socket rather than sharing the Monopoly one: the
// two games have separate event namespaces and separate reconnect rules,
// and keeping the connections apart means neither hook can break the
// other. The state this hook holds is whatever the SERVER decided this
// player may see - there is no client-side copy of anyone's role.
//
// Reconnecting is handled by lib/roomSession: the seat is re-announced on
// every connect, not just the first, and a seat that is gone for good
// turns into a place in the gallery instead of throwing the player out.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';
import { bindRejoin, forgetRoom, rememberRoom } from '../lib/roomSession';

const ROOM_KEY = 'landmark_mafia_room';
const NICKNAME_KEY = 'landmark_nickname';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export function useMafia(authToken, { enabled }) {
  const socketRef = useRef(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [chat, setChat] = useState([]);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_KEY) || null);
  const [spectating, setSpectating] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set by "Change settings" on the game-over screen, so the lobby the
  // room returns to opens with the rules already on screen.
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
    if (!enabled) return undefined;
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      auth: (cb) => cb({ token: authTokenRef.current }),
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('mafia:state', (next) => {
      setState(next);
      setSpectating(!!next.spectating);
    });
    socket.on('mafia:chat', (msg) => setChat((prev) => [...prev.slice(-199), msg]));
    socket.on('mafia:system', (msg) => setChat((prev) => [...prev.slice(-199), { ...msg, system: true, ts: Date.now() }]));
    socket.on('mafia:error', (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== 'mafia') return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    bindRejoin(socket, {
      joinEvent: 'mafia:join',
      spectateEvent: 'mafia:spectate',
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
  }, [enabled]);

  useEffect(() => {
    socketRef.current?.emit('presence:identify', { token: authToken });
  }, [authToken]);

  const emit = useCallback((event, payload) => {
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

  const createRoom = useCallback((nickname, presetId) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('mafia:create', {
      nickname, playerId, presetId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not create the room.');
  }, [playerId, request]);

  const joinRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('mafia:join', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not join the room.').catch((err) => {
      // A room that will not seat us is still a room we may watch.
      if (err.code !== 'SEAT_GONE') throw err;
      return request('mafia:spectate', {
        roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
      }, 'Could not watch the room.', true);
    });
  }, [playerId, request]);

  const spectateRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('mafia:spectate', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not watch the room.', true);
  }, [playerId, request]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit(spectating ? 'mafia:unspectate' : 'mafia:leave');
    clearRoom();
  }, [clearRoom, spectating]);

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
    settingsRequested,
    clearSettingsRequest: () => setSettingsRequested(false),
    actions: {
      updateSettings: (settings) => emit('mafia:settings', { settings }),
      applyPreset: (presetId) => emit('mafia:preset', { presetId }),
      randomSettings: () => emit('mafia:randomSettings', {}),
      setReady: (ready) => emit('mafia:ready', { ready }),
      start: () => emit('mafia:start', {}),
      nightAction: (targetId) => emit('mafia:night', { targetId }),
      donCheck: (targetId) => emit('mafia:night', { secondaryTargetId: targetId }),
      // Giving up is final: the seat goes, and the player stays on as a
      // watcher. The confirmation happens before this is ever called.
      surrender: () => new Promise((resolve) => {
        socketRef.current?.emit('mafia:surrender', {}, (res) => {
          if (res?.ok) {
            rememberRoom(ROOM_KEY, localStorage.getItem(ROOM_KEY), true);
            setSpectating(true);
          }
          resolve(res);
        });
      }),
      restart: (startNow) => {
        setSettingsRequested(!startNow);
        emit('mafia:restart', { startNow });
      },
      vote: (targetId) => emit('mafia:vote', { targetId }),
      skipPhase: () => emit('mafia:skipPhase', {}),
      sendChat: (text, extra = {}) => emit('mafia:chat', { ...extra, text }),
    },
  };
}

export default useMafia;
