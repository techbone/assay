import { api, type EstimatorSummary } from "../api.js";
import { Fail, Loading, Page } from "../components/Layout.js";
import { ago, utc } from "../format.js";
import { useAsync } from "../useAsync.js";

const NAMES: Record<string, [string, string]> = {
  assay: ["Assay", "Trust-weighted and validated — the full engine"],
  only_Ondo: ["Always Ondo", "Use the Ondo token's price, adjusted"],
  only_bStock: ["Always bStock", "Use the bStock token's price, adjusted"],
  only_xStock: ["Always xStock", "Use the xStock token's price, adjusted"],
  venue_ref: ["Binance reference", "The venue's own pre-open reference price"],
  adj_median: ["Adjusted median", "Median of adjusted prices — no trust weighting"],
  raw_median: ["Raw median", "Median of screen prices — what a naive dashboard shows"],
};
const name = (e: string) => NAMES[e]?.[0] ?? e.replace(/^only_/, "Always ").replace(/_/g, " ");
const desc = (e: string) => NAMES[e]?.[1] ?? "";

/** Bars share one scale capped here, so the useful range isn't flattened by 7000bp outliers. */
const CAP = 60;
/** Estimates scored on fewer stock-opens than this are too thin to rank, and are hidden. */
const MIN_N = 20;

