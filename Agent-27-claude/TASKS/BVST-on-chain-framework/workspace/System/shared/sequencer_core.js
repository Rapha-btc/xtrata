import { injectSequencerStyles, injectGridSequencerStyles } from './ui_styles.js';

export class SequencerManager {
    constructor(config, paramSender, controls) {
        this.config = config || {};
        this.type = this.config.type || 'step'; // 'step', 'grid', 'arp'
        this.paramSender = paramSender; 
        this.controls = controls;       
        
        // Timing
        this.audioContext = this.config.audioContext || null;
        this.bpm = 120;
        this.swing = 0.0; // 0.0 to 0.75 usually
        
        // Defaults
        this.paramMap = {
            freq: 20,
            accent: 21,
            slide: 22,
            gate: 23,
            note: 128, // For Grid mode (Note On)
            ...this.config.paramMap
        };
        
        // Engine State
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;
        this.nextNoteTime = 0;
        this.numSteps = this.config.steps || 16;
        
        // ARP State
        this.arp = {
            active: false, 
            notes: [],     
            pattern: [],   
            index: 0,
            dir: 'up',     
            octaves: 1,
            rate: 1/8,     
            dirFlag: 1,    
            latch: false   
        };
        
        // UI Instance
        this.ui = null;
    }

    setSwing(amount) {
        this.swing = Math.max(0, Math.min(0.75, parseFloat(amount)));
    }

    init(containerId) {
        if (this.type === 'grid') {
            this.ui = new GridSequencer(containerId, {
                numSteps: this.numSteps,
                rows: this.config.rows,
                initialData: this.config.initialData
            });
        } else if (this.type === 'step') {
            this.ui = new StepSequencer(containerId, {
                numSteps: this.numSteps,
                onStepChange: (idx, data) => {}
            });
        }
        // 'arp' has no specific UI module here, controls are standard knobs/selects
    }

    // --- Control API ---

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = performance.now() / 1000;
        
        if (this.controls && this.type !== 'arp') { // Arp doesn't use Transport buttons usually
            this.controls.setValue('btn-play', 1);
            this.controls.setValue('btn-stop', 0);
        }
        
