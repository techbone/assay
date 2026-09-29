# Developer Experience Report — Binance Web3 API

**Project:** Assay — a reference-price and best-execution layer for tokenized stocks on BNB Chain.
**Built:** 20 Sep – 11 Oct 2026, from Nigeria. Findings were logged the day they were hit, not
reconstructed at the end; every number below comes from live production data and most are pinned
in the repo's regression tests.

**What we used**

| Module | How | Depth |
|---|---|---|
| RWA Data | token list, `rwa/dynamic/ai` v2, market status, asset status | core — ~550k observations over 9 days |
| Market | `kline` | explored; not load-bearing (see pitfall 8) |
| Trading | executable swap quotes via Agentic Wallet `market-order quote`; swaps handed to the wallet | best execution |
| AI stack | Skills Hub, `binance-tokenized-securities-info`, `binance-agentic-wallet` | reference + integration |
| Transaction, Wallet, DeFi APIs | not used | — |

---

## The five changes that would matter most

1. **Document `sharesMultiplier`, and return an `adjustedPrice`.** It is the single field that
   decides whether a tokenized-stock product is right or wrong, and it is undocumented. (§ Pitfalls 1)
2. **Put liquidity on the price.** `lastTradeTime` and depth on `tokenInfo`. Without them, half of
   all xStock quotes on BSC are indistinguishable from real prices. (§ Pitfalls 2, § Tokenized stocks)
3. **`success: false` when there is no data.** It cost us time twice in two days. (§ Pitfalls 4)
4. **Serve the Web3 API from its own hostname.** `www.binance.com` is DNS-blocked on common
   resolvers in at least one eligible country. (§ Onboarding)
5. **A documented HTTP quote endpoint.** Executable quotes are only reachable through a signed-in
   wallet CLI, so no backend can show one. (§ AI stack)

---

## Onboarding

**What worked: no key to start.** Every RWA read endpoint is public. We validated the whole product
thesis against live production data before writing product code or registering. That is an
unusually low activation energy and the single best thing about this surface — most chains cost a
day on credentials first.

**What broke: the API host is unresolvable on some networks.** From our build machine in Nigeria,
every call began failing instantly with `Could not resolve host: www.binance.com`, while everything
else resolved. The machine's resolvers (the router and `114.114.114.114`) answer **NXDOMAIN** for the
domain; Cloudflare `1.1.1.1` and Google `8.8.8.8` resolve it, and the API answers `200` once reached.

Because the OS alternates between resolvers, it presents as *intermittent* failure. Our collector
silently produced empty cycles for hours at a time, which we first misread as the laptop sleeping; a
large share of 35 hours of collection gaps traces back to it. The Web3 API's docs live on
`web3.binance.com`, but its data is served from `www.binance.com` — the hostname most likely to be
filtered by DNS blocking aimed at the consumer exchange. The Agentic Wallet CLI inherits the same
problem.

> **Ask:** serve the Web3 API from a dedicated hostname (e.g. `api.web3.binance.com`).
> **Our workaround:** the client resolves through public DNS when `ASSAY_DNS` is set, and the public
> site calls Binance from a serverless function in Frankfurt, so neither depends on the visitor's
> resolver.

**Required headers are undocumented.** Requests need `Accept-Encoding: identity` and a `User-Agent`.
We found this only inside a published skill's source. Without them you hit opaque failures with
nothing to search for.

---

## Documentation

**The Skills Hub is better API documentation than the API reference.** The
`binance-tokenized-securities-info` skill has the endpoint list, required headers and response
shapes in one readable file. We found it by accident through search and it saved hours.

> **Ask:** link the Skills Hub from the API docs landing page, and treat each skill's `SKILL.md`
> as a first-class reference page.

**The field that matters most has no documentation.** See `sharesMultiplier` below. The `type` field
(1 = Ondo, 2 = xStocks, 3 = bStocks) is also unnamed, though issuer family decides whether a token
accrues distributions — which changes how it must be priced. One skill notes that *"older versions of
it only know `type=1` (Ondo)"*, so even Binance's own tooling has drifted on this.

**The session model is undocumented.** `marketStatus` takes at least `closed`, `overnight`,
`premarket`, `afterhours` and a regular-session value. None are listed, and which ones mean "the
underlying stock is trading" has to be inferred. (§ Pitfalls 3)

---

## API pitfalls — highest impact first

### 1. `sharesMultiplier` is undocumented, and it decides everything · critical

It encodes two different things at once:

