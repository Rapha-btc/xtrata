import { injectSamplerStyles } from './ui_styles.js';
// Cache-bust to avoid browsers serving an older, broken decoder module during rapid iteration.
import { canonicalizeOrdinalContentUrl, fetchAudionalAudioBytes } from './audional_decoder.js?v=1';

const DEFAULT_MAX_SAMPLE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_SAMPLE_SECONDS = 30;
const SOURCE_POLICIES = new Set(['standalone-dev', 'inscriptions-only', 'declared-only']);

function sanitizeDatasetValue(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
}

function toFloat32Array(value) {
    if (value instanceof Float32Array) return value;
    if (Array.isArray(value)) return Float32Array.from(value);
    if (ArrayBuffer.isView(value) && typeof value.length === 'number') return Float32Array.from(value);
    return null;
}

function normalizeSourcePolicy(policy, runtimeProfile) {
    const explicit = String(policy || '').trim();
    if (SOURCE_POLICIES.has(explicit)) return explicit;
    return runtimeProfile === 'standalone' ? 'standalone-dev' : 'inscriptions-only';
}

function normalizeDeclaredSources(sources, singleSource) {
    const list = [];
    if (typeof singleSource === 'string' && singleSource.trim()) {
        list.push({
            id: 'default',
            label: 'Default',
            url: canonicalizeOrdinalContentUrl(singleSource.trim())
        });
    }
    if (Array.isArray(sources)) {
        for (const entry of sources) {
            if (!entry || typeof entry !== 'object') continue;
            if (typeof entry.url !== 'string' || !entry.url.trim()) continue;
            list.push({
                id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '',
                label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : '',
                url: canonicalizeOrdinalContentUrl(entry.url.trim())
            });
        }
    }
    return list;
}

function normalizeSamplePayload(input, fallbackMeta = {}) {
    if (!input) return null;

    const direct = toFloat32Array(input);
    if (direct) {
        return {
            schema: 'bvst.sample/v1',
            channelCount: 1,
            frameCount: direct.length,
            sampleRate: Number(fallbackMeta.sampleRate) || 0,
            durationSeconds:
                Number(fallbackMeta.sampleRate) > 0
                    ? direct.length / Number(fallbackMeta.sampleRate)
                    : 0,
            channels: [direct],
            samples: direct,
            sourceUrl: typeof fallbackMeta.sourceUrl === 'string' ? fallbackMeta.sourceUrl : '',
            sourceLabel: typeof fallbackMeta.sourceLabel === 'string' ? fallbackMeta.sourceLabel : '',
            fileName: typeof fallbackMeta.fileName === 'string' ? fallbackMeta.fileName : ''
        };
    }

    if (typeof input !== 'object') return null;

    const channels = Array.isArray(input.channels)
        ? input.channels.map((channel) => toFloat32Array(channel)).filter(Boolean)
        : [];
    const sampleData = channels[0] || toFloat32Array(input.samples);
    if (!sampleData) return null;
    const normalizedChannels = channels.length > 0 ? channels : [sampleData];
    const sampleRate = Number(input.sampleRate) || Number(fallbackMeta.sampleRate) || 0;
    const frameCount = Number(input.frameCount) || sampleData.length;

    return {
        schema: typeof input.schema === 'string' && input.schema.trim() ? input.schema.trim() : 'bvst.sample/v1',
        channelCount: Number(input.channelCount) || normalizedChannels.length,
        frameCount,
        sampleRate,
        durationSeconds:
            Number(input.durationSeconds) ||
            (sampleRate > 0 ? frameCount / sampleRate : 0),
        channels: normalizedChannels,
        samples: sampleData,
        sourceUrl:
            typeof input.sourceUrl === 'string'
                ? input.sourceUrl
                : (typeof fallbackMeta.sourceUrl === 'string' ? fallbackMeta.sourceUrl : ''),
        sourceLabel:
            typeof input.sourceLabel === 'string'
                ? input.sourceLabel
                : (typeof fallbackMeta.sourceLabel === 'string' ? fallbackMeta.sourceLabel : ''),
        fileName:
            typeof input.fileName === 'string'
                ? input.fileName
                : (typeof fallbackMeta.fileName === 'string' ? fallbackMeta.fileName : '')
    };
}

