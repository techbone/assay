import { useEffect, useState, type ReactNode } from "react";
import { REGIME_LABEL, type Summary } from "../api.js";
import { ago } from "../format.js";
import { href, REPO, type Route } from "../router.js";

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M9 21h14M11 16h10M13 11h6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

type Theme = "light" | "dark";
const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme | undefined) ?? systemTheme(),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("assay-theme", next); } catch { /* private mode: fine */ }
  };
  return (
    <button className="icon-btn" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}

function Session({ summary }: { summary?: Summary }) {
  if (!summary) return <span className="session"><span className="dot" /> Loading…</span>;
  const fresh = summary.ts !== null && Date.now() - summary.ts < 10 * 60_000;
  return (
    <span className="session" title="US market session, from the Binance Web3 API">
      <span className={`dot ${fresh ? "live" : "stale"}`} />
      {REGIME_LABEL[summary.regime]}
      <span className="faint when">· {ago(summary.ts)}</span>
    </span>
  );
}

const NAV: Array<{ label: string; to: string; page: Route["page"] }> = [
  { label: "Markets", to: href.home, page: "home" },
  { label: "Best execution", to: href.buy(), page: "buy" },
  { label: "Scorecard", to: href.scorecard, page: "scorecard" },
  { label: "Findings", to: href.findings, page: "findings" },
];

export function Header({ route, summary }: { route: Route; summary?: Summary }) {
  const active = route.page === "ticker" ? "home" : route.page;
  return (
    <header className="header">
      <div className="container">
        <div className="header-in">
          <a className="brand" href={href.home}><Mark /> Assay</a>
          <nav className="nav">
            {NAV.map((n) => <a key={n.page} href={n.to} className={active === n.page ? "active" : ""}>{n.label}</a>)}
          </nav>
          <div className="header-right">
            <Session summary={summary} />
            <a className="icon-btn" href={REPO} target="_blank" rel="noreferrer" aria-label="Source on GitHub" title="Source on GitHub">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.2-.2-.3-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.3 2.9.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" /></svg>
            </a>
            <ThemeToggle />
          </div>
        </div>
        <nav className="mobile-nav">
          {NAV.map((n) => <a key={n.page} href={n.to} className={active === n.page ? "active" : ""}>{n.label}</a>)}
        </nav>
      </div>
    </header>
  );
}

export function Footer({ summary }: { summary?: Summary }) {
  return (
    <footer className="footer">
      <div className="container footer-in">
        <div>
          <a className="brand" href={href.home} style={{ marginBottom: 10, display: "inline-flex" }}><Mark /> Assay</a>
          <p>
            Reference prices and best execution for tokenized stocks on BNB Chain. Prices are fetched
            live from the Binance Web3 API on every visit; history and the scorecard are recorded by
            a collector
            {summary?.coverage.lastTs ? <> that last ran {ago(summary.coverage.lastTs)}</> : null}.
          </p>
          <p style={{ marginTop: 10 }} className="faint">Built for BNB Hack: Tokenized Stocks Edition.</p>
        </div>
        <div>
          <h4>Product</h4>
          <ul>
            <li><a href={href.home}>Markets</a></li>
            <li><a href={href.buy()}>Best execution</a></li>
            <li><a href={href.scorecard}>Scorecard</a></li>
            <li><a href={href.findings}>Findings</a></li>
          </ul>
        </div>
        <div>
          <h4>Build</h4>
          <ul>
            <li><a href={REPO} target="_blank" rel="noreferrer">Source code</a></li>
            <li><a href={`${REPO}/blob/main/DEVEX.md`} target="_blank" rel="noreferrer">Developer experience report</a></li>
            <li><a href={`${REPO}/tree/main/skills/assay`} target="_blank" rel="noreferrer">Agent skill</a></li>
            <li><a href="/api/health" target="_blank" rel="noreferrer">API health</a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ padding: 18, display: "grid", gap: 12 }}>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

export function Fail({ error }: { error: string }) {
  return <div className="error">Couldn't load this: {error}. The data source may be busy — refresh in a moment.</div>;
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="container page">{children}</main>;
}
