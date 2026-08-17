# Frontend Dockerfile
# Multi-stage: build the static React bundle with Vite/Node, then serve it
# with a minimal nginx image. On Railway, frontend and backend are separate
# services with their own public URLs, so the frontend talks to the backend
# directly over its public URL. Vite bakes VITE_* variables in at BUILD time,
# not runtime, so it must arrive as a Docker build ARG - Railway forwards
# service Variables into `docker build` automatically, but only for ARGs
# that are actually declared here.

FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