export class SamplerUI {
    constructor(options = {}) {
        this.onSampleLoad = options.onSampleLoad || (() => {});
        this.onPreviewTrigger = options.onPreviewTrigger || (() => {});
        this.onSeek = options.onSeek || (() => {});

        this.audioContext = options.audioContext || new (window.AudioContext || window.webkitAudioContext)();
        this.runtimeProfile =
            typeof options.runtimeProfile === 'string' && options.runtimeProfile.trim()
                ? options.runtimeProfile.trim()
                : 'host';
        this.sourcePolicy = normalizeSourcePolicy(options.sourcePolicy, this.runtimeProfile);
        this.allowFileDrop =
            options.allowFileDrop === undefined
                ? this.sourcePolicy === 'standalone-dev'
                : Boolean(options.allowFileDrop);
        this.allowDataUrls =
            options.allowDataUrls === undefined
                ? this.sourcePolicy === 'standalone-dev'
                : Boolean(options.allowDataUrls);
        this.declaredSources = normalizeDeclaredSources(options.sources, options.source);
        this.maxSampleBytes =
            Number.isFinite(options.maxSampleBytes) && options.maxSampleBytes > 0
                ? Math.floor(options.maxSampleBytes)
                : DEFAULT_MAX_SAMPLE_BYTES;
        this.maxSampleSeconds =
            Number.isFinite(options.maxSampleSeconds) && options.maxSampleSeconds > 0
                ? Number(options.maxSampleSeconds)
                : DEFAULT_MAX_SAMPLE_SECONDS;

        this.samplePayload = null;
        this.sampleData = null;
        this.peaks = null;
        this.sampleRate = this.audioContext.sampleRate;
        this.lastSourceUrl = '';
        this.lastSourceLabel = '';
        this.lastFileName = '';

        this.state = {
            isPlaying: false,
            startTime: 0,
            startOffsetPct: 0.0,
            playSpeed: 1.0,
            reverse: false,
            loopStart: 0.0,
            loopEnd: 1.0,
            loopEnabled: false,
            note: 60,
            sliceGrid: 0,
            grainSize: 0.0,
            grainPos: 0.0
        };

        this.animFrame = null;
    }

