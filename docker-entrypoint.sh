#!/bin/sh
# Starts the server as the unprivileged `landmark` user.
#
# Hosts like Railway mount the data volume owned by root, so a process
# that starts as `landmark` cannot create the SQLite files in it. The
# container therefore starts as root just long enough to hand
# /app/backend/data to `landmark`, then drops privileges for good before
# the server runs. If the container was started as a non-root user in the
# first place, there is nothing to fix and the command runs as-is.
set -e

DATA_DIR=/app/backend/data

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R landmark:landmark "$DATA_DIR"
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=landmark --regid=landmark --init-groups -- "$@"
  fi
  # Never refuse to start over a missing tool - run as-is, but say so.
  echo "docker-entrypoint: setpriv not found, starting as root" >&2
fi

exec "$@"
