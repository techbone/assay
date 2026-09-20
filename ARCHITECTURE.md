# Assay — Architecture

> The real price of a tokenized stock.

## 1. The problem, stated precisely

On BNB Smart Chain (chainId 56) there are **667 tokenized equity tokens covering only 512 unique
tickers**. 117 tickers carry more than one wrapper; **37 mega-caps carry three or more**
(NVDA, TSLA, AAPL, MSFT, SPY, QQQ, MSTR, COIN, META, GOOGL, PLTR, HOOD, TSM …).

Three issuer families are live simultaneously, distinguished by the `type` field:

| `type` | Family | Symbol suffix | Count on BSC |
|-------:|--------|---------------|-------------:|
| 1 | Ondo Global Markets | `…on` | 457 |
| 2 | xStocks (Backed)    | `…x`  | 128 |
| 3 | bStocks (Binance)   | `…B`  | 77  |

**These are not interchangeable, and their quoted prices are not comparable.** Each token carries a
`sharesMultiplier` — how many underlying shares one token represents. It moves for two reasons:

1. **Distribution accrual.** Ondo tokens are total-return: dividends are reinvested into the
   multiplier rather than paid out. The multiplier ratchets up forever.
2. **Fractionalisation / splits.** Some wrappers are 1:10 or 1:5 against the share.
   Observed range on BSC: **0.0667 → 10.03**.

So comparing raw quoted prices across wrappers is not slightly wrong — it can be **wrong by 10x**.

### This is empirically proven, not assumed

Live snapshot, 2026-09-20 07:2x UTC (`tests/fixtures/dynamic-tri-2026-09-20.json`).
Basis of each Ondo wrapper against its own underlying reference price, before and after dividing by
the multiplier:

| Ticker | naive basis | **adjusted basis** |
|--------|------------:|-------------------:|
| SPY    | +94.7 bp    | **0.0 bp**   |
| TSM    | +94.1 bp    | **+0.9 bp**  |
| ORCL   | +82.1 bp    | **+2.7 bp**  |
| PYPL   | +77.9 bp    | **0.0 bp**   |
| MSFT   | +57.2 bp    | **-0.1 bp**  |
| QQQ    | +29.8 bp    | **-3.7 bp**  |
| NVDA   | +18.1 bp    | **+0.9 bp**  |
| MU     | +11.6 bp    | **+0.4 bp**  |

Every apparent premium — up to 95 bp — is **phantom**. It is accrued distribution, and the
multiplier adjustment removes it to within ~3 bp. Any dashboard that ranks wrappers on raw price is
systematically telling users that Ondo tokens are expensive when they are at fair value.

### The second problem: the metadata itself is unreliable

The adjustment cannot be applied blindly. Same snapshot:

- **`NFLXx`** — quoted 77.19 with `sharesMultiplier` 10.0 → implies 7.72 against a 71.93 reference.
  **Off by ~10x. The multiplier is corrupt.**
- **`TQQQx`** — quoted 72.41 with multiplier 2.009 → implies 36.05 against 72.14. **Off by ~2x.**
- **`MSTRx`** quotes 9.6 % *below* reference; **`ORCLx`** 11 % above; **`TSMx`** 9.9 % below —
  deviations far too large to be real basis on a mega-cap, and unexplained by the multiplier.
  These are thin-pool last-trade prints, i.e. **stale quotes wearing the costume of a live price**.
- The same token reports **different multipliers from different endpoints** (the list endpoint gave
  `NVDAx = 1`, the dynamic endpoint gave `1.00092`). One of them is stale.

A naive "best price" router would route a user straight into `MSTRx` believing it had found a 9.6 %
discount. **Correctness here is the product.** That is why this is called Assay.

## 2. What Assay produces

For every ticker with a live wrapper on BSC:

- **The Assay Price** — one trust-weighted reference, with a confidence band.
- **A basis decomposition per wrapper** — the line that makes the whole thing legible:
  `naive basis = multiplier effect + true basis`.
  *"NVDAon looks 18 bp rich. 17 bp of that is accrued distribution. 1 bp is real."*
- **A trust score per wrapper** — liquidity, staleness, metadata consistency, trading status.
- **An off-hours mark** — what the stock is worth right now, while the tape is frozen.
- **A best-execution route** — cheapest *real* entry, adjusted, net of fees.

## 3. Components

```
                    Binance Web3 API (public, no key)
   ┌──────────────┬──────────────┬───────────────┬──────────────┐
   │ stock/detail │  rwa/dynamic │ market/status │    kline     │
   │  /list/ai    │    /ai (v2)  │ + asset/status│     /ai      │
   └──────┬───────┴──────┬───────┴───────┬───────┴──────┬───────┘
          │              │               │              │
          ▼              ▼               ▼              ▼
   ┌────────────────────────────────────────────────────────────┐
   │ src/binance      typed client · retry · schema guards      │
   └──────────────────────────┬─────────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────────┐
   │ src/collector    24/7 poller → RAW append-only snapshots   │
   │                  (raw is sacred: re-processable forever)   │
   └──────────────────────────┬─────────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────────┐
   │ src/reference    ★ THE CORE IP ★                           │
   │   normalize  → adjusted = price / sharesMultiplier         │
   │   validate   → reject corrupt multipliers & stale quotes   │
   │   trust      → score each surviving wrapper [0,1]          │
   │   assay      → trust-weighted median + confidence band     │
   │   decompose  → naive = multiplier effect + true basis      │
   └───────┬─────────────────────────┬──────────────────────────┘
           ▼                         ▼
   ┌───────────────┐      ┌─────────────────────────────────────┐
   │ src/offhours  │      │ src/route  best execution           │
   │ frozen-tape   │      │ (Binance Trading API, MEV-protected │
   │ mark + band   │      │  unsigned tx, local signing)        │
   │ + SCORECARD   │      └──────────────┬──────────────────────┘
   └───────┬───────┘                     │
           ▼                             ▼
   ┌────────────────────────────────────────────────────────────┐
   │ apps/web (Next.js)   public assay reports + live scorecard │
   │ contracts/           AssayOracle on opBNB (small surface)  │
   │ agent/               Agentic Wallet skill + Agent Studio   │
   └────────────────────────────────────────────────────────────┘
```

