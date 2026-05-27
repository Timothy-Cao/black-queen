// =============================================================================
//  compare_archetype — A/B test archetype-aware bidding vs default Hard-4.
//
//  Identical play logic; only the bid target adjustment differs. Uses all
//  three archetype scores (partner / feeder / caller) instead of just the
//  partner-likeliness heuristic from compare_bidding.
//
//  Usage: compare_archetype [N=300] [TIME_MS=50] [SEED=0]
// =============================================================================

use bq_ai::hard4::{hard4_bid, hard4_declare, hard4_play, set_archetype_aware_bidding};
use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game_with_intensity};
use bq_engine::rng::{from_seed, GameRng};
use bq_engine::types::{Phase, PlayerId};
use rayon::prelude::*;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

#[derive(Copy, Clone, PartialEq, Eq)]
enum Mode { Archetype, Default }

fn play_one(seats: [Mode; 5], time_ms: u64, seed: u64) -> [bool; 5] {
    let mut rng: GameRng = from_seed(seed);
    let first_bidder: PlayerId = (seed % 5) as u8;
    let mut state = new_game_with_intensity(&mut rng, first_bidder, 0.0);

    let set_for = |p: PlayerId| {
        set_archetype_aware_bidding(match seats[p as usize] {
            Mode::Archetype => true,
            Mode::Default => false,
        });
    };

    while state.phase == Phase::Bidding {
        let p = state.next_to_act;
        set_for(p);
        match hard4_bid(&state, p) {
            Some(amt) => apply_bid(&mut state, p, amt),
            None => apply_pass(&mut state, p),
        }
    }
    if state.phase == Phase::Declaring {
        let caller = state.caller.expect("caller exists");
        set_for(caller);
        let (trump, partner) = hard4_declare(&state, caller);
        apply_declare(&mut state, trump, partner);
    }
    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        set_for(p);
        let card = hard4_play(&state, p, time_ms, &mut rng);
        let idx = state.hands[p as usize].iter().position(|c| *c == card)
            .expect("hard4 returned non-hand card");
        apply_play(&mut state, p, idx);
    }

    let caller = state.caller.expect("caller set");
    let bid = state.winning_bid.unwrap_or(0);
    let partner_card = state.partner_card.expect("partner card set");
    let mut team_pts: u16 = state.captured_points[caller as usize];
    let mut team: [bool; 5] = [false; 5];
    team[caller as usize] = true;
    for p in 0..5u8 {
        if p == caller { continue; }
        let played = state.tricks.iter().flat_map(|t| t.plays.iter())
            .any(|tp| tp.player == p && tp.card == partner_card);
        if played { team[p as usize] = true; team_pts += state.captured_points[p as usize]; }
    }
    let made = team_pts >= bid;
    let mut out = [false; 5];
    for p in 0..5 { out[p] = if made { team[p] } else { !team[p] }; }
    out
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let n: u64       = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(300);
    let time_ms: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(50);
    let seed: u64    = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);

    println!("compare_archetype: N={} pairs × 2 mirror, time_ms={}, seed={}", n, time_ms, seed);
    println!("Archetype-aware bidding (Hard-5 attempt 4) vs default Hard-4 bidder.");

    let ar_wins = AtomicU64::new(0);
    let ar_seats = AtomicU64::new(0);
    let df_wins = AtomicU64::new(0);
    let df_seats = AtomicU64::new(0);

    let t0 = Instant::now();
    (0..n).into_par_iter().for_each(|i| {
        let layout_a: [Mode; 5] = [Mode::Archetype, Mode::Default, Mode::Archetype, Mode::Default, Mode::Archetype];
        let layout_b: [Mode; 5] = [Mode::Default, Mode::Archetype, Mode::Default, Mode::Archetype, Mode::Default];
        let game_seed = seed.wrapping_add(i.wrapping_mul(7919));

        let mut law = 0u64; let mut las = 0u64;
        let mut ldw = 0u64; let mut lds = 0u64;

        let w_a = play_one(layout_a, time_ms, game_seed);
        for k in 0..5 {
            match layout_a[k] {
                Mode::Archetype => { las += 1; if w_a[k] { law += 1; } }
                Mode::Default   => { lds += 1; if w_a[k] { ldw += 1; } }
            }
        }
        let w_b = play_one(layout_b, time_ms, game_seed);
        for k in 0..5 {
            match layout_b[k] {
                Mode::Archetype => { las += 1; if w_b[k] { law += 1; } }
                Mode::Default   => { lds += 1; if w_b[k] { ldw += 1; } }
            }
        }

        ar_wins.fetch_add(law, Ordering::Relaxed);
        ar_seats.fetch_add(las, Ordering::Relaxed);
        df_wins.fetch_add(ldw, Ordering::Relaxed);
        df_seats.fetch_add(lds, Ordering::Relaxed);
    });
    let elapsed = t0.elapsed().as_secs_f64();

    let aw = ar_wins.load(Ordering::Relaxed) as f64;
    let as_ = ar_seats.load(Ordering::Relaxed) as f64;
    let dw = df_wins.load(Ordering::Relaxed) as f64;
    let ds = df_seats.load(Ordering::Relaxed) as f64;
    let ar = aw / as_;
    let dr = dw / ds;
    println!("\nResults ({:.1}s):", elapsed);
    println!("  Archetype-aware: {:.2}%  ({}/{})", ar * 100.0, aw as u64, as_ as u64);
    println!("  Default:         {:.2}%  ({}/{})", dr * 100.0, dw as u64, ds as u64);
    println!("  Edge:            {:+.2}pp", (ar - dr) * 100.0);
}
