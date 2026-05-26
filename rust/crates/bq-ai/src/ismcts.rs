//! Information-Set Monte Carlo Tree Search for Black Queen play decisions.
//!
//! Per iteration:
//! 1. Sample a determinization from belief (opponent hands consistent with hard constraints).
//! 2. From root, select a root action via UCB1 (only over actions legal in this determinization).
//! 3. Apply that action; rollout to game end with uniform-random legal play.
//! 4. Backprop: reward = self team's captured-points share.
//!
//! Single-rooted variant: stats accumulate at the root only. This is simpler than
//! tree-structured ISMCTS and competitive for shallow horizons (13 tricks max).
//! Tree-structured ISMCTS is a future Session 2 upgrade.

use crate::belief::BeliefState;
use crate::rollout::rollout_random;
use bq_engine::engine::apply_play;
use bq_engine::rng::GameRng;
use bq_engine::rules::legal_play_indices;
use bq_engine::types::{Card, GameState, Phase, PlayerId};
use std::collections::HashMap;
use std::time::Duration;

// std::time::Instant panics on wasm32-unknown-unknown. We need a portable
// monotonic clock or fall back to iteration-only budgeting.
#[cfg(not(target_arch = "wasm32"))]
fn now() -> std::time::Instant { std::time::Instant::now() }

#[cfg(target_arch = "wasm32")]
struct WasmInstant;
#[cfg(target_arch = "wasm32")]
impl WasmInstant {
    fn elapsed(&self) -> Duration { Duration::from_millis(0) }
}
#[cfg(target_arch = "wasm32")]
fn now() -> WasmInstant { WasmInstant }

#[derive(Default, Debug, Clone)]
struct ActionStats {
    visits: u64,
    total_value: f64,
}

pub struct SearchParams {
    pub time_budget: Duration,
    pub min_iterations: u64,
    pub max_iterations: u64,
    pub ucb_c: f64,
    /// AI player making the decision.
    pub self_id: PlayerId,
    /// Player(s) whose captured-points are summed as the value signal.
    /// For Hard-4 v0 with no team modeling, this is just [self_id].
    pub value_players: Vec<PlayerId>,
}

impl Default for SearchParams {
    fn default() -> Self {
        SearchParams {
            time_budget: Duration::from_millis(300),
            min_iterations: 64,
            max_iterations: 100_000,
            ucb_c: 1.4,
            self_id: 0,
            value_players: vec![0],
        }
    }
}

/// Choose the best card to play from `state.hands[params.self_id]` via ISMCTS.
pub fn ismcts_play(
    state: &GameState,
    belief: &BeliefState,
    rng: &mut GameRng,
    params: &SearchParams,
) -> Card {
    debug_assert_eq!(state.phase, Phase::Playing);
    let my_id = params.self_id;
    let trick = state.current_trick.as_ref().expect("trick during Playing");
    let legal = legal_play_indices(&state.hands[my_id as usize], Some(trick));
    let candidates: Vec<Card> = legal.iter().map(|&i| state.hands[my_id as usize][i]).collect();
    if candidates.len() == 1 { return candidates[0]; }

    let mut stats: HashMap<Card, ActionStats> = HashMap::new();
    for &c in &candidates { stats.insert(c, ActionStats::default()); }

    // On wasm32 we have no monotonic clock; time_budget is interpreted as
    // (min_iterations..max_iterations) effective range. Native paths use the
    // real deadline.
    #[cfg(not(target_arch = "wasm32"))]
    let deadline = now() + params.time_budget;
    let mut iters: u64 = 0;
    loop {
        if iters >= params.max_iterations { break; }
        #[cfg(not(target_arch = "wasm32"))]
        {
            if iters >= params.min_iterations && now() >= deadline { break; }
        }
        // wasm32: rely on iteration caps alone (set via max_iterations from JS).
        iters += 1;

        // 1. Determinize.
        let opp_hands = match belief.sample_determinization(rng) {
            Some(h) => h,
            None => continue, // sampler couldn't satisfy; skip iteration
        };

        let mut sim = state.clone();
        for p in 0..5 {
            if p as PlayerId != my_id {
                sim.hands[p] = opp_hands[p].clone();
            }
        }

        // 2. Select root action via UCB1.
        let total_visits: u64 = stats.values().map(|s| s.visits).sum();
        let chosen = pick_ucb1(&stats, &candidates, total_visits, params.ucb_c, rng);

        // 3. Apply at root, rollout to game end.
        let card_idx = sim.hands[my_id as usize].iter()
            .position(|c| *c == chosen)
            .expect("chosen card must be in hand");
        apply_play(&mut sim, my_id, card_idx);
        if sim.phase == Phase::Playing {
            rollout_random(&mut sim, rng);
        }

        // 4. Backprop. Value = sum of value-player captured points / 300.
        let captured: u16 = params.value_players.iter()
            .map(|&p| sim.captured_points[p as usize])
            .sum();
        let value = captured as f64 / 300.0;
        let s = stats.get_mut(&chosen).unwrap();
        s.visits += 1;
        s.total_value += value;
    }

    // Robust child: most-visited action. If sampling consistently failed and
    // no iteration completed, every candidate has 0 visits and max_by_key picks
    // arbitrarily — but any of them is a legal card, so we still return a legal play.
    *stats.iter()
        .max_by_key(|(_, s)| s.visits)
        .map(|(c, _)| c)
        .unwrap_or(&candidates[0])
}

