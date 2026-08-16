# Backend Dockerfile
# Multi-stage build: install deps (including native better-sqlite3 build
# tooling) in one stage, then copy into a slim runtime image so the final
# image doesn't carry build-essential/python around unnecessarily.

FROM node:20-bookworm-slim AS builder

# better-sqlite3 compiles a native addon at install time, so build tools
# are needed here (but not in the final runtime image).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Data directory for the SQLite file - mounted as a volume in
# docker-compose.yml so game state survives container recreation, not just
# process restarts within the same container.
RUN mkdir -p /app/data

# Run as a non-root user for defense in depth
RUN groupadd -r monopoly && useradd -r -g monopoly monopoly \
    && chown -R monopoly:monopoly /app
USER monopoly

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
