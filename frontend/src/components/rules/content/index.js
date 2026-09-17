// content/index.js
// The rules catalogue: one entry per game, all in the same eight blocks.
//
// A game with no entry here is not an error - the rules button simply does
// not appear for it, and the "your action now" panel still works from
// nowAction.js.

import social from './social';
import boards from './boards';

export const RULES = { ...social, ...boards };

export function rulesFor(gameId) {
  return RULES[gameId] || null;
}

export default RULES;
