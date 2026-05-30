// AI Info, full-page blog/paper-style writeup. Routed at /ai.
// Tabbed layout. The content pane is the dedicated scroll container so the
// header and tab strip stay pinned at the top.

import { useEffect, useState } from "react";
import { BOT_LADDER } from "../data/botLadder";
import { botProfile } from "../data/botProfiles";

interface Props {
  onBack: () => void;
}

// Roster legend: ties the player-facing codenames (used in the lobby + leaderboard)
// to the technical "Hard-N" generation names this paper refers to, plus their Elo.
function RosterLegend() {
  return (
    <div className="mt-6 rounded-lg border border-white/10 overflow-hidden">
      <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-gold-400/80 bg-white/5">
        Roster · codename ⇄ generation
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-stone-500 uppercase text-[10px] tracking-wider border-b border-white/10">
            <th className="text-left font-medium px-4 py-1.5">Codename</th>
            <th className="text-left font-medium px-2 py-1.5">Generation</th>
            <th className="text-right font-medium px-2 py-1.5">Elo</th>
            <th className="text-left font-medium px-4 py-1.5">How it thinks</th>
          </tr>
        </thead>
        <tbody>
          {BOT_LADDER.map((e) => {
            const pr = botProfile(e.bot);
            return (
              <tr key={e.bot} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-1.5 text-gold-300 font-medium">{pr.codename}</td>
                <td className="px-2 py-1.5 font-mono text-stone-400">{pr.tech}</td>
                <td className="px-2 py-1.5 text-right font-mono text-stone-200">{e.elo}</td>
                <td className="px-4 py-1.5 text-stone-400">{pr.tagline}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10px] text-stone-500 bg-white/[0.02]">
        This paper refers to agents by their <span className="text-stone-300">generation</span> (Hard-N); the lobby and leaderboard use the <span className="text-gold-300/80">codename</span>. Same agents.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Data
// ---------------------------------------------------------------------------

// All matchup-matrix numbers measured at LIGHT shuffle (intensity 0),
// 2500 game pairs × 2 mirror per cell unless noted.
const MATCHUP: { a: string; b: string; aWin: number; bWin: number; note?: string }[] = [
  { a: "Hard-4", b: "Hard-3", aWin: 54.96, bWin: 51.04, note: "500 pairs × 2 mirror (~4σ)" },
  { a: "Hard-4", b: "Hard-2", aWin: 55.20, bWin: 51.40, note: "300 pairs × 2 mirror" },
  { a: "Hard-4", b: "Hard",   aWin: 56.48, bWin: 51.16, note: "500 pairs × 2 mirror" },
  { a: "Hard-3", b: "Hard-2", aWin: 53.20, bWin: 52.99 },
  { a: "Hard-3", b: "Hard",   aWin: 56.69, bWin: 50.48 },
  { a: "Hard-3", b: "Normal", aWin: 60.85, bWin: 45.40 },
  { a: "Hard-2", b: "Hard",   aWin: 54.65, bWin: 51.31 },
  { a: "Hard",   b: "Normal", aWin: 59.64, bWin: 47.54 },
];

const GEN_COLOR: Record<string, string> = {
  "Hard":    "#a78bfa",
  "Hard-2":  "#60a5fa",
  "Hard-3":  "#f5c46b",
  "Hard-4":  "#34d399",
  "Normal":  "#9ca3af",
  "Random":  "#6b7280",
};

interface GenSpec {
  name: string;
  paradigm: string;
  weights: string;
  vsNormal: number | null;
  bullets: string[];
}

const GENS: GenSpec[] = [
  {
    name: "Hard",
    paradigm: "Rule-based utility scoring",
    weights: "~50 scalars",
    vsNormal: 12.10,
    bullets: [
      "Hand-crafted utility scoring for trump pick, partner card, and per-move evaluation",
      "Smear-to-known-ally + penalty for feeding the enemy",
      "Q♠ commit/dump threshold",
      "Locked baseline, never re-tuned; every later generation is measured against this",
    ],
  },
  {
    name: "Hard-2",
    paradigm: "Evolutionary-tuned utility",
    weights: "~50 scalars",
    vsNormal: 14.30,
    bullets: [
      "Same architecture as Hard, weights retuned",
      "(1+λ)-Evolution Strategy with self-adaptive σ via the 1/5-success rule",
      "Mirror-replay paired evaluation cancels seat and shuffle variance",
      "Promotion gate against the locked baseline",
    ],
  },
  {
    name: "Hard-3",
    paradigm: "Tuned utility + Bayesian inference",
    weights: "~58 scalars",
    vsNormal: 15.45,
    bullets: [
      "Bayesian-style alliance inference from point-feed plays",
      "Threshold-gate: high-confidence inferences promote unknowns to ally/enemy",
      "Void-creation discard scoring (gated by remaining trump)",
      "Multi-opponent fitness (vs Hard + vs Hard-2), non-regression promotion gate",
    ],
  },
  {
    name: "Hard-4",
    paradigm: "Search over a belief state",
    weights: "~15 hand-set",
    vsNormal: 13.4,
    bullets: [
      "Information-Set Monte Carlo Tree Search (ISMCTS)",
      "Hard-constraint belief tracker tracks voids, played cards, partner identity",
      "Opponent-intent Bayesian inference: 9 calibrated signals scaled by voluntariness",
      "Team-aware tactical rollout; biased determinization sampling from belief",
      "Low-point enemy-discard guard, discovered by trace review",
      "Rust → WASM ~190 KB; ~300 ms/move in-browser",
    ],
  },
];

interface TriedItem { label: string; result: "win" | "wash" | "regress"; note: string; }
const TRIED: TriedItem[] = [
  { label: "Single-opponent ES tuning",            result: "regress", note: "Opponent-overfit; new gens lost head-to-head against prior gen on fresh seeds." },
  { label: "Soft alliance probability scaling",    result: "regress", note: "Smear/feed firing too softly; weights were calibrated for binary gates." },
  { label: "Void-creation discard scoring",        result: "win",     note: "+0.24pp at defaults, retuned in Hard-3." },
  { label: "Alliance inference (point-feed)",      result: "win",     note: "Threshold-gate integration; ~+2pp on call rate." },
  { label: "Multi-hop inference propagation",      result: "wash",    note: "+0.06pp at defaults; kept in code, disabled by default." },
  { label: "ISMCTS + belief (Hard-4 core)",        result: "win",     note: "Paradigm shift away from utility scoring. Plays approximately even with Hard-3 at default config." },
  { label: "Team-aware ISMCTS value backprop",     result: "win",     note: "Sum the team's captured points, not just self's. Structural fix." },
  { label: "Tactical rollout (team-aware)",        result: "win",     note: "Smear/defend/Q♠-aware rollout; biggest single lever over random rollouts." },
  { label: "Minimax endgame solver",               result: "regress", note: "−1pp. Minimax assumes optimal opponents; Hard-3 plays heuristically. Kept gated." },
  { label: "Soft bid-strength belief prior",       result: "regress", note: "−3pp at default weights. Needs ES tuning. Gated." },
  { label: "Opponent-intent Bayesian inference",   result: "win",     note: "+1.2pp over Hard-4 baseline; total Hard-4 vs Hard-3 = +3.92pp (~4σ). 9 signals scaled by voluntariness." },
  { label: "Shuffle-robust 'Hard-A' generation",   result: "wash",    note: "AI never references shuffle mode in code. Sweep showed edge degradation is mostly game-variance, not AI miscalibration." },
  { label: "Rust-engine deal mirroring",           result: "win",     note: "Ported deal5pLight to Rust + parameterized intensity. Tuning now matches production distribution (Light)." },
  { label: "Rayon-parallel ES evaluation",         result: "win",     note: "Lock-free atomic tallies + thread-local weight override. ~7.5× wall-time speedup on 16 cores." },
  { label: "Hard-5: ES-tune Hard-4 intent weights", result: "regress", note: "Two 20-gen runs (no gate, then with non-regression gate vs Default). Both converged on weights that look improved on training seeds but verify at −0.20pp on fresh seeds (within 1σ of noise). Hard-4's intent magnitudes are already near-optimal for this representation. Tuner infra retained for future use." },
  { label: "Threshold-optimization rollout backprop", result: "regress", note: "Replaced ISMCTS's EV-proxy (captured/300) with the true indicator, P(team makes bid). The theory was plausible, but pure binary value was −1.47pp at N=300. Hybrid value was +1.93pp at N=300, then −0.20pp at N=500. The smoother EV proxy already carries the useful signal at this search depth." },
  { label: "Partner-aware bidding adjustment",       result: "wash",    note: "Insight: weak hands with no aces/Q♠/kings are likely on the opposing team, so push the bid up to force the caller into failure territory. Symmetric version (also lower bid for partner-rich hands) regressed −2.00pp, strong hands should bid more, not less. Asymmetric fix (only raise for partner-poor): +0.87pp at N=300 → +0.07pp at N=600. The triggering window is <5% of games. Toggle retained for any future smarter bidder." },
  { label: "Low-point enemy-discard guard",           result: "win",     note: "Qualitative trace review found hard AIs dumping point cards onto known enemy-winning rounds. Hard-4 has the Rust post-search guard, and Hard / Hard-2 / Hard-3 now have the same narrow TypeScript guard. Latest matrix: +0.30pp to +0.66pp vs Normal for the TS hard family, with no lineup reorder." },
];

// Shuffle-intensity sweep (Hard-3 vs others at five intensities, 1500 pairs × 2 mirror).
const SHUFFLE_SWEEP: { t: number; label: string; vsNormal: number; vsHard: number }[] = [
  { t: 0.00, label: "Light",  vsNormal: 16.35, vsHard: 4.55 },
  { t: 0.25, label: "25%",    vsNormal: 13.48, vsHard: 6.45 },
  { t: 0.50, label: "50%",    vsNormal:  9.83, vsHard: 4.79 },
  { t: 0.75, label: "75%",    vsNormal:  6.67, vsHard: 3.55 },
  { t: 1.00, label: "Full",   vsNormal:  3.57, vsHard: 2.45 },
];

const FUTURE: { label: string; note: string }[] = [
  { label: "Tree-structured ISMCTS",                       note: "Current implementation is single-rooted: UCB statistics live at the root only. Promoting to per-info-set statistics gets compounding improvement from every rollout. This is the highest-value direction now that intent tuning hit its ceiling." },
  { label: "Search-based bidder",                          note: "Hard-4 currently delegates bid + declare to Hard-3. Sampling N self-hand-consistent worlds and running mini-ISMCTS would close the holistic Hard-4 vs Hard-3 edge." },
  { label: "ISMCTS-in-endgame (replaces minimax)",         note: "Minimax assumed optimal opponents and regressed −1pp. Running ISMCTS with full budget at ≤3 rounds instead matches the opponent model used everywhere else." },
  { label: "ES-tune Hard-4 search constants",              note: "Hard-4 has ~5 search scalars (UCB exploration, rollout count, endgame depth) still set by hand-tuned intuition. Lower priority than the architectural items now that intent ES showed the well is dry at this scale." },
];

// ---------------------------------------------------------------------------
//  Tabs
// ---------------------------------------------------------------------------

type TabId = "overview" | "generations" | "results" | "method" | "failures" | "roadmap" | "glossary";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "generations", label: "Generations" },
  { id: "results",     label: "Results" },
  { id: "method",      label: "Method" },
  { id: "failures",    label: "Failures" },
  { id: "roadmap",     label: "Roadmap" },
  { id: "glossary",    label: "Glossary" },
];

// ---------------------------------------------------------------------------
//  Primitives
// ---------------------------------------------------------------------------

function Section({ id, kicker, title, children }: { id?: string; kicker?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-12">
      {kicker && <div className="text-[10px] uppercase tracking-[0.22em] text-gold-400/80 mb-1.5">{kicker}</div>}
      <h2 className="font-display text-2xl text-stone-100 mb-4 tracking-wide">{title}</h2>
      <div className="space-y-4 text-[14px] leading-[1.7] text-stone-300">{children}</div>
    </section>
  );
}

function Figure({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="my-6">
      <div className="rounded-xl bg-black/30 ring-1 ring-white/10 p-5">{children}</div>
      <figcaption className="text-[11px] text-stone-500 mt-2 italic">{caption}</figcaption>
    </figure>
  );
}

function barWidth(pct: number): string { return `${Math.min(100, Math.max(0, pct))}%`; }

// ---------------------------------------------------------------------------
//  Page
// ---------------------------------------------------------------------------

export function AIInfoPage({ onBack }: Props) {
  // Initialize tab from URL hash (e.g. /ai#results) so links into a section
  // deep-link properly. Default to Overview.
  const initialTab: TabId = (() => {
    if (typeof window === "undefined") return "overview";
    const h = window.location.hash.replace(/^#/, "") as TabId;
    return TABS.find((t) => t.id === h)?.id ?? "overview";
  })();
  const [tab, setTab] = useState<TabId>(initialTab);

  // Mirror tab to URL hash without adding history entries.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const desired = `#${tab}`;
    if (window.location.hash !== desired) {
      window.history.replaceState({}, "", `/ai${desired}`);
    }
  }, [tab]);

  return (
    <div className="h-screen w-full bg-[#0a1f16] text-stone-200 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 backdrop-blur-md bg-[#0a1f16]/85 border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-3">
          <button
            className="text-xs text-stone-300 hover:text-gold-400 flex items-center gap-1.5 transition-colors"
            onClick={onBack}
          >
            <span aria-hidden>←</span> Back to game
          </button>
        </div>
        {/* Tabs */}
        <nav className="max-w-4xl mx-auto px-6 flex gap-1 -mb-px overflow-x-auto" aria-label="Sections">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                className={`px-3.5 py-2.5 text-[12px] uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 ${
                  active
                    ? "text-gold-400 border-gold-400"
                    : "text-stone-400 hover:text-stone-200 border-transparent"
                }`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Scroll area, only this scrolls */}
      <div className="flex-1 overflow-y-auto">
        <article className="max-w-3xl mx-auto px-6 py-10">
          {/* Title block, always visible above tab content */}
          <header className="mb-10 pb-8 border-b border-white/5">
            <div className="text-[11px] uppercase tracking-[0.25em] text-gold-400/80 mb-2">A technical note</div>
            <h1 className="font-display text-4xl text-gold-400 leading-tight mb-3 tracking-wide">
              Four generations of agents for Black Queen
            </h1>
            <p className="text-[14px] text-stone-400 leading-relaxed">
              A card game with hidden partnerships, played by an evolving series
              of AI agents. This page documents what each generation does, what worked, what didn't,
              and where the remaining headroom is.
            </p>
            <div className="mt-4 flex gap-x-5 gap-y-1 flex-wrap text-[11px] text-stone-500 font-mono">
              <span>Game: 5-player · 65-card deck · 300 pts</span>
              <span>·</span>
              <span>Strongest agent: Seer (Hard-4) · 1220 Elo</span>
            </div>
            <RosterLegend />
          </header>

          {tab === "overview" && <OverviewTab />}
          {tab === "generations" && <GenerationsTab />}
          {tab === "results" && <ResultsTab />}
          {tab === "failures" && <FailuresTab />}
          {tab === "method" && <MethodTab />}
          {tab === "roadmap" && <RoadmapTab />}
          {tab === "glossary" && <GlossaryTab />}

          <footer className="mt-12 pt-6 border-t border-white/10 text-[11px] text-stone-500 leading-relaxed">
            Unless noted otherwise, measurements use a custom headless arena with same-seeded mirror pairs. The deal is fixed, the two agents swap seats at every position, and seat order plus shuffle variance mostly cancel out.
          </footer>
        </article>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Tab content components
// ---------------------------------------------------------------------------

function OverviewTab() {
  return (
    <>
      <Section id="abstract" kicker="§1" title="Abstract">
        <p>
          <span className="text-stone-100 font-medium">Hard / Hard-2 / Hard-3</span> are a
          hand-crafted utility function with ~58 tunable scalars, refined by an evolutionary
          search over millions of simulated games, with a Bayesian-style team inference layer
          added in the third generation.
        </p>
        <p>
          <span className="text-emerald-300 font-medium">Hard-4</span> is a fundamentally
          different paradigm: <em>Information-Set Monte Carlo Tree Search</em> with a hard-
          constraint belief tracker and an opponent-intent Bayesian-inference layer.
          It is implemented in Rust and shipped to the browser as a ~190 KB WebAssembly module.
          In mirror-replay testing, Hard-4 beats Hard-3 by <span className="text-emerald-300 font-medium">
          +3.92pp (~4σ)</span> and beats every prior generation, with substantial
          headroom remaining in tree structure, endgame search, and bidding.
        </p>
      </Section>

      <Section id="game" kicker="§2" title="The game">
        <p>
          Black Queen is a 5-player card game with hidden partnerships. The 65-card deck
          (two standard decks minus 2 / 3 / 4 / 6 and all 7s except one 7♠) carries 300 total
          card-points: <span className="text-gold-400 font-medium">Q♠ = 30</span>, A = 15,
          10 = 10, 5 = 5. One player wins a bid (150–300), declares trump, and names a
          partner card by rank-and-suit; whoever holds it is on their team but stays hidden
          until they play that card. The caller's team must capture at least the bid in
          card-points across 13 rounds to score the bid. If they fall short, they lose it.
        </p>
        <p>
          Two ingredients make this an interesting target for a computer player. First,
          the partner card creates a hidden-information layer on top of the usual
          follow-suit, trump, and point-capture rules. Every play is also a communication, and inferring who's on whose
          team from observed plays is its own sub-problem. Second, the point cards are
          concentrated (Q♠ alone is 10% of all points), so whether you fed the 30-pointer
          or held it back dominates the scoring.
        </p>
      </Section>
    </>
  );
}

function GenerationsTab() {
  return (
    <>
      <Section id="lineage" kicker="§3" title="The Hard / Hard-2 / Hard-3 lineage">
        <p>
          The first three generations share an architecture: a deterministic decision policy
          parameterized by a vector of scalar weights, plus an evolutionary search loop that
          tunes those weights.
        </p>
        <p>
          <span className="text-stone-100 font-medium">Architecture.</span> For every legal
          move, score = expected team points captured − card spend cost + situational
          bonuses (smear toward known ally, penalty for feeding the enemy, Q♠ commit/dump,
          void-creation when shedding a near-empty suit). The bidder and declarer use the
          same weight vector to estimate hand strength and pick a partner card.
        </p>
        <p>
          <span className="text-stone-100 font-medium">Tuning.</span> A (1+λ)-Evolution
          Strategy with σ adapted by the 1/5-success rule. Each generation samples 12 weight-
          vector mutations relative to the current best (perturbations scaled to each
          weight's magnitude), evaluates each on ~120 mixed-personality games (mirror-replayed
          for variance reduction), and promotes the winner. From Hard-2 onward a
          <em>non-regression promotion gate</em> rejects any candidate that loses head-to-head
          against the previous generation. Single-opponent fitness produced opponent-overfit
          weights, so it is no longer used as the promotion standard.
        </p>
        <p>
          <span className="text-stone-100 font-medium">Hard-3 additions.</span> A Bayesian-style
          alliance prior tracks <em>P(player ∈ caller team)</em> for each opponent and updates
          it whenever a player voluntarily feeds points to a round they aren't winning. The
          posterior promotes high-confidence unknowns (≥ 0.85) to "inferred ally" and feeds
          into the same binary smear/feed gates the AI already used. Void-creation rewards
          discards that bring a side suit toward a singleton or doubleton when the AI still
          holds enough trump to exploit the cut.
        </p>
      </Section>

      <Section id="hard4" kicker="§4" title="Hard-4: search over a belief state">
        <p>
          Hard-3 sat at the ceiling of the utility-function representation. Three attempts at
          further weight tuning, single-opponent ES, multi-hop inference propagation, soft
          ally-probability scaling, and related small features landed within the noise floor.
          The next gain needed a different representation.
        </p>
        <p>
          <span className="text-stone-100 font-medium">ISMCTS.</span> Hard-4 runs Information-
          Set Monte Carlo Tree Search at every decision. For each iteration it
          <em> determinizes</em> the hidden information (samples plausible opponent hands
          consistent with the belief), runs a UCB-guided rollout from the current state, and
          backpropagates the team's captured points (not just the searching player's, which
          was a structural fix during development). Rollouts use a team-aware tactical
          policy that knows how to smear, defend Q♠, and win cheaply. That tactical rollout
          was the largest improvement over baseline random rollouts.
        </p>
        <p>
          <span className="text-stone-100 font-medium">Belief tracker.</span> A hard-constraint
          tracker maintains, for each opponent, which suits they are void in and which cards
          they cannot hold (because already played, in our own hand, or impossible given the
          partner-card constraint). Determinization rejects samples that violate the
          constraints, so every rollout is consistent with the public play history.
        </p>
        <p>
          <span className="text-stone-100 font-medium">Opponent-intent inference.</span> Layered
          over the belief tracker, a log-likelihood-ratio (LLR) accumulator scores
          <em> voluntary</em> plays: a player who could have played a non-point card but fed
          Q♠ to a caller-team-winning round has emitted a strong "I'm on the caller's team"
          signal. Nine separately-tunable LLR magnitudes cover the symmetric cases
          (feed-to-caller, feed-to-opposing, withhold-from-each, voluntary trump, voluntary
          steal). The posterior P(team) biases the determinization sampler toward more-
          likely hand configurations.
        </p>
        <p>
          <span className="text-stone-100 font-medium">Discard guard.</span> After qualitative
          trace review, Hard-4 also has a narrow post-search guard for a clear tactical error:
          dumping a non-trump point card onto a round a known enemy is already winning when a
          cheaper non-trump discard is legal. The same guard now protects Hard, Hard-2, and
          Hard-3 in TypeScript. It is deliberately small, and recent matrix checks show it as
          a modest cleanup rather than a new generation.
        </p>
        <p>
          <span className="text-stone-100 font-medium">Engineering.</span> The whole stack is
          implemented in Rust (~1900 LOC) and compiled to WebAssembly (~190 KB shipped). A
          thin TypeScript driver warms the module at app startup and falls back to Hard-3 if
          the WASM hasn't finished loading when the AI is first invoked. At its default search
          budget Hard-4 takes ~300 ms per move on a modern laptop.
        </p>
      </Section>

      <Figure caption="Each generation card: paradigm, weight count, and historical per-seat edge vs Normal where measured on the light-shuffle mirror harness.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GENS.map((g) => (
            <div
              key={g.name}
              className="rounded-lg p-3.5 ring-1 ring-white/10"
              style={{ background: `linear-gradient(135deg, ${GEN_COLOR[g.name]}18, transparent 70%)` }}
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="font-display text-lg" style={{ color: GEN_COLOR[g.name] }}>{g.name}</div>
                <div className="text-[10px] text-stone-400 uppercase tracking-wider">{g.weights}</div>
              </div>
              <div className="text-[11px] text-stone-300 mb-2 leading-snug">{g.paradigm}</div>
              {g.vsNormal !== null && (
                <div className="text-[11px] text-emerald-300/90 mb-2">+{g.vsNormal}pp vs Normal</div>
              )}
              <ul className="space-y-1 text-[11px] text-stone-300/85">
                {g.bullets.map((b) => (
                  <li key={b} className="flex gap-1.5 leading-snug">
                    <span className="text-gold-400/70 select-none">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Figure>
    </>
  );
}

function ResultsTab() {
  return (
    <>
      <Section id="results" kicker="§5" title="Matchup results">
        <p>
          Each row is a head-to-head matchup played as same-seeded mirror pairs: every game is
          played once with the layout drawn for it, and again with the two personalities
          swapped at every seat. This cancels per-seat-of-bid-order and per-shuffle variance.
          <strong className="text-stone-100 font-medium"> All numbers in this table are at
          shuffle intensity 0 (Light)</strong>, see "Shuffle intensity" below for how strength
          varies across intensities.
        </p>
        <p>
          The newest discard-guard matrix did not change the ordering. It gave Hard,
          Hard-2, and Hard-3 small gains against Normal (+0.30pp to +0.66pp), while internal
          hard-family matchups moved by less than half a point. That is useful cleanup, not
          evidence for a new named generation.
        </p>

        <Figure caption="Matchup matrix. Bars show per-seat win rate; edge is A minus B in percentage points.">
          <div className="space-y-2.5">
            {MATCHUP.map((m) => {
              const edge = m.aWin - m.bWin;
              const colorA = GEN_COLOR[m.a];
              const colorB = GEN_COLOR[m.b];
              return (
                <div key={`${m.a}-${m.b}`} className="rounded-lg bg-black/25 ring-1 ring-white/5 p-2.5">
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold" style={{ color: colorA }}>{m.a}</span>
                      <span className="text-stone-500">vs</span>
                      <span className="font-semibold" style={{ color: colorB }}>{m.b}</span>
                      {m.note && <span className="text-[10px] text-stone-500 font-normal italic ml-1">, {m.note}</span>}
                    </div>
                    <div className={`font-mono text-xs ${edge >= 2 ? "text-emerald-300" : edge >= 0 ? "text-stone-200" : "text-rose-300"}`}>
                      {edge >= 0 ? "+" : ""}{edge.toFixed(2)}pp
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-stone-400">{m.a}</span>
                        <span className="font-mono text-stone-300">{m.aWin.toFixed(2)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: barWidth(m.aWin), background: colorA }} />
                      </div>
                    </div>
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
        </Figure>
      </Section>

      <Section id="archetypes" kicker="§5b" title="Hand archetypes, a strategic vocabulary">
        <p>
          The same hand can play three different <em>roles</em> in a game, caller, partner,
          or opposing, and the dominant role is determined more by hand <em>shape</em> than
          raw point count. Three orthogonal scores capture this:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5 text-[12px]">
          <div className="rounded-lg bg-black/25 ring-1 ring-white/5 p-3">
            <div className="font-semibold text-gold-400 mb-1">Partner-score</div>
            <div className="text-stone-400 leading-snug">
              How many unique <em>partner-eligible</em> cards held, the four Aces and Q♠.
              <span className="font-mono text-stone-300"> Range 0–5.</span>
            </div>
            <div className="mt-2 text-stone-500 text-[11px] leading-snug">
              <b className="text-stone-300">High</b> → you'll likely be called as partner regardless of who wins the bid. <br />
              <b className="text-stone-300">Low</b> → locked into opposing team.
            </div>
          </div>
          <div className="rounded-lg bg-black/25 ring-1 ring-white/5 p-3">
            <div className="font-semibold text-gold-400 mb-1">Feeder-score</div>
            <div className="text-stone-400 leading-snug">
              Expected points your hand donates: full value for 10s/5s/Q♠, half for aces
              (which win their own points ~50% of the time).
            </div>
            <div className="mt-2 text-stone-500 text-[11px] leading-snug">
              <b className="text-stone-300">Low</b> → little to lose, can play conservatively.<br />
              <b className="text-stone-300">High</b> → bleeding points either way; great smear asset on caller team, catastrophic on opposing team.
            </div>
          </div>
          <div className="rounded-lg bg-black/25 ring-1 ring-white/5 p-3">
            <div className="font-semibold text-gold-400 mb-1">Caller-score</div>
            <div className="text-stone-400 leading-snug">
              Strength as the bidder: longest-suit-length² + 4·voids + 2·(A/K in longest suit).
            </div>
            <div className="mt-2 text-stone-500 text-[11px] leading-snug">
              <b className="text-stone-300">High</b> → if your longest suit becomes trump you'd dominate.<br />
              <b className="text-stone-300">Low</b> → no clear trump candidate, weak caller.
            </div>
          </div>
        </div>
        <p>
          A few archetypal hands these scores name cleanly:
        </p>
        <ul className="space-y-1.5 text-[13px] text-stone-300 pl-5 list-disc">
          <li><b className="text-stone-100">"Strong caller, partner-rich"</b>, high caller-score and partner-score ≥ 2. The classic dilemma: bid yourself, or let someone else win and likely play as partner.</li>
          <li><b className="text-stone-100">"Partner-magnet"</b>, partner-score ≥ 4 but unremarkable caller-score. Just let the bid stay low; you'll be on the winning side anyway.</li>
          <li><b className="text-stone-100">"High-feeder, opposing-side"</b>, partner-score ≤ 1 with lots of unprotected 10s/5s. Push the bid up so the caller's threshold goes higher; the alternative is bleeding to an easily-made bid.</li>
          <li><b className="text-stone-100">"Weak opposing-side"</b>, low across all three. No good plays available; minimize damage.</li>
        </ul>
        <p>
          These archetypes are not currently consumed by the production AI. Hard-3
          encodes the same information diffusely across its 58 weights, and Hard-4 thinks in
          individual cards rather than compositional features. They're documented here as
          analytical vocabulary, useful for any future opponent-modeling feature or an
          in-game hand-analysis panel.
        </p>
      </Section>

      <Section id="shuffle" kicker="§6" title="How shuffle intensity affects AI strength">
        <p>
          The deal is parameterized by a continuous intensity <em>t</em> ∈ [0, 1].
          <em> Light</em> (<em>t</em> = 0) biases each hand toward a long dominant suit
          (~7–9 cards) and a near-void in another suit, producing dramatic hands with loud
          bids and louder voids. <em>Full</em> (<em>t</em> = 1) is statistically uniform,
          mostly flat 4/3/3/3 hands. The slider linearly blends the deal weights between the
          two extremes.
        </p>
        <p>
          Hard-3 was tuned against Light shuffles, but the AI itself never references the
          shuffle parameter in its decision code. It just reads the hand it was dealt and
          evaluates from there. So the question is: <em>does the AI's edge over a baseline
          survive at higher intensities?</em>
        </p>

        <Figure caption="Hard-3 per-seat edge vs Normal (top, gold) and vs Hard (bottom, violet) at five intensities. 1500 game pairs × 2 mirror per cell.">
          {(() => {
            const maxEdge = Math.max(...SHUFFLE_SWEEP.flatMap((r) => [r.vsNormal, r.vsHard]));
            return (
              <div className="space-y-3">
                {SHUFFLE_SWEEP.map((r) => (
                  <div key={r.t} className="grid grid-cols-[64px_1fr] gap-3 items-center text-[11px]">
                    <div className="text-stone-400 font-mono">{r.label}</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(r.vsNormal / maxEdge) * 100}%`, background: GEN_COLOR["Hard-3"] }} />
                        </div>
                        <span className="font-mono text-stone-300 w-14 text-right">+{r.vsNormal.toFixed(2)}pp</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(r.vsHard / maxEdge) * 100}%`, background: GEN_COLOR["Hard"] }} />
                        </div>
                        <span className="font-mono text-stone-400 w-14 text-right">+{r.vsHard.toFixed(2)}pp</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Figure>

        <p>
          The edge shrinks at higher intensities, but the <em>shape</em> of the collapse is
          informative. Against Normal, Hard-3's edge goes from <span className="text-emerald-300">
          +16.35pp</span> to <span className="text-stone-300">+3.57pp</span> (22% retained).
          Against Hard, it goes from +4.55pp to +2.45pp (54% retained). If Hard-3 were uniquely
          miscalibrated for Light shuffles, both opponents should see proportional degradation.
          Instead, the gap to <em>Normal</em> collapses far harder than the gap to the rule-
          based Hard, which is consistent with the game itself becoming more variance-bound
          as hands flatten: fewer "obviously biddable" hands ⇒ fewer overcommitted bids ⇒
          less skill differential available for anyone to exploit. The implication is that a
          shuffle-robust generation (an early-considered "Hard-A") wouldn't have helped much:
          the limiting factor is the deal distribution, not the agent.
        </p>
      </Section>
    </>
  );
}

function MethodTab() {
  return (
    <>
      <Section id="tried" kicker="§7" title="Experiments, wins, washes, regressions">
        <p>
          Every architectural change was A/B-tested on same-seeded pairs before any tuning was
          run. Anything that didn't move the per-seat win-rate directionally was rejected on
          the spot. The headlines:
        </p>

        <Figure caption="Chronological-ish list. 'Ship' = went into production. 'Wash' = within noise, kept in code where useful. 'Reject' = regressed measurably and was reverted or gated off.">
          <table className="w-full text-[12px]">
            <thead className="text-stone-400 uppercase tracking-wider text-[10px]">
              <tr className="border-b border-white/10">
                <th className="text-left py-2 font-medium">Experiment</th>
                <th className="text-left py-2 font-medium w-20">Verdict</th>
                <th className="text-left py-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {TRIED.map((t) => (
                <tr key={t.label} className="border-b border-white/5 last:border-0 align-top">
                  <td className="py-2 pr-3 text-stone-200">{t.label}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold ${
                      t.result === "win"     ? "bg-emerald-500/20 text-emerald-300" :
                      t.result === "regress" ? "bg-rose-500/20 text-rose-300" :
                                                "bg-stone-500/20 text-stone-300"
                    }`}>
                      {t.result === "win" ? "Ship" : t.result === "regress" ? "Reject" : "Wash"}
                    </span>
                  </td>
                  <td className="py-2 text-stone-300">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Figure>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Failures tab, deep-dive on every concept that didn't pan out.
//
//  The Method tab's TRIED table lists every experiment with one-line verdicts.
//  This tab is just the ones that DIDN'T work, with prose explanations of
//  WHY each one failed. Useful both as a research log and as a guard against
//  a future Claude (or human) re-running the same experiment.
// ---------------------------------------------------------------------------

interface FailureEntry {
  title: string;
  hypothesis: string;
  result: string;
  why: string;
  verdict: "regress" | "wash";
}

const FAILURES: FailureEntry[] = [
  {
    title: "Single-opponent ES tuning",
    hypothesis: "Evolutionary search against the rule-based Hard would find a better Hard-2.",
    result: "Candidates beat Hard on training seeds but lost to prior tuned gens on fresh seeds.",
    why: "The fitness signal narrowly maximizes performance against one opponent's quirks. Specialized weights gain on training games but don't generalize. They learn how to exploit Hard rather than how to play better Black Queen. The fix was multi-opponent fitness plus a non-regression promotion gate against prior generations.",
    verdict: "regress",
  },
  {
    title: "Soft alliance-probability scaling",
    hypothesis: "Scaling smear/feed bonuses by a continuous P(ally) value instead of a hard 0/1 gate would handle uncertainty more gracefully.",
    result: "Regressed Hard-2 by roughly 1pp.",
    why: "The existing smear/feed weights were calibrated assuming a binary gate (fire fully or not at all). Multiplying them by a soft 0.5 made the smear signal half-strength when it should have been off entirely. The fix was a threshold-upgrade gate (≥ 0.85 → treat as confirmed ally) that preserves binary behavior while letting high-confidence inferences in.",
    verdict: "regress",
  },
  {
    title: "Multi-hop inference propagation",
    hypothesis: "If A fed points to B, and B is on caller team, then A and B's alliance signal should propagate to other plays involving B.",
    result: "+0.06pp at defaults, within noise.",
    why: "Direct caller-anchor inferences (A fed points to the caller) already capture most of the signal. Multi-hop chains add information only when the anchor pathway is missing, which is rare. The infrastructure is kept off-by-default in case a future variant of the inference makes use of indirect chains.",
    verdict: "wash",
  },
  {
    title: "Hard-4 minimax endgame solver",
    hypothesis: "At ≤ 3 rounds remaining, the game is small enough to solve exactly with minimax.",
    result: "Regressed by ~1pp in mirror replay vs Hard-3 opponent.",
    why: "Minimax assumes adversarially optimal opponents. The actual test opponent, Hard-3, plays heuristically. The solver picks moves that are best against perfect play but suboptimal against Hard-3's habits, so it over-defends against threats that the opponent is unlikely to find. It remains gated behind BQ_ENDGAME=1. The proper fix is ISMCTS-in-endgame, which uses the same opponent model as the rest of the search.",
    verdict: "regress",
  },
  {
    title: "Hard-4 soft bid-strength belief prior",
    hypothesis: "A player who bid 200+ probably has aces and Q♠. Bias the determinization sampler toward that.",
    result: "Regressed by ~3pp at default magnitudes.",
    why: "The bias bumps (1.3x / 1.5x multipliers) were set by intuition and never tuned. Even a directionally correct prior can hurt if its strength is wrong. The fix would be ES tuning of the prior magnitudes. It remains gated behind BQ_BIDPRIOR=1.",
    verdict: "regress",
  },
  {
    title: "Shuffle-robust 'Hard-A' generation",
    hypothesis: "Hard-3 was tuned on Light shuffle; maybe a separate model tuned on randomized intensity would be more robust.",
    result: "Wash, AI doesn't reference shuffle anywhere; degradation at high shuffle was mostly game-variance.",
    why: "The Hard-3 vs Normal edge collapses from +16.35pp (Light) to +3.57pp (Full), but Hard-3 vs Hard only goes from +4.55pp to +2.45pp. If Hard-3 were uniquely miscalibrated for Light, both would degrade similarly. The asymmetric collapse points to the game getting more luck-bound: flatter hands, fewer committed-to-fail bids, and less skill differential available. A shuffle-robust gen would not have helped much.",
    verdict: "wash",
  },
  {
    title: "Hard-5: ES-tune Hard-4 intent weights",
    hypothesis: "Hard-4's 9 IntentWeights (LLR magnitudes) were hand-set; ES tuning should find improvements like it did for Hard-3's weight vector.",
    result: "Two 20-gen runs both verified at −0.20pp on fresh seeds (within 1σ of noise).",
    why: "The intent magnitudes were already at a plateau. The first run, with no anchor gate, drifted into overfit territory: training-set wins, verification null. The second run, gated against frozen Default, correctly blocked drift but still could not find genuine improvement. That suggests the defaults are already near-optimal for this representation, similar to the ceiling Hard-3 hit before Hard-4's paradigm shift.",
    verdict: "regress",
  },
  {
    title: "Threshold-optimization rollout backprop",
    hypothesis: "Black Queen's scoring is an indicator function (made bid → +bid, failed → −bid). The natural ISMCTS rollout value should be P(team makes bid), not captured points / 300.",
    result: "Pure binary: −1.47pp at N=300. Hybrid (0.5·EV + 0.5·win): +1.93pp at N=300 → −0.20pp at N=500.",
    why: "Pure binary outcomes are too sparse a signal for UCB at finite rollouts. Most competent rollouts have a fairly determined outcome, so the value collapses to 0 or 1 for nearly every move and loses the per-action differentiation that drives MCTS. The EV proxy is continuous and correlates near-monotonically with win probability, so adding the threshold jump adds no real signal at this search depth. It could become useful at deeper search, where each rollout outcome is less settled.",
    verdict: "regress",
  },
  {
    title: "Partner-aware bidding (symmetric)",
    hypothesis: "Hands rich in Aces and Q♠ are likely to be partner → bid less. Hands poor in them are locked-in opposing → bid more (push caller into failure).",
    result: "Regressed by 2.00pp at N=300.",
    why: "The 'bid less when partner-rich' direction was a strategic mistake. A hand with 4 Aces plus Q♠ is strong. The default capacity formula already values it correctly and would have it bid aggressively. Artificially lowering its target told the AI to defer when it should have called itself. The fix was to make the heuristic asymmetric: only raise bids for partner-poor hands.",
    verdict: "regress",
  },
  {
    title: "Partner-aware bidding (asymmetric)",
    hypothesis: "Same as above, but only raise bid for clearly partner-poor hands (no Aces, no Q♠, no Kings); never lower.",
    result: "+0.07pp at N=600. Statistically zero.",
    why: "The trigger condition is rare. Most hands have at least one Ace or King. Of the hands that do trigger, the default Hard-4 bidder already mostly passes because weak hands imply low capacity. The remaining window, where the hand is trigger-weak, the default would still bid, and +10pp would cross the caller-fail threshold, is under 5% of games. The strategic insight is sound, but this heuristic cannot extract enough of it. A proper search-based bidder would be needed.",
    verdict: "wash",
  },
  {
    title: "Archetype-aware bidding (partner + feeder + caller)",
    hypothesis: "Use all three hand-archetype scores together. Push bid up when locked out of partner role and feeder-rich (lots to lose at low bid). Lower bid slightly when partner-magnet but weak caller (will be partner anyway, no need to fight).",
    result: "−0.10pp at N=600. Statistically zero again.",
    why: "The richer feature set widens the trigger window compared with partner-aware-only, but it does not change the underlying limit: the default bidder already passes on weak hands and bids aggressively on strong ones. The relevant window is the narrow band where the heuristic disagrees with the default and the disagreement affects the final outcome. Across the bid-adjustment attempts, that window appears smaller than the measurement noise floor of a reasonable A/B. Moving bidding strength will likely require a real search-based bidder rather than another closed-form adjustment.",
    verdict: "wash",
  },
];

function FailuresTab() {
  const regressions = FAILURES.filter((f) => f.verdict === "regress");
  const washes = FAILURES.filter((f) => f.verdict === "wash");
  return (
    <Section id="failures" kicker="§7b" title="Concepts that didn't pan out, and why">
      <p>
        Every ambitious-sounding AI idea that <em>didn't</em> measurably improve the agent.
        Some regressed measurably; some came in at the noise floor. Listed here so the
        strategic intuition each represents is preserved, alongside the empirical reason it
        didn't translate. Many of these are sound ideas at the wrong scale: they may work
        with more compute or a different architecture, but they did not pay off here.
      </p>

      <div className="text-[10px] uppercase tracking-widest text-rose-300/80 mt-6 mb-2">Regressions ({regressions.length})</div>
      <div className="space-y-3">
        {regressions.map((f) => <FailureCard key={f.title} f={f} />)}
      </div>

      <div className="text-[10px] uppercase tracking-widest text-stone-400/80 mt-6 mb-2">Washes, at noise floor ({washes.length})</div>
      <div className="space-y-3">
        {washes.map((f) => <FailureCard key={f.title} f={f} />)}
      </div>

      <p className="mt-8 text-[12px] text-stone-500 italic leading-relaxed">
        Pattern across the failures: most are theoretically correct ideas that lose to the
        ceiling of the current architecture (single-rooted ISMCTS at ~300 ms with hand-coded
        rollout policy), not because the strategy is wrong, but because the limited search
        depth or representation can't extract enough signal to overcome noise. The right
        next step is architectural: tree-structured ISMCTS, a stronger rollout policy, or
        learned belief representation.
      </p>
    </Section>
  );
}

function FailureCard({ f }: { f: FailureEntry }) {
  const borderColor = f.verdict === "regress" ? "ring-rose-500/25" : "ring-white/10";
  return (
    <div className={`rounded-xl bg-black/25 ring-1 ${borderColor} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-[14px] font-semibold text-stone-100">{f.title}</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold flex-shrink-0 ${
          f.verdict === "regress" ? "bg-rose-500/20 text-rose-300" : "bg-stone-500/20 text-stone-300"
        }`}>
          {f.verdict === "regress" ? "Reject" : "Wash"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr] gap-y-1.5 gap-x-3 text-[12px]">
        <div className="text-stone-500 uppercase tracking-wider text-[10px] sm:pt-0.5">Hypothesis</div>
        <div className="text-stone-300">{f.hypothesis}</div>

        <div className="text-stone-500 uppercase tracking-wider text-[10px] sm:pt-0.5">Result</div>
        <div className="text-stone-300">{f.result}</div>

        <div className="text-stone-500 uppercase tracking-wider text-[10px] sm:pt-0.5">Why</div>
        <div className="text-stone-300 leading-relaxed">{f.why}</div>
      </div>
    </div>
  );
}

function RoadmapTab() {
  return (
    <Section id="future" kicker="§8" title="Future directions">
      <p>
        The Hard-5 attempt (evolutionary tuning of Hard-4's intent magnitudes) didn't
        work. Two 20-generation runs both verified at &minus;0.20pp on fresh seeds.
        Hard-4's hand-set intent defaults turned out to already be near-optimal for
        this representation, the same ceiling Hard-3 hit before Hard-4 broke into a new
        paradigm. The remaining headroom is not in tuning what is already there. It is in
        architecture:
      </p>
      <div className="space-y-2.5 my-4">
        {FUTURE.map((f) => (
          <div key={f.label} className="rounded-lg bg-black/25 ring-1 ring-white/5 p-3">
            <div className="text-[12px] font-semibold text-stone-100">{f.label}</div>
            <div className="text-[12px] text-stone-400 mt-0.5 leading-relaxed">{f.note}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
//  Glossary tab. Plain-language definitions for terms a reader without
//  a deep AI background might not immediately know. Assumes a STEM/CS
//  undergrad audience: comfortable with algorithms and probability, not
//  necessarily with game-tree search jargon.
// ---------------------------------------------------------------------------

interface GlossaryEntry { term: string; def: string; }

const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Round",
    def: "A card game where each player plays one card per round and the highest-ranked card by some rule wins the round. Bridge, Hearts, Spades, and Black Queen are all in this family.",
  },
  {
    term: "Trump",
    def: "A suit that beats all other suits within a hand. In Black Queen the bid-winner picks the trump suit. A 5 of trump beats an Ace of any other suit.",
  },
  {
    term: "Partner card",
    def: "Specific to Black Queen: after winning the bid, the caller names one card by rank and suit. Whoever holds it is on the caller's team, but stays hidden until they actually play that card. The caller may have 1 or 2 partners (the deck has duplicates of most cards).",
  },
  {
    term: "Information set",
    def: "All the game states an observer cannot distinguish given what they've seen. For an opponent in Black Queen, this is the set of possible hands consistent with the bid history and the cards already played. The AI plans over information sets rather than full game states because the opponents' hands are private.",
  },
  {
    term: "Determinization",
    def: "Sampling one concrete assignment of the hidden information so a normal search can run on it. For Black Queen: pick a plausible distribution of unseen cards across opponent hands, then plan as if it were a perfect-information game. Repeated many times and averaged.",
  },
  {
    term: "Monte Carlo Tree Search (MCTS)",
    def: "A planning algorithm that estimates the value of each move by simulating thousands of random games starting from that move and averaging the outcomes. Best-known for AlphaGo. It explores promising moves more often than bad ones via a bandit rule.",
  },
  {
    term: "Information-Set MCTS (ISMCTS)",
    def: "MCTS adapted for hidden-information games. Each iteration: sample a determinization, run one MCTS rollout, average across many determinizations. The agent's plan is computed over the information set, not over one specific true state.",
  },
  {
    term: "Rollout",
    def: "A single simulated playout from the current state to game end, used to estimate how good a move is. In our setup each rollout follows a 'tactical policy' (smear toward ally, defend Q♠, etc.) rather than random play, which dramatically reduces variance.",
  },
  {
    term: "UCB / UCB1",
    def: "Upper Confidence Bound. The bandit formula MCTS uses to pick which move to explore next. Balances exploitation (pick the move with the best current average) and exploration (try moves we haven't seen much). Formula: avg + c·sqrt(ln(N)/n).",
  },
  {
    term: "Belief tracker / belief state",
    def: "A data structure tracking what each opponent could possibly hold. Updated whenever a player can't follow suit (they're void in that suit), plays a card, or the partner card is declared. Determinization samples are accepted only if consistent with all current constraints.",
  },
  {
    term: "Backprop / backpropagation (in MCTS)",
    def: "After a rollout finishes, the result is added back to all the moves visited along the path. This is how MCTS averages get computed. Distinct from neural-net backpropagation, the name is shared but the math is just running sums.",
  },
  {
    term: "Evolution Strategy (ES)",
    def: "A black-box optimizer: take the current best parameter vector, generate λ random perturbations of it, evaluate each one by simulation, promote the best perturbation. Repeat. Used here to tune the AI's scalar weights without analytic gradients.",
  },
  {
    term: "(1+λ)-ES with σ adaptation",
    def: "The specific variant used: keep 1 parent, generate λ children per generation, promote the best child if it beats the parent. The mutation step size σ self-adapts via the '1/5 success rule': if many children won, mutate more aggressively next time; if few won, shrink σ to fine-tune.",
  },
  {
    term: "Mirror replay",
    def: "Variance-reduction technique: play the same deal twice but swap which player uses which AI at every seat. Effects of dealing luck and seat order cancel out across the pair. Lets you detect smaller edges with the same compute budget.",
  },
  {
    term: "Multi-opponent fitness",
    def: "When evaluating a candidate AI during tuning, pit it against a mix of opponents (locked baseline + previous tuned generation), not just one. Prevents 'opponent-overfit' where a candidate exploits one opponent's quirks but doesn't generalize.",
  },
  {
    term: "Non-regression promotion gate",
    def: "A safety check that blocks any candidate from being promoted if it regresses against a frozen reference player on independent seeds, even if it wins on the training seeds. Required to catch overfitting that fitness alone misses.",
  },
  {
    term: "Bayesian inference",
    def: "Updating a probability distribution as new evidence comes in. Here: maintaining P(opponent is on caller's team) and updating it each time the opponent makes a play whose information value can be calibrated.",
  },
  {
    term: "Log-likelihood ratio (LLR)",
    def: "log P(event | hypothesis A) − log P(event | hypothesis B). A clean way to accumulate evidence: each new observation just adds its LLR to a running sum, and the sum's sigmoid gives the posterior. The AI keeps one LLR per opponent for 'on caller team' vs 'opposing'.",
  },
  {
    term: "Sigmoid",
    def: "The function 1 / (1 + e^(−x)), which squashes any real number into [0, 1]. Used to convert an LLR sum into a probability.",
  },
  {
    term: "Voluntariness",
    def: "How freely a player could have made a different choice. A point card fed onto a winning round when the player had legal alternatives is 'voluntary' and a strong signal. The same play forced by suit-following rules carries no information.",
  },
  {
    term: "Smear",
    def: "Deliberately playing a high-point card onto a round a teammate is winning, to feed them points. The team gets the points either way; smearing also reveals that the smearer is on that teammate's side.",
  },
  {
    term: "Void / void-creation",
    def: "Having zero cards of a particular suit. Useful because in a void suit you can play any card (including trump). Skilled play often involves shedding the last card of a side suit to create a void and enable later cuts.",
  },
  {
    term: "Cut / cutting in / ruffing",
    def: "Playing trump on a non-trump round. Only possible if you're void in the led suit. The classical reason to engineer a void.",
  },
  {
    term: "Per-seat win rate",
    def: "Across many games, what fraction of seats playing a given AI ended up on the winning side. Used instead of raw 'win/loss' because each game has multiple winners (the caller's whole team or the entire opposing team).",
  },
  {
    term: "pp (percentage points)",
    def: "The arithmetic difference between two percentages. If A wins 55% and B wins 51%, A has a +4pp edge (not 8% better).",
  },
  {
    term: "σ / standard error",
    def: "The expected spread of a measurement due to random sampling noise. An edge of +3pp at SE ≈ 1pp is ~3σ, which is a strong statistical signal. At SE ≈ 2pp it is only ~1.5σ and could easily be noise.",
  },
  {
    term: "WASM (WebAssembly)",
    def: "A compact binary code format runnable in browsers at near-native speed. Hard-4 is written in Rust (chosen for speed) and compiled to WASM so it can run client-side in your browser without slowing the page down.",
  },
];

function GlossaryTab() {
  return (
    <Section id="glossary" kicker="§9" title="Glossary">
      <p>
        Short plain-language definitions of the terms used across this writeup. Assumes
        comfort with undergraduate-level CS but no special background in game-tree search
        or game-theoretic AI.
      </p>
      <div className="space-y-2 mt-4">
        {GLOSSARY.map((g) => (
          <div key={g.term} className="rounded-lg bg-black/25 ring-1 ring-white/5 p-3">
            <div className="text-[13px] font-semibold text-gold-400 mb-1">{g.term}</div>
            <div className="text-[12px] text-stone-300 leading-relaxed">{g.def}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
