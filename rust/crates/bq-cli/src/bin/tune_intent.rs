// =============================================================================
//  tune_intent — ES tuner for Hard-4 IntentWeights (Hard-5 candidate).
//
//  (1+λ)-ES with self-adaptive σ. Each generation samples λ candidate
//  IntentWeights mutations relative to the current best. Each candidate plays
//  `games_per_eval` mixed-seat games against the baseline (current best),
//  mirror-replayed for variance reduction. Promote the strongest if it beats
//  the baseline; otherwise shrink σ.
//
//  Usage:
//    tune_intent [GENERATIONS] [LAMBDA] [GAMES_PER_EVAL] [TIME_MS] [SEED]
//    tune_intent 30 8 60 30 1234
//
//  Output:
//    tuned_intent.json at the rust workspace root.
// =============================================================================

use bq_ai::hard4::{hard4_bid, hard4_declare, hard4_play};
use bq_ai::intent::{set_intent_weights_override, IntentWeights};
use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game};
use bq_engine::rng::{from_seed, GameRng};
use bq_engine::types::{Phase, PlayerId};
use rand::Rng;
use rand_xoshiro::rand_core::SeedableRng;
use rand_xoshiro::Xoshiro256PlusPlus;
use std::fs;
use std::io::Write;
use std::time::Instant;

fn say(msg: &str) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{}", msg);
    let _ = out.flush();
}

// ---------------------------------------------------------------------------
//  ES knobs (separate from IntentWeights — these are the tuner's own dials).
// ---------------------------------------------------------------------------

const OUTFILE: &str = "tuned_intent.json";

// Initial σ (relative mutation scale) and its bounds for the 1/5-success rule.
const INIT_SIGMA: f64 = 0.25;
const SIGMA_MIN: f64 = 0.04;
const SIGMA_MAX: f64 = 0.50;
const SIGMA_GROW: f64 = 1.22;
const SIGMA_SHRINK: f64 = 1.0 / 1.22;

// ---------------------------------------------------------------------------
//  IntentWeights ↔ vector packing for ES mutation
// ---------------------------------------------------------------------------

const N_FIELDS: usize = 9;

fn to_vec(w: &IntentWeights) -> [f64; N_FIELDS] {
    [
        w.w_voluntary_feed_to_caller,
        w.w_voluntary_q_spades_to_caller,
        w.w_voluntary_feed_to_opposing,
        w.w_withhold_from_caller,
        w.w_withhold_from_opposing,
        w.w_voluntary_trump_caller,
        w.w_voluntary_trump_opposing,
        w.w_voluntary_steal_from_caller,
        w.llr_clamp,
    ]
}

fn from_vec(v: [f64; N_FIELDS]) -> IntentWeights {
    IntentWeights {
        w_voluntary_feed_to_caller: v[0],
        w_voluntary_q_spades_to_caller: v[1],
        w_voluntary_feed_to_opposing: v[2],
        w_withhold_from_caller: v[3],
        w_withhold_from_opposing: v[4],
        w_voluntary_trump_caller: v[5],
        w_voluntary_trump_opposing: v[6],
        w_voluntary_steal_from_caller: v[7],
        llr_clamp: v[8],
    }
}

/// Mutate each weight by Gaussian noise relative to its magnitude.
/// Clamps below 0 (signed weights would invert semantics) and llr_clamp
/// to a sane band.
fn mutate(parent: &IntentWeights, sigma: f64, rng: &mut Xoshiro256PlusPlus) -> IntentWeights {
    let p = to_vec(parent);
    let mut out = [0.0; N_FIELDS];
    for i in 0..N_FIELDS {
        let mag = p[i].abs().max(0.05);
        let delta = box_muller(rng) * sigma * mag;
        let mut nv = p[i] + delta;
        // Clip per-weight:
        if i == N_FIELDS - 1 {
            // llr_clamp: cap roughly within [1, 6]
            nv = nv.clamp(1.0, 6.0);
        } else {
            nv = nv.max(0.0).min(6.0);
        }
        out[i] = nv;
    }
    from_vec(out)
}

