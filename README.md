# Landmark

A real-time, browser-based board game platform: **Monopoly** (up to 10 players, two board sizes, trading and "For the Family" pricing), **Mafia** (4–15 players, secret roles, night and day) and **Citadels** (2–7 players, secret role draft and city building). Registered players host games; guests join by code or invite link; one administrator account runs the platform from an admin panel.

## Accounts, permissions and the admin panel

- **Registered players** create rooms in every game, invite others (room code or `/?room=CODE` link), start games, and get a profile page (`/profile`) with games played, wins, losses, win rate, time played, per-game and Citadels statistics, recent games and achievements — all computed from the server's match history.
- **Guests** can only join an existing room by code or link. Creating or starting a room is refused by the server (`GUEST_CANNOT_CREATE` / `GUEST_CANNOT_START`), not just hidden in the UI. A guest's seat is protected by a secret key kept in their browser, so knowing a guest's player id is not enough to take their seat, and a guest can never use a registered account's id.
- **The administrator** is exactly one account. Either set `ADMIN_ACCOUNT_ID` to that account's id (shown on its profile page) — then it is the only admin regardless of the database — or run `npm run make-admin -- <nickname>` in `backend/` on the server. Every `/api/admin/*` request re-checks the account, so a normal user opening `/admin` gets "access denied" from the server.
- **Admin panel** (`/admin`): platform statistics (users, active/blocked users, guests, players online, games and lobbies — total/active/finished, games per day/week/month, mode popularity, average players and duration, Citadels statistics, recent games, audit trail); every live lobby with its players, invite link, stage and age, with "remove player" and "close lobby"; every user with search, status/activity filters and full statistics, with **block** (reason required, explicit confirmation, optionally removing them from their rooms — who blocked and when is stored) and **unblock**; and game modes, each of which can be enabled, disabled or paused for a set time. Disabling a mode refuses new games only — games already running are never interrupted.
- A blocked account cannot log in, cannot use an old token, cannot create or join rooms, and its open connections are closed immediately.

Platform history lives in `backend/data/platform.db` (`rooms_log`, `matches`, `match_players`, `game_modes`, `admin_actions`); accounts in `accounts.db` (migrated in place — existing accounts keep working); live rooms in `monopoly.db` as before.

## Citadels

Each round players pick a role in secret, starting with the crown holder — only the current picker sees the pool, and a role stays hidden until the engine calls it. Roles are then called in order (Assassin, Thief, Magician, King, Bishop, Merchant, Architect, Warlord); each holder takes 2 gold or draws a district card, uses their power, collects income from districts of their type and builds. The Assassin's and Thief's targets are secret until the victim's role is called; the Thief takes the gold before the victim can act; the King takes the crown and picks first next round. Districts are residential, religious, trade, military or special (Dragon Gate, University, Library, Observatory, Smithy, Laboratory, School of Magic, Keep, Great Wall, Haunted Quarter). The game ends after the round in which someone completes a city; the score is district costs, +3 for all five types, +4 for finishing first (+2 for finishing later).

Roles are data in `backend/src/citadels/roles.js` (rank, income type, crown, build limit, …) with active powers in `abilities.js`; districts are data in `districts.js`. The engine (`CitadelsGame.js`) validates every action against server state and builds a separate payload per player, so hands, the draft pool, unrevealed roles and secret targets never reach anyone else's browser.

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
| `ADMIN_ACCOUNT_ID` | Recommended | none | The id of the one account allowed into the admin panel. When set it overrides the database; without it, use `npm run make-admin -- <nickname>`. |
| `DATA_DIR` | No | `backend/data` | Where the SQLite databases and avatars are stored. |
| `FRONTEND_DIST` | No | `backend/public` | Directory of the built frontend the server serves. |
| `PORT` | No | `4000` | Port the server listens on. |
| `CLIENT_ORIGIN` | No | `*` | Restricts CORS and Socket.io to a specific origin. Set this to your real domain for a public deployment. |
| `NODE_ENV` | No | `development` | Standard Node environment flag. |
| `VITE_SERVER_URL` | No (frontend build-time only) | same origin | Only needed if the built frontend is ever served from a different origin than the backend API — not the case in the Docker setup above. |

Running the backend directly with `node src/index.js` (outside Docker Compose) does not require `SESSION_SECRET` to be set — it falls back to a random per-startup secret, fine for local development.

## Testing

The backend test suite (`cd backend && npm test`) runs 15 files, each against its own throwaway data directory (see `test/helpers/testEnv.js`), covering:
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
