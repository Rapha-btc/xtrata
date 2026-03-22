import { injectControlsStyles } from './ui_styles.js';

export class Controls {
    constructor(options = {}) {
        this.knobSelector = options.knobSelector || '.knob';
        this.sliderSelector = options.sliderSelector || '.slider';
        this.switchSelector = options.switchSelector || '.switch';
        this.buttonSelector = options.buttonSelector || '.button';
        
        this.onChange = options.onChange || ((id, value) => {});
        
        this.activeControl = null;
        this.startPos = { x: 0, y: 0 };
        this.startVal = 0;
        this.activeButton = null;

        // Global listeners (attached once)
        this._bindGlobals();

        if (options.injectStyles !== false) {
            this.injectStyles();
        }
        this.init();
    }

    _bindGlobals() {
        if (this._globalsBound) return;
        this._globalsBound = true;

        // Global move/up for dragging (Pointer Events unify mouse/touch/stylus).
        window.addEventListener('pointermove', (e) => this.handleMove(e), { passive: false });
        window.addEventListener('pointerup', (e) => this.handleUp(e));
        window.addEventListener('pointercancel', (e) => this.handleUp(e));
    }

    injectStyles() {
        injectControlsStyles();
    }

    // Build the entire UI from a JSON config
    buildUI(containerId, config) {
        const container = document.getElementById(containerId);
        if(!container) { console.error(`Container #${containerId} not found`); return; }
        
        container.innerHTML = ''; // Clear
        
        // App Wrapper
        const app = document.createElement('div');
        app.className = 'bvst-app';
        app.id = 'bvst-app-root';
        
        // 1. Top Bar
        const topBar = document.createElement('div');
        topBar.className = 'bvst-top-bar';
        topBar.innerHTML = `
            <h1 class="bvst-title">${config.name || 'BVST Synth'}</h1>
            <select id="preset-selector" class="bvst-select" style="width: 200px;"></select>
            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.8rem;">
                MIDI: <select id="midi-in" class="bvst-select" style="width:100px; margin:0;"><option>None</option></select>
                <div id="midi-led" style="width:10px; height:10px; background:#333; border-radius:50%;"></div>
            </div>
        `;
        app.appendChild(topBar);

        // 2. Controls Grid
        const grid = document.createElement('div');
        grid.className = 'bvst-controls-grid';

        if (config.modules) {
            config.modules.forEach(mod => {
                const modDiv = document.createElement('div');
                modDiv.className = 'bvst-module';
                if(mod.cols) modDiv.style.gridColumn = `span ${mod.cols}`;
                
                if (mod.name) {
                    const h3 = document.createElement('h3');
                    h3.innerText = mod.name;
                    modDiv.appendChild(h3);
                }

                // Row container for controls
                const row = document.createElement('div');
                row.className = 'bvst-row';
                
                if (mod.controls) {
                    mod.controls.forEach(ctrl => {
                        row.appendChild(this.createControlElement(ctrl));
                    });
                }
                
                modDiv.appendChild(row);
                grid.appendChild(modDiv);
            });
        }

        app.appendChild(grid);
        
        // 3. Keyboard / Footer area (Generic placeholder)
        const kbContainer = document.createElement('div');
        kbContainer.id = 'keyboard-container';
        kbContainer.style.background = '#000';
        kbContainer.style.borderTop = '2px solid #007a82';
        kbContainer.style.paddingTop = '5px';
        kbContainer.style.minHeight = '100px';
        kbContainer.innerHTML = '<div id="piano"></div>';
        app.appendChild(kbContainer);

        container.appendChild(app);

        // Re-init listeners now that DOM is built
        this.init();

        this.uiRefs = {
            presetSelector: document.getElementById('preset-selector'),
            midiInSelector: document.getElementById('midi-in')
        };
        return this.uiRefs;
    }