export function Scorecard() {
  const s = useAsync(() => api.scorecard(), []);

  return (
    <Page>
      <div className="section-head" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700 }}>Scorecard</h1>
          <p style={{ fontSize: 15.5, maxWidth: "72ch" }}>
            Every time the US market opens, the price that prints becomes checkable. Just before each
            open, Assay records every estimate a person could have formed — including the ones that might
            beat it — and scores them all against the opening price. Lower is better. Nothing is
            back-fitted, and only real opens count: the estimate and the opening price must be
            recorded within ten minutes of each other.
          </p>
        </div>
      </div>

      {s.loading && <div className="card"><Loading lines={6} /></div>}
      {s.error && <div className="card"><Fail error={s.error} /></div>}
      {s.data && (s.data.overall.events === 0 ? (
        <div className="card empty">
          No market opens scored yet. The scorecard needs the collector to record both sides of a US
          open, and stays empty rather than show a number it hasn't earned.
        </div>
      ) : (() => {
        const o = s.data.overall;
        const assay = o.summary.find((x) => x.estimator === "assay");
        const venue = o.summary.find((x) => x.estimator === "venue_ref");
        const ondo = o.summary.find((x) => x.estimator === "only_Ondo");
        const full = Math.max(...o.summary.map((x) => x.n));
        const shown = o.summary.filter((x) => x.n >= MIN_N);
        const hidden = o.summary.length - shown.length;
        return (
          <>
            <div className="stats" style={{ marginTop: 0 }}>
              <div className="card stat"><div className="stat-label">Market opens scored</div><div className="stat-value num">{o.events}</div><div className="stat-note">{o.tickers} stocks each</div></div>
              <div className="card stat"><div className="stat-label">Assay's average error</div><div className="stat-value num">{assay ? `${assay.maeBp.toFixed(1)} bp` : "—"}</div><div className="stat-note">vs the opening price</div></div>
              <div className="card stat"><div className="stat-label">vs Binance's own reference</div><div className="stat-value num">{assay && venue ? `${((1 - assay.maeBp / venue.maeBp) * 100).toFixed(0)}% lower` : "—"}</div><div className="stat-note">{venue ? `${venue.maeBp.toFixed(1)} bp average error` : ""}</div></div>
              <div className="card stat">
                <div className="stat-label">vs always using Ondo</div>
                <div className="stat-value num">
                  {!assay || !ondo ? "—" : Math.abs(assay.maeBp - ondo.maeBp) < 1 ? "Level" : assay.maeBp < ondo.maeBp ? `${(ondo.maeBp - assay.maeBp).toFixed(1)} bp better` : `${(assay.maeBp - ondo.maeBp).toFixed(1)} bp behind`}
                </div>
                <div className="stat-note">
                  {assay && ondo ? `${assay.maeBp.toFixed(1)} vs ${ondo.maeBp.toFixed(1)} bp average error` : ""}
                </div>
              </div>
            </div>

            <section className="section" style={{ marginTop: 32 }}>
              <div className="card">
                <div className="card-head">
                  <h3>Leaderboard</h3>
                  <span className="muted" style={{ fontSize: 13 }}>average absolute error at the open, all scored opens pooled</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Estimate</th>
                        <th>Average error</th>
                        <th className="hide-sm">Median</th>
                        <th className="hide-sm">90th percentile</th>
                        <th title="Stock-opens scored">Scored</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => <Row key={r.estimator} r={r} full={full} />)}
                    </tbody>
                  </table>
                </div>
                <div className="card-body" style={{ borderTop: "1px solid var(--border)" }}>
                  <p className="faint" style={{ fontSize: 13, lineHeight: 1.6 }}>
                    Only estimates scored on the same stocks are directly comparable — single-issuer estimates exist
                    for fewer stocks (see “Scored”). Assay vs adjusted median isolates what trust weighting is worth;
                    adjusted vs raw median isolates what the share multiplier is worth.
                    {hidden > 0 && <> {hidden} estimate{hidden === 1 ? "" : "s"} scored on fewer than {MIN_N} stock-opens {hidden === 1 ? "is" : "are"} not shown.</>}
                  </p>
                </div>
              </div>
            </section>

            <section className="section" style={{ marginTop: 32 }}>
              <div className="card">
                <div className="card-head">
                  <h3>Scored opens</h3>
                  {s.data.recordedThrough && <span className="muted" style={{ fontSize: 13, marginLeft: "auto" }}>recorded through {utc(s.data.recordedThrough)} ({ago(s.data.recordedThrough)})</span>}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Market open</th><th className="left hide-sm">From session</th><th>Stocks</th><th className="left">Most accurate</th><th>Assay error</th></tr></thead>
                    <tbody>
                      {s.data.events.map((e) => {
                        const best = e.summary[0]; const mine = e.summary.find((x) => x.estimator === "assay");
                        return (
                          <tr key={e.openTs}>
                            <td>{utc(e.openTs)}</td>
                            <td className="left hide-sm muted">{e.previousRegime}</td>
                            <td>{e.scores.length}</td>
                            <td className="left">{best ? <span className={best.estimator === "assay" ? "tag accent" : "muted"}>{name(best.estimator)}</span> : "—"}</td>
                            <td>{mine ? `${mine.maeBp.toFixed(1)} bp` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        );
      })())}
    </Page>
  );
}

function Row({ r, full }: { r: EstimatorSummary; full: number }) {
  const hl = r.estimator === "assay";
  return (
    <tr className={hl ? "hl" : ""}>
      <td>
        <div style={{ fontWeight: 600, color: "var(--text)" }}>{name(r.estimator)}</div>
        {desc(r.estimator) && <div className="faint" style={{ fontSize: 12, whiteSpace: "normal" }}>{desc(r.estimator)}</div>}
      </td>
      <td>
        <span className="mae">
          <span className="bar hide-sm"><i style={{ width: `${Math.min(1, r.maeBp / CAP) * 100}%` }} /></span>
          <span className="num" style={{ minWidth: 70, fontWeight: hl ? 600 : 400 }}>{r.maeBp.toFixed(1)} bp</span>
        </span>
      </td>
      <td className="hide-sm muted">{r.medianBp.toFixed(1)} bp</td>
      <td className="hide-sm muted">{r.p90Bp.toFixed(1)} bp</td>
      <td className={r.n < full ? "faint" : "muted"}>{r.n}</td>
    </tr>
  );
}
