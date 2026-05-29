// Bot Elo ladder — round-robin of paired-seed mirror matchups + Bradley-Terry
// fit + bootstrap confidence intervals. The strong model for this 5-player
// hidden-team game:
//
//   - PAIRED-SEED MIRROR (from _mirror_arena): each deal is played twice with
//     the two bots' seats swapped ([1 A,4 B] and [1 B,4 A]), cancelling deal/seat
//     luck. This is what reliably resolves small edges (±4pp) at feasible N.
//   - UNIFORM FIELD (1 vs 4 of the same bot) so the two compared bots' skill gap
//     dominates the outcome instead of being diluted by 3 unrelated bots — gives
//     real Elo SPREAD (unlike fully-mixed tables, which compress to ~100 Elo).
//   - BRADLEY-TERRY (MM algorithm) on the per-seat win counts → Elo scale.
//   - BOOTSTRAP over seed-pairs → 95% CI per bot, so you can SEE which bots are
//     truly separated vs statistically tied.
//
// Modes:
//   Round-robin (rate all bots):   npx tsx src/game/_elo_rr.ts <K> [out.json]
//   Placement (rate a NEW bot vs the existing ladder, others fixed):
//                                   npx tsx src/game/_elo_rr.ts place <newBot> <K> [ladder.json]
//
// HARD4_TIME_MS controls hard-4 search budget (default 80 here for speed).

import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { AIPersonality, GameState, PlayerId } from "./types";
import { DEFAULT_HARD_WEIGHTS, HardWeights, setActiveHardWeights, setGen2HardWeights } from "./aiHard";
import { warmWasm } from "./hard4Driver";
import gen2Weights from "./tuned_weights_gen2.json";
import gen3Weights from "./tuned_weights_gen3.json";

setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights } as HardWeights);
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights } as HardWeights);
await warmWasm();

const BOTS: AIPersonality[] = ["random", "normal", "hard", "hard-2", "hard-3", "hard-4"];
const ANCHOR_BOT: AIPersonality = "random";
const ANCHOR_ELO = 1000;
const SCALE = 400 / Math.log(10);

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function withSeededRandom<T>(seed: number, fn: () => T): T {
  const old = Math.random; Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = old; }
}

function runOneGame(seats: AIPersonality[]): Set<PlayerId> | null {
  let state: GameState = freshGame(seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })));
  let safety = 0;
  while (state.round.phase !== "round_end" && state.round.phase !== "game_end") {
    if (safety++ > 6000) return null;
    const r = state.round;
    if (r.pendingTrickComplete) { state = collectTrick(state); continue; }
    if (r.phase === "bidding" && r.bidTurn !== undefined) {
      const d = aiBidDecision(state, r.bidTurn);
      state = d.bid === "pass" ? applyPass(state, r.bidTurn) : applyBid(state, r.bidTurn, d.bid);
    } else if (r.phase === "declaring" && r.bidder !== undefined) {
      const d = aiDeclareDecision(state, r.bidder);
      state = applyDeclare(state, d.trump, d.partnerCard);
    } else if (r.phase === "playing") {
      state = applyPlay(state, r.toPlay, aiPlayDecision(state, r.toPlay));
    }
  }
  const r = state.round;
  if (r.bidder === undefined) return null;
  const team = new Set<PlayerId>([r.bidder, ...(r.partners ?? [])]);
  const teamPts = Array.from(team).reduce<number>((s, p) => s + (r.roundPoints?.[p] ?? 0), 0);
  const made = r.winningBid !== undefined && teamPts >= r.winningBid;
  const winners = new Set<PlayerId>();
  for (const p of [0, 1, 2, 3, 4] as PlayerId[]) if ((made && team.has(p)) || (!made && !team.has(p))) winners.add(p);
  return winners;
}

// One paired-seed mirror between a and b. Returns {aw, bw} = per-seat wins for
// a and b across the two games (each appears in 5 seats total). null if a game
// stalls (e.g. random-vs-random all-pass loop).
function mirrorSeedPair(a: AIPersonality, b: AIPersonality, seed: number): { aw: number; bw: number } | null {
  const seat = seed % 5;
  const seatsA: AIPersonality[] = [b, b, b, b, b]; seatsA[seat] = a; // 1 a, 4 b
  const seatsB: AIPersonality[] = [a, a, a, a, a]; seatsB[seat] = b; // 1 b, 4 a
  return withSeededRandom(seed, () => {
    const wa = runOneGame(seatsA); const wb = runOneGame(seatsB);
    if (!wa || !wb) return null;
    let aw = 0, bw = 0;
    for (let s = 0 as PlayerId; s < 5; s = (s + 1) as PlayerId) {
      if (seatsA[s] === a) { if (wa.has(s)) aw++; } else { if (wa.has(s)) bw++; }
      if (seatsB[s] === a) { if (wb.has(s)) aw++; } else { if (wb.has(s)) bw++; }
    }
    return { aw, bw };
  });
}

