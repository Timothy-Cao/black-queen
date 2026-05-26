use bq_engine::deck::build_deck;
use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game};
use bq_engine::rng::from_seed;
use bq_engine::rules::legal_play_indices;
use bq_engine::types::{Phase, Suit};
use rand::seq::SliceRandom;
use std::collections::HashMap;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("smoke") => {
            let n: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1000);
            smoke(n);
        }
        Some("arena") => {
            eprintln!("arena: not implemented in Session 1 — use npx tsx src/game/arena.ts");
            std::process::exit(2);
        }
        _ => {
            eprintln!("usage: bq-cli smoke [N]");
            std::process::exit(2);
        }
    }
}

fn smoke(n: u64) {
    let mut failures = 0u64;
    let start = std::time::Instant::now();
    for seed in 0..n {
        if !play_one_random_game(seed) {
            failures += 1;
            eprintln!("seed {} failed invariants", seed);
        }
    }
    let elapsed = start.elapsed();
    let rate = n as f64 / elapsed.as_secs_f64();
    println!(
        "smoke: {} games, {} failures, {:.2}s ({:.0} games/sec)",
        n, failures, elapsed.as_secs_f64(), rate,
    );
    if failures > 0 { std::process::exit(1); }
}

fn play_one_random_game(seed: u64) -> bool {
    let mut rng = from_seed(seed);
    let mut state = new_game(&mut rng, (seed % 5) as u8);
    let first = state.next_to_act;
    apply_bid(&mut state, first, 150);
    while state.phase == Phase::Bidding {
        let p = state.next_to_act;
        apply_pass(&mut state, p);
    }
    let caller = state.caller.unwrap() as usize;
    let owned: HashMap<(Suit, u8), usize> = {
        let mut m = HashMap::new();
        for c in &state.hands[caller] {
            *m.entry((c.suit, c.rank)).or_insert(0) += 1;
        }
        m
    };
    let partner_card = *build_deck().iter().find(|c| {
        let total = if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 };
        owned.get(&(c.suit, c.rank)).copied().unwrap_or(0) < total
    }).unwrap();
    apply_declare(&mut state, Suit::S, partner_card);

    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        let trick = state.current_trick.as_ref().unwrap();
        let legal = legal_play_indices(&state.hands[p as usize], Some(trick));
        let idx = *legal.choose(&mut rng).unwrap();
        apply_play(&mut state, p, idx);
    }
    state.phase == Phase::Done
        && state.captured_points.iter().sum::<u16>() == 300
        && state.tricks.len() == 13
}
