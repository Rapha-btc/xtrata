// --- main.js ---
import * as audio from './audio-processing/main.js';
import * as ui from './uiUpdater.js';
import * as midiHandler from './midiHandler.js';
import * as keyboardShortcuts from './keyboardShortcuts.js';
import { buildLayout, initReferencePanel } from './layout.js';
import { clamp, _isInputFocused, addListener, createElement, PITCH_SLIDER_CONFIG, sValToP, pToSVal } from './utils.js'; // Added pToSVal

const D = {
  tempo: 78, pitch: PITCH_SLIDER_CONFIG.NEUTRAL_S, minPitch: PITCH_SLIDER_CONFIG.MIN_S, maxPitch: PITCH_SLIDER_CONFIG.MAX_S,
  pitchStep: PITCH_SLIDER_CONFIG.STEP, volume: 1, mult: 1, minTempo: 1, maxTempo: 400, minVolume: 0, maxVolume: 1.5,
  minMult: 1, maxMult: 8, imageMime: 'image/jpeg', audioMime: 'audio/opus',
};

let appContainer, mainImage, playOnceBtn, loopToggleBtn, reverseToggleBtn,
  tempoSlider, pitchSlider, volumeSlider, multiplierSlider,
  tempoInput, pitchInput, volumeInput, multiplierInput,

  controlsContainer, infoToggleBtn, referencePanel, errorMessageDiv,
  midiDeviceSelect, midiStatusSpan, controlsColumn, referenceColumn;

  const idMap = [
    ['app',    el => appContainer = document.getElementById(el)],
    ['main-image', el => mainImage = document.getElementById(el)],
    ['play-once-btn', el => playOnceBtn = document.getElementById(el)],
    ['loop-toggle-btn', el => loopToggleBtn = document.getElementById(el)],
    ['reverse-toggle-btn', el => reverseToggleBtn = document.getElementById(el)],
    // Sliders
    ['tempo-slider', el => tempoSlider = document.getElementById(el)],
    ['pitch-slider', el => pitchSlider = document.getElementById(el)],
    ['volume-slider', el => volumeSlider = document.getElementById(el)],
    ['multiplier-slider', el => multiplierSlider = document.getElementById(el)],
    // Number Inputs
    ['tempo-input', el => tempoInput = document.getElementById(el)],
    ['pitch-input', el => pitchInput = document.getElementById(el)],
    ['volume-input', el => volumeInput = document.getElementById(el)],
    ['multiplier-input', el => multiplierInput = document.getElementById(el)],
    // Other UI
    ['controls-container', el => controlsContainer = document.getElementById(el)],
    ['info-toggle-btn', el => infoToggleBtn = document.getElementById(el)],
    ['reference-panel', el => referencePanel = document.getElementById(el)],
    ['error-message', el => errorMessageDiv = document.getElementById(el)],
    ['midi-device-select', el => midiDeviceSelect = document.getElementById(el)],
    ['midi-status', el => midiStatusSpan = document.getElementById(el)],
    ['.controls-column', sel => controlsColumn = document.querySelector(sel)],
    ['.reference-column', sel => referenceColumn = document.querySelector(sel)],
  ];

const findElements = () => {
  idMap.forEach(([sel, setter]) => setter(sel));
  if (!appContainer || !controlsContainer || !errorMessageDiv || !mainImage || !controlsColumn) {
    (document.getElementById('app') ?? document.body).innerHTML = '<p style="color:red;padding:20px;">Fatal Error: Missing UI</p>';
    return false;
  }
  return true;
};

const validateBase64 = (data, prefix, name) => {
  if (!data || typeof data !== 'string' || data.startsWith('/*')) throw new Error(`Missing or invalid ${name}`);
  return data.startsWith('data:') ? data : prefix + data;
};

const handleSliderInput = (e, setAudio, updateUI, parser = parseFloat, toUI = null) => {
  const s = e.target, raw = parser(s.value), min = parser(s.min), max = parser(s.max);
  if ([raw, min, max].some(isNaN)) return;
  const v = clamp(raw, min, max); setAudio(v); updateUI(toUI ? toUI(v) : v);
};

const handleLoopToggle = async () => {
  await audio.resumeContext();
  audio.getLoopingState() ? audio.stopLoop() : audio.startLoop();
  ui.updateLoopButton(audio.getLoopingState());
};

const toggleSideColumns = () => { controlsColumn.classList.toggle('hidden'); referenceColumn?.classList.toggle('hidden'); };

const handleNoteOn = (note, vel) => {
  const rate = audio.getPlaybackRateForNote(note);
  if (rate) audio.playSampleAtRate(rate, vel);
};

