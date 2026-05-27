// AI Info — full-page blog/paper-style writeup. Routed at /ai.
// Self-contained, no chart libs, no router dep.

interface Props {
  onBack: () => void;
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
  vsNormal: number;
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
      "Locked baseline — never re-tuned; every later generation is measured against this",
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
  { label: "ES-tune Hard-4 intent + search scalars",       note: "Hard-4 has 9 intent magnitudes and ~5 search constants set by hand-tuned intuition. ES tuning is the highest-EV remaining lever by analogy to Hard-3's jump." },
  { label: "Tree-structured ISMCTS",                       note: "Current implementation is single-rooted — UCB statistics live at the root only. Promoting to per-info-set statistics gets compounding improvement from every rollout." },
  { label: "Search-based bidder",                          note: "Hard-4 currently delegates bid + declare to Hard-3. Sampling N self-hand-consistent worlds and running mini-ISMCTS would close the holistic Hard-4 vs Hard-3 edge." },
  { label: "ISMCTS-in-endgame (replaces minimax)",         note: "Minimax assumed optimal opponents and regressed −1pp. Running ISMCTS with full budget at ≤3 tricks instead matches the opponent model used everywhere else." },
];

// ---------------------------------------------------------------------------
//  Layout primitives
// ---------------------------------------------------------------------------

