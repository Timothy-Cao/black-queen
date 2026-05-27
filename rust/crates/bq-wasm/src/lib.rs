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
