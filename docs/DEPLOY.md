# Running Assay

Assay has two independent parts. The public site never depends on the collector: if the
collector stops, the site keeps serving live prices and says how old its recorded history is.

```
browser ── /api/* ──> Vercel function (Frankfurt) ──> Binance Web3 RWA API     live prices
                            │
                            └──> data branch ──> recorded history, scorecard, coverage
                                     ▲
collector ── every 2 min ── publish ─┘
```

## The site — Vercel

Deploys automatically on every push to `main`. `vercel.json` sets everything; no environment
variables are needed.

- `npm run vercel-build` emits Vercel's Build Output directly: the static site plus one bundled
  function for `/api/*`.
- The function runs in **Frankfurt (`fra1`)**. Binance's Web3 API excludes the US, which is
  Vercel's default region.
- Run the exact deploy artifact locally: `npm run vercel-build && npm run vercel:local`.

Check it: `https://assay-woad.vercel.app/api/health` should report `"live": {"reachable": true}`.

## The collector

The collector records history and the scorecard, which need memory the stateless site doesn't
have. `sharesMultiplier` has no historical endpoint, so anything not recorded at the time is gone
for good — the site shows those gaps rather than hiding them.

```bash
npm run station
```

One process group: the collector (every 2 minutes), a local API on `:8787`, and a publish of the
recorded data to the [`data`](https://github.com/techbone/assay/tree/data) branch every 20
minutes. The site reads that branch. Ctrl-C stops everything.

**Networks that block `binance.com`.** Some resolvers answer NXDOMAIN for it. `station`
resolves Binance through public DNS by default (`ASSAY_DNS=1.1.1.1,8.8.8.8`); override the
variable to change servers.

### Keeping it running on a Mac

A `launchd` agent restarts the station after crashes and reboots:

```bash
cat > ~/Library/LaunchAgents/com.assay.station.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.assay.station</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$(pwd)/scripts/station.sh</string></array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$(command -v node)"):/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(pwd)/logs/station.log</string>
  <key>StandardErrorPath</key><string>$(pwd)/logs/station.log</string>
</dict></plist>
PLIST
launchctl load ~/Library/LaunchAgents/com.assay.station.plist
tail -f logs/station.log
```

A sleeping Mac pauses collection; `caffeinate -dimsu` prevents that.

### Moving it to an always-on machine

Any small Linux VM works (e.g. Oracle Cloud Always Free). The collector needs Node 22 and push
access to the repo, for publishing:

```bash
git clone git@github.com:techbone/assay.git && cd assay && npm ci
# copy data/assay.db across first to keep the history recorded so far
sudo tee /etc/systemd/system/assay.service >/dev/null <<UNIT
[Unit]
Description=Assay collector
After=network-online.target
[Service]
WorkingDirectory=$(pwd)
ExecStart=/bin/bash $(pwd)/scripts/station.sh
Restart=always
User=$(whoami)
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl enable --now assay
```

Run only one collector at a time. Two writing the same history would publish divergent data.

## Health

```bash
npm run health        # span, cycles, gaps over five minutes, uptime percentage
npm run scorecard     # the leaderboard, from local data
```

`https://assay-woad.vercel.app/api/health` reports whether the site can reach Binance and how old
the collector's recorded history is. The `ci` workflow runs typecheck, the test suite and the
Vercel build on every push.
