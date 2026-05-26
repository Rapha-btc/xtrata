// audio-processing/main.js
import { PITCH_SLIDER_CONFIG, sValToP, pToSVal } from '../utils.js';
import { showError, triggerAnimation } from '../uiUpdater.js';
import * as C from './constants.js';
import * as AudioManager from './audioContextManager.js';
import * as BufferManager from './bufferManager.js';
import * as Player from './player.js';
import { timingManager } from './timingManager.js';

// --- State ---
let isReversed = false, currentTempo = 78, currentGlobalPitch = 1, currentVolume = 1;
let currentLoopingSource = null, currentLoopingGainNode = null, secondaryLoopingSource = null, secondaryLoopingGainNode = null;
let currentLoopingSourceStartTime = 0, currentLoopingSourceOffset = 0, currentLoopingSourcePlaybackRate = 1, currentLoopingSourceBufferDuration = 0;

// --- Helpers ---
const safeStop = s => { try { s?.stop(); } catch {} }, safeDisconnect = n => { try { n?.disconnect(); } catch {} };
const clearAnim = s => s?.animationInterval && (clearInterval(s.animationInterval), s.animationInterval = null);
const createGain = (ctx, v, dest) => (g => (g.gain.setValueAtTime(v, ctx.currentTime), g.connect(dest), g))(ctx.createGain());
const fadeGain = (g, v, d) => { const now = g.context.currentTime; g.gain.cancelScheduledValues(now); g.gain.linearRampToValueAtTime(v, now + d); };
const scheduleAnim = (src, dur, cond) => { triggerAnimation(); if (dur > 0.001 && dur < Infinity) src.animationInterval = setInterval(() => cond() ? triggerAnimation() : clearAnim(src), dur * 1000); };
const getCurrentPlaybackPosition = () => {
  if (!currentLoopingSourceStartTime || !currentLoopingSourceBufferDuration) return 0;
  const ctx = AudioManager.getAudioContext(); if (!ctx) return 0;
  let pos = currentLoopingSourceOffset + (ctx.currentTime - currentLoopingSourceStartTime) * currentLoopingSourcePlaybackRate;
  while (pos < 0) pos += currentLoopingSourceBufferDuration;
  while (pos > currentLoopingSourceBufferDuration) pos -= currentLoopingSourceBufferDuration;
  return pos;
};

// --- Core API ---

export async function init(base64Audio, tempo = 78, initial_s_val = PITCH_SLIDER_CONFIG.NEUTRAL_S) {
  currentTempo = tempo; currentVolume = 1;
  const initial_P = sValToP(initial_s_val);
  currentGlobalPitch = Math.abs(initial_P / 100);
  isReversed = initial_P < 0 && !(currentGlobalPitch === 0 && initial_P === 0);

  [currentLoopingSource, currentLoopingGainNode, secondaryLoopingSource, secondaryLoopingGainNode].forEach(n => { safeStop(n); clearAnim(n); safeDisconnect(n); });
  [currentLoopingSource, currentLoopingGainNode, secondaryLoopingSource, secondaryLoopingGainNode] = [null, null, null, null];

  BufferManager.clearBuffers(); AudioManager.closeAudioContext();
  try {
    AudioManager.setupAudioContext(currentVolume);
    const ctx = AudioManager.getAudioContext();
    if (!ctx) throw Error('Failed to setup AudioContext.');
    if (!await BufferManager.loadAndPrepareBuffers(ctx, base64Audio)) throw Error('Failed to load or prepare audio buffers.');
    timingManager.init(ctx, currentTempo);
  } catch (e) { showError(`Audio Init Failed: ${e.message || e}`); return false; }
  return true;
}

export async function playOnce() {
  if (!await AudioManager.ensureAudioContextActive()) return;
  const ctx = AudioManager.getAudioContext(), gain = AudioManager.getMainGainNode();
  const buf = BufferManager.selectCurrentBuffer(isReversed);
  if (buf && currentGlobalPitch > 0) Player.playBufferSource(ctx, gain, buf, ctx.currentTime, currentGlobalPitch, false);
}

