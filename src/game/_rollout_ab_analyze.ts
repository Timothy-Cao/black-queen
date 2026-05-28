// Analyze paired rollout-policy A/B.
import { readFileSync } from "fs";

type Row = {
  seed: number; hard4Seat: number; policy: string;
  hard4Won: boolean; hard4WasCaller: boolean; bid: number; made: boolean;
};

const path = process.argv[2] ?? "docs/budget_sweep/rollout_ab.jsonl";
const lines = readFileSync(path, "utf8").trim().split("\n");

const bySeed = new Map<number, Map<string, Row>>();
const policies = new Set<string>();
for (const line of lines) {
  const r: Row = JSON.parse(line);
  if ((r as any).error) continue;
  if (!bySeed.has(r.seed)) bySeed.set(r.seed, new Map());
  bySeed.get(r.seed)!.set(r.policy, r);
  policies.add(r.policy);
}
const policyList = Array.from(policies).sort();

console.log("# Rollout-policy A/B (hard-4 vs 4×hard-3)");
console.log(`source=${path}  seeds=${bySeed.size}`);
console.log();
console.log("## Absolute hard-4 win-rate by rollout policy");
console.log("| policy | n | hard-4 win% | %caller | %made (when caller) |");
console.log("|---|---:|---:|---:|---:|");
for (const p of policyList) {
  let n = 0, wins = 0, callers = 0, made = 0;
  for (const m of bySeed.values()) {
    const r = m.get(p);
    if (!r) continue;
    n++;
    if (r.hard4Won) wins++;
    if (r.hard4WasCaller) { callers++; if (r.made) made++; }
  }
  console.log(`| ${p} | ${n} | ${(wins/n*100).toFixed(2)}% | ${(callers/n*100).toFixed(1)}% | ${callers>0 ? (made/callers*100).toFixed(1) : "-"}% |`);
}

console.log();
console.log("## Paired deltas (same seeds)");
console.log("| A → B | n | Δ win-rate (B-A) | SE | Z |");
console.log("|---|---:|---:|---:|---:|");
function pairedDelta(a: string, b: string) {
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
// All pairwise
for (const a of policyList) {
  for (const b of policyList) {
    if (a >= b) continue;
    const d = pairedDelta(a, b);
    console.log(`| ${a} → ${b} | ${d.n} | ${d.mean >= 0 ? "+" : ""}${d.mean.toFixed(2)}pp | ${d.se.toFixed(2)} | ${d.z.toFixed(2)} |`);
  }
}
console.log();
console.log("Δ > 0 means B helps more than A. Large |Δ| anywhere → ISMCTS is rollout-sensitive → rollout improvements are a real Hard-5 lever.");
