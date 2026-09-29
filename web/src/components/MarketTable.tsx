import { useMemo, useState } from "react";
import type { TickerRow } from "../api.js";
import { bp, usd } from "../format.js";
import { href } from "../router.js";
import { Issuers } from "./bits.js";

type Key = "ticker" | "assayPrice" | "phantomBp" | "realSpreadBp" | "confidenceBp" | "trusted";
const COLS: Array<{ key: Key; label: string; title: string; left?: boolean; hideSm?: boolean }> = [
  { key: "ticker", label: "Stock", title: "Underlying stock or ETF", left: true },
  { key: "assayPrice", label: "Price per share", title: "Assay's trust-weighted price per real share" },
  { key: "phantomBp", label: "Phantom premium", title: "How much of a token's apparent premium is only reinvested dividends in its share multiplier" },
  { key: "realSpreadBp", label: "Real spread", title: "How far the trusted tokens disagree once adjusted", hideSm: true },
  { key: "confidenceBp", label: "Confidence", title: "± basis points around the price", hideSm: true },
  { key: "trusted", label: "Trusted", title: "Tokens with a price trustworthy enough to act on / tokens listed" },
];

export function MarketTable({ rows }: { rows: TickerRow[] }) {
  const [q, setQ] = useState("");
  const [only3, setOnly3] = useState(false);
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "phantomBp", desc: true });

  const view = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const out = rows.filter((r) => (!needle || r.ticker.includes(needle)) && (!only3 || r.wrappers >= 3));
    const val = (r: TickerRow): number | string =>
      sort.key === "ticker" ? r.ticker : sort.key === "phantomBp" ? Math.abs(r.phantomBp) : r[sort.key];
    return out.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.desc ? -c : c;
    });
  }, [rows, q, only3, sort]);

  const click = (key: Key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "ticker" }));

  return (
    <div className="card">
      <div className="card-head">
        <input className="input" placeholder="Search ticker — NVDA, SPY, TSLA…" value={q}
               onChange={(e) => setQ(e.target.value)} style={{ width: 280, maxWidth: "100%" }} aria-label="Search ticker" />
        <div className="seg" role="group" aria-label="Filter">
          <button className={!only3 ? "on" : ""} onClick={() => setOnly3(false)}>All</button>
          <button className={only3 ? "on" : ""} onClick={() => setOnly3(true)}>Three issuers</button>
        </div>
        <span className="faint" style={{ marginLeft: "auto", fontSize: 13 }}>{view.length} stocks</span>
      </div>
      <div className="table-wrap scroll">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} title={c.title} onClick={() => click(c.key)}
                    className={`sortable ${c.left ? "left" : ""} ${c.hideSm ? "hide-sm" : ""}`}>
                  {c.label} <span className="arrow">{sort.key === c.key ? (sort.desc ? "↓" : "↑") : ""}</span>
                </th>
              ))}
              <th className="left hide-sm">Issuers</th>
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.ticker} className="link" onClick={() => { location.hash = href.ticker(r.ticker); }}>
                <td>
                  <a className="tk" href={href.ticker(r.ticker)} onClick={(e) => e.stopPropagation()}>{r.ticker}</a>
                  {r.fractional.length > 0 && (
                    <span className="tag" style={{ marginLeft: 8 }}
                          title={`${r.fractional.map((f) => `${f.symbol}: 1 token = ${f.multiplier.toFixed(2)} shares`).join("; ")} — a unit conversion, not a premium`}>
                      unit {r.fractional[0]!.multiplier >= 1 ? `1:${r.fractional[0]!.multiplier.toFixed(0)}` : `${(1 / r.fractional[0]!.multiplier).toFixed(0)}:1`}
                    </span>
                  )}
                </td>
                <td>{usd(r.assayPrice)}</td>
                <td style={{ color: Math.abs(r.phantomBp) >= 1 ? "var(--text)" : "var(--text-3)" }}>
                  {Math.abs(r.phantomBp) >= 0.05 ? bp(r.phantomBp) : "—"}
                </td>
                <td className="hide-sm muted">{r.trusted > 1 ? bp(r.realSpreadBp).replace("+", "") : "—"}</td>
                <td className="hide-sm muted">±{r.confidenceBp.toFixed(1)} bp</td>
                <td>
                  <span className={r.trusted < r.wrappers ? "" : "muted"}>{r.trusted}</span>
                  <span className="faint"> / {r.wrappers}</span>
                </td>
                <td className="left hide-sm"><Issuers families={r.families} /></td>
                <td className="chev">›</td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={8} className="empty">No stock matches “{q}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
