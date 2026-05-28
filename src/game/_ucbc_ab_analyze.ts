// Analyze paired PUCT A/B. Baseline = "ucb1"; others compared against it.
import { readFileSync } from "fs";

type Row = {
  seed: number; hard4Seat: number; variant: string;
  hard4Won: boolean; hard4WasCaller: boolean; bid: number; made: boolean;
};

const path = process.argv[2] ?? "docs/budget_sweep/ucbc_ab.jsonl";
const lines = readFileSync(path, "utf8").trim().split("\n");

const bySeed = new Map<number, Map<string, Row>>();
const variants = new Set<string>();
for (const line of lines) {
  const r: Row = JSON.parse(line);
  if ((r as any).error) continue;
  if (!bySeed.has(r.seed)) bySeed.set(r.seed, new Map());
  bySeed.get(r.seed)!.set(r.variant, r);
  variants.add(r.variant);
}
const variantList = Array.from(variants).sort((a, b) => (a === "c140" ? -1 : b === "c140" ? 1 : a.localeCompare(b)));
const BASE = "c140";

console.log("# UCB-c A/B (hard-4 greedy-rollout vs 4×hard-3)");
console.log(`source=${path}  seeds=${bySeed.size}`);
console.log();
console.log("## Absolute hard-4 win-rate by variant");
console.log("| variant | n | hard-4 win% | %made (caller) |");
console.log("|---|---:|---:|---:|");
for (const v of variantList) {
  let n = 0, wins = 0, callers = 0, made = 0;
  for (const m of bySeed.values()) {
    const r = m.get(v); if (!r) continue;
    n++; if (r.hard4Won) wins++;
    if (r.hard4WasCaller) { callers++; if (r.made) made++; }
  }
  console.log(`| ${v} | ${n} | ${(wins/n*100).toFixed(2)}% | ${callers>0?(made/callers*100).toFixed(1):"-"}% |`);
}

console.log();
console.log(`## Paired deltas vs baseline (${BASE})`);
console.log("| variant | n | Δ win% | SE | Z |");
console.log("|---|---:|---:|---:|---:|");
for (const v of variantList) {
  if (v === BASE) continue;
  const deltas: number[] = [];
  for (const m of bySeed.values()) {
    const rb = m.get(BASE); const rv = m.get(v);
    if (!rb || !rv) continue;
    deltas.push((rv.hard4Won ? 1 : 0) - (rb.hard4Won ? 1 : 0));
  }
  const n = deltas.length;
  const mean = deltas.reduce((s,x)=>s+x,0)/n;
  const variance = deltas.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,n-1);
  const se = Math.sqrt(variance/n);
  const z = se>0?mean/se:0;
  console.log(`| ${v} | ${n} | ${mean>=0?"+":""}${(mean*100).toFixed(2)}pp | ${(se*100).toFixed(2)} | ${z.toFixed(2)} |`);
}
console.log();
console.log("Δ > 0 = PUCT variant beats UCB1 baseline. Z>2 significant.");
