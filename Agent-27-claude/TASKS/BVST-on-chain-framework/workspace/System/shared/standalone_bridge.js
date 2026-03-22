function getQueryParam(key) {
    try {
        return new URLSearchParams(window.location.search).get(key);
    } catch (_) {
        return null;
    }
}

function cacheBustToken() {
    const t = (getQueryParam('t') || '').trim();
    return t || '';
}

function withCacheBust(url) {
    try {
        const abs = new URL(url, window.location.href);
        const t = cacheBustToken();
        if (t) abs.searchParams.set('t', t);
        return abs.toString();
    } catch (_) {
        return url;
    }
}

function emitWindowMessage(data) {
    try {
        window.dispatchEvent(new MessageEvent('message', {
            data,
            origin: window.location.origin,
            source: window,
        }));
    } catch (_) {
        window.postMessage(data, '*');
    }
}

function createAudioContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio is not supported in this browser.');
    return new Ctor();
}

export class StandaloneBridge {
    constructor(options = {}) {
        this.instanceId =
            (options && typeof options.instanceId === 'string' && options.instanceId.trim())
                ? options.instanceId.trim()
                : (getQueryParam('instanceId') || getQueryParam('instance') || 'default');
        this.audioContext = options.audioContext || createAudioContext();
        this.manifest = options.manifest && typeof options.manifest === 'object' ? options.manifest : null;
        this.manifestUrl = options.manifestUrl || './manifest.json';
        this.pluginName =
            (options && typeof options.pluginName === 'string' && options.pluginName.trim())
                ? options.pluginName.trim()
                : '';

        this.node = null;
        this.outputGain = null;
        this.analyser = null;
        this._ready = false;
        this._visMode = 'off';
        this._visRaf = 0;
        this._visFloat = null;
        this._visByte = null;
        this._queuedMessages = [];
        this._destroyed = false;
        this._messageHandler = this._handleWindowMessage.bind(this);
        this._portHandler = this._handlePortMessage.bind(this);

        window.addEventListener('message', this._messageHandler);
        this.readyPromise = this._init().catch((err) => {
            console.error('[BVST standalone] init failed', err);
            emitWindowMessage({
                type: 'ERROR',
                instanceId: this.instanceId,
                error: (err && err.message) ? err.message : String(err),
            });
        });
    }

