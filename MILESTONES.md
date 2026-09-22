# Assay — Milestone Tracker

**Build window:** 16 Sep – **11 Oct 2026, 12:00 UTC** (hard lock)
**Today:** 21 Sep 2026 · **20 days remain**
**Judging:** 12–23 Oct · **Winners:** week of 26 Oct

Status key: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked

---

## M0 — Foundation `[x]` **DONE** · 20 Sep

| | Task |
|-|------|
|`[x]`| Hackathon verified: dates, prizes, rubric, restricted regions (Nigeria **not** restricted) |
|`[x]`| Thesis validated against **live** data before writing product code |
|`[x]`| Universe snapshot captured — 667 BSC tokens / 512 tickers / 37 tri-wrapper |
|`[x]`| Tri-wrapper price snapshot captured as regression fixture |
|`[x]`| `ARCHITECTURE.md` written |
|`[x]`| Repo + milestone tracker |
|`[x]`| Typed API client (`src/binance`) — all 5 endpoints |
|`[x]`| Vitest harness + **38 regression tests, all green** |
|`[ ]`| **Register for the hackathon · join builder Telegram** ← only open M0 item, yours to do |

**Exit criteria:** `pnpm test` green against frozen fixtures; client can fetch all 5 endpoints.

---

## M1 — Reference engine `[x]` **DONE** · 20 Sep · ★ core IP ★

| | Task |
|-|------|
|`[x]`| `normalize` — adjusted = price / sharesMultiplier |
|`[x]`| `validate` — corrupt multipliers, non-TRADING, **staleness, outliers** |
|`[x]`| `trust` — liquidity · freshness · metadata agreement → [0,1] |
|`[x]`| `assay` — trust-weighted median + confidence band |
|`[x]`| `decompose` — naive basis = multiplier effect + true basis |
|`[x]`| **Regression suite** — 28 golden + 10 corpus invariants |

**Exit criteria — all enforced by test, not by eye:**
- `[x]` Ondo adjusted basis: **max 5.3 bp across all 84 corpus tickers** (naive max 533.4 bp)
- `[x]` `NFLXx` **rejected** (corrupt 10x multiplier)
- `[x]` `TQQQx` **rejected** (corrupt 2x multiplier)
- `[x]` xStocks score median trust **0.04** vs Ondo 0.62 — excluded from the price by weight
- `[x]` Invariant: assay price ∈ [min, max] of surviving quotes **off-tape**; venue reference wins in RTH
- `[x]` Staleness detection — `ticksSinceChange` from the collector feeds `trustScore` and `STALE_QUOTE`
- `[x]` Outlier rule — rejects 19 quotes, **all xStocks, zero false positives** on Ondo/bStock

---

## M2 — Collector live 24/7 `[x]` **DONE** · 22 Sep · https://assay-hackathon.fly.dev

| | Task |
|-|------|
|`[x]`| SQLite schema — append-only raw snapshots |
|`[x]`| Poller: dynamic + status (120 s) · universe (1 h) · **49.9 s/cycle, 0 errors** |
|`[x]`| Deployed to Fly.io — collector + API in one container, 1GB volume, health checks passing |
|`[ ]`| Backfill history from `kline` — deferred to M4, forward history is accumulating |
|`[x]`| Uptime/heartbeat check — `npm run health`, gaps surfaced not hidden |

> **Scheduling note:** this milestone gates the scorecard's credibility. Every day not collected is
> evidence permanently lost. Ship it crude and early — raw snapshots are re-processable once the
> engine improves. Do not wait for M1 to be perfect.

**Exit criteria:** `[~]` ≥48 h unbroken. Laptop history (76,982 observations, 28 gaps) migrated onto Fly. Uptime clock restarts from 22 Sep 11:07 UTC — gaps before that are permanent and will be stated on the scorecard rather than hidden.

---

## M3 — Assay reports (web) `[~]` · target 26–29 Sep · **started 21 Sep, 5 days early**

| | Task |
|-|------|
|`[x]`| Vite + React app (Next.js dropped — no SSR need, one container with the collector) |
|`[x]`| Ticker page: assay price, band, per-wrapper trust, basis decomposition |
|`[x]`| Hero chart: naive vs adjusted basis, hand-drawn SVG, gap = phantom premium |
|`[x]`| Universe table — 117 tickers ranked by phantom premium |
|`[x]`| Public read API — `/api/{summary,tickers,ticker/:t,history/:t,health}` |

**Exit criteria:** `[~]` needs your eyes — open `http://localhost:8787` and judge it cold.

Still open: deploy publicly, session ribbon on the chart, and a permanent link per ticker.

---

## M4 — Off-hours mark + scorecard `[ ]` · target 30 Sep – 2 Oct

| | Task |
|-|------|
|`[ ]`| Session regime machine (RTH / offhours / closed) |
|`[ ]`| Off-hours mark + confidence band |
|`[ ]`| Crypto-beta overlay for MSTR · COIN · HOOD · BMNR · IREN |
|`[ ]`| Scorecard: mark at close vs actual open, MAE per ticker |
|`[ ]`| Historical backtest over kline data |
|`[ ]`| Public scorecard page — **left running through judging** |

**Exit criteria:** scorecard is live, self-updating, and shows real accumulated error history.

---

## M5 — Best execution `[ ]` · target 3–5 Oct

| | Task |
|-|------|
|`[ ]`| Binance Trading API integration (quote → route → unsigned tx) |
|`[ ]`| Adjusted best-execution ranking, net of fees |
|`[ ]`| "Buy $500 of NVDA" → cheapest real entry, with the reasoning shown |
|`[ ]`| Wallet connect + local signing |

**Exit criteria:** a live swap executes on BSC and the route explanation is auditable.

---

## M6 — Agent + oracle `[ ]` · target 6–7 Oct · 💰 $2 000 + $2 000

| | Task |
|-|------|
|`[ ]`| Binance Agentic Wallet skill integration → *Best Use of Agentic Wallet/Wallet Skills* |
|`[ ]`| BNB Agent Studio agent (ERC-8004 identity, ERC-8183 tasks) → *Best Use of Agent Studio* |
|`[ ]`| `AssayOracle` contract on opBNB — publishes (ticker → price, confidence, ts) |
|`[ ]`| Agent: wrapper-to-wrapper rebalance when true basis > round-trip cost |

> **Cut order if time runs short:** rebalancing agent → oracle contract → Agent Studio.
> The Agentic Wallet skill stays; it is cheap and worth $2 000.

---

## M7 — Submission `[ ]` · target 8–11 Oct

| | Task |
|-|------|
|`[ ]`| **`DEVEX.md`** — Developer Experience Report (**25 % of total score**) |
|`[ ]`| Demo video ≤ 4 min, rehearsed |
|`[ ]`| README with judge-followable run instructions |
|`[ ]`| Deployed links verified from a clean browser |
|`[ ]`| Submit — **do not** wait for 11 Oct |
|`[ ]`| Confirm everything stays up through 23 Oct |

---

## Risk register

| Risk | Mitigation | Status |
|------|-----------|--------|
| Public endpoints rate-limit or break | Registered API key w/ elevated limits; cache raw | open |
| True basis turns out to be ~0 on liquid names | Pivot pitch to **correctness + trust scoring** — stands alone regardless | mitigated by design |
| Collector downtime loses scorecard history | Heartbeat + restart; raw append-only | open |
| Scope creep into "a protocol" | Solidity surface capped at the oracle contract | controlled |
| Trading API needs KYC/approval we can't get | Routing degrades to read-only "where to buy" advice | open |
