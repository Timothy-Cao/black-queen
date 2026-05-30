//! Hard-4 public entry points: bid, declare, play.
//!
//! v0 implementation:
//! - `hard4_bid`: heuristic (greedy +5 cap 200, strong hands only).
//! - `hard4_declare`: heuristic (longest suit as trump, ace/Q♠ as partner card).
//! - `hard4_play`: full ISMCTS with hard-constraint belief built from observed plays.
//!
//! Bid and declare upgrade to ISMCTS evaluation in Session 2.

use crate::belief::BeliefState;
use crate::handeval::{evaluate_hand, estimate_bid_capacity};
use crate::intent::IntentTracker;
use crate::ismcts::{ismcts_play, SearchParams};
use bq_engine::deck::build_deck;
use bq_engine::rng::GameRng;
use bq_engine::rules::{legal_play_indices, trick_winner};
use bq_engine::types::{Card, GameState, PlayerId, Suit, Trick, TrickPlay};
use std::time::Duration;

/// Returns the bid amount to make, or None to pass.
///
/// Bid up while the next legal bid is within our hand's capacity estimate
/// minus a safety margin. Capacity = evaluate_hand(self).estimate_capture.
/// Safety margin reflects partner contribution uncertainty: we expect ~30-60
/// points of help from whoever holds the partner card, but it's noisy.
pub fn hard4_bid(state: &GameState, self_id: PlayerId) -> Option<u16> {
    let hand = &state.hands[self_id as usize];
    let capacity = estimate_bid_capacity(hand);
    let current = state.winning_bid.unwrap_or(0);
    let required: u16 = if current < 150 { 150 } else { current + 5 };

    // Target = floor(capacity / 5) * 5, capped at 240 unless capacity > 280.
    let mut target = (capacity / 5) * 5;
    if target > 240 && capacity < 280 { target = 240; }
    if target > 300 { target = 300; }

    // Partner-aware adjustment.
    //
    // Insight: if your hand is rich in partner-eligible cards (Aces, Q♠, Kings),
    // you're very likely to be called as partner regardless of who wins the
    // bid — so you should let the bid stay low. Conversely, if your hand has
    // none of those cards, you'll be on the OPPOSING team for sure. At a low
    // bid the caller easily wins; pushing the bid higher tilts the game toward
    // caller-failure, which is a win for you (opponent).
    //
    // Heuristic: partner_score = aces × 1.0 + Q♠ × 1.2 + kings × 0.35. Centered
    // around 1.5 (the typical-hand average), it adjusts target by ≈ ∓7 pts per
    // unit of partner-likeliness. Range capped at ±20 to avoid pathological
    // overshoot for hands with 4 aces + Q♠.
    if partner_aware_bidding_enabled() {
        let aces = hand.iter().filter(|c| c.rank == 14).count() as i32;
        let q_spades = hand.iter().filter(|c| c.suit == Suit::S && c.rank == 12).count() as i32;
        let kings = hand.iter().filter(|c| c.rank == 13).count() as i32;
        let score_x10 = aces * 10 + q_spades * 12 + kings * 3;
        // Asymmetric: only raise bids for partner-POOR hands (likely-opponent
        // who can profit from pushing the caller into failure territory). DON'T
        // lower bids for partner-RICH hands — those are strong hands the default
        // capacity formula already values correctly. Lowering them was a bug
        // (regressed −2.00pp in N=300 A/B); the strong-hand player should
        // typically WIN the bid themselves, not let it stay low.
        if score_x10 < 15 {
            let adjustment = (((15 - score_x10) * 7) / 10).min(20);  // up to +20
            let new_target = (target as i32 + adjustment).min(300);
            target = ((new_target / 5) * 5) as u16;
        }
    }

    // Archetype-aware adjustment (Hard-5 attempt 4, richer than partner-aware).
    //
    // Computes three orthogonal scores capturing what role this hand fits:
    //   partner ∈ [0, 5] — unique partner-eligible cards held (4 Aces + Q♠).
    //   feeder ∈ [0, ~120] — point cards weighted by ease-of-loss (Aces 0.5x).
    //   caller ∈ [0, ~150] — longest_suit² + 4·voids + 2·(A/K in longest).
    //
    // Adjustment combines two strategic signals:
    //   1. "Locked-out + vulnerable": partner ≤ 1 AND feeder ≥ 40.
    //      You'll be on opposing team and will bleed points if caller wins
    //      easily. Push the bid up — proportional to feeder excess over 40.
    //   2. "Weak partner-magnet": partner ≥ 4 AND caller < 60.
    //      You're going to be called as partner regardless. Don't fight a
    //      bid you'll be on the winning side of. Small downward nudge.
    //
    // The trigger window is wider than partner-aware-only (more games fire);
    // the magnitude is also informed by the relevant axis instead of a flat
    // bump. If this is null, we have strong evidence the bid-adjustment
    // direction is genuinely hopeless at the current search depth.
    if archetype_aware_bidding_enabled() {
        let (partner, feeder, caller) = archetype_scores(hand);
        let mut adjustment: i32 = 0;
        if partner <= 1 && feeder >= 40 {
            let excess = (feeder - 40) / 4;  // ~0..20 for feeder up to 120
            adjustment += excess.min(25);
        }
        if partner >= 4 && caller < 60 {
            adjustment -= 8;
        }
        if adjustment != 0 {
            let new_target = (target as i32 + adjustment).max(150).min(300);
            target = ((new_target / 5) * 5) as u16;
        }
    }

    if required > target { return None; }
    Some(required)
}

