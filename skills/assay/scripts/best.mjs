#!/usr/bin/env node
/**
 * Best execution for a tokenized-stock buy on BSC, on executable quotes.
 *
 *   node best.mjs NVDA 500
 *
 * Candidate wrappers (contracts, multipliers, trust, rejections) come from Assay. Quotes
 * come from the user's own Binance Agentic Wallet (`baw market-order quote`). Nothing is
 * executed - the winning swap command is printed for the wallet skill to run after the
 * user confirms. No dependencies beyond Node 18+ and `baw`.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const API = process.env.ASSAY_API ?? "https://assay-woad.vercel.app";
const BAW = (process.env.ASSAY_BAW ?? "baw").split(/\s+/);
const USDT = "0x55d398326f99059fF775485246999027B3197955";

const [ticker = "NVDA", spendArg = "500"] = process.argv.slice(2);
const spend = Number(spendArg);
if (!(spend > 0)) { console.error("spend must be a positive number"); process.exit(1); }

const res = await fetch(`${API}/api/buy/${encodeURIComponent(ticker)}?spend=${spend}`);
if (!res.ok) { console.error(`assay: ${res.status} ${await res.text()}`); process.exit(1); }
const plan = await res.json();

/** Returns tokens received, or the wallet's reason it would not quote. */
async function quote(contract) {
  let stdout;
  try {
    ({ stdout } = await run(BAW[0], [...BAW.slice(1), "market-order", "quote",
      "--fromTokenQty", String(spend), "--fromToken", USDT, "--toToken", contract,
      "--binanceChainId", "56", "--json"], { timeout: 30_000 }));
  } catch (e) {
    // baw exits non-zero on a refused quote but still prints its JSON reason.
    stdout = e?.stdout;
    if (!stdout) return { reason: "wallet unavailable" };
  }
  try {
    const body = JSON.parse(stdout);
    const out = Number(body?.data?.toCoinAmount);
    if (body?.success && out > 0) return { tokens: out };
    return { reason: body?.error?.message ?? "no quote" };
  } catch {
    return { reason: "unreadable wallet response" };
  }
}

// Executable quotes lift the thin-wrapper bar - the quote prices the liquidity in - but
// an engine rejection (halted, corrupt multiplier, stale, outlier) is never overridden.
const candidates = plan.legs.filter((l) => !l.rejected);
const quoted = await Promise.all(candidates.map(async (l) => {
  const { tokens = null, reason } = await quote(l.contract);
  if (tokens === null) return { ...l, tokens: null, reason };
  const shares = tokens * l.multiplier;
  const costPerShare = spend / shares;
  return { ...l, tokens, shares, costPerShare, premiumBp: (costPerShare / plan.assayPrice - 1) * 1e4 };
}));

const live = quoted.filter((l) => l.tokens !== null).sort((a, b) => a.costPerShare - b.costPerShare);
const executable = live.length > 0;
const ranked = executable ? live : plan.legs.filter((l) => l.shares !== null);
const best = executable ? live[0] : plan.best;

console.log(`\n${plan.ticker} · $${spend} USDT · assay price ${plan.assayPrice.toFixed(3)}`);
console.log(executable
  ? "quotes: EXECUTABLE (Binance Agentic Wallet)"
  : "quotes: INDICATIVE - baw not signed in or no quote returned; present as indicative only");
for (const l of ranked) {
  console.log(`  ${l === best || l.symbol === best?.symbol ? "★" : " "} ${l.symbol.padEnd(8)} ` +
    `${l.shares.toFixed(5)} shares  $${l.costPerShare.toFixed(2)}/share  ` +
    `${l.premiumBp >= 0 ? "+" : ""}${l.premiumBp.toFixed(1)}bp vs assay`);
}
for (const l of plan.legs.filter((x) => x.rejected || (!executable && x.excluded))) {
  console.log(`    ${l.symbol.padEnd(8)} excluded: ${l.rejected ?? l.excluded}`);
}
// A wrapper the wallet refused to quote is a finding, not a gap to hide: it is usually
// the thin one a price-only router would have bought.
if (executable) {
  for (const l of quoted.filter((x) => x.tokens === null)) {
    console.log(`    ${l.symbol.padEnd(8)} no executable quote: ${l.reason}`);
  }
}
if (!best) { console.log("\nno wrapper can be recommended."); process.exit(2); }

const cheapest = [...ranked].sort((a, b) => a.quotedPrice - b.quotedPrice)[0];
if (cheapest && cheapest.symbol !== best.symbol) {
  console.log(`\n${cheapest.symbol}'s token is cheaper, but ${best.symbol} buys ` +
    `${(best.shares - cheapest.shares).toFixed(5)} more shares for the same money.`);
}
console.log(`\nwinner: ${best.symbol} (${best.contract})`);
console.log(`hand to binance-agentic-wallet after the user confirms:`);
console.log(`  baw market-order swap --fromTokenQty ${spend} --fromToken ${USDT} --toToken ${best.contract} --binanceChainId 56 --json`);
