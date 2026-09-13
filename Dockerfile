# Landmark - single-image build.
#
# The backend already serves the built frontend as static files from
# backend/public/ and answers /api, /avatars, and the Socket.io handshake
# on the same port - so a single container running only the backend, with
# the frontend's build output copied into place, is correct here. No
# reverse proxy, no second container, no CORS between them.

# ---- Stage 1: build the frontend ----
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: install backend production dependencies ----
FROM node:20-slim AS backend-deps
WORKDIR /app/backend
# better-sqlite3 is a native addon and needs build tools present during
# `npm ci` even though the resulting compiled binary is what actually
# ships - installing python3/make/g++ only in this intermediate stage
# keeps the final image from carrying a compiler toolchain it never
# needs again after this step.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ---- Stage 3: final runtime image ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend

# A non-root user to run the server as - data/ (SQLite files + uploaded
# avatars) is the only directory this process needs write access to.
RUN groupadd --system landmark && useradd --system --gid landmark --home /app landmark

COPY backend/ ./
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY --from=frontend-build /app/frontend/dist ./public

RUN mkdir -p /app/backend/data \
    && chown -R landmark:landmark /app/backend

USER landmark

EXPOSE 4000

# A plain HTTP GET against the existing health endpoint, run from inside
# the container - no extra tooling (curl/wget aren't in the slim base
# image) needed since Node itself can make the request. Uses the shell
# form (not exec-array form) specifically so ${PORT:-4000} actually
# expands - Railway assigns its own PORT value at runtime rather than
# using whatever is hardcoded here, and the server itself already
# correctly binds to process.env.PORT (see src/index.js) - a healthcheck
# that only ever probed a hardcoded 4000 would report the container as
# unhealthy on Railway even while it's serving real traffic correctly on
# whatever port Railway actually assigned.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