    createControlElement(def) {
        // Common attrs
        const defVal = def.default !== undefined ? def.default : (def.val || 0);
        const attrs = `id="${def.id}" data-param="${def.param}" data-min="${def.min||0}" data-max="${def.max||1}" data-val="${def.val||0}" data-def="${defVal}" data-step="${def.step||0}"`;

        if (def.type === 'knob') {
            const div = document.createElement('div');
            div.className = 'knob-container';
            div.innerHTML = `
                <div class="knob-outer">
                    <div class="knob-track">
                        <div class="knob" ${attrs} data-curve="${def.curve||'linear'}">
                            <div class="knob-rotator"></div>
                        </div>
                    </div>
                </div>
                <div class="knob-value"></div>
                <div class="knob-label">${def.label}</div>
            `;
            return div;
        } 
        else if (def.type === 'select') {
            const sel = document.createElement('select');
            sel.className = 'bvst-select';
            sel.id = def.id;
            sel.dataset.param = def.param;
            if(def.options) {
                def.options.forEach((opt, idx) => {
                    const o = document.createElement('option');
                    o.value = idx;
                    o.innerText = opt;
                    if(idx === def.val) o.selected = true;
                    sel.appendChild(o);
                });
            }
            sel.addEventListener('change', (e) => {
                if(this.onChange) this.onChange(def.id, parseFloat(e.target.value));
            });
            return sel;
        } 
        else if (def.type === 'slider') {
            const div = document.createElement('div');
            div.className = 'slider-container';
            const isHoriz = def.orientation === 'horizontal';
            const orientClass = isHoriz ? 'horizontal' : '';
            
            div.innerHTML = `
                <div class="slider-track slider ${orientClass}" ${attrs}>
                    <div class="slider-handle"></div>
                </div>
            `;
            // Label?
            if(def.label) {
                const label = document.createElement('div');
                label.className = 'knob-label'; // Reuse style
                label.innerText = def.label;
                if(isHoriz) div.appendChild(label); 
                else div.prepend(label); // Label on top for vertical
            }
            return div;
        }
        else if (def.type === 'switch') {
            const div = document.createElement('div');
            div.className = 'switch-container';
            div.innerHTML = `
                <div class="switch-track" ${attrs}>
                    <div class="switch-handle"></div>
                </div>
                <div class="knob-label">${def.label}</div>
            `;
            // Ensure proper class on track for selector
            div.querySelector('.switch-track').classList.add('switch');
            return div;
        }
        else if (def.type === 'button') {
            const div = document.createElement('div');
            div.className = 'button-container';
            div.innerHTML = `
                <div class="button" ${attrs}>${def.text || 'TRIG'}</div>
                <div class="knob-label">${def.label || ''}</div>
            `;
            return div;
        }
        
        return document.createElement('div');
    }

    init() {
        this.attachListeners();
        // Update all visuals initially
        document.querySelectorAll(this.knobSelector).forEach(el => this.updateKnobVisual(el));
        document.querySelectorAll(this.sliderSelector).forEach(el => this.updateSliderVisual(el));
        document.querySelectorAll(this.switchSelector).forEach(el => this.updateSwitchVisual(el));

        // Prevent touch scrolling/panning while interacting with controls.
        document.querySelectorAll(`${this.knobSelector},${this.sliderSelector},${this.switchSelector},${this.buttonSelector}`)
            .forEach(el => { el.style.touchAction = 'none'; });
    }

    attachListeners() {
        if (this._delegatedBound) return;
        this._delegatedBound = true;

        document.addEventListener('pointerdown', (e) => {
            const knob = e.target.closest(this.knobSelector);
            if (knob) return this.handleDown(e, knob, 'knob');

            const slider = e.target.closest(this.sliderSelector);
            if (slider) return this.handleDown(e, slider, 'slider');

            const button = e.target.closest(this.buttonSelector);
            if (button) {
                e.preventDefault();
                this.activeButton = { el: button, pointerId: e.pointerId };
                try { button.setPointerCapture(e.pointerId); } catch (_) {}
                this.triggerButton(button, 1);
            }
        }, { passive: false });

        document.addEventListener('click', (e) => {
            const sw = e.target.closest(this.switchSelector);
            if (!sw) return;
            e.preventDefault();
            this.toggleSwitch(sw);
        });

        document.addEventListener('dblclick', (e) => {
            const knob = e.target.closest(this.knobSelector);
            if (knob) return this.handleDblClick(e, knob);
            const slider = e.target.closest(this.sliderSelector);
            if (slider) return this.handleDblClick(e, slider);
        });

        document.addEventListener('wheel', (e) => {
            const knob = e.target.closest(this.knobSelector);
            if (knob) return this.handleWheel(e, knob);
            const slider = e.target.closest(this.sliderSelector);
            if (slider) return this.handleWheel(e, slider);
        }, { passive: false });
    }

    // --- Interaction Handlers ---

    handleDblClick(e, el) {
        e.preventDefault();
        const def = parseFloat(el.dataset.def);
        if (!isNaN(def)) {
            this.updateValue(el, def);
        }
    }

