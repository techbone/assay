# Demo video — script (≤ 4:00)

Record at 1080p, light theme (moon/sun toggle, top right). Numbers on screen will differ from this
script — read what's there. Open these tabs first:

- https://assay-woad.vercel.app
- https://assay-woad.vercel.app/#/t/SPY
- https://assay-woad.vercel.app/#/scorecard
- https://assay-woad.vercel.app/#/findings
- a terminal in the repo, with `baw` signed in

---

**0:00 – 0:30 · The problem** — *home page, top*

> "On BNB Chain, the S&P 500 trades as three tokens from three issuers — Ondo, xStocks, and Binance's
> bStocks — at three different prices. So which one is the real price? You can't tell by comparing
> them. This is Assay: the real price of a tokenized stock."

Point at the SPY card on the right. Read the sentence under the table:

> "SPYB shows the lower price — but SPYon is actually cheaper per real share, because each SPYon
> token holds more than one share. And SPYx is excluded entirely: its price can't be trusted."

**0:30 – 1:10 · The phantom premium** — *click "Open SPY →"*

> "Ondo tokens reinvest dividends, so each token slowly becomes worth more than one share. SPYon
> looks 95 basis points expensive." *(point at the blue callout)* "Every bit of that is reinvested
> dividends. The real premium is zero."

Point along the SPYon row: *Looks like · Of which dividends · Real premium*.

> "Across 84 stocks, correcting for this takes the pricing error from over 500 basis points to
> about 5."

**1:10 – 1:40 · Prices that aren't prices** — *SPYx row, Trust and Status columns*

> "Second problem: a price doesn't tell you anyone's trading at it. SPYx has a trust score of 0.13
> — a handful of traders. Half of all xStock prices on BSC fail basic sanity. Assay scores every
> token and won't act on the ones it can't stand behind."

**1:40 – 2:30 · Best execution — on real quotes** — *scroll to "Buy SPY", pick $1,000, then terminal*

> "So which one do you buy? Assay ranks tokens by how much real stock your money gets — and it
> won't route to SPYx."

```bash
node skills/assay/scripts/best.mjs SPY 1000
```

> "These are real quotes from Binance's own Agentic Wallet. Look at SPYx — the cheapest price on
> screen. A thousand dollars buys fifty-seven dollars of stock. That's the one a price-comparing
> router buys first."

**2:30 – 3:05 · What we found in Binance's router** — *terminal*

```bash
node skills/assay/scripts/router-check.mjs PFE SPY
```

> "And something we didn't expect. Binance's wallet router prices Ondo tokens as if one token were
> one share. PFEon carries six percent in reinvested dividends — sell it through the wallet and
> they're gone. We've reported this in our developer report."

> "Assay also ships as an agent skill. Your agent asks Assay what to buy, then hands it to Binance's
> wallet — which asks you to confirm. Assay decides; the wallet executes."

**3:05 – 3:35 · Proof** — *Scorecard tab*

> "Does it work? Every US market open, Assay is scored against every alternative — including 'just
> always use Ondo' — on the price that actually prints. It's a third more accurate than Binance's
> own pre-open price, and about twenty times better than comparing prices naively."

**3:35 – 4:00 · Close** — *Findings tab, scroll slowly*

> "Every number here links to the test or script that reproduces it — 126 tests, running on every
> commit. Assay: the real price of a tokenized stock."
