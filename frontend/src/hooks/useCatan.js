// useCatan.js
// Client side of Catan. Same shape as useCitadels: its own socket, a
// per-player state pushed by the server, and actions that only ever name
// an intention ("build a road on edge 31") - never a result.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { announce, getGuestKey, getPlayerId } from '../lib/identity';
import { bindRejoin, forgetRoom, rememberRoom } from '../lib/roomSession';

const ROOM_KEY = 'landmark_catan_room';
const NICKNAME_KEY = 'landmark_nickname';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export function useCatan(authToken) {
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
    socket.on('catan:state', (next) => {
      setState(next);
      setSpectating(!!next.spectating);
    });
    socket.on('catan:chat', (msg) => setChat((prev) => [...prev.slice(-149), msg]));
    socket.on('catan:system', (msg) => setChat((prev) => [...prev.slice(-149), { ...msg, system: true, ts: Date.now() }]));
    socket.on('catan:error', (err) => {
      setError(err.message);
      setTimeout(() => setError((cur) => (cur === err.message ? null : cur)), 4000);
    });
    socket.on('room:removed', (payload) => {
      if (payload?.gameType !== 'catan') return;
      clearRoom();
      announce('notice', { kind: 'roomRemoved', reason: payload.reason });
    });
    socket.on('account:blocked', (payload) => announce('blocked', payload));

    bindRejoin(socket, {
      joinEvent: 'catan:join',
      spectateEvent: 'catan:spectate',
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
    return request('catan:create', {
      nickname, playerId, settings, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not create the room.');
  }, [playerId, request]);

  const joinRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('catan:join', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not join the room.').catch((err) => {
      // A room that will not seat us is still a room we may watch.
      if (err.code !== 'SEAT_GONE') throw err;
      return request('catan:spectate', {
        roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
      }, 'Could not watch the room.', true);
    });
  }, [playerId, request]);

  const spectateRoom = useCallback((code, nickname) => {
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    return request('catan:spectate', {
      roomCode: code, nickname, playerId, token: authTokenRef.current, guestKey: getGuestKey(),
    }, 'Could not watch the room.', true);
  }, [playerId, request]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit(spectating ? 'catan:unspectate' : 'catan:leave');
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
        socketRef.current?.emit('catan:surrender', {}, (res) => {
          if (res?.ok) {
            rememberRoom(ROOM_KEY, localStorage.getItem(ROOM_KEY), true);
            setSpectating(true);
          }
          resolve(res);
        });
      }),
      updateSettings: (settings) => emit('catan:settings', { settings }),
      setReady: (ready) => emit('catan:ready', { ready }),
      start: () => emit('catan:start'),
      restart: (startNow) => {
        setSettingsRequested(!startNow);
        emit('catan:restart', { startNow });
      },
      roll: () => emit('catan:roll'),
      buildRoad: (edgeId) => emit('catan:buildRoad', { edgeId }),
      buildSettlement: (vertexId) => emit('catan:buildSettlement', { vertexId }),
      buildCity: (vertexId) => emit('catan:buildCity', { vertexId }),
      buyDev: () => emit('catan:buyDev'),
      playDev: (card, payload = {}) => emit('catan:playDev', { card, ...payload }),
      discard: (resources) => emit('catan:discard', { resources }),
      moveRobber: (hexId) => emit('catan:moveRobber', { hexId }),
      steal: (victimId) => emit('catan:steal', { victimId }),
      bankTrade: (give, get, amount = 1) => emit('catan:bankTrade', { give, get, amount }),
      proposeTrade: (offer) => emit('catan:proposeTrade', offer),
      respondTrade: (tradeId, accept) => emit('catan:respondTrade', { tradeId, accept }),
      confirmTrade: (tradeId, partnerId) => emit('catan:confirmTrade', { tradeId, partnerId }),
      cancelTrade: () => emit('catan:cancelTrade'),
      endTurn: () => emit('catan:endTurn'),
      sendChat: (text, extra = {}) => emit('catan:chat', { ...extra, text }),
    },
  };
}

export default useCatan;
