// Central display profiles for the AI personalities. Decouples the player-facing
// identity (codename) from the internal id and the "Hard-N" generation order —
// the Elo ladder is the live ranking, codenames are just identity, and the tech
// label keeps the link to the technical generation. See docs/ai_roster.md.
//
// Internal personality ids (keys) NEVER change — all engine/data/harness code
// keys off them. Only these display strings are cosmetic.

export interface BotProfile {
  codename: string; // player-facing identity (order-neutral)
  tech: string;     // technical generation name (kept for continuity)
  tagline: string;  // one-line description of how it thinks
}

export const BOT_PROFILES: Record<string, BotProfile> = {
  random:   { codename: "Wildcard", tech: "Random", tagline: "Plays a random legal card. The floor." },
  normal:   { codename: "Greedy",   tech: "Normal", tagline: "Greedy grab + smear-to-ally heuristic." },
  hard:     { codename: "Rulebook", tech: "Hard",   tagline: "Fixed rule-based scoring baseline." },
  "hard-2": { codename: "Darwin",   tech: "Hard-2", tagline: "Evolutionary-tuned scoring weights." },
  "hard-3": { codename: "Envoy",    tech: "Hard-3", tagline: "Tuned scoring + alliance/partner inference." },
  "hard-4": { codename: "Seer",     tech: "Hard-4", tagline: "Belief tracker + Information-Set MCTS search." },
  "hard-4b":{ codename: "Seer-β",   tech: "Hard-4B", tagline: "Experimental Hard-4 variant (under test)." },
};

export function botProfile(id: string): BotProfile {
  return BOT_PROFILES[id] ?? { codename: id, tech: id, tagline: "" };
}