// ---------------------------------------------------------------------------
//  Hand archetype scores (Rust port of src/game/handArchetypes.ts).
//  Returns (partner, feeder, caller) all as i32 for integer-math heuristics.
// ---------------------------------------------------------------------------

fn archetype_scores(hand: &[Card]) -> (i32, i32, i32) {
    // Partner-score: count unique (suit, rank) ∈ {A♠, A♥, A♦, A♣, Q♠} held.
    let mut partner = 0i32;
    for &(suit, rank) in &[(Suit::S, 14u8), (Suit::H, 14), (Suit::D, 14), (Suit::C, 14), (Suit::S, 12)] {
        if hand.iter().any(|c| c.suit == suit && c.rank == rank) { partner += 1; }
    }
    // Feeder-score: Σ point-card value; Aces weighted 0.5 (rounded down).
    let mut feeder = 0i32;
    for c in hand {
        let pts = c.points() as i32;
        if pts == 0 { continue; }
        if c.rank == 14 { feeder += pts / 2; }
        else { feeder += pts; }
    }
    // Caller-score: longest_suit² + 4·voids + 2·(A/K in longest suit).
    let mut lengths = [0i32; 4];
    for c in hand {
        let idx = match c.suit { Suit::S => 0, Suit::H => 1, Suit::D => 2, Suit::C => 3 };
        lengths[idx] += 1;
    }
    let voids = lengths.iter().filter(|&&l| l == 0).count() as i32;
    let mut longest_len = 0i32;
    let mut longest_suit = Suit::S;
    for (i, &l) in lengths.iter().enumerate() {
        if l > longest_len {
            longest_len = l;
            longest_suit = match i { 0 => Suit::S, 1 => Suit::H, 2 => Suit::D, _ => Suit::C };
        }
    }
    let top_in_longest = hand.iter()
        .filter(|c| c.suit == longest_suit && (c.rank == 14 || c.rank == 13))
        .count() as i32;
    let caller = longest_len * longest_len + 4 * voids + 2 * top_in_longest;
    (partner, feeder, caller)
}

// ---------------------------------------------------------------------------
//  Archetype-aware bidding toggle (Hard-5 attempt 4).
//  Default = OFF until A/B'd. Enable: BQ_BID_ARCHETYPE=1 or
//  set_archetype_aware_bidding(true) at runtime.
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
mod bid_archetype_cell {
    use std::cell::RefCell;
    thread_local! {
        static OVERRIDE: RefCell<Option<bool>> = const { RefCell::new(None) };
    }
    pub fn set(b: Option<bool>) { OVERRIDE.with(|c| *c.borrow_mut() = b); }
    pub fn get() -> Option<bool> { OVERRIDE.with(|c| *c.borrow()) }
}

pub fn set_archetype_aware_bidding(enabled: bool) {
    #[cfg(not(target_arch = "wasm32"))]
    bid_archetype_cell::set(Some(enabled));
    #[cfg(target_arch = "wasm32")]
    { let _ = enabled; }
}

fn archetype_aware_bidding_enabled() -> bool {
    #[cfg(target_arch = "wasm32")]
    { return false; }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(v) = bid_archetype_cell::get() { return v; }
        std::env::var("BQ_BID_ARCHETYPE").ok().filter(|s| !s.is_empty()).is_some()
    }
}

// ---------------------------------------------------------------------------
//  Partner-aware bidding toggle (Hard-5 candidate feature).
//  Default = OFF until A/B'd. Enable: BQ_BID_PARTNER_AWARE=1 or
//  set_partner_aware_bidding(true) at runtime.
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
mod bid_partner_cell {
    use std::cell::RefCell;
    thread_local! {
        static OVERRIDE: RefCell<Option<bool>> = const { RefCell::new(None) };
    }
    pub fn set(b: Option<bool>) { OVERRIDE.with(|c| *c.borrow_mut() = b); }
    pub fn get() -> Option<bool> { OVERRIDE.with(|c| *c.borrow()) }
}

pub fn set_partner_aware_bidding(enabled: bool) {
    #[cfg(not(target_arch = "wasm32"))]
    bid_partner_cell::set(Some(enabled));
    #[cfg(target_arch = "wasm32")]
    { let _ = enabled; }
}

fn partner_aware_bidding_enabled() -> bool {
    #[cfg(target_arch = "wasm32")]
    { return false; }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(v) = bid_partner_cell::get() { return v; }
        std::env::var("BQ_BID_PARTNER_AWARE").ok().filter(|s| !s.is_empty()).is_some()
    }
}

