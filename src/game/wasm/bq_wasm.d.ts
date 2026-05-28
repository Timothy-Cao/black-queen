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
 * A/B selector for ISMCTS rollout policy. 0=Tactical (default), 1=Greedy, 2=Random.
 */
export function set_rollout_policy_wasm(policy: number): void;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly hard4_bid_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hard4_declare_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hard4_play_json: (a: number, b: number, c: number, d: number, e: bigint) => [number, number, number, number];
    readonly set_follow_guard_wasm: (a: number) => void;
    readonly set_rollout_policy_wasm: (a: number) => void;
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
