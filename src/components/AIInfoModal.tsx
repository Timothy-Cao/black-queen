// AI Info page — concise, visual mini-paper explaining the AI generations.
// Linked from HelpModal. Self-contained, no external chart libs.

interface Props {
  onClose: () => void;
}

// Tournament data (per-seat win-rate edge, fresh-seed verification runs).
// Update these from `_tournament.ts` output when a new generation ships.
const MATCHUP: { a: string; b: string; aWin: number; bWin: number; }[] = [
  { a: "Hard-4", b: "Hard-3", aWin: 53.48, bWin: 52.80 },   // 500-pair mirror replay, play-only
  { a: "Hard-3", b: "Hard-2", aWin: 53.20, bWin: 52.99 },
  { a: "Hard-3", b: "Hard",   aWin: 56.69, bWin: 50.48 },
  { a: "Hard-3", b: "Normal", aWin: 60.85, bWin: 45.40 },
  { a: "Hard-2", b: "Hard",   aWin: 54.65, bWin: 51.31 },
  { a: "Hard",   b: "Normal", aWin: 59.64, bWin: 47.54 },
];

// Per-gen color (used in headers + bars).
const GEN_COLOR: Record<string, string> = {
  "Hard":    "#a78bfa",   // violet
  "Hard-2":  "#60a5fa",   // sky
  "Hard-3":  "#f5c46b",   // gold
  "Hard-4":  "#34d399",   // emerald (search-based — different paradigm)
  "Normal":  "#9ca3af",   // gray
  "Random":  "#6b7280",   // darker gray
};

interface GenSpec {
  name: string;
  tagline: string;
  techniques: string[];
  weights: number | string;
  vsBase: number | null;  // edge vs Normal
}

const GENS: GenSpec[] = [
  {
    name: "Hard",
    tagline: "Locked rule-based baseline (gen 1).",
    techniques: [
      "Hand-crafted utility scoring (~50 scalars)",
      "Trump + partner-card heuristics",
      "Smear-to-known-ally, penalty for feeding enemy",
      "Q♠ commit/dump threshold",
    ],
    weights: "~50",
    vsBase: 12.10,
  },
  {
    name: "Hard-2",
    tagline: "First evolutionary tuning (gen 2).",
    techniques: [
      "All Hard logic, weights retuned",
      "(1+λ)-Evolution Strategy with self-adaptive σ",
      "Mirror-replay paired evaluation",
      "Promotion gate against the locked baseline",
    ],
    weights: "~50",
    vsBase: 14.30,
  },
  {
    name: "Hard-3",
    tagline: "Tuned utility function. The strongest of the heuristic gens.",
    techniques: [
      "Bayesian-style alliance inference from point-feed plays",
      "Threshold-gate: high-confidence inferences promote unknowns to ally/enemy",
      "Void-creation discard scoring (gated by remaining trump)",
      "Multi-opponent fitness (vs Hard + vs Hard-2), non-regression gate",
    ],
    weights: "~58",
    vsBase: 15.45,
  },
  {
    name: "Hard-4",
    tagline: "Different paradigm: search + belief, not utility scoring.",
    techniques: [
      "Information-Set Monte Carlo Tree Search (ISMCTS)",
      "Hard-constraint belief tracker (voids, played cards, partner card)",
      "Team-aware tactical rollout (smear/defend/Q♠-aware)",
      "Rust → WASM; ~190 KB artifact, runs in-browser at ~300 ms/move",
    ],
    weights: "0 (algorithmic)",
    vsBase: 14.6,    // approx vs Normal via Hard-3 chain; needs direct measurement
  },
];

interface TriedItem { label: string; result: "win" | "wash" | "regress"; note: string; }
const TRIED: TriedItem[] = [
  { label: "Single-opponent ES tuning", result: "regress", note: "Opponent-overfit; new gens lost head-to-head against prior gen." },
  { label: "Soft alliance probability scaling", result: "regress", note: "Smear/feed firing too softly; calibrated for binary gates." },
  { label: "Void-creation discard scoring",   result: "win",     note: "+0.24pp at defaults, retuned in Hard-3." },
  { label: "Alliance inference (point-feed)", result: "win",     note: "Threshold-gate integration; ~+2pp on call rate." },
  { label: "Multi-hop inference propagation", result: "wash",    note: "+0.06pp at defaults; kept in code, disabled by default." },
  { label: "ISMCTS + belief (Hard-4)",        result: "win",     note: "New paradigm. Plays approximately even with Hard-3 at default config." },
  { label: "Team-aware ISMCTS value backprop", result: "win",    note: "Hard-4: structural fix — sum the team's captured points, not just self's." },
  { label: "Tactical rollout (team-aware)",    result: "win",    note: "Hard-4: smear/defend/Q♠-aware; biggest single lever over random rollouts." },
  { label: "Minimax endgame solver",           result: "regress", note: "Hard-4: -1pp. Minimax assumes optimal opponents; Hard-3 plays heuristically. Kept gated." },
  { label: "Soft bid-strength belief prior",   result: "regress", note: "Hard-4: -3pp at default weights. Needs ES tuning to find right strength. Gated." },
];

