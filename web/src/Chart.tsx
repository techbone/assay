import type { HistoryPoint } from "./api.js";

/**
 * Naive basis against adjusted basis for one wrapper, over time.
 *
 * The gap between the two lines is the phantom premium. Drawn by hand rather than with a
 * chart library so the two series can share an axis and the fill between them can be the
 * point of the picture rather than decoration.
 */
export function BasisChart({ points, symbol }: { points: HistoryPoint[]; symbol: string }) {
  const W = 880, H = 260, PL = 52, PR = 16, PT = 16, PB = 26;

  const series = points
    .map((p) => {
      const w = p.wrappers.find((x) => x.symbol === symbol);
      return w ? { ts: p.ts, naive: w.naiveBasisBp, adj: w.trueBasisBp } : null;
    })
    .filter((x): x is { ts: number; naive: number; adj: number } => x !== null);

  if (series.length < 2) return <div className="empty">Not enough history yet — the collector needs a few more cycles.</div>;

  const xs = series.map((s) => s.ts);
  const ys = series.flatMap((s) => [s.naive, s.adj]).concat([0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max(2, (y1 - y0) * 0.12);
  y0 -= pad; y1 += pad;

  const px = (t: number) => PL + ((t - x0) / (x1 - x0 || 1)) * (W - PL - PR);
  const py = (v: number) => PT + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PT - PB);

  const line = (key: "naive" | "adj") =>
    series.map((s, i) => `${i ? "L" : "M"}${px(s.ts).toFixed(1)},${py(s[key]).toFixed(1)}`).join("");

  const band =
    series.map((s, i) => `${i ? "L" : "M"}${px(s.ts).toFixed(1)},${py(s.naive).toFixed(1)}`).join("") +
    series.slice().reverse().map((s) => `L${px(s.ts).toFixed(1)},${py(s.adj).toFixed(1)}`).join("") + "Z";

  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => y0 + ((y1 - y0) * i) / ticks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
         aria-label={`Naive versus adjusted basis for ${symbol}`}>
      {gridY.map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={py(v)} y2={py(v)}
                stroke={Math.abs(v) < 1e-9 ? "#2f333c" : "#1b1e25"} strokeWidth="1" />
          <text x={PL - 8} y={py(v) + 3.5} textAnchor="end" fill="#5d626e"
                fontSize="10" fontFamily="ui-monospace, monospace">{v.toFixed(0)}</text>
        </g>
      ))}
      <line x1={PL} x2={W - PR} y1={py(0)} y2={py(0)} stroke="#3a3f4a" strokeWidth="1" strokeDasharray="3 3" />

      <path d={band} fill="#d9a441" fillOpacity="0.13" />
      <path d={line("naive")} fill="none" stroke="#d9a441" strokeWidth="1.6" />
      <path d={line("adj")} fill="none" stroke="#5b8fd6" strokeWidth="1.6" />

      <text x={PL} y={H - 7} fill="#5d626e" fontSize="10" fontFamily="ui-monospace, monospace">
        {new Date(x0).toISOString().slice(5, 16).replace("T", " ")}
      </text>
      <text x={W - PR} y={H - 7} textAnchor="end" fill="#5d626e" fontSize="10" fontFamily="ui-monospace, monospace">
        {new Date(x1).toISOString().slice(5, 16).replace("T", " ")} UTC
      </text>
    </svg>
  );
}
