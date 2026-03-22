// System/shared/wasm_loader_unified.js
// BVST Universal Unified Loader
// Supports: Synths, FX, Samplers, and Hybrid Plugins.
// Features: 4-channel Process, Parameter Control, State Management, Sample Loading, Note Events.

let wasm;

// --- Memory Management Helpers ---
const heap = new Array(128).fill(undefined);
heap.push(undefined, null, true, false);
let heap_next = heap.length;

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
}

function getObject(idx) { return heap[idx]; }

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.buffer !== wasm.memory.buffer) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (
        cachedDataViewMemory0 === null ||
        (cachedDataViewMemory0.buffer.detached === true) ||
        (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)
    ) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

// Text Decoder
let cachedTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => 'TextDecoder missing' };
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

function getWasmErrorString(ptr, len) {
    ptr = ptr >>> 0;
    len = len >>> 0;
    try {
        return getStringFromWasm0(ptr, len);
    } catch (_) {
        return `WASM throw (ptr=${ptr} len=${len})`;
    }
}

// Argument Passing
let WASM_VECTOR_LEN = 0;
function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

// String passing (wasm-bindgen compatible)
let cachedTextEncoder = typeof TextEncoder !== 'undefined'
    ? new TextEncoder('utf-8')
    : { encode: (s) => new Uint8Array((s || '').split('').map(ch => ch.charCodeAt(0) & 0xff)) };
if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function(arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return { read: arg.length, written: buf.length };
    };
}
function passStringToWasm0(arg, malloc, realloc) {
    arg = String(arg ?? '');
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

let __wbg_malloc = null;
let __wbg_realloc = undefined;
let __wbg_free = null;

function resolveWbindgenMemoryFns() {
    if (!wasm) return;
    if (__wbg_malloc && __wbg_free) return;

    // Prefer explicit exports when present.
    if (typeof wasm.__wbindgen_malloc === 'function') __wbg_malloc = wasm.__wbindgen_malloc;
    if (typeof wasm.__wbindgen_realloc === 'function') __wbg_realloc = wasm.__wbindgen_realloc;
    if (typeof wasm.__wbindgen_free === 'function') __wbg_free = wasm.__wbindgen_free;

    const pickByArity = (arity) => {
        const prefix = '__wbindgen_export';
        for (const k in wasm) {
            if (!k.startsWith(prefix)) continue;
            const fn = wasm[k];
            if (typeof fn === 'function' && fn.length === arity) return fn;
        }
        return null;
    };

    // wasm-bindgen aliases commonly have stable arity:
    //   malloc(len, align) -> 2 args
    //   free(ptr, len, align) -> 3 args
    //   realloc(ptr, old_len, new_len, align) -> 4 args
    if (!__wbg_realloc) __wbg_realloc = pickByArity(4) ?? undefined;
    if (!__wbg_malloc) __wbg_malloc = pickByArity(2);
    if (!__wbg_free) __wbg_free = pickByArity(3);
}

function getWasmMalloc() {
    resolveWbindgenMemoryFns();
    return __wbg_malloc;
}

function getWasmRealloc() {
    resolveWbindgenMemoryFns();
    return __wbg_realloc;
}

function getWasmFree() {
    resolveWbindgenMemoryFns();
    return __wbg_free;
}

// --- Finalization ---
const BvstSynthFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_bvstsynth_free(ptr >>> 0, 1));

