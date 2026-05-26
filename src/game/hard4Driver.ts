// Hard-4 driver: thin TS bridge over the bq-wasm module.
//
// Responsibilities:
//   1. Eagerly load the WASM module at app startup (warmWasm()).
//   2. Project a TS GameState (rich, UI-friendly shape) into the slim
//      AI-facing GameState the Rust side expects.
//   3. Dispatch hard4 bid/declare/play calls; fall back to the Hard-3
//      implementation if WASM isn't loaded yet (rare race at app cold-start).
//
// The WASM module is synchronous after init. Init is async (must fetch + compile
// the .wasm file once), so we keep a wasmReady promise and a wasmLoaded flag.
// AI calls are sync (driven from a React setState reducer); if WASM isn't yet
// loaded, we transparently fall back so gameplay never blocks.

import init, * as bq from "./wasm/bq_wasm.js";
import wasmUrl from "./wasm/bq_wasm_bg.wasm?url";
import type {
  Bid,
  Card,
  GameState,
  PlayerId,
  RoundState,
  Suit,
  Trick,
} from "./types";
import { hardTunedBid, hardTunedDeclare, hardTunedPlay } from "./aiHard";

let wasmLoaded = false;
let wasmReady: Promise<void> | null = null;

/** Kick off WASM loading. Idempotent. Safe to call from main.tsx at app boot. */
export function warmWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init(wasmUrl)
      .then(() => {
        wasmLoaded = true;
      })
      .catch((err) => {
        // Log but don't throw — failures fall through to Hard-3 fallback.
        // eslint-disable-next-line no-console
        console.warn("[hard-4] WASM init failed:", err);
      });
  }
  return wasmReady;
}

export function isWasmReady(): boolean {
  return wasmLoaded;
}

// ---------- TS → Rust state projection ----------

/**
 * Project the rich TS GameState into the slim Rust-facing shape.
 * Field renames + per-trick points computation. Suit/Card formats match
 * Rust serde defaults (single-letter suits, no `id` field on Card).
 */
function toRustState(state: GameState): unknown {
  const r = state.round;
  // Hands as Vec<Vec<Card>> in player-id order; strip `id` from each card.
  const hands = [0, 1, 2, 3, 4].map((i) =>
    (r.hands[i as PlayerId] ?? []).map(stripCardId),
  );

  // captured_points: total points captured per player so far, summed from completed tricks.
  const captured = [0, 0, 0, 0, 0];
  for (const t of r.tricks) {
    if (t.winner !== undefined && t.points !== undefined) {
      captured[t.winner] += t.points;
    }
  }

  // Map phase. round_end / game_end both become "done" on the Rust side.
  const phase = mapPhase(r.phase);

  // Bids — TS uses amount=0 to mean pass; Rust uses Option<u16>.
  const bids = r.bids.map((b: Bid) => ({
    player: b.player,
    amount: b.amount === 0 ? null : b.amount,
  }));

  // passed: TS Set → Rust Vec<bool>.
  const passed = [0, 1, 2, 3, 4].map((i) => r.passed.has(i as PlayerId));

  // next_to_act: depends on phase.
  let nextToAct: PlayerId =
    r.phase === "bidding" ? (r.bidTurn ?? 0)
    : r.phase === "declaring" ? (r.bidder ?? 0)
    : r.phase === "playing" ? r.toPlay
    : 0;

  return {
    phase,
    hands,
    bids,
    caller: r.bidder ?? null,
    winning_bid: r.winningBid ?? null,
    trump: r.trump ?? null,
    partner_card: r.partnerCard ? stripCardId(r.partnerCard) : null,
    tricks: r.tricks.map(toRustTrick),
    current_trick: r.currentTrick ? toRustTrick(r.currentTrick) : null,
    next_to_act: nextToAct,
    captured_points: captured,
    passed,
  };
}

function stripCardId(c: Card): { suit: Suit; rank: number } {
  return { suit: c.suit, rank: c.rank };
}

function toRustTrick(t: Trick) {
  return {
    leader: t.leader,
    plays: t.plays.map((p) => ({ player: p.player, card: stripCardId(p.card) })),
    winner: t.winner ?? null,
    points: t.points ?? null,
  };
}

function mapPhase(p: RoundState["phase"]): string {
  switch (p) {
    case "bidding": return "bidding";
    case "declaring": return "declaring";
    case "playing": return "playing";
    default: return "done";
  }
}

// ---------- Rust → TS card identity reattachment ----------

/**
 * The Rust side returns a card by (suit, rank) only. The TS engine identifies
 * cards by `id`. Look up the specific instance in the player's hand by
 * matching suit+rank — if both copies are in the hand, picking either is
 * fine (engine semantics treat them identically).
 */
function reattachCardId(
  hand: Card[],
  picked: { suit: Suit; rank: number },
): Card {
  const match = hand.find((c) => c.suit === picked.suit && c.rank === picked.rank);
  if (!match) {
    throw new Error(
      `[hard-4] WASM returned card ${picked.suit}${picked.rank} not in hand ` +
      `(hand: ${hand.map((c) => c.id).join(",")})`,
    );
  }
  return match;
}

// ---------- Public dispatch entry points ----------

export function hard4Bid(state: GameState, selfId: PlayerId): { bid: number | "pass" } {
  if (!wasmLoaded) return hardTunedBid(state, selfId);
  const result = JSON.parse(
    bq.hard4_bid_json(JSON.stringify(toRustState(state)), selfId),
  ) as { bid: number | null };
  return { bid: result.bid === null ? "pass" : result.bid };
}

export function hard4Declare(state: GameState, selfId: PlayerId): { trump: Suit; partnerCard: Card } {
  if (!wasmLoaded) return hardTunedDeclare(state, selfId);
  const result = JSON.parse(
    bq.hard4_declare_json(JSON.stringify(toRustState(state)), selfId),
  ) as { trump: Suit; partner_card: { suit: Suit; rank: number } };
  return {
    trump: result.trump,
    partnerCard: {
      suit: result.partner_card.suit,
      rank: result.partner_card.rank as Card["rank"],
      id: `${result.partner_card.suit}${result.partner_card.rank}_0`,
    },
  };
}

const HARD4_TIME_MS = 300;

export function hard4Play(state: GameState, selfId: PlayerId): Card {
  if (!wasmLoaded) return hardTunedPlay(state, selfId);
  const seed = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  const result = JSON.parse(
    bq.hard4_play_json(JSON.stringify(toRustState(state)), selfId, HARD4_TIME_MS, seed),
  ) as { card: { suit: Suit; rank: number } };
  return reattachCardId(state.round.hands[selfId], result.card);
}