const FUTURE: { label: string; note: string }[] = [
  { label: "Opponent-intent / alignment inference", note: "Track P(player on caller team) from observable signals: point-feeding patterns, defensive steals, withhold opportunities. Multi-signal Bayesian inference with calibrated likelihood ratios per signal type." },
  { label: "ES tuning of Hard-4 scalars",         note: "Hard-4 has ~10 magic constants (UCB c, smear thresholds, defense thresholds) that have never been ES-tuned. Hard-3 gained most of its strength this way." },
  { label: "Tree-structured ISMCTS",              note: "Current: single-rooted (stats at root only). Tree-structured: stats at every information set encountered. Each iteration learns more." },
  { label: "Search-based bidder",                 note: "Currently delegates to Hard-3 for bid/declare. Sample N self-hand-consistent worlds, run mini-ISMCTS as 'what if I bid X with trump T'. Holistic Hard-4 vs Hard-3 edge." },
  { label: "ISMCTS-in-endgame (replaces minimax)", note: "Fix the endgame regress: use ISMCTS with full iteration budget at ≤3 tricks, instead of minimax. Matches opponent model." },
];

// Maps a win-rate to a 0–100% bar position. Anchored at 50% for neutral.
function barWidth(pct: number): string {
  return `${Math.min(100, Math.max(0, pct))}%`;
}

