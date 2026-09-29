import { api } from "../api.js";
import { BuyPanel } from "../components/BuyPanel.js";
import { Page } from "../components/Layout.js";
import { href } from "../router.js";
import { useAsync } from "../useAsync.js";

export function Buy({ ticker }: { ticker?: string }) {
  const t = useAsync(() => api.tickers(), []);
  const current = ticker ?? "SPY";
  const options = t.data ? [...t.data].sort((a, b) => b.wrappers - a.wrappers || a.ticker.localeCompare(b.ticker)) : [];

  return (
    <Page>
      <div className="section-head" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700 }}>Best execution</h1>
          <p style={{ fontSize: 15.5, maxWidth: "72ch" }}>
            The token with the lowest price isn't always the cheapest way to own a stock. Assay ranks every
            token by how many real shares your money buys — and won't route you to a price too thin to trust.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>Stock</span>
          <select className="input" value={current} onChange={(e) => { location.hash = href.buy(e.target.value); }}
                  style={{ width: 180 }} aria-label="Stock">
            {!t.data && <option>{current}</option>}
            {options.map((r) => <option key={r.ticker} value={r.ticker}>{r.ticker} · {r.wrappers} tokens</option>)}
          </select>
        </label>
      </div>
      <BuyPanel ticker={current} />
    </Page>
  );
}