const handleMidiStateChange = ({ status, message, devices, selectedDeviceId }) => {
  if (!midiDeviceSelect || !midiStatusSpan) return;
  midiStatusSpan.textContent = message || status;
  midiStatusSpan.style.color = /error|unsupported|unavailable/.test(status) ? 'var(--error-color)' : '';
  midiDeviceSelect.innerHTML = '';
  const ph = createElement('option', { value: '', textContent: status === 'ready' ? '-- Select MIDI Device --' : '-- MIDI Unavailable --', disabled: true });
  midiDeviceSelect.appendChild(ph);
  if (status === 'ready' && devices?.length) {
    midiDeviceSelect.disabled = false;
    ph.disabled = false;
    devices.forEach(d => midiDeviceSelect.appendChild(createElement('option', { value: d.id, textContent: d.name })));
    midiDeviceSelect.value = selectedDeviceId ?? '';
    midiStatusSpan.textContent = selectedDeviceId && devices.find(d => d.id === selectedDeviceId)
      ? `Connected: ${devices.find(d => d.id === selectedDeviceId).name}`
      : 'MIDI devices available.';
  } else midiDeviceSelect.disabled = true;
};

const loadDataSrc = async (g, keys, mime, label) => {
  for (const k of keys) try { if (g[k]) return validateBase64(g[k], `data:${mime};base64,`, `${label} '${k}'`); } catch {}
  return null;
};

const fetchAudioFromUrl = async (url, defMime) => {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get('content-type') || defMime, buf = await r.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return `data:${ct};base64,${b64}`;
  } catch (e) { ui.showError(`Failed to load audio from URL '${url}': ${e.message}`); console.error("Audio fetch error:", e); return null; }
};

// In initializeApp, ensure D.pitch uses the s_val from config.
// D.pitch: PITCH_SLIDER_CONFIG.NEUTRAL_S, this is correct.
const initializeApp = async () => {
  if (!findElements()) return;
  ui.init?.(); ui.clearError();
  const g = window, im = D.imageMime, am = D.audioMime;
  let imgSrc = await loadDataSrc(g, ['audionalVisualBase64', 'imageScript'], im, 'image data') ??
    (typeof g.imageURL === 'string' && !g.imageURL.startsWith('/*') && g.imageURL.trim() !== '' ? g.imageURL : null);
  if (!imgSrc) { ui.showError("No image data source found."); ui.setImageSource(null); } else ui.setImageSource(imgSrc); // No change for GIF needed here
  let audSrc = await loadDataSrc(g, ['audionalBase64_Opus', 'audioScript'], am, 'audio data') ??
    (typeof g.audioURL === 'string' && !g.audioURL.startsWith('/*') && g.audioURL.trim() !== ''
      ? await fetchAudioFromUrl(g.audioURL, am) : null);
  if (!audSrc) { ui.showError("No audio data source found."); ui.disableControls(); return; }
  
  // Initial values for audio module and UI (sliders already set by layout.js default values)
  const ini = {
    tempo: +(tempoSlider?.value ?? D.tempo),
    pitch_s_val: +(pitchSlider?.value ?? D.pitch), // D.pitch is NEUTRAL_S
    volume: +(volumeSlider?.value ?? D.volume),
    mult: +(multiplierSlider?.value ?? D.mult),
  };

  // The layout.js already sets initial slider and number input values based on defaults.
  // We mainly need to ensure the audio module is initialized with these.
  // And UI display functions are called once.

  midiHandler.init(handleNoteOn, () => {}, handleMidiStateChange);
  if (!(await audio.init(audSrc, ini.tempo, ini.pitch_s_val))) { ui.showError("Failed to initialize audio module."); ui.disableControls(); return; }
  audio.setVolume(ini.volume);
  audio.setScheduleMultiplier(ini.mult); // Set initial multiplier in audio module if not done by init
  
  referencePanel && initReferencePanel(referencePanel);
  keyboardShortcuts.init?.({ tempoSlider, pitchSlider, volumeSlider, multiplierSlider });
  setupEventListeners(); // Sets up listeners for sliders AND new number inputs

  // Call UI updaters to ensure all parts (text spans, number inputs) are synced based on initial slider values
  ui.updateTempoDisplay(ini.tempo);
  ui.updatePitchDisplay(sValToP(ini.pitch_s_val)); // Pass P value
  ui.updateVolumeDisplay(ini.volume); // Pass raw level
  ui.updateScheduleMultiplierDisplay(ini.mult); // Pass raw multiplier

  ui.updateLoopButton(audio.getLoopingState());
  ui.updateReverseButton(audio.getReverseState());
  ui.enableControls();
  console.log("Application initialized successfully.");
};

