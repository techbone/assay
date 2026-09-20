# Deploying the collector

The collector must run continuously from now until judging ends (23 Oct). Gaps cannot be
backfilled: `sharesMultiplier` has no historical endpoint, so a quote not captured at the time
is gone. Uptime here is the scorecard's credibility.

## Local (stopgap only)

```bash
npm run collect          # 120s interval, data/assay.db
npm run health           # exits non-zero if the last cycle is >6 min old
```

A laptop sleeps and closes lids. This is fine for the first hours; it is not fine for three weeks.

## Always-on

A single 256MB instance is enough — one cycle is ~230 HTTP calls in ~50s, and 21 days of
2-minute polling is roughly 3.5M rows / ~400MB of SQLite.

```bash
docker build -t assay-collector .
docker run -d --restart=always -v assay-data:/app/data --name assay assay-collector
```

On Fly.io or Railway, mount a persistent volume at `/app/data` and set the restart policy to
always. The process is deliberately crash-tolerant — a failed cycle is logged and the loop
continues — but the supervisor must restart the process itself if it dies.

## Verifying

```bash
npm run health -- data/assay.db
```

Reports span, cycle count, gaps over five minutes, and an uptime percentage. Gaps are recorded
and surfaced rather than hidden: the scorecard states its own coverage.
