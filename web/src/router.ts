import { useEffect, useState } from "react";

export type Route =
  | { page: "home" }
  | { page: "ticker"; ticker: string }
  | { page: "buy"; ticker?: string }
  | { page: "scorecard" }
  | { page: "findings" };

export function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  const [a, b] = h.split("/");
  if (a === "t" && b) return { page: "ticker", ticker: decodeURIComponent(b).toUpperCase() };
  if (a === "buy") return b ? { page: "buy", ticker: decodeURIComponent(b).toUpperCase() } : { page: "buy" };
  if (a === "scorecard") return { page: "scorecard" };
  if (a === "findings") return { page: "findings" };
  return { page: "home" };
}

export function useRoute(): Route {
  const [r, set] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => { set(parse(location.hash)); window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}

export const href = {
  home: "#/",
  ticker: (t: string) => `#/t/${encodeURIComponent(t)}`,
  buy: (t?: string) => (t ? `#/buy/${encodeURIComponent(t)}` : "#/buy"),
  scorecard: "#/scorecard",
  findings: "#/findings",
};

export const REPO = "https://github.com/techbone/assay";
