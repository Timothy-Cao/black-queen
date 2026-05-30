//! WASM bindings for Hard-4. JSON in, JSON out — keeps the TS↔Rust boundary
//! schema-explicit (serde-wasm-bindgen would work too, but JSON debugging in
//! the browser console is simpler).
//!
//! Exposed functions:
//!   hard4_bid_json(state_json, self_id) -> "{\"bid\": <u16|null>}"
//!   hard4_declare_json(state_json, self_id) -> "{\"trump\": \"S\", \"partner_card\": {...}}"
//!   hard4_play_json(state_json, self_id, time_ms, seed) -> "{\"card\": {...}}"
//!   version() -> crate version string

use bq_ai::hard4::{hard4_bid, hard4_declare, hard4_play};
use bq_engine::rng::from_seed;
use bq_engine::types::{Card, GameState, PlayerId, Suit};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize)]
struct BidResult { bid: Option<u16> }

#[derive(Serialize, Deserialize)]
struct DeclareResult { trump: Suit, partner_card: Card }

#[derive(Serialize, Deserialize)]
struct PlayResult { card: Card }

fn parse_state(s: &str) -> Result<GameState, JsValue> {
    serde_json::from_str(s).map_err(|e| JsValue::from_str(&format!("parse: {}", e)))
}

#[wasm_bindgen]
pub fn hard4_bid_json(state_json: &str, self_id: u8) -> Result<String, JsValue> {
    let state = parse_state(state_json)?;
    let bid = hard4_bid(&state, self_id as PlayerId);
    Ok(serde_json::to_string(&BidResult { bid }).unwrap())
}

#[wasm_bindgen]
pub fn hard4_declare_json(state_json: &str, self_id: u8) -> Result<String, JsValue> {
    let state = parse_state(state_json)?;
    let (trump, partner_card) = hard4_declare(&state, self_id as PlayerId);
    Ok(serde_json::to_string(&DeclareResult { trump, partner_card }).unwrap())
}

#[wasm_bindgen]
pub fn hard4_play_json(state_json: &str, self_id: u8, time_ms: u32, seed: u64) -> Result<String, JsValue> {
    let state = parse_state(state_json)?;
    let mut rng = from_seed(seed);
    let card = hard4_play(&state, self_id as PlayerId, time_ms as u64, &mut rng);
    Ok(serde_json::to_string(&PlayResult { card }).unwrap())
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// A/B toggle for the follow-side discard guard (defaults ON).
#[wasm_bindgen]
pub fn set_follow_guard_wasm(enabled: bool) {
    bq_ai::hard4::set_follow_guard(enabled);
}

/// Hard-4B variant toggle. Set per-decision before a play/bid/declare call.
/// v0 scaffold: no behavior change (identical to Hard-4).
#[wasm_bindgen]
pub fn set_hard4b_wasm(enabled: bool) {
    bq_ai::hard4::set_hard4b(enabled);
}

/// Thrower toggle — inverts the ISMCTS value (search to MINIMIZE own team's
/// points). Experiment-only; never in the rating pool. Set per-decision.
#[wasm_bindgen]
pub fn set_thrower_wasm(enabled: bool) {
    bq_ai::hard4::set_thrower(enabled);
}

/// A/B selector for ISMCTS rollout policy. 0=Tactical, 1=Greedy (default), 2=Random.
#[wasm_bindgen]
pub fn set_rollout_policy_wasm(policy: u8) {
    use bq_ai::ismcts::{set_rollout_policy, RolloutPolicy};
    let p = match policy {
        0 => RolloutPolicy::Tactical,
        2 => RolloutPolicy::Random,
        _ => RolloutPolicy::Greedy,
    };
    set_rollout_policy(p);
}

/// A/B toggle for the ≤10-card endgame minimax solver (historically ON in wasm).
#[wasm_bindgen]
pub fn set_endgame_enabled_wasm(enabled: bool) {
    bq_ai::endgame::set_endgame_enabled(enabled);
}

/// A/B toggle for tree-structured ISMCTS (SO-ISMCTS). depth = max tree depth in plays.
#[wasm_bindgen]
pub fn set_tree_ismcts_wasm(enabled: bool, depth: u32) {
    bq_ai::tree_ismcts::set_tree_ismcts(enabled, depth);
}

/// A/B override for UCB exploration constant. c_x100 = c × 100 (0 = use default 1.4).
#[wasm_bindgen]
pub fn set_ucb_c_wasm(c_x100: u32) {
    bq_ai::ismcts::set_ucb_c(c_x100);
}

/// A/B toggle for PUCT prior-guided root selection.
/// enabled: on/off. c_x100: PUCT c × 100 (e.g. 150 = 1.5). conc_x100: prior
/// concentration on greedy pick × 100 (e.g. 50 = 0.5 mass on greedy move).
#[wasm_bindgen]
pub fn set_puct_wasm(enabled: bool, c_x100: u32, conc_x100: u32) {
    bq_ai::ismcts::set_puct(enabled, c_x100, conc_x100);
}
