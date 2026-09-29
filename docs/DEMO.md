# Demo video — script (≤ 4:00)

Record at 1080p. Have these open in tabs before you start:
[home](https://assay-woad.vercel.app) · [NVDA](https://assay-woad.vercel.app/#/t/NVDA) ·
[SPY](https://assay-woad.vercel.app/#/t/SPY) · [scorecard](https://assay-woad.vercel.app/#/scorecard) ·
a terminal in the repo. Numbers on screen will differ from this script — read what's there.

---

**0:00 – 0:25 · The hook** — *home page*

> "On BNB Chain, Nvidia has three prices. Ondo, xStocks and Binance's own bStocks all issue a token
> for the same share, and they all trade at different prices. Which one is right? None of them —
> you can't compare them at all. This is Assay: the real price of a tokenized stock."

Scroll the table slowly. Point at the Issuers column.

**0:25 – 1:05 · The phantom premium** — *NVDA page*

> "Each token represents a different number of real shares. Ondo's tokens reinvest dividends, so
> each one slowly becomes worth more than one share. Look at NVDAon: it looks 17 basis points
> expensive. Assay splits that — every bit of it is the multiplier. The real premium is zero."

Point at the gold claim box, then the decomposition bar on the NVDAon card.

> "Across 84 stocks, correcting for this takes the pricing error from over 500 basis points to
> about 5."

**1:05 – 1:40 · Prices that aren't prices** — *scroll to the NVDAx card, or open GME/MSFT*

> "The second problem: a quoted price doesn't tell you anyone's trading at it. Half of all xStock
> quotes on BSC fail basic sanity — one shows GameStop at eight and a half times its real price.
> Assay scores every wrapper for trust, and rejects the ones it can't stand behind — with the reason."

Point at a rejected tag and the trust bar.

**1:40 – 2:30 · Best execution** — *SPY page, buy panel, $1,000*

> "So which one do you actually buy? Assay ranks them by how much real stock your money gets. A
> router that compares token prices would buy SPYx — Assay won't: it's too thin to trust. And
> SPYB's token is five dollars cheaper than SPYon's — but SPYon buys more S&P. Cheaper token, less
> stock. That's the multiplier."

*Terminal:*

```bash
npm run buy -- SPY 1000
```

> "Same ranking in the terminal — and the exact Binance Agentic Wallet command to execute it."

**2:30 – 3:05 · The agent** — *terminal or Claude Code, with the Assay skill installed*

> "Assay ships as an agent skill that works alongside Binance's Agentic Wallet. Ask your agent to
> buy $500 of Nvidia: Assay gets an executable quote for every wrapper from the wallet, picks the
> one that buys the most stock, and hands it to the wallet — which checks it and asks you to confirm.
> Assay decides what to buy. The wallet does the buying."

*With `baw` signed in:*

```bash
node skills/assay/scripts/best.mjs SPY 1000
```

> "These are real quotes from Binance's wallet. Look at SPYx — the cheapest token on screen. A
> thousand dollars buys you fifty-seven dollars of stock. That's the one a price-comparing router
> buys first."

```bash
node skills/assay/scripts/router-check.mjs PFE SPY
```

> "And something we didn't expect: Binance's own router prices these tokens as if one token were
> one share. PFEon carries six percent of reinvested dividends — sell it through the wallet and
> they're gone."


**3:05 – 3:40 · Proof** — *scorecard page*

> "Does any of this work? Every US open, Assay scores itself against every alternative — including
> 'just always use Ondo' — against the price that actually prints. It beats Binance's own pre-open
> price by a third, and naive comparison by twenty times. It's all public, live, and pinned in 119
> regression tests."

**3:40 – 4:00 · Close** — *back to home*

> "We also wrote up everything we hit building on the Binance Web3 API — the ten biggest pitfalls,
> and five changes that would stop the next team shipping these bugs. Assay: the real price of a
> tokenized stock."
