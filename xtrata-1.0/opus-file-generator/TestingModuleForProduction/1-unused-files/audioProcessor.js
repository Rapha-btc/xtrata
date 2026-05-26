// --- audioProcessor.js ---
import { base64ToArrayBuffer, sValToP, pToSVal, PITCH_SLIDER_CONFIG } from '../utils.js';
import { showError, triggerAnimation } from '../uiUpdater.js';

const SMOOTH_PARAM_TIME = 0.01, A4_NOTE = 69, A4_FREQ = 440, SEMITONE = 2 ** (1 / 12), MIN_NOTE = 21, MAX_NOTE = 108, CROSSFADE_DURATION = 0.010, NATIVE_LOOP_ANIMATION_EPSILON = 0.02;
let audioContext, mainGainNode, decodedBuffer, reversedBuffer, isReversed = false,
    currentTempo = 78, currentGlobalPitch = 1, currentVolume = 1, originalSampleFrequency,
    sampleType = 'one-shot', midiNoteToPlaybackRate = new Map(), currentLoopingSource,
    nextNativeLoopAnimationTime = 0;

// --- timingManager (modular, concise, no change to API) ---
const timingManager = (() => {
  const INTERVAL = 25, LOOKAHEAD_TIME = 0.1, SCHEDULE_DELAY = 0.05;
  let audioCtx, internalTempo = 120, internalMultiplier = 1, isLoopingActive = false,
      schedulerTimeoutId, onScheduleCallback, sessionInitialStartTime = 0, scheduledSubBeatCount = 0;
  const getSubBeatDuration = () => (internalTempo <= 0 || internalMultiplier <= 0) ? Infinity : (60 / internalTempo) / internalMultiplier;
  const schedulerLoop = () => {
    if (!isLoopingActive || !audioCtx || !onScheduleCallback) return;
    const now = audioCtx.currentTime, scheduleUntil = now + LOOKAHEAD_TIME, subBeatDuration = getSubBeatDuration();
    if (subBeatDuration === Infinity) return _stopScheduler(true);
    while (true) {
      const scheduledTime = sessionInitialStartTime + (scheduledSubBeatCount * subBeatDuration);
      if (scheduledTime < now - 0.001) { scheduledSubBeatCount++; continue; }
      if (scheduledTime < scheduleUntil) { onScheduleCallback(scheduledTime, currentGlobalPitch); scheduledSubBeatCount++; }
      else break;
    }
    schedulerTimeoutId = setTimeout(schedulerLoop, INTERVAL);
  };
  const _startScheduler = callback => {
    if (isLoopingActive || !audioCtx || typeof callback !== 'function') return false;
    onScheduleCallback = callback; isLoopingActive = true;
    if (sessionInitialStartTime === 0) { sessionInitialStartTime = audioCtx.currentTime + SCHEDULE_DELAY; scheduledSubBeatCount = 0; }
    else {
      const d = getSubBeatDuration(), elapsed = Math.max(0, audioCtx.currentTime - sessionInitialStartTime);
      scheduledSubBeatCount = d > 0 && d !== Infinity ? Math.ceil(elapsed / d) : 0;
    }
    schedulerLoop(); return true;
  };
  const _stopScheduler = (reset = true) => { clearTimeout(schedulerTimeoutId); schedulerTimeoutId = null; isLoopingActive = false; if (reset) sessionInitialStartTime = scheduledSubBeatCount = 0; };
  return {
    init: (_ctx, tempo) => { if (!(_ctx instanceof AudioContext)) throw Error('TimingManager: Invalid AudioContext'); audioCtx = _ctx; internalTempo = +tempo > 0 ? +tempo : 78; internalMultiplier = 1; _stopScheduler(true); },
    startLoop: _startScheduler,
    stopLoop: () => { _stopScheduler(true); onScheduleCallback = null; },
    setTempo: bpm => { bpm = +bpm; if (bpm > 0 && internalTempo !== bpm) { internalTempo = bpm; if (isLoopingActive) { const cb = onScheduleCallback; _stopScheduler(false); _startScheduler(cb); }}},
    setPitch: () => {},
    setScheduleMultiplier: m => { m = parseInt(m, 10); if (m >= 1 && internalMultiplier !== m) { internalMultiplier = m; if (isLoopingActive) { const cb = onScheduleCallback; _stopScheduler(false); _startScheduler(cb); }}},
    getLoopingState: () => isLoopingActive,
    getCurrentTempo: () => internalTempo,
    getCurrentScheduleMultiplier: () => internalMultiplier,
    getSessionInitialStartTime: () => sessionInitialStartTime,
  };
})();

