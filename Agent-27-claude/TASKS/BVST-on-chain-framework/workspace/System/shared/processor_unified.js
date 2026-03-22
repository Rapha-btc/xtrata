// System/shared/processor_unified.js
// Shared BVST AudioWorklet module (single copy for all plugins).

import initWasm, { BvstSynth } from './wasm_loader_unified.js';

class BvstProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.synth = null;
        this.port.onmessage = this.handleMessage.bind(this);
        this.dummyInput = new Float32Array(128);
        this._tmpInL = null;
        this._tmpInR = null;
        this._tmpOutR = null;
        this._reportedWorkletError = false;
        this._eventQueue = [];
        this._queueReadIndex = 0;
        this._maxQueuedEvents = 2048;
        this._maxEventsPerBlock = 256;
        this._wasmReady = false;
        this._pluginId = 'UniversalUtility';
        this._sampleRate = 48000;
        this._restartCooldownBlocks = 32;
        this._restartBackoff = 0;
        this._restartAttempts = 0;
        this._maxRestartAttempts = 3;
        if (globalThis.BVST_DEBUG) console.log('BVST: Processor constructed.');
    }

    _reportWorkletError(context, e) {
        if (this._reportedWorkletError) return;
        this._reportedWorkletError = true;

        const msg = (e && e.message) ? e.message : String(e);
        console.error(`BVST: Worklet error (${context})`, e);
        try {
            this.port.postMessage({ type: 'ERROR', error: `${context}: ${msg}` });
        } catch (_) {}
    }

    _enqueueEvent(data) {
        if (!data || typeof data.type !== 'string') return;
        this._eventQueue.push(data);

        const overflow = this._eventQueue.length - this._maxQueuedEvents;
        if (overflow > 0) {
            this._eventQueue.splice(0, overflow);
            this._queueReadIndex = Math.max(0, this._queueReadIndex - overflow);
        }
    }

    _drainEventQueue() {
        if (!this.synth) return;

        const queue = this._eventQueue;
        let idx = this._queueReadIndex;
        const end = queue.length;

        let processed = 0;
        while (idx < end && processed < this._maxEventsPerBlock) {
            const evt = queue[idx++];
            processed++;

            try {
                if (evt.type === 'PARAM') {
                    this.synth.set_param(evt.id, evt.value);
                } else if (evt.type === 'GET_DESCRIPTOR') {
                    if (typeof this.synth.get_descriptor === 'function') {
                        this.port.postMessage({ type: 'DESCRIPTOR', descriptor: this.synth.get_descriptor() });
                    }
                } else if (evt.type === 'GET_STATE') {
                    if (typeof this.synth.get_state === 'function') {
                        this.port.postMessage({ type: 'STATE', state: this.synth.get_state() });
                    }
                } else if (evt.type === 'SET_STATE') {
                    if (typeof this.synth.set_state === 'function') {
                        this.synth.set_state(evt.state);
                    }
                } else if (evt.type === 'LOAD_SAMPLE') {
                    const payload = evt.samplePayload && typeof evt.samplePayload === 'object' ? evt.samplePayload : null;
                    const sampleData =
                        (payload && Array.isArray(payload.channels) && payload.channels[0]) ||
                        (payload && payload.samples) ||
                        evt.samples;
                    const summary =
                        payload && Number.isFinite(payload.sampleRate) && Number.isFinite(payload.frameCount)
                            ? `${payload.channelCount || 1}ch ${payload.frameCount}f @ ${payload.sampleRate}Hz`
                            : 'legacy payload';

                    if (payload && typeof this.synth.load_sample_descriptor === 'function') {
                        this.synth.load_sample_descriptor(payload);
                        this.port.postMessage({ type: 'STATUS', msg: `Sample Loaded (${summary})` });
                    } else if (sampleData && typeof this.synth.load_sample === 'function') {
                        this.synth.load_sample(sampleData);
                        this.port.postMessage({ type: 'STATUS', msg: `Sample Loaded (${summary})` });
                    }
                } else if (evt.type === 'NOTE_ON') {
                    if (typeof this.synth.note_on === 'function') {
                        const note = Number(evt.note);
                        const velocity = Number(evt.velocity);
                        if (Number.isFinite(note) && Number.isFinite(velocity)) {
                            this.synth.note_on(note, velocity);
                        }
                    }
                } else if (evt.type === 'NOTE_OFF') {
                    if (typeof this.synth.note_off === 'function') {
                        const note = Number(evt.note);
                        if (Number.isFinite(note)) {
                            this.synth.note_off(note);
                        }
                    }
                } else if (evt.type === 'MIDI_CC') {
                    if (typeof this.synth.midi_cc === 'function') {
                        const cc = Number(evt.cc);
                        const value = Number(evt.value);
                        if (Number.isFinite(cc) && Number.isFinite(value)) {
                            this.synth.midi_cc(cc, value);
                        }
                    }
                }
            } catch (e) {
                this._reportWorkletError(evt.type, e);
            }
        }

        this._queueReadIndex = idx;
        if (this._queueReadIndex > 0 && this._queueReadIndex >= queue.length) {
            queue.length = 0;
            this._queueReadIndex = 0;
        } else if (this._queueReadIndex > 0 && this._queueReadIndex > 256) {
            queue.splice(0, this._queueReadIndex);
            this._queueReadIndex = 0;
        }
    }

    async handleMessage(event) {
        const data = event && event.data ? event.data : {};

        if (data.type === 'INIT_WASM') {
            if (globalThis.BVST_DEBUG) console.log('BVST: Initializing WASM...');
            try {
                const state = globalThis.__BVST_UNIFIED_WASM_STATE || (globalThis.__BVST_UNIFIED_WASM_STATE = {
                    ready: false,
                    initPromise: null,
                    signature: null,
                });

                const bytes = data.wasmBytes;
                if (!bytes) throw new Error('Missing wasmBytes for INIT_WASM');

                const sig = (() => {
                    try {
                        const u8 = new Uint8Array(bytes);
                        const head = Array.from(u8.subarray(0, Math.min(8, u8.length)));
                        return `${u8.length}:${head.join(',')}`;
                    } catch (_) {
                        return null;
                    }
                })();

                if (state.signature && sig && state.signature !== sig) {
                    console.warn('BVST: Different WASM bytes supplied after init; ignoring (unified WASM expected).', { prev: state.signature, next: sig });
                }

                if (!state.initPromise) {
                    state.signature = sig;
                    state.initPromise = Promise.resolve(initWasm(bytes)).then(() => {
                        state.ready = true;
                    });
                }
                await state.initPromise;

                const pluginId =
                    (typeof data.pluginId === 'string' && data.pluginId.trim())
                        ? data.pluginId
                        : (typeof data.manifestName === 'string' && data.manifestName.trim())
                              ? data.manifestName
                              : 'UniversalUtility';

                const srCandidate =
                    (typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0)
                        ? sampleRate
                        : (typeof globalThis !== 'undefined' &&
                           typeof globalThis.sampleRate === 'number' &&
                           Number.isFinite(globalThis.sampleRate) &&
                           globalThis.sampleRate > 0)
                              ? globalThis.sampleRate
                              : 48000;

                this._pluginId = pluginId;
                this._sampleRate = srCandidate;
                this._wasmReady = true;
                this._restartAttempts = 0;
                this._restartBackoff = 0;

                if (!BvstSynth || typeof BvstSynth.new !== 'function') {
                    throw new Error('BvstSynth class not available in worklet scope.');
                }

                this.synth = BvstSynth.new(srCandidate, pluginId);
                if (globalThis.BVST_DEBUG) console.log('BVST: BvstSynth instantiated.');

                this.port.postMessage({ type: 'READY' });
            } catch (e) {
                console.error('BVST: Init error', e);
                this.port.postMessage({ type: 'ERROR', error: e.toString() });
            }
            return;
        }

        // Never call into WASM directly from message handlers; enqueue and apply at the start of process()
        // to avoid re-entrant mutable borrows (wasm-bindgen "recursive use of an object" errors).
        this._enqueueEvent(data);
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;

        const outL = output[0];
        const outR = output.length > 1 ? output[1] : null;
        const blockSize = outL.length >>> 0;

        if (this.dummyInput.length !== blockSize) this.dummyInput = new Float32Array(blockSize);
        if (!this._tmpOutR || this._tmpOutR.length !== blockSize) this._tmpOutR = new Float32Array(blockSize);

        let inL = this.dummyInput;
        let inR = this.dummyInput;

        if (inputs.length > 0 && inputs[0].length > 0) {
            inL = inputs[0][0];
            if (inputs[0].length > 1) {
                inR = inputs[0][1];
            } else {
                inR = inL;
            }
        }

        if (inL.length !== blockSize) {
            if (inL.length > blockSize) {
                inL = inL.subarray(0, blockSize);
            } else {
                if (!this._tmpInL || this._tmpInL.length !== blockSize) this._tmpInL = new Float32Array(blockSize);
                this._tmpInL.fill(0);
                this._tmpInL.set(inL);
                inL = this._tmpInL;
            }
        }
        if (inR.length !== blockSize) {
            if (inR.length > blockSize) {
                inR = inR.subarray(0, blockSize);
            } else {
                if (!this._tmpInR || this._tmpInR.length !== blockSize) this._tmpInR = new Float32Array(blockSize);
                this._tmpInR.fill(0);
                this._tmpInR.set(inR);
                inR = this._tmpInR;
            }
        }

        if (!this.synth) {
            outL.fill(0);
            if (outR) outR.fill(0);

            if (this._wasmReady) {
                if (this._restartBackoff > 0) {
                    this._restartBackoff--;
                } else if (this._restartAttempts < this._maxRestartAttempts && BvstSynth && typeof BvstSynth.new === 'function') {
                    try {
                        this.synth = BvstSynth.new(this._sampleRate, this._pluginId);
                        this._reportedWorkletError = false;
                        this._restartAttempts = 0;
                        this.port.postMessage({ type: 'STATUS', msg: 'Audio engine recovered' });
                    } catch (e) {
                        this._restartAttempts++;
                        this._restartBackoff = this._restartCooldownBlocks;
                        this._reportWorkletError('RECOVER', e);
                    }
                }
            }

            return true;
        }

        try {
            this._drainEventQueue();

            const targetR = outR ? outR : this._tmpOutR;
            if (typeof this.synth.process !== 'function') throw new Error('Synth process() missing');
            this.synth.process(inL, inR, outL, targetR);
        } catch (e) {
            this._reportWorkletError('PROCESS', e);
            try { this.synth.free?.(); } catch (_) {}
            this.synth = null;
            this._eventQueue.length = 0;
            this._queueReadIndex = 0;
            this._restartBackoff = this._restartCooldownBlocks;
            this._restartAttempts = Math.min(this._restartAttempts + 1, this._maxRestartAttempts);
            return true;
        }
        return true;
    }
}

registerProcessor('bvst-processor', BvstProcessor);
