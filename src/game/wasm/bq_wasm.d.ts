/* tslint:disable */
/* eslint-disable */

export function hard4_bid_json(state_json: string, self_id: number): string;

export function hard4_declare_json(state_json: string, self_id: number): string;

export function hard4_play_json(state_json: string, self_id: number, time_ms: number, seed: bigint): string;

/**
 * A/B toggle for the ≤10-card endgame minimax solver (historically ON in wasm).
 */
export function set_endgame_enabled_wasm(enabled: boolean): void;

/**
 * A/B toggle for the follow-side discard guard (defaults ON).
 */
export function set_follow_guard_wasm(enabled: boolean): void;

/**
 * Hard-4B variant toggle. Set per-decision before a play/bid/declare call.
 * v0 scaffold: no behavior change (identical to Hard-4).
 */
export function set_hard4b_wasm(enabled: boolean): void;

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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly hard4_bid_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hard4_declare_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hard4_play_json: (a: number, b: number, c: number, d: number, e: bigint) => [number, number, number, number];
    readonly set_endgame_enabled_wasm: (a: number) => void;
    readonly set_follow_guard_wasm: (a: number) => void;
    readonly set_hard4b_wasm: (a: number) => void;
    readonly set_puct_wasm: (a: number, b: number, c: number) => void;
    readonly set_rollout_policy_wasm: (a: number) => void;
    readonly set_tree_ismcts_wasm: (a: number, b: number) => void;
    readonly set_ucb_c_wasm: (a: number) => void;
    readonly version: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
