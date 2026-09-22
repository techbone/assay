#!/bin/bash
# Runs the collector and the read API in one container, sharing one SQLite file
# (schema.sql sets WAL mode, which is what makes one writer + one reader safe here).
# If either dies, this script exits and the platform's restart policy takes over -
# that boundary matters more than in-process supervision for an always-on deploy.
set -e

npx tsx src/collector/run.ts --interval 120 --db /app/data/assay.db &
COLLECTOR_PID=$!

npx tsx src/api/server.ts --port 8787 --db /app/data/assay.db --web /app/web/dist &
API_PID=$!

trap 'kill -TERM $COLLECTOR_PID $API_PID 2>/dev/null' TERM INT

wait -n $COLLECTOR_PID $API_PID
EXIT_CODE=$?
echo "one process exited (code $EXIT_CODE) - stopping the other and exiting"
kill -TERM $COLLECTOR_PID $API_PID 2>/dev/null
wait
exit $EXIT_CODE
