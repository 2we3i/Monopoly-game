# Landmark

A real-time, browser-based property-trading board game for up to 10 players — a Monopoly-style game with a couple of twists: a choice of board sizes, per-player trading with server-enforced anti-fraud checks, and "For the Family" custom rent pricing between specific players.

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
| `PORT` | No | `4000` | Port the server listens on. |
| `CLIENT_ORIGIN` | No | `*` | Restricts CORS and Socket.io to a specific origin. Set this to your real domain for a public deployment. |
| `NODE_ENV` | No | `development` | Standard Node environment flag. |
| `VITE_SERVER_URL` | No (frontend build-time only) | same origin | Only needed if the built frontend is ever served from a different origin than the backend API — not the case in the Docker setup above. |

Running the backend directly with `node src/index.js` (outside Docker Compose) does not require `SESSION_SECRET` to be set — it falls back to a random per-startup secret, fine for local development.

## Testing

The backend test suite (`cd backend && npm test`) runs 9 files covering:
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
