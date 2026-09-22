#!/bin/bash
# The whole local stack in one terminal: collector, read API, and periodic publishing.
#
#   npm run station
#
# Ctrl-C stops everything. Output is prefixed so one pane shows what each part is doing.
set -uo pipefail
cd "$(dirname "$0")/.."

DB="${ASSAY_DB:-data/assay.db}"
PUBLISH_EVERY_SEC="${PUBLISH_EVERY_SEC:-1200}"   # 20 minutes

mkdir -p logs
prefix() { while IFS= read -r line; do printf '%s %s\n' "$1" "$line"; done; }

echo "assay station"
echo "  db        $DB"
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

wait