// Bradley-Terry MM fit on a win-count matrix → Elo (anchor bot fixed at ANCHOR_ELO).
function fitElo(wins: number[][], names: AIPersonality[]): number[] {
  const n = names.length;
  const p = new Array(n).fill(1);
  const tot = (i: number, j: number) => wins[i][j] + wins[j][i];
  for (let iter = 0; iter < 2000; iter++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let num = 0, den = 0;
      for (let j = 0; j < n; j++) { if (j === i) continue; num += wins[i][j]; const nij = tot(i, j); if (nij > 0) den += nij / (p[i] + p[j]); }
      next[i] = den > 0 ? num / den : p[i];
    }
    const gm = Math.exp(next.reduce((s, x) => s + Math.log(x || 1e-9), 0) / n);
    for (let i = 0; i < n; i++) p[i] = next[i] / gm;
  }
  const raw = p.map((x) => SCALE * Math.log(x));
  const ai = names.indexOf(ANCHOR_BOT);
  const shift = ai >= 0 ? ANCHOR_ELO - raw[ai] : ANCHOR_ELO - Math.min(...raw);
  return raw.map((e) => e + shift);
}

function percentile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---------------------------------------------------------------------------
const argv = process.argv;
const placeMode = argv[2] === "place";

if (!placeMode) {
  // ===== Round-robin: rate all BOTS =====
  const K = parseInt(argv[2] ?? "400", 10);
  const outPath = argv[3] ?? "docs/elo/elo.json";
  mkdirSync(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  const n = BOTS.length;
  const wins: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  // per-pair seed records for bootstrap: pairRec[i][j] = [{aw,bw}...] (i<j)
  const pairRec: Record<string, { aw: number; bw: number }[]> = {};
  const t0 = Date.now();
  let done = 0; const totalPairs = (n * (n - 1)) / 2;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const recs: { aw: number; bw: number }[] = [];
    for (let k = 0; k < K; k++) {
      const seed = 30_000_000 + i * 5_000_000 + j * 700_000 + k;
      const r = mirrorSeedPair(BOTS[i], BOTS[j], seed);
      if (!r) continue;
      recs.push(r); wins[i][j] += r.aw; wins[j][i] += r.bw;
    }
    pairRec[`${i}_${j}`] = recs;
    done++;
    console.error(`pair ${done}/${totalPairs}: ${BOTS[i]} vs ${BOTS[j]}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const elo = fitElo(wins, BOTS);
  // bootstrap CIs: resample seed-pairs per matchup, refit
  const B = 600; const samples: number[][] = Array.from({ length: n }, () => []);
  for (let b = 0; b < B; b++) {
    const brng = mulberry32(91_000 + b);
    const w: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const recs = pairRec[`${i}_${j}`]; const m = recs.length; if (!m) continue;
      for (let t = 0; t < m; t++) { const r = recs[Math.floor(brng() * m)]; w[i][j] += r.aw; w[j][i] += r.bw; }
    }
    const e = fitElo(w, BOTS); for (let i = 0; i < n; i++) samples[i].push(e[i]);
  }
  const pairRate: Record<string, Record<string, number | null>> = {};
  for (let i = 0; i < n; i++) { pairRate[BOTS[i]] = {}; for (let j = 0; j < n; j++) { if (i === j) { pairRate[BOTS[i]][BOTS[j]] = null; continue; } const tt = wins[i][j] + wins[j][i]; pairRate[BOTS[i]][BOTS[j]] = tt > 0 ? +(wins[i][j] / tt).toFixed(3) : null; } }
  const ladder = BOTS.map((bot, i) => { const s = samples[i].slice().sort((a, b) => a - b); return { bot, elo: Math.round(elo[i]), ci95: [Math.round(percentile(s, 0.025)), Math.round(percentile(s, 0.975))] as [number, number] }; }).sort((a, b) => b.elo - a.elo);
  const result = { method: "round-robin paired-seed mirror + Bradley-Terry + bootstrap", seedPairsPerMatchup: K, bootstrapSamples: B, hard4TimeMs: process.env.HARD4_TIME_MS ?? "default", anchor: `${ANCHOR_BOT}=${ANCHOR_ELO}`, ladder, pairwiseWinRate: pairRate };
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n# Bot Elo ladder — ${result.method}`);
  console.log(`${K} seed-pairs/matchup, ${K * 2} games each · anchor ${ANCHOR_BOT}=${ANCHOR_ELO} · HARD4_TIME_MS=${result.hard4TimeMs}\n`);
  console.log("| bot | Elo | 95% CI |");
  console.log("|---|---:|---:|");
  for (const r of ladder) console.log(`| ${r.bot} | ${r.elo} | ${r.ci95[0]}–${r.ci95[1]} |`);
  console.log(`\nwrote ${outPath}`);
} else {
  // ===== Placement: rate a NEW bot vs the existing ladder (others fixed) =====
  const newBot = argv[3] as AIPersonality;
  const K = parseInt(argv[4] ?? "400", 10);
  const ladderPath = argv[5] ?? "docs/elo/elo.json";
  const prior = JSON.parse(readFileSync(ladderPath, "utf8")) as { ladder: { bot: AIPersonality; elo: number }[] };
  const ref = prior.ladder.filter((r) => r.bot !== newBot);
  console.error(`Placing "${newBot}" vs ${ref.length} rated bots, ${K} seed-pairs each...`);
  // gather new bot's wins/losses vs each reference (per-seed records for bootstrap)
  const perRef: { elo: number; recs: { nw: number; rw: number }[] }[] = [];
  const t0 = Date.now();
  for (const rb of ref) {
    const recs: { nw: number; rw: number }[] = [];
    for (let k = 0; k < K; k++) {
      const seed = 50_000_000 + rb.elo * 1000 + k;
      const r = mirrorSeedPair(newBot, rb.bot, seed);
      if (r) recs.push({ nw: r.aw, rw: r.bw });
    }
    perRef.push({ elo: rb.elo, recs });
    console.error(`  vs ${rb.bot} (${rb.elo}): done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  // fit only the new bot's Elo: maximize logistic likelihood of its wins vs fixed-Elo refs
  const fitNew = (data: { elo: number; nw: number; rw: number }[]): number => {
    let r = 1500;
    for (let iter = 0; iter < 200; iter++) {
      let g = 0, h = 0;
      for (const d of data) { const nGames = d.nw + d.rw; if (!nGames) continue; const pExp = 1 / (1 + Math.pow(10, -(r - d.elo) / 400)); const c = Math.log(10) / 400; g += c * (d.nw - nGames * pExp); h += -c * c * nGames * pExp * (1 - pExp); }
      if (Math.abs(h) < 1e-12) break; const step = g / h; r -= step; if (Math.abs(step) < 1e-4) break;
    }
    return r;
  };
  const agg = perRef.map((p) => ({ elo: p.elo, nw: p.recs.reduce((s, x) => s + x.nw, 0), rw: p.recs.reduce((s, x) => s + x.rw, 0) }));
  const placed = fitNew(agg);
  // bootstrap CI
  const B = 600; const samp: number[] = [];
  for (let b = 0; b < B; b++) {
    const brng = mulberry32(73_000 + b);
    const data = perRef.map((p) => { const m = p.recs.length; let nw = 0, rw = 0; for (let t = 0; t < m; t++) { const r = p.recs[Math.floor(brng() * m)]; nw += r.nw; rw += r.rw; } return { elo: p.elo, nw, rw }; });
    samp.push(fitNew(data));
  }
  samp.sort((a, b) => a - b);
  console.log(`\n# Placement: ${newBot}`);
  console.log(`Estimated Elo: ${Math.round(placed)}  (95% CI ${Math.round(percentile(samp, 0.025))}–${Math.round(percentile(samp, 0.975))})\n`);
  console.log("| vs | their Elo | ${newBot} win% |".replace("${newBot}", newBot));
  console.log("|---|---:|---:|");
  for (const p of agg) { const tot = p.nw + p.rw; console.log(`| (Elo ${p.elo}) | ${p.elo} | ${tot ? (p.nw / tot * 100).toFixed(1) : "—"}% |`); }
}