fn box_muller(rng: &mut Xoshiro256PlusPlus) -> f64 {
    let u1: f64 = rng.gen_range(1e-9..1.0);
    let u2: f64 = rng.gen_range(0.0..1.0);
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

// ---------------------------------------------------------------------------
//  Game runner
// ---------------------------------------------------------------------------

#[derive(Copy, Clone, PartialEq, Eq)]
enum Slot { Cand, Baseline }

/// Play one game with the given seat-to-slot assignment. Returns per-seat
/// win flags (true = seat ended on the winning side).
fn play_one(
    seats: [Slot; 5],
    cand: &IntentWeights,
    baseline: &IntentWeights,
    time_ms: u64,
    seed: u64,
) -> [bool; 5] {
    let mut rng: GameRng = from_seed(seed);
    let first_bidder: PlayerId = (seed % 5) as u8;
    let mut state = new_game(&mut rng, first_bidder);

    let set_for = |p: PlayerId| {
        set_intent_weights_override(Some(match seats[p as usize] {
            Slot::Cand => cand.clone(),
            Slot::Baseline => baseline.clone(),
        }));
    };

    // Bidding loop.
    while state.phase == Phase::Bidding {
        let p = state.next_to_act;
        set_for(p);
        match hard4_bid(&state, p) {
            Some(amt) => apply_bid(&mut state, p, amt),
            None => apply_pass(&mut state, p),
        }
    }

    // Declare.
    if state.phase == Phase::Declaring {
        let caller = state.caller.expect("caller exists after bidding");
        set_for(caller);
        let (trump, partner) = hard4_declare(&state, caller);
        apply_declare(&mut state, trump, partner);
    }

    // Play.
    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        set_for(p);
        let card = hard4_play(&state, p, time_ms, &mut rng);
        let idx = state.hands[p as usize]
            .iter()
            .position(|c| *c == card)
            .expect("hard4 must return a card from our hand");
        apply_play(&mut state, p, idx);
    }

    // Compute per-seat win flags.
    let caller = state.caller.expect("caller set");
    let bid = state.winning_bid.unwrap_or(0);
    let partner_card = state.partner_card.expect("partner card set");
    let mut team_pts: u16 = state.captured_points[caller as usize];
    let mut team: [bool; 5] = [false; 5];
    team[caller as usize] = true;
    for p in 0..5u8 {
        if p == caller { continue; }
        // partner = any non-caller seat that played a copy of the partner card.
        let played = state.tricks.iter().flat_map(|t| t.plays.iter())
            .any(|tp| tp.player == p && tp.card == partner_card);
        if played { team[p as usize] = true; team_pts += state.captured_points[p as usize]; }
    }
    let made = team_pts >= bid;
    let mut out = [false; 5];
    for p in 0..5 {
        out[p] = if made { team[p] } else { !team[p] };
    }
    out
}