        this.schedule();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerId) cancelAnimationFrame(this.timerId);
        
        if (this.controls && this.type !== 'arp') {
            this.controls.setValue('btn-play', 0);
            this.controls.setValue('btn-stop', 1);
            setTimeout(() => this.controls.setValue('btn-stop', 0), 200);
        }
        
        // Kill Gate
        if (this.type === 'step') {
            this.paramSender(this.paramMap.gate, 0.0);
        } else if (this.type === 'arp') {
            this.paramSender(129, 0); // Note Off (Standard ID for Arp/Poly usually)
        }
        
        if (this.ui && this.ui.container) {
            this.ui.container.querySelectorAll('.current').forEach(el => el.classList.remove('current'));
        }
    }

    setBpm(bpm) {
        this.bpm = parseFloat(bpm);
        if (this.isPlaying) {
            if (this.timerId) cancelAnimationFrame(this.timerId);
            this.schedule();
        }
    }

    // --- Arp API ---
    setArpActive(active) {
        this.arp.active = !!active;
        if (this.arp.active && !this.isPlaying) this.start();
        if (!this.arp.active && this.isPlaying && this.type === 'arp') this.stop();
    }
    
    setArpDir(dir) { this.arp.dir = dir; }
    setArpOctaves(oct) { this.arp.octaves = parseInt(oct); }
    setArpRate(val) { 
        if (val > 1) { 
             // Legacy MS assumption: 125ms = 1/8, 250 = 1/4, 62.5 = 1/16
             if (val >= 200) this.arp.rate = 0.25; // 1/4
             else if (val >= 100) this.arp.rate = 0.125; // 1/8
             else this.arp.rate = 0.0625; // 1/16
        } else {
             this.arp.rate = val; 
        }
    }

    onNoteOn(midi) {
        if (!this.arp.active) {
            return;
        }
        
        if (!this.arp.notes.includes(midi)) {
            this.arp.notes.push(midi);
            this.arp.notes.sort((a,b) => a-b);
        }
        if (this.arp.notes.length === 1) {
            this.arp.index = -1; // Reset index on first note
            if (!this.isPlaying) this.start();
        }
    }

    onNoteOff(midi) {
        const idx = this.arp.notes.indexOf(midi);
        if (idx > -1) this.arp.notes.splice(idx, 1);
        
        if (this.arp.notes.length === 0 && !this.arp.latch) {
            if (Number.isFinite(this.paramMap.gate) && this.paramMap.gate >= 0) this.paramSender(this.paramMap.gate, 0); // All notes off
        }
    }

    // --- Engine ---

    schedule() {
        // Calculate Step Time
        const secondsPerBeat = 60.0 / this.bpm;
        let stepTime;
        
        if (this.type === 'arp') {
            stepTime = secondsPerBeat * (this.arp.rate * 4); 
        } else {
            // Step/Grid defaults to 1/16th usually
            stepTime = secondsPerBeat / 4; 
        }

        const now = this.audioContext ? this.audioContext.currentTime : performance.now() / 1000;
        
        // Lookahead 100ms
        while (this.nextNoteTime < now + 0.1) {
            // Apply Swing to odd steps (1, 3, 5...)
            let playTime = this.nextNoteTime;
            if (this.swing > 0 && this.currentStep % 2 !== 0) {
                playTime += stepTime * this.swing;
            }

            this.runStep(this.currentStep, playTime);
            
            this.currentStep = (this.currentStep + 1) % this.numSteps;
            this.nextNoteTime += stepTime; // Increment strictly to avoid drift
        }
        
        if (this.isPlaying) {
            this.timerId = requestAnimationFrame(() => this.schedule());
        }
    }

    runStep(idx, time) {
        const now = this.audioContext ? this.audioContext.currentTime : performance.now() / 1000;
        const delayMs = Math.max(0, (time - now) * 1000);

        // Schedule UI update (approximate)
        setTimeout(() => {
            if (!this.isPlaying) return;
            if (this.ui) this.ui.highlightStep(idx);
        }, delayMs);

        if (this.type === 'arp') {
            this.runArpStep(delayMs);
            return;
        }

        if (this.type === 'grid') {
            const activeNotes = this.ui.getStepData(idx);
            setTimeout(() => {
                if (!this.isPlaying) return;
                activeNotes.forEach(note => {
                    if (Number.isFinite(this.paramMap.note) && this.paramMap.note >= 0) this.paramSender(this.paramMap.note, note);
                });
            }, delayMs);
        } else {
            const step = this.ui ? this.ui.getStep(idx) : null;
            if (step && step.active) {
                const midi = this.noteToMidi(step.note);
                const freq = this.mtof(step.note);
                const useMidiNote = (this.paramMap.gate === 129);

                const sendIf = (pid, v) => {
                    if (Number.isFinite(pid) && pid >= 0) this.paramSender(pid, v);
                };

                setTimeout(() => {
                    if (!this.isPlaying) return;
                    sendIf(this.paramMap.accent, step.accent ? 1.0 : 0.0);
                    sendIf(this.paramMap.slide, step.slide ? 1.0 : 0.0);
                    if (useMidiNote) sendIf(this.paramMap.note, midi);
                    else sendIf(this.paramMap.freq, freq);
                    sendIf(this.paramMap.gate, 1.0);
                }, delayMs);

                if (!step.slide) {
                    const stepDuration = (60 / this.bpm / 4);
                    const gateLen = stepDuration * 0.5;
                    setTimeout(() => {
                        if (this.isPlaying && Number.isFinite(this.paramMap.gate) && this.paramMap.gate >= 0) this.paramSender(this.paramMap.gate, 0.0);
                    }, delayMs + (gateLen * 1000));
                }
            } else {
                setTimeout(() => {
                    if (this.isPlaying && Number.isFinite(this.paramMap.gate) && this.paramMap.gate >= 0) this.paramSender(this.paramMap.gate, 0.0);
                }, delayMs);
            }
        }
    }

    runArpStep(delayMs) {
        if (this.arp.notes.length === 0) return;

        // Generate Pattern from held notes
        let pattern = [];
        for(let o=0; o<this.arp.octaves; o++) {
            for(let n of this.arp.notes) {
                pattern.push(n + (o*12));
            }
        }
        pattern.sort((a,b) => a-b);
        
        // Select Note
        let noteToPlay = 0;
        
        if (this.arp.dir === 'random') {
            const r = Math.floor(Math.random() * pattern.length);
            noteToPlay = pattern[r];
        } else if (this.arp.dir === 'up') {
            this.arp.index = (this.arp.index + 1) % pattern.length;
            noteToPlay = pattern[this.arp.index];
        } else if (this.arp.dir === 'down') {
            this.arp.index--;
            if(this.arp.index < 0) this.arp.index = pattern.length - 1;
            noteToPlay = pattern[this.arp.index];
        } else if (this.arp.dir === 'updown') {
             this.arp.index += this.arp.dirFlag;
             if (this.arp.index >= pattern.length) {
                 this.arp.index = Math.max(0, pattern.length - 2);
                 this.arp.dirFlag = -1;
             } else if (this.arp.index < 0) {
                 this.arp.index = Math.min(pattern.length - 1, 1);
                 this.arp.dirFlag = 1;
             }
             if(pattern.length === 1) this.arp.index = 0;
             else this.arp.index = Math.max(0, Math.min(pattern.length-1, this.arp.index));
             noteToPlay = pattern[this.arp.index];
        }

        const noteParam = this.paramMap.note;
        const gateParam = this.paramMap.gate;

        // Trigger with delay (note + gate)
        setTimeout(() => {
            if (!this.isPlaying) return;
            if (Number.isFinite(noteParam) && noteParam >= 0) this.paramSender(noteParam, noteToPlay);
            if (Number.isFinite(gateParam) && gateParam >= 0) this.paramSender(gateParam, 1.0);
        }, delayMs);

        // Gate Off logic
        const secondsPerBeat = 60.0 / this.bpm;
        const stepTime = secondsPerBeat * (this.arp.rate * 4);
        const gateLen = stepTime * 0.8; // 80% gate length

        setTimeout(() => {
             if (this.isPlaying && Number.isFinite(gateParam) && gateParam >= 0) this.paramSender(gateParam, 0.0);
        }, delayMs + (gateLen * 1000));
    }

    noteToMidi(noteStr) {
        const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const note = noteStr.slice(0, -1);
        const oct = parseInt(noteStr.slice(-1));
        const semi = notes.indexOf(note);
        return 12 + (oct * 12) + semi;
    }

    mtof(noteStr) { 
        const midi = this.noteToMidi(noteStr);
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
}