    buildUI(containerId) {
        const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return console.error(`SamplerUI: Container '${containerId}' not found.`);

        this.injectStyles();

        container.innerHTML = `
            <div class="bvst-sampler-container">
                <div class="bvst-waveform-wrapper">
                    <canvas class="bvst-waveform-canvas"></canvas>
                    <div class="bvst-waveform-overlay">
                        <div class="bvst-marker bvst-marker-start" style="left: 0%;"></div>
                        <div class="bvst-marker bvst-marker-end" style="left: 100%;"></div>
                        <div class="bvst-playhead" style="display:none; left: 0%;"></div>
                    </div>
                    <div class="bvst-drop-hint">${this._dropHintText()}</div>
                </div>
                <div class="bvst-sampler-loader">
                    <input type="text" class="bvst-url-input" placeholder="${this._inputPlaceholder()}">
                    <button class="bvst-load-btn">LOAD</button>
                </div>
            </div>
        `;

        this.canvas = container.querySelector('.bvst-waveform-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.startMarker = container.querySelector('.bvst-marker-start');
        this.endMarker = container.querySelector('.bvst-marker-end');
        this.playhead = container.querySelector('.bvst-playhead');
        this.urlInput = container.querySelector('.bvst-url-input');
        this.loadBtn = container.querySelector('.bvst-load-btn');

        if (this.urlInput) {
            this.urlInput.dataset.policy = this.sourcePolicy;
        }

        this._setDiagnostics({
            bvstSamplerPolicy: this.sourcePolicy,
            bvstSamplerLoaded: '0'
        }, { clear: ['bvstSamplerError', 'bvstSamplerSource', 'bvstSamplerFile'] });

        this._bindEvents();
        this._setupSizing();
        this.draw();
    }

    injectStyles() {
        injectSamplerStyles();
    }

    _inputPlaceholder() {
        if (this.sourcePolicy === 'declared-only') {
            return 'Declared source ID or /content/<inscription-id>';
        }
        if (this.sourcePolicy === 'inscriptions-only') {
            return 'Inscription ID or /content/<inscription-id>';
        }
        return 'Paste inscription ID, /content URL, or data:audio URI';
    }

    _dropHintText() {
        if (this.allowFileDrop) {
            return 'DROP AUDIO HERE OR PASTE A DECLARED SOURCE BELOW';
        }
        return 'PASTE A DECLARED INSCRIPTION SOURCE BELOW';
    }

    _setDiagnostics(values = {}, { clear = [] } = {}) {
        try {
            const root = document.documentElement;
            if (!root || !root.dataset) return;
            for (const key of clear) {
                delete root.dataset[key];
            }
            for (const [key, value] of Object.entries(values)) {
                if (value === undefined || value === null || value === '') {
                    delete root.dataset[key];
                } else {
                    root.dataset[key] = sanitizeDatasetValue(value);
                }
            }
        } catch (_) {}
    }

    _setError(message) {
        this._setDiagnostics({
            bvstSamplerLoaded: '0',
            bvstSamplerError: message
        });
    }

    _setLoadedDiagnostics(payload) {
        this._setDiagnostics({
            bvstSamplerLoaded: '1',
            bvstSamplerChannels: payload.channelCount,
            bvstSamplerFrames: payload.frameCount,
            bvstSamplerRate: payload.sampleRate,
            bvstSamplerSource: payload.sourceLabel || payload.sourceUrl || payload.fileName || '',
            bvstSamplerFile: payload.fileName || ''
        }, { clear: ['bvstSamplerError'] });
    }

    _setupSizing() {
        if (!this.canvas || !this.ctx) return;

        const wrapper = this.canvas.closest('.bvst-waveform-wrapper') || this.canvas.parentElement;
        if (!wrapper) return;

        const resize = () => {
            const cssW = Math.max(1, Math.floor(wrapper.clientWidth || 1));
            const cssH = Math.max(1, Math.floor(wrapper.clientHeight || 140));
            const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

            const desiredW = cssW * dpr;
            const desiredH = cssH * dpr;
            if (this.canvas.width !== desiredW || this.canvas.height !== desiredH) {
                this.canvas.width = desiredW;
                this.canvas.height = desiredH;
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                this._canvasCssW = cssW;
                this._canvasCssH = cssH;
                if (this.sampleData) this._computePeaks(cssW);
                this.draw();
            } else {
                this._canvasCssW = cssW;
                this._canvasCssH = cssH;
            }
        };

        resize();

        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => resize());
            this._resizeObserver.observe(wrapper);
        } else {
            window.addEventListener('resize', resize, { passive: true });
        }
    }

    _findDeclaredSource(raw) {
        const input = String(raw || '').trim();
        if (!input) return null;
        const canonical = canonicalizeOrdinalContentUrl(input);
        for (const entry of this.declaredSources) {
            if (entry.url === canonical || entry.id === input || entry.label === input) {
                return entry;
            }
        }
        return null;
    }

    _resolveSourceInput(raw) {
        const input = String(raw || '').trim();
        if (!input) {
            return { ok: false, error: 'Please enter a sample source.' };
        }

        const declared = this._findDeclaredSource(input);
        if (declared) {
            return {
                ok: true,
                canonicalUrl: declared.url,
                sourceLabel: declared.label || declared.id || declared.url
            };
        }

        const canonical = canonicalizeOrdinalContentUrl(input);
        if (/^data:audio\//i.test(canonical)) {
            if (!this.allowDataUrls) {
                return { ok: false, error: 'Data URIs are disabled for this sampler profile.' };
            }
            return {
                ok: true,
                canonicalUrl: canonical,
                sourceLabel: 'data:audio'
            };
        }

        let parsed;
        try {
            parsed = new URL(canonical, window.location.href);
        } catch (_) {
            return { ok: false, error: 'Invalid sample source.' };
        }

        const sameOrigin = parsed.origin === window.location.origin;
        const isOrdinalPath = /^\/content\/[0-9a-f]{64}i\d+$/i.test(parsed.pathname);

        if (this.sourcePolicy === 'declared-only') {
            return {
                ok: false,
                error: 'This sampler accepts only declared on-chain sources.'
            };
        }

        if (this.sourcePolicy === 'inscriptions-only') {
            if (!sameOrigin || !isOrdinalPath) {
                return {
                    ok: false,
                    error: 'Only same-origin /content/<inscription-id> sources are allowed in inscription mode.'
                };
            }
            return {
                ok: true,
                canonicalUrl: parsed.toString(),
                sourceLabel: parsed.pathname
            };
        }

        if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:') {
            return {
                ok: true,
                canonicalUrl: parsed.toString(),
                sourceLabel: sameOrigin ? parsed.pathname : parsed.origin
            };
        }

        return {
            ok: true,
            canonicalUrl: parsed.toString(),
            sourceLabel: parsed.pathname || parsed.toString()
        };
    }

    _bindEvents() {
        const canonicalizeUrlInput = () => {
            if (!this.urlInput) return;
            const declared = this._findDeclaredSource(this.urlInput.value);
            if (declared) {
                this.urlInput.value = declared.id || declared.url;
                return;
            }
            const canon = canonicalizeOrdinalContentUrl(this.urlInput.value);
            if (canon && canon !== this.urlInput.value) this.urlInput.value = canon;
        };

        const getPct = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        };

        const startPreview = (e) => {
            e.preventDefault();
            const pct = getPct(e);
            this.onSeek(pct);
            this.trigger(pct);
            this.onPreviewTrigger(true);
            this.canvas.style.opacity = '0.9';
        };

        const endPreview = (e) => {
            e.preventDefault();
            this.release();
            this.onPreviewTrigger(false);
            this.canvas.style.opacity = '1.0';
        };

        this.canvas.addEventListener('mousedown', startPreview);
        this.canvas.addEventListener('touchstart', startPreview);

        this.canvas.addEventListener('mouseup', endPreview);
        this.canvas.addEventListener('mouseleave', endPreview);
        this.canvas.addEventListener('touchend', endPreview);

        this.loadBtn.addEventListener('click', () => this._loadFromUrl());
        if (this.urlInput) {
            this.urlInput.addEventListener('change', canonicalizeUrlInput);
            this.urlInput.addEventListener('blur', canonicalizeUrlInput);
            this.urlInput.addEventListener('paste', () => setTimeout(canonicalizeUrlInput, 0));
            this.urlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    canonicalizeUrlInput();
                    this._loadFromUrl();
                }
            });
        }

        const prevent = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => document.body.addEventListener(evt, prevent, false));
        document.body.addEventListener('drop', (e) => this._handleDrop(e));

        window.addEventListener('message', (e) => {
            if (!e || !e.data) return;
            if (e.data.type === 'BVST_SAMPLE_DATA') {
                if (e.data.samplePayload) {
                    this.loadSamplePayload(e.data.samplePayload);
                } else {
                    this.loadSampleData(e.data.samples, {
                        sourceUrl: e.data.url || '',
                        sourceLabel: e.data.label || '',
                        fileName: e.data.fileName || ''
                    });
                }
            }
            if (e.data.type === 'BVST_SAMPLE_SOURCE') {
                const url = (typeof e.data.url === 'string') ? e.data.url : '';
                const canon = canonicalizeOrdinalContentUrl(url);
                if (this.urlInput) this.urlInput.value = canon;
                this.lastSourceUrl = canon;
                this.lastSourceLabel = (typeof e.data.label === 'string' && e.data.label.trim())
                    ? e.data.label.trim()
                    : canon;
            }
        });
    }

    updateParam(key, value) {
        if (Object.prototype.hasOwnProperty.call(this.state, key)) {
            this.state[key] = value;
            if (key === 'loopStart') this.setStartMarker(value);
            if (key === 'loopEnd') this.setEndMarker(value);

            if (['loopStart', 'loopEnd', 'loopEnabled', 'sliceGrid', 'grainSize', 'grainPos'].includes(key)) {
                this.draw();
            }
        }
    }

    trigger(startPct = 0.0) {
        if (!this.sampleData) return;
        this.state.isPlaying = true;
        this.state.startTime = this.audioContext.currentTime;
        this.state.startOffsetPct = startPct;
        this.playhead.style.display = 'block';
        this._animate();
    }

    release() {
        this.state.isPlaying = false;
        this.playhead.style.display = 'none';
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
    }

    _animate() {
        if (!this.state.isPlaying) return;

        const now = this.audioContext.currentTime;
        const elapsed = now - this.state.startTime;

        const noteRatio = Math.pow(2, (this.state.note - 60) / 12);
        const effectiveSpeed = this.state.playSpeed * noteRatio;

        const totalSamples = this.sampleData.length;
        const playedSamples = elapsed * this.sampleRate * effectiveSpeed;

        const startSample = this.state.startOffsetPct * totalSamples;
        let currentPos;

        if (this.state.reverse) currentPos = startSample - playedSamples;
        else currentPos = startSample + playedSamples;

        if (this.state.loopEnabled) {
            const loopStartSamp = Math.floor(this.state.loopStart * totalSamples);
            const loopEndSamp = Math.floor(this.state.loopEnd * totalSamples);
            const loopLen = loopEndSamp - loopStartSamp;

            if (loopLen > 0) {
                if (!this.state.reverse && currentPos >= loopEndSamp) {
                    const overrun = currentPos - loopEndSamp;
                    currentPos = loopStartSamp + (overrun % loopLen);
                } else if (this.state.reverse && currentPos <= loopStartSamp) {
                    const underrun = loopStartSamp - currentPos;
                    currentPos = loopEndSamp - (underrun % loopLen);
                }
            }
        }

        const pct = currentPos / totalSamples;
        const inBounds = this.state.reverse ? (pct >= 0.0) : (pct <= 1.0);

        if (inBounds) {
            this.playhead.style.left = `${pct * 100}%`;
            this.animFrame = requestAnimationFrame(() => this._animate());
        } else {
            this.release();
        }
    }

    async _loadFromUrl() {
        const raw = this.urlInput ? this.urlInput.value.trim() : '';
        if (!raw) return alert('Please enter a sample source');
        const debugDecoder = (() => {
            try { return new URLSearchParams(window.location.search).has('debugDecoder'); }
            catch (_) { return false; }
        })();
        const resolved = this._resolveSourceInput(raw);
        if (!resolved.ok) {
            this._setError(resolved.error);
            if (this.loadBtn) {
                const originalText = this.loadBtn.innerText;
                this.loadBtn.innerText = 'ERR';
                setTimeout(() => {
                    this.loadBtn.innerText = originalText;
                }, 2000);
            }
            alert(resolved.error);
            return;
        }

        if (this.urlInput && resolved.canonicalUrl !== raw && !resolved.sourceLabel.startsWith('data:')) {
            this.urlInput.value = resolved.canonicalUrl;
        }

        const originalText = this.loadBtn.innerText;
        this.loadBtn.innerText = '...';
        try {
            const result = await fetchAudionalAudioBytes(resolved.canonicalUrl, { debug: debugDecoder });
            await this._decodeAndLoad(result.audioBytes, {
                sourceUrl: resolved.canonicalUrl.startsWith('data:') ? '' : (result.canonicalUrl || resolved.canonicalUrl),
                sourceLabel: resolved.sourceLabel,
                fileName: resolved.canonicalUrl.startsWith('data:') ? '' : (result.filename || '')
            });
            this.loadBtn.innerText = 'OK';
            setTimeout(() => {
                this.loadBtn.innerText = originalText;
            }, 1000);
        } catch (e) {
            const message = e && e.message ? e.message : String(e);
            console.error(e);
            this._setError(message);
            this.loadBtn.innerText = 'ERR';
            alert(message);
            setTimeout(() => {
                this.loadBtn.innerText = originalText;
            }, 2000);
        }
    }

    async _handleDrop(e) {
        const files = e && e.dataTransfer ? e.dataTransfer.files : null;
        if (!files || files.length === 0) return;
        if (!this.allowFileDrop) {
            const message = 'Local file drop is disabled for this sampler profile.';
            this._setError(message);
            alert(message);
            return;
        }
        try {
            const file = files[0];
            const buffer = await file.arrayBuffer();
            await this._decodeAndLoad(buffer, {
                sourceUrl: '',
                sourceLabel: 'local-file',
                fileName: file.name
            });
        } catch (err) {
            const message = `Drop Error: ${err && err.message ? err.message : String(err)}`;
            this._setError(message);
            alert(message);
        }
    }

    async _decodeAndLoad(arrayBuffer, meta = {}) {
        const byteLength =
            arrayBuffer && typeof arrayBuffer.byteLength === 'number'
                ? arrayBuffer.byteLength
                : (ArrayBuffer.isView(arrayBuffer) ? arrayBuffer.byteLength : 0);
        if (byteLength > this.maxSampleBytes) {
            throw new Error(`Sample is too large (${byteLength} bytes; max ${this.maxSampleBytes}).`);
        }

        const decoded = await this.audioContext.decodeAudioData(arrayBuffer);
        if (decoded.duration > this.maxSampleSeconds) {
            throw new Error(`Sample is too long (${decoded.duration.toFixed(2)}s; max ${this.maxSampleSeconds}s).`);
        }

        const channels = [];
        for (let index = 0; index < decoded.numberOfChannels; index += 1) {
            channels.push(Float32Array.from(decoded.getChannelData(index)));
        }

        const payload = {
            schema: 'bvst.sample/v1',
            channelCount: channels.length,
            frameCount: decoded.length,
            sampleRate: decoded.sampleRate,
            durationSeconds: decoded.duration,
            channels,
            samples: channels[0] || null,
            sourceUrl: typeof meta.sourceUrl === 'string' ? meta.sourceUrl : '',
            sourceLabel: typeof meta.sourceLabel === 'string' ? meta.sourceLabel : '',
            fileName: typeof meta.fileName === 'string' ? meta.fileName : ''
        };

        this.loadSamplePayload(payload);
        this.onSampleLoad(this.samplePayload);
    }

    loadSamplePayload(payload) {
        const normalized = normalizeSamplePayload(payload, {
            sampleRate: this.audioContext.sampleRate
        });
        if (!normalized) return;
        this.samplePayload = normalized;
        this.sampleData = normalized.samples;
        this.sampleRate = normalized.sampleRate || this.audioContext.sampleRate;
        this.lastSourceUrl = normalized.sourceUrl || '';
        this.lastSourceLabel = normalized.sourceLabel || normalized.sourceUrl || '';
        this.lastFileName = normalized.fileName || '';
        this._setLoadedDiagnostics(normalized);
        if (this.canvas) {
            const cssW = this._canvasCssW || Math.max(1, Math.floor(this.canvas.getBoundingClientRect().width || this.canvas.width || 300));
            this._computePeaks(cssW);
        }
        this.draw();
    }

    loadSampleData(float32Array, meta = {}) {
        this.loadSamplePayload({
            schema: 'bvst.sample/v1',
            sampleRate: Number(meta.sampleRate) || this.audioContext.sampleRate,
            channels: [float32Array],
            samples: float32Array,
            sourceUrl: typeof meta.sourceUrl === 'string' ? meta.sourceUrl : '',
            sourceLabel: typeof meta.sourceLabel === 'string' ? meta.sourceLabel : '',
            fileName: typeof meta.fileName === 'string' ? meta.fileName : ''
        });
    }

    _computePeaks(width) {
        if (!this.sampleData) return;
        this.peaks = new Float32Array(width * 2);
        const step = Math.max(1, Math.floor(this.sampleData.length / width));

        for (let i = 0; i < width; i += 1) {
            let min = 1.0;
            let max = -1.0;
            const startIdx = i * step;
            for (let j = 0; j < step; j += 1) {
                const idx = startIdx + j;
                if (idx < this.sampleData.length) {
                    const val = this.sampleData[idx];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            }
            if (min > max) min = max = 0;
            this.peaks[i * 2] = min;
            this.peaks[i * 2 + 1] = max;
        }
    }

    draw() {
        if (!this.canvas) return;

        const wCss = this._canvasCssW || Math.max(1, Math.floor(this.canvas.getBoundingClientRect().width || this.canvas.width || 300));
        const hCss = this._canvasCssH || Math.max(1, Math.floor(this.canvas.getBoundingClientRect().height || this.canvas.height || 140));
        if (this.sampleData && (!this.peaks || this.peaks.length !== wCss * 2)) {
            this._computePeaks(wCss);
        }

        const w = wCss;
        const h = hCss;
        const ctx = this.ctx;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        if (!this.peaks) return;

        ctx.lineWidth = 1;
        ctx.strokeStyle = '#00f0ff';
        ctx.beginPath();

        const amp = h / 2;

        for (let i = 0; i < w; i += 1) {
            const min = this.peaks[i * 2];
            const max = this.peaks[i * 2 + 1];

            ctx.moveTo(i, amp + min * amp * 0.9);
            ctx.lineTo(i, amp + max * amp * 0.9);
        }
        ctx.stroke();

        if (this.state.loopEnabled || (this.state.loopStart > 0 || this.state.loopEnd < 1)) {
            const startX = this.state.loopStart * w;
            const endX = this.state.loopEnd * w;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

            if (startX > 0) ctx.fillRect(0, 0, startX, h);
            if (endX < w) ctx.fillRect(endX, 0, w - endX, h);

            ctx.fillStyle = 'rgba(0, 255, 200, 0.05)';
            ctx.fillRect(startX, 0, endX - startX, h);
        }

        if (this.state.sliceGrid > 0) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const sliceCount = Math.floor(this.state.sliceGrid);
            const sliceW = w / sliceCount;
            for (let i = 1; i < sliceCount; i += 1) {
                const x = i * sliceW;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
            }
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,0,0.8)';
            ctx.font = '10px monospace';
            for (let i = 0; i < sliceCount; i += 1) {
                ctx.fillText(String(i + 1), i * sliceW + 5, 12);
            }
        }

        if (this.state.grainSize > 0) {
            const cx = this.state.grainPos * w;
            const halfW = (this.state.grainSize * w) / 2;

            ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
            ctx.fillRect(cx - halfW, 0, halfW * 2, h);

            ctx.strokeStyle = '#f0f';
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, h);
            ctx.stroke();
        }
    }

    setStartMarker(percent) {
        if (this.startMarker) this.startMarker.style.left = `${percent * 100}%`;
    }

    setEndMarker(percent) {
        if (this.endMarker) this.endMarker.style.left = `${percent * 100}%`;
    }
}
