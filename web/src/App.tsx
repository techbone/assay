import { useEffect, useState } from "react";
import { api, REGIME_LABEL, type Quote, type Summary, type TickerDetail, type TickerRow, type HistoryPoint } from "./api.js";
import { BasisChart } from "./Chart.js";
import { ScorecardPage } from "./Scorecard.js";
import { useAsync } from "./useAsync.js";
import { ago, bp, bpClass, compact, usd } from "./format.js";

const useHash = (): string => {
  const [h, setH] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const on = () => setH(location.hash.slice(1));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
};

export function App() {
  const hash = useHash();
  const ticker = hash.startsWith("/t/") ? hash.slice(3) : null;
  const onScorecard = hash.startsWith("/scorecard");
  const s = useAsync(() => api.summary(), [ticker === null]);

  return (
    <>
      <header className="top">
        <div className="top-in">
          <a className="brand" href="#/">
            <span className="mark">◈</span>
            <b>ASSAY</b>
            <span className="hide-sm">the real price of a tokenized stock</span>
          </a>
          <div className="spacer" />
          <a href="#/scorecard" className="navlink" style={{
            color: onScorecard ? "var(--gold)" : "var(--muted)", fontSize: 13, marginRight: 4,
          }}>Scorecard</a>
          {s.data && <StatusPill summary={s.data} />}
        </div>
      </header>
      <div className="shell">
        {onScorecard
          ? <ScorecardPage />
          : ticker
            ? <Detail ticker={ticker} />
            : <Home summary={s.data} error={s.error} />}
        <footer>
          Assay reads the Binance Web3 RWA API and BNB Smart Chain. Every figure is recomputed
          through the same engine the test suite pins — the site cannot disagree with the tests.
          {" "}Built for BNB Hack: Tokenized Stocks Edition.
        </footer>
      </div>
    </>
  );
}

function StatusPill({ summary }: { summary: Summary }) {
  const age = summary.ts ? (Date.now() - summary.ts) / 60_000 : Infinity;
  const live = age < 6;
  return (
    <div className="pill">
      <i className={`dot ${live ? "live" : "warn"}`} />
      <span className="mono">{REGIME_LABEL[summary.regime]}</span>
      <span style={{ color: "var(--dim)" }}>· {ago(summary.ts)}</span>
    </div>
  );
}

function Home({ summary, error }: { summary?: Summary; error?: string }) {
  const t = useAsync(() => api.tickers(), []);
  if (error) return <div className="err">API unreachable: {error}. Is the collector running?</div>;

  const hours = summary?.coverage.firstTs
    ? (Date.now() - summary.coverage.firstTs) / 3_600_000 : 0;

  return (
    <>
      <div className="hero">
        <h1>There is no single price<br />for <em>one tokenized stock.</em></h1>
        <p>
          On BNB Smart Chain the same company is listed by three issuers at three different prices.
          None of them are comparable, because each token carries its own share multiplier — drifting
          upward as dividends reinvest, and jumping on splits. Assay removes it, scores how far each
          wrapper can be trusted, and publishes one reference price.
        </p>
        {summary && (
          <div className="stats">
            <Stat k="Tickers tracked" v={String(summary.tickers)}
                  s={`${summary.wrappers} wrappers on BSC`} />
            <Stat k="Median phantom premium" v={`${summary.phantomBp.median.toFixed(0)} bp`} gold
                  s={`accrued distribution, not price · n=${summary.phantomBp.n}`} />
            <Stat k="Largest phantom premium" v={`${summary.phantomBp.max.toFixed(0)} bp`} gold
                  s="entirely dividends, zero real basis" />
            <Stat k="Quotes rejected" v={String(Object.values(summary.rejected).reduce((a, b) => a + b, 0))}
                  s={Object.entries(summary.rejected).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, " ")}`).join(" · ")} />
            <Stat k="Observations" v={compact(summary.coverage.observations)}
                  s={`${hours.toFixed(1)}h across ${summary.coverage.cycles} cycles`} />
          </div>
        )}
      </div>

      <section>
        <div className="h2row">
          <h2>Wrappers by phantom premium</h2>
          <span className="note">
            how much of each apparent premium is the multiplier rather than the market — highest first
          </span>
        </div>
        <div className="panel">
          {t.loading && <div className="empty">Loading…</div>}
          {t.error && <div className="err">{t.error}</div>}
          {t.data && (
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="hide-sm">Issuers</th>
                  <th>Assay price</th>
                  <th className="hide-sm">Reference</th>
                  <th>Phantom</th>
                  <th className="hide-sm">Confidence</th>
                  <th>Wrappers</th>
                </tr>
              </thead>
              <tbody>
                {t.data.slice(0, 60).map((r) => <Row key={r.ticker} r={r} />)}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ k, v, s, gold }: { k: string; v: string; s: string; gold?: boolean }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v${gold ? " gold" : ""}`}>{v}</div>
      <div className="s">{s}</div>
    </div>
  );
}

function Row({ r }: { r: TickerRow }) {
  return (
    <tr onClick={() => { location.hash = `/t/${r.ticker}`; }}>
      <td className="tkr">{r.ticker}</td>
      <td className="hide-sm">
        <span className="fam">
          {[...new Set(r.families)].map((f) => <i key={f} className={f}>{f}</i>)}
        </span>
      </td>
      <td className="num">{usd(r.assayPrice)}</td>
      <td className="num hide-sm" style={{ color: "var(--muted)" }}>
        {r.referencePrice ? usd(r.referencePrice) : "—"}
      </td>
      <td className={`num ${bpClass(r.phantomBp)}`}>{bp(r.phantomBp)} bp</td>
      <td className="num hide-sm" style={{ color: "var(--dim)" }}>±{r.confidenceBp.toFixed(1)} bp</td>
      <td className="num">
        {r.accepted}<span style={{ color: "var(--dim)" }}>/{r.wrappers}</span>
      </td>
    </tr>
  );
}