## 4. The reference algorithm

```
for each ticker:
  quotes = all wrappers with a live dynamic payload

  # 1. normalize
  adjusted = price / sharesMultiplier

  # 2. validate — a quote is REJECTED if any holds:
  #    a. statusInfo.reasonCode != TRADING
  #    b. multiplier disagrees across list/dynamic endpoints beyond tolerance
  #    c. |adjusted / peer_median - 1| > 5%   AND   trust < threshold   (catches NFLXx, TQQQx)
  #    d. price unchanged across N consecutive polls while peers moved  (staleness)
  #    e. adjusted implies a clean ratio (~2x, ~10x) against peer median (corrupt multiplier)

  # 3. trust score, in [0,1] — liquidity · freshness · metadata agreement
  trust = w_liq·f(holders, bnTrader, volume24h, circulatingSupply)
        · w_fresh·f(ticks since last change)
        · w_meta·f(cross-endpoint multiplier agreement)

  # 4. assay price
  #    RTH   → anchored to stockInfo.price, wrappers measured against it
  #    off   → trust-weighted median of surviving adjusted quotes
  assay  = weighted_median(adjusted, trust)
  band   = f(dispersion of surviving quotes, total trust mass)
```

**Invariant (regime-dependent).** Outside RTH the price is a weighted median and always lies within
`[min, max]` of surviving adjusted quotes. During RTH it *is* the venue reference, which is
authoritative and may legitimately sit outside that range — if every wrapper is rich, the honest
answer is that every wrapper is rich, not that the underlying moved. Both halves are enforced by test.

> The first draft of this document stated the invariant unconditionally. The corpus regression test
> falsified it on real data within minutes. The claim was corrected; the engine was not.

### Corpus result (84 tickers, live BSC snapshot, `tests/corpus.test.ts`)

| Ondo basis vs reference | median | p90 | **max** |
|-------------------------|-------:|----:|--------:|
| naive                   | 8.1 bp | 93.2 bp | **533.4 bp** |
| **adjusted**            | **0.5 bp** | **3.3 bp** | **5.3 bp** |

Worst-case error falls by a factor of ~100. Median trust score by family — the signal that keeps
stale quotes out of the price — comes out **Ondo 0.62 · bStock 0.47 · xStock 0.04**.

## 5. Session regimes

`market/status/ai` returns a precise session machine — verified live:

```json
{"marketStatus":"closed","openState":false,"reasonCode":"MARKET_CLOSED",
 "reasonMsg":"Weekend or Holiday","nextOpen":"2026-09-21T00:05:00Z",
 "offhours":{"openState":true, ...}}
```

Three regimes drive different behaviour:

| Regime | `stockInfo.price` | Assay behaviour |
|--------|-------------------|-----------------|
| **RTH** (open) | live | anchor to reference; wrappers scored against it |
| **offhours** | frozen | on-chain price discovery leads; wider band |
| **closed** (weekend) | frozen at Friday close | **off-hours mark** + crypto-beta; widest band |

The weekend case is the headline: tokens report `openState: true, reasonCode: TRADING` while the
reference has not moved since Friday. That gap is the product's reason to exist.

## 6. The scorecard — the thing judges cannot ignore

Every session close, Assay records its off-hours mark. Every next open, it records where the stock
actually opened, and scores the error. Mean absolute error per ticker, published live.

It runs continuously from **Milestone 2 onward**, through the entire judging window (12–23 Oct).
A judge opening the link on 19 Oct sees numbers computed that morning, on top of ~4 weeks of
accumulated history. Most submissions are a frozen demo and a video.

**This is why the collector ships before the engine is finished.** Raw snapshots are append-only and
re-processable; a day not collected is evidence lost forever.

## 7. Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript (strict) | one language across collector, engine, web |
| Runtime | Node 20+ | — |
| Store | SQLite (`better-sqlite3`) | zero infra, single-file, trivially deployable |
| Tests | Vitest | fixture-driven regression suite |
| Web | Next.js + React | plays to existing strengths |
| Chain | viem | BSC / opBNB reads |
| Contracts | Foundry | `AssayOracle` only — a few hundred lines, deliberately |
| Agent | Binance Agentic Wallet skill + BNB Agent Studio | targets the two $2 000 special prizes |

## 8. Scoring alignment

The rubric is **Technical 30 · Creativity 25 · DX Report 25 · Product/UX 20**.

The DX Report is a quarter of the score and is the single most under-served deliverable in any
hackathon. `DEVEX.md` is therefore written **continuously from day one**, capturing real pitfalls as
they are hit, not recalled the night before submission. Findings already logged: cross-endpoint
multiplier disagreement, corrupt `NFLXx`/`TQQQx` multipliers, `200 OK` + `success:true` on an
invalid contract address, zero-volume klines.