const _ensureContext = async () => {
  if (!audioContext) return showError('Audio system not ready.'), false;
  if (audioContext.state === 'suspended') try { await audioContext.resume(); } catch (e) { showError('Could not resume audio.'); throw e; }
  return true;
};
const _selectBuffer = () => { const buf = isReversed ? reversedBuffer : decodedBuffer; if (!buf) showError(`Cannot play: ${isReversed ? 'Reversed' : 'Original'} buffer unavailable.`); return buf; };
const _play = (buf, time, rate, loop = false) => {
  if (!buf || !audioContext || rate <= 0) return null;
  try { const src = audioContext.createBufferSource(); Object.assign(src, { buffer: buf, loop }); src.playbackRate.value = rate; src.connect(mainGainNode); triggerAnimation(); src.start(time); return src; } catch (e) { showError('Failed to play.'); console.error(e); return null; }
};
const _reverse = buf => {
  const { numberOfChannels, length, sampleRate } = buf, rev = audioContext.createBuffer(numberOfChannels, length, sampleRate);
  for (let ch = 0; ch < numberOfChannels; ch++) { const d = buf.getChannelData(ch), r = rev.getChannelData(ch); for (let i = 0; i < length; i++) r[i] = d[length - 1 - i]; }
  return rev;
};
const _setupContext = () => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('AudioContext not supported by this browser.');
  audioContext = new Ctx(); mainGainNode = audioContext.createGain(); mainGainNode.gain.setValueAtTime(currentVolume, audioContext.currentTime); mainGainNode.connect(audioContext.destination);
};
const _decodeAndPrepare = async base64 => {
  decodedBuffer = await audioContext.decodeAudioData(base64ToArrayBuffer(base64)); reversedBuffer = _reverse(decodedBuffer);
  const freq = parseFloat(document.getElementById('audio-meta-frequency')?.textContent); originalSampleFrequency = Number.isNaN(freq) || freq <= 0 ? 440 : freq;
  const typeText = (document.getElementById('audio-meta-sample-type') || document.getElementById('audio-meta-loop'))?.textContent.trim().toLowerCase();
  sampleType = (typeText === 'loop' || typeText === 'yes') ? 'loop' : 'one-shot';
  midiNoteToPlaybackRate.clear();
  for (let n = MIN_NOTE; n <= MAX_NOTE; n++) midiNoteToPlaybackRate.set(n, (A4_FREQ * (SEMITONE ** (n - A4_NOTE))) / originalSampleFrequency);
};

// --- API ---
export async function init(base64, tempo = 78, initial_s_val = PITCH_SLIDER_CONFIG.NEUTRAL_S) {
  [currentTempo, currentVolume, isReversed] = [tempo, 1, false];
  [audioContext, mainGainNode, decodedBuffer, reversedBuffer, currentLoopingSource] = Array(5).fill(null);
  midiNoteToPlaybackRate.clear(); sampleType = 'one-shot';
  const initial_P = sValToP(initial_s_val); currentGlobalPitch = Math.abs(initial_P / 100.0); isReversed = initial_P < 0; if (currentGlobalPitch === 0 && initial_P === 0) isReversed = false;
  try { _setupContext(); await _decodeAndPrepare(base64); timingManager.init(audioContext, currentTempo); } catch (e) { showError(`Audio Init Failed: ${e.message || e}`); console.error("Audio Init Failed:", e); return false; }
  return true;
}

export async function playOnce() {
  if (await _ensureContext()) { const buf = _selectBuffer(); if (buf && currentGlobalPitch > 0) _play(buf, audioContext.currentTime, currentGlobalPitch); }
}