function setupEventListeners() {
  addListener(mainImage, 'click', handleLoopToggle);
  addListener(playOnceBtn, 'click', () => audio.playOnce());
  addListener(loopToggleBtn, 'click', handleLoopToggle);
  addListener(reverseToggleBtn, 'click', () => {
    audio.resumeContext().then(() => {
      const { new_s_val, new_isReversed } = audio.toggleReverse();
      ui.updateReverseButton(new_isReversed);
      if (pitchSlider && parseFloat(pitchSlider.value) !== new_s_val) {
        pitchSlider.value = new_s_val;
        // When reverse changes s_val, update pitch display (P) and pitch number input (P)
        ui.updatePitchDisplay(sValToP(new_s_val));
      }
    });
  });

  // Slider input listeners (these will trigger UI updates that also refresh the number inputs)
  addListener(tempoSlider, 'input', e => handleSliderInput(e, audio.setTempo, ui.updateTempoDisplay, parseInt));
  addListener(pitchSlider, 'input', e => handleSliderInput(e, audio.setGlobalPitch, ui.updatePitchDisplay, parseFloat, sValToP)); // sValToP converts s_val to P for UI
  addListener(volumeSlider, 'input', e => handleSliderInput(e, audio.setVolume, ui.updateVolumeDisplay)); // ui.updateVolumeDisplay handles conversion for display
  addListener(multiplierSlider, 'input', e => handleSliderInput(e, audio.setScheduleMultiplier, ui.updateScheduleMultiplierDisplay, parseInt));

  // Listeners for manual number inputs (use 'change' to update on blur/enter)
  addListener(tempoInput, 'change', e => {
    const inputElem = e.target;
    const sliderElem = tempoSlider;
    let val = parseInt(inputElem.value, 10);
    if (!isNaN(val)) {
      val = clamp(val, parseInt(sliderElem.min, 10), parseInt(sliderElem.max, 10));
      inputElem.value = String(val); // Update input in case it was clamped
      sliderElem.value = String(val);
      audio.setTempo(val);
      ui.updateTempoDisplay(val); // Sync text display
    } else { // Revert to current slider value if input is invalid
      inputElem.value = sliderElem.value;
    }
  });

  addListener(volumeInput, 'change', e => { // Volume input is 0-150 (%)
    const inputElem = e.target;
    const sliderElem = volumeSlider; // Slider is 0.0-1.5
    let displayVal = parseInt(inputElem.value, 10); // e.g., 75
    if (!isNaN(displayVal)) {
      const displayMin = parseInt(inputElem.min, 10); // Should be 0
      const displayMax = parseInt(inputElem.max, 10); // Should be MAX_VOLUME * 100
      displayVal = clamp(displayVal, displayMin, displayMax);
      inputElem.value = String(displayVal);

      const audioVal = displayVal / 100.0; // Convert to 0.0-1.5 for audio/slider
      sliderElem.value = String(audioVal);
      audio.setVolume(audioVal);
      ui.updateVolumeDisplay(audioVal); // Expects raw level
    } else {
      inputElem.value = String(Math.round(parseFloat(sliderElem.value) * 100));
    }
  });

  addListener(pitchInput, 'change', e => { // Pitch input is P value (-1000 to 1000)
    const inputElem = e.target;
    const sliderElem = pitchSlider; // Slider is s_val
    let pVal = parseInt(inputElem.value, 10);
    if (!isNaN(pVal)) {
      const pMin = parseInt(inputElem.min, 10); // Should be -1000
      const pMax = parseInt(inputElem.max, 10); // Should be 1000
      pVal = clamp(pVal, pMin, pMax);
      inputElem.value = String(pVal);

      const sVal = pToSVal(pVal); // Convert P to s_val for audio/slider
      sliderElem.value = String(sVal);
      audio.setGlobalPitch(sVal);
      ui.updatePitchDisplay(pVal); // Expects P
    } else {
      inputElem.value = String(sValToP(parseFloat(sliderElem.value)));
    }
  });

  addListener(multiplierInput, 'change', e => {
    const inputElem = e.target;
    const sliderElem = multiplierSlider;
    let val = parseInt(inputElem.value, 10);
    if (!isNaN(val)) {
      val = clamp(val, parseInt(sliderElem.min, 10), parseInt(sliderElem.max, 10));
      inputElem.value = String(val);
      sliderElem.value = String(val);
      audio.setScheduleMultiplier(val);
      ui.updateScheduleMultiplierDisplay(val);
    } else {
      inputElem.value = sliderElem.value;
    }
  });

  addListener(midiDeviceSelect, 'change', e => midiHandler.selectDevice(e.target.value));
  addListener(infoToggleBtn, 'click', toggleSideColumns);
  window.addEventListener('keydown', e => {
    if (e.repeat || _isInputFocused(e.target)) return;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (e.code === 'Space') { audio.playOnce(); e.preventDefault(); }
      else if (e.key === 'i') { toggleSideColumns(); e.preventDefault(); }
      else if (e.key === 'r') { document.getElementById('reverse-toggle-btn')?.click(); e.preventDefault(); }
    }
  });
}

function bootstrap() {
  const c = document.getElementById('app');
  if (!c) { console.error('main.js: #app not found!'); document.body.innerHTML = '<p style="color:red; padding:20px;">Fatal Error: #app missing.</p>'; return; }
  try { buildLayout(c); } catch (err) { console.error('main.js: Layout error:', err); c.innerHTML = '<p style="color:red; padding:20px;">Fatal Error: Could not build layout.</p>'; return; }
  initializeApp();
}
(document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', bootstrap) : bootstrap());
// --- END OF FILE main.js ---