- **distribution accrual** — Ondo total-return tokens ratchet it upward as dividends reinvest;
- **fractionalization and splits** — observed range on BSC **0.0667 → 10.03**.

So the obvious implementation — comparing quoted prices across wrappers — is not slightly wrong; it
is **wrong by up to 10x**. Across 84 multi-wrapper tickers, dividing by the multiplier takes Ondo's
basis error against the underlying from a **533bp worst case to 5.3bp**. `SPYon` looks 95bp
expensive and is at fair value to within 0.1bp. Every one of those phantom premiums would be shown
to users by a naive dashboard as real.

It also corrupts execution, not just display: on 29 Sep, `SPYB`'s token was **$5.31 cheaper** than
`SPYon`'s, yet $1,000 of `SPYon` bought **more SPY**. A router that compares token prices picks the
wrong one.

> **Ask:** document it with a worked example and the invariant
> `price / sharesMultiplier ≈ stockInfo.price`. Better: return `adjustedPrice` so the correct path is
> the default one.

### 2. A quoted price carries no liquidity context · high

`tokenInfo.price` for a thin wrapper is a last-trade print that can be arbitrarily stale: `MSTRx`
9.6% below its reference, `ORCLx` 11% above, `TSMx` 9.9% below — on mega-caps, where real basis
that size cannot exist. There is no `lastTradeTime`, no depth and no bid/ask, so a client cannot
tell a live price from a days-old one. We had to synthesize staleness by polling and diffing.

Live, unguarded, our own best-execution router recommended `NVDAx` and `SPYx` as 33bp and 60bp
"cheaper" — both on pools with a handful of traders. (§ Tokenized stocks has the market-wide count.)

> **Ask:** `lastTradeTime` and a depth or liquidity measure on `tokenInfo`. The highest-value single
> addition to this API.

### 3. Extended sessions report `openState: true` · high

```json
{"marketStatus":"premarket","openState":true,"reasonCode":null,
 "nextOpen":"2026-09-21T13:31:00Z","nextClose":"2026-09-21T13:29:00Z"}
```

`openState: true` at 08:47 UTC, nearly five hours before the US open. Anyone reading `openState` as
"the market is open" — which the name invites — treats a premarket quote as live. We did, and
mislabelled 26 of our first 209 session samples. `nextClose` preceding `nextOpen` is also correct
(premarket closes two minutes before the regular session) but reads as corrupt without explanation.

> **Ask:** document every `marketStatus` value, and add `referencePriceLive: boolean` — the only
> question an integrator actually has.

### 4. Missing data returns `success: true` · high

```
GET …/rwa/dynamic/ai?chainId=56&contractAddress=0xdeadbeef…
→ 200 {"code":"000000","data":null,"success":true}
```

A client that checks `success` treats a bad address as an empty result. Worse, 25 consecutive
market-status reads came back `data: null` with `success: true` — nothing threw, our error counter
stayed at zero, and we recorded a fabricated market regime for fifty minutes.

> **Ask:** `success: false` with a resolvable error code whenever `data` is null.

### 5. Some multipliers are simply wrong · high

| Token | quoted | `sharesMultiplier` | implied | reference | error |
|---|---:|---:|---:|---:|---:|
| `NFLXx` | 77.19 | 10.0 | 7.72 | 71.93 | **~10x** |
| `TQQQx` | 72.41 | 2.009 | 36.05 | 72.14 | **~2x** |

The Ondo wrappers on the same tickers were right to within 1bp, so this is per-wrapper metadata
corruption. We reject a multiplier when dividing by it moves the price *away* from the benchmark.

> **Ask:** flag a payload whose `price / sharesMultiplier` is more than 5% from `stockInfo.price`.
> You already hold both numbers in the same response.

### 6. The same token reports different multipliers from different endpoints · medium

`NVDAx` showed `multiplier = 1` from `stock/detail/list/ai` and `1.0009180758` from
`rwa/dynamic/ai`. The list copy lags by days and nothing marks it as cached. Both look
authoritative.

> **Ask:** converge them, or label the list copy as a snapshot with its as-of time.

### 7. No history for the one field that needs it · medium

There is no way to get `sharesMultiplier` as of a past time, so historical basis cannot be computed
correctly — only collected forward. Any gap in collection is permanent. Combined with pitfall 1,
this made collector uptime the critical path of our whole build.

### 8. `kline` volume is always `"0"` · low

Every candle from `dex/market/token/kline/ai` returned `"0"` in the volume slot, across tickers and
intervals. Volume is load-bearing for liquidity scoring and backtesting, so we could not use it.

