# Landmark

A real-time, browser-based board game platform: **Monopoly** (up to 10 players, two board sizes, trading and "For the Family" pricing), **Mafia** (4–15 players, secret roles, night and day), **Citadels** (2–7 players, secret role draft and city building) and **Bunker** (4–16 players, secret characteristics, reveals and votes) **Catan** («Колонизаторы», 2–4 players, a hex island, dice, trading and building) and **Cosmic Encounter** («Космический контакт», 3–5 players, alien races with powers, alliances and deals). Registered players host games; guests join by code or invite link; one administrator account runs the platform from an admin panel.

## Accounts, permissions and the admin panel

- **Registered players** create rooms in every game, invite others (room code or `/?room=CODE` link), start games, and get a profile page (`/profile`) with games played, wins, losses, win rate, time played, per-game and Citadels statistics, recent games and achievements — all computed from the server's match history.
- **Guests** can only join an existing room by code or link. Creating or starting a room is refused by the server (`GUEST_CANNOT_CREATE` / `GUEST_CANNOT_START`), not just hidden in the UI. A guest's seat is protected by a secret key kept in their browser, so knowing a guest's player id is not enough to take their seat, and a guest can never use a registered account's id.
- **Administrators** are set with `ADMIN_ACCOUNT_ID`: one account id, or several separated by commas (`ADMIN_ACCOUNT_ID=id1,id2`, ids are shown on profile pages) — those accounts are then the only admins regardless of the database. Without it, run `npm run make-admin -- <nickname>` in `backend/` on the server. Every `/api/admin/*` request re-checks the account, so a normal user opening `/admin` gets "access denied" from the server.
- **Admin panel** (`/admin`): platform statistics (users, active/blocked users, guests, players online, games and lobbies — total/active/finished, games per day/week/month, mode popularity, average players and duration, Citadels statistics, recent games, audit trail); every live lobby with its players, invite link, stage and age, with "remove player" and "close lobby"; every user with search, status/activity filters and full statistics, with **block** (reason required, explicit confirmation, optionally removing them from their rooms — who blocked and when is stored) and **unblock**; and game modes, each of which can be enabled, disabled or paused for a set time. Disabling a mode refuses new games only — games already running are never interrupted.
- A blocked account cannot log in, cannot use an old token, cannot create or join rooms, and its open connections are closed immediately.

## The Creator

Above the administrators there is the **Creator** - the owner of the platform, with full control from the same panel (`/admin`). Administrators keep exactly the powers listed above; every Creator route is refused to them by the server (`backend/src/platform/permissions.js` holds the role → permission matrix, shown in the panel under "Access control").

