// Paired-seed analysis of follow_guard_ab.jsonl. Δ = guard=ON minus guard=OFF.
import { readFileSync } from "fs";

type Row = {
  seed: number; guard: boolean;
  callerSeat: number | null; subjectIsCallerTeam: boolean; subjectIsCaller: boolean;
  winningBid: number; made: boolean; callerTeamPts: number; subjectPts: number; net: number;
};

const path = process.argv[2] ?? "docs/bid_calibration/follow_guard_ab.jsonl";
const lines = readFileSync(path, "utf8").trim().split("\n");

const bySeed = new Map<number, { on?: Row; off?: Row }>();
for (const line of lines) {
  const r: Row = JSON.parse(line);
  if ((r as any).error) continue;
  if (!bySeed.has(r.seed)) bySeed.set(r.seed, {});
  if (r.guard) bySeed.get(r.seed)!.on = r;
  else bySeed.get(r.seed)!.off = r;
}

const deltas: number[] = [];
let bothCount = 0;
let onCallerMade = 0, onCallerTotal = 0, offCallerMade = 0, offCallerTotal = 0;
let onCallerCount = 0, offCallerCount = 0;
let differCount = 0;
for (const { on, off } of bySeed.values()) {
  if (!on || !off) continue;
  bothCount++;
  deltas.push(on.net - off.net);
  if (on.subjectIsCaller) { onCallerCount++; if (on.made) onCallerMade++; onCallerTotal++; }
  if (off.subjectIsCaller) { offCallerCount++; if (off.made) offCallerMade++; offCallerTotal++; }
  if (on.net !== off.net) differCount++;
}

const n = deltas.length;
const mean = deltas.reduce((s, x) => s + x, 0) / n;
const variance = deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1);
const se = Math.sqrt(variance / n);
const z = se > 0 ? mean / se : 0;
const fracDiffer = (differCount / n) * 100;

console.log("# Follow-guard A/B analysis (hard-4 vs 4×hard-3)");
console.log(`source=${path}  paired seeds=${n}`);
console.log();
console.log("|             metric              | guard=OFF | guard=ON |  Δ (ON-OFF) | SE | Z |");
console.log("|---|---:|---:|---:|---:|---:|");
console.log(`| mean net to hard-4 team (paired) | (baseline) | (treat.) | **${mean.toFixed(2)}** | ${se.toFixed(2)} | **${z.toFixed(2)}** |`);
console.log(`| %caller (SUBJECT=hard-4)        | ${(offCallerCount/n*100).toFixed(1)}% | ${(onCallerCount/n*100).toFixed(1)}% | | | |`);
console.log(`| %made (when SUBJECT caller)     | ${offCallerTotal>0 ? (offCallerMade/offCallerTotal*100).toFixed(1) : "-"}% | ${onCallerTotal>0 ? (onCallerMade/onCallerTotal*100).toFixed(1) : "-"}% | | | |`);
console.log(`| seeds where outcome differs     | ${fracDiffer.toFixed(1)}% of paired seeds (guard fires meaningfully here) | | | | |`);
console.log();
console.log("Δ > 0 means the new follow guard helps hard-4. Z > 2 = significant.");
