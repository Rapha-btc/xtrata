import { injectKeyboardStyles } from './ui_styles.js';

export class Keyboard {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Keyboard: Container element #${containerId} not found.`);
            return;
        }

        // Options with defaults
        this.startNote = options.startNote || (options.startOctave ? (options.startOctave + 1) * 12 : 48); 
        // Backward compatibility for 'octaves' option if 'numKeys' not present
        if (!options.numKeys && options.octaves) {
            this.numKeys = options.octaves * 12;
        } else {
            this.numKeys = options.numKeys || 25;
        }
        
        this.responsive = options.responsive || false;
        this.width = options.width || '100%';
        
        // Callback wrappers to handle freq conversion if needed
        this.onNoteOn = options.onNoteOn || ((midi, freq) => {});
        this.onNoteOff = options.onNoteOff || ((midi) => {});

        // Internal state for glissando/drag tracking
        this.activeKeys = [];

        this.injectStyles();

        this._bindGlobalSafetyHandlers();

        // Apply container width
        this.container.style.width = this.width;

        if (this.responsive) {
            this.setupResponsive();
        } else {
            this.render();
        }
    }

    mtof(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    setupResponsive() {
        // Initial calc
        this.updateKeyCount();

        // Watch for resize
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    this.updateKeyCount();
                }
            }
        });
        ro.observe(this.container);
    }

    updateKeyCount() {
        if (!this.container) return;
        // Use clientWidth to get available inner width
        const width = this.container.clientWidth;
        if (width === 0) return;

        // Effective width of a white key: 40px width + 2px margin (0 1px)
        const WHITE_KEY_WIDTH = 42;
        // Reduce slightly to avoid edge rounding issues causing wrap
        const availableWhiteKeys = Math.floor((width - 20) / WHITE_KEY_WIDTH); 
        
        if (availableWhiteKeys < 1) return;

        let whiteCount = 0;
        let chromaticCount = 0;
        let currentNote = this.startNote;
        const keyNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

        while (whiteCount < availableWhiteKeys) {
            const noteName = keyNames[currentNote % 12];
            const isBlack = noteName.includes('#');
            
            if (!isBlack) {
                whiteCount++;
            }
            
            chromaticCount++;
            currentNote++;
        }

        // Update if changed
        if (this.numKeys !== chromaticCount) {
            this.numKeys = chromaticCount;
            this.render();
        }
    }

    render() {
        this.container.innerHTML = '';
        this.container.classList.add('bvst-keyboard');
        
        const keyNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        
        // 1. Calculate Totals for Sizing
        let totalWhiteKeys = 0;
        for(let i=0; i < this.numKeys; i++) {
            const midi = this.startNote + i;
            const noteName = keyNames[midi % 12];
            if (!noteName.includes('#')) totalWhiteKeys++;
        }

        // 2. Calculate flexible width percentage
        // Ensure we don't divide by zero
        const whiteKeyWidthPct = totalWhiteKeys > 0 ? (100 / totalWhiteKeys) : 10;
        const blackKeyWidthPct = whiteKeyWidthPct * 0.65;
        const blackKeyMarginPct = blackKeyWidthPct / 2;

        for(let i=0; i < this.numKeys; i++) {
            const midi = this.startNote + i;
            const noteName = keyNames[midi % 12];
            const isBlack = noteName.includes('#');
            
            const div = document.createElement('div');
            div.className = `key ${isBlack ? 'black' : 'white'}`;
            div.dataset.midi = midi;
            div.title = `${noteName} (${midi})`;
            
            // Apply Dynamic Sizing
            if (isBlack) {
                div.style.width = `${blackKeyWidthPct}%`;
                div.style.marginLeft = `-${blackKeyMarginPct}%`;
                div.style.marginRight = `-${blackKeyMarginPct}%`;
                div.style.zIndex = 2;
            } else {
                div.style.width = `${whiteKeyWidthPct}%`;
                div.style.zIndex = 1;
            }

            // Event Handlers
            const getVelocity = (e, el) => {
                const rect = el.getBoundingClientRect();
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                // Normalize 0 (top) to 1 (bottom). 
                // Usually piano keys are louder at the tip.
                let val = (clientY - rect.top) / rect.height;
                val = Math.max(0.2, Math.min(1.0, val)); // Clamp 0.2 to 1.0
                return val;
            };

            const on = (e) => this._handleNoteOn(midi, getVelocity(e, div));
            const off = () => this._handleNoteOff(midi);
            
            // Mouse
            div.onmousedown = (e) => {
                if (e.buttons === 1) on(e);
            };
            div.onmouseup = off;
            div.onmouseleave = off;
            div.onmouseenter = (e) => { 
                if(e.buttons === 1) on(e); 
            };
            
            // Touch
            div.ontouchstart = (e) => { 
                e.preventDefault(); 
                on(e); 
            };
            div.ontouchend = (e) => { 
                e.preventDefault(); 
                off(); 
            };
            
            this.container.appendChild(div);
        }

        // Glissando Support
        this.container.ontouchmove = (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el && el.classList.contains('key') && el.dataset.midi) {
                const midi = parseInt(el.dataset.midi);
                // If we moved to a new key
                if (!this.activeKeys.includes(midi)) {
                    // Estimate velocity from touch Y relative to this key
                    const rect = el.getBoundingClientRect();
                    let vel = (touch.clientY - rect.top) / rect.height;
                    vel = Math.max(0.2, Math.min(1.0, vel));
                    
                    this._handleNoteOn(midi, vel);
                }
            }
        };

        this.container.ontouchend = (e) => {
            e.preventDefault();
            this.allNotesOff();
        };
    }

    injectStyles() {
        injectKeyboardStyles();
    }

    _bindGlobalSafetyHandlers() {
        if (this._globalSafetyBound) return;
        this._globalSafetyBound = true;

        const releaseAll = () => {
            if (this.activeKeys && this.activeKeys.length > 0) this.allNotesOff();
        };

        this._releaseAllHandler = releaseAll;
        window.addEventListener('mouseup', this._releaseAllHandler);
        window.addEventListener('blur', this._releaseAllHandler);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) releaseAll();
        });
    }

    // --- API ---

    setOctave(octave) {
        // Octave 0 = MIDI 12. Octave 4 = MIDI 60 (Middle C).
        // Standard 25-key usually starts at C3 (48) or C4 (60).
        this.startNote = octave * 12;
        this.render();
    }

    shiftOctave(delta) {
        this.startNote += (delta * 12);
        // Safety clamps? MIDI 0 to 127.
        this.startNote = Math.max(0, Math.min(120, this.startNote));
        this.render();
    }

    allNotesOff() {
        [...this.activeKeys].forEach(k => this._handleNoteOff(k));
        this.activeKeys = [];
    }

    _handleNoteOn(midi, velocity = 1.0) {
        if (globalThis.BVST_DEBUG) console.log(`Keyboard: Note On ${midi} Vel ${velocity}`);
        if (this.activeKeys.includes(midi)) return;
        this.activeKeys.push(midi);
        this.setKeyVisual(midi, true);
        this.onNoteOn(midi, this.mtof(midi), velocity);
    }

    _handleNoteOff(midi) {
        // Remove from active keys
        this.activeKeys = this.activeKeys.filter(k => k !== midi);
        this.setKeyVisual(midi, false);
        this.onNoteOff(midi);
    }

    setKeyVisual(midi, active) {
        const key = this.container.querySelector(`.key[data-midi="${midi}"]`);
        if (key) {
            if (active) key.classList.add('active');
            else key.classList.remove('active');
        }
    }
    
    // Public method to trigger visual feedback from external MIDI
    triggerVisual(midi, active) {
        this.setKeyVisual(midi, active);
    }
}
