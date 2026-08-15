# Landmark — Online Multiplayer Property Trading Game

A real-time, browser-based, Monopoly-style board game for up to 10 players. You host the server (on your own computer or a VPS), share a room code or link, and everyone plays together from their browser — desktop or phone.

Built with **React + TailwindCSS** on the frontend and **Node.js + Express + Socket.io + SQLite** on the backend. The server is fully authoritative: it validates every dice roll, purchase, and payment, so clients can't cheat by tampering with their own money or position.

> **A note on naming and design:** this project uses original tile names, an original color palette, and the name "Landmark" rather than "Monopoly." The rules (buying property, paying rent, jail, bankruptcy, etc.) are the same well-known mechanics of the classic property-trading genre, but no Hasbro trademarks, board artwork, or copy have been used.

---

## Quick start (Docker — recommended)

This is the fastest way to get a server running for you and your friends.

**Requirements:** [Docker](https://docs.docker.com/get-docker/) and Docker Compose (bundled with Docker Desktop; on Linux, install the `docker-compose-plugin` package).

```bash
git clone <this-repo>
cd monopoly-game
docker compose up --build -d
```

That's it. Once it's up:

- **You (the host)** open `http://localhost:8080`
- **Friends on your network** open `http://<your-computer's-LAN-IP>:8080` (e.g. `http://192.168.1.42:8080`)
- **Friends over the internet** (if you're hosting on a VPS, or you've port-forwarded 8080 on your home router) open `http://<your-public-IP-or-domain>:8080`

To stop the server: `docker compose down` (your active games are preserved — see [Persistence](#persistence--reconnecting) below). To stop it and **wipe all saved game data**: `docker compose down -v`.

To view logs: `docker compose logs -f`. To rebuild after pulling code changes: `docker compose up --build -d` again.

---

## Quick start (without Docker)

Useful for local development, or if you'd rather not use Docker at all.

**Requirements:** Node.js 18 or newer, npm.

### 1. Start the backend

```bash
cd backend
npm install
npm start
```

The backend listens on port `4000` by default (`http://localhost:4000/api/health` should return `{"ok":true,...}`).

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on port `5173` and proxies API/Socket.io requests to `localhost:4000` automatically (see `vite.config.js`). Open `http://localhost:5173`.

### 3. Playing with friends without Docker

For friends on your LAN to join, they need to reach your backend's actual address, not `localhost`. Two ways to do this:

- **Simplest:** build the frontend for production and point it at your LAN IP:
  ```bash
  cd frontend
  VITE_SERVER_URL=http://<your-LAN-IP>:4000 npm run build
  npm run preview -- --host
  ```
  Friends then open `http://<your-LAN-IP>:4173`.
- **Or:** just use Docker Compose instead — it handles this automatically via nginx proxying, which is why it's the recommended path above.

---

## How to actually host a game for friends

1. Start the server (Docker Compose, or the manual steps above).
2. Find your machine's address:
   - **Same WiFi/LAN as your friends:** your local IP, e.g. `192.168.1.42`. On Windows, run `ipconfig`; on macOS/Linux, run `ifconfig` or `ip addr`.
   - **Hosting on a VPS, or want friends to join over the internet:** your VPS's public IP or domain name. If hosting from your home network, you'll need to forward port `8080` (Docker) on your router to your machine.
3. Open `http://<that-address>:8080` yourself, click **"Host a new game"**, enter a nickname, and you'll get a 5-character room code and a shareable invite link.
4. Send the room code (or the link, which pre-fills the code) to up to 9 friends. They open the same address, click **"Join with a code"**, and enter it.
5. Once everyone's in the lobby (2–10 players), the host clicks **"Start game."**

---

## Gameplay features

- Real-time sync over WebSocket (Socket.io) — every action (dice roll, purchase, rent payment, trade of turn) appears instantly for all players.
- Full rule set: buying properties/railroads/utilities, rent (including monopoly double-rent and railroad/utility scaling), building houses and hotels with the even-building rule, mortgaging, Chance and Community Chest decks, Jail (pay, roll doubles, or use a card), bankruptcy, and a last-player-standing win condition.
- Server-side validation on every action — the client can only ever request an action ("I want to buy this tile"), never directly set its own money or position.
- Room system: create a room, get a code, wait for players, host-only game start.
- Player chat, nicknames, and per-player colors.
- Animated dice rolls and player token movement around the board.
- Synthesized sound effects (dice, purchase, collecting/paying money, bankruptcy) — generated with the Web Audio API, so there are no external audio files to license or fetch.
- **Reconnection:** if you close the tab, lose WiFi, or refresh the page mid-game, reopening the same URL automatically rejoins your seat with your money and properties intact. If it's your turn when you disconnect, the game waits up to 10 minutes before auto-skipping you so it doesn't stall for everyone else.
- **Persistence:** game state is saved to a SQLite database on every change, so an active game survives a server restart (see below).
- Responsive layout — playable on a phone as well as a desktop.

---

## Persistence & reconnecting

Every room is saved to a SQLite database (`backend/data/monopoly.db`, or the `landmark-data` Docker volume) after every state change, including an immediate WAL checkpoint — this means active games survive not just a graceful restart, but also a hard crash or `docker kill`, without needing a clean shutdown to happen first.

If you restart the server (`docker compose restart`, or just re-running `npm start`), any in-progress rooms are reloaded from disk. Players who had that room's URL/local storage can simply reopen it and their seat is restored automatically.

---

## Project structure

```
monopoly-game/
├── backend/
│   ├── src/
│   │   ├── game/
│   │   │   ├── Board.js          # 40-tile board layout, rents, groups
│   │   │   ├── cards.js          # Chance / Community Chest decks
│   │   │   ├── GameState.js      # Serializable game state container
│   │   │   ├── GameManager.js    # All game rules, fully server-validated
│   │   │   └── RoomManager.js    # Tracks active rooms, syncs to DB
│   │   ├── db/database.js        # SQLite persistence layer
│   │   ├── socket/socketHandler.js  # Real-time event layer (Socket.io)
│   │   ├── routes/api.js         # REST: health check, room lookup
│   │   └── index.js              # Server entry point
│   ├── test/                     # Automated test suite (see below)
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/           # Board, Dice, Chat, Lobby, GameUI, etc.
│   │   ├── hooks/useSocket.js    # Connection, identity, reconnection logic
│   │   ├── boardData.js          # Client-side board display data
│   │   ├── sounds.js             # Web Audio API sound effects
│   │   └── App.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── nginx.conf                # Used by the Docker build to serve + proxy
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Running the test suite

The backend has an automated test suite covering the full rules engine, real-time sync, 10-player capacity, and persistence:

```bash
cd backend
npm install
npm test
```

This runs three suites:
- `test/integration.test.js` — two simulated players play a full game via real Socket.io connections: room creation/joining, host-only start, dice rolling, buying, rent, Chance/Community Chest, debt resolution via mortgaging, bankruptcy, chat, and reconnection.
- `test/capacity.test.js` — verifies exactly 10 players can join a room, would-be 11th player is rejected, and a full 10-player game plays correctly through real turn-order wraparound.
- `test/bankruptcy.test.js` — deterministic checks of bankruptcy, mortgage/unmortgage pricing, and win-condition logic.

---

## Configuration reference

### Backend environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Port the backend listens on |
| `NODE_ENV` | `development` | `production` disables verbose dev logging |
| `CLIENT_ORIGIN` | `*` | CORS origin allowed to connect (set to your frontend's exact URL in a stricter deployment) |

### Frontend build-time variable

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERVER_URL` | same-origin | Set this if the frontend is served from a different host/port than the backend (not needed with the Docker Compose setup, since nginx proxies same-origin) |

---

## Architecture notes

- **Server-authoritative by design.** Every gameplay action is a Socket.io event carrying only an *intent* (e.g. `game:buyProperty` with a `tileId`). `GameManager` on the backend is the only code that ever mutates money, position, or ownership, and it re-validates the full legality of the action (whose turn it is, whether the tile is actually purchasable, whether there's enough money, whether it's actually the pending decision) before doing so. The client only renders whatever authoritative state the server broadcasts back.
- **Full-state broadcast, not diffs.** After any successful action, the server sends the entire current game state to everyone in the room. For a 40-tile board with up to 10 players this stays a few KB, so this keeps the sync logic simple and avoids an entire class of "client state drifted from server state" bugs that incremental patching can introduce.
- **Reconnection identity.** Each browser generates a persistent random ID (stored in `localStorage`) the first time it's used. Rejoining a room with the same ID — whether from a dropped connection, a page reload, or reopening the tab later — is treated by the server as the same seat, not a new player.


