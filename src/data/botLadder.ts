// Hardcoded bot Elo ladder for the in-game Leaderboard.
//
// Source of truth: docs/elo/elo.json (round-robin paired-seed mirror +
// Bradley-Terry + bootstrap CIs — see docs/elo/README.md). These numbers are
// copied from that run. When the ladder is recomputed (or a new bot is placed
// via `_elo_rr.ts place`), update this file to match.
//
// For now the leaderboard is AI-only. When multiplayer + accounts land, human
// players join the same board (their Elo anchored against these bot markers).

export interface LadderEntry {
  bot: string;          // internal personality id
  name: string;         // display name
  elo: number;
  ci95: [number, number];
  blurb: string;        // one-line description of the AI's approach
}

// NOTE: interim values pending the final K=500 round-robin run. Updated from
// docs/elo/elo.json on completion.
export const BOT_LADDER: LadderEntry[] = [
  { bot: "hard-4", name: "Hard-4", elo: 1090, ci95: [1075, 1105], blurb: "Information-Set MCTS + belief & intent inference. Strongest." },
  { bot: "hard-3", name: "Hard-3", elo: 1085, ci95: [1070, 1100], blurb: "Tuned weights + alliance inference + void creation." },
  { bot: "hard-2", name: "Hard-2", elo: 1080, ci95: [1065, 1095], blurb: "First evolutionary-tuned generation." },
  { bot: "hard",   name: "Hard",   elo: 1060, ci95: [1045, 1075], blurb: "Locked rule-based scoring baseline." },
  { bot: "normal", name: "Normal", elo: 1030, ci95: [1015, 1045], blurb: "Greedy bidding + smear-to-ally heuristic." },
  { bot: "random", name: "Random", elo: 1000, ci95: [1000, 1000], blurb: "Plays a random legal card. The floor." },
];

// Ladder metadata for display.
export const LADDER_META = {
  method: "Round-robin paired-seed mirror matches · Bradley-Terry · bootstrap 95% CIs",
  anchor: "Random anchored at 1000",
  note: "AI-only for now — human players join this board when online multiplayer launches.",
};
