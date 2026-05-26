// A/B: hard-2 (inference enabled) vs hard-2 (inference disabled), same opponent (Hard), same seeds.
import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { AIPersonality, PlayerId } from "./types";
import { DEFAULT_HARD_WEIGHTS, setActiveHardWeights, HardWeights } from "./aiHard";
import { existsSync, readFileSync } from "fs";

function mulberry32(a: number) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let tuned: HardWeights = { ...DEFAULT_HARD_WEIGHTS };
if (existsSync("./tuned_weights.json")) tuned = { ...DEFAULT_HARD_WEIGHTS, ...JSON.parse(readFileSync("./tuned_weights.json", "utf8")) };

// Lower ally threshold so propagation-derived priors can actually drive decisions.
const ENABLE  = { ...tuned, inferSmearStrength: 0.35, inferSmearThreshold: 10, inferAllyThreshold: 0.70, inferPropagationIters: 2, inferPropagationDecay: 0.5 };
const DISABLE = { ...tuned, inferSmearStrength: 0.35, inferSmearThreshold: 10, inferAllyThreshold: 0.70, inferPropagationIters: 0, inferPropagationDecay: 0.5 };

function runOne(seats: AIPersonality[], seed: number): boolean[] {
  Math.random = mulberry32(seed);
  let s = freshGame(seats.map((p, i) => ({ name: `P${i}`, isAI: true, aiPersonality: p })), 300);
  let safety = 0;
  while (s.phase !== "game_end") {
    if (safety++ > 100000) throw new Error("stuck");
    const r = s.round;
    if (r.phase === "bidding") { const d = aiBidDecision(s, r.bidTurn!); s = d.bid === "pass" ? applyPass(s, r.bidTurn!) : applyBid(s, r.bidTurn!, d.bid); }
    else if (r.phase === "declaring") { const d = aiDeclareDecision(s, r.bidder!); s = applyDeclare(s, d.trump, d.partnerCard); }
    else if (r.phase === "playing") {
      if (r.pendingTrickComplete) s = collectTrick(s);
      else { const card = aiPlayDecision(s, r.toPlay); const legal = legalPlays(s.round.hands[s.round.toPlay], s.round.currentTrick); if (!legal.some(c => c.id === card.id)) throw new Error("illegal"); s = applyPlay(s, s.round.toPlay, card); }
    } else throw new Error("phase " + r.phase);
  }
  const r = s.round;
  const team = new Set<PlayerId>([r.bidder!, ...(r.partners ?? [])]);
  const teamCap = ([0,1,2,3,4] as PlayerId[]).filter(p => team.has(p)).reduce<number>((a, p) => a + (r.roundPoints?.[p] ?? 0), 0);
  const made = teamCap >= (r.winningBid ?? 0);
  return ([0,1,2,3,4] as PlayerId[]).map(p => made ? team.has(p) : !team.has(p));
}

const N = parseInt(process.argv[2] || "3000", 10);
let enW = 0, enS = 0, disW = 0, disS = 0;
for (let i = 0; i < N; i++) {
  const rnd = mulberry32(7 + i * 1009);
  const seats: AIPersonality[] = [];
  for (let k = 0; k < 5; k++) seats.push(rnd() < 0.5 ? "hard-3" : "hard");
  if (!seats.includes("hard-3")) seats[0] = "hard-3";
  if (!seats.includes("hard")) seats[1] = "hard";

  setActiveHardWeights(ENABLE);
  const wA = runOne(seats, 12345 + i * 7919);
  for (let k = 0; k < 5; k++) if (seats[k] === "hard-3") { enS++; if (wA[k]) enW++; }

  setActiveHardWeights(DISABLE);
  const wB = runOne(seats, 12345 + i * 7919);
  for (let k = 0; k < 5; k++) if (seats[k] === "hard-3") { disS++; if (wB[k]) disW++; }
}
console.log(`Games: ${N} (each pair same seed)`);
console.log(`Inference ENABLED  win-rate: ${(enW/enS*100).toFixed(2)}%  (${enW}/${enS})`);
console.log(`Inference DISABLED win-rate: ${(disW/disS*100).toFixed(2)}%  (${disW}/${disS})`);
console.log(`Delta: ${((enW/enS - disW/disS)*100).toFixed(2)}pp`);
