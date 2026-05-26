// --- START OF FILE keyboardShortcuts.js ---

import * as audio from './audio-processing/main.js';
import * as ui from './uiUpdater.js';
import { clamp, _isInputFocused, sValToP, pToSVal, PITCH_SLIDER_CONFIG } from './utils.js'; // Added sValToP, pToSVal, PITCH_SLIDER_CONFIG

let tempoRef, pitchRef, volumeRef, multiplierRef, lastVolume = 1.0;

const EPS = 1e-9, ST_RATIO = 2 ** (1 / 12);
// PITCH_LINEAR is now 1, meaning 1% change in P (playback percentage)
const STEPS = { TEMPO_SMALL: 1, TEMPO_LARGE: 10, PITCH_LINEAR: 1, VOLUME: 0.05 };
const MULT_MAP = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 8, 6: 16, 7: 32, 8: 8 }; // Key '8' maps to x8 multiplier

const validateSlider = (ref, name) => {
  if (!ref) return false;
  const cur = +ref.value, min = +ref.min, max = +ref.max;
  return [cur, min, max].some(Number.isNaN) ? (console.error(`Invalid ${name} slider`), false) : { cur, min, max };
};

const applyChange = (ref, setAudioFn, updateUIDisplayFn, audioValue, labelForLog, valueForLogAndUI) => {
  try {
    setAudioFn?.(audioValue); // audioValue is s_val for pitch
    updateUIDisplayFn?.(valueForLogAndUI); // valueForLogAndUI is P for pitch
    
    if (ref) ref.value = clamp(audioValue, +ref.min, +ref.max); // Slider uses audioValue (s_val for pitch)
    
    let logMessage = `${labelForLog} set to: `;
    if (labelForLog === 'Multiplier') {
        logMessage += `x${valueForLogAndUI}`;
    } else if (labelForLog.includes('Pitch')) {
        // audioValue is s_val. valueForLogAndUI is P.
        const actualRate = sValToP(audioValue)/100.0; 
        logMessage += `${valueForLogAndUI}% (Rate: ${actualRate.toFixed(4)}, s_val: ${audioValue})`;
    } else if (labelForLog === 'Tempo') {
        logMessage += `${valueForLogAndUI} BPM`;
    } else if (labelForLog.includes('Volume') || labelForLog.includes('Mute')) { // Volume or Mute label
        logMessage += `${Math.round(valueForLogAndUI*100)}%`;
    } else {
        logMessage += valueForLogAndUI;
    }
    
    console.log(logMessage);

  } catch (err) { 
    console.error(`applyChange error for ${labelForLog}:`, err); 
    ui.showError(`Failed to set ${labelForLog}`); 
  }
};


export function adjustTempo(d) {
  const s = validateSlider(tempoRef, 'tempo');
  if (!s) return;
  const next = clamp(s.cur + d, s.min, s.max);
  if (next !== s.cur) applyChange(tempoRef, audio.setTempo, ui.updateTempoDisplay, next, 'Tempo', next);
}

export function adjustPitch(type, amt = 0) {
    const s = validateSlider(pitchRef, 'pitch'); // pitchRef is the s_val slider
    if (!s) return;

    const current_P = sValToP(s.cur); // s.cur is current s_val
    let next_P;
    let label = `Pitch by ${type}`;

    if (type === 'linear') { // amt is +/- 1 for 1% change in P
        next_P = current_P + amt;
    } else if (type === 'semitone') {
        label = `Pitch (${amt > 0 ? '+1' : '-1'} ST)`;
        if (current_P === 0) {
            // If P is 0, jump by roughly a semitone from 100% standard.
            // (1.059 - 1) * 100 = 5.9 P. Let's use 6P.
            next_P = amt > 0 ? 6 : -6; 
        } else {
            let current_rate_abs = Math.abs(current_P / 100.0);
            let next_rate_abs = current_rate_abs * (amt > 0 ? ST_RATIO : 1 / ST_RATIO);
            // Preserve sign, ensure minimum magnitude if P was not 0.
            const min_abs_P_val = 1; // Min non-zero P is 1% or -1%
            next_P = Math.sign(current_P) * Math.max(min_abs_P_val / 100.0, next_rate_abs) * 100.0;
        }
    } else if (type === 'mult') { // amt is multiplier like 2 or 0.5
        label = `Pitch (Mult x${amt})`;
        if (current_P === 0) {
            next_P = 0; // Multiplying 0 is 0
        } else {
            next_P = current_P * amt;
        }
    } else if (type === 'reset') {
        label = 'Pitch Reset';
        next_P = 100; // Target 100% playback
    } else { return; }

    next_P = clamp(Math.round(next_P), -1000, 1000); // Clamp P to its effective min/max

    const next_s_val_candidate = pToSVal(next_P);
    // Clamp s_val to slider actual min/max (from PITCH_SLIDER_CONFIG as source of truth for range)
    const next_s_val = clamp(next_s_val_candidate, PITCH_SLIDER_CONFIG.MIN_S, PITCH_SLIDER_CONFIG.MAX_S);
    
    const final_P_for_display = sValToP(next_s_val); // Recalculate P from the actual s_val

    if (next_s_val !== s.cur) {
        applyChange(pitchRef, audio.setGlobalPitch, ui.updatePitchDisplay, next_s_val, label, final_P_for_display);
    }
}