// ---------------------------------------------------------------------------
//  Low-point enemy-discard guard.
//
//  Default = ON. Qualitative trace review found repeated cases where ISMCTS
//  chose a point-card discard onto a trick currently won by the opposing team,
//  despite having lower-point non-trump discards available. This post-search
//  guard only fires for non-trump discards to an enemy-winning trick, so it
//  preserves intentional smears when a teammate is already winning.
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
mod discard_guard_cell {
    use std::cell::RefCell;
    thread_local! {
        static OVERRIDE: RefCell<Option<bool>> = const { RefCell::new(None) };
    }
    pub fn set(b: Option<bool>) { OVERRIDE.with(|c| *c.borrow_mut() = b); }
    pub fn get() -> Option<bool> { OVERRIDE.with(|c| *c.borrow()) }
}

pub fn set_discard_guard(enabled: bool) {
    #[cfg(not(target_arch = "wasm32"))]
    discard_guard_cell::set(Some(enabled));
    #[cfg(target_arch = "wasm32")]
    { let _ = enabled; }
}

fn discard_guard_enabled() -> bool {
    #[cfg(target_arch = "wasm32")]
    { return true; }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(v) = discard_guard_cell::get() { return v; }
        std::env::var("BQ_DISCARD_GUARD_OFF").ok().filter(|s| !s.is_empty()).is_none()
    }
}

/// Toggle for the follow-side guard added 2026-05-27. Defaults ON.
/// Native: set via BQ_FOLLOW_GUARD_OFF=1 or `set_follow_guard(false)`.
/// WASM: set via the `set_follow_guard_wasm` bindgen export (used for A/B).
#[cfg(not(target_arch = "wasm32"))]
thread_local! {
    static FOLLOW_GUARD_OVERRIDE: std::cell::RefCell<Option<bool>> = const { std::cell::RefCell::new(None) };
}

// Defaults OFF on WASM — null result in 2026-05-27 A/B (Δ=+0.55, Z=0.15 at N=2000).
// Code retained for future re-A/B at higher search budgets where it may help.
#[cfg(target_arch = "wasm32")]
static FOLLOW_GUARD_WASM: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_follow_guard(enabled: bool) {
    #[cfg(not(target_arch = "wasm32"))]
    FOLLOW_GUARD_OVERRIDE.with(|c| *c.borrow_mut() = Some(enabled));
    #[cfg(target_arch = "wasm32")]
    FOLLOW_GUARD_WASM.store(enabled, std::sync::atomic::Ordering::Relaxed);
}

fn follow_guard_enabled() -> bool {
    #[cfg(target_arch = "wasm32")]
    { return FOLLOW_GUARD_WASM.load(std::sync::atomic::Ordering::Relaxed); }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(v) = FOLLOW_GUARD_OVERRIDE.with(|c| *c.borrow()) { return v; }
        // Native: defaults OFF (null A/B 2026-05-27); set BQ_FOLLOW_GUARD_ON=1 to enable.
        std::env::var("BQ_FOLLOW_GUARD_ON").ok().filter(|s| !s.is_empty()).is_some()
    }
}

// ---------------------------------------------------------------------------
//  Hard-4B variant flag (experiment — docs/hard4b_experiment.md).
//  Set per-decision before calling the play/bid/declare entry points. When ON,
//  hard4_play applies the Hard-4B improvements. v0 SCAFFOLD: identical to Hard-4
//  (no behavior change) — confirms the clone wires onto the ladder ≈ Hard-4.
//  Subsequent iterations branch on `hard4b_enabled()` to add targeted fixes.
// ---------------------------------------------------------------------------
#[cfg(not(target_arch = "wasm32"))]
thread_local! {
    static HARD4B_OVERRIDE: std::cell::RefCell<bool> = const { std::cell::RefCell::new(false) };
}
#[cfg(target_arch = "wasm32")]
static HARD4B_WASM: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_hard4b(enabled: bool) {
    #[cfg(not(target_arch = "wasm32"))]
    HARD4B_OVERRIDE.with(|c| *c.borrow_mut() = enabled);
    #[cfg(target_arch = "wasm32")]
    HARD4B_WASM.store(enabled, std::sync::atomic::Ordering::Relaxed);
}

#[allow(dead_code)] // read by future Hard-4B iterations; scaffold is a no-op.
pub fn hard4b_enabled() -> bool {
    #[cfg(target_arch = "wasm32")]
    { return HARD4B_WASM.load(std::sync::atomic::Ordering::Relaxed); }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if HARD4B_OVERRIDE.with(|c| *c.borrow()) { return true; }
        std::env::var("BQ_HARD4B").ok().filter(|s| !s.is_empty()).is_some()
    }
}

