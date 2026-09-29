#!/bin/bash
# The whole local stack in one terminal: collector, read API, and periodic publishing.
#
#   npm run station
#
# Ctrl-C stops everything. Output is prefixed so one pane shows what each part is doing.
set -uo pipefail
cd "$(dirname "$0")/.."

DB="${ASSAY_DB:-data/assay.db}"
# Resolve Binance through public DNS: some local resolvers answer NXDOMAIN for
# binance.com, which silently empties every collection cycle.
export ASSAY_DNS="${ASSAY_DNS:-1.1.1.1,8.8.8.8}"
PUBLISH_EVERY_SEC="${PUBLISH_EVERY_SEC:-1200}"   # 20 minutes

mkdir -p logs

# Two collectors writing the same SQLite file would interleave divergent histories, so
# take over from anything already running rather than racing it.
if pgrep -f "collector/run.ts" >/dev/null 2>&1; then
  echo "stopping an existing collector before taking over..."
  pkill -f "collector/run.ts" 2>/dev/null
  sleep 3
fi
if pgrep -f "api/server.ts" >/dev/null 2>&1; then
  pkill -f "api/server.ts" 2>/dev/null
  sleep 1
fi

prefix() { while IFS= read -r line; do printf '%s %s\n' "$1" "$line"; done; }

echo "assay station"
echo "  db        $DB"
echo "  dns       $ASSAY_DNS"
echo "  api       http://localhost:8787"
echo "  publish   every $((PUBLISH_EVERY_SEC / 60)) min"
echo "  stop      Ctrl-C"
echo

npx tsx src/collector/run.ts --interval 120 --db "$DB" 2>&1 | prefix "[collect]" &
COLLECTOR=$!

npx tsx src/api/server.ts --port 8787 --db "$DB" 2>&1 | prefix "[api]    " &
API=$!

(
  # Give the collector a cycle before the first publish so the site is never born empty.
  sleep 90
  while true; do
    ./scripts/publish.sh 2>&1 | prefix "[publish]"
    sleep "$PUBLISH_EVERY_SEC"
  done
) &
PUBLISHER=$!

cleanup() {
  echo
  echo "stopping..."
  kill -TERM $COLLECTOR $API $PUBLISHER 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Supervise: if any part dies, stop the rest and exit non-zero so launchd (or systemd)
# restarts the whole station. Waiting on all children instead left a live shell with a
# dead collector - which looks healthy to a supervisor while recording nothing.
# (macOS ships bash 3.2, which has no `wait -n`, hence the polling.)
while kill -0 $COLLECTOR 2>/dev/null && kill -0 $API 2>/dev/null && kill -0 $PUBLISHER 2>/dev/null; do
  sleep 5
done
echo "a station process exited - stopping the rest so the supervisor restarts everything"
kill -TERM $COLLECTOR $API $PUBLISHER 2>/dev/null
wait 2>/dev/null
exit 1