function Section({ id, kicker, title, children }: { id?: string; kicker?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-12">
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
  return (
    <div className="min-h-screen w-full bg-[#0a1f16] text-stone-200 overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[#0a1f16]/85 border-b border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <button
            className="text-xs text-stone-300 hover:text-gold-400 flex items-center gap-1.5 transition-colors"
            onClick={onBack}
          >
            <span aria-hidden>←</span> Back to game
          </button>
          <a
            className="text-[11px] text-stone-500 hover:text-stone-300 transition-colors font-mono"
            href="https://github.com/Timothy-Cao/black-queen"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/Timothy-Cao/black-queen
          </a>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-6 py-10">
        {/* Title block */}
        <header className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.25em] text-gold-400/80 mb-2">A technical note</div>
          <h1 className="font-display text-4xl text-gold-400 leading-tight mb-3 tracking-wide">
            Four generations of agents for Black Queen
          </h1>
          <p className="text-[14px] text-stone-400 leading-relaxed">
            A trick-taking card game with hidden partnerships, played by an evolving series
            of AI agents. This page documents what each generation does, what worked, what didn't,
            and where the headroom remaining lives.
          </p>
          <div className="mt-4 flex gap-x-5 gap-y-1 flex-wrap text-[11px] text-stone-500 font-mono">
            <span>Game: 5-player · 65-card deck · 300 pts</span>
            <span>·</span>
            <span>Strongest agent: Hard-4 · +3.92pp over Hard-3</span>
          </div>
        </header>

        {/* TOC */}
        <nav className="mb-12 rounded-xl bg-black/25 ring-1 ring-white/5 p-4 text-[12px]">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold-400/80 mb-2">Contents</div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-stone-300 list-decimal pl-5">
            <li><a className="hover:text-gold-400 transition-colors" href="#abstract">Abstract</a></li>
            <li><a className="hover:text-gold-400 transition-colors" href="#game">The game</a></li>
            <li><a className="hover:text-gold-400 transition-colors" href="#lineage">The Hard / Hard-2 / Hard-3 lineage</a></li>
            <li><a className="hover:text-gold-400 transition-colors" href="#hard4">Hard-4: search over a belief state</a></li>
            <li><a className="hover:text-gold-400 transition-colors" href="#results">Results</a></li>
            <li><a className="hover:text-gold-400 transition-colors" href="#shuffle">Shuffle intensity</a></li>
            <li><a className="hover:text-gold-400 transition-colors" href="#tried">Experiments — wins, washes, regressions</a></li>
            <li><a className="hover:text-gold-400 transition-colors" href="#future">Future directions</a></li>
          </ol>
        </nav>

        {/* 1. Abstract */}
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
            headroom remaining (intent scalars never ES-tuned, single-rooted search, no
            search-based bidder).
          </p>
        </Section>

        {/* 2. The game */}
        <Section id="game" kicker="§2" title="The game">
          <p>
            Black Queen is a 5-player trick-taking game with hidden partnerships. The 65-card deck
            (two standard decks minus 2 / 3 / 4 / 6 and all 7s except one 7♠) carries 300 total
            card-points: <span className="text-gold-400 font-medium">Q♠ = 30</span>, A = 15,
            10 = 10, 5 = 5. One player wins a bid (150–300), declares trump, and names a
            partner card by rank-and-suit; whoever holds it is on their team but stays hidden
            until they play that card. The caller's team must capture ≥ bid in card-points across
            13 trick-plays to score the bid; if they fall short, they all lose it.
          </p>
          <p>
            Two ingredients make this a non-trivial AI target. First, the partner card creates a
            hidden-information layer on top of the usual trick-taking — every play is also a
            communication, and inferring who's on whose team from observed plays is itself a
            sub-problem. Second, point-cards are concentrated (Q♠ alone is 10% of the deck), so
            whether you fed the 30-pointer or held it onto a defensive line dominates the
            scoring.
          </p>
        </Section>

        {/* 3. The lineage */}
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
            against the previous generation — single-opponent fitness alone produced opponent-
            overfit weights.
          </p>
          <p>
            <span className="text-stone-100 font-medium">Hard-3 additions.</span> A Bayesian-style
            alliance prior tracks <em>P(player ∈ caller team)</em> for each opponent and updates
            it whenever a player voluntarily feeds points to a trick they aren't winning. The
            posterior promotes high-confidence unknowns (≥ 0.85) to "inferred ally" and feeds
            into the same binary smear/feed gates the AI already used. Void-creation rewards
            discards that bring a side suit toward a singleton or doubleton when the AI still
            holds enough trump to exploit the cut.
          </p>

          <Figure caption="Each generation card: paradigm, weight count, per-seat edge vs Normal (light shuffle, 2500 pairs × 2 mirror).">
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
                  <div className="text-[11px] text-emerald-300/90 mb-2">+{g.vsNormal}pp vs Normal</div>
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
        </Section>

        {/* 4. Hard-4 */}
        <Section id="hard4" kicker="§4" title="Hard-4: search over a belief state">
          <p>
            Hard-3 sat at the ceiling of the utility-function representation. Three attempts at
            further weight tuning — single-opponent ES, multi-hop inference propagation, soft
            ally-probability scaling — landed within ±0.2pp. The signal had bottomed out under
            the noise floor. The next gain demanded a different shape.
          </p>
          <p>
            <span className="text-stone-100 font-medium">ISMCTS.</span> Hard-4 runs Information-
            Set Monte Carlo Tree Search at every decision. For each iteration it
            <em> determinizes</em> the hidden information (samples plausible opponent hands
            consistent with the belief), runs a UCB-guided rollout from the current state, and
            backpropagates the team's captured points (not just the searching player's, which
            was a structural fix during development). Rollouts use a team-aware tactical
            policy — smear/defend/Q♠-aware — rather than random play, which is the single
            biggest lever over a baseline ISMCTS.
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
            Q♠ to a caller-team-winning trick has emitted a strong "I'm on the caller's team"
            signal. Nine separately-tunable LLR magnitudes cover the symmetric cases
            (feed-to-caller, feed-to-opposing, withhold-from-each, voluntary trump, voluntary
            steal). The posterior P(team) biases the determinization sampler toward more-
            likely hand configurations.
          </p>
          <p>
            <span className="text-stone-100 font-medium">Engineering.</span> The whole stack is
            implemented in Rust (~1900 LOC) and compiled to WebAssembly (~190 KB shipped). A
            thin TypeScript driver warms the module at app startup and falls back to Hard-3 if
            the WASM hasn't finished loading when the AI is first invoked. At its default search
            budget Hard-4 takes ~300 ms per move on a modern laptop.
          </p>
        </Section>

        {/* 5. Results */}
        <Section id="results" kicker="§5" title="Results">
          <p>
            Each row is a head-to-head matchup played as same-seeded mirror pairs: every game is
            played once with the layout drawn for it, and again with the two personalities
            swapped at every seat. This cancels per-seat-of-bid-order and per-shuffle variance.
            <strong className="text-stone-100 font-medium"> All numbers in this table are at
            shuffle intensity 0 (Light)</strong> — see §6 for how strength varies across
            intensities.
          </p>

          <Figure caption="Matchup matrix. Bars show per-seat win rate; edge = A − B in percentage points.">
            <div className="space-y-2.5">
              {MATCHUP.map((m) => {
                const edge = m.aWin - m.bWin;
                const colorA = GEN_COLOR[m.a];
                const colorB = GEN_COLOR[m.b];
                return (
                  <div key={`${m.a}-${m.b}`} className="rounded-lg bg-black/25 ring-1 ring-white/5 p-2.5">
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold" style={{ color: colorA }}>{m.a}</span>
                        <span className="text-stone-500">vs</span>
                        <span className="font-semibold" style={{ color: colorB }}>{m.b}</span>
                        {m.note && <span className="text-[10px] text-stone-500 font-normal italic ml-1">— {m.note}</span>}
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

        {/* 6. Shuffle intensity */}
        <Section id="shuffle" kicker="§6" title="How shuffle intensity affects AI strength">
          <p>
            The deal is parameterized by a continuous intensity <em>t</em> ∈ [0, 1].
            <em> Light</em> (<em>t</em> = 0) biases each hand toward a long dominant suit
            (~7–9 cards) and a near-void in another suit — dramatic hands that produce loud
            bids and louder voids. <em>Full</em> (<em>t</em> = 1) is statistically uniform —
            mostly flat 4/3/3/3 hands. The slider linearly blends the deal weights between the
            two extremes.
          </p>
          <p>
            Hard-3 was tuned against Light shuffles, but the AI itself never references the
            shuffle parameter in its decision code — it just reads the hand it was dealt and
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
            The edge shrinks at higher intensities — but the <em>shape</em> of the collapse is
            informative. Against Normal, Hard-3's edge goes from <span className="text-emerald-300">
            +16.35pp</span> to <span className="text-stone-300">+3.57pp</span> (22% retained).
            Against Hard, it goes from +4.55pp to +2.45pp (54% retained). If Hard-3 were uniquely
            miscalibrated for Light shuffles, both opponents should see proportional degradation.
            Instead, the gap to <em>Normal</em> collapses far harder than the gap to the rule-
            based Hard — which is consistent with the game itself becoming more variance-bound
            as hands flatten: fewer "obviously biddable" hands ⇒ fewer overcommitted bids ⇒
            less skill differential available for anyone to exploit. The implication is that a
            shuffle-robust generation (an early-considered "Hard-A") wouldn't have helped much:
            the limiting factor is the deal distribution, not the agent.
          </p>
        </Section>

        {/* 7. Tried */}
        <Section id="tried" kicker="§7" title="Experiments — wins, washes, regressions">
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

        {/* 8. Future */}
        <Section id="future" kicker="§8" title="Future directions">
          <p>
            Hard-4's headroom isn't in any one ambitious idea — it's in finishing the work that
            shipped at hand-set defaults.
          </p>
          <div className="space-y-2.5 my-4">
            {FUTURE.map((f) => (
              <div key={f.label} className="rounded-lg bg-black/25 ring-1 ring-white/5 p-3">
                <div className="text-[12px] font-semibold text-stone-100">{f.label}</div>
                <div className="text-[12px] text-stone-400 mt-0.5 leading-relaxed">{f.note}</div>
              </div>
            ))}
          </div>
          <p>
            The most tractable single step is the first one: ES-tuning Hard-4's nine intent-LLR
            magnitudes and ~five search constants. By analogy to how Hard-2 turned Hard's
            hand-tuned weights into a +2pp jump, applying the same procedure to Hard-4's hand-tuned
            scalars is the natural next generation — provisionally <em>Hard-5</em>.
          </p>
        </Section>

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-white/10 text-[11px] text-stone-500 leading-relaxed">
          <p>
            Reproducibility notes — see <a className="text-gold-400 hover:underline" href="https://github.com/Timothy-Cao/black-queen/blob/main/CLAUDE.md" target="_blank" rel="noopener noreferrer">CLAUDE.md</a> in the repo for the full handbook.
            Arena harness: <code className="font-mono text-stone-400">src/game/arena.ts</code>.
            Tuner: <code className="font-mono text-stone-400">src/game/tune2.ts</code>.
            Tournament: <code className="font-mono text-stone-400">src/game/_tournament.ts</code>.
            Shuffle sweep: <code className="font-mono text-stone-400">src/game/_shuffle_sweep.ts</code>.
            Hard-4 Rust source: <code className="font-mono text-stone-400">rust/crates/bq-ai/</code>.
          </p>
        </footer>
      </article>
    </div>
  );
}