export async function startLoop() {
  if (timingManager.getLoopingState() || !(await _ensureContext())) return;
  if (currentGlobalPitch <= 0 && sampleType === 'loop') return;
  const buf = _selectBuffer(); if (!buf) return showError("Buffer not available for loop.");
  if (currentLoopingSource) try { currentLoopingSource.stop(); } catch { } currentLoopingSource = null;
  
  // Reset tracking
  nextNativeLoopAnimationTime = 0;

  const scheduleCallback = (scheduledTime, effectiveRate) => {
    if (effectiveRate <= 0) return;
    
    if (sampleType === 'one-shot') {
      _play(buf, scheduledTime, effectiveRate);
    }
    else if (sampleType === 'loop' && decodedBuffer && effectiveRate > 0) {
      const d = decodedBuffer.duration / effectiveRate;
      if (d <= NATIVE_LOOP_ANIMATION_EPSILON / 2) return;
      
      if (scheduledTime >= nextNativeLoopAnimationTime - NATIVE_LOOP_ANIMATION_EPSILON) {
        // Instead of triggering animation here, do nothing or keep minimal logic
        // Animation will be scheduled exactly when starting playback below
        
        while (nextNativeLoopAnimationTime <= scheduledTime + NATIVE_LOOP_ANIMATION_EPSILON) {
          nextNativeLoopAnimationTime += d;
          if (d < 0.001 && audioContext && nextNativeLoopAnimationTime > audioContext.currentTime + 60) {
            nextNativeLoopAnimationTime = 0;
            break;
          }
        }
      }
    }
  };

  const ok = timingManager.startLoop(scheduleCallback);
  if (!ok) return showError('Failed to start timing loop.'), nextNativeLoopAnimationTime = 0;

  if (sampleType === 'loop') {
    const st = timingManager.getSessionInitialStartTime();
    if (st > 0 && decodedBuffer && currentGlobalPitch > 0) {
      mainGainNode.gain.setTargetAtTime(currentVolume, audioContext.currentTime, SMOOTH_PARAM_TIME);

      // Start the loop playback source at st
      currentLoopingSource = _play(buf, st, currentGlobalPitch, true);

      // Schedule the animation exactly at st
      const delayMs = Math.max(0, (st - audioContext.currentTime) * 1000);
      setTimeout(() => {
        triggerAnimation();
        // Then, set up a repeating timer for subsequent loops:
        const loopDurationMs = (decodedBuffer.duration / currentGlobalPitch) * 1000;
        // Use setInterval to keep triggering animation at loop boundaries
        const animationInterval = setInterval(() => {
          triggerAnimation();
        }, loopDurationMs);

        // Optionally store animationInterval to clear it on stopLoop
        currentLoopingSource.animationInterval = animationInterval;
      }, delayMs);

      const d = decodedBuffer.duration / currentGlobalPitch;
      nextNativeLoopAnimationTime = d > 0 ? st + d : 0;
    } else {
      nextNativeLoopAnimationTime = 0;
    }
  } else {
    nextNativeLoopAnimationTime = 0;
  }
}

export function stopLoop() {
  timingManager.stopLoop();
  if (currentLoopingSource) {
    try {
      // Clear scheduled animation interval if any
      if (currentLoopingSource.animationInterval) {
        clearInterval(currentLoopingSource.animationInterval);
        currentLoopingSource.animationInterval = null;
      }
      currentLoopingSource.stop();
    } catch {}
  }
  currentLoopingSource = null;
  nextNativeLoopAnimationTime = 0;
}


export function setScheduleMultiplier(m) { timingManager.setScheduleMultiplier(Math.max(1, parseInt(m, 10))); }
export const getScheduleMultiplier = () => timingManager.getCurrentScheduleMultiplier();

export function setTempo(bpm) { if (bpm > 0) { currentTempo = bpm; timingManager.setTempo(bpm); }}

export function toggleReverse() {
  if (!audioContext || !decodedBuffer || !reversedBuffer) return { s_val: pToSVal(PITCH_SLIDER_CONFIG.NEUTRAL_S), new_isReversed: isReversed };
  let P_current_val = isReversed ? -currentGlobalPitch * 100 : currentGlobalPitch * 100;
  if (currentGlobalPitch === 0) P_current_val = 0; P_current_val = Math.round(P_current_val);
  let P_new_target = P_current_val === 0 ? (isReversed ? 100 : -100) : -P_current_val;
  const new_s_val = pToSVal(P_new_target); setGlobalPitch(new_s_val); return { new_s_val, new_isReversed: isReversed };
}

