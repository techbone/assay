import { api } from "../api.js";
import { Page } from "../components/Layout.js";
import { href, REPO } from "../router.js";
import { useAsync } from "../useAsync.js";

const file = (path: string) => `${REPO}/blob/main/${path}`;

export function Findings() {
  const s = useAsync(() => api.scorecard(), []);
  const o = s.data?.overall;
  const assay = o?.summary.find((x) => x.estimator === "assay");
  const venue = o?.summary.find((x) => x.estimator === "venue_ref");
  const beat = assay && venue ? `${((1 - assay.maeBp / venue.maeBp) * 100).toFixed(0)}%` : "—";

  return (
    <Page>
      <div className="section-head" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700 }}>What we found</h1>
          <p style={{ fontSize: 15.5, maxWidth: "72ch" }}>
            Measured on live BNB Chain data between 20 and 29 September 2026. Each finding links to the
            code or test that reproduces it.
          </p>
        </div>
      </div>

      <div className="findings">
        <div className="card finding">
          <div className="big">533 → 5.3 bp</div>
          <h3>Most apparent premiums are dividends, not price</h3>
          <p>Ondo tokens reinvest dividends, so each token slowly holds more than one share. Adjusting for that
            takes the worst-case pricing error across 84 stocks from 533 to 5.3 basis points. SPYon looks 95 bp
            expensive; it is at fair value.</p>
          <div className="ev"><a href={file("tests/corpus.test.ts")} target="_blank" rel="noreferrer">Corpus test →</a><a href={file("src/reference/engine.ts")} target="_blank" rel="noreferrer">Engine →</a></div>
        </div>
        <div className="card finding">
          <div className="big">51%</div>
          <h3>Half of one issuer's prices can't be trusted</h3>
          <p>22 of 43 xStock prices on BSC fail basic sanity — GameStop at 8.5× its real price, Uber at −88% —
            served through the same field, with no warning, as prices accurate to within 1 bp.</p>
          <div className="ev"><a href={file("tests/corpus.test.ts")} target="_blank" rel="noreferrer">Corpus test →</a><a href={`${REPO}/blob/main/DEVEX.md#tokenized-stock-specifics`} target="_blank" rel="noreferrer">Report →</a></div>
        </div>
        <div className="card finding">
          <div className="big">$57</div>
          <h3>The cheapest-looking token is often the trap</h3>
          <p>On a real Binance Agentic Wallet quote, $1,000 of SPYx — screen price $765 — would buy about $57 of
            stock. NVDAx returned no liquidity at all. Both are what a price-comparing router buys first.</p>
          <div className="ev"><a href={href.buy("SPY")}>Best execution →</a><a href={file("skills/assay/scripts/best.mjs")} target="_blank" rel="noreferrer">Script →</a></div>
        </div>
        <div className="card finding">
          <div className="big">~6%</div>
          <h3>Binance's wallet router ignores the multiplier</h3>
          <p>The Agentic Wallet quotes Ondo tokens as if one token were one share. Selling PFEon through it gives up
            about 6% — every reinvested dividend. Measured on quotes across six stocks; not settled trades.</p>
          <div className="ev"><a href={file("skills/assay/scripts/router-check.mjs")} target="_blank" rel="noreferrer">Reproduce →</a><a href={`${REPO}/blob/main/DEVEX.md#the-router-prices-ondo-tokens-per-share-not-per-token--critical`} target="_blank" rel="noreferrer">Report →</a></div>
        </div>
        <div className="card finding" style={{ gridColumn: "1 / -1" }}>
          <div className="big">{beat}</div>
          <h3>More accurate at the open than Binance's own reference</h3>
          <p>At every US open, Assay is scored against every alternative on the price that actually prints. Its
            average error is {beat} lower than the venue's own pre-open reference{o ? `, over ${o.events} opens and ${o.tickers} stocks` : ""}. Against
            always using Ondo it leads narrowly — a small sample, stated as such.</p>
          <div className="ev"><a href={href.scorecard}>Scorecard →</a><a href={file("src/scorecard/score.ts")} target="_blank" rel="noreferrer">Method →</a></div>
        </div>
      </div>

      <section className="section">
        <div className="section-head"><div><h2>How Assay works</h2><p>The same engine runs in the live API, the collector and the test suite.</p></div></div>
        <div className="steps">
          <div className="card step"><div className="n">1</div><h3>Normalize</h3><p>Divide each token's price by the shares it holds, so tokens from different issuers become comparable.</p></div>
          <div className="card step"><div className="n">2</div><h3>Validate</h3><p>Reject paused tokens, corrupt multipliers, stale prices and outliers — with the reason shown.</p></div>
          <div className="card step"><div className="n">3</div><h3>Weigh</h3><p>Score each token's trust from holders, traders, freshness and data consistency.</p></div>
          <div className="card step"><div className="n">4</div><h3>Price and route</h3><p>Publish one trust-weighted price per share, and rank tokens by real stock received for a buy.</p></div>
        </div>
      </section>

      <section className="section">
        <div className="card card-body" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Use it from an agent</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              The Assay skill works alongside Binance's Agentic Wallet skill: Assay decides what to buy on
              executable quotes, the wallet buys it after you confirm.
            </p>
            <div className="code" style={{ maxWidth: 520 }}><code>npx skills add techbone/assay/skills/assay</code></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn" href={`${REPO}/blob/main/DEVEX.md`} target="_blank" rel="noreferrer">Developer report</a>
            <a className="btn primary" href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>
          </div>
        </div>
      </section>
    </Page>
  );
}
