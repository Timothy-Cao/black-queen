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
  bot: string;
  name: string;
  type: string;
  elo: number;
}

// Final K=500 round-robin (docs/elo/elo.json, 2026-05-28).
// Scale: 1000 Elo = 10x odds (see ELO_PER_DECADE in _elo_rr.ts).
export const BOT_LADDER: LadderEntry[] = [
  { bot: "hard-4", name: "Seer", type: "Search + belief", elo: 1220 },
  { bot: "hard-3", name: "Envoy", type: "Inference + scoring", elo: 1200 },
  { bot: "hard-2", name: "Darwin", type: "Tuned scoring", elo: 1194 },
  { bot: "hard", name: "Rulebook", type: "Rule scoring", elo: 1181 },
  { bot: "normal", name: "Greedy", type: "Greedy", elo: 1113 },
  { bot: "random", name: "random0", type: "Random play", elo: 1000 },
];