// ---------------------------------------------------------------------------
//  Thrower flag (experiment — "how low can an AI's Elo go?").
//  When ON, the ISMCTS value signal is INVERTED: the search MINIMIZES its own
//  team's captured points instead of maximizing them. A competent saboteur —
//  Hard-4's full search aimed at losing. Measures the skill-floor of throwing.
// ---------------------------------------------------------------------------
#[cfg(not(target_arch = "wasm32"))]
thread_local! {
    static THROWER_OVERRIDE: std::cell::RefCell<bool> = const { std::cell::RefCell::new(false) };
}
#[cfg(target_arch = "wasm32")]
static THROWER_WASM: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_thrower(enabled: bool) {
    #[cfg(not(target_arch = "wasm32"))]
    THROWER_OVERRIDE.with(|c| *c.borrow_mut() = enabled);
    #[cfg(target_arch = "wasm32")]
    THROWER_WASM.store(enabled, std::sync::atomic::Ordering::Relaxed);
}

pub fn thrower_enabled() -> bool {
    #[cfg(target_arch = "wasm32")]
    { return THROWER_WASM.load(std::sync::atomic::Ordering::Relaxed); }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if THROWER_OVERRIDE.with(|c| *c.borrow()) { return true; }
        std::env::var("BQ_THROWER").ok().filter(|s| !s.is_empty()).is_some()
    }
}

/// Decide trump suit and partner card.
///
/// Trump: the suit our hand evaluator picks as strongest (not just longest).
/// Partner card: highest-rank rank+suit we own ZERO copies of, walking ranks
/// high → low. This mirrors the Hard-3/Normal partner-call rule: by calling a
/// high card we don't hold, we maximize the chance our partner has the trump-
/// suit equivalent or a top side card.
pub fn hard4_declare(state: &GameState, self_id: PlayerId) -> (Suit, Card) {
    let hand = &state.hands[self_id as usize];
    let eval = evaluate_hand(hand);
    let trump = eval.best_trump;

    let mut owned = std::collections::HashMap::<(Suit, u8), usize>::new();
    for c in hand { *owned.entry((c.suit, c.rank)).or_insert(0) += 1; }
    let count_of = |s: Suit, r: u8| owned.get(&(s, r)).copied().unwrap_or(0);

    // Walk ranks high → low; pick the first (rank, suit) we hold ZERO of.
    // Skip 7-of-non-spades (only 7♠ exists in the deck).
    let ranks: [u8; 9] = [14, 13, 12, 11, 10, 9, 8, 7, 5];
    for rank in ranks {
        for &suit in &Suit::ALL {
            if rank == 7 && suit != Suit::S { continue; }
            if count_of(suit, rank) == 0 {
                return (trump, Card { suit, rank });
            }
        }
    }
    // Fallback: should be unreachable in a 13-card hand from a 65-card deck.
    let all = build_deck();
    let pc = *all.iter().find(|c| {
        let total = if c.suit == Suit::S && c.rank == 7 { 1 } else { 2 };
        count_of(c.suit, c.rank) < total
    }).expect("at least one available partner card");
    (trump, pc)
}