export function setGlobalPitch(s_val) {
  if (!audioContext) return;
  const P = sValToP(s_val),
        new_rate_abs = Math.abs(P / 100.0),
        new_isReversed = P < 0;

  const wasLooping = timingManager.getLoopingState();
  const old_isReversed = isReversed;
  const old_rate_abs = currentGlobalPitch;
  const old_P = Math.round((old_isReversed ? -old_rate_abs : old_rate_abs) * 100);

  const stopping = new_rate_abs === 0 && old_rate_abs > 0;
  const starting = new_rate_abs > 0 && old_rate_abs === 0;
  const crossing = (old_P > 0 && P < 0) || (old_P < 0 && P > 0);

  // Update states
  isReversed = new_isReversed;
  currentGlobalPitch = new_rate_abs;
  if (P === 0) isReversed = false;

  if (!wasLooping) {
    // Not looping, just update playbackRate if source exists
    if (currentLoopingSource) {
      currentLoopingSource.playbackRate.setTargetAtTime(new_rate_abs, audioContext.currentTime, SMOOTH_PARAM_TIME);
    }
    return;
  }

  // Handle fade crossfade on direction change or start/stop
  if (stopping) {
    // Fade out current source and stop
    if (currentLoopingGainNode) {
      currentLoopingGainNode.gain.cancelScheduledValues(audioContext.currentTime);
      currentLoopingGainNode.gain.setTargetAtTime(0, audioContext.currentTime, CROSSFADE_DURATION);
      setTimeout(() => {
        try { currentLoopingSource?.stop(); } catch {}
        currentLoopingSource = null;
        currentLoopingGainNode = null;
      }, CROSSFADE_DURATION * 1000 + 10);
    }
    return;
  }

  if (starting) {
    // Start loop normally with fade in
    if (currentLoopingSource) {
      currentLoopingGainNode.gain.cancelScheduledValues(audioContext.currentTime);
      currentLoopingGainNode.gain.setTargetAtTime(currentVolume, audioContext.currentTime, CROSSFADE_DURATION);
      currentLoopingSource.playbackRate.setTargetAtTime(new_rate_abs, audioContext.currentTime, SMOOTH_PARAM_TIME);
    } else {
      startLoop(); // your existing function to start looping playback
      if (currentLoopingGainNode) {
        currentLoopingGainNode.gain.setValueAtTime(0, audioContext.currentTime);
        currentLoopingGainNode.gain.linearRampToValueAtTime(currentVolume, audioContext.currentTime + CROSSFADE_DURATION);
      }
    }
    return;
  }

  if (crossing) {
    // Crossfade between forward and reverse playback

    // Setup secondary gain node and source for new direction
    const buf = _selectBuffer();
    if (!buf) return showError("Buffer unavailable for direction change.");

    // Prepare secondary source
    secondaryLoopingSource = audioContext.createBufferSource();
    secondaryLoopingSource.buffer = buf;
    secondaryLoopingSource.loop = sampleType === 'loop';
    secondaryLoopingSource.playbackRate.setValueAtTime(new_rate_abs, audioContext.currentTime);

    // Create gain node for secondary source
    secondaryLoopingGainNode = audioContext.createGain();
    secondaryLoopingGainNode.gain.setValueAtTime(0, audioContext.currentTime);

    // Connect and start secondary source
    secondaryLoopingSource.connect(secondaryLoopingGainNode).connect(mainGainNode);
    const startTime = audioContext.currentTime + 0.001; // slight delay to avoid glitches
    secondaryLoopingSource.start(startTime);

    // Crossfade gains
    currentLoopingGainNode.gain.cancelScheduledValues(startTime);
    currentLoopingGainNode.gain.linearRampToValueAtTime(0, startTime + CROSSFADE_DURATION);
    secondaryLoopingGainNode.gain.linearRampToValueAtTime(currentVolume, startTime + CROSSFADE_DURATION);

    // Stop old source after fade out
    setTimeout(() => {
      try { currentLoopingSource?.stop(); } catch {}
      // Swap references
      currentLoopingSource = secondaryLoopingSource;
      currentLoopingGainNode = secondaryLoopingGainNode;
      secondaryLoopingSource = null;
      secondaryLoopingGainNode = null;
    }, CROSSFADE_DURATION * 1000 + 20);

    return;
  }

  // Normal rate update without direction change
  if (currentLoopingSource) {
    currentLoopingSource.playbackRate.setTargetAtTime(new_rate_abs, audioContext.currentTime, SMOOTH_PARAM_TIME);
  }
}

export function setVolume(v) { if (v >= 0 && mainGainNode && audioContext) { currentVolume = v; mainGainNode.gain.setTargetAtTime(v, audioContext.currentTime, SMOOTH_PARAM_TIME); }}
export const getLoopingState = () => timingManager.getLoopingState();
export const getReverseState = () => isReversed;
export const getAudioContextState = () => audioContext?.state || 'unavailable';
export const resumeContext = _ensureContext;
export const getPlaybackRateForNote = n => currentGlobalPitch === 0 ? 0 : midiNoteToPlaybackRate.get(n) * currentGlobalPitch;

export async function playSampleAtRate(r) {
  if (r === 0) return;
  if (await _ensureContext()) {
    const buf = _selectBuffer();
    if (buf) _play(buf, audioContext.currentTime, Math.abs(r));
  }
}

export const getSessionStartTime = () => timingManager.getSessionInitialStartTime();
export const getCurrentTempo = () => currentTempo;
export const getCurrentPitch = () => currentGlobalPitch;
export const getCurrentPitchPercent = () => sValToP(pToSVal(Math.round((isReversed ? -currentGlobalPitch : currentGlobalPitch) * 100)));
// --- END OF FILE ---
