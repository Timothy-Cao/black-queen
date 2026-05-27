# Hard-4 Session 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In one 4-hour session, ship a playable `hard-4` AI personality that uses Information-Set MCTS with a hard-constraint belief tracker, implemented in Rust and shipped as WASM to the existing browser app.

**Architecture:** New `rust/` Cargo workspace with four crates: `bq-engine` (port of TS reducer), `bq-ai` (belief tracker + ISMCTS + Hard-4 entry points), `bq-wasm` (wasm-bindgen JSON wrapper), `bq-cli` (native binary for smoke + arena). Browser-side `hard4Driver.ts` loads WASM and dispatches AI calls; existing TS engine, components, and Hard / Hard-2 / Hard-3 personalities are untouched.

**Tech Stack:** Rust 1.74+, wasm-pack, wasm-bindgen, Vite 8, React 19, TypeScript, existing TS toolchain.

**Spec:** [docs/superpowers/specs/2026-05-26-hard-4-ai-design.md](../specs/2026-05-26-hard-4-ai-design.md)

**Honest scope caveat:** This is ambitious for 4 hours. The plan is sequenced so that even if we stop early after Task 14 (WASM build), we have a working Rust engine + ISMCTS validated via the native CLI; tasks 15–22 are browser integration that can be completed in a short follow-up session if we run out of time.

---

## File structure

**New Rust workspace (`rust/`)**

```
rust/
  Cargo.toml                        # workspace manifest
  rust-toolchain.toml               # pin stable
  crates/
    bq-engine/
      Cargo.toml
      src/
        lib.rs                      # re-exports
        types.rs                    # Card, Suit, Rank, PlayerId, GamePhase, GameState
        rng.rs                      # seeded RNG wrapper (rand_xoshiro)
        deck.rs                     # build_deck, shuffle_seeded, deal_hands
        rules.rs                    # legal_plays, trick_winner
        engine.rs                   # apply_bid, apply_pass, apply_declare, apply_play, collect_trick
    bq-ai/
      Cargo.toml
      src/
        lib.rs
        belief.rs                   # BeliefState + hard-constraint updates + sampler
        rollout.rs                  # rollout_random_legal
        ismcts.rs                   # Node, search, UCB1
        hard4.rs                    # hard4_bid / hard4_declare / hard4_play entry points
    bq-wasm/
      Cargo.toml
      src/lib.rs                    # wasm-bindgen JSON wrappers
    bq-cli/
      Cargo.toml
      src/main.rs                   # subcommands: smoke, arena
```

**Modified or added TypeScript**

```
src/game/hard4Driver.ts             # NEW: loads WASM, exposes hard4Play/Bid/Declare
src/game/wasm/                      # NEW: wasm-pack output (committed; small)
src/game/ai.ts                      # MODIFY: add 'hard-4' dispatch
src/game/types.ts                   # MODIFY: extend AIPersonality
src/components/Lobby.tsx            # MODIFY: add Hard-4 option
main.tsx                            # MODIFY: import + warm WASM at startup
package.json                        # MODIFY: add "build:wasm" script
.gitignore                          # MODIFY: rust/target/
vite.config.ts                      # (only modify if WASM loading needs explicit plugin)
```

**File responsibilities (single-purpose rule):**
- `bq-engine` is pure rules. No randomness except via explicit RNG argument. No I/O.
- `bq-ai::belief` is the only place hand-distribution state lives.
- `bq-ai::ismcts` is the search algorithm; calls into belief + rollout.
- `bq-ai::hard4` is the only public surface for "decide a move at game phase X." Everything else is internal.
- `bq-wasm` is glue only: JSON in, JSON out, no game logic.
- `hard4Driver.ts` is glue only: serializes GameState to JSON, calls WASM, parses response.

---

## Task 0: Pre-flight — install Rust toolchain

**Files:** none (system install only).

- [ ] **Step 1: Check if Rust is already installed**

Run: `command -v cargo && cargo --version`
Expected: prints a cargo version, or empty output if missing.

- [ ] **Step 2: If missing, install rustup non-interactively**

Run (only if Step 1 was empty):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
source "$HOME/.cargo/env"
```

Expected: rustup installs, `cargo --version` now works.

- [ ] **Step 3: Install wasm32 target**

Run: `rustup target add wasm32-unknown-unknown`
Expected: "info: downloading component" then "info: installing component". Idempotent if already present.

- [ ] **Step 4: Install wasm-pack**

Run: `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`
Expected: installs `wasm-pack` to `~/.cargo/bin/wasm-pack`. Confirm with `wasm-pack --version`.

- [ ] **Step 5: Commit a pre-flight checklist file (no code yet, just toolchain version pin)**

Create `rust/rust-toolchain.toml`:
```toml
[toolchain]
channel = "stable"
targets = ["wasm32-unknown-unknown"]
```

Run:
```bash
git add rust/rust-toolchain.toml
git commit -m "chore(hard-4): pin Rust toolchain (Session 1 pre-flight)"
```

---

## Task 1: Rust workspace scaffolding

**Files:**
- Create: `rust/Cargo.toml`
- Create: `rust/crates/bq-engine/Cargo.toml`
- Create: `rust/crates/bq-engine/src/lib.rs`
- Create: `rust/crates/bq-ai/Cargo.toml`
- Create: `rust/crates/bq-ai/src/lib.rs`
- Create: `rust/crates/bq-wasm/Cargo.toml`
- Create: `rust/crates/bq-wasm/src/lib.rs`
- Create: `rust/crates/bq-cli/Cargo.toml`
- Create: `rust/crates/bq-cli/src/main.rs`
- Modify: `.gitignore`

- [ ] **Step 1: Create workspace manifest**

Create `rust/Cargo.toml`:
```toml
[workspace]
resolver = "2"
members = ["crates/bq-engine", "crates/bq-ai", "crates/bq-wasm", "crates/bq-cli"]

[workspace.package]
version = "0.1.0"
edition = "2021"
rust-version = "1.74"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rand = "0.8"
rand_xoshiro = "0.6"
```

- [ ] **Step 2: Create bq-engine crate**

Create `rust/crates/bq-engine/Cargo.toml`:
```toml
[package]
name = "bq-engine"
version.workspace = true
edition.workspace = true

[dependencies]
serde = { workspace = true }
rand = { workspace = true }
rand_xoshiro = { workspace = true }
```

Create `rust/crates/bq-engine/src/lib.rs`:
```rust
pub mod types;
pub mod rng;
pub mod deck;
pub mod rules;
pub mod engine;

pub use types::*;
```

Create empty stubs:
- `rust/crates/bq-engine/src/types.rs` — `// types`
- `rust/crates/bq-engine/src/rng.rs` — `// rng`
- `rust/crates/bq-engine/src/deck.rs` — `// deck`
- `rust/crates/bq-engine/src/rules.rs` — `// rules`
- `rust/crates/bq-engine/src/engine.rs` — `// engine`

- [ ] **Step 3: Create bq-ai crate**

Create `rust/crates/bq-ai/Cargo.toml`:
```toml
[package]
name = "bq-ai"
version.workspace = true
edition.workspace = true

[dependencies]
bq-engine = { path = "../bq-engine" }
serde = { workspace = true }
rand = { workspace = true }
rand_xoshiro = { workspace = true }
```

Create `rust/crates/bq-ai/src/lib.rs`:
```rust
pub mod belief;
pub mod rollout;
pub mod ismcts;
pub mod hard4;
```

Create empty stubs: `belief.rs`, `rollout.rs`, `ismcts.rs`, `hard4.rs` each containing `// stub`.

- [ ] **Step 4: Create bq-wasm crate**

Create `rust/crates/bq-wasm/Cargo.toml`:
```toml
[package]
name = "bq-wasm"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib"]

[dependencies]
bq-engine = { path = "../bq-engine" }
bq-ai = { path = "../bq-ai" }
wasm-bindgen = "0.2"
serde = { workspace = true }
serde_json = { workspace = true }
serde-wasm-bindgen = "0.6"
```

Create `rust/crates/bq-wasm/src/lib.rs`:
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
```

- [ ] **Step 5: Create bq-cli crate**

Create `rust/crates/bq-cli/Cargo.toml`:
```toml
[package]
name = "bq-cli"
version.workspace = true
edition.workspace = true

