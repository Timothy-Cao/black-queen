// Lever A Phase 1 — signal check: train a logistic regression in TS to predict
// P(target holds partner card | features) and measure held-out AUC / log-loss /
// accuracy vs the base-rate baseline. If LR meaningfully beats base rate, the
// features carry real signal and a learned inference model is worth building.
//
// Usage: npx tsx src/game/_infer_train.ts docs/infer/data.jsonl

import { readFileSync } from "fs";

type Row = { label: number; f: Record<string, number> };

const path = process.argv[2] ?? "docs/infer/data.jsonl";
const rows: Row[] = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));

// Feature keys (stable order). EXCLUDE env drops comma-separated features —
// used to ablate hard-constraint features (voids) already enforced by the
// determinization sampler, isolating the residual SOFT-prior signal.
const exclude = new Set((process.env.EXCLUDE ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const KEYS = Object.keys(rows[0].f).filter((k) => !exclude.has(k));
const D = KEYS.length;

// Build matrix; standardize each feature (zero mean, unit var) for stable GD.
const X: number[][] = rows.map((r) => KEYS.map((k) => r.f[k]));
const y: number[] = rows.map((r) => r.label);
const mean = new Array(D).fill(0), std = new Array(D).fill(0);
for (const row of X) for (let j = 0; j < D; j++) mean[j] += row[j];
for (let j = 0; j < D; j++) mean[j] /= X.length;
for (const row of X) for (let j = 0; j < D; j++) std[j] += (row[j] - mean[j]) ** 2;
for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / X.length) || 1;
for (const row of X) for (let j = 0; j < D; j++) row[j] = (row[j] - mean[j]) / std[j];

// Deterministic 80/20 split.
const idx = X.map((_, i) => i);
let s = 42; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
const nTest = Math.floor(idx.length * 0.2);
const testIdx = new Set(idx.slice(0, nTest));
const train = idx.filter((i) => !testIdx.has(i));
const test = idx.slice(0, nTest);

// Logistic regression via full-batch gradient descent + L2.
const w = new Array(D).fill(0); let b = 0;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const lr = 0.5, l2 = 1e-4, epochs = 300;
for (let e = 0; e < epochs; e++) {
  const gw = new Array(D).fill(0); let gb = 0;
  for (const i of train) {
    let z = b; for (let j = 0; j < D; j++) z += w[j] * X[i][j];
    const p = sigmoid(z); const err = p - y[i];
    for (let j = 0; j < D; j++) gw[j] += err * X[i][j];
    gb += err;
  }
  for (let j = 0; j < D; j++) w[j] -= lr * (gw[j] / train.length + l2 * w[j]);
  b -= lr * (gb / train.length);
}

// Evaluate on held-out test.
const baseRate = y.reduce((a, c) => a + c, 0) / y.length;
let llModel = 0, llBase = 0, correct = 0;
const scored: { p: number; y: number }[] = [];
for (const i of test) {
  let z = b; for (let j = 0; j < D; j++) z += w[j] * X[i][j];
  const p = sigmoid(z);
  scored.push({ p, y: y[i] });
  llModel += -(y[i] * Math.log(p + 1e-9) + (1 - y[i]) * Math.log(1 - p + 1e-9));
  llBase += -(y[i] * Math.log(baseRate) + (1 - y[i]) * Math.log(1 - baseRate));
  if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;
}
llModel /= test.length; llBase /= test.length;

// AUC via rank statistic.
scored.sort((a, c) => a.p - c.p);
let rankSum = 0; const pos = scored.filter((r) => r.y === 1).length; const neg = scored.length - pos;
scored.forEach((r, i) => { if (r.y === 1) rankSum += i + 1; });
const auc = (rankSum - pos * (pos + 1) / 2) / (pos * neg);

// Feature importances (|standardized weight|).
const imp = KEYS.map((k, j) => ({ k, w: w[j] })).sort((a, c) => Math.abs(c.w) - Math.abs(a.w));

console.log("# Lever A signal check — logistic regression");
console.log(`rows=${rows.length}  features=${D}  train=${train.length}  test=${test.length}`);
console.log(`base rate (P holds pc) = ${baseRate.toFixed(3)}`);
console.log();
console.log(`Held-out log-loss:  model=${llModel.toFixed(4)}  base=${llBase.toFixed(4)}  (lower better)`);
console.log(`Held-out accuracy:  ${(correct / test.length * 100).toFixed(1)}%  (base = ${(Math.max(baseRate,1-baseRate)*100).toFixed(1)}%)`);
console.log(`Held-out AUC:       ${auc.toFixed(4)}  (0.5 = no signal, 1.0 = perfect)`);
console.log();
console.log("Top features by |standardized weight|:");
for (const { k, w } of imp.slice(0, 10)) console.log(`  ${k.padEnd(20)} ${w >= 0 ? "+" : ""}${w.toFixed(3)}`);