/// Decide a card to play via ISMCTS. Belief is reconstructed from observed
/// history each call (v0; future versions can thread an incrementally-updated
/// belief through the AI driver to avoid recomputation).
pub fn hard4_play(
    state: &GameState,
    self_id: PlayerId,
    time_ms: u64,
    rng: &mut GameRng,
) -> Card {
    let mine = state.hands[self_id as usize].clone();
    let all = build_deck();
    let mut belief = BeliefState::new(self_id, &mine, &all);

    // Bid-strength prior: in mirror-replay A/B at 300 pairs, ENABLING this cost
    // ~3pp of strength (+3.53pp baseline → +0.60pp). Likely because the prior
    // weights aren't well-calibrated and bias samples wrong. Kept in code for
    // a future tuned version; OFF by default. Enable for experiments with
    // BQ_BIDPRIOR=1.
    #[cfg(not(target_arch = "wasm32"))]
    let bidprior_enabled = std::env::var("BQ_BIDPRIOR")
        .ok().filter(|s| !s.is_empty()).is_some();
    #[cfg(target_arch = "wasm32")]
    let bidprior_enabled = false;
    if bidprior_enabled {
        for bid in &state.bids {
            if let Some(amount) = bid.amount {
                belief.apply_bid_strength_prior(bid.player, amount);
            }
        }
    }
    // Replay declare event.
    if let (Some(caller), Some(pc)) = (state.caller, state.partner_card) {
        belief.on_declare(caller, pc);
    }
    // Replay all completed tricks.
    for trick in &state.tricks {
        let led_suit = trick.plays[0].card.suit;
        for tp in &trick.plays {
            if tp.player != self_id && tp.card.suit != led_suit {
                belief.on_non_follow(tp.player, led_suit);
            }
            belief.on_play(tp.player, tp.card);
        }
    }
    // Replay current trick.
    if let Some(cur) = &state.current_trick {
        if let Some(led) = cur.plays.first().map(|tp| tp.card.suit) {
            for tp in &cur.plays {
                if tp.player != self_id && tp.card.suit != led {
                    belief.on_non_follow(tp.player, led);
                }
                belief.on_play(tp.player, tp.card);
            }
        }
    }

    // Build IntentTracker by replaying history with reconstructed hands.
    // Each opponent's hand at each point is: initial_deal - cards_they've_played.
    // We don't know their initial deal exactly — but for voluntariness checks we
    // need at least the player's hand AT THE MOMENT of the play, which we can
    // compute by summing their played cards in reverse.
    let intent_enabled = intent_enabled_runtime();
    let intent_tracker = if intent_enabled {
        Some(build_intent_tracker(state, self_id))
    } else { None };

    // Apply intent prior to belief (only if intent is enabled AND we have a partner card).
    if let Some(tracker) = &intent_tracker {
        let mut team_probs = [0.5f64; 5];
        for p in 0..5u8 {
            team_probs[p as usize] = tracker.p_on_caller_team(p);
        }
        belief.apply_intent_prior(state.partner_card, &team_probs);
    }

    // On wasm32 we cannot use a wall-clock deadline (no monotonic clock).
    // Approximate by capping iterations proportional to time_ms: ~3 iterations
    // per ms on a typical laptop in release mode. Native paths use real time.
    #[cfg(target_arch = "wasm32")]
    let max_iters = (time_ms.saturating_mul(3)).max(64);
    #[cfg(not(target_arch = "wasm32"))]
    let max_iters = 100_000u64;
    // (Hard-4B v1 budget-reallocation was +0.68pp / noise — removed so the A/B
    // isolates the v2 value-players bugfix. See docs/game_traces/...iter1.)

    // Value reflects the captured points of OUR TEAM, not just our own pile.
    // For the caller and known partners, we can identify teammates exactly from
    // the partner card. For an opponent, we maximize OUR team (= everyone NOT on
    // caller's team that we can confirm).
    let value_players = compute_value_players(state, self_id);

    let params = SearchParams {
        time_budget: Duration::from_millis(time_ms),
        min_iterations: 64,
        max_iterations: max_iters,
        self_id,
        value_players: value_players.clone(),
        ..Default::default()
    };
    let chosen = if crate::tree_ismcts::tree_ismcts_enabled() {
        crate::tree_ismcts::tree_ismcts_play(state, &belief, rng, &params)
    } else {
        ismcts_play(state, &belief, rng, &params)
    };
    let g1 = if discard_guard_enabled() {
        low_point_enemy_discard_guard(state, self_id, chosen, &value_players)
    } else { chosen };
    if follow_guard_enabled() {
        low_point_enemy_follow_guard(state, self_id, g1, &value_players)
    } else { g1 }
}

/// Sibling of `low_point_enemy_discard_guard` for the FOLLOW-suit case.
/// Fires when ISMCTS picks a point-bearing follow that loses the trick to a
/// known enemy AND a cheaper legal follow exists. Replaces with the
/// strict-cheapest legal follow that either (a) wins the trick or (b) at
/// minimum gives fewer points to the enemy.
///
/// Discovered via misplay review (G3 R5 in docs/game_traces/2026-05-27): hard-4
/// followed with 10♥ to caller's known-winning A♥ when 8♥ was legal — gave
/// 10pt to known enemy when 0pt was free.
fn low_point_enemy_follow_guard(
    state: &GameState,
    self_id: PlayerId,
    chosen: Card,
    value_players: &[PlayerId],
) -> Card {
    let Some(trick) = state.current_trick.as_ref() else { return chosen };
    let Some(led_suit) = trick.plays.first().map(|tp| tp.card.suit) else { return chosen };
    // Only applies to follows of the led suit with non-zero points.
    if chosen.suit != led_suit { return chosen; }
    if chosen.points() == 0 { return chosen; }

    let current_winner = trick_winner(trick, state.trump);
    if value_players.iter().any(|&p| p == current_winner) {
        return chosen; // ally winning — smear context, leave to ISMCTS
    }

    // Does `chosen` itself win? Simulate appending and re-checking winner.
    let beats = |card: Card| -> bool {
        let mut sim = trick.clone();
        sim.plays.push(TrickPlay { player: self_id, card });
        trick_winner(&sim, state.trump) == self_id
    };
    if beats(chosen) { return chosen; }

    let partner_card = state.partner_card;
    let legal = legal_play_indices(&state.hands[self_id as usize], Some(trick));
    let candidates: Vec<Card> = legal.iter()
        .map(|&i| state.hands[self_id as usize][i])
        .filter(|c| c.suit == led_suit)
        // Don't reveal the partner card just to be cheap (unless chosen already would).
        .filter(|c| {
            Some(*c) != partner_card || Some(chosen) == partner_card || Some(self_id) == state.caller
        })
        .collect();

    // Prefer any cheaper legal follow that WINS the trick — strict EV gain
    // (we take the trick AND donate fewer pts than chosen).
    if let Some(winning) = candidates.iter()
        .filter(|&&c| c.points() < chosen.points() && beats(c))
        .min_by_key(|c| (c.points(), c.rank))
    {
        return *winning;
    }
    // Otherwise: strict-cheapest follow that doesn't beat (saves vs chosen).
    if let Some(cheapest) = candidates.iter()
        .filter(|&&c| c.points() < chosen.points() && !beats(c))
        .min_by_key(|c| (c.points(), c.rank))
    {
        return *cheapest;
    }
    chosen
}