export class StepSequencer {
    constructor(containerId, options = {}) {
        this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!this.container) throw new Error(`Container ${containerId} not found`);

        this.numSteps = options.numSteps || 16;
        this.steps = options.initialSteps || Array(this.numSteps).fill().map(() => ({
            active: false,
            note: 'C2',
            accent: false,
            slide: false
        }));
        
        this.onStepChange = options.onStepChange || ((stepIdx, data) => {});
        
        this.injectStyles();
        this.render();
    }

    injectStyles() {
        injectSequencerStyles();
    }

    render() {
        this.container.innerHTML = '';
        this.container.classList.add('seq-grid');
        
        // Handle grid columns based on numSteps (responsive-ish)
        this.container.style.gridTemplateColumns = `repeat(${this.numSteps}, 1fr)`;

        for (let i = 0; i < this.numSteps; i++) {
            const col = document.createElement('div');
            col.className = 'step-col';
            
            // LED
            const led = document.createElement('div');
            led.className = 'led';
            led.id = `led-${i}`;
            col.appendChild(led);

            // Active Button
            const btnActive = document.createElement('div');
            btnActive.className = `seq-btn ${this.steps[i].active ? 'active' : ''}`;
            btnActive.innerText = 'ON';
            btnActive.onclick = () => this.toggleParam(i, 'active', btnActive);
            col.appendChild(btnActive);

            // Note Select
            const noteSel = document.createElement('select');
            noteSel.className = 'note-select';
            this.populateNotes(noteSel, this.steps[i].note);
            noteSel.onchange = (e) => this.updateNote(i, e.target.value);
            col.appendChild(noteSel);

            // Accent
            const btnAcc = document.createElement('div');
            btnAcc.className = `seq-btn accent ${this.steps[i].accent ? 'active' : ''}`;
            btnAcc.innerText = 'AC';
            btnAcc.onclick = () => this.toggleParam(i, 'accent', btnAcc);
            col.appendChild(btnAcc);

            // Slide
            const btnSlide = document.createElement('div');
            btnSlide.className = `seq-btn slide ${this.steps[i].slide ? 'active' : ''}`;
            btnSlide.innerText = 'SL';
            btnSlide.onclick = () => this.toggleParam(i, 'slide', btnSlide);
            col.appendChild(btnSlide);

            this.container.appendChild(col);
        }
    }

    populateNotes(select, current) {
        const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        [1, 2, 3].forEach(oct => {
            notes.forEach(n => {
                const val = n + oct;
                const opt = document.createElement('option');
                opt.value = val;
                opt.text = val;
                if (val === current) opt.selected = true;
                select.appendChild(opt);
            });
        });
    }

    toggleParam(idx, param, el) {
        this.steps[idx][param] = !this.steps[idx][param];
        if (this.steps[idx][param]) el.classList.add('active');
        else el.classList.remove('active');
        this.onStepChange(idx, this.steps[idx]);
    }

    updateNote(idx, note) {
        this.steps[idx].note = note;
        this.onStepChange(idx, this.steps[idx]);
    }

    highlightStep(idx) {
        // Clear previous
        const prev = (idx === 0) ? this.numSteps - 1 : idx - 1;
        // In case of jump or reset, ideally clear all 'current' first or track last
        const current = this.container.querySelector('.led.current');
        if(current) current.classList.remove('current');
        
        // Set new
        const led = this.container.querySelector(`#led-${idx}`);
        if(led) led.classList.add('current');
    }
    
    getStep(idx) {
        return this.steps[idx];
    }
    
    setSequence(newSteps) {
        // Merge ensuring length match
        newSteps.forEach((s, i) => {
            if (i < this.numSteps) this.steps[i] = { ...this.steps[i], ...s };
        });
        this.render();
    }

    clear() {
        this.steps = Array(this.numSteps).fill().map(() => ({
            active: false,
            note: 'C2',
            accent: false,
            slide: false
        }));
        this.render();
        // Notify change for all steps? Or just rely on render. 
        // Logic (SequencerManager) pulls data from UI or pushes it?
        // SequencerManager.runStep calls ui.getStep(idx). So updating UI state is sufficient.
    }
}