function Detail({ ticker }: { ticker: string }) {
  const d = useAsync(() => api.ticker(ticker), [ticker]);
  const h = useAsync(() => api.history(ticker, 48), [ticker]);
  const [focus, setFocus] = useState<string | null>(null);

  if (d.loading) return <div className="empty">Loading {ticker}…</div>;
  if (d.error || !d.data) return <div className="err">{d.error ?? "not found"}</div>;
  const r: TickerDetail = d.data;

  const headline = [...r.quotes]
    .filter((q) => !q.rejected && q.multiplierKind === "drift")
    .sort((a, b) => Math.abs(b.multiplierEffectBp) - Math.abs(a.multiplierEffectBp))[0];
  const chartSymbol = focus ?? headline?.symbol ?? r.quotes[0]?.symbol ?? "";

  return (
    <>
      <a className="back" href="#/">← all tickers</a>
      <div className="dhead">
        <h1>{r.ticker}</h1>
        <div className="price">
          {usd(r.assayPrice)}
          <small>assay price · ±{r.confidenceBp.toFixed(1)} bp · {REGIME_LABEL[r.regime]}</small>
        </div>
      </div>

      {headline && (
        <p className="claim">
          <b>{headline.symbol}</b> quotes <b>{usd(headline.price)}</b>, which looks{" "}
          <b>{bp(headline.naiveBasisBp)} bp</b> {headline.naiveBasisBp >= 0 ? "rich" : "cheap"} against
          the assay price. <b>{bp(headline.multiplierEffectBp)} bp</b> of that is accrued distribution
          held inside the share multiplier. The real basis is{" "}
          <b>{bp(headline.trueBasisBp)} bp</b>.
        </p>
      )}

      <section>
        <div className="h2row">
          <h2>Wrappers</h2>
          <span className="note">click one to chart it</span>
        </div>
        <div className="wrappers">
          {r.quotes.map((q) => (
            <WrapperCard key={q.symbol} q={q} active={q.symbol === chartSymbol}
                         onClick={() => setFocus(q.symbol)} />
          ))}
        </div>
      </section>

      <section>
        <div className="h2row">
          <h2>{chartSymbol} — apparent basis against real basis</h2>
          <span className="note">the shaded gap is the phantom premium</span>
        </div>
        <div className="panel chartwrap">
          {h.loading && <div className="empty">Loading history…</div>}
          {h.data && <BasisChart points={h.data as HistoryPoint[]} symbol={chartSymbol} />}
          <div className="dkey" style={{ marginTop: 10, paddingLeft: 52 }}>
            <span><em style={{ background: "#d9a441" }} />Naive basis — what a raw price comparison shows</span>
            <span><em style={{ background: "#5b8fd6" }} />Adjusted basis — what is actually there</span>
          </div>
        </div>
      </section>
    </>
  );
}

function WrapperCard({ q, active, onClick }: { q: Quote; active: boolean; onClick: () => void }) {
  const phantomShare = Math.abs(q.naiveBasisBp) > 0
    ? Math.min(100, (Math.abs(q.multiplierEffectBp) / Math.abs(q.naiveBasisBp)) * 100) : 0;

  return (
    <div className={`wcard${q.rejected ? " rejected" : ""}`} onClick={onClick}
         style={active ? { borderColor: "var(--gold-dim)" } : undefined}>
      <div className="wtop">
        <span className="wsym">{q.symbol}</span>
        {q.rejected
          ? <span className="rejtag">{q.rejected.toLowerCase().replace(/_/g, " ")}</span>
          : <span className="fam"><i className={q.family}>{q.family}</i></span>}
      </div>

      <div className="wrow"><span>Quoted</span><span>{usd(q.price)}</span></div>
      <div className="wrow"><span>Multiplier</span><span>{q.multiplier.toFixed(6)}</span></div>
      <div className="wrow"><span>Adjusted</span><span>{usd(q.adjusted)}</span></div>
      <div className="wrow">
        <span>Holders</span>
        <span>{q.holders || q.bnTrader ? compact((q.holders ?? 0) + (q.bnTrader ?? 0)) : "—"}</span>
      </div>

      <div className="wrow" style={{ marginTop: 4 }}>
        <span>Trust</span><span>{q.trust.toFixed(3)}</span>
      </div>
      <div className="trust"><i style={{ width: `${q.trust * 100}%` }} /></div>

      {q.multiplierKind !== "unit" && (
        <div className="decomp">
          <div className="wrow" style={{ padding: 0 }}>
            <span>Apparent basis</span>
            <span className={bpClass(q.naiveBasisBp)}>{bp(q.naiveBasisBp)} bp</span>
          </div>
          <div className="dbar">
            <i className="phantom" style={{ width: `${phantomShare}%` }} />
            <i className="real" style={{ width: `${100 - phantomShare}%` }} />
          </div>
          <div className="dkey">
            <span><em style={{ background: "var(--gold-dim)" }} />
              {q.multiplierKind === "fractional" ? "unit" : "phantom"} <b>{bp(q.multiplierEffectBp)}</b></span>
            <span><em style={{ background: "var(--blue)" }} />real <b>{bp(q.trueBasisBp)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}