- **Appointing.** `CREATOR_ACCOUNT_ID` (one id or several, like `ADMIN_ACCOUNT_ID`), `npm run make-creator -- <nickname>` in `backend/`, or the panel. While no Creator exists at all, the administrators act as the Creator, so upgrading never locks the owner out; the first role change made from the panel appoints the acting Creator for real.
- **Sections.** Home, Statistics, Users (roles, crowns with history, items), Access control, Lobbies, Games (live state of every player, event logs, ending a game), Game modes, Testing, Bots, Maps, Board squares, Memes, Media, Shop, Economy, Logs (the Creator's journal and server errors), Settings.
- **Game modes.** Each mode shows its status, players, matches played and running, popularity, errors, version and last change, with Edit / Settings / Test / Run test match / Enable / Disable / View logs. The mode constructor edits player limits, whether guests may join, the default match settings (and which ones hosts cannot change), texts, auto-move timers and - for Monopoly - starting money, salary, jail, mortgage and auction rules and the Chance / Community Chest decks. Every save is a validated new version that can be restored; it is read only when a room is created, joined or started, and a Monopoly room keeps its board, rules and cards in its own saved state - a game already running never changes.
- **Testing without real data.** A simulation plays whole games with bots in memory on the server (on the saved rules or an unsaved draft) and reports finished games, errors with stacks, steps and winners. A test match lets the Creator play a real room - even in a mode switched off for everyone - that is never written to the room log or match history, pays no crowns and changes no statistics.
- **Boards and squares.** Any square of any Monopoly board can be renamed, repriced, re-rented, given a picture and a description or changed to another kind; new boards are copied or generated at any size and become new modes; added boards can be deleted and built-in ones reset. The whole board is validated before it is installed.
- **Memes and media.** Meme captions, emoji, backgrounds, pictures, weights and switches are edited, memes and situations are added, deleted and restored, packs are switched on and off - the next card dealt shows the change, no restart. The media library lists every picture the games use (memes, squares, shop items, uploads) with search, filters and preview; a picture is renamed, described, linked to a mode, a square or a meme, replaced or deleted, and the change shows where it is used at once. Uploads live in `DATA_DIR/media` and are served at `/media`.
- **Shop and crowns.** Items get new prices, rarities, names, descriptions and pictures, go on or off sale, and new items are created - including **square names**: a name with its own picture for one square, a colour group or a kind of square. A player buys one, sees it in the inventory, equips it, and while they own the matching square everyone at the table sees that name and picture on the board (the rules engine keeps the real square). An owned item is never taken away by deleting it - it is retired. Crowns are added, removed or set for one user or many at once, always with a reason; changes of 10 000 or more, bulk changes and "set" need a second confirmation.
- **Economy and platform settings.** Match rewards, streak and achievement rewards, the daily cap, the minimum game length and the festival multiplier; whether registration and the shop are open; an announcement shown to everybody.
- **Safety.** Dangerous requests must carry `confirm: true` (the server answers 428 otherwise); the panel asks first and asks twice for critical ones (sometimes typing a name). Every change - roles, crowns, blocks, deletions, rules, shop, modes, boards, memes, media, settings - is written to the Creator's journal with who (and in which role), when, the target, the value before, the value after and the reason. Server errors reported anywhere are kept per game.

Everything the Creator changes is stored in additive tables of `platform.db` (`mode_configs`, `board_layouts`, `shop_items`, `meme_overrides`, `custom_memes`, `media_assets`, `platform_settings`, `error_log`, `test_runs`, `test_rooms`); an empty table means the game plays exactly as the code ships.

Platform history lives in `backend/data/platform.db` (`rooms_log`, `matches`, `match_players`, `game_modes`, `admin_actions`); accounts in `accounts.db` (migrated in place — existing accounts keep working); live rooms in `monopoly.db` as before.

## Citadels

Each round players pick a role in secret, starting with the crown holder — only the current picker sees the pool, and a role stays hidden until the engine calls it. Roles are then called in order (Assassin, Thief, Magician, King, Bishop, Merchant, Architect, Warlord); each holder takes 2 gold or draws a district card, uses their power, collects income from districts of their type and builds. The Assassin's and Thief's targets are secret until the victim's role is called; the Thief takes the gold before the victim can act; the King takes the crown and picks first next round. Districts are residential, religious, trade, military or special (Dragon Gate, University, Library, Observatory, Smithy, Laboratory, School of Magic, Keep, Great Wall, Haunted Quarter). The game ends after the round in which someone completes a city; the score is district costs, +3 for all five types, +4 for finishing first (+2 for finishing later).

Roles are data in `backend/src/citadels/roles.js` (rank, income type, crown, build limit, …) with active powers in `abilities.js`; districts are data in `districts.js`. The engine (`CitadelsGame.js`) validates every action against server state and builds a separate payload per player, so hands, the draft pool, unrevealed roles and secret targets never reach anyone else's browser.

## Cosmic Encounter

3–5 players, following the official rulebook. Each player is an alien race in their own colour with a home system of 5 planets, 20 ships, a hand of cards and a colony counter; the first to hold 5 foreign colonies wins, and players who reach their fifth colony at the same time win together. Two races are dealt to each player and one is kept (advanced setup). Ten races have their powers built into the rules engine, not just described: Macron, Parasite, Clone, Zombie, Oracle, Trader, Mind, Fido, Warrior and Machine; a power is lost while its race holds fewer than 3 home colonies.

A turn is an encounter played in eight separate phases. **Start turn** (no encounter cards: discard and draw 8), **regroup** (one ship back from the warp), **destiny** (colour cards, wilds, and special cards that pick the leader in colonies, cards or ships in the warp; your own colour lets you attack a foreign colony at home, rebuild an empty home planet or draw again), **launch** (aim the hyperspace gate at a planet and send 1–4 ships from any colonies), **alliance** (the offense, then the defense invites; invited players answer in turn order, each choosing a side or neither and sending 1–4 ships), **planning** (both main players choose an encounter card face down), **reveal** (attack vs attack compares card + ships + reinforcements, ties go to the defense; attack beats negotiate and the negotiator takes compensation; morph copies the other card) and **resolution** (colonies, the warp, defensive rewards per allied ship). Negotiate vs negotiate opens a one-minute deal: card trades and at most one colony each; no deal costs both sides 3 ships. A successful encounter allows a second one. Reinforcements and all 11 artifacts (Cosmic Zap, Card Zap, Mobius Tubes, Plague, Force Field, Emotion Control, Ionic Gas, Quash) are playable in their windows; flares and technologies are not part of this version. The rulebook gives deck sizes but not the values on each card, so the encounter, reinforcement and destiny decks follow the published base game.

The board is an SVG galaxy with the warp and colony track in the middle, each system around it, ship stacks on planets, the gate aimed at the target, and ships that fly between places when they move. Wheel zooms smoothly at the cursor, the middle button (or a drag on empty space) pans, touch pinches. The engine (`backend/src/cosmic/CosmicGame.js`, cards in `cards.js`, races in `aliens.js`) validates every action and builds a payload per player: hands, face-down encounter cards and deal cards reach only the players allowed to see them.

## Catan

2–4 players on the classic island: 19 terrain hexes (forest, hills, pasture, fields, mountains and a desert) in the sea, number tokens (never two red 6/8 tokens side by side) and nine harbours (four 3:1, five 2:1), generated fresh for every game. Everyone places a settlement and a road, then again in reverse order; the second settlement pays one card for each hex around it. On a turn the player rolls two dice and every hex showing that number pays 1 card to each adjacent settlement and 2 to each city, unless the robber stands on it (when the bank cannot cover every claim on a resource, nobody gets it). A 7 makes everyone holding more than 7 cards discard half, then the roller moves the robber and steals a card from a player there. Roads, settlements (distance rule, must touch your road), cities and development cards cost the classic resources and piece limits apply (15 roads, 5 settlements, 4 cities). Trading is with the bank at 4:1, 3:1 or 2:1 through your harbours, or with other players: the current player makes an offer, the others accept or decline, and the offerer picks a partner. Development cards are knights (move the robber, count towards the Largest Army from 3), Road Building, Year of Plenty, Monopoly and hidden victory points; a card cannot be played on the turn it was bought, and only one per turn. The Longest Road (5+, and an opponent's settlement can cut it) and the Largest Army are worth 2 points each; the first player to reach the target (10 by default) on their own turn wins. The lobby sets the target and an optional turn timer; without one, a player who is away still gets a short grace period before a legal move is made for them.

The board is an SVG island in a zoom/pan viewport: the wheel zooms smoothly around the cursor between sensible limits, a drag pans (a small threshold keeps clicks and drags apart, so a drag never places a piece), two fingers pinch, and hovering a hex explains what it produces, its number and chance, the robber and who collects there. The engine (`backend/src/catan/CatanGame.js`, geometry and layouts in `board.js`) validates every action and builds a separate payload per player: other hands arrive only as counts, hidden victory points only for their owner, and the corners and sides a player may build on come from their own legal moves.

## Bunker

4–16 players. A random catastrophe strikes and the shelter has fewer places than people (half the table by default, or the host's number). Everyone is dealt seven secret characteristic cards - profession, biology, health, hobby, baggage, character and an extra fact - drawn without duplicates within a game. Each round the players take turns revealing one of their own cards (round 1 is always the profession); from round 2 the reveals are followed by a discussion and a vote, and the player with the most votes is left outside with all their cards turned over. A tie goes to a runoff between the tied players; a second tie excludes nobody that round, and once every card is on the table a deadlock is settled by lot. The game ends when no more people remain than places: the survivors win, and the end screen shows every card, who was left outside and when, and a verdict on the colony's chances.

The lobby sets the room size, the number of places and the reveal / discussion / vote timers. The server's clock moves the game on (a missed reveal is made automatically), the host can cut a discussion or a result screen short, and a player who leaves mid-game counts as leaving the bunker. As in the other games, each player receives their own payload: another player's hidden card is simply not in it, and every action (reveal only your own card, only on your turn, only once; vote only once, never for yourself, only for a candidate) is checked on the server. Cards are data in `backend/src/bunker/cards.js`; the rules are `BunkerGame.js`.

## The Iron Throne (board games section)

A Westeros strategy game in the board-games section (`/tabletop/iron-throne`), played around one device like ЧПОК: 2–6 great houses (Stark, Lannister, Baratheon, Greyjoy, Tyrell, Martell), each led by a player or by the computer; houses left out give their castles to neutral garrisons. Unlike ЧПОК it is not behind the 18+ question — only the ЧПОК cards and routes are.

- **The map** is a large SVG of Westeros: 38 territories and 13 sea zones, the Wall and the lands beyond it, the Iron Throne in the Narrow Sea. Every territory shows its name, owner (tint and border in the house colour), fortification (stronghold, castle, city, King's Landing, a built fort), army (footmen·knights on the house sigil), neutral garrison, control marker and its port, supply and crown icons. The camera is the platform's existing pan/zoom hook (`cosmic/usePanZoom.js`): wheel zoom around the cursor, left-drag pan with a click threshold, pinch, zoom buttons and fit.
- **A round** opens with a Westeros card for everyone (winter, harvest, wildlings, feast, storms, plague, muster, small council, tourney, calm); then each house takes a turn: income (gold from fortifications and ports, influence from crowns), 3 commands (4 for the ruler of King's Landing) to march, sail from a port to any coast of an adjacent sea, capture or attack, recruiting at fortifications within the supply limit, one tactic card, control markers, forts, alliances and betrayals.
- **Battle**: strength + a die against army + garrison + fortification + marker + walls + a die, ties to the defender; losses scale with the margin, beaten defenders retreat or are destroyed. The screen shows the odds before an attack and a battle report after.
- **Victory**: strongholds, castles and cities are worth 1 power, King's Landing 2; the first house to end its turn with the target (6/7/8) wins, otherwise the strongest house after the last round (8/10/12), or the last house standing.
- **Panels**: current house and resources, all houses with their race to the throne, the Westeros card, the selected territory / sea / throne with every action it allows, tactic cards, diplomacy and a chronicle that marks the previous turn.

The rules are pure functions in `frontend/src/components/tabletop/throne/engine.js` (seeded dice kept in the state, an AI that plays through the same `act()`), the map and its measured adjacency in `westeros.js`, the board in `ThroneMap.jsx`, panels in `ThronePanels.jsx`, the flow in `ThroneGame.jsx`, artwork in `throneArt.jsx` and strings in `i18n/throneTranslations.js`. The campaign is saved in `localStorage`. No server code is involved.

## Community: chat, messages, notifications, crowns and the shop

- **Mentions** — in every room chat and in private messages, typing `@` opens a list of the people in that chat; `@Nickname` is highlighted, the mentioned player gets a notification (only if they may read that message — Mafia's night channel never leaks), and clicking a mention opens the player's card with "Open profile" and "Message".
- **Group messages** — typing `@@` opens a picker to search for, add and remove several players; the message then goes privately to exactly those players (as a group conversation) instead of to the room. `@@` is recognised before `@` and removed from the text, so the two never collide.
- **Messenger** (`/messages`, or a drawer from any screen, including mid-game): conversation list with search and unread counts, new one-to-one or group chats, history loaded 50 messages at a time, day separators, sent / delivered / read ticks, members-only access, length and rate limits.
- **Notifications** — one centre (bell in every header) for messages, mentions, group messages, rewards, wins and podium places, win streaks, achievements, purchases, items received and leaderboard rank-ups, with unread counts, mark read, read all and clear all, plus toasts. Busy conversations and repeated mentions collapse into one entry with a count.
- **Crowns** are earned only by playing, and only by registered players: a finished game pays participation, 1st/2nd/3rd place in ranked games (Monopoly, Citadels) or the winning side in Mafia, scaled down for two- and three-player tables; plus first win of the day, win streaks (3/5/10), achievements (once each) and the weekend festival (+25%). A game must last a minimum time and only a limited number of games a day pay, so rewards cannot be farmed. Every change is a ledger row with a unique (account, kind, reference), so nothing is ever paid twice.
- **Shop** (`/shop`): 140+ purely cosmetic items in nine categories — token shape/rim/aura/movement trail/victory mark, nickname style/decoration/entrance, avatar frames, profile backgrounds and cards, effects (entrance, victory, defeat, reward, rank-up, podium), titles, badges, emotes and sounds — in six rarities (Common → Mythic) with prices by rarity; categories, search, sorting, rarity/price/ownership/favourite filters, a live preview on the player's own look, and a confirmed purchase. Some rare items are never sold and are earned through achievements, streaks, seasons, the festival or the leaderboard. No item changes game rules.
- **Inventory** (`/inventory`): every owned item with category, rarity, date and source, equipped state, Equip / Unequip / Preview, and the combined loadout. **Leaderboard** (`/leaderboard`): monthly season and all-time rankings with season rewards. **Profiles** (`/profile`, and `/u/<id>` for other players) show the look, crowns, ranks, streaks, victory history, equipped items and recent items alongside the existing statistics.

The server decides everything here: prices, balances, ownership and slots are checked on every request; rewards are computed from the recorded match history; room payloads carry only the ids of each player's visible cosmetics. Wallets, the ledger, inventory, equipment, favourites, notifications and conversations live in `platform.db` next to the match history (`backend/src/db/community.js`); the item catalogue is `backend/src/economy/catalog.js` and the reward numbers are `backend/src/economy/rules.js`.

## Party games with phones: ЧПОК and Meme Hype

Both run as "one big screen, a phone each". The screen opens a room and
shows a QR code pointing at `/play/<CODE>`; each phone that scans it gets its
own seat. `/play` asks the server which game the code belongs to and opens
that game's controller, so every party game shares one link format.

- **Shared room layer** - `backend/src/party/PartyRoom.js` (seats, host,
  phone/screen seats, lobby, drop-outs, results) and
  `backend/src/party/partyHandler.js` (join/create, phase clock, spectators,
  20-second reconnect grace, surrender). On the client: `usePartyRoom`,
  `components/play/*`.
- **ЧПОК online** - write answers on phones, anonymous vote, round events
  (double points, blitz, any letter, two words, a ×2 final). Content packs
  with a 16+ or 18+ rating live in `backend/src/chpok/packs.js`; a room plays
  only packs of its own rating. The two original boxes are packs `box1` and
  `box2` (their themes are still `backend/src/chpok/cards.json`).
- **Meme Hype** (3-6 players) - a situation on the screen, a private hand of
  memes on each phone, anonymous MEM #N vote, 100 points per vote plus 100
  for the round's best meme, a ×2 final round, and a final table with round
  wins and votes received. If time runs out, a random meme from the
  player's hand is played (or the round is skipped - a room setting).
  Switching a room to 18+ needs an explicit confirmation, checked on the
  server.

### Adding Meme Hype content

A pack is one file in `backend/src/memehype/content/` listed in
`PACK_FILES` of `content/index.js`. It holds a palette and separate `16`
and `18` sections:

```js
situations: [[category, text], ...]
memes:      [[art, topCaption, bottomCaption, paletteKey, { image, weight, enabled }?], ...]
```

Records get stable ids (`<pack>.<rating>.s<n>` / `m<n>`) and every lookup
takes a rating, so a 16+ room can never receive an 18+ card. A meme may set
`image` to a picture URL; otherwise its emoji `art` is drawn. Use emoji from
Unicode 12 or earlier so cards render on older phones and Windows 10.

### Meme pictures

**Your own pictures:** drop a file named after the meme's id into
`backend/src/memehype/images/custom/` (`animals.16.m9.jpg`; jpg, jpeg, png,
webp or gif) and restart the server - it replaces whatever the card showed.
`npm run memes` (in `backend/`) lists every id with its current picture
source; `--missing` shows only memes without a picture and `--html` writes a
browsable `backend/meme-catalog.html`. The folder's README has the details,
including adding a new meme with `image: 'file.jpg'` in its pack file.

**Found photos:** some memes show a real photo from Wikimedia Commons (public domain, CC0,
CC BY or CC BY-SA only). The photos live in `backend/src/memehype/images/`
with `manifest.json` recording each photo's source, author and licence; the
lobby lists them under "Photo credits" (`GET /api/memehype/credits`), as
CC BY requires. A photo is tied to a fingerprint of its meme's content, so
editing a meme's captions drops its photo until a new one is found.

New photos are found with the Gemini API:

```bash
cd backend
GEMINI_API_KEYS=key1,key2 node scripts/find-meme-images.js --pack animals --rating 16 --limit 10
```

Gemini writes the search queries, every candidate passes a keyword
blocklist and a separate per-image safety check, and Gemini then picks the
best fit. The key is read from the environment only - never commit it.
**Look at every new photo yourself before shipping it**: the filters lower
the risk of an unsuitable picture, they do not remove it. To drop a photo,
delete its file and its manifest entry.

## Features

- **Real-time multiplayer** over Socket.io, up to 10 players per room, with reconnect support (a dropped connection gets a 10-minute grace period before the game auto-skips that player's turn).
- **Two game modes**: Classic (the familiar 40-tile board) and Metropolis (an 84-tile board with 20 property groups). New modes are added on the backend by registering a new board layout — the frontend picks them up automatically with no changes required.
- **Player accounts** (optional): register with just a nickname and password — no email, no personal information — or play as a guest with a temporary identity that only exists for that session. Registered accounts can upload an avatar photo.
- **Trading**: propose a trade with any other player (properties, money, or both, in either direction). Trades use an offer/accept model — nothing changes hands until the recipient explicitly accepts, and the server re-validates the whole trade at acceptance time, so a property that got mortgaged, sold, or traded away in the interim can't be used to defraud the other party.
- **For the Family**: a property owner can set a specific, fixed rent price for a specific other player, overriding the normal computed rent for that pairing only.
- **A board you can actually read**: the board is drawn at a fixed design size and shown through a free zoom/pan viewport — scroll to zoom at the cursor, drag to pan, pinch on touch, with a zoom readout and a fit-to-screen control. Zoom is per-player and local; it never touches game state. Tiles simplify themselves as you zoom out (a tile whose name would render smaller than it is readable shows its color group, its owner and its buildings instead), and hovering any tile gives its full details.
- **One place to act**: an action dock under the board always shows whatever the game is waiting for — roll, buy, end turn, jail options — plus the portfolio and trade screens, so no action has to be hunted for. Space or Enter fires the current primary action.
- **Illustrated board**: every square carries artwork drawn in its own group color — the buildings grow from cottages to skyscrapers as the price rises — and each player gets a classic playing piece (top hat, roadster, terrier, battleship…) derived from their color, so a token is recognisable on a crowded board and in every panel. A layout can also ship a real picture per square via `tile.image`, which takes precedence.
- **Per-player settings** (gear in the header): language, tile labels (auto/always/never), tile artwork, hover details, large tokens, zoom speed, activity log, animations. Stored locally, they change nothing for anyone else.
- Money changes flash over the player's own token on the board, so rent and salary are visible where you are already looking.
- Live chat and an in-game activity log — both in English and Russian.

## Project layout

```
landmark/
├── backend/            Node/Express + Socket.io game server (source of truth for all game rules)
│   ├── src/
│   │   ├── game/         GameManager (rules engine), GameState, board layouts, cards
│   │   ├── auth/         Session token signing/verification
│   │   ├── db/           SQLite persistence (rooms + accounts, separate databases)
│   │   ├── routes/       REST API (health, game modes, auth)
│   │   └── socket/       Socket.io event handlers
│   └── test/             9 test files: unit tests for the rules engine, plus real
│                         Socket.io integration tests that boot an actual server
├── frontend/            React + Vite + Tailwind client
│   └── src/
│       ├── components/   UI components (Board + BoardTile, ActionDock, TradeComposer,
│       │                  PropertyModal, ManagePropertiesModal, PlayerCard, ...)
│       ├── boardData.js  Board geometry + derived game facts (pure, layout-agnostic)
│       ├── hooks/        useSocket (game connection), useAuth (account session)
│       └── i18n/         Translations (en/ru) and related helpers
├── Dockerfile           Multi-stage build producing a single runtime image
├── docker-compose.yml   Local/production deployment with a persistent data volume
└── .env.example         Required environment variables for Docker Compose
```

## Running locally (without Docker)

Requires Node.js 18+.

```bash
# Backend
cd backend
npm install
npm test        # optional but recommended - runs the full test suite
npm run dev      # starts the game server on :4000 (nodemon, auto-restarts on change)

# Frontend, in a second terminal
cd frontend
npm install
npm run dev      # starts the Vite dev server on :5173, proxying /api, /avatars,
                  # and /socket.io to the backend on :4000
```

Then open `http://localhost:5173`. The dev server's proxy (see `frontend/vite.config.js`) is what lets the browser talk to a single origin during development even though two separate processes are running.

## Running with Docker

```bash
cp .env.example .env
# edit .env and set SESSION_SECRET (generate one with: openssl rand -hex 32)

docker compose up --build
```

This builds a single image (the frontend is built first, then its output is copied into the backend's `public/` directory, which the backend already serves as static files alongside its API and Socket.io endpoint) and runs one container on port 4000. Game rooms, accounts, and uploaded avatars persist in a named Docker volume (`landmark-data`) across restarts and rebuilds.

**A note on verification**: Docker itself was not available in the environment this project was built in, so the `docker build`/`docker compose up` commands above have not been run end-to-end. What has been verified directly is the exact runtime configuration the image produces — a single Node process, `NODE_ENV=production`, the frontend's build output copied into `backend/public/`, serving the SPA, static assets, the API, and handling a real registration — all through manual simulation of those same steps outside a container. If the actual `docker build` surfaces an issue, it's most likely to be in the Dockerfile's own syntax or the native-module build step for `better-sqlite3`, not in the application code itself, which is exercised by the rest of this README's setup and the test suite.

## Deploying to Railway

This repo is not yet a git repository — initialize one and push it to GitHub first (`git init`, commit, create a repo on GitHub, push), since Railway deploys from a connected GitHub repo (or via its CLI directly from a local checkout).

1. On [railway.app](https://railway.app), create a new project and choose "Deploy from GitHub repo" (or run `railway up` from the CLI inside this project's root directory).
2. Railway detects the `Dockerfile` at the repo root automatically and builds from it - no separate configuration file is needed for that part.
3. In the service's **Variables** tab, set `SESSION_SECRET` (generate one locally with `openssl rand -hex 32` and paste the value in - don't reuse the one in your local `.env`, generate a fresh one for production). `CLIENT_ORIGIN` can usually stay unset for a single Railway service serving both frontend and backend from the same domain.
4. **Do not set `PORT` yourself.** Railway assigns its own value for `PORT` at runtime and expects the container to bind to it - this project's server already does this correctly (`process.env.PORT || 4000` in `backend/src/index.js`), so nothing needs to change here, just don't override it with a fixed value in the Railway dashboard.
5. Add a **Volume** mounted at `/app/backend/data` so game rooms, accounts, and uploaded avatars survive redeploys - without this, Railway's filesystem is ephemeral per-deploy and the SQLite databases would silently reset every time you ship a change.
6. Once deployed, Railway gives the service a public URL automatically; the health check endpoint (`/api/health`) is already wired into the Dockerfile's `HEALTHCHECK` and dynamically checks whatever port the server actually bound to, so it stays correct regardless of which port Railway assigns.

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SESSION_SECRET` | Yes, in Docker Compose | none | Signs login session tokens. Set this explicitly for any deployment that should survive a restart without logging everyone out — left unset, the server generates a random secret on every startup. |
| `ADMIN_ACCOUNT_ID` | Recommended | none | The id of the account allowed into the admin panel, or several ids separated by commas (`id1,id2`). When set it overrides the database; without it, use `npm run make-admin -- <nickname>` (one admin). |
| `CREATOR_ACCOUNT_ID` | No | none | The Creator's account id(s), same format. Without it, use `npm run make-creator -- <nickname>` or the panel; while no Creator exists, administrators act as the Creator. |
| `DATA_DIR` | No | `backend/data` | Where the SQLite databases and avatars are stored. |
| `ECONOMY_MIN_MATCH_MS` | No | `60000` | Minimum length of a finished game for it to pay crowns (anti-farming). Only lower it for testing. |
| `FRONTEND_DIST` | No | `backend/public` | Directory of the built frontend the server serves. |
| `PORT` | No | `4000` | Port the server listens on. |
| `CLIENT_ORIGIN` | No | `*` | Restricts CORS and Socket.io to a specific origin. Set this to your real domain for a public deployment. |
| `NODE_ENV` | No | `development` | Standard Node environment flag. |
| `VITE_SERVER_URL` | No (frontend build-time only) | same origin | Only needed if the built frontend is ever served from a different origin than the backend API — not the case in the Docker setup above. |

Running the backend directly with `node src/index.js` (outside Docker Compose) does not require `SESSION_SECRET` to be set — it falls back to a random per-startup secret, fine for local development.

## Testing

The backend test suite (`cd backend && npm test`) runs 21 files, each against its own throwaway data directory (see `test/helpers/testEnv.js`), covering:
- Bunker (`test/bunker.test.js`): lobby limits, dealing without duplicates, places, card secrecy in every payload, turn order and reveal rules, discussion and host skips, voting (no self-vote, no double vote, candidates only), runoffs, no-exclusion ties and lots, timeouts, the end of the game and restarts, leaving mid-game, persistence, 300 random games to the end, and a game over the real socket.io wire
- Community (`test/community.test.js`): catalogue sanity (unique ids, price bands per rarity), `@` / `@@` mention parsing, the shop (balance, ownership, not-for-sale items), equipping and slot capacity, match rewards by place and table size, team wins, streaks, achievements and their items, paying each reward once, short-game and daily-cap guards, the leaderboard, room-chat mentions and emote ownership, direct and group conversations with receipts and unread counts, the REST locks, and live delivery over the messenger socket
- Cosmic Encounter engine (`test/cosmic.test.js`) and Cosmic Encounter over Socket.io (`test/cosmicSocket.test.js`): components and setup, the eight phases in order, attack vs attack (ships counted, ties to the defense), attack vs negotiate with compensation, deals made and failed, morph, wild and special destiny, your own colour, several allies and none, the Parasite, reinforcements, the warp and regroup, shared fifth-colony victories, running out of encounter cards, second encounters and the Machine, every race power, losing a power, every artifact, private payloads, timeouts and leaving, persistence and restart, 30 random bot games with every ship and card accounted for, and a three-client encounter over the real wire
- Catan engine (`test/catan.test.js`) and Catan over Socket.io (`test/catanSocket.test.js`): island geometry and layouts, setup order and the distance rule, production and the robber's block, a short bank, sevens with discards and theft, building costs, connections and piece limits, the Longest Road (including a road cut by a settlement) and the Largest Army, every development card, bank, harbour and player trades, victory on your own turn with hidden points, payload secrecy, timeouts, leaving, persistence and restart, 40 bot games of 2–4 players to a winner with resource conservation checked after every action, and a three-client game over the real wire
- Citadels engine: draft secrecy, the Assassin and Thief (secret targets, gold taken before the victim acts), King and crown order, income, building rules, Warlord vs Bishop/Keep, Magician, scoring, persistence, and 25 random 2–7 player games to the end
- Platform end-to-end over HTTP and Socket.io: guests cannot create or start games in any mode, seat and identity spoofing is refused, the admin API rejects anonymous and normal users, disabled/paused modes refuse new games without breaking running ones, finished games land in both players' statistics, admin kick/close, and blocking (login, old tokens, create, join) and unblocking
- Mafia engine and Mafia over Socket.io
- Board layout structural validation (every registered game mode)
- Full simulated games on both Classic and Metropolis boards (hundreds of turns)
- Bankruptcy, mortgage, and win-condition logic
- Movement/animation-path correctness
- 10-player room capacity
- Account registration/login and anti-spoofing (a logged-in player's identity can't be forged via the socket payload)
- Trading: both fraud-prevention unit tests and a real Socket.io integration test
- Custom pricing ("For the Family")

Several of these boot an actual Socket.io server and drive it with `socket.io-client`, rather than only testing the rules engine in isolation.

There is no automated frontend test suite checked into the repository; the frontend was verified throughout development using real-browser end-to-end tests (Playwright), but those scripts were development tools rather than a maintained suite.

## Extending the game

**Adding a new board layout / game mode**: create a new file in `backend/src/game/boardLayouts/` following the shape of `classic.js` or `metropolis.js` (a `board` array, a `sideLength`, and a `cardRoleTiles` map for how Chance/Community Chest cards resolve to specific tiles on that board), then register it in `backend/src/game/boardLayouts/index.js`. Nothing else needs to change — the frontend fetches the list of available modes from `/api/game-modes` at runtime and renders whatever comes back.

**Adding a new game action**: add a method to `GameManager` (the single source of truth for rules validation), a corresponding `game:*` event in `backend/src/socket/socketHandler.js`, and wire the client side through `frontend/src/hooks/useSocket.js`. Every existing action follows this same three-piece pattern.
