// Analyze paired budget A/B. Per-seed deltas of hard-4 win between budgets.
import { readFileSync } from "fs";

type Row = {
  seed: number; hard4Seat: number; budget: number;
  hard4Won: boolean; hard4WasCaller: boolean; bid: number; made: boolean;
};

const path = process.argv[2] ?? "docs/budget_sweep/paired.jsonl";
const lines = readFileSync(path, "utf8").trim().split("\n");

// seed -> budget -> Row
const bySeed = new Map<number, Map<number, Row>>();
const budgets = new Set<number>();
for (const line of lines) {
  const r: Row = JSON.parse(line);
  if ((r as any).error) continue;
  if (!bySeed.has(r.seed)) bySeed.set(r.seed, new Map());
  bySeed.get(r.seed)!.set(r.budget, r);
  budgets.add(r.budget);
}
const budgetList = Array.from(budgets).sort((a, b) => a - b);

// Per-budget absolute win-rate
console.log("# Paired budget A/B (hard-4 vs 4×hard-3)");
console.log(`source=${path}  seeds=${bySeed.size}`);
console.log();
console.log("## Absolute hard-4 win-rate by budget");
console.log("| budget | n | hard-4 win% | %caller | %made (when caller) |");
console.log("|---:|---:|---:|---:|---:|");
for (const b of budgetList) {
  let n = 0, wins = 0, callers = 0, made = 0;
  for (const m of bySeed.values()) {
    const r = m.get(b);
    if (!r) continue;
    n++;
    if (r.hard4Won) wins++;
    if (r.hard4WasCaller) { callers++; if (r.made) made++; }
  }
  console.log(`| ${b}ms | ${n} | ${(wins/n*100).toFixed(2)}% | ${(callers/n*100).toFixed(1)}% | ${callers>0 ? (made/callers*100).toFixed(1) : "-"}% |`);
}

// Paired deltas
console.log();
console.log("## Paired deltas (same seeds)");
console.log("| A → B | n | Δ win-rate (B-A) | SE | Z |");
console.log("|---|---:|---:|---:|---:|");
function pairedDelta(a: number, b: number) {
  const deltas: number[] = [];
  for (const m of bySeed.values()) {
    const ra = m.get(a); const rb = m.get(b);
    if (!ra || !rb) continue;
    deltas.push((rb.hard4Won ? 1 : 0) - (ra.hard4Won ? 1 : 0));
  }
  const n = deltas.length;
  const mean = deltas.reduce((s, x) => s + x, 0) / n;
  const variance = deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1);
  const se = Math.sqrt(variance / n);
  const z = se > 0 ? mean / se : 0;
  return { n, mean: mean * 100, se: se * 100, z };
}
for (let i = 0; i < budgetList.length - 1; i++) {
  const a = budgetList[i]; const b = budgetList[i + 1];
  const d = pairedDelta(a, b);
  console.log(`| ${a}ms → ${b}ms | ${d.n} | ${d.mean >= 0 ? "+" : ""}${d.mean.toFixed(2)}pp | ${d.se.toFixed(2)} | ${d.z.toFixed(2)} |`);
}
// Also extremes
if (budgetList.length >= 2) {
  const d = pairedDelta(budgetList[0], budgetList[budgetList.length - 1]);
  console.log(`| ${budgetList[0]}ms → ${budgetList[budgetList.length-1]}ms | ${d.n} | ${d.mean >= 0 ? "+" : ""}${d.mean.toFixed(2)}pp | ${d.se.toFixed(2)} | ${d.z.toFixed(2)} |`);
}
console.log();
console.log("Δ > 0 means more budget helps. Z > 2 ≈ significant.");
