// identity.js
// The browser-side half of a guest's identity.
//
// A guest has a player id (visible to everyone in a room) and a secret
// guest key that never leaves this browser except to the server. The
// server remembers a hash of the key on the guest's seat, so knowing a
// guest's player id is not enough to take over their seat.

const PLAYER_ID_KEY = 'landmark_player_id';
const GUEST_KEY = 'landmark_guest_key';

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  window.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getPlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `p-${randomHex(12)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function getGuestKey() {
  let key = localStorage.getItem(GUEST_KEY);
  if (!key) {
    key = randomHex(32);
    localStorage.setItem(GUEST_KEY, key);
  }
  return key;
}

// Hooks announce app-wide happenings (a blocked account, a room closed by
// the admin) as DOM events, so the screen that needs to react does not
// have to be wired through every hook in between.
export function announce(name, detail) {
  window.dispatchEvent(new CustomEvent(`landmark:${name}`, { detail }));
}
