import { api, type EstimatorSummary } from "./api.js";
import { useAsync } from "./useAsync.js";

/** How each competing estimate is built, in plain terms. */
const EXPLAIN: Record<string, string> = {
  raw_median: "median of quoted prices, multiplier ignored — what a naive dashboard shows",
  adj_median: "median of multiplier-adjusted prices, no trust weighting",
  assay: "trust-weighted and validated — the full engine",
  venue_ref: "the venue's own pre-open reference price",
};

const label = (e: string) =>
  e.startsWith("only_") ? `only ${e.slice(5)}` : e.replace(/_/g, " ");

export function ScorecardPage() {
  const s = useAsync(() => api.scorecard(), []);

  if (s.loading) return <div className="empty">Loading scorecard…</div>;
  if (s.error) return <div className="err">{s.error}</div>;
  const d = s.data!;

  return (
    <>
      <div className="hero" style={{ paddingBottom: 26 }}>
        <h1>Whose estimate was <em>closest to the open?</em></h1>
        <p>
          When the US tape opens, every estimate formed just beforehand becomes checkable. Assay
          records them all — including the ones that would beat it — and scores them against the
          price that actually printed. Nothing here is back-fitted; each row was computed before
          the open it is scored against.
        </p>
      </div>

      {d.overall.events === 0 ? (
        <section>
          <div className="panel">
            <div className="empty" style={{ padding: 40, lineHeight: 1.7 }}>
              <b style={{ color: "var(--text)" }}>No opens scored yet.</b>
              <br />
              Every regular-hours session so far was lost to collector downtime. The scorecard
              stays empty rather than showing a number it has not earned — the first scoreable
              open will appear here automatically.
            </div>
          </div>
        </section>
      ) : (
        <>
          <section>
            <div className="h2row">
              <h2>Leaderboard</h2>
              <span className="note">
                pooled across {d.overall.events} open{d.overall.events === 1 ? "" : "s"} ·{" "}
                {d.overall.tickers} tickers · lower is better
              </span>
            </div>
            <div className="panel">
              <table>
                <thead>
                  <tr>
                    <th>Estimator</th>
                    <th>MAE (bp)</th>
                    <th className="hide-sm">Median</th>
                    <th className="hide-sm">p90</th>
                    <th>n</th>
                  </tr>
                </thead>
                <tbody>
                  {d.overall.summary.map((r, i) => <Row key={r.estimator} r={r} rank={i} />)}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 10, color: "var(--dim)", fontSize: 12.5 }}>
              <b>assay</b> vs <b>adj median</b> isolates what trust weighting is worth.{" "}
              <b>adj median</b> vs <b>raw median</b> isolates what multiplier normalization is worth.
            </p>
          </section>

          <section>
            <div className="h2row">
              <h2>Scored opens</h2>
              <span className="note">most recent first</span>
            </div>
            <div className="panel">
              <table>
                <thead>
                  <tr>
                    <th>Open (UTC)</th>
                    <th className="hide-sm">From</th>
                    <th>Tickers</th>
                    <th>Best</th>
                    <th>Assay MAE</th>
                  </tr>
                </thead>
                <tbody>
                  {d.events.map((e) => {
                    const best = e.summary[0];
                    const mine = e.summary.find((x) => x.estimator === "assay");
                    return (
                      <tr key={e.openTs} style={{ cursor: "default" }}>
                        <td className="mono">
                          {new Date(e.openTs).toISOString().slice(5, 16).replace("T", " ")}
                        </td>
                        <td className="hide-sm" style={{ color: "var(--muted)" }}>{e.previousRegime}</td>
                        <td className="num">{e.scores.length}</td>
                        <td className="num" style={{ color: best?.estimator === "assay" ? "var(--gold)" : "var(--muted)" }}>
                          {best ? label(best.estimator) : "—"}
                        </td>
                        <td className="num">{mine ? `${mine.maeBp.toFixed(1)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Row({ r, rank }: { r: EstimatorSummary; rank: number }) {
  const isAssay = r.estimator === "assay";
  return (
    <tr style={{ cursor: "default", background: isAssay ? "rgba(217,164,65,.06)" : undefined }}>
      <td>
        <span className="tkr" style={{ color: isAssay ? "var(--gold)" : undefined }}>
          {rank === 0 ? "★ " : ""}{label(r.estimator)}
        </span>
        {EXPLAIN[r.estimator] && (
          <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 2 }}>{EXPLAIN[r.estimator]}</div>
        )}
      </td>
      <td className="num" style={{ color: isAssay ? "var(--gold)" : undefined }}>{r.maeBp.toFixed(1)}</td>
      <td className="num hide-sm" style={{ color: "var(--muted)" }}>{r.medianBp.toFixed(1)}</td>
      <td className="num hide-sm" style={{ color: "var(--dim)" }}>{r.p90Bp.toFixed(1)}</td>
      <td className="num" style={{ color: "var(--dim)" }}>{r.n}</td>
    </tr>
  );
}