[dependencies]
bq-engine = { path = "../bq-engine" }
bq-ai = { path = "../bq-ai" }
serde_json = { workspace = true }
```

Create `rust/crates/bq-cli/src/main.rs`:
```rust
fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("smoke") => println!("smoke (stub)"),
        Some("arena") => println!("arena (stub)"),
        _ => {
            eprintln!("usage: bq-cli {{smoke|arena}}");
            std::process::exit(2);
        }
    }
}
```

- [ ] **Step 6: Add Rust artifacts to .gitignore**

Append to `.gitignore`:
```
# Rust
rust/target/
**/*.rs.bk
Cargo.lock
```

(Note: workspace Cargo.lock for a binary workspace is normally committed, but for this internal-only workspace it's lower-noise to ignore. Revisit later.)

- [ ] **Step 7: Build the workspace**

Run: `cd rust && cargo build`
Expected: builds all four crates with warnings about unused empty modules, no errors. First build downloads dependencies (1–3 min).

- [ ] **Step 8: Commit**

```bash
git add rust/ .gitignore
git commit -m "feat(hard-4): scaffold Rust workspace (bq-engine, bq-ai, bq-wasm, bq-cli)"
```

---

## Task 2: bq-engine — types

**Files:**
- Modify: `rust/crates/bq-engine/src/types.rs`
- Test: inline `#[cfg(test)]` module

Reference: `src/game/types.ts` and `src/game/deck.ts` for the source TS definitions.

- [ ] **Step 1: Define core types**

Write `rust/crates/bq-engine/src/types.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Suit { Spades, Hearts, Diamonds, Clubs }

impl Suit {
    pub const ALL: [Suit; 4] = [Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs];
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub enum Rank { Five = 5, Seven = 7, Eight = 8, Nine = 9, Ten = 10, Jack = 11, Queen = 12, King = 13, Ace = 14 }

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Card { pub suit: Suit, pub rank: Rank }

impl Card {
    pub fn points(&self) -> u16 {
        match (self.suit, self.rank) {
            (Suit::Spades, Rank::Queen) => 30,
            (_, Rank::Ace) => 15,
            (_, Rank::Ten) => 10,
            (_, Rank::Five) => 5,
            _ => 0,
        }
    }
}

pub type PlayerId = u8; // 0..5

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase { Bidding, Declare, Play, Done }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BidEntry { pub player: PlayerId, pub amount: Option<u16> } // None = pass

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Declaration { pub trump: Suit, pub partner_card: Card }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trick {
    pub leader: PlayerId,
    pub plays: Vec<(PlayerId, Card)>,
    pub winner: Option<PlayerId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameState {
    pub phase: Phase,
    pub hands: Vec<Vec<Card>>, // hands[player_id] = remaining cards
    pub bids: Vec<BidEntry>,
    pub caller: Option<PlayerId>,
    pub winning_bid: Option<u16>,
    pub declaration: Option<Declaration>,
    pub tricks: Vec<Trick>,
    pub current_trick: Option<Trick>,
    pub next_to_act: PlayerId,
    pub captured_points: Vec<u16>, // per player
    pub passed: Vec<bool>, // per player
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn point_card_values_match_rules() {
        assert_eq!(Card { suit: Suit::Spades,   rank: Rank::Queen }.points(), 30);
        assert_eq!(Card { suit: Suit::Hearts,   rank: Rank::Ace   }.points(), 15);
        assert_eq!(Card { suit: Suit::Diamonds, rank: Rank::Ten   }.points(), 10);
        assert_eq!(Card { suit: Suit::Clubs,    rank: Rank::Five  }.points(),  5);
        assert_eq!(Card { suit: Suit::Spades,   rank: Rank::Jack  }.points(),  0);
    }
}
```

- [ ] **Step 2: Run test**

Run: `cd rust && cargo test -p bq-engine types::tests`
Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-engine/src/types.rs
git commit -m "feat(bq-engine): core types (Card, Suit, Rank, GameState)"
```

---

## Task 3: bq-engine — RNG + deck

**Files:**
- Modify: `rust/crates/bq-engine/src/rng.rs`
- Modify: `rust/crates/bq-engine/src/deck.rs`

Reference: `src/game/deck.ts` for the 65-card deck composition.

- [ ] **Step 1: Implement seeded RNG**

Write `rust/crates/bq-engine/src/rng.rs`:
```rust
use rand_xoshiro::Xoshiro256PlusPlus;
use rand_xoshiro::rand_core::SeedableRng;

pub type GameRng = Xoshiro256PlusPlus;

pub fn from_seed(seed: u64) -> GameRng {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}
```

- [ ] **Step 2: Write failing deck test**

Write `rust/crates/bq-engine/src/deck.rs`:
```rust
use crate::rng::GameRng;
use crate::types::{Card, Rank, Suit};
use rand::seq::SliceRandom;

/// 65-card Black Queen deck: two standard decks minus 2/3/4/6, plus only one 7♠
/// (drop the second 7♠ and all other 7s).
pub fn build_deck() -> Vec<Card> {
    let ranks_full = [Rank::Five, Rank::Eight, Rank::Nine, Rank::Ten, Rank::Jack, Rank::Queen, Rank::King, Rank::Ace];
    let mut deck = Vec::with_capacity(65);
    for _ in 0..2 {
        for &suit in &Suit::ALL {
            for &rank in &ranks_full {
                deck.push(Card { suit, rank });
            }
        }
    }
    // Add exactly one 7♠
    deck.push(Card { suit: Suit::Spades, rank: Rank::Seven });
    debug_assert_eq!(deck.len(), 65);
    deck
}

pub fn shuffle_seeded(deck: &mut [Card], rng: &mut GameRng) {
    deck.shuffle(rng);
}

pub fn deal_hands(deck: Vec<Card>) -> Vec<Vec<Card>> {
    assert_eq!(deck.len(), 65);
    let mut hands = vec![Vec::with_capacity(13); 5];
    for (i, card) in deck.into_iter().enumerate() {
        hands[i % 5].push(card);
    }
    hands
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::from_seed;

    #[test]
    fn deck_has_65_cards() {
        assert_eq!(build_deck().len(), 65);
    }

    #[test]
    fn deck_total_points_is_300() {
        let total: u16 = build_deck().iter().map(|c| c.points()).sum();
        assert_eq!(total, 300);
    }

    #[test]
    fn exactly_one_seven_of_spades_no_other_sevens() {
        let deck = build_deck();
        let sevens: Vec<_> = deck.iter().filter(|c| c.rank == Rank::Seven).collect();
        assert_eq!(sevens.len(), 1);
        assert_eq!(sevens[0].suit, Suit::Spades);
    }

    #[test]
    fn shuffle_is_deterministic_per_seed() {
        let mut a = build_deck();
        let mut b = build_deck();
        shuffle_seeded(&mut a, &mut from_seed(42));
        shuffle_seeded(&mut b, &mut from_seed(42));
        assert_eq!(a, b);
    }

    #[test]
    fn deal_gives_each_player_13() {
        let hands = deal_hands(build_deck());
        assert_eq!(hands.len(), 5);
        for h in &hands {
            assert_eq!(h.len(), 13);
        }
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd rust && cargo test -p bq-engine`
Expected: 6 tests pass (1 types + 5 deck).

- [ ] **Step 4: Commit**

```bash
git add rust/crates/bq-engine/src/rng.rs rust/crates/bq-engine/src/deck.rs
git commit -m "feat(bq-engine): seeded RNG + 65-card deck builder + dealer"
```

---

## Task 4: bq-engine — rules (legal_plays + trick_winner)

**Files:**
- Modify: `rust/crates/bq-engine/src/rules.rs`

Reference: `src/game/rules.ts`. Follow-suit if able; otherwise any card. Trick winner = highest of led suit, unless trump played in which case highest trump.

- [ ] **Step 1: Implement legal_plays + trick_winner with tests**

Write `rust/crates/bq-engine/src/rules.rs`:
```rust
use crate::types::{Card, PlayerId, Suit, Trick};

/// Returns indices into `hand` that are legal plays.
pub fn legal_play_indices(hand: &[Card], current_trick: &Trick) -> Vec<usize> {
    if current_trick.plays.is_empty() {
        // Leading: any card.
        return (0..hand.len()).collect();
    }
    let led_suit = current_trick.plays[0].1.suit;
    let following: Vec<usize> = hand.iter().enumerate()
        .filter(|(_, c)| c.suit == led_suit)
        .map(|(i, _)| i)
        .collect();
    if following.is_empty() {
        (0..hand.len()).collect()
    } else {
        following
    }
}

/// Determines the winner of a completed trick.
pub fn trick_winner(trick: &Trick, trump: Suit) -> PlayerId {
    debug_assert!(!trick.plays.is_empty());
    let led_suit = trick.plays[0].1.suit;
    // Highest trump beats all non-trumps; if no trump, highest of led suit.
    let trumps: Vec<_> = trick.plays.iter().filter(|(_, c)| c.suit == trump).collect();
    let pool = if !trumps.is_empty() { trumps } else {
        trick.plays.iter().filter(|(_, c)| c.suit == led_suit).collect()
    };
    pool.into_iter().max_by_key(|(_, c)| c.rank as u8).unwrap().0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Rank, Trick};

    fn c(s: Suit, r: Rank) -> Card { Card { suit: s, rank: r } }

    #[test]
    fn leading_allows_any_card() {
        let hand = vec![c(Suit::Spades, Rank::Ten), c(Suit::Hearts, Rank::King)];
        let trick = Trick { leader: 0, plays: vec![], winner: None };
        assert_eq!(legal_play_indices(&hand, &trick), vec![0, 1]);
    }

    #[test]
    fn must_follow_suit_if_able() {
        let hand = vec![c(Suit::Spades, Rank::Ten), c(Suit::Hearts, Rank::King)];
        let trick = Trick { leader: 1, plays: vec![(1, c(Suit::Hearts, Rank::Eight))], winner: None };
        assert_eq!(legal_play_indices(&hand, &trick), vec![1]);
    }

    #[test]
    fn may_play_anything_when_void_in_led_suit() {
        let hand = vec![c(Suit::Spades, Rank::Ten), c(Suit::Hearts, Rank::King)];
        let trick = Trick { leader: 1, plays: vec![(1, c(Suit::Clubs, Rank::Eight))], winner: None };
        assert_eq!(legal_play_indices(&hand, &trick), vec![0, 1]);
    }

    #[test]
    fn trick_winner_highest_of_led_when_no_trump() {
        let trick = Trick {
            leader: 0,
            plays: vec![
                (0, c(Suit::Hearts, Rank::Eight)),
                (1, c(Suit::Hearts, Rank::Ace)),
                (2, c(Suit::Clubs,  Rank::King)),  // off-suit, ignored
                (3, c(Suit::Hearts, Rank::Ten)),
                (4, c(Suit::Hearts, Rank::Jack)),
            ],
            winner: None,
        };
        assert_eq!(trick_winner(&trick, Suit::Spades), 1);
    }

    #[test]
    fn highest_trump_wins_over_higher_led_suit() {
        let trick = Trick {
            leader: 0,
            plays: vec![
                (0, c(Suit::Hearts, Rank::Ace)),  // strong led
                (1, c(Suit::Spades, Rank::Five)), // weak trump
                (2, c(Suit::Hearts, Rank::King)),
                (3, c(Suit::Spades, Rank::Eight)), // higher trump
                (4, c(Suit::Hearts, Rank::Queen)),
            ],
            winner: None,
        };
        assert_eq!(trick_winner(&trick, Suit::Spades), 3);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd rust && cargo test -p bq-engine rules`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-engine/src/rules.rs
git commit -m "feat(bq-engine): legal_play_indices + trick_winner with rules tests"
```

---

## Task 5: bq-engine — engine state transitions

**Files:**
- Modify: `rust/crates/bq-engine/src/engine.rs`

Reference: `src/game/engine.ts` for `applyBid` / `applyPass` / `applyDeclare` / `applyPlay` / `collectTrick`.

- [ ] **Step 1: Implement state-transition functions with tests**

Write `rust/crates/bq-engine/src/engine.rs`:
```rust
use crate::deck::{build_deck, deal_hands, shuffle_seeded};
use crate::rng::GameRng;
use crate::rules::{legal_play_indices, trick_winner};
use crate::types::{BidEntry, Card, Declaration, GameState, Phase, PlayerId, Suit, Trick};

pub fn new_game(rng: &mut GameRng, first_to_act: PlayerId) -> GameState {
    let mut deck = build_deck();
    shuffle_seeded(&mut deck, rng);
    let hands = deal_hands(deck);
    GameState {
        phase: Phase::Bidding,
        hands,
        bids: Vec::new(),
        caller: None,
        winning_bid: None,
        declaration: None,
        tricks: Vec::new(),
        current_trick: None,
        next_to_act: first_to_act,
        captured_points: vec![0; 5],
        passed: vec![false; 5],
    }
}

fn next_active_bidder(passed: &[bool], from: PlayerId) -> Option<PlayerId> {
    for offset in 1..=5 {
        let p = ((from as usize + offset) % 5) as PlayerId;
        if !passed[p as usize] { return Some(p); }
    }
    None
}

pub fn apply_bid(state: &mut GameState, player: PlayerId, amount: u16) {
    debug_assert_eq!(state.phase, Phase::Bidding);
    debug_assert_eq!(state.next_to_act, player);
    debug_assert!(!state.passed[player as usize]);
    debug_assert!((150..=300).contains(&amount) && amount % 5 == 0);
    if let Some(prev) = state.winning_bid {
        debug_assert!(amount > prev);
    }
    state.bids.push(BidEntry { player, amount: Some(amount) });
    state.winning_bid = Some(amount);
    state.caller = Some(player);
    advance_after_bid_action(state);
}

pub fn apply_pass(state: &mut GameState, player: PlayerId) {
    debug_assert_eq!(state.phase, Phase::Bidding);
    debug_assert_eq!(state.next_to_act, player);
    state.bids.push(BidEntry { player, amount: None });
    state.passed[player as usize] = true;
    advance_after_bid_action(state);
}

fn advance_after_bid_action(state: &mut GameState) {
    let active_count = state.passed.iter().filter(|p| !**p).count();
    if active_count <= 1 {
        // Bidding ends. If exactly one active, they're the caller (last raise wins if any).
        // If everyone passed (shouldn't happen with min-bid rules), force first player as caller.
        if state.caller.is_none() {
            state.caller = Some(0);
            state.winning_bid = Some(150);
        }
        state.phase = Phase::Declare;
        state.next_to_act = state.caller.unwrap();
        return;
    }
    state.next_to_act = next_active_bidder(&state.passed, state.next_to_act).unwrap();
}

pub fn apply_declare(state: &mut GameState, trump: Suit, partner_card: Card) {
    debug_assert_eq!(state.phase, Phase::Declare);
    let caller = state.caller.expect("caller must exist in declare");
    debug_assert!(!state.hands[caller as usize].contains(&partner_card),
        "caller may not declare a partner card they hold");
    state.declaration = Some(Declaration { trump, partner_card });
    state.phase = Phase::Play;
    state.current_trick = Some(Trick { leader: caller, plays: Vec::new(), winner: None });
    state.next_to_act = caller;
}

pub fn apply_play(state: &mut GameState, player: PlayerId, card_index: usize) {
    debug_assert_eq!(state.phase, Phase::Play);
    debug_assert_eq!(state.next_to_act, player);
    let trick = state.current_trick.as_mut().expect("must have current trick");
    let legal = legal_play_indices(&state.hands[player as usize], trick);
    debug_assert!(legal.contains(&card_index), "illegal play attempted");
    let card = state.hands[player as usize].remove(card_index);
    trick.plays.push((player, card));
    if trick.plays.len() == 5 {
        collect_trick(state);
    } else {
        state.next_to_act = (player + 1) % 5;
    }
}

pub fn collect_trick(state: &mut GameState) {
    let trump = state.declaration.as_ref().expect("declared").trump;
    let trick = state.current_trick.take().expect("trick");
    let winner = trick_winner(&trick, trump);
    let pts: u16 = trick.plays.iter().map(|(_, c)| c.points()).sum();
    state.captured_points[winner as usize] += pts;
    let mut completed = trick;
    completed.winner = Some(winner);
    state.tricks.push(completed);
    if state.hands.iter().all(|h| h.is_empty()) {
        state.phase = Phase::Done;
        return;
    }
    state.current_trick = Some(Trick { leader: winner, plays: Vec::new(), winner: None });
    state.next_to_act = winner;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::from_seed;

    #[test]
    fn new_game_deals_full_hands_in_bidding_phase() {
        let s = new_game(&mut from_seed(7), 0);
        assert_eq!(s.phase, Phase::Bidding);
        assert_eq!(s.hands.iter().map(|h| h.len()).sum::<usize>(), 65);
    }

    #[test]
    fn full_random_game_scores_to_300() {
        use crate::rules::legal_play_indices;
        use rand::seq::SliceRandom;
        use rand::Rng;
        let mut rng = from_seed(123);
        let mut state = new_game(&mut rng, 0);
        // Everyone passes except player 0 who bids 150.
        apply_bid(&mut state, 0, 150);
        while state.phase == Phase::Bidding {
            let p = state.next_to_act;
            apply_pass(&mut state, p);
        }
        // Caller declares spades + a card they don't hold.
        let caller = state.caller.unwrap() as usize;
        let owned: std::collections::HashSet<_> = state.hands[caller].iter().copied().collect();
        let partner_card = *crate::deck::build_deck().iter()
            .find(|c| !owned.contains(c)).unwrap();
        apply_declare(&mut state, Suit::Spades, partner_card);

        // Play random legal moves until done.
        while state.phase == Phase::Play {
            let p = state.next_to_act;
            let trick = state.current_trick.as_ref().unwrap();
            let legal = legal_play_indices(&state.hands[p as usize], trick);
            let idx = *legal.choose(&mut rng).unwrap();
            apply_play(&mut state, p, idx);
        }
        assert_eq!(state.phase, Phase::Done);
        let total: u16 = state.captured_points.iter().sum();
        assert_eq!(total, 300);
        assert_eq!(state.tricks.len(), 13);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd rust && cargo test -p bq-engine`
Expected: all engine + earlier tests pass (~10 tests).

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-engine/src/engine.rs
git commit -m "feat(bq-engine): bid/pass/declare/play/collect_trick state transitions"
```

---

## Task 6: bq-cli — smoke subcommand

**Files:**
- Modify: `rust/crates/bq-cli/src/main.rs`

- [ ] **Step 1: Replace stub with smoke that runs N random games**

Write `rust/crates/bq-cli/src/main.rs`:
```rust
use bq_engine::deck::build_deck;
use bq_engine::engine::{apply_bid, apply_declare, apply_pass, apply_play, new_game};
use bq_engine::rng::from_seed;
use bq_engine::rules::legal_play_indices;
use bq_engine::types::{Phase, Suit};
use rand::seq::SliceRandom;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("smoke") => {
            let n: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1000);
            smoke(n);
        }
        _ => {
            eprintln!("usage: bq-cli smoke [N]");
            std::process::exit(2);
        }
    }
}

fn smoke(n: u64) {
    let mut failures = 0u64;
    for seed in 0..n {
        if !play_one_random_game(seed) {
            failures += 1;
            eprintln!("seed {} failed invariants", seed);
        }
    }
    println!("smoke: {} games, {} failures", n, failures);
    if failures > 0 { std::process::exit(1); }
}

fn play_one_random_game(seed: u64) -> bool {
    let mut rng = from_seed(seed);
    let mut state = new_game(&mut rng, (seed % 5) as u8);
    apply_bid(&mut state, state.next_to_act, 150);
    while state.phase == Phase::Bidding {
        let p = state.next_to_act;
        apply_pass(&mut state, p);
    }
    let caller = state.caller.unwrap() as usize;
    let owned: std::collections::HashSet<_> = state.hands[caller].iter().copied().collect();
    let partner_card = *build_deck().iter().find(|c| !owned.contains(c)).unwrap();
    apply_declare(&mut state, Suit::Spades, partner_card);
    while state.phase == Phase::Play {
        let p = state.next_to_act;
        let trick = state.current_trick.as_ref().unwrap();
        let legal = legal_play_indices(&state.hands[p as usize], trick);
        let idx = *legal.choose(&mut rng).unwrap();
        apply_play(&mut state, p, idx);
    }
    let total: u16 = state.captured_points.iter().sum();
    state.phase == Phase::Done && total == 300 && state.tricks.len() == 13
}
```

- [ ] **Step 2: Build and run**

Run: `cd rust && cargo run --release -p bq-cli -- smoke 5000`
Expected: `smoke: 5000 games, 0 failures` in a few seconds.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-cli/src/main.rs
git commit -m "feat(bq-cli): smoke subcommand — N random games, invariant checks"
```

---

## Task 7: bq-ai — belief tracker (hard constraints)

**Files:**
- Modify: `rust/crates/bq-ai/src/belief.rs`

- [ ] **Step 1: Implement BeliefState + hard-constraint updates with tests**

Write `rust/crates/bq-ai/src/belief.rs`:
```rust
use bq_engine::types::{Card, PlayerId, Suit};
use std::collections::HashSet;

/// For each unseen (by self) card, tracks a probability vector over which
/// of the other players holds it. Index 0..N_PLAYERS - 1 corresponds to opponent slots.
#[derive(Clone, Debug)]
pub struct BeliefState {
    /// `self_id` is the AI player whose POV this belief represents.
    pub self_id: PlayerId,
    /// All cards not in self's hand and not yet played.
    pub unseen: HashSet<Card>,
    /// For each opponent: cards they cannot hold (hard constraint).
    /// Index by absolute PlayerId; self's entry is unused.
    pub cannot_hold: Vec<HashSet<Card>>,
    /// For each opponent: number of cards remaining in their hand.
    pub hand_sizes: Vec<usize>,
}

impl BeliefState {
    pub fn new(self_id: PlayerId, self_hand: &[Card], all_cards: &[Card]) -> Self {
        let self_set: HashSet<Card> = self_hand.iter().copied().collect();
        let unseen: HashSet<Card> = all_cards.iter().copied().filter(|c| !self_set.contains(c)).collect();
        let mut cannot_hold = vec![HashSet::new(); 5];
        // Self's "cannot hold" = all unseen cards (we know our hand exactly).
        cannot_hold[self_id as usize] = unseen.clone();
        BeliefState { self_id, unseen, cannot_hold, hand_sizes: vec![13; 5] }
    }

    /// Record a played card (now off the board entirely).
    pub fn on_play(&mut self, player: PlayerId, card: Card) {
        self.unseen.remove(&card);
        for set in self.cannot_hold.iter_mut() {
            set.remove(&card);
        }
        if (player as usize) < self.hand_sizes.len() {
            self.hand_sizes[player as usize] = self.hand_sizes[player as usize].saturating_sub(1);
        }
    }

    /// Record that `player` failed to follow `led_suit` — they hold no cards of that suit.
    pub fn on_non_follow(&mut self, player: PlayerId, led_suit: Suit) {
        for c in self.unseen.iter().filter(|c| c.suit == led_suit) {
            self.cannot_hold[player as usize].insert(*c);
        }
    }

    /// Record that the caller declared `partner_card` — caller cannot hold it.
    pub fn on_declare(&mut self, caller: PlayerId, partner_card: Card) {
        if self.unseen.contains(&partner_card) {
            self.cannot_hold[caller as usize].insert(partner_card);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::deck::build_deck;
    use bq_engine::types::{Rank, Suit};

    fn c(s: Suit, r: Rank) -> Card { Card { suit: s, rank: r } }

    #[test]
    fn new_belief_has_self_excluded_from_unseen() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let b = BeliefState::new(0, &mine, &all);
        for card in &mine {
            assert!(!b.unseen.contains(card));
        }
        assert_eq!(b.unseen.len(), 65 - 13);
    }

    #[test]
    fn non_follow_eliminates_entire_suit_for_player() {
        let all = build_deck();
        let mine = all.iter().filter(|c| c.suit == Suit::Spades).copied().take(13).collect::<Vec<_>>();
        let mut b = BeliefState::new(0, &mine, &all);
        b.on_non_follow(2, Suit::Hearts);
        // No unseen hearts may be held by player 2.
        for c in b.unseen.iter().filter(|c| c.suit == Suit::Hearts) {
            assert!(b.cannot_hold[2].contains(c));
        }
    }

    #[test]
    fn play_removes_card_from_unseen_and_decrements_hand_size() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let mut b = BeliefState::new(0, &mine, &all);
        let target = c(Suit::Hearts, Rank::King);
        // Find any unseen card to test with.
        let card = *b.unseen.iter().next().unwrap();
        let before = b.unseen.len();
        b.on_play(2, card);
        assert_eq!(b.unseen.len(), before - 1);
        assert_eq!(b.hand_sizes[2], 12);
        let _ = target;
    }

    #[test]
    fn declare_marks_partner_card_as_unholdable_for_caller() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let mut b = BeliefState::new(0, &mine, &all);
        let pc = *b.unseen.iter().next().unwrap();
        b.on_declare(3, pc);
        assert!(b.cannot_hold[3].contains(&pc));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd rust && cargo test -p bq-ai belief`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-ai/src/belief.rs
git commit -m "feat(bq-ai): belief tracker with hard-constraint propagation"
```

---

## Task 8: bq-ai — determinization sampler

**Files:**
- Modify: `rust/crates/bq-ai/src/belief.rs` (extend)

- [ ] **Step 1: Append a sampler to belief.rs**

Append to `rust/crates/bq-ai/src/belief.rs`:
```rust
use bq_engine::rng::GameRng;
use rand::seq::SliceRandom;
use rand::Rng;

impl BeliefState {
    /// Sample a complete assignment of `unseen` cards to opponent hands consistent
    /// with `cannot_hold` and `hand_sizes`. Returns hands indexed by PlayerId
    /// (self's hand is left empty — caller substitutes the known hand).
    ///
    /// Uses a greedy randomized assignment with restarts (capped) — correct but
    /// not perfectly uniform under hard constraints. Good enough for ISMCTS rollouts.
    pub fn sample_determinization(&self, rng: &mut GameRng) -> Option<Vec<Vec<Card>>> {
        let max_restarts = 32;
        for _ in 0..max_restarts {
            if let Some(h) = self.try_sample(rng) { return Some(h); }
        }
        None
    }

    fn try_sample(&self, rng: &mut GameRng) -> Option<Vec<Vec<Card>>> {
        let mut hands: Vec<Vec<Card>> = vec![Vec::new(); 5];
        // Capacity per player (excluding self).
        let mut remaining: Vec<i32> = (0..5).map(|p| {
            if p as PlayerId == self.self_id { 0 } else { self.hand_sizes[p] as i32 }
        }).collect();

        // Shuffle unseen for randomized assignment order.
        let mut order: Vec<Card> = self.unseen.iter().copied().collect();
        order.shuffle(rng);

        for card in order {
            // Eligible players: not self, not in cannot_hold, still have capacity.
            let eligible: Vec<PlayerId> = (0..5)
                .filter(|&p| p != self.self_id)
                .filter(|&p| !self.cannot_hold[p as usize].contains(&card))
                .filter(|&p| remaining[p as usize] > 0)
                .collect();
            if eligible.is_empty() { return None; }
            let chosen = eligible[rng.gen_range(0..eligible.len())];
            hands[chosen as usize].push(card);
            remaining[chosen as usize] -= 1;
        }
        // Verify every opponent's hand size matches.
        for p in 0..5 {
            if p as PlayerId == self.self_id { continue; }
            if hands[p].len() != self.hand_sizes[p] { return None; }
        }
        Some(hands)
    }
}

#[cfg(test)]
mod sampler_tests {
    use super::*;
    use bq_engine::deck::build_deck;
    use bq_engine::rng::from_seed;

    #[test]
    fn sampler_produces_valid_assignment_at_game_start() {
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let b = BeliefState::new(0, &mine, &all);
        let mut rng = from_seed(99);
        let hands = b.sample_determinization(&mut rng).expect("should sample");
        for p in 1..5 {
            assert_eq!(hands[p].len(), 13, "player {} hand size", p);
        }
        // No duplicates between my hand and sampled hands.
        let mine_set: std::collections::HashSet<_> = mine.iter().copied().collect();
        for p in 1..5 {
            for c in &hands[p] {
                assert!(!mine_set.contains(c), "card {:?} appears in both my hand and sampled p{}", c, p);
            }
        }
    }

    #[test]
    fn sampler_respects_void_constraints() {
        use bq_engine::types::Suit;
        let all = build_deck();
        let mine = all[0..13].to_vec();
        let mut b = BeliefState::new(0, &mine, &all);
        b.on_non_follow(2, Suit::Hearts);
        let mut rng = from_seed(7);
        let hands = b.sample_determinization(&mut rng).expect("should sample");
        for c in &hands[2] {
            assert_ne!(c.suit, Suit::Hearts, "player 2 should be void in hearts");
        }
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd rust && cargo test -p bq-ai`
Expected: 6 belief tests pass total.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-ai/src/belief.rs
git commit -m "feat(bq-ai): determinization sampler respecting hard constraints"
```

---

## Task 9: bq-ai — rollout policy (random legal)

**Files:**
- Modify: `rust/crates/bq-ai/src/rollout.rs`

- [ ] **Step 1: Implement random-legal rollout that plays a determinized game to completion**

Write `rust/crates/bq-ai/src/rollout.rs`:
```rust
use bq_engine::engine::apply_play;
use bq_engine::rng::GameRng;
use bq_engine::rules::legal_play_indices;
use bq_engine::types::{GameState, Phase};
use rand::seq::SliceRandom;

/// Plays the given (determinized) state to completion using uniform-random legal moves.
/// Returns captured_points after game ends.
pub fn rollout_random(state: &mut GameState, rng: &mut GameRng) {
    while state.phase == Phase::Play {
        let p = state.next_to_act;
        let trick = state.current_trick.as_ref().expect("trick");
        let legal = legal_play_indices(&state.hands[p as usize], trick);
        let idx = *legal.choose(rng).expect("at least one legal play");
        apply_play(state, p, idx);
    }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd rust && cargo build -p bq-ai`
Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-ai/src/rollout.rs
git commit -m "feat(bq-ai): random-legal rollout to game completion"
```

---

## Task 10: bq-ai — ISMCTS core

**Files:**
- Modify: `rust/crates/bq-ai/src/ismcts.rs`

This task is the meatiest. We implement a single-rooted ISMCTS that, on each iteration: (a) samples a fresh determinization from belief, (b) descends from the root via UCB1 over actions legal in that determinization, (c) plays a random rollout from the leaf, (d) backpropagates.

- [ ] **Step 1: Implement ISMCTS**

Write `rust/crates/bq-ai/src/ismcts.rs`:
```rust
use crate::belief::BeliefState;
use crate::rollout::rollout_random;
use bq_engine::engine::apply_play;
use bq_engine::rng::GameRng;
use bq_engine::rules::legal_play_indices;
use bq_engine::types::{Card, GameState, Phase, PlayerId};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Default, Debug, Clone)]
struct ActionStats { visits: u64, total_value: f64 }

pub struct SearchParams {
    pub time_budget: Duration,
    pub min_iterations: u64,
    pub ucb_c: f64,
    /// PlayerId of the AI making the decision.
    pub self_id: PlayerId,
    /// Whose captured_points we're maximizing. For Hard-4 v0, just self_id.
    /// (Team-aware value comes in a future iteration.)
    pub maximize_for: PlayerId,
}

impl Default for SearchParams {
    fn default() -> Self {
        SearchParams {
            time_budget: Duration::from_millis(350),
            min_iterations: 64,
            ucb_c: 1.4,
            self_id: 0,
            maximize_for: 0,
        }
    }
}

/// Returns the chosen card to play from `self_state.hands[params.self_id]`.
pub fn ismcts_play(
    self_state: &GameState,
    belief: &BeliefState,
    rng: &mut GameRng,
    params: &SearchParams,
) -> Card {
    debug_assert_eq!(self_state.phase, Phase::Play);
    let my_id = params.self_id;
    let trick = self_state.current_trick.as_ref().expect("trick exists");
    let legal = legal_play_indices(&self_state.hands[my_id as usize], trick);
    let candidates: Vec<Card> = legal.iter().map(|&i| self_state.hands[my_id as usize][i]).collect();
    if candidates.len() == 1 { return candidates[0]; }

    let mut stats: HashMap<Card, ActionStats> = HashMap::new();
    for &c in &candidates { stats.insert(c, ActionStats::default()); }

    let deadline = Instant::now() + params.time_budget;
    let mut iters: u64 = 0;
    while Instant::now() < deadline || iters < params.min_iterations {
        iters += 1;
        // 1. Determinize.
        let Some(opp_hands) = belief.sample_determinization(rng) else { continue };
        let mut sim = self_state.clone();
        for p in 0..5 {
            if p as PlayerId != my_id {
                sim.hands[p] = opp_hands[p].clone();
            }
        }

        // 2. Select action via UCB1 from root.
        let total_visits: u64 = stats.values().map(|s| s.visits).sum();
        let chosen = pick_ucb1(&stats, &candidates, total_visits, params.ucb_c, rng);

        // 3. Play chosen action in the determinized state, then random rollout.
        let card_idx = sim.hands[my_id as usize].iter().position(|c| *c == chosen).unwrap();
        apply_play(&mut sim, my_id, card_idx);
        if sim.phase == Phase::Play {
            rollout_random(&mut sim, rng);
        }

        // 4. Backprop value.
        let val = (sim.captured_points[params.maximize_for as usize] as f64) / 300.0;
        let s = stats.get_mut(&chosen).unwrap();
        s.visits += 1;
        s.total_value += val;
    }

    // Pick most-visited (robust child).
    *stats.iter().max_by_key(|(_, s)| s.visits).map(|(c, _)| c).unwrap()
}

fn pick_ucb1(
    stats: &HashMap<Card, ActionStats>,
    candidates: &[Card],
    total_visits: u64,
    c_param: f64,
    rng: &mut GameRng,
) -> Card {
    // Unvisited actions get priority (infinite UCB).
    use rand::seq::SliceRandom;
    let unvisited: Vec<Card> = candidates.iter()
        .copied()
        .filter(|c| stats[c].visits == 0)
        .collect();
    if !unvisited.is_empty() {
        return *unvisited.choose(rng).unwrap();
    }
    let log_total = (total_visits.max(1) as f64).ln();
    candidates.iter().copied().max_by(|a, b| {
        let sa = &stats[a]; let sb = &stats[b];
        let mean_a = sa.total_value / sa.visits as f64;
        let mean_b = sb.total_value / sb.visits as f64;
        let ucb_a = mean_a + c_param * (log_total / sa.visits as f64).sqrt();
        let ucb_b = mean_b + c_param * (log_total / sb.visits as f64).sqrt();
        ucb_a.partial_cmp(&ucb_b).unwrap_or(std::cmp::Ordering::Equal)
    }).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bq_engine::deck::build_deck;
    use bq_engine::engine::{apply_bid, apply_declare, apply_pass, new_game};
    use bq_engine::rng::from_seed;
    use bq_engine::types::Suit;

    #[test]
    fn ismcts_returns_a_legal_card_at_game_start() {
        // Drive a quick game into Play phase, then ask ISMCTS for a move.
        let mut rng = from_seed(11);
        let mut state = new_game(&mut rng, 0);
        apply_bid(&mut state, 0, 150);
        while state.phase == Phase::Bidding {
            let p = state.next_to_act;
            apply_pass(&mut state, p);
        }
        let caller = state.caller.unwrap() as usize;
        let owned: std::collections::HashSet<_> = state.hands[caller].iter().copied().collect();
        let partner_card = *build_deck().iter().find(|c| !owned.contains(c)).unwrap();
        apply_declare(&mut state, Suit::Spades, partner_card);

        let self_id = state.next_to_act;
        let mine = state.hands[self_id as usize].clone();
        let belief = BeliefState::new(self_id, &mine, &build_deck());
        let params = SearchParams {
            time_budget: Duration::from_millis(150),
            min_iterations: 32,
            self_id,
            maximize_for: self_id,
            ..Default::default()
        };
        let chosen = ismcts_play(&state, &belief, &mut rng, &params);
        assert!(mine.contains(&chosen), "ISMCTS picked a card not in hand");
    }
}
```

- [ ] **Step 2: Run test**

Run: `cd rust && cargo test -p bq-ai ismcts`
Expected: 1 test passes (may take ~150ms).

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-ai/src/ismcts.rs
git commit -m "feat(bq-ai): ISMCTS with UCB1, time-budgeted, determinization-per-iter"
```

---

## Task 11: bq-ai — hard4 entry points

**Files:**
- Modify: `rust/crates/bq-ai/src/hard4.rs`

For bid/declare in v0, use simple heuristics. The point is to get a playable AI; declare/bid search is a deferred feature.

- [ ] **Step 1: Implement hard4 entry points**

Write `rust/crates/bq-ai/src/hard4.rs`:
```rust
use crate::belief::BeliefState;
use crate::ismcts::{ismcts_play, SearchParams};
use bq_engine::deck::build_deck;
use bq_engine::rng::GameRng;
use bq_engine::types::{Card, GameState, PlayerId, Rank, Suit};
use std::time::Duration;

/// Decide a bid. v0: greedy heuristic — bid up while hand has ≥ 2 aces or ≥ 6 of a suit.
/// Caps at 200 like Normal personality.
pub fn hard4_bid(state: &GameState, self_id: PlayerId) -> Option<u16> {
    let hand = &state.hands[self_id as usize];
    let aces = hand.iter().filter(|c| c.rank == Rank::Ace).count();
    let q_spades = hand.iter().any(|c| c.suit == Suit::Spades && c.rank == Rank::Queen);
    let max_suit_len = Suit::ALL.iter()
        .map(|&s| hand.iter().filter(|c| c.suit == s).count())
        .max().unwrap_or(0);

    let strong = aces >= 2 || q_spades || max_suit_len >= 6;
    if !strong { return None; }

    let current = state.winning_bid.unwrap_or(145);
    let next = current + 5;
    if next > 200 { return None; }
    Some(next.max(150))
}

/// Decide a declare. v0: trump = longest suit; partner_card = any A or Q♠ not in hand;
/// fallback to lowest unseen card.
pub fn hard4_declare(state: &GameState, self_id: PlayerId) -> (Suit, Card) {
    let hand = &state.hands[self_id as usize];
    let trump = Suit::ALL.iter().copied()
        .max_by_key(|&s| hand.iter().filter(|c| c.suit == s).count())
        .unwrap_or(Suit::Spades);
    let owned: std::collections::HashSet<_> = hand.iter().copied().collect();
    let all = build_deck();
    let preferred = all.iter().find(|c|
        !owned.contains(c) && (c.rank == Rank::Ace || (c.suit == Suit::Spades && c.rank == Rank::Queen))
    );
    let pc = preferred.copied().unwrap_or_else(|| {
        *all.iter().find(|c| !owned.contains(c)).expect("non-owned card exists")
    });
    (trump, pc)
}

/// Decide a play card via ISMCTS over a belief state freshly constructed from `state`.
/// Belief is rebuilt from scratch each call (v0); future versions thread it through.
pub fn hard4_play(state: &GameState, self_id: PlayerId, time_ms: u64, rng: &mut GameRng) -> Card {
    let mine = state.hands[self_id as usize].clone();
    let all = build_deck();
    let mut belief = BeliefState::new(self_id, &mine, &all);

    // Replay history into belief: played cards + non-follow events + declared partner.
    if let Some(decl) = &state.declaration {
        belief.on_declare(state.caller.expect("caller"), decl.partner_card);
    }
    for trick in &state.tricks {
        let led_suit = trick.plays[0].1.suit;
        for &(p, c) in &trick.plays {
            if p != self_id && c.suit != led_suit {
                belief.on_non_follow(p, led_suit);
            }
            belief.on_play(p, c);
        }
    }
    if let Some(cur) = &state.current_trick {
        if let Some(led) = cur.plays.first().map(|(_, c)| c.suit) {
            for &(p, c) in &cur.plays {
                if p != self_id && c.suit != led {
                    belief.on_non_follow(p, led);
                }
                belief.on_play(p, c);
            }
        }
    }

    let params = SearchParams {
        time_budget: Duration::from_millis(time_ms),
        min_iterations: 64,
        self_id,
        maximize_for: self_id,
        ..Default::default()
    };
    ismcts_play(state, &belief, rng, &params)
}
```

- [ ] **Step 2: Build**

Run: `cd rust && cargo build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add rust/crates/bq-ai/src/hard4.rs
git commit -m "feat(bq-ai): hard4 entry points (bid/declare heuristic, play via ISMCTS)"
```

---

## Task 12: bq-wasm — JSON I/O wrappers

**Files:**
- Modify: `rust/crates/bq-wasm/src/lib.rs`

- [ ] **Step 1: Implement WASM-exported JSON wrappers**

Write `rust/crates/bq-wasm/src/lib.rs`:
```rust
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

#[wasm_bindgen]
pub fn hard4_bid_json(state_json: &str, self_id: u8) -> Result<String, JsValue> {
    let state: GameState = serde_json::from_str(state_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let bid = hard4_bid(&state, self_id as PlayerId);
    Ok(serde_json::to_string(&BidResult { bid }).unwrap())
}

#[wasm_bindgen]
pub fn hard4_declare_json(state_json: &str, self_id: u8) -> Result<String, JsValue> {
    let state: GameState = serde_json::from_str(state_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let (trump, partner_card) = hard4_declare(&state, self_id as PlayerId);
    Ok(serde_json::to_string(&DeclareResult { trump, partner_card }).unwrap())
}

#[wasm_bindgen]
pub fn hard4_play_json(state_json: &str, self_id: u8, time_ms: u32, seed: u64) -> Result<String, JsValue> {
    let state: GameState = serde_json::from_str(state_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mut rng = from_seed(seed);
    let card = hard4_play(&state, self_id as PlayerId, time_ms as u64, &mut rng);
    Ok(serde_json::to_string(&PlayResult { card }).unwrap())
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
```

- [ ] **Step 2: Build WASM**

Run:
```bash
cd "/Users/bytedance/Documents/Personal/black queen/repo/rust/crates/bq-wasm" && \
  wasm-pack build --target web --release --out-dir ../../../src/game/wasm
```

Expected: produces `src/game/wasm/bq_wasm.js`, `bq_wasm_bg.wasm`, `package.json` (~200-500KB total).

- [ ] **Step 3: Verify wasm output exists**

Run: `ls src/game/wasm/`
Expected: at minimum `bq_wasm.js`, `bq_wasm_bg.wasm`, `bq_wasm.d.ts`, `package.json`.

- [ ] **Step 4: Commit**

```bash
git add rust/crates/bq-wasm/src/lib.rs src/game/wasm/
git commit -m "feat(bq-wasm): wasm-bindgen JSON wrappers + build output"
```

---

## Task 13: TypeScript — hard4Driver.ts

**Files:**
- Create: `src/game/hard4Driver.ts`

This driver bridges the existing TS GameState (camelCase) to the Rust GameState (snake_case as emitted by serde). For Session 1 we accept the serialization overhead and convert at the boundary.

- [ ] **Step 1: Read the existing TS types to confirm shape**

Run: open [src/game/types.ts](src/game/types.ts) and confirm the `GameState`, `Trick`, `Declaration`, and `Card` shapes. The driver must map TS → Rust JSON correctly.

- [ ] **Step 2: Write the driver**

Create `src/game/hard4Driver.ts`:
```typescript
import init, { hard4_bid_json, hard4_declare_json, hard4_play_json } from "./wasm/bq_wasm.js";
import wasmUrl from "./wasm/bq_wasm_bg.wasm?url";
import type { Card, GameState, PlayerId, Suit } from "./types";

let wasmReady: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (!wasmReady) wasmReady = init(wasmUrl).then(() => undefined);
  return wasmReady;
}

// Convert TS GameState to the JSON shape Rust serde expects.
// Rust uses snake_case + lowercase suits.
function toRustState(state: GameState): unknown {
  return {
    phase: state.phase,                      // already kebab-case enums match
    hands: state.hands.map(h => h.map(toRustCard)),
    bids: state.bids.map(b => ({ player: b.player, amount: b.amount ?? null })),
    caller: state.caller ?? null,
    winning_bid: state.winningBid ?? null,
    declaration: state.declaration
      ? { trump: state.declaration.trump.toLowerCase(),
          partner_card: toRustCard(state.declaration.partnerCard) }
      : null,
    tricks: state.tricks.map(toRustTrick),
    current_trick: state.currentTrick ? toRustTrick(state.currentTrick) : null,
    next_to_act: state.nextToAct,
    captured_points: state.capturedPoints,
    passed: state.passed,
  };
}

function toRustCard(card: Card): unknown {
  return { suit: card.suit.toLowerCase(), rank: card.rank };
}

function toRustTrick(t: { leader: PlayerId; plays: Array<{ player: PlayerId; card: Card }>; winner?: PlayerId | null }): unknown {
  return {
    leader: t.leader,
    plays: t.plays.map(p => [p.player, toRustCard(p.card)]),
    winner: t.winner ?? null,
  };
}

function fromRustCard(r: { suit: string; rank: number }): Card {
  const suit = (r.suit[0].toUpperCase() + r.suit.slice(1)) as Suit;
  return { suit, rank: r.rank } as Card;
}

export async function hard4Bid(state: GameState, selfId: PlayerId): Promise<number | null> {
  await ensureReady();
  const result = JSON.parse(hard4_bid_json(JSON.stringify(toRustState(state)), selfId));
  return result.bid;
}

export async function hard4Declare(state: GameState, selfId: PlayerId): Promise<{ trump: Suit; partnerCard: Card }> {
  await ensureReady();
  const result = JSON.parse(hard4_declare_json(JSON.stringify(toRustState(state)), selfId));
  return { trump: (result.trump[0].toUpperCase() + result.trump.slice(1)) as Suit, partnerCard: fromRustCard(result.partner_card) };
}

export async function hard4Play(state: GameState, selfId: PlayerId, timeMs: number = 300): Promise<Card> {
  await ensureReady();
  const seed = BigInt(Math.floor(Math.random() * 2 ** 53));
  const result = JSON.parse(hard4_play_json(JSON.stringify(toRustState(state)), selfId, timeMs, seed));
  return fromRustCard(result.card);
}
```

**Note:** TS types use `Suit` as e.g. `"Spades"`; Rust serde with `#[serde(rename_all = "lowercase")]` emits `"spades"`. The driver lowercases at the TS→Rust boundary and re-capitalizes at the Rust→TS boundary.

- [ ] **Step 3: Build check (TS only — does not run yet)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean. If there are mismatches between the actual `src/game/types.ts` field names and the field names assumed above (e.g. `winningBid`, `partnerCard`, `currentTrick`, `nextToAct`, `capturedPoints`, `passed`), update the driver to use the actual names. **If a field doesn't exist on the TS side**, that's a real divergence — pause and reconcile rather than guess.

- [ ] **Step 4: Commit**

```bash
git add src/game/hard4Driver.ts
git commit -m "feat(hard-4): TypeScript driver bridging GameState ↔ WASM JSON"
```

---

## Task 14: Wire `hard-4` into the AI dispatcher + lobby

**Files:**
- Modify: `src/game/types.ts` (extend AIPersonality)
- Modify: `src/game/ai.ts` (add dispatch)
- Modify: `src/components/Lobby.tsx` (add option)

- [ ] **Step 1: Read current `types.ts` AIPersonality union**

Run: `grep -n 'AIPersonality' src/game/types.ts`
Confirm the current shape (e.g. `export type AIPersonality = 'random' | 'normal' | 'hard' | 'hard-2' | 'hard-3'`).

- [ ] **Step 2: Add `'hard-4'` to the union**

Modify the `AIPersonality` type definition in `src/game/types.ts` to add `| 'hard-4'`.

- [ ] **Step 3: Read current `ai.ts` dispatcher**

Run: `grep -n "personality\|hard-3" src/game/ai.ts`
Confirm how `hard-3` is dispatched (likely a switch in functions named `aiBid`, `aiDeclare`, `aiPlay`).

- [ ] **Step 4: Add `hard-4` dispatch**

In `src/game/ai.ts`, add `'hard-4'` cases to each dispatcher function, calling into `hard4Bid` / `hard4Declare` / `hard4Play` from `./hard4Driver`. Since the Hard-4 functions are async (WASM init is async), the dispatcher may need to become async or the WASM init must be done at app startup before the first AI call.

**Recommended approach:** call `ensureReady()` (or just `hard4Play(...)` etc.) — the existing app's AI driver in `App.tsx` already wraps AI calls in async timeouts; if `aiPlay` returns a `Promise<Card>` for Hard-4 and a plain `Card` for others, wrap others with `Promise.resolve()` and make the call site `await`.

If the dispatcher is synchronous today and changing it cascades widely, an alternative is to **eagerly warm WASM in `main.tsx`** (Task 15) and have the dispatcher call a synchronous wrapper that throws if WASM isn't ready. For Session 1 this is acceptable since the human always picks an AI before the first AI move (lobby → start game has multi-frame delay).

Use whichever approach is the smallest diff to `ai.ts` and `App.tsx`. Document the choice in a code comment at the dispatcher.

- [ ] **Step 5: Add Hard-4 option in Lobby**

Read `src/components/Lobby.tsx` and locate the AI personality dropdown. Add `<option value="hard-4">Hard-4 (preview)</option>` alongside the existing Hard-3 entry.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/game/ai.ts src/components/Lobby.tsx
git commit -m "feat(hard-4): wire into AI dispatcher and lobby"
```

---

## Task 15: Warm WASM at app startup

**Files:**
- Modify: `main.tsx`

- [ ] **Step 1: Eager-init WASM so first Hard-4 move has no init latency**

In `main.tsx`, near the existing weight-setup imports, add:
```typescript
import init from "./game/wasm/bq_wasm.js";
import wasmUrl from "./game/wasm/bq_wasm_bg.wasm?url";
init(wasmUrl).catch(err => console.warn("Hard-4 WASM init failed:", err));
```

- [ ] **Step 2: Add wasm build script to package.json**

Modify `package.json`'s `"scripts"` section to add:
```json
"build:wasm": "cd rust/crates/bq-wasm && wasm-pack build --target web --release --out-dir ../../../src/game/wasm"
```

- [ ] **Step 3: Run dev server, confirm WASM loads without error in browser console**

Run (in background): `npm run dev`
Open `http://localhost:5173` in browser, open devtools console, look for "Hard-4 WASM init failed" — should NOT appear. If it does, investigate (probably a Vite asset-handling issue, may need `vite-plugin-wasm` or a `?url` import adjustment).

- [ ] **Step 4: Commit**

```bash
git add main.tsx package.json
git commit -m "feat(hard-4): warm WASM at app startup + add build:wasm script"
```

---

## Task 16: Smoke test in browser

**Files:** none (manual verification step).

- [ ] **Step 1: Play one full game vs Hard-4 in the browser**

In the running dev server, set 4 opponent seats to Hard-4 (or 1 if more diversity desired), one to yourself or other personalities. Play one full game. Observe:
- Hard-4 makes legal moves at every turn.
- No browser console errors during AI turns.
- AI move latency feels ≤ ~500ms (it may briefly stutter the UI since we're not using a Web Worker yet — acceptable for Session 1).

- [ ] **Step 2: Confirm game completes with 300 total captured points**

Visually inspect the round-end modal. Total points across all players should equal 300. If not, there's a divergence between Rust engine view of cards and TS engine view — pause and debug.

- [ ] **Step 3: Note any qualitative observations in commit message of next task**

(No commit for this task itself — purely a verification gate before Task 17.)

---

## Task 17: Initial arena run (Hard-4 vs Hard-3)

**Files:** none (runs existing TS arena harness with WASM-backed hard-4).

- [ ] **Step 1: Verify the existing arena.ts can dispatch hard-4 via Node**

Run: `npx tsx src/game/arena.ts 5 hard-4,hard-3`
Expected: runs 5 games without crash. The existing `arena.ts` runs in Node; the WASM module + `hard4Driver.ts` should also work in Node (wasm-pack's `--target web` is browser-only; for Node we may need `--target nodejs` output OR a Node-compatible loader).

**If `--target web` doesn't work in Node:** add a second wasm-pack build target. Modify `package.json`:
```json
"build:wasm:node": "cd rust/crates/bq-wasm && wasm-pack build --target nodejs --release --out-dir ../../../src/game/wasm-node"
```
Run `npm run build:wasm:node`, then make `hard4Driver.ts` switch on `typeof window === 'undefined'` to import from the right path. Pragmatic Session 1 approach: build both, branch at import.

- [ ] **Step 2: Run a 300-game arena**

Run: `npx tsx src/game/arena.ts 300 hard-4,hard-3,hard-3,hard-3,hard-3`
Expected: prints per-seat win-rate. Hard-4's seat is the first; compare to the four Hard-3 seats. Even at 300 games, you'll see whether Hard-4 is in the ballpark.

Acceptable Session 1 outcomes:
- Hard-4 win-rate ≥ Hard-3 average → strong signal, proceed.
- Hard-4 win-rate within ~3pp of Hard-3 average → directionally encouraging, tuning is the next lever.
- Hard-4 win-rate significantly below Hard-3 → diagnostic time; likely belief or ISMCTS bug.

- [ ] **Step 3: Record the result in commit message**

Run (substituting your actual numbers):
```bash
git commit --allow-empty -m "chore(hard-4): Session 1 arena baseline — 300 games hard-4 vs hard-3 = XX.X% vs YY.Y%/seat"
```

---

## Task 18: Document Session 1 outcome + next-session checklist

**Files:**
- Create: `docs/superpowers/sessions/2026-05-26-hard-4-session-1-notes.md`

- [ ] **Step 1: Write a brief session notes file**

Create `docs/superpowers/sessions/2026-05-26-hard-4-session-1-notes.md`:
```markdown
# Hard-4 Session 1 — Outcomes

## What shipped
- Rust workspace (bq-engine, bq-ai, bq-wasm, bq-cli)
- bq-engine: full reducer port, ~10 tests passing
- bq-ai: belief tracker (hard constraints), determinization sampler, random rollout, ISMCTS
- bq-wasm: JSON I/O wrapper, builds via wasm-pack
- TS: hard4Driver.ts, AIPersonality extended, ai.ts dispatch, lobby option, WASM warm at startup
- bq-cli smoke: <N> games, 0 invariant failures

## Initial arena
- 300 games, hard-4 vs 4×hard-3
- Result: <fill in win-rate per seat>

## Open questions / known gaps
- Bid/declare phases still use simple heuristics, not search
- Belief tracker uses hard constraints only; no soft signals
- No endgame solver
- Web Worker not yet used (UI may stutter during AI turn)
- No belief/search scalar tuning yet

## Next-session checklist
- [ ] If arena was neutral or negative: diagnose. Add ISMCTS tree dump for a known-bad seed.
- [ ] If arena was positive: kick off ES tuning of the ~5 search/belief scalars (bq-cli tune subcommand TBD).
- [ ] Move WASM into a Web Worker to unblock UI during search.
- [ ] Port at least the Hard-3 scoreMove rollout policy into Rust so rollouts are realistic, not uniform-random (likely big jump).
- [ ] Add soft-signal belief updates (bid strength, smear, withhold).
- [ ] Add declare-phase ISMCTS.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/sessions/
git commit -m "docs(hard-4): Session 1 outcome notes + next-session checklist"
```

---

## If we run out of time

Realistic stop points, in order of "still ships value":

1. **After Task 12 (WASM built):** Rust engine + ISMCTS validated via `cargo test`, but no browser integration. Browser work is a 1-hour Session 2.
2. **After Task 14 (lobby wired):** Hard-4 playable in browser but no arena number. Spend Session 2 on arena harness.
3. **After Task 17 (arena run):** Full deliverable. Tasks 16/18 are optional polish.

If a step blocks for >20 min (WASM toolchain misery, type mismatch cascade), **pause and ask for direction** rather than spinning. The plan's value is in the structure, not in completing every box.

---

## Self-review notes

- **Spec coverage:** Goals (new personality, search-based, browser, ≤400ms latency) covered by Tasks 1–15. Information audit's hard constraints covered by Task 7. ISMCTS covered by Task 10. Native CLI covered by Task 6. Ship gate (smoke + arena) covered by Tasks 6 and 17. **Deferred to future sessions (per spec phasing):** soft signals, declare/bid search, endgame solver, AI Info modal section, ES tuning. Each is explicitly listed in Task 18 next-session checklist.
- **Placeholder scan:** No TBD/TODO in tasks. Task 14 step 4 has a deliberate "use whichever is smallest diff" — that's a real choice, not a placeholder, and is documented.
- **Type consistency:** `hard4Bid`/`hard4Declare`/`hard4Play` names consistent across Rust (`hard4_play`), WASM (`hard4_play_json`), TS driver (`hard4Play`). `BeliefState` consistent. `SearchParams` consistent.
