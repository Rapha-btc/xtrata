import { Controls } from './controls.js';
import { Keyboard } from './keyboard.js';
import { MidiManager } from './midi.js';
import { SamplerUI } from './sampler.js';
import { Visualizer } from './visualizer.js';
import { SequencerManager } from './sequencer_core.js';
import { StandaloneBridge } from './standalone_bridge.js';

function getQueryParam(key) {
    try {
        return new URLSearchParams(window.location.search).get(key);
    } catch (_) {
        return null;
    }
}

function getParamIdForControlId(controlId) {
    const el = document.getElementById(controlId);
    const raw = el && el.dataset ? el.dataset.param : undefined;
    const n = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : NaN;
}

export const BVST = {
    _sanitizeDiagnosticValue: function(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 240);
    },

    _setBootDiagnostics: function(state, detail = '') {
        try {
            const root = document.documentElement;
            if (!root || !root.dataset) return;
            root.dataset.bvstState = state;
            root.dataset.bvstReady = state === 'ready' ? '1' : '0';
            if (detail) {
                root.dataset.bvstDetail = this._sanitizeDiagnosticValue(detail);
            }
            if (state !== 'error') {
                delete root.dataset.bvstError;
            }
            if (state !== 'ready') {
                delete root.dataset.bvstReadyAt;
            }
        } catch (_) {}
    },

    _setBootError: function(message) {
        const text = this._sanitizeDiagnosticValue(message || 'Unknown runtime error');
        try {
            const root = document.documentElement;
            if (root && root.dataset) {
                root.dataset.bvstState = 'error';
                root.dataset.bvstReady = '0';
                root.dataset.bvstError = text;
            }
        } catch (_) {}
    },

    _ensureStatusPanel: function() {
        if (this.statusPanel && this.statusPanel.isConnected) {
            return this.statusPanel;
        }

        const appRoot = document.getElementById('bvst-app-root');
        if (!appRoot) return null;

        const panel = document.createElement('div');
        panel.id = 'bvst-status-panel';
        panel.style.display = 'none';
        panel.style.margin = '8px 0 0';
        panel.style.padding = '8px 10px';
        panel.style.borderRadius = '6px';
        panel.style.border = '1px solid #5a5a5a';
        panel.style.background = 'rgba(18, 18, 18, 0.92)';
        panel.style.color = '#f0f0f0';
        panel.style.fontSize = '0.85rem';
        panel.style.lineHeight = '1.3';
        panel.style.whiteSpace = 'pre-wrap';
        panel.style.wordBreak = 'break-word';

        const topBar = appRoot.querySelector('.bvst-top-bar');
        if (topBar && topBar.nextSibling) appRoot.insertBefore(panel, topBar.nextSibling);
        else if (topBar) appRoot.appendChild(panel);
        else appRoot.prepend(panel);

        this.statusPanel = panel;
        return panel;
    },

    _showStatusMessage: function(kind, message) {
        const text = String(message || '').trim();
        if (!text) return;

        if (kind === 'error') this._setBootError(text);
        else this._setBootDiagnostics('status', text);

        const panel = this._ensureStatusPanel();
        if (!panel) return;

        panel.dataset.kind = kind === 'error' ? 'error' : 'status';
        panel.style.display = 'block';
        panel.style.borderColor = kind === 'error' ? '#b84f4f' : '#5a8fb8';
        panel.style.background = kind === 'error' ? 'rgba(70, 16, 16, 0.92)' : 'rgba(16, 36, 54, 0.92)';
        panel.textContent = `${kind === 'error' ? 'Error' : 'Status'}: ${text}`;

        if (this._statusHideTimer) {
            clearTimeout(this._statusHideTimer);
            this._statusHideTimer = 0;
        }

        if (kind !== 'error') {
            this._statusHideTimer = setTimeout(() => {
                if (this.statusPanel && this.statusPanel.dataset.kind !== 'error') {
                    this.statusPanel.style.display = 'none';
                }
            }, 4000);
        }
    },

    _attachRuntimeDiagnostics: function() {
        if (this._runtimeDiagnosticsAdded) return;
        this._runtimeDiagnosticsAdded = true;

        window.addEventListener('error', (event) => {
            const text =
                (event && event.message) ||
                (event && event.error && event.error.message) ||
                'Unhandled page error';
            this._showStatusMessage('error', text);
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event ? event.reason : null;
            const text =
                (reason && reason.message) ||
                (typeof reason === 'string' ? reason : '') ||
                'Unhandled promise rejection';
            this._showStatusMessage('error', text);
        });
    },

    init: function(config) {
        this._setBootDiagnostics('booting', 'Initializing BVST runtime');
        const containerId = config.containerId || 'app-container';
        const instanceId =
            (config && typeof config.instanceId === 'string' && config.instanceId.trim())
                ? config.instanceId.trim()
                : (getQueryParam('instanceId') || getQueryParam('instance') || 'default');
        this.instanceId = instanceId;
        const standaloneParam = (getQueryParam('standalone') || '').toString().trim().toLowerCase();
        const standalone =
            (config && (config.standalone === true || config.standalone === 1)) ||
            standaloneParam === '1' ||
            standaloneParam === 'true' ||
            standaloneParam === 'yes' ||
            window.parent === window;
        this.runtimeProfile =
            (config && typeof config.runtimeProfile === 'string' && config.runtimeProfile.trim())
                ? config.runtimeProfile.trim()
                : (standalone ? 'standalone' : 'host');

        const hostMidiParam = (getQueryParam('hostMidi') || '').toString().trim().toLowerCase();
        const hostMidi =
            (config && (config.hostMidi === true || config.hostMidi === 1)) ||
            hostMidiParam === '1' ||
            hostMidiParam === 'true' ||
            hostMidiParam === 'yes';

        // Audio Context Sharing
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        if (standalone) {
            const manifest = config && typeof config.manifest === 'object' ? config.manifest : null;
            const manifestUrl =
                (config && typeof config.manifestUrl === 'string' && config.manifestUrl.trim())
                    ? config.manifestUrl.trim()
                    : './manifest.json';
            const pluginName =
                (config && typeof config.name === 'string' && config.name.trim())
                    ? config.name.trim()
                    : (manifest && typeof manifest.name === 'string' ? manifest.name : '');

            if (this.standaloneBridge) {
                this.standaloneBridge.destroy();
                this.standaloneBridge = null;
            }

            this.standaloneBridge = new StandaloneBridge({
                audioContext: this.audioContext,
                instanceId: this.instanceId,
                manifest,
                manifestUrl,
                pluginName,
            });
        } else if (this.standaloneBridge) {
            this.standaloneBridge.destroy();
            this.standaloneBridge = null;
        }

        const midiMap = { note: 26, gate: 27, ...config.midiMap };
        const ensureInteractiveAudio = () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                try { this.audioContext.resume(); } catch (_) {}
            }
            if (this.standaloneBridge && typeof this.standaloneBridge.resume === 'function') {
                try { this.standaloneBridge.resume(); } catch (_) {}
            }
        };

        const applyControlChange = (id, val, { sendToHost = true } = {}) => {
            const paramId = getParamIdForControlId(id);
            if (sendToHost && Number.isFinite(paramId) && paramId >= 0) {
                this.sendParam(Math.trunc(paramId), val);
            }

            if (sendToHost && typeof config.onControlChange === 'function') {
                try {
                    config.onControlChange(id, val, { bvst: this, controls, config });
                } catch (e) {
                    console.warn('[BVST] onControlChange error', e);
                }
            }
            
            if (id === 'btn-power' && val === 1) {
                ensureInteractiveAudio();
                if (sendToHost) window.parent.postMessage({ type: 'BVST_POWER', instanceId: this.instanceId }, '*');
                setTimeout(() => controls.setValue('btn-power', 0), 200);
            }

            if (this.sampler) {
                if (id === 'speed') this.sampler.updateParam('playSpeed', val);
                else if (id === 'loop_start') this.sampler.updateParam('loopStart', val);
                else if (id === 'loop_end') this.sampler.updateParam('loopEnd', val);
                else if (id === 'loop_enable') this.sampler.updateParam('loopEnabled', val > 0.5);
                else if (id === 'pos') this.sampler.updateParam('grainPos', val);
                else if (id === 'spread') this.sampler.updateParam('grainSize', val * 2.0);
                else if (id === 'reverse') this.sampler.updateParam('reverse', val > 0.5);
                
                if (sendToHost && config.sampler && config.sampler.onControlChange) {
                    config.sampler.onControlChange(id, val, this.sampler);
                }
            }

            if (this.sequencer) {
                // Transport
                if (id === 'btn-play' && val === 1) this.sequencer.start();
                if (id === 'btn-stop' && val === 1) this.sequencer.stop();
                if (id === 'bpm') this.sequencer.setBpm(val);
                if (id === 'swing') this.sequencer.setSwing(val);
                
                // Arp Params
                if (id === 'arp_dir') this.sequencer.setArpDir(val);
                else if (id === 'arp_rate') this.sequencer.setArpRate(parseFloat(val));
                else if (id === 'arp_oct') this.sequencer.setArpOctaves(val);
                else if (id === 'arp_enable') this.sequencer.setArpActive(val === 1);
            }
        };

        const controls = new Controls({
            onChange: (id, val) => applyControlChange(id, val, { sendToHost: true })
        });

        const uiRefs = controls.buildUI(containerId, config);
        this._setBootDiagnostics('ui-ready', 'Control surface rendered');

        if (standalone) {
            this._attachRuntimeDiagnostics();
        }

        const samplerEnabled = !!(config.sampler && config.sampler.enabled !== false);

        if (config.sequencer) {
            this._initSequencer(config.sequencer);
        }

        // For sampler instruments, prioritize the waveform UI over the visualizer (which can otherwise
        // occupy the primary visible area in collapsed rack views). Visualizer can be re-enabled via:
        //   config.sampler.showVisualizer === true
        if (samplerEnabled) {
            this._initSampler(config.sampler);
        }

        const visualizerAllowed = !!(config.visualizer && (!samplerEnabled || (config.sampler && config.sampler.showVisualizer === true)));
        if (visualizerAllowed) {
            this._initVisualizer(config.visualizer);
        }

        if (config.presets && uiRefs.presetSelector) {
            const selector = uiRefs.presetSelector;
            selector.replaceChildren();

            const presetNames = Object.keys(config.presets);
            selector.disabled = presetNames.length === 0;
            presetNames.forEach((k) => {
                const o = document.createElement('option');
                o.value = k;
                o.innerText = k;
                selector.appendChild(o);
            });

            const applyPreset = (presetName) => {
                const p = config.presets[presetName];
                if (!p) {
                    return;
                }
                for (const [id, val] of Object.entries(p)) {
                    controls.setValue(id, val);
                    const paramId = getParamIdForControlId(id);
                    if (Number.isFinite(paramId) && paramId >= 0) {
                        this.sendParam(Math.trunc(paramId), val);
                    }
                }
            };

            selector.addEventListener('change', (e) => applyPreset(e.target.value));

            if (presetNames.length > 0) {
                const desired =
                    (typeof config.defaultPreset === 'string' && config.defaultPreset.trim() && config.presets[config.defaultPreset])
                        ? config.defaultPreset
                        : (config.presets.Init ? 'Init' : presetNames[0]);

                // Force the UI to reflect the selected preset.
                const desiredStr = String(desired);
                for (const opt of selector.options) {
                    opt.selected = opt.value === desiredStr;
                }
                selector.value = desiredStr;
                if (selector.selectedIndex < 0) selector.selectedIndex = 0;

                // Apply on next tick to avoid any race with host message listener attachment.
                setTimeout(() => {
                    applyPreset(selector.value);
                }, 0);
            } else {
                const o = document.createElement('option');
                o.value = '';
                o.innerText = 'No Presets';
                selector.appendChild(o);
            }
        }

        if (config.keyboard !== false) {
             const kbConfig = config.keyboard || {};
             const startNote = kbConfig.startNote || 24;
             const numKeys = kbConfig.numKeys || 25;

             this.keyboard = new Keyboard('piano', {
                startNote: startNote,
                numKeys: numKeys,
                responsive: true,
                onNoteOn: (midiVal, freq, vel) => {
                    ensureInteractiveAudio();
                    // Check Arp Interception
                    if (this.sequencer && this.sequencer.type === 'arp' && this.sequencer.arp.active) {
                        this.sequencer.onNoteOn(midiVal);
                        return;
                    }

                    window.parent.postMessage({ 
                        type: 'NOTE_ON', 
                        instanceId: this.instanceId,
                        note: midiVal, 
                        velocity: vel !== undefined ? vel : 1.0 
                    }, '*');
                    
                    if (this.sampler) {
                        this.sampler.updateParam('note', midiVal);
                        this.sampler.trigger(); 
                    }
                },
                onNoteOff: (midiVal) => {
                    if (this.sequencer && this.sequencer.type === 'arp' && this.sequencer.arp.active) {
                        this.sequencer.onNoteOff(midiVal);
                        return;
                    }

                    window.parent.postMessage({ type: 'NOTE_OFF', instanceId: this.instanceId, note: midiVal }, '*');
                    
                    if (this.sampler) {
                        this.sampler.release();
                    }
                }
            });

            if (config.keyboard && config.keyboard.onNoteOn) {
                const origOn = this.keyboard.onNoteOn;
                this.keyboard.onNoteOn = (n, f, v) => { origOn(n,f,v); config.keyboard.onNoteOn(n, f, v); };
            }
            if (config.keyboard && config.keyboard.onNoteOff) {
                const origOff = this.keyboard.onNoteOff;
                this.keyboard.onNoteOff = (n) => { origOff(n); config.keyboard.onNoteOff(n); };
            }

            if (!hostMidi) {
                this.midi = new MidiManager({
                    deviceSelectorId: 'midi-in',
                    statusElementId: 'midi-led',
                    onNoteOn: (n) => this.keyboard._handleNoteOn(n),
                    onNoteOff: (n) => this.keyboard._handleNoteOff(n)
                });
            } else {
                const midiSel = document.getElementById('midi-in');
                const midiLed = document.getElementById('midi-led');
                if (midiSel) {
                    midiSel.replaceChildren();
                    const o = document.createElement('option');
                    o.value = '';
                    o.innerText = 'Host';
                    midiSel.appendChild(o);
                    midiSel.disabled = true;
                }
                if (midiLed) midiLed.style.display = 'none';
            }
        } else {
            const kbContainer = document.getElementById('keyboard-container');
            if(kbContainer) kbContainer.style.display = 'none';
        }

        if (!this._listenerAdded) {
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'ERROR') {
                    const data = event.data || {};
                    const instanceId = (data && typeof data.instanceId === 'string') ? data.instanceId : null;
                    if (instanceId && instanceId !== this.instanceId) return;
                    this._showStatusMessage('error', data.error || data.message || 'Unknown runtime error');
                }

                if (event.data && event.data.type === 'STATUS') {
                    const data = event.data || {};
                    const instanceId = (data && typeof data.instanceId === 'string') ? data.instanceId : null;
                    if (instanceId && instanceId !== this.instanceId) return;
                    this._setBootDiagnostics('status', data.msg || data.message || 'Runtime status update');
                    this._showStatusMessage('status', data.msg || data.message || 'Runtime status update');
                }

                if (event.data && event.data.type === 'BVST_READY') {
                    this._setBootDiagnostics('ready', 'Standalone bridge reported ready');
                    try {
                        document.documentElement.dataset.bvstReadyAt = new Date().toISOString();
                    } catch (_) {}
                    this.syncAllParams();
                }

                if (event.data && event.data.type === 'BVST_HOST_APPLY_PARAMS') {
                    const data = event.data || {};
                    const instanceId = (data && typeof data.instanceId === 'string') ? data.instanceId : null;
                    if (instanceId && instanceId !== this.instanceId) return;
                    const params = Array.isArray(data.params) ? data.params : [];
                    // params: [ [paramId, value], ... ]
                    for (const pair of params) {
                        if (!pair || pair.length < 2) continue;
                        const pid = Number(pair[0]);
                        const val = Number(pair[1]);
                        if (!Number.isFinite(pid) || pid < 0) continue;
                        if (!Number.isFinite(val)) continue;
                        const els = document.querySelectorAll(`[data-param="${pid}"]`);
                        for (const el of els) {
                            if (!el || !el.id) continue;
                            controls.setValue(el.id, val);
                            applyControlChange(el.id, val, { sendToHost: false });
                        }
                    }
                }
            });
            this._listenerAdded = true;
        }
        
        this.controls = controls;
    },

    destroy: function() {
        if (this.sequencer) this.sequencer.stop();
        if (this.visualizer) this.visualizer.stop();
        if (this.standaloneBridge) {
            this.standaloneBridge.destroy();
            this.standaloneBridge = null;
        }
    },

    _initVisualizer: function(mode) {
        this.visualizer = new Visualizer({ mode: mode });
        const appRoot = document.getElementById('bvst-app-root');
        if (!appRoot) return;
        const vizDiv = document.createElement('div');
        vizDiv.style.height = '100px';
        vizDiv.style.width = '100%';
        vizDiv.style.borderBottom = '1px solid #333';
        vizDiv.id = 'bvst-viz-container';
        const samplerContainer = appRoot.querySelector('.bvst-sampler-container');
        if (samplerContainer) {
            appRoot.insertBefore(vizDiv, samplerContainer.nextSibling);
        } else {
            const topBar = appRoot.querySelector('.bvst-top-bar');
            if (topBar) appRoot.insertBefore(vizDiv, topBar.nextSibling);
            else appRoot.prepend(vizDiv);
        }
        this.visualizer.buildUI('bvst-viz-container');
    },

    _initSequencer: function(seqConfig) {
        seqConfig.audioContext = this.audioContext;
        this.sequencer = new SequencerManager(
            seqConfig, 
            (id, val) => this.sendParam(id, val),
            this.controls
        );
        
        if (seqConfig.type === 'arp') return;

        const appRoot = document.getElementById('bvst-app-root');
        const seqContainer = document.createElement('div');
        seqContainer.id = 'bvst-sequencer-container';
        seqContainer.style.marginTop = '10px';
        seqContainer.style.background = 'rgba(0,0,0,0.3)';
        seqContainer.style.borderRadius = '4px';
        seqContainer.style.padding = '10px';
        
        const kbContainer = document.getElementById('keyboard-container');
        if (kbContainer) appRoot.insertBefore(seqContainer, kbContainer);
        else appRoot.appendChild(seqContainer);
        
        this.sequencer.init(seqContainer);
    },

    _initSampler: function(samplerConfig) {
        this.sampler = new SamplerUI({
            ...samplerConfig,
            audioContext: this.audioContext,
            runtimeProfile:
                (samplerConfig && typeof samplerConfig.runtimeProfile === 'string' && samplerConfig.runtimeProfile.trim())
                    ? samplerConfig.runtimeProfile.trim()
                    : this.runtimeProfile,
            onSampleLoad: (data) => {
                const payload = (data && data.samples) ? data : { samples: data };
                window.parent.postMessage({
                    type: 'BVST_LOAD_SAMPLE_FROM_GUI',
                    instanceId: this.instanceId,
                    samplePayload: payload,
                    samples: payload.samples || (Array.isArray(payload.channels) ? payload.channels[0] : null),
                    sourceUrl: payload.sourceUrl || '',
                    sourceLabel: payload.sourceLabel || '',
                    fileName: payload.fileName || ''
                }, '*');
                if (samplerConfig.onLoad) {
                    samplerConfig.onLoad(
                        payload.samples || (Array.isArray(payload.channels) ? payload.channels[0] : null),
                        payload
                    );
                }
            },
            onSeek: (pct) => {
                if (samplerConfig.onSeek) samplerConfig.onSeek(pct);
                else this.sendParam(30, pct);
                this.sampler.updateParam('grainPos', pct);
                this.controls.setValue('pos', pct);
            },
            onPreviewTrigger: (active) => {
                if (samplerConfig.onPreview) samplerConfig.onPreview(active);
            }
        });

        const appRoot = document.getElementById('bvst-app-root');
        const wrapper = document.createElement('div');
        this.sampler.buildUI(wrapper);
        
        if(appRoot) {
            const topBar = appRoot.querySelector('.bvst-top-bar');
            const viz = document.getElementById('bvst-viz-container');
            const target = viz ? viz.nextSibling : (topBar ? topBar.nextSibling : appRoot.firstChild);
            appRoot.insertBefore(wrapper.firstElementChild, target);
        }

        if (samplerConfig.defaults) {
            Object.entries(samplerConfig.defaults).forEach(([k, v]) => {
                this.sampler.updateParam(k, v);
            });
        }
    },

    sendParam: function(id, value) {
        window.parent.postMessage({ type: 'BVST_PARAM', instanceId: this.instanceId, id: id, value: value }, '*');
    },

    syncAllParams: function() {
        document.querySelectorAll('[data-param]').forEach(el => {
            const p = Number(el.dataset.param);
            const v = parseFloat(el.dataset.val !== undefined ? el.dataset.val : el.dataset.value);
            if (Number.isFinite(p) && p >= 0 && Number.isFinite(v)) {
                this.sendParam(Math.trunc(p), v);
            }
        });
    }
};
