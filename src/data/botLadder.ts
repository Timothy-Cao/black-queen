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

// Final K=500 round-robin (docs/elo/elo.json, 2026-05-28).
// Scale: 1000 Elo = 10x odds (see ELO_PER_DECADE in _elo_rr.ts).
export const BOT_LADDER: LadderEntry[] = [
  { bot: "hard-4", name: "Hard-4", elo: 1222, ci95: [1210, 1233], blurb: "Information-Set MCTS + belief & intent inference. Strongest." },
  { bot: "hard-3", name: "Hard-3", elo: 1198, ci95: [1187, 1208], blurb: "Tuned weights + alliance inference + void creation." },
  { bot: "hard-2", name: "Hard-2", elo: 1193, ci95: [1182, 1204], blurb: "First evolutionary-tuned generation." },
  { bot: "hard",   name: "Hard",   elo: 1182, ci95: [1172, 1193], blurb: "Locked rule-based scoring baseline." },
  { bot: "normal", name: "Normal", elo: 1110, ci95: [1099, 1121], blurb: "Greedy bidding + smear-to-ally heuristic." },
  { bot: "random", name: "Random", elo: 1000, ci95: [1000, 1000], blurb: "Plays a random legal card. The floor." },
];

// Ladder metadata for display.
export const LADDER_META = {
  method: "Round-robin paired-seed mirror matches · Bradley-Terry · bootstrap 95% CIs",
  anchor: "Random anchored at 1000",
  note: "AI-only for now — human players join this board when online multiplayer launches.",
};
