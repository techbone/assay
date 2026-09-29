/** Price per share or per token: two decimals above $10, more below so small prices keep meaning. */
export const usd = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const d = Math.abs(v) >= 10 ? 2 : Math.abs(v) >= 1 ? 3 : 4;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

/** Signed basis points. */
export const bp = (v: number | null | undefined, d = 1): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  // Round first, so a value like -0.02 reads "0.0 bp" rather than "-0.0 bp".
  const r = Number(v.toFixed(d));
  const s = (r === 0 ? 0 : r).toFixed(d);
  return `${r > 0 ? "+" : ""}${s} bp`;
};

export const num = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const compact = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);

export const ago = (ts: number | null | undefined): string => {
  if (!ts) return "never";
  const m = (Date.now() - ts) / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 48 * 60) return `${(m / 60).toFixed(m < 600 ? 1 : 0)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

export const utc = (ts: number): string => new Date(ts).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** Plain-English reason a wrapper is not trusted. */
export const reason = (r: string | null | undefined): string => {
  switch (r) {
    case "NOT_TRADING": return "Paused";
    case "CORRUPT_MULTIPLIER": return "Bad multiplier";
    case "STALE_QUOTE": return "Stale price";
    case "OUTLIER": return "Price outlier";
    case "NO_PRICE": return "No price";
    default: return r ? r.toLowerCase().replace(/_/g, " ") : "";
  }
};