fn low_point_enemy_discard_guard(
    state: &GameState,
    self_id: PlayerId,
    chosen: Card,
    value_players: &[PlayerId],
) -> Card {
    let Some(trick) = state.current_trick.as_ref() else { return chosen };
    let Some(led_suit) = trick.plays.first().map(|tp| tp.card.suit) else { return chosen };
    if chosen.suit == led_suit || Some(chosen.suit) == state.trump || chosen.points() == 0 {
        return chosen;
    }

    let current_winner = trick_winner(trick, state.trump);
    if value_players.iter().any(|&p| p == current_winner) {
        return chosen;
    }

    let partner_card = state.partner_card;
    let legal = legal_play_indices(&state.hands[self_id as usize], Some(trick));
    legal.iter()
        .map(|&i| state.hands[self_id as usize][i])
        .filter(|c| c.suit != led_suit)
        .filter(|c| Some(c.suit) != state.trump)
        .filter(|c| c.points() < chosen.points())
        .filter(|c| {
            Some(*c) != partner_card || Some(chosen) == partner_card || Some(self_id) == state.caller
        })
        .min_by_key(|c| (c.points(), c.rank))
        .unwrap_or(chosen)
}

/// Intent inference is on by default on wasm32 (browser ships with it).
/// Native (arena/tune) is gated by BQ_NO_INTENT for A/B testing.
fn intent_enabled_runtime() -> bool {
    #[cfg(target_arch = "wasm32")]
    { true }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::env::var("BQ_NO_INTENT").ok().filter(|s| !s.is_empty()).is_none()
    }
}

/// Reconstruct an IntentTracker by replaying tricks, computing each player's
/// hand-before-play from played-cards history. This is O(plays seen) per move.
fn build_intent_tracker(state: &GameState, _self_id: PlayerId) -> IntentTracker {
    let Some(caller) = state.caller else {
        // No caller yet — fall back to dummy tracker, never queried for valid signals.
        return IntentTracker::new(0, crate::intent::current_intent_weights());
    };
    let mut tracker = IntentTracker::new(caller, crate::intent::current_intent_weights());
    let trump = state.trump;
    let partner_card = state.partner_card;

    // For each player, compute their TOTAL set of played cards (across all tricks
    // including the current one) AND their currently-held hand. From these we can
    // reconstruct "hand-before-play" by adding back cards they played AFTER that point.
    let mut played_in_order: Vec<Vec<Card>> = vec![Vec::new(); 5];
    for trick in &state.tricks {
        for tp in &trick.plays {
            played_in_order[tp.player as usize].push(tp.card);
        }
    }
    if let Some(cur) = &state.current_trick {
        for tp in &cur.plays {
            played_in_order[tp.player as usize].push(tp.card);
        }
    }

    // Each player's INITIAL hand = current hand + all their played cards.
    let initial_hands: Vec<Vec<Card>> = (0..5).map(|p| {
        let mut h = state.hands[p].clone();
        h.extend(played_in_order[p].iter().copied());
        h
    }).collect();

    // Now replay tricks in order. For each play, compute hand-before-play =
    // initial_hand minus the cards they've played strictly BEFORE this one.
    let mut player_play_index = [0usize; 5];
    let process_trick = |t: &Trick, tracker: &mut IntentTracker, ppi: &mut [usize; 5]| {
        let mut trick_before = Trick {
            leader: t.leader,
            plays: Vec::new(),
            winner: None,
            points: None,
        };
        for tp in &t.plays {
            let p_idx = tp.player as usize;
            let already_played_count = ppi[p_idx];
            let prior_played: Vec<Card> = played_in_order[p_idx][..already_played_count].to_vec();
            let hand_before: Vec<Card> = initial_hands[p_idx].iter()
                .copied()
                .filter(|c| !card_multiset_contains(&prior_played, *c, &initial_hands[p_idx]))
                .collect();
            // Note: card_multiset_contains is a multiset-aware "have we removed this many copies yet"
            // helper, used because cards have no instance id.
            tracker.observe_play(
                tp.player, tp.card, &hand_before, &trick_before, trump, partner_card,
            );
            trick_before.plays.push(TrickPlay { player: tp.player, card: tp.card });
            ppi[p_idx] += 1;
        }
    };

    for t in &state.tricks {
        process_trick(t, &mut tracker, &mut player_play_index);
    }
    if let Some(cur) = &state.current_trick {
        process_trick(cur, &mut tracker, &mut player_play_index);
    }

    tracker
}