export function adjustVolume(d) {
  const s = validateSlider(volumeRef, 'volume');
  if (!s) return;
  const next = clamp(s.cur + d, s.min, s.max);
  if (Math.abs(next - s.cur) > EPS) {
    if (next > s.min) lastVolume = next;
    applyChange(volumeRef, audio.setVolume, ui.updateVolumeDisplay, next, 'Volume', next);
  }
}

export function toggleMute() {
  const s = validateSlider(volumeRef, 'volume');
  if (!s) return;
  const isMuted = s.cur <= s.min + EPS;
  const next = isMuted ? clamp(lastVolume > s.min ? lastVolume : s.max, s.min, s.max) : s.min;
  applyChange(volumeRef, audio.setVolume, ui.updateVolumeDisplay, next, isMuted ? 'Unmute' : 'Mute', next);
}

export function setMultiplier(k) {
  const target = MULT_MAP[k];
  const cur = audio.getScheduleMultiplier?.() ?? 1;
  if (target && cur !== target) applyChange(multiplierRef, audio.setScheduleMultiplier, ui.updateScheduleMultiplierDisplay, target, 'Multiplier', target);
}

function handleKey(e) {
  if (_isInputFocused(e.target)) return;
  const { key, shiftKey: s, ctrlKey: c, metaKey: m, altKey: a } = e;
  const ctrl = c || m, mod = (C, S, A) => ctrl === C && s === S && a === A;
  let handled = true;

  if (mod(true, true, false)) { // Ctrl+Shift
    if (['=', '+'].includes(key)) adjustTempo(STEPS.TEMPO_LARGE);
    else if (['-', '_'].includes(key)) adjustTempo(-STEPS.TEMPO_LARGE);
    else if ([']', '}'].includes(key)) adjustPitch('semitone', 1);
    else if (['[', '{'].includes(key)) adjustPitch('semitone', -1);
    else handled = false;
  } else if (mod(false, true, false)) { // Shift
    if (['=', '+'].includes(key)) adjustTempo(STEPS.TEMPO_SMALL);
    else if (['-', '_'].includes(key)) adjustTempo(-STEPS.TEMPO_SMALL);
    else if ([']', '}'].includes(key)) adjustPitch('linear', STEPS.PITCH_LINEAR); // P change by 1
    else if (['[', '{'].includes(key)) adjustPitch('linear', -STEPS.PITCH_LINEAR); // P change by -1
    else handled = false;
  } else if (mod(false, false, false)) { // No modifier
    if (key === '=') adjustPitch('mult', 2);
    else if (key === '-') adjustPitch('mult', 0.5);
    else if (key === '0') adjustPitch('reset'); // Resets P to 100%
    else if (key === 'ArrowUp') adjustVolume(STEPS.VOLUME);
    else if (key === 'ArrowDown') adjustVolume(-STEPS.VOLUME);
    else if (/^[mM]$/.test(key)) toggleMute();
    else if (MULT_MAP[key]) setMultiplier(key);
    else handled = false;
  } else handled = false;

  if (handled) e.preventDefault();
}

export function init({ tempoSlider, pitchSlider, volumeSlider, multiplierSlider }) {
  if (![tempoSlider, pitchSlider, volumeSlider, multiplierSlider].every(i => i instanceof HTMLInputElement)) {
    console.error('Invalid slider refs:', { tempoSlider, pitchSlider, volumeSlider, multiplierSlider });
    tempoRef = pitchRef = volumeRef = multiplierRef = null;
    return;
  }
  [tempoRef, pitchRef, volumeRef, multiplierRef] = [tempoSlider, pitchSlider, volumeSlider, multiplierSlider];
  lastVolume = +volumeRef.value || lastVolume;
  document.addEventListener('keydown', handleKey);
  console.log('Keyboard shortcuts initialized.');
}

export function destroy() {
  document.removeEventListener('keydown', handleKey);
  tempoRef = pitchRef = volumeRef = multiplierRef = null;
  console.log('Keyboard shortcuts destroyed.');
}


// --- END OF FILE keyboardShortcuts.js ---