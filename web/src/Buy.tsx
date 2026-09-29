import { useState } from "react";
import { api, type BestExecution } from "./api.js";
import { useAsync } from "./useAsync.js";

/** BSC-USD, the spend token the Agentic Wallet command uses. */
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const SPENDS = [100, 500, 1000, 5000];

/**
 * "Buy $X of this stock": which wrapper actually delivers the most of the real share.
 * The site can only quote indicatively - executable quotes need the buyer's own signed-in
 * Binance Agentic Wallet, which is what the Assay agent skill uses.
 */
export function BuyPanel({ ticker }: { ticker: string }) {
  const [spend, setSpend] = useState(500);
  const p = useAsync(() => api.buy(ticker, spend), [ticker, spend]);

  return (
    <section>
      <div className="h2row">
        <h2>Buy {ticker} — best execution</h2>
        <span className="note">which wrapper buys the most real stock for your money</span>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Spend</span>
          {SPENDS.map((s) => (
            <button key={s} onClick={() => setSpend(s)} className="chip"
                    style={{
                      background: s === spend ? "rgba(217,164,65,.14)" : "var(--panel-2)",
                      border: `1px solid ${s === spend ? "var(--gold-dim)" : "var(--line)"}`,
                      color: s === spend ? "var(--gold)" : "var(--muted)",
                      borderRadius: 6, padding: "4px 10px", fontFamily: "var(--mono)", fontSize: 12.5, cursor: "pointer",
                    }}>
              ${s.toLocaleString()}
            </button>
          ))}
        </div>
        {p.loading && <div className="empty" style={{ padding: 18 }}>Pricing…</div>}
        {p.error && <div className="err">{p.error}</div>}
        {p.data && <Plan plan={p.data} />}
      </div>
    </section>
  );
}

function Plan({ plan }: { plan: BestExecution }) {
  const best = plan.best;
  const f = (v: number | null, d = 3) => (v === null ? "—" : v.toFixed(d));

  return (
    <>
      {best ? (
        <p className="claim" style={{ margin: "0 0 14px" }}>
          Buy <b>{best.symbol}</b>: <b>{f(best.shares, 5)}</b> shares of {plan.ticker} for{" "}
          <b>${plan.spend.toLocaleString()}</b> — <b>${f(best.costPerShare, 2)}</b> per real share.
          {plan.multiplierBlindPick && plan.multiplierBlindShortfallShares !== null && (
            <> <b>{plan.multiplierBlindPick.symbol}</b>'s token is{" "}
              ${(best.quotedPrice - plan.multiplierBlindPick.quotedPrice).toFixed(2)} cheaper, yet buys{" "}
              {f(plan.multiplierBlindShortfallShares, 5)} fewer shares — the multiplier.</>
          )}
          {plan.naivePick && plan.naiveVerdict === "excluded" && (
            <> A router that compares token prices would buy <b>{plan.naivePick.symbol}</b>; Assay won't —{" "}
              {plan.naivePick.excluded}.</>
          )}
        </p>
      ) : (
        <p className="empty" style={{ padding: 12 }}>No wrapper can be recommended on the data available.</p>
      )}

      <table>
        <thead>
          <tr>
            <th>Wrapper</th>
            <th>Token price</th>
            <th className="hide-sm">Multiplier</th>
            <th className="hide-sm">Trust</th>
            <th>Shares</th>
            <th>$ / share</th>
            <th>vs assay</th>
          </tr>
        </thead>
        <tbody>
          {plan.legs.map((l) => {
            const isBest = l === best || l.symbol === best?.symbol;
            return (
              <tr key={l.symbol} style={{ cursor: "default", opacity: l.excluded ? 0.55 : 1,
                                          background: isBest ? "rgba(217,164,65,.06)" : undefined }}>
                <td>
                  <span className="tkr" style={{ color: isBest ? "var(--gold)" : undefined }}>
                    {isBest ? "★ " : ""}{l.symbol}
                  </span>
                  {l.excluded && <div style={{ color: "var(--dim)", fontSize: 11 }}>{l.excluded}</div>}
                </td>
                <td className="num">{f(l.quotedPrice)}</td>
                <td className="num hide-sm" style={{ color: "var(--muted)" }}>{f(l.multiplier, 5)}</td>
                <td className="num hide-sm" style={{ color: "var(--muted)" }}>{f(l.trust, 2)}</td>
                <td className="num">{f(l.shares, 5)}</td>
                <td className="num">{f(l.costPerShare, 2)}</td>
                <td className="num" style={{ color: "var(--dim)" }}>
                  {l.premiumBp === null ? "—" : `${l.premiumBp >= 0 ? "+" : ""}${l.premiumBp.toFixed(1)} bp`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ color: "var(--dim)", fontSize: 12, margin: "12px 0 0", lineHeight: 1.6 }}>
        Indicative: priced from each wrapper's last trade, so thin wrappers are held back. With the
        Assay agent skill and a signed-in Binance Agentic Wallet, the same ranking runs on executable
        quotes and hands the winner to the wallet to buy — after your confirmation.
        {best && (
          <code className="mono" style={{ display: "block", marginTop: 8, padding: "8px 10px", background: "var(--panel-2)",
                                           border: "1px solid var(--line-soft)", borderRadius: 6, fontSize: 11.5,
                                           color: "var(--muted)", overflowX: "auto", whiteSpace: "nowrap" }}>
            baw market-order swap --fromTokenQty {plan.spend} --fromToken {USDT_BSC} --toToken {best.contract} --binanceChainId 56 --json
          </code>
        )}
      </p>
    </>
  );
}