fn pick_ucb1(
    stats: &HashMap<Card, ActionStats>,
    candidates: &[Card],
    total_visits: u64,
    c_param: f64,
    rng: &mut GameRng,
) -> Card {
    // Unvisited actions get explored first.
    let unvisited: Vec<Card> = candidates.iter()
        .copied()
        .filter(|c| stats[c].visits == 0)
        .collect();
    if !unvisited.is_empty() {
        return *unvisited.choose(rng).expect("non-empty");
    }
    let log_total = (total_visits.max(1) as f64).ln();
    candidates.iter().copied().max_by(|a, b| {
        let sa = &stats[a];
        let sb = &stats[b];
        let mean_a = sa.total_value / sa.visits as f64;
        let mean_b = sb.total_value / sb.visits as f64;
        let ucb_a = mean_a + c_param * (log_total / sa.visits as f64).sqrt();
        let ucb_b = mean_b + c_param * (log_total / sb.visits as f64).sqrt();
        ucb_a.partial_cmp(&ucb_b).unwrap_or(std::cmp::Ordering::Equal)
    }).expect("non-empty candidates")
}

use rand::seq::SliceRandom;

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::deck::build_deck;
    use bq_engine::engine::{apply_bid, apply_declare, apply_pass, new_game};
    use bq_engine::rng::from_seed;
    use bq_engine::types::Suit;
    use std::collections::HashMap as HM;

    fn drive_to_play(seed: u64) -> GameState {
        let mut rng = from_seed(seed);
        let mut s = new_game(&mut rng, 0);
        let first = s.next_to_act;
        apply_bid(&mut s, first, 150);
        while s.phase == Phase::Bidding {
            let p = s.next_to_act;
            apply_pass(&mut s, p);
        }
        let caller = s.caller.unwrap() as usize;
        let owned: HM<(Suit, u8), usize> = {
            let mut m = HM::new();
            for c in &s.hands[caller] { *m.entry((c.suit, c.rank)).or_insert(0) += 1; }
            m
        };
        let partner_card = *build_deck().iter().find(|c| {
            let total = if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 };
            owned.get(&(c.suit, c.rank)).copied().unwrap_or(0) < total
        }).unwrap();
        apply_declare(&mut s, Suit::S, partner_card);
        s
    }

    #[test]
    fn ismcts_returns_a_legal_card() {
        let state = drive_to_play(11);
        let self_id = state.next_to_act;
        let mine = state.hands[self_id as usize].clone();
        let belief = BeliefState::new(self_id, &mine, &build_deck());
        let mut rng = from_seed(33);
        let params = SearchParams {
            time_budget: Duration::from_millis(100),
            min_iterations: 32,
            max_iterations: 200,
            self_id,
            value_players: vec![self_id],
            ..Default::default()
        };
        let chosen = ismcts_play(&state, &belief, &mut rng, &params);
        assert!(mine.contains(&chosen), "ISMCTS picked card not in hand");
        // Must also be legal in the current trick (which is empty — leader).
        let trick = state.current_trick.as_ref().unwrap();
        let legal_indices = legal_play_indices(&mine, Some(trick));
        let legal_cards: Vec<Card> = legal_indices.iter().map(|&i| mine[i]).collect();
        assert!(legal_cards.contains(&chosen), "ISMCTS picked illegal card");
    }
}