export function AIInfoModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl p-7 w-[820px] max-w-full max-h-[92vh] overflow-auto animate-floatIn ring-1 ring-gold-400/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-gold-400/80">A mini-paper</div>
            <h2 className="font-display text-3xl text-gold-400 mt-0.5">Inside the AI</h2>
            <div className="text-xs text-stone-400 mt-1">Four generations of game-playing agents — three utility-function, one search-based — in one page.</div>
          </div>
          <button className="btn btn-ghost text-sm" onClick={onClose}>Close</button>
        </div>

        {/* TL;DR */}
        <section className="mb-6 rounded-xl bg-gradient-to-br from-gold-500/5 to-amber-500/5 ring-1 ring-gold-400/20 p-4">
          <div className="text-[10px] uppercase tracking-widest text-gold-400 mb-2">TL;DR</div>
          <p className="text-sm leading-relaxed text-stone-200">
            <b className="text-gold-400">Hard / Hard-2 / Hard-3</b> are a hand-crafted utility function with
            <b className="text-gold-400"> ~58 tunable scalars</b>, refined by evolutionary search over millions
            of simulated games, with a Bayesian-style team inference layer.
            <b className="text-emerald-300"> Hard-4</b> is a fundamentally different paradigm:
            <b className="text-emerald-300"> Information-Set Monte Carlo Tree Search</b> with a belief tracker,
            implemented in Rust and shipped to your browser via WASM (~190 KB).
            In mirror-replay testing, Hard-4 plays approximately even with Hard-3 at default config — a
            real validation that search-based play can match decades of hand-tuned weight refinement,
            with substantial headroom remaining.
          </p>
        </section>

        {/* Generations */}
        <section className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-gold-400 mb-3">Generations</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {GENS.map((g) => (
              <div
                key={g.name}
                className="rounded-xl p-3.5 ring-1 ring-white/10"
                style={{
                  background: `linear-gradient(135deg, ${GEN_COLOR[g.name]}18, transparent 70%)`,
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-display text-xl" style={{ color: GEN_COLOR[g.name] }}>{g.name}</div>
                  <div className="text-[10px] text-stone-400 uppercase tracking-wider">{g.weights} weights</div>
                </div>
                <div className="text-[11px] text-stone-300 mb-2 leading-snug">{g.tagline}</div>
                {g.vsBase !== null && (
                  <div className="text-[11px] text-emerald-300/90 mb-2">+{g.vsBase}pp vs Normal</div>
                )}
                <ul className="space-y-1 text-[11px] text-stone-300/90">
                  {g.techniques.map((t) => (
                    <li key={t} className="flex gap-1.5 leading-snug">
                      <span className="text-gold-400/70 select-none">·</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Matchup matrix */}
        <section className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-gold-400 mb-3">Matchup matrix</div>
          <div className="text-[11px] text-stone-400 mb-2">
            Same-seed mirrored play, 2500 game pairs each. Bar shows per-seat win rate.
            Edge = A − B (positive means A wins more seats).
          </div>
          <div className="space-y-2">
            {MATCHUP.map((m) => {
              const edge = m.aWin - m.bWin;
              const colorA = GEN_COLOR[m.a];
              const colorB = GEN_COLOR[m.b];
              return (
                <div key={`${m.a}-${m.b}`} className="rounded-lg bg-black/30 ring-1 ring-white/5 p-2.5">
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <div>
                      <span className="font-semibold" style={{ color: colorA }}>{m.a}</span>
                      <span className="text-stone-500 mx-2">vs</span>
                      <span className="font-semibold" style={{ color: colorB }}>{m.b}</span>
                    </div>
                    <div className={`font-mono text-xs ${edge >= 2 ? "text-emerald-300" : edge >= 0 ? "text-stone-200" : "text-rose-300"}`}>
                      {edge >= 0 ? "+" : ""}{edge.toFixed(2)}pp
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {/* A */}
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-stone-400">{m.a}</span>
                        <span className="font-mono text-stone-300">{m.aWin.toFixed(2)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: barWidth(m.aWin), background: colorA }} />
                      </div>
                    </div>
                    {/* B */}
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-stone-400">{m.b}</span>
                        <span className="font-mono text-stone-300">{m.bWin.toFixed(2)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: barWidth(m.bWin), background: colorB }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Method timeline */}
        <section className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-gold-400 mb-3">What we tried — and what worked</div>
          <div className="rounded-xl ring-1 ring-white/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-stone-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Experiment</th>
                  <th className="text-left px-3 py-2 font-medium w-20">Verdict</th>
                  <th className="text-left px-3 py-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {TRIED.map((t, i) => (
                  <tr key={t.label} className={i % 2 ? "bg-black/20" : ""}>
                    <td className="px-3 py-2 text-stone-200">{t.label}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold ${
                        t.result === "win"     ? "bg-emerald-500/20 text-emerald-300" :
                        t.result === "regress" ? "bg-rose-500/20 text-rose-300" :
                                                  "bg-stone-500/20 text-stone-300"
                      }`}>
                        {t.result === "win" ? "Ship" : t.result === "regress" ? "Reject" : "Wash"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-stone-300">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Method block */}
        <section className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl ring-1 ring-white/10 p-3.5 bg-black/20">
            <div className="text-[10px] uppercase tracking-widest text-gold-400 mb-2">Tuning loop</div>
            <ol className="space-y-1.5 text-[12px] text-stone-300 leading-snug list-decimal pl-4">
              <li>Sample 12 mutations relative to the current best, scaled by σ.</li>
              <li>Each candidate plays ~120 mixed-personality games (mirror-replayed).</li>
              <li>Promote the winner — but only if it beats <i>both</i> Hard and the prior tuned gen.</li>
              <li>1/5-success rule adapts σ: too few wins → shrink, too many → grow.</li>
              <li>Verify final candidate on 5000 fresh-seed games before shipping.</li>
            </ol>
          </div>
          <div className="rounded-xl ring-1 ring-white/10 p-3.5 bg-black/20">
            <div className="text-[10px] uppercase tracking-widest text-gold-400 mb-2">Inference loop</div>
            <ol className="space-y-1.5 text-[12px] text-stone-300 leading-snug list-decimal pl-4">
              <li>Track per-player <i>P(in caller team)</i> — start at base prior.</li>
              <li>For every played card worth ≥ 10 points, if the player isn't winning the trick they're feeding someone.</li>
              <li>If the trick-winner is a confirmed ally / enemy, shift the feeder's prior accordingly.</li>
              <li>Cross the 0.85 confidence threshold → treat unknown as inferred ally / enemy.</li>
              <li>Plug into the same binary smear / feed gates the AI already uses.</li>
            </ol>
          </div>
        </section>

        {/* Future directions */}
        <section className="mb-2">
          <div className="text-[10px] uppercase tracking-widest text-gold-400 mb-3">What's next</div>
          <div className="space-y-2">
            {FUTURE.map((f) => (
              <div key={f.label} className="rounded-lg bg-black/20 ring-1 ring-white/5 p-2.5">
                <div className="text-xs font-semibold text-stone-200">{f.label}</div>
                <div className="text-[11px] text-stone-400 mt-0.5">{f.note}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-500 mt-3 leading-relaxed italic">
            Hard-3 represents the ceiling of the utility-function representation. Hard-4 broke
            into a different paradigm — search over a belief state — and currently plays
            approximately even with Hard-3 on a default, untuned configuration. The path to
            decisively beating Hard-3 lies in tuning Hard-4's search scalars (the same ES
            discipline that gave Hard-3 its edge), or layering proper opponent-intent inference
            on top of the existing belief tracker.
          </p>
        </section>
      </div>
    </div>
  );
}
