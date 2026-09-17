// usePartyRoom.js
// The client half of every "big screen + phones" party game.
//
// ЧПОК and Meme Hype run the same room on the server (see
// backend/src/party), so their clients are the same too: one socket, a
// per-seat state pushed by the server, a rejoin on every reconnect, a place
// in the gallery when the seat is gone, and surrender. A game adds only its
// own moves - `moves` maps an action name to the event and payload it
// sends, and every move reports back so a phone can show a refusal.
//
//   usePartyRoom('memehype', authToken, {
//     device: 'phone',
//     moves: { pick: (memeId) => ({ memeId }), vote: (pickId) => ({ pickId }) },
//   })

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';
import { bindRejoin, forgetRoom, rememberRoom } from '../lib/roomSession';

const NICKNAME_KEY = 'landmark_nickname';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export const roomKeyOf = (type) => `landmark_${type}_room`;

export function usePartyRoom(type, authToken, { device = 'screen', enabled = true, moves = {} } = {}) {
  const ROOM_KEY = roomKeyOf(type);
  const ev = (name) => `${type}:${name}`;
  const socketRef = useRef(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const movesRef = useRef(moves);
  movesRef.current = moves;

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
  }, [ROOM_KEY]);

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
    socket.on(ev('state'), (next) => {
      setState(next);
      setSpectating(!!next.spectating);
    });
    socket.on(ev('chat'), (msg) => setChat((prev) => [...prev.slice(-149), msg]));
    socket.on(ev('system'), (msg) => setChat((prev) => [...prev.slice(-149), { ...msg, system: true, ts: Date.now() }]));
    socket.on(ev('error'), (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== type) return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    bindRejoin(socket, {
      joinEvent: ev('join'),
      spectateEvent: ev('spectate'),
      roomKey: ROOM_KEY,
      nicknameKey: NICKNAME_KEY,
      playerId,
      getToken: () => authTokenRef.current,
      getGuestKey,
      // Which device this seat is played from travels on every announce:
      // a phone that reconnects is still a phone.
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
  }, [enabled, type]);

  useEffect(() => {
    socketRef.current?.emit('presence:identify', { token: authToken });
  }, [authToken]);

  const emit = useCallback((event, payload = {}) => {
    socketRef.current?.emit(event, payload);
  }, []);

  // Every move answers back, so a phone can say "refused" instead of
  // silently doing nothing.
  const ack = useCallback((event, payload) => new Promise((resolve) => {
    if (!socketRef.current) {
      resolve({ ok: false });
      return;
    }
    socketRef.current.emit(event, payload, (res) => resolve(res || { ok: false }));
  }), []);

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
  }), [ROOM_KEY]);

  const identity = useCallback((nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return {
      nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    };
  }, [playerId]);

  const createRoom = useCallback((nickname, settings) => request(ev('create'), {
    ...identity(nickname), settings, device: deviceRef.current,
  }, 'Could not create the room.'), [identity, request]); // eslint-disable-line react-hooks/exhaustive-deps

  const spectateRoom = useCallback((code, nickname) => request(ev('spectate'), {
    ...identity(nickname), roomCode: code,
  }, 'Could not watch the room.', true), [identity, request]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinRoom = useCallback((code, nickname) => request(ev('join'), {
    ...identity(nickname), roomCode: code, device: deviceRef.current,
  }, 'Could not join the room.').catch((err) => {
    // A room that will not seat us is still a room we may watch.
    if (err.code !== 'SEAT_GONE') throw err;
    return spectateRoom(code, nickname);
  }), [identity, request, spectateRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit(spectating ? ev('unspectate') : ev('leave'));
    clearRoom();
  }, [clearRoom, spectating]); // eslint-disable-line react-hooks/exhaustive-deps

  const gameMoves = Object.fromEntries(Object.entries(movesRef.current).map(([name, build]) => [
    name, (...args) => ack(ev(name), build(...args)),
  ]));

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
      updateSettings: (settings) => emit(ev('settings'), { settings }),
      setReady: (ready) => emit(ev('ready'), { ready }),
      setPlaying: (playing) => emit(ev('playing'), { playing }),
      start: () => ack(ev('start'), {}),
      skip: () => emit(ev('skip')),
      restart: (startNow) => emit(ev('restart'), { startNow }),
      sendChat: (text, extra = {}) => emit(ev('chat'), { ...extra, text }),
      surrender: () => new Promise((resolve) => {
        socketRef.current?.emit(ev('surrender'), {}, (res) => {
          if (res?.ok) {
            rememberRoom(ROOM_KEY, localStorage.getItem(ROOM_KEY), true);
            setSpectating(true);
          }
          resolve(res);
        });
      }),
      ...gameMoves,
    },
  };
}

export default usePartyRoom;
