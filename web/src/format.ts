export const bp = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

export const bpClass = (v: number): string =>
  Math.abs(v) < 1 ? "bp-zero" : v > 0 ? "bp-pos" : "bp-neg";

export const usd = (v: number): string =>
  v >= 1000 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toPrecision(4);

export const ago = (ts: number | null): string => {
  if (ts === null) return "never";
  const m = (Date.now() - ts) / 60_000;
  if (m < 1.5) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  return `${(m / 60).toFixed(1)} h ago`;
};

export const compact = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
