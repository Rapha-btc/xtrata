import { injectSamplerStyles } from './ui_styles.js';
// Cache-bust to avoid browsers serving an older, broken decoder module during rapid iteration.
import { fetchAudionalAudioBytes } from './audional_decoder.js?v=1';

export class SamplerUI {
    constructor(options = {}) {
        this.onSampleLoad = options.onSampleLoad || (() => {});
        this.onPreviewTrigger = options.onPreviewTrigger || ((active) => {});
        this.onSeek = options.onSeek || ((pct) => {});
        
        this.audioContext = options.audioContext || new (window.AudioContext || window.webkitAudioContext)();
        this.sampleData = null; // Float32Array
        this.peaks = null;      // Pre-calculated display data
        this.sampleRate = this.audioContext.sampleRate;
        this.lastSourceUrl = '';
        this.lastFileName = '';

        // Playback State
        this.state = {
            isPlaying: false,
            startTime: 0,
            startOffsetPct: 0.0, // Start position normalized 0-1
            playSpeed: 1.0,
            reverse: false,
            loopStart: 0.0, // 0.0 to 1.0
            loopEnd: 1.0,   // 0.0 to 1.0
            loopEnabled: false,
            note: 60, // Base note for tracking pitch shifts
            sliceGrid: 0, // Number of slices to visualize (0 = off)
            grainSize: 0.0, // Width of grain window (0.0 = off)
            grainPos: 0.0   // Center position of grain
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
                    <div class="bvst-drop-hint">DROP AUDIO HERE OR PASTE URL BELOW</div>
                </div>
                <div class="bvst-sampler-loader">
                    <input type="text" class="bvst-url-input" placeholder="https://example.com/sample.mp3">
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

        this._bindEvents();
        this._setupSizing();
        this.draw(); // Initial draw
    }

    injectStyles() {
        injectSamplerStyles();
    }

    _setupSizing() {
        if (!this.canvas || !this.ctx) return;

        const wrapper = this.canvas.closest('.bvst-waveform-wrapper') || this.canvas.parentElement;
        if (!wrapper) return;

        const resize = () => {
            const cssW = Math.max(1, Math.floor(wrapper.clientWidth || 1));
            const cssH = Math.max(1, Math.floor(wrapper.clientHeight || 140));
            const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

            // Only resize when needed to avoid blowing away the drawing state constantly.
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

    _bindEvents() {
        const canonicalizeOrdinalContentUrl = (raw) => {
            const input = String(raw || '').trim();
            if (!input) return '';
            const isId = (s) => /^[0-9a-f]{64}i\d+$/i.test(s);
            try {
                const u = new URL(input, window.location.href);
                const seg = u.pathname.split('/').filter(Boolean).pop() || '';
                if (isId(seg)) {
                    u.pathname = `/content/${seg}`;
                    u.search = '';
                    u.hash = '';
                    return u.toString();
                }
                return input;
            } catch (_) {
                const m = input.match(/([0-9a-f]{64}i\d+)$/i);
                if (m) return `/content/${m[1]}`;
                return input;
            }
        };

        const canonicalizeUrlInput = () => {
            if (!this.urlInput) return;
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

        const container = this.canvas.parentElement; 
        const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => document.body.addEventListener(evt, prevent, false));
        document.body.addEventListener('drop', (e) => this._handleDrop(e));

        window.addEventListener('message', (e) => {
            if (e.data.type === 'BVST_SAMPLE_DATA') this.loadSampleData(e.data.samples);
            if (e.data.type === 'BVST_SAMPLE_SOURCE') {
                const url = (e.data && typeof e.data.url === 'string') ? e.data.url : '';
                const canon = canonicalizeOrdinalContentUrl(url);
                if (this.urlInput) this.urlInput.value = canon;
                this.lastSourceUrl = canon;
            }
        });
    }

    // --- API ---

    updateParam(key, value) {
        if (this.state.hasOwnProperty(key)) {
            this.state[key] = value;
            // Update UI markers immediately if needed
            if (key === 'loopStart') this.setStartMarker(value);
            if (key === 'loopEnd') this.setEndMarker(value);
            
            // Redraw to update shading and grids
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

    // --- LOGIC ---

    _animate() {
        if (!this.state.isPlaying) return;

        const now = this.audioContext.currentTime;
        const elapsed = now - this.state.startTime;
        
        // Calculate Playhead Position
        const noteRatio = Math.pow(2, (this.state.note - 60) / 12);
        const effectiveSpeed = this.state.playSpeed * noteRatio;
        
        const totalSamples = this.sampleData.length;
        const playedSamples = elapsed * this.sampleRate * effectiveSpeed;
        
        const startSample = this.state.startOffsetPct * totalSamples;
        let currentPos;

        if (this.state.reverse) {
            currentPos = startSample - playedSamples;
        } else {
            currentPos = startSample + playedSamples;
        }

        // Loop Logic
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
        
        // Stop conditions (if no loop)
        const inBounds = this.state.reverse ? (pct >= 0.0) : (pct <= 1.0);
        
        if (inBounds) {
            this.playhead.style.left = (pct * 100) + '%';
            this.animFrame = requestAnimationFrame(() => this._animate());
        } else {
            this.release(); 
        }
    }

    // --- LOADING & DRAWING ---

    async _loadFromUrl() {
        const url = this.urlInput.value.trim();
        if (!url) return alert("Please enter a URL");
        const debugDecoder = (() => {
            try { return new URLSearchParams(window.location.search).has('debugDecoder'); }
            catch (_) { return false; }
        })();
        // If an Ordinals inscription ID is present as the last URL segment, use `/content/<id>`.
        const canonUrl = (() => {
            const isId = (s) => /^[0-9a-f]{64}i\d+$/i.test(s);
            try {
                const u = new URL(url, window.location.href);
                const seg = u.pathname.split('/').filter(Boolean).pop() || '';
                if (isId(seg)) {
                    u.pathname = `/content/${seg}`;
                    u.search = '';
                    u.hash = '';
                    return u.toString();
                }
            } catch (_) {}
            const m = url.match(/([0-9a-f]{64}i\d+)$/i);
            return m ? `/content/${m[1]}` : url;
        })();
        if (canonUrl !== url && this.urlInput) this.urlInput.value = canonUrl;
        const originalText = this.loadBtn.innerText;
        this.loadBtn.innerText = "...";
        try {
            const result = await fetchAudionalAudioBytes(canonUrl, { debug: debugDecoder });
            await this._decodeAndLoad(result.audioBytes, { sourceUrl: result.canonicalUrl || canonUrl });
            this.loadBtn.innerText = "OK";
            setTimeout(() => this.loadBtn.innerText = originalText, 1000);
        } catch (e) {
            console.error(e);
            this.loadBtn.innerText = "ERR";
            alert(e.message);
            setTimeout(() => this.loadBtn.innerText = originalText, 2000);
        }
    }

    async _handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            try {
                const file = files[0];
                const buffer = await file.arrayBuffer();
                await this._decodeAndLoad(buffer, { fileName: file.name });
            } catch (err) { alert("Drop Error: " + err.message); }
        }
    }

    async _decodeAndLoad(arrayBuffer, meta = {}) {
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const data = audioBuffer.getChannelData(0);
        this.loadSampleData(data);
        const sourceUrl = meta && typeof meta.sourceUrl === 'string' ? meta.sourceUrl : '';
        const fileName = meta && typeof meta.fileName === 'string' ? meta.fileName : '';
        if (sourceUrl) {
            this.lastSourceUrl = sourceUrl;
            this.lastFileName = '';
        } else if (fileName) {
            this.lastFileName = fileName;
            this.lastSourceUrl = '';
        }
        this.onSampleLoad({ samples: data, sourceUrl: this.lastSourceUrl, fileName: this.lastFileName });
    }

    loadSampleData(float32Array) {
        this.sampleData = float32Array;
        // Pre-compute peaks for the current canvas width
        if (this.canvas) {
            const cssW = this._canvasCssW || Math.max(1, Math.floor(this.canvas.getBoundingClientRect().width || this.canvas.width || 300));
            this._computePeaks(cssW);
        }
        this.draw();
    }

    _computePeaks(width) {
        if (!this.sampleData) return;
        this.peaks = new Float32Array(width * 2); // pairs of min, max
        const step = Math.max(1, Math.floor(this.sampleData.length / width));
        
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            const startIdx = i * step;
            for (let j = 0; j < step; j++) {
                const idx = startIdx + j;
                if (idx < this.sampleData.length) {
                    const val = this.sampleData[idx];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            }
            if (min > max) min = max = 0;
            this.peaks[i*2] = min;
            this.peaks[i*2+1] = max;
        }
    }

    draw() {
        if (!this.canvas) return;
        
        // Handle resize: recompute peaks if width changed significantly
        const wCss = this._canvasCssW || Math.max(1, Math.floor(this.canvas.getBoundingClientRect().width || this.canvas.width || 300));
        const hCss = this._canvasCssH || Math.max(1, Math.floor(this.canvas.getBoundingClientRect().height || this.canvas.height || 140));
        if (this.sampleData && (!this.peaks || this.peaks.length !== wCss * 2)) {
             this._computePeaks(wCss);
        }

        const w = wCss;
        const h = hCss;
        const ctx = this.ctx;

        // Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);
        
        // Zero Line
        ctx.strokeStyle = '#222';
        ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

        if (!this.peaks) return;

        // Waveform
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#00f0ff';
        ctx.beginPath();
        
        const amp = h / 2;

        for (let i = 0; i < w; i++) {
            const min = this.peaks[i*2];
            const max = this.peaks[i*2+1];
            
            ctx.moveTo(i, amp + min * amp * 0.9);
            ctx.lineTo(i, amp + max * amp * 0.9);
        }
        ctx.stroke();

        // Loop Regions Shading (Dim the non-active parts)
        if (this.state.loopEnabled || (this.state.loopStart > 0 || this.state.loopEnd < 1)) {
            const startX = this.state.loopStart * w;
            const endX = this.state.loopEnd * w;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            
            // Left Dim
            if (startX > 0) ctx.fillRect(0, 0, startX, h);
            
            // Right Dim
            if (endX < w) ctx.fillRect(endX, 0, w - endX, h);
            
            // Active Region Highlight (subtle)
            ctx.fillStyle = 'rgba(0, 255, 200, 0.05)';
            ctx.fillRect(startX, 0, endX - startX, h);
        }

        // Slice Grid
        if (this.state.sliceGrid > 0) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const sliceCount = Math.floor(this.state.sliceGrid);
            const sliceW = w / sliceCount;
            for (let i = 1; i < sliceCount; i++) {
                const x = i * sliceW;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
            }
            ctx.stroke();
            
            // Draw slice numbers
            ctx.fillStyle = 'rgba(255,255,0,0.8)';
            ctx.font = '10px monospace';
            for (let i = 0; i < sliceCount; i++) {
                ctx.fillText((i+1).toString(), i * sliceW + 5, 12);
            }
        }

        // Grain Window
        if (this.state.grainSize > 0) {
            const cx = this.state.grainPos * w;
            const halfW = (this.state.grainSize * w) / 2;
            
            ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
            ctx.fillRect(cx - halfW, 0, halfW * 2, h);
            
            ctx.strokeStyle = '#f0f';
            ctx.beginPath();
            ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
            ctx.stroke();
        }
    }

    setStartMarker(percent) {
        if (this.startMarker) this.startMarker.style.left = (percent * 100) + '%';
    }

    setEndMarker(percent) {
        if (this.endMarker) this.endMarker.style.left = (percent * 100) + '%';
    }
}