---

## AI stack

**Skills Hub.** Excellent as documentation (above). Installing skills worked first time, and they
compose: our own `assay` skill declares `binance-agentic-wallet` as a dependency and hands execution
to it.

**Agentic Wallet — what is good.** The skill's guidance is unusually careful and we adopted it
wholesale: an `orderId` is not a fill, poll to a terminal state, never report success early, never
downgrade a conditional order to a market order. We built Assay so that it only ever *prices* a
swap and leaves executing it to the wallet skill, precisely so that guidance stays in force.

**Agentic Wallet — what blocked us.**

- **An executable quote needs a signed-in wallet.** `market-order quote` is the only documented way
  to learn what a swap would actually fill at, and it runs through a CLI built around the user's own
  wallet session, paired via the Binance app. A backend cannot show an executable quote, so our public
  site can only rank wrappers on indicative last-trade prices — exactly the prices pitfall 2 says not
  to trust. Our agent skill gets executable quotes; our website cannot.
- **It depends on `www.binance.com`** and so fails the same way on DNS-filtered networks, with no
  resolver override.
- **Tokenized-stock support differs by issuer.** The skill notes that limit orders fail with
  `Ondo-related tokens cannot be traded`, so behaviour depends on which wrapper you picked — the same
  choice Assay exists to make well. We found this in the skill text, not in any API reference.

> **Ask:** an unauthenticated (or API-key) HTTP quote endpoint, rate-limited. It would let every
> tokenized-stock front end show what a trade will really cost, not what the last trade was.

---

## Tokenized-stock specifics

**Half of all xStock quotes on BSC fail basic price sanity.** Running our validation layer across
every multi-wrapper ticker (84 tickers, 194 quotes), **22 of 43 xStock quotes — 51% — were rejected.**
Every rejection in the corpus was an xStock; no Ondo or bStock wrapper tripped either guard.

| Wrapper | deviation | Wrapper | deviation |
|---|---:|---|---:|
| `GMEx` | **+855%** | `UBERx` | −87.9% |
| `BACx` | **+771%** | `CSCOx` | −87.7% |
| `AMDx` | **+616%** | `MRVLx` | −86.6% |
| `NVOx` | +13.8% | `IBMx` | −85.6% |
| `ORCLx` | +11.0% | `TSMx` | −9.9% |

`GMEx` at nearly ten times its own reference is served through the same field, with the same shape
and no warning, as an `NVDAon` quote accurate to within 1bp. Every integrator has to rediscover this
and build a statistical sanity layer before safely showing a user a price.

**What is excellent and under-sold.** `statusInfo.reasonCode` distinguishing `TRADING` from
corporate-action halts (earnings, dividends, splits, mergers) has no equivalent on other chains we
have built against. It is the difference between a toy and something that can hold a position
safely. **Lead with it in the docs.** Having the on-chain price and the underlying reference in one
`rwa/dynamic/ai` payload is likewise exactly right, and saved us an integration.

**The reference is not frozen outside market hours.** We designed an "off-hours mark" around the
assumption that `stockInfo.price` freezes at the close. It does not — on NVDA it changed 78 times
across 89 premarket samples. Useful, but undocumented, and it changes what an off-hours product can
honestly claim.

---

## Redesign suggestions

1. **Make the correct price the default.** Return `adjustedPrice = price / sharesMultiplier` next to
   `price`. Most integrators will then never ship the 10x bug.
2. **Serve a `priceQuality` flag on `tokenInfo`**, computed server-side against `stockInfo.price` you
   already hold: `ok`, `stale`, `thin`, `metadata_suspect`.
3. **Replace `openState` with explicit booleans:** `tokenTradable` and `referencePriceLive`. Today one
   field is asked to answer both questions, and answers only the first.
4. **Group wrappers by underlying.** One call, `GET /rwa/underlying/NVDA`, returning every wrapper of
   a stock across issuers with multipliers — the view every multi-issuer product rebuilds by hand.
5. **Batch `rwa/dynamic`.** Our full-market sweep is 231 calls; one batched call would do.

## Requested capabilities

1. `lastTradeTime` and depth or liquidity on `tokenInfo`.
2. A first-class `adjustedPrice`.
3. Historical `sharesMultiplier` (as-of queries).
4. An unauthenticated or API-key HTTP quote endpoint for executable swap quotes.
5. A forward corporate-action calendar (dividends, splits, earnings), not just current status.
6. Batch dynamic lookup, and a by-underlying lookup.
7. A dedicated API hostname outside `www.binance.com`.