export async function startLoop() {
  if (timingManager.getLoopingState() || !await AudioManager.ensureAudioContextActive()) return;
  const ctx = AudioManager.getAudioContext(), mainGain = AudioManager.getMainGainNode();
  if (!ctx || !mainGain) return showError("Audio context or main gain not ready for starting loop.");
  const sampleType = BufferManager.getSampleType();
  if (currentGlobalPitch <= 0 && sampleType === 'loop') return showError("Native loop requires positive pitch.");
  const bufToPlay = BufferManager.selectCurrentBuffer(isReversed), decodedBuf = BufferManager.getDecodedBuffer();
  if (!bufToPlay || !decodedBuf) return showError("Buffer or decoded buffer not available for loop.");

  [currentLoopingSource, currentLoopingGainNode].forEach((n, i) => { n && (safeStop(n), clearAnim(n), i && safeDisconnect(n)); });
  [currentLoopingSource, currentLoopingGainNode] = [null, null];

  const rate = currentGlobalPitch, dur = decodedBuf.duration; currentLoopingSourceBufferDuration = dur;
  let offset = currentLoopingSource ? getCurrentPlaybackPosition() : 0;
  if (isReversed) offset = dur - offset;
  currentLoopingSourceStartTime = ctx.currentTime; currentLoopingSourceOffset = offset; currentLoopingSourcePlaybackRate = isReversed ? -rate : rate;

  const scheduleCb = t => {
    if (currentGlobalPitch <= 0 && sampleType === 'one-shot') return;
    const effBuf = BufferManager.selectCurrentBuffer(isReversed);
    if (sampleType === 'one-shot' && effBuf) Player.playBufferSource(ctx, mainGain, effBuf, t, currentGlobalPitch, false);
  };
  if (!timingManager.startLoop(scheduleCb)) return showError('Failed to start timing loop.');
  if (sampleType !== 'loop') return;

  const loopStart = timingManager.getSessionInitialStartTime();
  if (!(loopStart > 0)) return timingManager.stopLoop(), showError("Invalid start time for native loop.");

  currentLoopingGainNode = createGain(ctx, currentVolume, mainGain);
  currentLoopingSource = Player.playBufferSource(ctx, currentLoopingGainNode, bufToPlay, ctx.currentTime, rate, true, null, offset);
  if (!currentLoopingSource) return timingManager.stopLoop(), showError("Failed to create looping source."), safeDisconnect(currentLoopingGainNode), currentLoopingGainNode = null;

  clearAnim(currentLoopingSource);
  setTimeout(() => {
    if (currentLoopingSource && timingManager.getLoopingState())
      scheduleAnim(currentLoopingSource, dur / currentGlobalPitch, () => timingManager.getLoopingState() && currentGlobalPitch > 0);
  }, Math.max(0, (loopStart - ctx.currentTime) * 1000));
}

export function stopLoop() {
  timingManager.stopLoop();
  [currentLoopingSource, secondaryLoopingSource].forEach(safeStop);
  [currentLoopingGainNode, secondaryLoopingGainNode].forEach(safeDisconnect);
  [currentLoopingSource, currentLoopingGainNode, secondaryLoopingSource, secondaryLoopingGainNode] = [null, null, null, null];
  currentLoopingSourceStartTime = 0; currentLoopingSourceOffset = 0; currentLoopingSourcePlaybackRate = 1; currentLoopingSourceBufferDuration = 0;
}

export function setScheduleMultiplier(m) { timingManager.setScheduleMultiplier(Math.max(1, parseInt(m, 10) || 1)); }
export const getScheduleMultiplier = () => timingManager.getCurrentScheduleMultiplier();
export function setTempo(bpm) { bpm = parseFloat(bpm); if (bpm > 0) { currentTempo = bpm; timingManager.setTempo(bpm); } }

export function toggleReverse() {
  const ctx = AudioManager.getAudioContext();
  if (!ctx || !BufferManager.getDecodedBuffer() || !BufferManager.getReversedBuffer()) {
    const val = Math.round((isReversed ? -currentGlobalPitch : currentGlobalPitch) * 100);
    return { new_s_val: pToSVal(val), new_isReversed: isReversed };
  }
  let val = Math.round((isReversed ? -currentGlobalPitch : currentGlobalPitch) * 100);
  const newVal = val === 0 ? (isReversed ? 100 : -100) : -val, new_s_val = pToSVal(newVal);
  setGlobalPitch(new_s_val);
  return { new_s_val, new_isReversed: isReversed };
}