/// Evaluate a candidate over N pairs of mirrored games. Returns
/// (cand_winrate, baseline_winrate).
fn evaluate(
    cand: &IntentWeights,
    baseline: &IntentWeights,
    n: u64,
    time_ms: u64,
    seed_base: u64,
) -> (f64, f64) {
    let mut cand_wins = 0u64;
    let mut cand_seats = 0u64;
    let mut base_wins = 0u64;
    let mut base_seats = 0u64;
    for i in 0..n {
        // Random seat layout per pair. We use a separate cheap RNG just for
        // layout selection — the game itself uses the seed below.
        let mut layout_rng = Xoshiro256PlusPlus::seed_from_u64(7 + i * 1009 + seed_base);
        let mut seats = [Slot::Baseline; 5];
        for k in 0..5 { seats[k] = if layout_rng.gen::<bool>() { Slot::Cand } else { Slot::Baseline }; }
        // Force at least one of each.
        if !seats.iter().any(|s| *s == Slot::Cand) { seats[0] = Slot::Cand; }
        if !seats.iter().any(|s| *s == Slot::Baseline) { seats[1] = Slot::Baseline; }

        let game_seed = seed_base.wrapping_add(i.wrapping_mul(7919));
        // Original layout.
        let w = play_one(seats, cand, baseline, time_ms, game_seed);
        for k in 0..5 {
            match seats[k] {
                Slot::Cand => { cand_seats += 1; if w[k] { cand_wins += 1; } }
                Slot::Baseline => { base_seats += 1; if w[k] { base_wins += 1; } }
            }
        }
        // Mirror layout: swap cand <-> baseline at every seat.
        let mirror: [Slot; 5] = std::array::from_fn(|k| match seats[k] {
            Slot::Cand => Slot::Baseline,
            Slot::Baseline => Slot::Cand,
        });
        let w2 = play_one(mirror, cand, baseline, time_ms, game_seed);
        for k in 0..5 {
            match mirror[k] {
                Slot::Cand => { cand_seats += 1; if w2[k] { cand_wins += 1; } }
                Slot::Baseline => { base_seats += 1; if w2[k] { base_wins += 1; } }
            }
        }
    }
    (cand_wins as f64 / cand_seats as f64, base_wins as f64 / base_seats as f64)
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

fn parse_arg<T: std::str::FromStr>(args: &[String], idx: usize, default: T) -> T {
    args.get(idx).and_then(|s| s.parse().ok()).unwrap_or(default)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let generations: u32      = parse_arg(&args, 1, 30u32);
    let lambda: usize          = parse_arg(&args, 2, 8usize);
    let games_per_eval: u64    = parse_arg(&args, 3, 60u64);
    let time_ms: u64           = parse_arg(&args, 4, 30u64);
    let seed_base: u64         = parse_arg(&args, 5, 0xC0FFEE_u64);

    say(&format!("Hard-5 ES tuner (Hard-4 intent weights)"));
    say(&format!("  generations    = {}", generations));
    say(&format!("  lambda         = {}", lambda));
    say(&format!("  games_per_eval = {}", games_per_eval));
    say(&format!("  time_ms / move = {}", time_ms));
    say(&format!("  seed_base      = 0x{:X}", seed_base));
    say(&format!("  → est. games per gen ≈ {} × 2 mirror × {} candidates = {}",
        games_per_eval, lambda, games_per_eval * 2 * lambda as u64));

    let mut best = IntentWeights::default();
    // Baseline fitness (sanity): how does default fare against itself? Should be 50/50.
    let t0 = Instant::now();
    let (bw, _) = evaluate(&best, &best, games_per_eval, time_ms, seed_base);
    say(&format!("\nGen 0 (self-play sanity): cand winrate = {:.2}% (expect ~50%)  elapsed={:.1}s",
        bw * 100.0, t0.elapsed().as_secs_f64()));

    let mut sigma = INIT_SIGMA;
    let mut mut_rng = Xoshiro256PlusPlus::seed_from_u64(seed_base.wrapping_add(99));

    for gen in 1..=generations {
        let g0 = Instant::now();
        let mut successes = 0;
        let mut best_cand: Option<(IntentWeights, f64, f64)> = None;
        for k in 0..lambda {
            let cand = mutate(&best, sigma, &mut mut_rng);
            let seed = seed_base
                .wrapping_add((gen as u64).wrapping_mul(31_337))
                .wrapping_add((k as u64).wrapping_mul(101));
            let (cr, br) = evaluate(&cand, &best, games_per_eval, time_ms, seed);
            let edge_pp = (cr - br) * 100.0;
            if edge_pp > 0.0 { successes += 1; }
            match &best_cand {
                None => best_cand = Some((cand, cr, br)),
                Some((_, prev_cr, prev_br)) => {
                    if (cr - br) > (prev_cr - prev_br) { best_cand = Some((cand, cr, br)); }
                }
            }
        }
        let (cand, cr, br) = best_cand.unwrap();
        let top_edge_pp = (cr - br) * 100.0;
        // Promotion: ANY beneficial mutation. (1+λ) classic.
        let promoted = top_edge_pp > 0.0;
        if promoted { best = cand; }
        // 1/5-success rule for sigma adaptation.
        let success_rate = successes as f64 / lambda as f64;
        sigma = if success_rate > 0.2 { (sigma * SIGMA_GROW).min(SIGMA_MAX) }
                else { (sigma * SIGMA_SHRINK).max(SIGMA_MIN) };

        let promo = if promoted { "PROMOTE" } else { "  hold " };
        let elapsed_gen = g0.elapsed().as_secs_f64();
        say(&format!(
            "Gen {:3}: top edge={:+.2}pp [cand {:.2}% vs base {:.2}%]  σ={:.3}  succ={}/{}  {}  t={:.1}s",
            gen, top_edge_pp, cr*100.0, br*100.0, sigma, successes, lambda, promo, elapsed_gen,
        ));

        // Checkpoint best every 5 gens.
        if gen % 5 == 0 || gen == generations {
            let json = serde_json::to_string_pretty(&best).expect("serialize");
            fs::write(OUTFILE, &json).expect("write");
        }
    }

    let total = t0.elapsed().as_secs_f64();
    say(&format!("\nTotal elapsed: {:.1}s ({:.1}min)", total, total / 60.0));
    say(&format!("Saved best weights to {}", OUTFILE));

    // Final verification on fresh seeds.
    let verify_n = 200u64;
    let verify_seed = seed_base.wrapping_add(987_654_321);
    let (vc, vb) = evaluate(&best, &IntentWeights::default(), verify_n, time_ms, verify_seed);
    say(&format!("\nVerification ({} pairs × 2 mirror, fresh seeds vs default):", verify_n));
    say(&format!("  Hard-5 winrate: {:.2}%", vc * 100.0));
    say(&format!("  Default winrate: {:.2}%", vb * 100.0));
    say(&format!("  Edge: {:+.2}pp", (vc - vb) * 100.0));
}
