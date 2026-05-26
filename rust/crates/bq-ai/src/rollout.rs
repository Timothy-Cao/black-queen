//! Rollout policies for ISMCTS leaf evaluation.
//!
//! v0: uniform-random legal play. Cheap (~microseconds per game). Bias is
//! controlled by determinization sampling, not rollout strength. A Hard-3
//! scoreMove port for stronger rollouts is a future Session 2 improvement.

use bq_engine::engine::apply_play;
use bq_engine::rng::GameRng;
use bq_engine::rules::legal_play_indices;
use bq_engine::types::{GameState, Phase};
use rand::seq::SliceRandom;

/// Plays a determinized state to completion using uniform-random legal moves.
/// Mutates `state` in place. On return, `state.phase == Phase::Done`.
pub fn rollout_random(state: &mut GameState, rng: &mut GameRng) {
    while state.phase == Phase::Playing {
        let p = state.next_to_act;
        let legal = {
            let trick = state.current_trick.as_ref().expect("trick exists during Playing phase");
            legal_play_indices(&state.hands[p as usize], Some(trick))
        };
        let idx = *legal.choose(rng).expect("at least one legal play");
        apply_play(state, p, idx);
    }
}
