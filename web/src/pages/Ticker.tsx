import { useState } from "react";
import { api, REGIME_LABEL, type Quote } from "../api.js";
import { BasisChart } from "../components/Chart.js";
import { BuyPanel } from "../components/BuyPanel.js";
import { Fail, Loading, Page } from "../components/Layout.js";
import { Issuer, Issuers, Trust } from "../components/bits.js";
import { bp, reason, usd } from "../format.js";
import { href } from "../router.js";
import { useAsync } from "../useAsync.js";

export function Ticker({ ticker }: { ticker: string }) {
  const d = useAsync(() => api.ticker(ticker), [ticker]);
  const h = useAsync(() => api.history(ticker, 48), [ticker]);
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <Page>
      <div className="crumbs"><a href={href.home}>Markets</a> / {ticker}</div>
      {d.loading && <div className="card"><Loading lines={5} /></div>}
      {d.error && <div className="card"><Fail error={d.error} /></div>}
      {d.data && (() => {
        const r = d.data;
        // Same bar as the buy router and the market table: not rejected, trust >= 0.5.
        const kept = r.quotes.filter((q) => !q.rejected);
        const trusted = kept.filter((q) => q.trust >= 0.5);
        const lead = [...kept].filter((q) => q.multiplierKind === "drift")
          .sort((a, b) => Math.abs(b.multiplierEffectBp) - Math.abs(a.multiplierEffectBp))[0];
        const adj = trusted.map((q) => q.adjusted);
        const spread = adj.length > 1 ? (Math.max(...adj) / Math.min(...adj) - 1) * 10_000 : 0;
        const charted = h.data?.wrappers.map((w) => w.symbol) ?? [];
        const chartSymbol = focus ?? (lead && charted.includes(lead.symbol) ? lead.symbol : charted[0]) ?? "";

        return (
          <>
            <div className="t-head">
              <div>
                <h1>{r.ticker}</h1>
                <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <Issuers families={r.quotes.map((q) => q.family)} />
                  <span className="faint">· {r.quotes.length} tokens on BNB Smart Chain</span>
                </div>
              </div>
              <div className="t-price">
                <div className="big num">{usd(r.assayPrice)}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  per share · ±{r.confidenceBp.toFixed(1)} bp · {REGIME_LABEL[r.regime]}
                </div>
              </div>
            </div>

            <div className="card facts">
              <div className="fact"><div className="stat-label">Venue reference</div><div className="v num">{usd(r.referencePrice)}</div></div>
              <div className="fact"><div className="stat-label">Largest phantom premium</div><div className="v num">{lead ? bp(lead.multiplierEffectBp) : "—"}</div></div>
              <div className="fact"><div className="stat-label">Real spread between tokens</div><div className="v num">{trusted.length > 1 ? `${spread.toFixed(1)} bp` : "—"}</div></div>
              <div className="fact"><div className="stat-label">Trusted tokens</div><div className="v num">{trusted.length} of {r.quotes.length}</div></div>
            </div>

            {lead && Math.abs(lead.naiveBasisBp) >= 1 && (
              <p className="callout">
                <b>{lead.symbol}</b> trades at {usd(lead.price)}, which looks <b>{bp(lead.naiveBasisBp)}</b>{" "}
                {lead.naiveBasisBp >= 0 ? "above" : "below"} the fair price. <b>{bp(lead.multiplierEffectBp)}</b> of that is
                reinvested dividends held in its share multiplier ({lead.multiplier.toFixed(5)} shares per token). The real
                difference is <b>{bp(lead.trueBasisBp)}</b>.
              </p>
            )}

            <section className="section" style={{ marginTop: 32 }}>
              <div className="section-head">
                <div>
                  <h2>Tokens</h2>
                  <p>Each token's price, what it really holds, and how far its price can be trusted.</p>
                </div>
              </div>
              <div className="card"><div className="table-wrap"><TokenTable quotes={r.quotes} /></div></div>
            </section>

            <section className="section" style={{ marginTop: 32 }}>
              <BuyPanel ticker={r.ticker} />
            </section>

            <section className="section" style={{ marginTop: 32 }}>
              <div className="card">
                <div className="card-head">
                  <h3>Apparent vs real premium, last 48 hours</h3>
                  {charted.length > 1 && (
                    <div className="seg" style={{ marginLeft: "auto" }}>
                      {charted.map((s) => <button key={s} className={s === chartSymbol ? "on" : ""} onClick={() => setFocus(s)}>{s}</button>)}
                    </div>
                  )}
                </div>
                <div className="card-body">
                  {h.loading && <Loading lines={4} />}
                  {h.error && <div className="empty">History is recorded for stocks with three or more tokens. {r.ticker} has {r.quotes.length}.</div>}
                  {h.data && <BasisChart series={h.data} symbol={chartSymbol} />}
                  {h.data && (
                    <div className="legend" style={{ marginTop: 12 }}>
                      <span><i style={{ background: "var(--chart-naive)" }} />Apparent premium — what comparing prices shows</span>
                      <span><i style={{ background: "var(--chart-real)" }} />Real premium — after the share multiplier</span>
                      <span className="faint">Shaded gap = phantom premium · basis points · UTC · blank = not recorded</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="section" style={{ marginTop: 32 }}>
              <div className="card card-body">
                <dl className="defs" style={{ margin: 0 }}>
                  <div><dt>Shares per token</dt><dd>How many real shares one token represents. Ondo tokens reinvest dividends, so this slowly rises above 1; some tokens are fractions or multiples of a share.</dd></div>
                  <div><dt>Per real share</dt><dd>The token price divided by its shares per token. This is the number you can compare across issuers.</dd></div>
                  <div><dt>Phantom premium</dt><dd>The part of a token's apparent premium that is only its share multiplier. It looks like price but isn't.</dd></div>
                  <div><dt>Trust</dt><dd>0 to 1, from how many people hold and trade the token, how fresh its price is, and whether its data is consistent. Untrusted prices don't count.</dd></div>
                </dl>
              </div>
            </section>
          </>
        );
      })()}
    </Page>
  );
}

function TokenTable({ quotes }: { quotes: Quote[] }) {
  const rows = [...quotes].sort((a, b) => Number(!!a.rejected) - Number(!!b.rejected) || b.trust - a.trust);
  return (
    <table>
      <thead>
        <tr>
          <th>Token</th>
          <th>Screen price</th>
          <th className="hide-sm">Shares / token</th>
          <th>Per real share</th>
          <th className="hide-sm" title="Premium vs the fair price, as comparing screen prices shows it">Looks like</th>
          <th className="hide-sm" title="Part of that premium which is only the share multiplier">Of which dividends</th>
          <th title="What is actually there">Real premium</th>
          <th className="hide-sm">Trust</th>
          <th className="left">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((q) => {
          const unit = q.multiplierKind === "fractional";
          return (
            <tr key={q.symbol} className={q.rejected ? "dim" : ""}>
              <td>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <b style={{ fontWeight: 600, color: q.rejected ? "var(--text-3)" : "var(--text)" }}>{q.symbol}</b>
                  <Issuer family={q.family} />
                </span>
              </td>
              <td>{usd(q.price)}</td>
              <td className="hide-sm">{q.multiplier.toFixed(unit ? 2 : 5)}</td>
              <td style={{ fontWeight: 550 }}>{usd(q.adjusted)}</td>
              <td className="hide-sm muted">{unit ? "—" : bp(q.naiveBasisBp)}</td>
              <td className="hide-sm muted">{unit ? <span className="tag" title="A unit conversion, not a premium">unit {q.multiplier >= 1 ? `1:${q.multiplier.toFixed(0)}` : `${(1 / q.multiplier).toFixed(0)}:1`}</span> : bp(q.multiplierEffectBp)}</td>
              <td>{bp(q.trueBasisBp)}</td>
              <td className="hide-sm"><Trust value={q.trust} /></td>
              <td className="left">
                {q.rejected ? <span className="tag bad">{reason(q.rejected)}</span>
                  : q.trust < 0.5 ? <span className="tag warn">Thin</span>
                  : <span className="tag good">Trusted</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
