---
name: assay
description: |
  The real price of a tokenized stock on BNB Chain. Use when the user wants to buy, compare
  or price a tokenized US stock or ETF on BSC (NVDA, TSLA, SPY, AAPL, MSFT, MSTR, COIN...),
  asks which token to buy (NVDAon vs NVDAx vs NVDAB), whether a token is cheap or expensive,
  or what one of these tokens is really worth.

  The same stock trades on BSC as several wrappers from different issuers (Ondo `…on`,
  xStocks `…x`, bStocks `…B`), each representing a different number of real shares
  (`sharesMultiplier`) and trading on pools of very different depth. Comparing their token
  prices directly is wrong - sometimes by 10x. Assay normalizes them, scores how far each
  can be trusted, and finds which one buys the most real stock for the user's money.

  Composes with `binance-agentic-wallet`: Assay decides WHAT to buy, the wallet does the
  buying. Never place a trade from this skill directly.
metadata:
  author: techbone
  version: "1.0.0"
  homepage: https://github.com/techbone/assay
  requires:
    skills:
      - binance-agentic-wallet
---

# Assay

Reference prices and best execution for tokenized stocks on BNB Smart Chain.

**API:** `https://assay-woad.vercel.app` (override with `ASSAY_API`). Public, no key, live
from the Binance Web3 RWA API on every request.

## When the user asks what a tokenized stock is worth

```bash
curl -s "$ASSAY_API/api/ticker/NVDA"
```

Returns `assayPrice` (one trust-weighted price per real share), `confidenceBp`, `regime`
(`rth`, `premarket`, `overnight`, `afterhours`, `closed`), and per wrapper:

| field | meaning |
|---|---|
| `price` | quoted token price |
| `multiplier` | real shares represented by one token |
| `adjusted` | `price / multiplier` - comparable across wrappers |
| `naiveBasisBp` | how rich/cheap the token *looks* against the assay price |
| `multiplierEffectBp` | the part of that which is only the multiplier ("phantom premium") |
| `trueBasisBp` | what is actually there |
| `trust` | 0-1: liquidity, freshness, metadata agreement |
| `rejected` | non-null = excluded (halted, corrupt multiplier, stale, outlier) |

**Say it the way it is.** If `NVDAon` looks 17bp rich and `multiplierEffectBp` is 17, tell the
user it is at fair value: the premium is accrued dividends held inside the multiplier. Never
tell a user a wrapper is cheap because its token price is lower.

## When the user wants to buy

Run the bundled script. It pulls candidate wrappers from Assay, asks the Binance Agentic
Wallet for an **executable** quote on each (route and slippage included), converts tokens
to real shares, and ranks them:

```bash
node <skill-dir>/scripts/best.mjs NVDA 500          # spend 500 USDT on BSC
```

It prints the ranking and the exact `baw market-order swap` command for the winner. It does
**not** execute anything.

Requires `baw` signed in (see `binance-agentic-wallet` → authentication). If it is not, the
script falls back to Assay's indicative ranking and says so - present that as indicative,
not as a quote.

Then:

1. Show the user the ranking: wrapper, shares received, cost per real share, premium vs the
   assay price. Lead with shares - that is the thing they are buying.
2. If a cheaper-looking token buys fewer shares, say so plainly. That is the whole point.
3. If a wrapper is excluded, give its reason. Do not route around an exclusion.
4. Hand the winner to `binance-agentic-wallet` → `market-order swap`, following that skill's
   security pre-check, confirmation and order-status polling exactly. Assay never swaps.

## Rules

- **Never recommend a `rejected` wrapper**, however good its quote.
- **Indicative is not executable.** Assay's site and `/api/buy` price from last trades and hold
  back thin wrappers (trust < 0.5). Only a `baw` quote says what a buy will actually fill at.
- Outside `rth` the underlying market is closed; tokens still trade, but warn the user the
  reference is moving with extended-hours prints.
- Tokenized stocks can pause for corporate actions (dividends, splits, earnings). A
  `NOT_TRADING` rejection usually means exactly that.