// --- Main Class ---
export class BvstSynth {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BvstSynth.prototype);
        obj.__wbg_ptr = ptr;
        BvstSynthFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BvstSynthFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_bvstsynth_free(ptr, 0);
    }

    // --- Core Methods ---

    static new(sample_rate, plugin_id) {
        const malloc = getWasmMalloc();
        if (typeof malloc !== 'function') throw new Error("WASM malloc export not found.");
        const realloc = getWasmRealloc();
        const ptr0 = passStringToWasm0(plugin_id, malloc, realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.bvstsynth_new(sample_rate, ptr0, len0);
        return BvstSynth.__wrap(ret);
    }

    set_param(id, value) {
        const pid = Number(id);
        const pval = Number(value);
        if (!Number.isFinite(pid) || !Number.isFinite(pval)) return;
        wasm.bvstsynth_set_param(this.__wbg_ptr, pid >>> 0, pval);
    }

    // Universal Process: Stereo In -> Stereo Out
    process(in_l, in_r, output_l, output_r) {
        if (!wasm.bvstsynth_process) return;

        const malloc = getWasmMalloc();
        if (typeof malloc !== 'function') return;
        const ptr0 = passArrayF32ToWasm0(in_l, malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(in_r, malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(output_l, malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF32ToWasm0(output_r, malloc);
        const len3 = WASM_VECTOR_LEN;

        wasm.bvstsynth_process(
            this.__wbg_ptr,
            ptr0, len0,
            ptr1, len1,
            ptr2, len2, addHeapObject(output_l),
            ptr3, len3, addHeapObject(output_r)
        );
    }

    // --- Optional / Dynamic Methods ---

    get_descriptor() {
        if (!wasm.bvstsynth_get_descriptor) return "{}";

        // Prefer wasm-bindgen's stack-pointer return ABI when available.
        if (typeof wasm.__wbindgen_add_to_stack_pointer === 'function') {
            let deferredPtr;
            let deferredLen;
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.bvstsynth_get_descriptor(retptr, this.__wbg_ptr);
                deferredPtr = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                deferredLen = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                return getStringFromWasm0(deferredPtr, deferredLen);
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                const free = getWasmFree();
                if (typeof free === 'function' && deferredPtr !== undefined && deferredLen !== undefined) {
                    try { free(deferredPtr, deferredLen, 1); } catch (_) {}
                }
            }
        }

        // Fallback ABI (older builds)
        const malloc = getWasmMalloc();
        if (typeof malloc !== 'function') return "{}";
        const retptr = malloc(16, 4);
        try {
            wasm.bvstsynth_get_descriptor(retptr, this.__wbg_ptr);
            const mem = new Int32Array(wasm.memory.buffer);
            const r0 = mem[retptr / 4 + 0];
            const r1 = mem[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            const free = getWasmFree();
            if (typeof free === 'function') {
                try { free(retptr, 16, 4); } catch (_) {}
            }
        }
    }

    get_state() {
        if (!wasm.bvstsynth_get_state) return new Float32Array(0);

        // Prefer wasm-bindgen's stack-pointer return ABI when available.
        if (typeof wasm.__wbindgen_add_to_stack_pointer === 'function') {
            let deferredPtr;
            let deferredLen;
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.bvstsynth_get_state(retptr, this.__wbg_ptr);
                deferredPtr = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                deferredLen = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                return getFloat32ArrayMemory0().subarray(deferredPtr / 4, deferredPtr / 4 + deferredLen).slice();
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
                const free = getWasmFree();
                if (typeof free === 'function' && deferredPtr !== undefined && deferredLen !== undefined) {
                    try { free(deferredPtr, deferredLen * 4, 4); } catch (_) {}
                }
            }
        }

        // Fallback ABI (older builds)
        const malloc = getWasmMalloc();
        const free = getWasmFree();
        if (typeof malloc !== 'function') return new Float32Array(0);
        const retptr = malloc(16, 4);
        try {
            wasm.bvstsynth_get_state(retptr, this.__wbg_ptr);
            const mem = new Int32Array(wasm.memory.buffer);
            const r0 = mem[retptr / 4 + 0];
            const r1 = mem[retptr / 4 + 1];
            const v1 = getFloat32ArrayMemory0().subarray(r0 / 4, r0 / 4 + r1).slice();
            if (typeof free === 'function') {
                try { free(r0, r1 * 4, 4); } catch (_) {}
            }
            return v1;
        } finally {
            if (typeof free === 'function') {
                try { free(retptr, 16, 4); } catch (_) {}
            }
        }
    }

    set_state(state) {
        if (!wasm.bvstsynth_set_state) return;
        const malloc = getWasmMalloc();
        if (typeof malloc !== 'function') return;
        const ptr0 = passArrayF32ToWasm0(state, malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.bvstsynth_set_state(this.__wbg_ptr, ptr0, len0);
    }

    load_sample(data) {
        if (!wasm.bvstsynth_load_sample) {
            console.warn("load_sample called but not supported by this plugin.");
            return;
        }
        const malloc = getWasmMalloc();
        if (typeof malloc !== 'function') return;
        const ptr0 = passArrayF32ToWasm0(data, malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.bvstsynth_load_sample(this.__wbg_ptr, ptr0, len0);
    }

    note_on(note, velocity) {
        if (wasm.bvstsynth_note_on) {
            const n = Number(note);
            const v = Number(velocity);
            if (!Number.isFinite(n) || !Number.isFinite(v)) return;
            wasm.bvstsynth_note_on(this.__wbg_ptr, n, v);
        }
    }

    note_off(note) {
        if (wasm.bvstsynth_note_off) {
            const n = Number(note);
            if (!Number.isFinite(n)) return;
            wasm.bvstsynth_note_off(this.__wbg_ptr, n);
        }
    }

    midi_cc(cc, value) {
        if (wasm.bvstsynth_midi_cc) {
            const c = Number(cc);
            const v = Number(value);
            if (!Number.isFinite(c) || !Number.isFinite(v)) return;
            wasm.bvstsynth_midi_cc(this.__wbg_ptr, c, v);
        }
    }
}

if (Symbol.dispose) BvstSynth.prototype[Symbol.dispose] = BvstSynth.prototype.free;

// --- Init & Load ---

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);
                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("Falling back to instantiate");
                } else {
                    throw e;
                }
            }
        }
        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);
        return (instance instanceof WebAssembly.Instance) ? { instance, module } : instance;
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_copy_to_typed_array_db832bc4df7216c1 = function(arg0, arg1, arg2) {
        new Uint8Array(getObject(arg2).buffer, getObject(arg2).byteOffset, getObject(arg2).byteLength).set(getArrayU8FromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getWasmErrorString(arg0, arg1));
    };
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    cachedDataViewMemory0 = null;
    __wbg_malloc = null;
    __wbg_realloc = undefined;
    __wbg_free = null;
    return wasm;
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('bvst_unified_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (module_or_path instanceof WebAssembly.Module) {
        const { instance, module } = await __wbg_load(module_or_path, imports);
        return __wbg_finalize_init(instance, module);
    }

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }
    const { instance, module } = await __wbg_load(await module_or_path, imports);
    return __wbg_finalize_init(instance, module);
}

export default __wbg_init;
