import { api, REGIME_LABEL, type Quote } from "../api.js";
import { reason, usd } from "../format.js";
import { href } from "../router.js";
import { useAsync } from "../useAsync.js";
import { Loading } from "./Layout.js";
import { Issuer } from "./bits.js";

/** Same bar the best-execution router uses for recommending on a last-trade price. */
const TRUSTED = 0.5;
const trusted = (q: Quote) => !q.rejected && q.trust >= TRUSTED;

/**
 * The concept in one glance, on live data: one stock, several tokens, several prices -
 * and the token with the lowest price is not the cheapest way to own the stock.
 */
export function ExampleCard({ ticker = "SPY" }: { ticker?: string }) {
  const d = useAsync(() => api.ticker(ticker), [ticker]);

  return (
    <div className="card example">
      <div className="card-head">
        <h3>{ticker}: one stock, {d.data ? d.data.quotes.length : "several"} tokens</h3>
        <span className="tag" style={{ marginLeft: "auto" }}>
          <span className="dot live" style={{ marginRight: 6 }} />Live{d.data ? ` · ${REGIME_LABEL[d.data.regime]}` : ""}
        </span>
      </div>
      {d.loading && <Loading lines={4} />}
      {d.data && (() => {
        const qs = [...d.data.quotes].sort((a, b) => a.adjusted - b.adjusted);
        const ok = qs.filter(trusted);
        const bestShare = ok[0];
        const cheapToken = [...ok].sort((a, b) => a.price - b.price)[0];
        const out = qs.filter((q) => !trusted(q));
        return (
          <>
            <div className="row head">
              <span>Token</span><span>Screen price</span><span>Shares</span><span>Per real share</span>
            </div>
            {qs.map((q) => (
              <div key={q.symbol} className={`row ${q === bestShare ? "best" : ""} ${!trusted(q) ? "out" : ""}`}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontWeight: 600, color: trusted(q) ? "var(--text)" : undefined }}>{q.symbol}</b>
                  <Issuer family={q.family} />
                </span>
                <span className="num">{usd(q.price)}</span>
                <span className="num">{q.multiplier.toFixed(4)}</span>
                <span className="num" style={{ fontWeight: q === bestShare ? 600 : 400 }}>
                  {trusted(q) ? usd(q.adjusted) : <span className="tag">{q.rejected ? reason(q.rejected) : "Too thin"}</span>}
                </span>
              </div>
            ))}
            <div className="insight">
              {bestShare && cheapToken && cheapToken !== bestShare ? (
                <><b>{cheapToken.symbol}</b> shows the lower price, but <b>{bestShare.symbol}</b> is cheaper per
                  real share: each {bestShare.symbol} token holds {bestShare.multiplier.toFixed(4)} shares.</>
              ) : bestShare ? (
                <><b>{bestShare.symbol}</b> is the cheapest way to own {ticker} right now, per real share.</>
              ) : null}
              {out.length > 0 && (
                <> {out.map((q) => q.symbol).join(", ")} {out.length === 1 ? "is" : "are"} excluded — too thin or
                  unreliable to trust {out.length === 1 ? "its" : "their"} price.</>
              )}{" "}
              <a href={href.ticker(ticker)}>Open {ticker} →</a>
            </div>
          </>
        );
      })()}
    </div>
  );
}
