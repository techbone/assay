# Assay

**The real price of a tokenized stock.**

**Live:** deployed on Vercel — prices fetched live from Binance on every visit.

BNB Hack: Tokenized Stocks Edition · submissions lock 11 Oct 2026, 12:00 UTC.

---

On BNB Smart Chain there are **667 tokenized equity tokens covering 512 unique tickers**. Thirty-seven
mega-caps — NVDA, TSLA, AAPL, MSFT, SPY, QQQ, MSTR, COIN — carry three different wrappers at once,
from three issuers, at three different prices.

None of those prices are comparable, because each token carries a `sharesMultiplier`: how many
underlying shares one token represents. It drifts upward as dividends reinvest, and jumps on splits
and fractionalisation. Observed range on BSC: **0.0667 to 10.03**.

So the obvious product — compare the prices, show the cheapest — is wrong. Sometimes by 10x.

Assay computes one dividend-adjusted reference price per ticker, scores how much each wrapper can be
trusted, and says which part of an apparent premium is real:

> *NVDAon looks 18 bp rich. 17 bp of that is accrued distribution. 1 bp is real.*

Measured across 84 live tickers, the adjustment takes worst-case basis error from **533 bp to 5.3 bp**.

## How it runs

```
browser ── /api/* ──> Vercel function (fra1) ──> Binance Web3 RWA API     live prices
                            │
                            └──> data branch (raw.githubusercontent) ──>   recorded history,
                                         ▲                                  scorecard, coverage
collector (laptop / Oracle) ── publish ──┘
```

Live prices need no memory, so they are computed on demand, statelessly, through the same
engine the tests pin. The scorecard and basis history need memory, so they are recorded by
the collector and published to the `data` branch every 20 minutes. If the collector stops,
the site keeps serving live prices and says how old its recorded history is.

## Status

| Milestone | State |
|-----------|-------|
| M0 Foundation | **done** |
| M1 Reference engine | **done** — normalize, validate, trust, assay, decompose |
| M2 Collector (24/7) | **done** — deployed on Fly.io, 76k+ observations |
| M3 Web reports | in progress — API + UI live locally |
| M4 Off-hours scorecard · M5 Execution · M6 Agent · M7 Submission | queued |

**82 regression tests, all green.**

See [MILESTONES.md](MILESTONES.md) for the live tracker and [ARCHITECTURE.md](ARCHITECTURE.md) for design.
[DEVEX.md](DEVEX.md) is the Developer Experience Report, written continuously.

## Run

```bash
npm install
npm test          # 82 regression tests against live-captured fixtures
npm run typecheck
npm run collect   # start the 24/7 collector
npm run api       # read API + built site on :8787
npm run web       # UI dev server on :5173 (proxies /api)
npm run web:build # build the site so the API serves it
npm run health    # collection coverage and gaps
npm run analyze   # corpus statistics
npm run vercel-build && ASSAY_DNS=1.1.1.1,8.8.8.8 npm run vercel:local
                  # the exact Vercel artifact, served locally
```

## Layout

```
src/binance/     typed client for the Binance Web3 RWA API (public, no key)
src/reference/   the engine: normalize, validate, trust, assay, decompose
src/store/       append-only SQLite; raw observations stay recomputable
src/collector/   24/7 poller, concurrency-pooled, incremental writes
src/api/         read layer + plain node:http server
web/             Vite + React UI
scripts/         snapshot capture, corpus analysis, health, reclassify
tests/           31 golden cases + 13 corpus invariants + 17 collector/pool
```
