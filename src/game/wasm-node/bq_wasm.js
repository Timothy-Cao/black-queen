/* @ts-self-types="./bq_wasm.d.ts" */

/**
 * @param {string} state_json
 * @param {number} self_id
 * @returns {string}
 */
function hard4_bid_json(state_json, self_id) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(state_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hard4_bid_json(ptr0, len0, self_id);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
exports.hard4_bid_json = hard4_bid_json;

/**
 * @param {string} state_json
 * @param {number} self_id
 * @returns {string}
 */
function hard4_declare_json(state_json, self_id) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(state_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hard4_declare_json(ptr0, len0, self_id);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
exports.hard4_declare_json = hard4_declare_json;

/**
 * @param {string} state_json
 * @param {number} self_id
 * @param {number} time_ms
 * @param {bigint} seed
 * @returns {string}
 */
function hard4_play_json(state_json, self_id, time_ms, seed) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(state_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hard4_play_json(ptr0, len0, self_id, time_ms, seed);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
exports.hard4_play_json = hard4_play_json;

/**
 * A/B toggle for the ≤10-card endgame minimax solver (historically ON in wasm).
 * @param {boolean} enabled
 */
function set_endgame_enabled_wasm(enabled) {
    wasm.set_endgame_enabled_wasm(enabled);
}
exports.set_endgame_enabled_wasm = set_endgame_enabled_wasm;

/**
 * A/B toggle for the follow-side discard guard (defaults ON).
 * @param {boolean} enabled
 */
function set_follow_guard_wasm(enabled) {
    wasm.set_follow_guard_wasm(enabled);
}
exports.set_follow_guard_wasm = set_follow_guard_wasm;

/**
 * Hard-4B variant toggle. Set per-decision before a play/bid/declare call.
 * v0 scaffold: no behavior change (identical to Hard-4).
 * @param {boolean} enabled
 */
function set_hard4b_wasm(enabled) {
    wasm.set_hard4b_wasm(enabled);
}
exports.set_hard4b_wasm = set_hard4b_wasm;

/**
 * A/B toggle for PUCT prior-guided root selection.
 * enabled: on/off. c_x100: PUCT c × 100 (e.g. 150 = 1.5). conc_x100: prior
 * concentration on greedy pick × 100 (e.g. 50 = 0.5 mass on greedy move).
 * @param {boolean} enabled
 * @param {number} c_x100
 * @param {number} conc_x100
 */
function set_puct_wasm(enabled, c_x100, conc_x100) {
    wasm.set_puct_wasm(enabled, c_x100, conc_x100);
}
exports.set_puct_wasm = set_puct_wasm;

/**
 * A/B selector for ISMCTS rollout policy. 0=Tactical, 1=Greedy (default), 2=Random.
 * @param {number} policy
 */
function set_rollout_policy_wasm(policy) {
    wasm.set_rollout_policy_wasm(policy);
}
exports.set_rollout_policy_wasm = set_rollout_policy_wasm;

/**
 * A/B toggle for tree-structured ISMCTS (SO-ISMCTS). depth = max tree depth in plays.
 * @param {boolean} enabled
 * @param {number} depth
 */
function set_tree_ismcts_wasm(enabled, depth) {
    wasm.set_tree_ismcts_wasm(enabled, depth);
}
exports.set_tree_ismcts_wasm = set_tree_ismcts_wasm;

/**
 * A/B override for UCB exploration constant. c_x100 = c × 100 (0 = use default 1.4).
 * @param {number} c_x100
 */
function set_ucb_c_wasm(c_x100) {
    wasm.set_ucb_c_wasm(c_x100);
}
exports.set_ucb_c_wasm = set_ucb_c_wasm;

/**
 * @returns {string}
 */
function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
exports.version = version;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./bq_wasm_bg.js": import0,
    };
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/bq_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasmInstance = new WebAssembly.Instance(wasmModule, __wbg_get_imports());
let wasm = wasmInstance.exports;
wasm.__wbindgen_start();
