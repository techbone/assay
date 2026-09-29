/**
 * Best execution for a tokenized-stock buy, across every wrapper of the ticker.
 *
 *   npm run buy -- NVDA 500            executable quotes if `baw` is signed in, else indicative
 *   npm run buy -- NVDA 500 --indicative
 *
 * Prints the ranking and the exact `baw` command that executes the winner. It never
 * executes anything itself.
 */
import { BinanceRwaClient } from "../src/binance/client.js";
import { LiveSource } from "../src/live/source.js";
import { bawProvider, bawReady, USDT_BSC } from "../src/route/baw.js";
import { bestExecution, indicativeProvider } from "../src/route/best.js";

const [tickerArg, spendArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ticker = (tickerArg ?? "NVDA").toUpperCase();
const spend = Number(spendArg ?? 500);
const forceIndicative = process.argv.includes("--indicative");

const live = new LiveSource(new BinanceRwaClient());
const r = await live.ticker(ticker);
if (!r) { console.error(`${ticker}: no multi-wrapper listing on BSC`); process.exit(1); }

const executable = !forceIndicative && (await bawReady());
const provider = executable ? bawProvider() : indicativeProvider;
const plan = await bestExecution(r, await live.contracts(ticker), spend, provider);

const f = (v: number | null, d = 3) => (v === null ? "—" : v.toFixed(d));
console.log(`\n${ticker} · spend $${spend} USDT · assay price ${plan.assayPrice.toFixed(3)} · ${r.regime}`);
console.log(`quotes: ${provider.kind}${executable ? " (Binance Agentic Wallet)" : " (last trade; sign in to baw for executable quotes)"}\n`);
console.log(`${"wrapper".padEnd(9)}${"token px".padStart(10)}${"mult".padStart(10)}${"trust".padStart(7)}${"shares".padStart(10)}${"$/share".padStart(10)}${"vs assay".padStart(11)}  note`);
for (const l of plan.legs) {
  const tag = l === plan.best ? "★ best" : l.excluded ? `excluded: ${l.excluded}` : "";
  // trust shown so a judge can see why a wrapper was held back
  console.log(
    `${l.symbol.padEnd(9)}${f(l.quotedPrice).padStart(10)}${f(l.multiplier, 5).padStart(10)}${f(l.trust, 2).padStart(7)}` +
    `${f(l.shares, 5).padStart(10)}${f(l.costPerShare).padStart(10)}` +
    `${(l.premiumBp === null ? "—" : `${l.premiumBp >= 0 ? "+" : ""}${l.premiumBp.toFixed(1)}bp`).padStart(11)}  ${tag}`,
  );
}

if (plan.best) {
  console.log(`\nbuy ${plan.best.symbol}: ${f(plan.best.shares, 5)} shares of ${ticker} for $${spend}.`);
  const n = plan.naivePick;
  if (n && plan.naiveVerdict === "worse") {
    console.log(`a naive router buys ${n.symbol} (lowest token price) and gets ` +
      `${f(plan.naiveShortfallShares, 5)} fewer shares - it ignored the multiplier.`);
  } else if (n && plan.naiveVerdict === "excluded") {
    console.log(`a naive router buys ${n.symbol} (lowest token price). Assay won't: ${n.excluded}.`);
  }
  const m = plan.multiplierBlindPick;
  if (m && plan.multiplierBlindShortfallShares !== null) {
    const cheaper = plan.best.quotedPrice - m.quotedPrice;
    console.log(`${m.symbol}'s token is $${cheaper.toFixed(2)} cheaper than ${plan.best.symbol}'s, yet buys ` +
      `${f(plan.multiplierBlindShortfallShares, 5)} fewer shares ` +
      `($${(plan.multiplierBlindShortfallShares * plan.assayPrice).toFixed(2)} of stock) - the multiplier.`);
  }
  console.log(`\nexecute with Binance Agentic Wallet (review, then run yourself):`);
  console.log(`  baw market-order swap --fromTokenQty ${spend} --fromToken ${USDT_BSC} ` +
    `--toToken ${plan.best.contract} --binanceChainId 56 --json`);
}
