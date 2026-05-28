// Bucket bid_calibration raw.jsonl by (longest_suit, aces, has_Q♠).
// For each bucket: mean(net) per cap, SE, count. Also mean natural bid (when SUBJECT called at cap=275 → its unconstrained bid).
//
// Usage: npx tsx src/game/_bid_calibration_analyze.ts docs/bid_calibration/raw.jsonl
import { readFileSync } from "fs";

type Row = {
  seed: number; cap: number | "pass"; hand: string;
  callerSeat: number | null; subjectIsCallerTeam: boolean;
  winningBid: number; made: boolean; subjectPts: number;
  callerTeamPts: number; net: number;
};

function bucketOf(handStr: string): string {
  // hand like "A♠ K♠ ... " — count by suit, plus aces and Q♠.
  const cards = handStr.split(" ").filter(Boolean);
  const suitCount: Record<string, number> = { "♠": 0, "♥": 0, "♦": 0, "♣": 0 };
  let aces = 0; let qspades = 0;
  for (const c of cards) {
    const suit = c.slice(-1);
    const rank = c.slice(0, -1);
    if (suit in suitCount) suitCount[suit]++;
    if (rank === "A") aces++;
    if (rank === "Q" && suit === "♠") qspades = 1;
  }
  const longest = Math.max(...Object.values(suitCount));
  const longBucket = longest >= 8 ? "8+" : String(longest);
  const aceBucket = aces >= 3 ? "3+" : String(aces);
  return `len${longBucket}_a${aceBucket}_q${qspades}`;
}

const path = process.argv[2] ?? "docs/bid_calibration/raw.jsonl";
const lines = readFileSync(path, "utf8").trim().split("\n");

type Acc = { sum: number; sumSq: number; n: number };
const newAcc = (): Acc => ({ sum: 0, sumSq: 0, n: 0 });
const push = (a: Acc, x: number) => { a.sum += x; a.sumSq += x * x; a.n++; };
const mean = (a: Acc) => a.n > 0 ? a.sum / a.n : 0;
const se = (a: Acc) => {
  if (a.n < 2) return 0;
  const m = mean(a);
  const v = (a.sumSq - a.n * m * m) / (a.n - 1);
  return Math.sqrt(Math.max(0, v) / a.n);
};

// bucket -> cap -> Acc(net)
const stats = new Map<string, Map<string, Acc>>();
// bucket -> bucket size (count of hands, not rows)
const hands = new Map<string, Set<number>>();
// bucket -> natural bid Acc (cap=275 rows where subject called)
const natural = new Map<string, Acc>();
// bucket -> P(subject became caller | cap)
const callerFreq = new Map<string, Map<string, Acc>>();

for (const line of lines) {
  const r: Row = JSON.parse(line);
  if ((r as any).error) continue;
  const b = bucketOf(r.hand);
  const capKey = String(r.cap);
  if (!stats.has(b)) stats.set(b, new Map());
  if (!stats.get(b)!.has(capKey)) stats.get(b)!.set(capKey, newAcc());
  push(stats.get(b)!.get(capKey)!, r.net);

  if (!callerFreq.has(b)) callerFreq.set(b, new Map());
  if (!callerFreq.get(b)!.has(capKey)) callerFreq.get(b)!.set(capKey, newAcc());
  push(callerFreq.get(b)!.get(capKey)!, r.callerSeat === 0 ? 1 : 0);

  if (!hands.has(b)) hands.set(b, new Set());
  hands.get(b)!.add(r.seed);

  if (capKey === "275" && r.callerSeat === 0) {
    if (!natural.has(b)) natural.set(b, newAcc());
    push(natural.get(b)!, r.winningBid);
  }
}

const CAPS = ["pass", "175", "200", "225", "250", "275"];

// Sort buckets by hand count desc
const bucketList = Array.from(hands.entries())
  .map(([b, s]) => ({ b, n: s.size }))
  .sort((x, y) => y.n - x.n)
  .filter(x => x.n >= 50);

console.log("# Bid calibration analysis");
console.log(`source=${path}  total_rows=${lines.length}  buckets≥50hands=${bucketList.length}`);
console.log();
console.log("| bucket | hands |  pass  |  175  |  200  |  225  |  250  |  275  | cap* | nat_bid | %caller@275 |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|:---:|---:|---:|");

let totalImprove = 0; let totalHands = 0;

for (const { b, n } of bucketList) {
  const row = stats.get(b)!;
  const cells: string[] = [];
  let best = -Infinity; let bestCap = "?";
  let passMean = NaN;
  for (const c of CAPS) {
    const a = row.get(c);
    if (!a || a.n === 0) { cells.push("  —  "); continue; }
    const m = mean(a);
    const s = se(a);
    cells.push(`${m.toFixed(0)}±${s.toFixed(0)}`);
    if (c === "pass") passMean = m;
    if (m > best) { best = m; bestCap = c; }
  }
  const nat = natural.get(b);
  const natStr = nat && nat.n > 0 ? `${mean(nat).toFixed(0)}(n=${nat.n})` : "—";
  const fc = callerFreq.get(b)!.get("275");
  const fcStr = fc ? `${(mean(fc) * 100).toFixed(0)}%` : "—";
  console.log(`| ${b} | ${n} | ${cells.join(" | ")} | ${bestCap} | ${natStr} | ${fcStr} |`);

  if (!isNaN(passMean) && best > passMean) {
    totalImprove += (best - passMean) * n;
    totalHands += n;
  }
}

console.log();
console.log(`Avg improvement of cap* over always-pass across covered hands: ${(totalImprove / Math.max(1, totalHands)).toFixed(1)} pts/hand`);
console.log();
console.log("Legend: each cell is mean(net to SUBJECT team) ± SE. cap* = argmax mean(net).");
console.log("nat_bid = mean winning bid when SUBJECT called at cap=275 (proxy for current hard-3's bid).");
console.log("%caller@275 = how often SUBJECT became caller when allowed to bid up to 275.");