    handleWheel(e, el) {
        e.preventDefault();
        const min = parseFloat(el.dataset.min || 0);
        const max = parseFloat(el.dataset.max || 100);
        const step = parseFloat(el.dataset.step || 0);
        const current = parseFloat(el.dataset.value || el.dataset.val || 0);
        
        // Determine increment
        const range = max - min;
        // Base increment is 5% of range or step size
        let inc = step > 0 ? step : range * 0.05;
        
        if (e.shiftKey) inc *= 0.1; // Fine tuning
        
        if (e.deltaY > 0) inc = -inc;
        
        let newVal = current + inc;
        newVal = Math.max(min, Math.min(max, newVal));
        
        this.updateValue(el, newVal);
    }

    handleDown(e, el, type) {
        e.preventDefault();
        const min = parseFloat(el.dataset.min || 0);
        const max = parseFloat(el.dataset.max || 100);
        const isLog = el.dataset.curve === 'log';
        const horizontal = type === 'slider' && el.classList.contains('horizontal');

        this.activeControl = {
            el,
            type,
            pointerId: e.pointerId,
            min,
            max,
            isLog,
            horizontal,
            range: max - min,
            pixelRange: type === 'slider'
                ? (() => {
                      const rect = el.getBoundingClientRect();
                      return (horizontal ? rect.width : rect.height) || 150;
                  })()
                : 200,
            normStart: null,
        };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        
        const clientX = e.clientX;
        const clientY = e.clientY;
        
        this.startPos = { x: clientX, y: clientY };

        if (type === 'slider') {
            // Absolute Jump
            const rect = el.getBoundingClientRect();

            let norm;
            if (horizontal) {
                norm = (clientX - rect.left) / rect.width;
            } else {
                // Vertical: Bottom is 0, Top is 1
                norm = 1.0 - ((clientY - rect.top) / rect.height);
            }
            norm = Math.max(0, Math.min(1, norm));

            // Map to value
            this.startVal = min + norm * (max - min);
            this.updateValue(el, this.startVal);

        } else {
            // Knob: Relative Catch
            this.startVal = parseFloat(el.dataset.value || el.dataset.val || 0);
            if (isLog) this.activeControl.normStart = this.valToNorm(this.startVal, min, max);
        }
        
        document.body.style.cursor = type === 'knob' || (!el.classList.contains('horizontal') && type === 'slider') 
            ? 'ns-resize' 
            : 'ew-resize';

        // Show Value
        const container = el.closest('.knob-container, .slider-container');
        if (container) {
            const valDisplay = container.querySelector('.knob-value');
            if (valDisplay) valDisplay.style.display = 'block';
        }
    }

    handleMove(e) {
        if (!this.activeControl) return;
        if (this.activeControl.pointerId !== undefined && e.pointerId !== this.activeControl.pointerId) return;
        e.preventDefault(); // Stop scroll

        const { el, type, min, max, isLog, range, horizontal, pixelRange, normStart } = this.activeControl;
        const clientX = e.clientX;
        const clientY = e.clientY;

        // Fine Tuning
        const speedFactor = e.shiftKey ? 0.1 : 1.0;

        let newVal;

        if (type === 'knob') {
            const deltaY = this.startPos.y - clientY; // Up is positive

            if (isLog) {
                let norm = (normStart ?? this.valToNorm(this.startVal, min, max)) + ((deltaY / pixelRange) * speedFactor);
                norm = Math.max(0, Math.min(1, norm));
                newVal = this.normToVal(norm, min, max);
            } else {
                const change = ((deltaY / pixelRange) * range) * speedFactor;
                newVal = this.startVal + change;
                newVal = Math.max(min, Math.min(max, newVal));
            }
        } else if (type === 'slider') {
            // Responsive Drag
            const delta = horizontal ? (clientX - this.startPos.x) : (this.startPos.y - clientY);
            const change = ((delta / pixelRange) * range) * speedFactor;
            newVal = this.startVal + change;
            newVal = Math.max(min, Math.min(max, newVal));
        }

        this.updateValue(el, newVal);
    }

    updateValue(el, val) {
        const step = parseFloat(el.dataset.step || 0);
        const type = el.classList.contains('knob') ? 'knob' : (el.classList.contains('slider-track') ? 'slider' : 'other');

        // Step
        if (step > 0) {
            val = Math.round(val / step) * step;
        }
        
        // Precision
        if (step < 1 && step > 0) {
            const precision = step.toString().split('.')[1]?.length || 2;
            val = parseFloat(val.toFixed(precision));
        } else {
            val = parseFloat(val.toFixed(2));
        }
        
        // Update State
        if (parseFloat(el.dataset.value || el.dataset.val) !== val) {
            el.dataset.value = val;
            el.dataset.val = val;
            
            // Update Visuals
            if (type === 'knob') this.updateKnobVisual(el);
            else if (type === 'slider') this.updateSliderVisual(el);
            
            // Callback
            if (this.onChange) this.onChange(el.id, val);
        }
    }

