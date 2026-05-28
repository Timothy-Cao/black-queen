// Analyze weight_ab.jsonl: per-variant mean(net) ± SE vs baseline (paired).
// Pairs same seed across variants → variance-cancelling delta-vs-baseline.
//
// Usage: npx tsx src/game/_bid_weight_ab_analyze.ts docs/bid_calibration/weight_ab.jsonl
import { readFileSync } from "fs";

type Row = {
  seed: number; variant: string;
  callerSeat: number | null; subjectIsCallerTeam: boolean; subjectIsCaller: boolean;
  winningBid: number; made: boolean; callerTeamPts: number; net: number;
};

const path = process.argv[2] ?? "docs/bid_calibration/weight_ab.jsonl";
const lines = readFileSync(path, "utf8").trim().split("\n");

// seed -> variant -> Row
const bySeed = new Map<number, Map<string, Row>>();
for (const line of lines) {
  const r: Row = JSON.parse(line);
  if ((r as any).error) continue;
  if (!bySeed.has(r.seed)) bySeed.set(r.seed, new Map());
  bySeed.get(r.seed)!.set(r.variant, r);
}

const variants = new Set<string>();
for (const m of bySeed.values()) for (const v of m.keys()) variants.add(v);
const variantList = Array.from(variants).filter(v => v !== "baseline").sort();

console.log("# Bid-weight A/B analysis");
console.log(`source=${path}  seeds=${bySeed.size}`);
console.log();
console.log("|       variant       | n |   Δ net vs baseline   | SE  |  Z  | %caller | % made (when caller) | avg bid (when caller) |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|");

function variantSummary(variant: string) {
  const deltas: number[] = [];
  let callerCount = 0; let madeCount = 0;
  let bidSum = 0; let bidN = 0;
  for (const m of bySeed.values()) {
    const a = m.get("baseline"); const b = m.get(variant);
    if (!a || !b) continue;
    deltas.push(b.net - a.net);
    if (b.subjectIsCaller) {
      callerCount++;
      bidSum += b.winningBid; bidN++;
      if (b.made) madeCount++;
    }
  }
  const n = deltas.length;
  const mean = deltas.reduce((s, x) => s + x, 0) / n;
  const variance = deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1);
  const se = Math.sqrt(variance / n);
  const z = se > 0 ? mean / se : 0;
  const pctCaller = (callerCount / n) * 100;
  const pctMade = callerCount > 0 ? (madeCount / callerCount) * 100 : 0;
  const avgBid = bidN > 0 ? bidSum / bidN : 0;
  return { n, mean, se, z, pctCaller, pctMade, avgBid };
}

// Sanity-check: baseline-vs-itself should be 0±0 (degenerate).
for (const v of variantList) {
  const s = variantSummary(v);
  console.log(
    `| ${v.padEnd(20)} | ${s.n} | ${s.mean.toFixed(2).padStart(7)} | ${s.se.toFixed(2)} | ${s.z.toFixed(2)} | ${s.pctCaller.toFixed(1)}% | ${s.pctMade.toFixed(1)}% | ${s.avgBid.toFixed(1)} |`,
  );
}

console.log();
console.log("Δ net = mean(variant.net - baseline.net) on paired seeds (variance-cancelled).");
console.log("Z > 2 ≈ significant at ~95%, Z > 3 ≈ ~99.7%.");
console.log("%caller = SUBJECT (seat 0) became caller; %made = of those, won; avg bid = winning bid when caller.");