/// Multiset-aware containment check: returns true if removing one copy of
/// `card` from `_initial_hand` after `prior` is already covered (i.e., the
/// initial hand has ≤ count of this card matching what's already been removed).
/// Simpler reformulation: returns true if `prior` already accounts for all
/// copies of `card` that the player initially held.
fn card_multiset_contains(prior: &[Card], card: Card, initial_hand: &[Card]) -> bool {
    let prior_count = prior.iter().filter(|c| **c == card).count();
    let initial_count = initial_hand.iter().filter(|c| **c == card).count();
    // True if we've already accounted for all the initial copies in `prior`.
    prior_count >= initial_count
}

/// Determine whose captured-points we sum when scoring a rollout's outcome.
/// For now we use: caller team if self is caller or holds partner card; else
/// opposing team (everyone NOT on caller team that we can verify).
/// Anonymous opponents fall back to a self-only value.
fn compute_value_players(state: &GameState, self_id: PlayerId) -> Vec<PlayerId> {
    let Some(caller) = state.caller else { return vec![self_id] };
    let Some(pc) = state.partner_card else { return vec![self_id] };
    let my_hand = &state.hands[self_id as usize];
    let i_hold_pc = my_hand.iter().any(|c| c.suit == pc.suit && c.rank == pc.rank);

    // Recognize partners who have already played the partner card.
    let mut revealed_partners: std::collections::HashSet<PlayerId> = std::collections::HashSet::new();
    revealed_partners.insert(caller);
    if i_hold_pc { revealed_partners.insert(self_id); }
    for trick in &state.tricks {
        for tp in &trick.plays {
            if tp.card.suit == pc.suit && tp.card.rank == pc.rank {
                revealed_partners.insert(tp.player);
            }
        }
    }
    if let Some(cur) = &state.current_trick {
        for tp in &cur.plays {
            if tp.card.suit == pc.suit && tp.card.rank == pc.rank {
                revealed_partners.insert(tp.player);
            }
        }
    }

    // BUGFIX (promoted to production 2026-05-28, found via the Hard-4B observe→fix
    // loop): the original `i_am_caller_team = self==caller || i_hold_pc` derived
    // team membership from the CURRENT hand. Once a partner PLAYS its partner card,
    // `i_hold_pc` went false → it flipped to the opposing team and spent the rest
    // of the game maximizing the ENEMIES' points (and the enemy-discard guard then
    // treated enemies as allies). Cost a contract in observation (game 895839 R10:
    // dumped A♠ to an enemy). A player who EVER held/played the partner card stays
    // on the caller's team. A/B: +1.13pp at N=1500 mirror. See docs/game_traces/
    // 2026-05-28__d850ab2__hard4b-iter2/review.md.
    let i_am_caller_team = self_id == caller || i_hold_pc || revealed_partners.contains(&self_id);

    if i_am_caller_team {
        revealed_partners.insert(self_id);
        revealed_partners.into_iter().collect()
    } else {
        // I'm on the opposing team. Sum captured points for everyone not in
        // revealed_partners. (Unrevealed partners may sneak into the sum, but
        // until they reveal we cannot distinguish them.)
        (0..5u8).filter(|p| !revealed_partners.contains(p)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game};
    use bq_engine::rng::from_seed;
    use bq_engine::rules::legal_play_indices;
    use bq_engine::types::Phase;

    #[test]
    fn hard4_play_legal_for_full_game() {
        let mut rng = from_seed(42);
        let mut state = new_game(&mut rng, 0);
        let first = state.next_to_act;
        apply_bid(&mut state, first, 150);
        while state.phase == Phase::Bidding {
            let p = state.next_to_act;
            apply_pass(&mut state, p);
        }
        let caller = state.caller.unwrap();
        let (trump, pc) = hard4_declare(&state, caller);
        apply_declare(&mut state, trump, pc);

        let mut play_rng = from_seed(99);
        while state.phase == Phase::Playing {
            let p = state.next_to_act;
            let card = hard4_play(&state, p, 5, &mut play_rng); // tiny budget for speed
            // Validate legality and execute.
            let trick = state.current_trick.as_ref().unwrap();
            let legal = legal_play_indices(&state.hands[p as usize], Some(trick));
            let legal_cards: Vec<Card> = legal.iter().map(|&i| state.hands[p as usize][i]).collect();
            assert!(legal_cards.contains(&card), "hard4_play returned illegal card {:?}", card);
            let idx = state.hands[p as usize].iter().position(|c| *c == card).unwrap();
            apply_play(&mut state, p, idx);
        }
        assert_eq!(state.phase, Phase::Done);
        assert_eq!(state.captured_points.iter().sum::<u16>(), 300);
    }

    #[test]
    fn discard_guard_swaps_point_card_on_enemy_won_trick() {
        let state = GameState {
            phase: Phase::Playing,
            hands: vec![
                vec![Card { suit: Suit::D, rank: 14 }, Card { suit: Suit::C, rank: 9 }],
                vec![],
                vec![],
                vec![],
                vec![],
            ],
            bids: vec![],
            caller: Some(1),
            winning_bid: Some(200),
            trump: Some(Suit::S),
            partner_card: Some(Card { suit: Suit::H, rank: 14 }),
            tricks: vec![],
            current_trick: Some(Trick {
                leader: 1,
                plays: vec![TrickPlay { player: 1, card: Card { suit: Suit::H, rank: 13 } }],
                winner: None,
                points: None,
            }),
            next_to_act: 0,
            captured_points: vec![0; 5],
            passed: vec![false; 5],
        };
        let chosen = Card { suit: Suit::D, rank: 14 };
        let guarded = low_point_enemy_discard_guard(&state, 0, chosen, &[0, 2, 3, 4]);
        assert_eq!(guarded, Card { suit: Suit::C, rank: 9 });
    }

    #[test]
    fn discard_guard_preserves_smear_to_ally_won_trick() {
        let state = GameState {
            phase: Phase::Playing,
            hands: vec![
                vec![Card { suit: Suit::D, rank: 14 }, Card { suit: Suit::C, rank: 9 }],
                vec![],
                vec![],
                vec![],
                vec![],
            ],
            bids: vec![],
            caller: Some(1),
            winning_bid: Some(200),
            trump: Some(Suit::S),
            partner_card: Some(Card { suit: Suit::H, rank: 14 }),
            tricks: vec![],
            current_trick: Some(Trick {
                leader: 1,
                plays: vec![TrickPlay { player: 1, card: Card { suit: Suit::H, rank: 13 } }],
                winner: None,
                points: None,
            }),
            next_to_act: 0,
            captured_points: vec![0; 5],
            passed: vec![false; 5],
        };
        let chosen = Card { suit: Suit::D, rank: 14 };
        let guarded = low_point_enemy_discard_guard(&state, 0, chosen, &[0, 1]);
        assert_eq!(guarded, chosen);
    }

    #[test]
    fn follow_guard_swaps_point_follow_for_cheaper_when_cant_beat() {
        // G3 R5 misplay: P1 led A♥. P4 has hearts {Q♥(0pt) 10♥(10pt) 8♥(0pt) 5♥(5pt)}.
        // ISMCTS chose 10♥ (10pt to enemy P1). Guard should swap to 8♥ (0pt).
        let state = GameState {
            phase: Phase::Playing,
            hands: vec![
                vec![
                    Card { suit: Suit::H, rank: 12 }, // Q♥ 0pt
                    Card { suit: Suit::H, rank: 10 }, // 10♥ 10pt (chosen)
                    Card { suit: Suit::H, rank: 8 },  // 8♥ 0pt
                    Card { suit: Suit::H, rank: 5 },  // 5♥ 5pt
                ],
                vec![], vec![], vec![], vec![],
            ],
            bids: vec![],
            caller: Some(1),
            winning_bid: Some(235),
            trump: Some(Suit::S),
            partner_card: Some(Card { suit: Suit::D, rank: 14 }),
            tricks: vec![],
            current_trick: Some(Trick {
                leader: 1,
                plays: vec![TrickPlay { player: 1, card: Card { suit: Suit::H, rank: 14 } }],
                winner: None,
                points: None,
            }),
            next_to_act: 0,
            captured_points: vec![0; 5],
            passed: vec![false; 5],
        };
        let chosen = Card { suit: Suit::H, rank: 10 };
        let guarded = low_point_enemy_follow_guard(&state, 0, chosen, &[0, 2, 3, 4]);
        assert_eq!(guarded, Card { suit: Suit::H, rank: 8 });
    }

    #[test]
    fn follow_guard_preserves_winning_follow() {
        // P1 led 8♥. P4 has {Q♥, 10♥}. ISMCTS picks Q♥ (wins trick). Don't override.
        let state = GameState {
            phase: Phase::Playing,
            hands: vec![
                vec![
                    Card { suit: Suit::H, rank: 12 }, // Q♥ — wins
                    Card { suit: Suit::H, rank: 10 }, // 10♥ — also wins, cheaper... wait 10♥ has 10pt
                ],
                vec![], vec![], vec![], vec![],
            ],
            bids: vec![],
            caller: Some(1),
            winning_bid: Some(200),
            trump: Some(Suit::S),
            partner_card: Some(Card { suit: Suit::D, rank: 14 }),
            tricks: vec![],
            current_trick: Some(Trick {
                leader: 1,
                plays: vec![TrickPlay { player: 1, card: Card { suit: Suit::H, rank: 8 } }],
                winner: None,
                points: None,
            }),
            next_to_act: 0,
            captured_points: vec![0; 5],
            passed: vec![false; 5],
        };
        let chosen = Card { suit: Suit::H, rank: 12 };
        let guarded = low_point_enemy_follow_guard(&state, 0, chosen, &[0, 2, 3, 4]);
        // Q♥ wins. Don't touch (cheaper 10♥ also wins but actually has 10pt > Q♥'s 0pt — not cheaper).
        assert_eq!(guarded, chosen);
    }
}
