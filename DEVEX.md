# Developer Experience Report — Binance Web3 API

*Logged continuously during the build, dated as encountered. Not reconstructed from memory.*

Project: **Assay** — a reference-price and best-execution layer for tokenized equities on BSC.
Surface used: RWA Data (token list, meta, market status, asset status, dynamic v2), Market (kline),
Trading, Transaction, Wallet, DeFi.

---

## What worked well

**No API key needed to start.** Every RWA read endpoint is public. We validated our entire product
thesis against live production data **before writing a line of product code or registering**. That is
an unusually low activation energy and it is the single best thing about this API surface. Most chains
would have cost us a day on credentials first.

**`rwa/dynamic/ai` (v2) is genuinely well-designed.** One call returns `tokenInfo` (on-chain price,
multiplier, holders, supply), `stockInfo` (the underlying reference price plus fundamentals),
`statusInfo` (trading state) and `limitInfo`. Having the **on-chain price and the underlying
reference price in the same payload** is exactly right for this asset class and saved us an entire
integration.

**The session state machine is precise.** `market/status/ai` returns `nextOpen`/`nextClose` as both
ISO strings and epoch millis, plus a nested `offhours` object. Modelling RTH / offhours / closed was
straightforward because the API models it properly rather than making us infer it from a calendar.

---

## Pitfalls — highest impact first

### 1. `sharesMultiplier` is undocumented as the key to the whole asset class · **critical**

The single most important field for tokenized equities appears in the schema without an explanation
of what it means or when it changes. It encodes **two different things at once**:

- distribution accrual (Ondo total-return tokens ratchet the multiplier up as dividends reinvest)
- fractionalisation / split ratios (observed range on BSC: **0.0667 → 10.03**)

Consequence: the obvious implementation — comparing quoted prices across wrappers — is not slightly
wrong, it is **wrong by up to 10x**. We only found this because we diffed wrappers of the same ticker
against each other. A developer building the natural "compare tokenized stock prices" dashboard will
ship a product that systematically misprices every Ondo token by 10–95 bp and every fractionalised
token by an order of magnitude.

**Ask:** document `sharesMultiplier` prominently with a worked example, and state the invariant
`adjusted_price = price / sharesMultiplier ≈ stockInfo.price`. Better: return `adjustedPrice` as a
first-class field so the correct path is the default path.

### 2. The same token reports different multipliers from different endpoints · **high**

`NVDAx` reported `multiplier = 1` from `stock/detail/list/ai` and `sharesMultiplier = 1.0009180758`
from `rwa/dynamic/ai`. The list endpoint carries a `lastUpdateTime` that lags the dynamic endpoint by
days. Nothing warns you that one is stale, and both look authoritative.

**Ask:** either converge them, or mark the list endpoint's copy explicitly as a cached snapshot.

### 3. Some multipliers are simply wrong, with no error signal · **high**

Observed 2026-09-20:

| Token | quoted | `sharesMultiplier` | implied | actual reference | error |
|-------|-------:|-------------------:|--------:|-----------------:|------:|
| `NFLXx` | 77.19 | 10.0 | 7.72 | 71.93 | **~10x** |
| `TQQQx` | 72.41 | 2.009 | 36.05 | 72.14 | **~2x** |

The corresponding Ondo wrappers were correct to <1 bp on the same tickers, so this is per-wrapper
metadata corruption, not a reference issue. We had to build a validation layer that rejects
multipliers implying suspiciously clean ratios against the peer median.

**Ask:** server-side sanity check. If `price / multiplier` deviates from `stockInfo.price` by >5 %,
flag it in the payload rather than serving it silently.

### 4. Invalid contract addresses return `200 OK` with `success: true` · **medium**

```
GET …/rwa/dynamic/ai?chainId=56&contractAddress=0xdeadbeef…
→ 200 {"code":"000000","message":null,"data":null,"success":true}
```

`success: true` with `data: null` for an address that does not exist. Any client that checks
`success` before `data` — which is what the field name invites — will silently treat a bad address as
an empty result. We lost time here.

**Ask:** return `success: false` with a resolvable error code for unknown assets.

### 5. Quoted price carries no liquidity context · **high**

`tokenInfo.price` for thin wrappers is a last-trade print that can be arbitrarily stale. Live
examples: `MSTRx` quoting 9.6 % below its reference, `ORCLx` 11 % above, `TSMx` 9.9 % below — on
mega-caps, where real basis of that size cannot exist.

A "find the cheapest wrapper" feature built on this field routes users straight into the stalest
pool. There is no `lastTradeTime`, no depth, and no bid/ask — so a client cannot tell a live price
from a three-day-old one. We had to synthesise staleness by polling and diffing.

**Ask:** expose `lastTradeTime` and a depth or liquidity measure on `tokenInfo`. This is the highest-
value single field you could add.

### 6. `kline` returns volume as `"0"` · **medium**

Every candle from `dex/market/token/kline/ai` returned `"0"` in the volume slot, across tickers and
intervals. Either it is unpopulated or the slot means something else. Volume is load-bearing for
liquidity scoring and backtests, so we had to source it elsewhere.

### 7. Undocumented required headers · **low, but a hard stop**