    handleUp(e) {
        if (this.activeButton) {
            if (!e || e.pointerId === this.activeButton.pointerId) {
                const { el, pointerId } = this.activeButton;
                try { el.releasePointerCapture(pointerId); } catch (_) {}
                this.triggerButton(el, 0);
                this.activeButton = null;
            }
        }

        if (this.activeControl) {
            if (e && this.activeControl.pointerId !== undefined && e.pointerId !== this.activeControl.pointerId) return;
            // Hide Value
            const { el } = this.activeControl;
            const container = el.closest('.knob-container, .slider-container');
            if (container) {
                const valDisplay = container.querySelector('.knob-value');
                if (valDisplay) valDisplay.style.display = 'none';
            }

            try { el.releasePointerCapture(this.activeControl.pointerId); } catch (_) {}
            this.activeControl = null;
            document.body.style.cursor = '';
        }
    }

    toggleSwitch(el) {
        const current = parseInt(el.dataset.value || 0);
        const newVal = current === 0 ? 1 : 0;
        
        el.dataset.value = newVal;
        el.dataset.val = newVal;
        
        this.updateSwitchVisual(el);
        if (this.onChange) this.onChange(el.id, newVal);
    }

    triggerButton(el, val) {
        // Avoid repeated triggers if already in state
        const current = parseInt(el.dataset.value || 0);
        if (current === val) return;
        
        el.dataset.value = val;
        el.dataset.val = val;
        
        if (val === 1) el.classList.add('active');
        else el.classList.remove('active');
        
        if (this.onChange) this.onChange(el.id, val);
    }

    // --- Visual Updaters ---

    updateKnobVisual(el) {
        const val = parseFloat(el.dataset.value || el.dataset.val || 0);
        const min = parseFloat(el.dataset.min || 0);
        const max = parseFloat(el.dataset.max || 100);
        const isLog = el.dataset.curve === 'log';
        
        let percent;
        if (isLog) {
            percent = this.valToNorm(val, min, max);
        } else {
            percent = (val - min) / (max - min);
        }
        percent = Math.max(0, Math.min(1, percent));
        
        const deg = -135 + (percent * 270);
        el.style.transform = `rotate(${deg}deg)`;

        // Value display
        const container = el.closest('.knob-container');
        if (container) {
            const valDisplay = container.querySelector('.knob-value');
            if (valDisplay) valDisplay.innerText = val;
        }
    }

    updateSliderVisual(el) {
        const val = parseFloat(el.dataset.value || el.dataset.val || 0);
        const min = parseFloat(el.dataset.min || 0);
        const max = parseFloat(el.dataset.max || 100);
        
        let percent = (val - min) / (max - min);
        percent = Math.max(0, Math.min(1, percent));

        // Assuming structure: .slider-track > .slider-handle
        const handle = el.querySelector('.slider-handle');
        if (!handle) return;

        if (el.classList.contains('horizontal')) {
            handle.style.left = `${percent * 100}%`;
        } else {
            handle.style.bottom = `${percent * 100}%`;
        }
    }

    updateSwitchVisual(el) {
        const val = parseInt(el.dataset.value || 0);
        // Assumes .switch-track structure
        if (val === 1) el.classList.add('active');
        else el.classList.remove('active');
    }

    // --- Helpers ---
    valToNorm(val, min, max) {
        // If range crosses 0 or is negative, Log is tricky. 
        // Assuming positive range for freq (20-20000).
        // Fallback to linear if min <= 0
        if (min <= 0) return (val - min) / (max - min);
        const r = max / min;
        return Math.log(val / min) / Math.log(r);
    }

    normToVal(norm, min, max) {
        if (min <= 0) return min + norm * (max - min);
        const r = max / min;
        return min * Math.pow(r, norm);
    }

    // --- Public API ---
    setValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return;

        if (el.tagName === 'SELECT') {
            el.value = String(value);
        }

        el.dataset.value = value;
        el.dataset.val = value;
        
        if (el.matches(this.knobSelector)) this.updateKnobVisual(el);
        else if (el.matches(this.sliderSelector)) this.updateSliderVisual(el);
        else if (el.matches(this.switchSelector)) this.updateSwitchVisual(el);
        else if (el.matches(this.buttonSelector)) {
             if(value) el.classList.add('active');
             else el.classList.remove('active');
        }
    }
}
