#!/bin/sh
set -e

# The /app/data directory may be a freshly-mounted Railway volume owned by
# root, which shadows the ownership baked into the image at build time.
# Fix ownership here, at container start (after the volume is mounted),
# then drop privileges to the unprivileged "monopoly" user before running
# the actual app.
mkdir -p /app/data
chown -R monopoly:monopoly /app/data

exec gosu monopoly "$@"