export class GridSequencer {
    constructor(containerId, options = {}) {
        this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!this.container) throw new Error(`Container ${containerId} not found`);

        this.numSteps = options.numSteps || 16;
        this.rows = options.rows || [
            { name: "KICK", note: 36, class: "row-0" },
            { name: "SNARE", note: 38, class: "row-1" },
            { name: "HAT", note: 42, class: "row-2" },
            { name: "CLAP", note: 39, class: "row-3" }
        ];
        
        // 2D Array [row][step] -> boolean
        this.gridData = options.initialData || 
            Array(this.rows.length).fill().map(() => Array(this.numSteps).fill(false));
            
        this.onStepChange = options.onStepChange || ((row, step, val) => {});
        
        this.injectStyles();
        this.render();
    }

    injectStyles() {
        injectGridSequencerStyles();
    }

    render() {
        this.container.innerHTML = '';
        this.container.className = 'bvst-grid-container';
        this.container.style.gridTemplateColumns = `60px repeat(${this.numSteps}, 1fr)`;

        this.rows.forEach((row, rIdx) => {
            const label = document.createElement('div');
            label.className = 'bvst-row-label';
            label.innerText = row.name;
            this.container.appendChild(label);
            
            for(let s=0; s<this.numSteps; s++) {
                const step = document.createElement('div');
                step.className = `bvst-step ${row.class || ''}`;
                step.id = `bvst-step-${rIdx}-${s}`;
                if (this.gridData[rIdx][s]) step.classList.add('active');
                
                step.onclick = () => this.toggleStep(rIdx, s);
                this.container.appendChild(step);
            }
        });
    }

    toggleStep(row, step) {
        this.gridData[row][step] = !this.gridData[row][step];
        const el = document.getElementById(`bvst-step-${row}-${step}`);
        if (this.gridData[row][step]) el.classList.add('active');
        else el.classList.remove('active');
        
        this.onStepChange(row, step, this.gridData[row][step]);
    }

    highlightStep(idx) {
        // Clear previous 'current'
        const prev = (idx === 0) ? this.numSteps - 1 : idx - 1;
        for(let r=0; r<this.rows.length; r++) {
            const el = document.getElementById(`bvst-step-${r}-${prev}`);
            if(el) el.classList.remove('current');
            
            // Just in case of sync drift, clear all? 
            // Optimally we just clear the one we set.
        }
        // Safety clear all 'current' if needed, but performance...
        this.container.querySelectorAll('.current').forEach(el => el.classList.remove('current'));

        // Set new
        for(let r=0; r<this.rows.length; r++) {
            const el = document.getElementById(`bvst-step-${r}-${idx}`);
            if(el) el.classList.add('current');
        }
    }
    
    getStepData(idx) {
        // Return array of active notes for this step
        const activeNotes = [];
        for(let r=0; r<this.rows.length; r++) {
            if (this.gridData[r][idx]) {
                activeNotes.push(this.rows[r].note);
            }
        }
        return activeNotes;
    }

    clear() {
        this.gridData = Array(this.rows.length).fill().map(() => Array(this.numSteps).fill(false));
        this.render();
    }
}
