import type { Summary } from "../api.js";
import { api } from "../api.js";
import { ExampleCard } from "../components/ExampleCard.js";
import { Fail, Loading, Page } from "../components/Layout.js";
import { MarketTable } from "../components/MarketTable.js";
import { bp } from "../format.js";
import { href } from "../router.js";
import { useAsync } from "../useAsync.js";

export function Home({ summary }: { summary?: Summary }) {
  const t = useAsync(() => api.tickers(), []);
  const lead = summary?.phantomLeader;
  const rejected = summary ? Object.values(summary.rejected).reduce((a, b) => a + b, 0) : 0;

  return (
    <Page>
      <section className="hero">
        <div>
          <div className="eyebrow">Tokenized stocks on BNB Chain</div>
          <h1>The real price of a tokenized stock.</h1>
          <p className="hero-copy">
            The same company trades on BNB Smart Chain as up to three tokens from different issuers,
            each at its own price. Assay adjusts every token for the shares it really holds, checks
            whether its price can be trusted, and tells you what the stock is worth — and which
            token buys you the most of it.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="#markets"
               onClick={(e) => { e.preventDefault(); document.getElementById("markets")?.scrollIntoView({ behavior: "smooth" }); }}>
              Explore markets
            </a>
            <a className="btn" href={href.findings}>What we found</a>
          </div>
        </div>
        <ExampleCard ticker="SPY" />
      </section>

      <div className="stats">
        <div className="card stat">
          <div className="stat-label">Stocks tracked</div>
          <div className="stat-value num">{summary ? summary.tickers : "—"}</div>
          <div className="stat-note">{summary ? `${summary.wrappers} tokens from 3 issuers` : " "}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Median phantom premium</div>
          <div className="stat-value num">{summary ? `${summary.phantomBp.median.toFixed(0)} bp` : "—"}</div>
          <div className="stat-note">reinvested dividends that look like price</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Largest phantom premium</div>
          <div className="stat-value num">{lead ? `${Math.abs(lead.phantomBp).toFixed(0)} bp` : "—"}</div>
          <div className="stat-note">
            {lead ? <>{lead.symbol} · real premium {bp(lead.trueBasisBp)}</> : " "}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Prices rejected now</div>
          <div className="stat-value num">{summary ? rejected : "—"}</div>
          <div className="stat-note">
            {summary ? "stale, paused, corrupt or outlier prices, with the reason shown" : " "}
          </div>
        </div>
      </div>

      <section className="section" id="markets">
        <div className="section-head">
          <div>
            <h2>Markets</h2>
            <p>
              Every stock listed on BSC under more than one token. <b>Phantom premium</b> is how much of a
              token's apparent premium is only reinvested dividends in its share multiplier — it looks
              like price, but isn't. Select a stock to see every token and the best one to buy.
            </p>
          </div>
        </div>
        {t.loading && <div className="card"><Loading lines={8} /></div>}
        {t.error && <div className="card"><Fail error={t.error} /></div>}
        {t.data && <MarketTable rows={t.data} />}
      </section>
    </Page>
  );
}
