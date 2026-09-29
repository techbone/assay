import { useState } from "react";
import { api, type BestExecution } from "../api.js";
import { bp, usd } from "../format.js";
import { REPO } from "../router.js";
import { useAsync } from "../useAsync.js";
import { Fail, Loading } from "./Layout.js";
import { Issuer, Trust } from "./bits.js";

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const SPENDS = [100, 500, 1000, 5000];

export function BuyPanel({ ticker }: { ticker: string }) {
  const [spend, setSpend] = useState(1000);
  const p = useAsync(() => api.buy(ticker, spend), [ticker, spend]);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Buy {ticker}</h3>
        <span className="muted" style={{ fontSize: 13 }}>Which token gets you the most real stock?</span>
        <div className="seg" style={{ marginLeft: "auto" }} role="group" aria-label="Amount to spend">
          {SPENDS.map((s) => (
            <button key={s} className={s === spend ? "on" : ""} onClick={() => setSpend(s)}>${s.toLocaleString()}</button>
          ))}
        </div>
      </div>
      {p.loading && <Loading lines={4} />}
      {p.error && <Fail error={p.error} />}
      {p.data && <Plan plan={p.data} />}
    </div>
  );
}

function Plan({ plan }: { plan: BestExecution }) {
  const best = plan.best;
  const [copied, setCopied] = useState(false);
  const cmd = best
    ? `baw market-order swap --fromTokenQty ${plan.spend} --fromToken ${USDT_BSC} --toToken ${best.contract} --binanceChainId 56 --json`
    : "";

  return (
    <>
      <div className="card-body" style={{ paddingBottom: 6 }}>
        {best ? (
          <p style={{ fontSize: 14.5, lineHeight: 1.6 }} className="muted">
            <b style={{ color: "var(--text)" }}>Buy {best.symbol}.</b>{" "}
            ${plan.spend.toLocaleString()} gets you <b style={{ color: "var(--text)" }}>{best.shares!.toFixed(5)} shares</b> of{" "}
            {plan.ticker} at {usd(best.costPerShare)} per real share.
            {plan.multiplierBlindPick && plan.multiplierBlindShortfallShares !== null && (
              <> {plan.multiplierBlindPick.symbol} shows a lower price, but buys {plan.multiplierBlindShortfallShares.toFixed(5)} fewer
                shares for the same money.</>
            )}
            {plan.naivePick && plan.naiveVerdict === "excluded" && (
              <> The lowest price on screen is {plan.naivePick.symbol} — Assay won't route there: its price is too thin to trust.</>
            )}
          </p>
        ) : (
          <p className="muted">No token can be recommended on the data available right now.</p>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Screen price</th>
              <th className="hide-sm">Shares / token</th>
              <th className="hide-sm">Trust</th>
              <th>Shares you get</th>
              <th>Per real share</th>
              <th className="hide-sm">vs fair price</th>
            </tr>
          </thead>
          <tbody>
            {plan.legs.map((l) => {
              const isBest = best?.symbol === l.symbol;
              return (
                <tr key={l.symbol} className={isBest ? "hl" : l.excluded ? "dim" : ""}>
                  <td>
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <b style={{ fontWeight: 600, color: l.excluded ? "var(--text-3)" : "var(--text)" }}>{l.symbol}</b>
                      <Issuer family={l.family} />
                      {isBest && <span className="tag accent">Best</span>}
                    </span>
                  </td>
                  <td>{usd(l.quotedPrice)}</td>
                  <td className="hide-sm">{l.multiplier.toFixed(4)}</td>
                  <td className="hide-sm"><Trust value={l.trust} /></td>
                  <td>{l.shares !== null ? l.shares.toFixed(5) : <span className="tag" title={l.excluded ?? ""}>Not routed</span>}</td>
                  <td>{usd(l.costPerShare)}</td>
                  <td className="hide-sm muted">{bp(l.premiumBp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card-body" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="faint" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Indicative — priced from each token's last trade, so tokens too thin to trust are not routed.
          For executable quotes, use the{" "}
          <a href={`${REPO}/tree/main/skills/assay`} target="_blank" rel="noreferrer">Assay agent skill</a> with a
          signed-in Binance Agentic Wallet: it ranks tokens on real quotes and hands the best one to the
          wallet, which asks you to confirm.
        </p>
        {best && (
          <div className="code">
            <code>{cmd}</code>
            <button className="btn" style={{ height: 30, padding: "0 10px", fontSize: 12.5 }}
                    onClick={() => { navigator.clipboard?.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
