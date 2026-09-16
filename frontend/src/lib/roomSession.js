// roomSession.js
// The half of every game hook that has nothing to do with the game.
//
// A socket.io client that loses its connection reconnects as a NEW socket:
// same object in the browser, a brand-new one on the server, with none of
// the room bindings the old one had. So a client that announces itself
// once, on its first connect, is a ghost from the first blip onwards - the
// server still holds its seat against a socket that no longer exists, it
// receives no more state, and every action it sends is refused with "you
// are not in a room". That is one bug, not seven, and this is where it is
// fixed: rejoin on EVERY connect, in every game.
//
// The same walk back into a room also knows what to do when the seat is
// gone for good (surrendered, or twenty seconds of silence): the player
// takes a place in the gallery instead of being thrown out of the room.

const WATCHING_SUFFIX = ':watching';

export function isWatching(roomKey) {
  return localStorage.getItem(roomKey + WATCHING_SUFFIX) === '1';
}

export function rememberRoom(roomKey, roomCode, watching = false) {
  localStorage.setItem(roomKey, roomCode);
  if (watching) localStorage.setItem(roomKey + WATCHING_SUFFIX, '1');
  else localStorage.removeItem(roomKey + WATCHING_SUFFIX);
}

export function forgetRoom(roomKey) {
  localStorage.removeItem(roomKey);
  localStorage.removeItem(roomKey + WATCHING_SUFFIX);
}

// Wires the rejoin walk onto a socket and returns the function itself, so
// a caller can also run it by hand (after a login, say).
//
//   onJoined(res)     - the seat is ours again
//   onWatching(res)   - no seat, but we are in the gallery
//   onLost(res)       - the room is not ours to be in at all
//   onIdle()          - there was no room to go back to
export function bindRejoin(socket, {
  joinEvent, spectateEvent, roomKey, nicknameKey, playerId, getToken, getGuestKey,
  onJoined, onWatching, onLost, onIdle, extra,
}) {
  const rejoin = () => {
    const roomCode = localStorage.getItem(roomKey);
    if (!roomCode) {
      onIdle?.();
      return;
    }
    // `extra` is whatever the game needs to say about itself on every
    // announce - which device a ЧПОК seat is being played from, say. It has
    // to travel on the REJOIN too, or a phone that reconnects comes back
    // looking like something it is not.
    const payload = () => ({
      roomCode,
      playerId,
      nickname: localStorage.getItem(nicknameKey),
      token: getToken(),
      guestKey: getGuestKey(),
      ...(typeof extra === 'function' ? extra() : extra || {}),
    });

    const watch = () => {
      if (!spectateEvent) {
        forgetRoom(roomKey);
        onLost?.(null);
        return;
      }
      socket.emit(spectateEvent, payload(), (res) => {
        if (res?.ok) {
          rememberRoom(roomKey, res.roomCode, true);
          onWatching?.(res);
        } else {
          forgetRoom(roomKey);
          onLost?.(res);
        }
      });
    };

    if (isWatching(roomKey)) {
      watch();
      return;
    }
    socket.emit(joinEvent, payload(), (res) => {
      if (res?.ok) {
        rememberRoom(roomKey, res.roomCode, false);
        onJoined?.(res);
        return;
      }
      // Any refusal at all - the seat is gone, the game finished while we
      // were away, the table filled up - still leaves a room worth being
      // in. Only a room that will not even be WATCHED is one to forget,
      // and `watch` clears the saved code itself when that happens.
      watch();
    });
  };

  socket.on('connect', rejoin);
  return rejoin;
}

export default bindRejoin;