export function setGlobalPitch(s_val) {
  const ctx = AudioManager.getAudioContext(), mainGain = AudioManager.getMainGainNode();
  if (!ctx || !mainGain) return;
  const P_new = sValToP(s_val), new_rate = Math.abs(P_new / 100), new_rev = P_new < 0;
  const wasLooping = timingManager.getLoopingState(), old_rev = isReversed, old_rate = currentGlobalPitch;
  const stopping = new_rate === 0 && old_rate > 0, starting = new_rate > 0 && old_rate === 0, dirChange = new_rev !== old_rev && new_rate > 0;
  isReversed = new_rev; currentGlobalPitch = new_rate; if (P_new === 0) isReversed = false;
  const sampleType = BufferManager.getSampleType();

  if (!wasLooping || !currentLoopingSource || sampleType === 'one-shot') {
    if (currentLoopingSource && sampleType === 'loop' && new_rate > 0)
      currentLoopingSource.playbackRate.setTargetAtTime(new_rate, ctx.currentTime, C.SMOOTH_PARAM_TIME);
    return;
  }

  clearAnim(currentLoopingSource);
  const decodedBuf = BufferManager.getDecodedBuffer(); if (!decodedBuf) return;
  const dur = decodedBuf.duration; currentLoopingSourceBufferDuration = dur;
  let offset = currentLoopingSource ? getCurrentPlaybackPosition() : 0;
  if (isReversed) offset = dur - offset;
  currentLoopingSourceStartTime = ctx.currentTime; currentLoopingSourceOffset = offset; currentLoopingSourcePlaybackRate = new_rev ? -new_rate : new_rate;

  if (stopping) return currentLoopingGainNode?.gain.cancelScheduledValues(ctx.currentTime), currentLoopingGainNode?.gain.setTargetAtTime(0, ctx.currentTime, C.CROSSFADE_DURATION);

  if (starting) {
    const buffer = BufferManager.selectCurrentBuffer(isReversed);
    if (!buffer) return showError("Buffer unavailable for starting loop.");
    if (currentLoopingSource && old_rev !== isReversed) safeStop(currentLoopingSource), safeDisconnect(currentLoopingGainNode), [currentLoopingSource, currentLoopingGainNode] = [null, null];
    if (!currentLoopingSource) {
      safeDisconnect(currentLoopingGainNode);
      currentLoopingGainNode = createGain(ctx, 0, mainGain);
      currentLoopingSource = Player.playBufferSource(ctx, currentLoopingGainNode, buffer, ctx.currentTime, new_rate, true, null, offset);
      if (!currentLoopingSource) return showError("Failed to create source for starting loop."), safeDisconnect(currentLoopingGainNode), currentLoopingGainNode = null;
    } else currentLoopingSource.playbackRate.setTargetAtTime(new_rate, ctx.currentTime, C.SMOOTH_PARAM_TIME);
    fadeGain(currentLoopingGainNode, currentVolume, C.CROSSFADE_DURATION);
  } else if (dirChange) {
    const newBuf = BufferManager.selectCurrentBuffer(isReversed);
    if (!newBuf) return showError("Buffer unavailable for direction change.");
    if (!currentLoopingGainNode) return console.error("Missing gain node for crossfade.");
    safeStop(secondaryLoopingSource); safeDisconnect(secondaryLoopingGainNode);
    const t0 = ctx.currentTime;
    secondaryLoopingGainNode = createGain(ctx, 0, mainGain);
    secondaryLoopingSource = Player.playBufferSource(ctx, secondaryLoopingGainNode, newBuf, t0, new_rate, true, null, offset);
    if (!secondaryLoopingSource) return showError("Failed to create secondary source for crossfade."), safeDisconnect(secondaryLoopingGainNode), secondaryLoopingGainNode = null;
    fadeGain(currentLoopingGainNode, 0, C.CROSSFADE_DURATION); fadeGain(secondaryLoopingGainNode, currentVolume, C.CROSSFADE_DURATION);
    const oldSrc = currentLoopingSource, oldGain = currentLoopingGainNode;
    [currentLoopingSource, currentLoopingGainNode, secondaryLoopingSource, secondaryLoopingGainNode] = [secondaryLoopingSource, secondaryLoopingGainNode, null, null];
    setTimeout(() => { safeStop(oldSrc); safeDisconnect(oldGain); }, C.CROSSFADE_DURATION * 1000 + 50);
  } else if (new_rate > 0 && currentLoopingSource) {
    currentLoopingSource.playbackRate.setTargetAtTime(new_rate, ctx.currentTime, C.SMOOTH_PARAM_TIME);
  }

  if (currentLoopingSource && decodedBuf && currentGlobalPitch > 0)
    scheduleAnim(currentLoopingSource, decodedBuf.duration / currentGlobalPitch, () => timingManager.getLoopingState() && currentGlobalPitch > 0);
}

export function setVolume(v) {
  const gain = AudioManager.getMainGainNode(), ctx = AudioManager.getAudioContext();
  v = parseFloat(v);
  if (v >= 0 && gain && ctx) {
    currentVolume = v;
    gain.gain.setTargetAtTime(currentVolume, ctx.currentTime, C.SMOOTH_PARAM_TIME);
    if (currentLoopingGainNode && currentGlobalPitch > 0) currentLoopingGainNode.gain.setTargetAtTime(currentVolume, ctx.currentTime, C.SMOOTH_PARAM_TIME);
  }
}

// --- State Getters ---
export const getLoopingState = () => timingManager.getLoopingState();
export const getReverseState = () => isReversed;
export const getAudioContextState = () => AudioManager.getAudioContextState();
export const resumeContext = async () => AudioManager.ensureAudioContextActive();
export const getPlaybackRateForNote = n => currentGlobalPitch === 0 ? 0 : (BufferManager.getBasePlaybackRateForMidiNote(n) ?? undefined) * currentGlobalPitch;
export async function playSampleAtRate(rate) {
  rate = parseFloat(rate); if (!await AudioManager.ensureAudioContextActive()) return;
  const ctx = AudioManager.getAudioContext(), gain = AudioManager.getMainGainNode();
  if (!ctx || !gain || rate === 0) return;
  const buf = BufferManager.selectCurrentBuffer(rate < 0); if (buf) Player.playBufferSource(ctx, gain, buf, ctx.currentTime, Math.abs(rate), false);
}
export const getSessionStartTime = () => timingManager.getSessionInitialStartTime();
export const getCurrentTempo = () => currentTempo;
export const getCurrentPitch = () => currentGlobalPitch;
export const getCurrentPitchPercent = () => Math.round((isReversed ? -currentGlobalPitch : currentGlobalPitch) * 100);
