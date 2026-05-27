// =============================================================================
//  compare_indicator — A/B test indicator-mode vs EV-mode in Hard-4 rollouts.
//
//  Per pair, runs two games at the same deal seed:
//    Layout A: seats 0/2/4 use indicator-mode Hard-4, seats 1/3 use EV-mode
//    Layout B (mirror): seats 0/2/4 use EV, seats 1/3 use indicator
//
//  Across both runs and across all seats, each mode plays the same set of seats
//  with the same dealt hands — variance cancels by mirror replay. Reports the
//  per-seat win-rate edge of indicator-mode over EV-mode.
//
//  Usage:
//    compare_indicator [N=300] [TIME_MS=30] [SEED=0]
// =============================================================================

use bq_ai::hard4::{hard4_bid, hard4_declare, hard4_play};
use bq_ai::ismcts::set_indicator_mode;
use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game_with_intensity};
use bq_engine::rng::{from_seed, GameRng};
use bq_engine::types::{Phase, PlayerId};
use rayon::prelude::*;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

#[derive(Copy, Clone, PartialEq, Eq)]
enum Mode { Indicator, EV }

fn play_one(seats: [Mode; 5], time_ms: u64, seed: u64) -> [bool; 5] {
    let mut rng: GameRng = from_seed(seed);
    let first_bidder: PlayerId = (seed % 5) as u8;
    let mut state = new_game_with_intensity(&mut rng, first_bidder, 0.0);

    let set_for = |p: PlayerId| {
        set_indicator_mode(match seats[p as usize] {
            Mode::Indicator => true,
            Mode::EV => false,
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
    let time_ms: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(30);
    let seed: u64    = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);

    println!("compare_indicator: N={} pairs × 2 mirror, time_ms={}, seed={}", n, time_ms, seed);
    println!("Indicator-mode Hard-4 vs EV-mode Hard-4 (same dealt hands).");

    let ind_wins = AtomicU64::new(0);
    let ind_seats = AtomicU64::new(0);
    let ev_wins = AtomicU64::new(0);
    let ev_seats = AtomicU64::new(0);

    let t0 = Instant::now();
    (0..n).into_par_iter().for_each(|i| {
        // Layout: alternating Indicator/EV in the canonical assignment, then
        // mirrored. Both runs share the same dealt hands.
        let layout_a: [Mode; 5] = [Mode::Indicator, Mode::EV, Mode::Indicator, Mode::EV, Mode::Indicator];
        let layout_b: [Mode; 5] = [Mode::EV, Mode::Indicator, Mode::EV, Mode::Indicator, Mode::EV];
        let game_seed = seed.wrapping_add(i.wrapping_mul(7919));

        let mut local_iw = 0u64; let mut local_is = 0u64;
        let mut local_ev = 0u64; let mut local_es = 0u64;

        let w_a = play_one(layout_a, time_ms, game_seed);
        for k in 0..5 {
            match layout_a[k] {
                Mode::Indicator => { local_is += 1; if w_a[k] { local_iw += 1; } }
                Mode::EV        => { local_es += 1; if w_a[k] { local_ev += 1; } }
            }
        }
        let w_b = play_one(layout_b, time_ms, game_seed);
        for k in 0..5 {
            match layout_b[k] {
                Mode::Indicator => { local_is += 1; if w_b[k] { local_iw += 1; } }
                Mode::EV        => { local_es += 1; if w_b[k] { local_ev += 1; } }
            }
        }

        ind_wins.fetch_add(local_iw, Ordering::Relaxed);
        ind_seats.fetch_add(local_is, Ordering::Relaxed);
        ev_wins.fetch_add(local_ev, Ordering::Relaxed);
        ev_seats.fetch_add(local_es, Ordering::Relaxed);
    });
    let elapsed = t0.elapsed().as_secs_f64();

    let iw = ind_wins.load(Ordering::Relaxed) as f64;
    let is = ind_seats.load(Ordering::Relaxed) as f64;
    let ew = ev_wins.load(Ordering::Relaxed) as f64;
    let es = ev_seats.load(Ordering::Relaxed) as f64;
    let ir = iw / is;
    let er = ew / es;
    println!("\nResults ({:.1}s):", elapsed);
    println!("  Indicator-mode: {:.2}%  ({}/{})", ir * 100.0, iw as u64, is as u64);
    println!("  EV-mode:        {:.2}%  ({}/{})", er * 100.0, ew as u64, es as u64);
    println!("  Edge:           {:+.2}pp", (ir - er) * 100.0);
}
