/* tslint:disable */
/* eslint-disable */

export function hard4_bid_json(state_json: string, self_id: number): string;

export function hard4_declare_json(state_json: string, self_id: number): string;

export function hard4_play_json(state_json: string, self_id: number, time_ms: number, seed: bigint): string;

/**
 * A/B toggle for the follow-side discard guard (defaults ON).
 */
export function set_follow_guard_wasm(enabled: boolean): void;

/**
 * A/B toggle for PUCT prior-guided root selection.
 * enabled: on/off. c_x100: PUCT c × 100 (e.g. 150 = 1.5). conc_x100: prior
 * concentration on greedy pick × 100 (e.g. 50 = 0.5 mass on greedy move).
 */
export function set_puct_wasm(enabled: boolean, c_x100: number, conc_x100: number): void;

/**
 * A/B selector for ISMCTS rollout policy. 0=Tactical, 1=Greedy (default), 2=Random.
 */
export function set_rollout_policy_wasm(policy: number): void;

/**
 * A/B toggle for tree-structured ISMCTS (SO-ISMCTS). depth = max tree depth in plays.
 */
export function set_tree_ismcts_wasm(enabled: boolean, depth: number): void;

/**
 * A/B override for UCB exploration constant. c_x100 = c × 100 (0 = use default 1.4).
 */
export function set_ucb_c_wasm(c_x100: number): void;

export function version(): string;
