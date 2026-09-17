// useMemeHype.js
// Client side of Meme Hype, for the big screen and for every phone. The
// room is the shared party-room client; a Meme Hype phone plays one meme
// from its hand and casts one vote per round.

import { usePartyRoom } from './usePartyRoom';

const MOVES = {
  pick: (memeId) => ({ memeId }),
  vote: (pickId) => ({ pickId }),
};

export function useMemeHype(authToken, { device = 'screen', enabled = true } = {}) {
  return usePartyRoom('memehype', authToken, { device, enabled, moves: MOVES });
}

export default useMemeHype;
