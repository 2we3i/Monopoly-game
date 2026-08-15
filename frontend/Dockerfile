# Frontend Dockerfile
# Multi-stage: build the static React bundle with Vite/Node, then serve it
# with a minimal nginx image. Since nginx proxies /socket.io and /api to the
# backend container (see nginx.conf), the frontend is built WITHOUT a
# VITE_SERVER_URL override - it talks same-origin, and nginx routes to the
# backend service by its docker-compose service name.

FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
