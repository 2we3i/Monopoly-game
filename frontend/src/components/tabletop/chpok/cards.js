// cards.js
// The two decks of a ЧПОК box.
//
// The cards themselves live in backend/src/chpok/cards.json, reached here
// through the @chpok alias (see vite.config.js). There is exactly one copy
// of them: the same deck the server shuffles for an online room is the one
// this browser shuffles for a group around a single table, so a theme can
// never exist in one mode and not the other.

import deck from '@chpok/cards.json';

export const LETTERS = deck.letters;
export const THEMES_1 = deck.themes1;
export const THEMES_2 = deck.themes2;
