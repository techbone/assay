# Submission text

Paste-ready. Adjust to whatever fields the form actually has.

**Project name:** Assay

**Tagline:** The real price of a tokenized stock.

**Links**
- Live: https://assay-woad.vercel.app
- Repo: https://github.com/techbone/assay
- Demo video: <add link>
- Developer Experience Report: https://github.com/techbone/assay/blob/main/DEVEX.md

**Track:** Tokenized Stocks Products & Agents
**Special prize:** Best Use of Agentic Wallet / Wallet Skills

**Short description (1–2 sentences)**

On BNB Chain the same stock trades as up to three tokens from three issuers at three prices that
can't be compared — each represents a different number of real shares. Assay computes one
trust-weighted reference price per stock, shows which part of every apparent premium is real, and
routes a buy to whichever token delivers the most real stock.

**Description**

There are 667 tokenized stock tokens on BSC covering 512 tickers; 37 mega-caps carry an Ondo, an
xStocks and a bStocks wrapper at once. Their prices aren't comparable: each carries a
`sharesMultiplier` that drifts with reinvested dividends and jumps with splits (0.0667 to 10.03 on
BSC), and a quoted price carries no signal about whether anyone trades at it.

Assay normalizes every wrapper, scores it for trust (liquidity, freshness, metadata agreement), and
rejects halted, stale, corrupt and outlier quotes with the reason shown. On live data:

- correcting for the multiplier takes pricing error from a 533bp worst case to 5.3bp across 84 stocks;
- 51% of xStock quotes on BSC fail basic sanity — GameStop quoted at 8.5x its real price;
- on real Binance Agentic Wallet quotes, the cheapest token often buys the least: $1,000 of `SPYx`
  quoted $57 of stock — so Assay ranks buys by real shares received;
- Binance's own wallet router prices Ondo tokens as if one token were one share, so selling `PFEon`
  through it gives up ~6% in reinvested dividends (quotes, not settled trades).

Best execution runs on the site (indicative) and through an agent skill that composes with Binance's
Agentic Wallet (executable): Assay decides what to buy, the wallet executes after the user confirms.
A public scorecard grades Assay against every alternative at each US open; over four opens it beats
Binance's own pre-open price by 36% and naive comparison by ~20x.

**Binance Web3 API modules used:** RWA Data (token list, dynamic v2, market and asset status),
Market (kline), Trading (swap quotes via Agentic Wallet), plus the Skills Hub and
`binance-agentic-wallet` skill.

**Tech:** TypeScript, Vite + React, Vercel serverless (Frankfurt), SQLite, Vitest (120 tests).

**What's next:** an on-chain reference feed on opBNB, and the scorecard running through judging.
