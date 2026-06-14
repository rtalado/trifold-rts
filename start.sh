#!/bin/sh
# Trifold RTS — launch the local game server, then open the browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is required to run the game server."
  echo "  Install it from https://nodejs.org  then run ./start.sh again."
  echo
  exit 1
fi
echo "Starting the Trifold RTS server..."
( sleep 1; { xdg-open http://localhost:8080 || open http://localhost:8080; } >/dev/null 2>&1 ) &
exec node server.js
