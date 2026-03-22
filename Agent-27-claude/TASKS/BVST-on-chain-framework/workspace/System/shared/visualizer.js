import { injectVisualizerStyles } from './ui_styles.js';

function getQueryParam(key) {
    try {
        return new URLSearchParams(window.location.search).get(key);
    } catch (_) {
        return null;
    }
}

export class Visualizer {
    constructor(config = {}) {
        this.mode = config.mode || 'scope'; // scope, spectrum
        this.containerId = config.containerId;
        this.instanceId =
            (config && typeof config.instanceId === 'string' && config.instanceId.trim())
                ? config.instanceId.trim()
                : (getQueryParam('instanceId') || getQueryParam('instance') || 'default');
        this.canvas = null;
        this.ctx = null;
        this.data = null;
        this.colors = { scope: '#00f0ff', spectrum: '#ff0055', trail: 'rgba(0,0,0,0.2)' };
        
        // Listen for data from Host
        window.addEventListener('message', (e) => {
            if (e.data.type === 'BVST_VIS_DATA') {
                if (e.data.instanceId && e.data.instanceId !== this.instanceId) return;
                this.data = e.data.data; // Float32Array or Uint8Array
                this.draw();
            }
        });
        
        // Notify Host to start sending data
        this.start();
    }

    start() {
        window.parent.postMessage({ type: 'BVST_VISUALIZER_MODE', instanceId: this.instanceId, mode: this.mode }, '*');
    }

    stop() {
        window.parent.postMessage({ type: 'BVST_VISUALIZER_MODE', instanceId: this.instanceId, mode: 'off' }, '*');
    }

    buildUI(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        injectVisualizerStyles();

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'bvst-visualizer';
        
        container.appendChild(this.canvas);
        
        // Read CSS variables
        const style = getComputedStyle(this.canvas);
        this.colors.scope = style.getPropertyValue('--viz-scope-color').trim() || '#00f0ff';
        this.colors.spectrum = style.getPropertyValue('--viz-spectrum-color').trim() || '#ff0055';
        this.colors.trail = style.getPropertyValue('--viz-trail-color').trim() || 'rgba(0,0,0,0.2)';
        this.colors.grid = style.getPropertyValue('--viz-grid-color').trim() || 'rgba(255,255,255,0.1)';

        // Resize observer to handle layout changes
        new ResizeObserver(() => {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }).observe(this.canvas);

        this.ctx = this.canvas.getContext('2d');
    }

    draw() {
        if (!this.canvas || !this.ctx || !this.data) return;
        
        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;
        
        ctx.fillStyle = this.colors.trail; 
        ctx.fillRect(0, 0, w, h);
        
        this.drawGrid(ctx, w, h);
        
        const len = this.data.length;

        if (this.mode === 'scope') {
            ctx.lineWidth = 2;
            ctx.strokeStyle = this.colors.scope;
            ctx.beginPath();
            
            // Optimization: Step skip
            const step = Math.max(1, Math.ceil(len / w));
            const sliceWidth = w * 1.0 / (len / step);
            let x = 0;
            
            for(let i = 0; i < len; i += step) {
                const v = this.data[i] * 0.5 + 0.5; 
                const y = v * h;
                
                if(i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                
                x += sliceWidth;
            }
            ctx.stroke();
        } else if (this.mode === 'spectrum') {
            ctx.fillStyle = this.colors.spectrum;
            
            // Logarithmic Scale
            // Freq range 0 to Nyquist (approx 22050).
            // We want log x-axis.
            // Map bin index i to x.
            // log(i) / log(len) * w ?
            // Low bins (bass) need more space.
            
            for(let i = 0; i < len; i++) {
                const v = this.data[i] / 255.0; 
                if (v < 0.01) continue; // Skip silence

                const barHeight = v * h;
                
                // Log Map: x = log(i) / log(len) * w
                // Avoid log(0)
                const logI = Math.log10(i + 1);
                const logLen = Math.log10(len + 1);
                const x = (logI / logLen) * w;
                
                // Width depends on next bin's x
                const logNext = Math.log10(i + 2);
                const nextX = (logNext / logLen) * w;
                const barWidth = Math.max(1, nextX - x); // At least 1px

                ctx.fillRect(x, h - barHeight, barWidth, barHeight);
            }
        }
    }

    drawGrid(ctx, w, h) {
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        // Horizontal (0, +/- 0.5 for scope, or dB lines for spec)
        ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
        
        // Vertical (Grid lines)
        for(let i=1; i<4; i++) {
            const x = (w / 4) * i;
            ctx.moveTo(x, 0); ctx.lineTo(x, h);
        }
        ctx.stroke();
    }
}
