// useCosmic.js
// Client side of Cosmic Encounter. Same shape as useCatan: its own
// socket, a per-player state pushed by the server, and actions that only
// ever name an intention - never a result.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';

const ROOM_KEY = 'landmark_cosmic_room';
const NICKNAME_KEY = 'landmark_nickname';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export function useCosmic(authToken) {
  const socketRef = useRef(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [chat, setChat] = useState([]);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(ROOM_KEY) || null);
  const [settingsRequested, setSettingsRequested] = useState(false);
  const playerId = getPlayerId();

  const clearRoom = useCallback(() => {
    localStorage.removeItem(ROOM_KEY);
    setRoomCode(null);
    setState(null);
    setChat([]);
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
    socket.on('cosmic:state', (next) => setState(next));
    socket.on('cosmic:chat', (msg) => setChat((prev) => [...prev.slice(-149), msg]));
    socket.on('cosmic:system', (msg) => setChat((prev) => [...prev.slice(-149), { ...msg, system: true, ts: Date.now() }]));
    socket.on('cosmic:error', (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== 'cosmic') return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    // Rejoin the saved room on every (re)connect.
    const rejoin = () => {
      const saved = localStorage.getItem(ROOM_KEY);
      if (!saved) return;
      socket.emit('cosmic:join', {
        roomCode: saved,
        playerId,
        nickname: localStorage.getItem(NICKNAME_KEY),
        token: authTokenRef.current,
        guestKey: getGuestKey(),
      }, (res) => {
        if (res?.ok) {
          setRoomCode(res.roomCode);
          setState(res.state);
        } else {
          clearRoom();
        }
      });
    };
    socket.on('connect', rejoin);
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    socketRef.current?.emit('presence:identify', { token: authToken });
  }, [authToken]);

  const request = useCallback((event, payload, fallback) => new Promise((resolve, reject) => {
    socketRef.current.emit(event, payload, (res) => {
      if (res?.ok) {
        localStorage.setItem(ROOM_KEY, res.roomCode);
        setRoomCode(res.roomCode);
        setState(res.state);
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
    return request('cosmic:create', {
      nickname, playerId, settings, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not create the room.');
  }, [playerId, request]);

  const joinRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('cosmic:join', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not join the room.');
  }, [playerId, request]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('cosmic:leave');
    clearRoom();
  }, [clearRoom]);

  const emit = useCallback((event, payload = {}) => {
    socketRef.current?.emit(event, payload);
  }, []);

  return {
    connected,
    state,
    error,
    chat,
    roomCode,
    playerId,
    createRoom,
    joinRoom,
    leaveRoom,
    settingsRequested,
    clearSettingsRequest: () => setSettingsRequested(false),
    actions: {
      updateSettings: (settings) => emit('cosmic:settings', { settings }),
      setReady: (ready) => emit('cosmic:ready', { ready }),
      start: () => emit('cosmic:start'),
      restart: (startNow) => {
        setSettingsRequested(!startNow);
        emit('cosmic:restart', { startNow });
      },
      chooseAlien: (alienId) => emit('cosmic:chooseAlien', { alienId }),
      beginTurn: () => emit('cosmic:beginTurn'),
      regroup: (planetId) => emit('cosmic:regroup', { planetId }),
      drawDestiny: () => emit('cosmic:drawDestiny'),
      chooseDefender: (targetId) => emit('cosmic:chooseDefender', { targetId }),
      ownColor: (choice) => emit('cosmic:ownColor', { choice }),
      launch: (planetId, ships, defenderId) => emit('cosmic:launch', { planetId, ships, defenderId }),
      useMind: (targetId) => emit('cosmic:mind', { targetId }),
      invite: (ids) => emit('cosmic:invite', { ids }),
      ally: (side, ships) => emit('cosmic:ally', { side, ships }),
      usePower: (power, use) => emit('cosmic:power', { power, use }),
      selectCard: (uid) => emit('cosmic:selectCard', { uid }),
      reinforce: (uid, side) => emit('cosmic:reinforce', { uid, side }),
      artifact: (uid, payload = {}) => emit('cosmic:artifact', { uid, ...payload }),
      pass: () => emit('cosmic:pass'),
      proposeDeal: (terms) => emit('cosmic:proposeDeal', terms),
      acceptDeal: (proposalId) => emit('cosmic:acceptDeal', { proposalId }),
      rewards: (cards) => emit('cosmic:rewards', { cards }),
      clone: (keep) => emit('cosmic:clone', { keep }),
      fetch: (payload) => emit('cosmic:fetch', payload),
      fetchAnswer: (accept) => emit('cosmic:fetchAnswer', { accept }),
      continueTurn: (again) => emit('cosmic:continue', { again }),
      sendChat: (text, extra = {}) => emit('cosmic:chat', { ...extra, text }),
    },
  };
}

export default useCosmic;
