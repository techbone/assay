import type { HistorySeries } from "../api.js";

/** A gap longer than this between recorded points is drawn as a gap, not a line. */
const GAP_MS = 20 * 60_000;

/** Round tick values (…, 10, 20, 50, 100…) instead of evenly-spaced fractions of the range. */
function niceTicks(lo: number, hi: number, target = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/**
 * Apparent vs real premium for one token over time. The shaded gap between them is the
 * phantom premium. Periods the collector did not record are left blank rather than joined,
 * so a straight line never stands in for data that was not collected.
 */
export function BasisChart({ series, symbol }: { series: HistorySeries; symbol: string }) {
  const W = 900, H = 260, PL = 48, PR = 12, PT = 12, PB = 28;
  const w = series.wrappers.find((x) => x.symbol === symbol);
  const pts = !w ? [] : series.ts
    .map((ts, i) => ({ ts, a: w.naive[i], r: w.adj[i] }))
    .filter((p): p is { ts: number; a: number; r: number } => typeof p.a === "number" && typeof p.r === "number");

  if (pts.length < 2) return <div className="empty">Not enough recorded history for {symbol} yet.</div>;

  // Split into runs wherever collection stopped.
  const runs: typeof pts[] = [];
  for (const p of pts) {
    const run = runs.at(-1);
    if (run && p.ts - run.at(-1)!.ts <= GAP_MS) run.push(p); else runs.push([p]);
  }

  const x0 = pts[0]!.ts, x1 = pts[pts.length - 1]!.ts;
  const vals = pts.flatMap((p) => [p.a, p.r]).concat(0);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(2, (hi - lo) * 0.1);
  const ticks = niceTicks(lo - pad, hi + pad);
  const y0 = Math.min(lo - pad, ticks[0]!), y1 = Math.max(hi + pad, ticks.at(-1)!);
  const px = (t: number) => PL + ((t - x0) / (x1 - x0 || 1)) * (W - PL - PR);
  const py = (v: number) => PT + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PT - PB);
  const line = (run: typeof pts, k: "a" | "r") =>
    run.map((p, i) => `${i ? "L" : "M"}${px(p.ts).toFixed(1)},${py(p[k]).toFixed(1)}`).join("");
  const band = (run: typeof pts) =>
    line(run, "a") + [...run].reverse().map((p) => `L${px(p.ts).toFixed(1)},${py(p.r).toFixed(1)}`).join("") + "Z";
  const gaps = runs.slice(1).map((run, i) => [runs[i]!.at(-1)!.ts, run[0]!.ts] as const);
  const days = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  const fmt = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
         aria-label={`Apparent versus real premium for ${symbol}`}>
      {gaps.map(([a, b]) => (
        <g key={a}>
          <rect x={px(a)} y={PT} width={Math.max(1, px(b) - px(a))} height={H - PT - PB} className="nodata" />
          {px(b) - px(a) > 70 && <text x={(px(a) + px(b)) / 2} y={PT + 14} textAnchor="middle">not recorded</text>}
        </g>
      ))}
      {ticks.map((v) => (
        <g key={v}>
          <line className={v === 0 ? "zero" : "grid"} x1={PL} x2={W - PR} y1={py(v)} y2={py(v)} strokeDasharray={v === 0 ? "3 3" : undefined} />
          <text x={PL - 8} y={py(v) + 3.5} textAnchor="end">{v}</text>
        </g>
      ))}
      {runs.map((run) => run.length > 1 && (
        <g key={run[0]!.ts}>
          <path className="gap" d={band(run)} />
          <path className="naive" d={line(run, "a")} fill="none" strokeWidth="1.6" />
          <path className="real" d={line(run, "r")} fill="none" strokeWidth="1.8" />
        </g>
      ))}
      {days.map((t, i) => (
        <text key={t} x={px(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{fmt(t)}</text>
      ))}
    </svg>
  );
}
