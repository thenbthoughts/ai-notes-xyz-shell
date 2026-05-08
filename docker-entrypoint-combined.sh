#!/usr/bin/env bash
set -euo pipefail

OPENCODE_PORT="${OPENCODE_PORT:-4096}"
# Keep Puppeteer aligned with the Docker image's system Chrome setup.
export CHROME_BIN="${CHROME_BIN:-/usr/bin/google-chrome-stable}"
export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-$CHROME_BIN}"

if command -v opencode >/dev/null 2>&1; then
  opencode serve --hostname 0.0.0.0 --port "${OPENCODE_PORT}" &
else
  echo "WARNING: opencode not found in PATH; skipping OpenCode serve."
fi

exec "$@"