    async _init() {
        const manifest = await this._ensureManifest();
        if (!manifest || !manifest.components || !manifest.components.audio_engine) {
            throw new Error('Standalone mode requires a manifest with components.audio_engine.');
        }

        const pluginId = this.pluginName || manifest.name || 'UniversalUtility';
        const wasmUrl = this._resolveManifestAsset(manifest.components.audio_engine);
        const processorUrl = this._deriveProcessorUrl(wasmUrl);

        await this.audioContext.audioWorklet.addModule(withCacheBust(processorUrl));

        const node = new AudioWorkletNode(this.audioContext, 'bvst-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });

        const outputGain = this.audioContext.createGain();
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 2048;

        node.connect(outputGain);
        outputGain.connect(analyser);
        analyser.connect(this.audioContext.destination);

        this.node = node;
        this.outputGain = outputGain;
        this.analyser = analyser;
        this.node.port.onmessage = this._portHandler;

        const wasmRes = await fetch(withCacheBust(wasmUrl), { cache: 'no-store' });
        if (!wasmRes.ok) {
            throw new Error(`Failed to load WASM: ${wasmUrl} (${wasmRes.status})`);
        }
        const wasmBytes = await wasmRes.arrayBuffer();

        this.node.port.postMessage({
            type: 'INIT_WASM',
            wasmBytes,
            pluginId,
            manifestName: manifest.name || pluginId,
        });
    }

    async _ensureManifest() {
        if (this.manifest) return this.manifest;
        const res = await fetch(withCacheBust(this.manifestUrl), { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`Failed to load manifest: ${this.manifestUrl} (${res.status})`);
        }
        this.manifest = await res.json();
        return this.manifest;
    }

    _resolveManifestAsset(relPath) {
        const base = new URL(this.manifestUrl, window.location.href);
        return new URL(relPath, base).toString();
    }

    _deriveProcessorUrl(wasmUrl) {
        const abs = new URL(wasmUrl, window.location.href);
        const parts = abs.pathname.split('/');
        parts[parts.length - 1] = 'processor_unified.js';
        abs.pathname = parts.join('/');
        return abs.toString();
    }

    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (_) {}
        }
    }

    _handlePortMessage(event) {
        const data = event && event.data ? event.data : {};
        if (data.type === 'READY') {
            this._ready = true;
            this._flushQueuedMessages();
            emitWindowMessage({ type: 'BVST_READY', instanceId: this.instanceId });
            return;
        }

        if (data.type === 'STATUS' || data.type === 'ERROR' || data.type === 'DESCRIPTOR' || data.type === 'STATE') {
            emitWindowMessage({ ...data, instanceId: this.instanceId });
        }
    }

    _handleWindowMessage(event) {
        if (this._destroyed) return;
        const data = event && event.data ? event.data : null;
        if (!data || typeof data.type !== 'string') return;

        const instanceId = (typeof data.instanceId === 'string' && data.instanceId) ? data.instanceId : null;
        if (instanceId && instanceId !== this.instanceId) return;

        if (data.type === 'BVST_POWER') {
            this.resume();
            return;
        }

        if (data.type === 'BVST_VISUALIZER_MODE') {
            this._setVisualizerMode(data.mode || 'off');
            return;
        }

        if (data.type === 'BVST_PARAM') {
            this._sendOrQueue({ type: 'PARAM', id: data.id, value: data.value });
            return;
        }

        if (data.type === 'NOTE_ON') {
            this.resume();
            this._sendOrQueue({ type: 'NOTE_ON', note: data.note, velocity: data.velocity });
            return;
        }

        if (data.type === 'NOTE_OFF') {
            this._sendOrQueue({ type: 'NOTE_OFF', note: data.note });
            return;
        }

        if (data.type === 'MIDI_CC') {
            this._sendOrQueue({ type: 'MIDI_CC', cc: data.cc, value: data.value });
            return;
        }

        if (data.type === 'BVST_LOAD_SAMPLE_FROM_GUI') {
            if (data.samplePayload || data.samples) {
                this._sendOrQueue({
                    type: 'LOAD_SAMPLE',
                    samplePayload: data.samplePayload || null,
                    samples: data.samples || null,
                    sourceUrl: data.sourceUrl || '',
                    sourceLabel: data.sourceLabel || '',
                    fileName: data.fileName || ''
                });
            }
        }
    }

    _sendOrQueue(message) {
        if (!message) return;
        if (this.node && this._ready) {
            this.node.port.postMessage(message);
        } else {
            this._queuedMessages.push(message);
        }
    }

    _flushQueuedMessages() {
        if (!this.node || !this._ready || this._queuedMessages.length === 0) return;
        for (const message of this._queuedMessages) {
            this.node.port.postMessage(message);
        }
        this._queuedMessages.length = 0;
    }

    _setVisualizerMode(mode) {
        this._visMode = mode || 'off';
        if (this._visMode === 'off') {
            if (this._visRaf) cancelAnimationFrame(this._visRaf);
            this._visRaf = 0;
            return;
        }
        if (!this._visRaf) {
            this._visRaf = requestAnimationFrame(() => this._visualizerLoop());
        }
    }

    _visualizerLoop() {
        this._visRaf = 0;
        if (this._destroyed || this._visMode === 'off') return;
        if (!this.analyser) {
            this._visRaf = requestAnimationFrame(() => this._visualizerLoop());
            return;
        }

        if (this._visMode === 'scope') {
            if (!this._visFloat || this._visFloat.length !== this.analyser.fftSize) {
                this._visFloat = new Float32Array(this.analyser.fftSize);
            }
            this.analyser.getFloatTimeDomainData(this._visFloat);
            emitWindowMessage({
                type: 'BVST_VIS_DATA',
                instanceId: this.instanceId,
                mode: 'scope',
                data: this._visFloat,
            });
        } else if (this._visMode === 'spectrum') {
            const n = this.analyser.frequencyBinCount;
            if (!this._visByte || this._visByte.length !== n) {
                this._visByte = new Uint8Array(n);
            }
            this.analyser.getByteFrequencyData(this._visByte);
            emitWindowMessage({
                type: 'BVST_VIS_DATA',
                instanceId: this.instanceId,
                mode: 'spectrum',
                data: this._visByte,
            });
        }

        this._visRaf = requestAnimationFrame(() => this._visualizerLoop());
    }

    destroy() {
        this._destroyed = true;
        window.removeEventListener('message', this._messageHandler);
        if (this._visRaf) cancelAnimationFrame(this._visRaf);
        this._visRaf = 0;
        try { this.node?.disconnect(); } catch (_) {}
        try { this.outputGain?.disconnect(); } catch (_) {}
        try { this.analyser?.disconnect(); } catch (_) {}
        this.node = null;
        this.outputGain = null;
        this.analyser = null;
        this._queuedMessages.length = 0;
    }
}
