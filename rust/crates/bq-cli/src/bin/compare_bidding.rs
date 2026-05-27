// =============================================================================
//  compare_bidding — A/B test partner-aware bidding vs default Hard-4 bidding.
//
//  Identical play logic; only the bid target adjustment differs. Mirror-replay
//  paired evaluation cancels seat and shuffle variance.
//
//  Usage: compare_bidding [N=300] [TIME_MS=30] [SEED=0]
// =============================================================================

use bq_ai::hard4::{hard4_bid, hard4_declare, hard4_play, set_partner_aware_bidding};
use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game_with_intensity};
use bq_engine::rng::{from_seed, GameRng};
use bq_engine::types::{Phase, PlayerId};
use rayon::prelude::*;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

#[derive(Copy, Clone, PartialEq, Eq)]
enum Mode { PartnerAware, Default }

fn play_one(seats: [Mode; 5], time_ms: u64, seed: u64) -> [bool; 5] {
    let mut rng: GameRng = from_seed(seed);
    let first_bidder: PlayerId = (seed % 5) as u8;
    let mut state = new_game_with_intensity(&mut rng, first_bidder, 0.0);

    let set_for = |p: PlayerId| {
        set_partner_aware_bidding(match seats[p as usize] {
            Mode::PartnerAware => true,
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
    let time_ms: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(30);
    let seed: u64    = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);

    println!("compare_bidding: N={} pairs × 2 mirror, time_ms={}, seed={}", n, time_ms, seed);
    println!("Partner-aware bidding (Hard-5 candidate) vs default Hard-4 bidder.");

    let pa_wins = AtomicU64::new(0);
    let pa_seats = AtomicU64::new(0);
    let df_wins = AtomicU64::new(0);
    let df_seats = AtomicU64::new(0);

    let t0 = Instant::now();
    (0..n).into_par_iter().for_each(|i| {
        let layout_a: [Mode; 5] = [Mode::PartnerAware, Mode::Default, Mode::PartnerAware, Mode::Default, Mode::PartnerAware];
        let layout_b: [Mode; 5] = [Mode::Default, Mode::PartnerAware, Mode::Default, Mode::PartnerAware, Mode::Default];
        let game_seed = seed.wrapping_add(i.wrapping_mul(7919));

        let mut local_pw = 0u64; let mut local_ps = 0u64;
        let mut local_dw = 0u64; let mut local_ds = 0u64;

        let w_a = play_one(layout_a, time_ms, game_seed);
        for k in 0..5 {
            match layout_a[k] {
                Mode::PartnerAware => { local_ps += 1; if w_a[k] { local_pw += 1; } }
                Mode::Default      => { local_ds += 1; if w_a[k] { local_dw += 1; } }
            }
        }
        let w_b = play_one(layout_b, time_ms, game_seed);
        for k in 0..5 {
            match layout_b[k] {
                Mode::PartnerAware => { local_ps += 1; if w_b[k] { local_pw += 1; } }
                Mode::Default      => { local_ds += 1; if w_b[k] { local_dw += 1; } }
            }
        }

        pa_wins.fetch_add(local_pw, Ordering::Relaxed);
        pa_seats.fetch_add(local_ps, Ordering::Relaxed);
        df_wins.fetch_add(local_dw, Ordering::Relaxed);
        df_seats.fetch_add(local_ds, Ordering::Relaxed);
    });
    let elapsed = t0.elapsed().as_secs_f64();

    let pw = pa_wins.load(Ordering::Relaxed) as f64;
    let ps = pa_seats.load(Ordering::Relaxed) as f64;
    let dw = df_wins.load(Ordering::Relaxed) as f64;
    let ds = df_seats.load(Ordering::Relaxed) as f64;
    let pr = pw / ps;
    let dr = dw / ds;
    println!("\nResults ({:.1}s):", elapsed);
    println!("  Partner-aware:  {:.2}%  ({}/{})", pr * 100.0, pw as u64, ps as u64);
    println!("  Default:        {:.2}%  ({}/{})", dr * 100.0, dw as u64, ds as u64);
    println!("  Edge:           {:+.2}pp", (pr - dr) * 100.0);
}
