# Deploying Assay

The collector must run continuously from now until judging ends (23 Oct). Gaps cannot be
backfilled: `sharesMultiplier` has no historical endpoint, so a quote not captured at the time
is gone. Uptime here is the scorecard's credibility.

**Laptop status:** two full outages in two days (9.5h + 18h lost). `launchd` now auto-restarts
the local processes if killed, but a laptop sleep/lid-close still pauses collection. This is why
it needs a real host.

## What's containerized

One image, two processes, one shared SQLite file (`start.sh`):
- the collector, polling every 120s
- the read API on :8787, serving both `/api/*` and the built React site

WAL mode (set in `src/store/schema.sql`) is what makes one writer + one reader safe in the same
file without a separate database server. If either process dies, `start.sh` exits and the
platform's restart policy brings the whole container back — verified locally: `docker build`,
run, health-checked, killed, confirmed to report `healthy` again after Fly-style restart logic.

## Deploy to Fly.io

`flyctl` is installed (`~/.fly/bin`, already on PATH via `~/.zshrc`). `fly.toml` is written:
`shared-cpu-1x` / 512MB (bumped from the original 256MB estimate — two Node processes plus
better-sqlite3's native bindings want the headroom), a 1GB volume at `/app/data`, and an HTTP
health check on `/api/health`.

```bash
cd /Users/muhammadmusa/Workspace/Startups/assay

fly auth login                     # opens a browser - only step that needs you

fly apps create assay-hackathon    # if the name is taken, edit `app = ` in fly.toml to match
fly volumes create assay_data --region iad --size 1 -a assay-hackathon -y

fly deploy                         # builds the Dockerfile and ships it
fly status                         # confirm the machine is running
fly logs                           # watch the collector cycle live
```

After it's up:

```bash
curl https://assay-hackathon.fly.dev/api/health
```

`ok: true` and a low `ageMin` means it's healthy. That URL is also the one to put in the
submission and to check back into through judging (12–23 Oct).

## Migrating existing history

The laptop's `data/assay.db` already holds real collected history (gappy, but real - don't
discard it). Upload it into the volume once the app exists, before or right after first deploy:

```bash
fly ssh console -a assay-hackathon -C "mkdir -p /app/data"
fly ssh sftp shell -a assay-hackathon <<< $'put data/assay.db /app/data/assay.db\nbye'
fly apps restart assay-hackathon
```

## Verifying

```bash
curl -s https://assay-hackathon.fly.dev/api/health | python3 -m json.tool
```

Or from the repo, pointed at a copy of the volume:

```bash
npm run health
```

Reports span, cycle count, gaps over five minutes, and an uptime percentage. Gaps are recorded
and surfaced rather than hidden — the scorecard states its own coverage.

## Local fallback (stopgap only, not for the remaining ~20 days)

```bash
npm run collect          # 120s interval, data/assay.db
npm run health            # exits non-zero if the last cycle is >6 min old
```

`launchd` agents (`com.assay.collector`, `com.assay.api` in `~/Library/LaunchAgents/`) keep these
alive locally through crashes, but not through sleep. Once Fly is confirmed healthy, these should
be unloaded (`launchctl unload ~/Library/LaunchAgents/com.assay.*.plist`) so there is one source
of truth instead of two collectors writing possibly-diverging history.