Requests need `Accept-Encoding: identity` and a `User-Agent`. We found this only inside a published
Skill's source, not in the API reference. Without them a developer hits opaque failures with nothing
to search for.

---

## Tokenized-stock specifics worth calling out

`statusInfo.reasonCode` distinguishing `TRADING` from corporate-action halts (earnings, dividends,
splits, mergers) is excellent and has no equivalent on other chains we have built against. It is the
difference between a toy and something that can hold a position safely. **Lead with this in the docs
— it is a genuine differentiator that is currently buried.**

The `type` field cleanly separating Ondo (1) / xStocks (2) / bStocks (3) is the right primitive.
It deserves to be named in the documentation, because issuer family determines whether a token
accrues distributions — which changes how it must be priced.

## Capabilities we wanted and could not find

1. `lastTradeTime` + depth on `tokenInfo` — see pitfall 5.
2. A first-class `adjustedPrice` — see pitfall 1.
3. **Historical `sharesMultiplier`.** There is no way to fetch the multiplier as of a past timestamp,
   which makes historical basis analysis impossible to do correctly. We can only build history
   forward from the day we started collecting.
4. A dividend / corporate-action *calendar* (forward-looking), not just current status.
5. Batch dynamic lookup. 37 tickers × 3 wrappers = 111 sequential calls per snapshot.

## Onboarding and documentation

The Skills Hub repo (`binance/binance-skills-hub`) turned out to be better API documentation than the
API reference — the `binance-tokenized-securities-info` skill contains the endpoint list, required
headers and response shapes in one readable file. **Link it from the docs landing page.** We found it
by accident via search, and it saved hours.

---

## Addendum — 2026-09-20, after running the sanity layer across the whole market

Having built the validation layer, we ran it over every multi-wrapper ticker on BSC (84 tickers,
194 wrapper quotes). The result is worth reporting directly to the team:

**22 of the 43 xStock quotes on BNB Chain — 51 % — fail basic price sanity.** Every single
rejection across the entire corpus is an xStock. No Ondo wrapper and no bStock wrapper trips either
guard.

Observed deviations from the adjusted consensus, after correcting for `sharesMultiplier`:

| Wrapper | deviation | Wrapper | deviation |
|---------|----------:|---------|----------:|
| `GMEx`  | **+855 %** | `UBERx` | −87.9 % |
| `BACx`  | **+771 %** | `CSCOx` | −87.7 % |
| `AMDx`  | **+616 %** | `MRVLx` | −86.6 % |
| `NVOx`  | +13.8 %   | `IBMx`  | −85.6 % |
| `ORCLx` | +11.0 %   | `TSMx`  | −9.9 %  |

A quote showing `GMEx` at nearly ten times its own reference price is being served through the same
field, with the same shape and no warning flag, as a healthy `NVDAon` quote that is accurate to
within 1 bp. Any application that reads `tokenInfo.price` and compares wrappers — which is the
obvious thing to build — will surface these as extraordinary arbitrage opportunities.

This is the strongest possible argument for the two capabilities requested above:
`lastTradeTime` and a depth measure on `tokenInfo`. With either one, a developer could filter these
out in a single line. Without them, every integrator has to rediscover this problem independently and
build a statistical sanity layer before they can safely show a user a price.

**Suggested redesign:** serve a `priceQuality` or `stale` flag on `tokenInfo`, computed server-side
against the issuer's own reference. You already have `stockInfo.price` in the same payload, so the
comparison costs nothing — and it would prevent a whole class of applications from shipping broken.

---

## Addendum — 2026-09-21, after a full session cycle

### 8. `marketStatus` publishes extended sessions with `openState: true` · **high**

Overnight, the venue moved through `closed` → `overnight` → `premarket`. In both extended
sessions the payload reports `openState: true`:

```json
{"marketStatus":"premarket","openState":true,"reasonCode":null,
 "nextOpen":"2026-09-21T13:31:00Z","nextClose":"2026-09-21T13:29:00Z"}
```

`openState: true` at 08:47 UTC, nearly five hours before the US market opens. Any client that
reads `openState` as "regular hours are running" — which is what the field name suggests — will
treat a premarket quote as a live one. We did exactly that, and mislabelled 26 of our first
209 session samples before catching it.

Note also that `nextClose` (13:29) precedes `nextOpen` (13:31). That is internally consistent
once you work out that the premarket session closes two minutes before the regular one opens,
but nothing in the payload says so, and the naive reading is that the data is corrupt.

**Ask:** document the full set of `marketStatus` values and state plainly which ones mean the
underlying tape is live. Better, add an explicit `referencePriceLive` boolean, since that is the
only question an integrator actually needs answered.

### 9. A failed status read is indistinguishable from a quiet market · **high**

Twenty-five consecutive status calls returned `data: null` with `success: true` and HTTP 200.
Because nothing threw, our error counter stayed at zero and the cycles looked healthy. We had
recorded a fabricated market regime for fifty minutes of history.

This is pitfall #4 again, but the consequence is worse than an empty result: the null was
silently laundered into a legitimate-looking session state. We now record `unknown` explicitly
and count the read as an error.

**Ask:** this single behaviour has now cost us time twice in two days. `success` should be false
when there is no data.
