// audio-processing/bufferManager.js
import { base64ToArrayBuffer } from '../utils.js';
import { showError } from '../uiUpdater.js';
import { A4_NOTE, A4_FREQ, SEMITONE, MIN_NOTE, MAX_NOTE } from './constants.js';

let decoded = null, reversed = null, origFreq = A4_FREQ, sampleType = 'one-shot', noteRate = new Map();

const reverseBuffer = (ctx, buf) => {
  if (!ctx || !buf) return null;
  const rev = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch), r = rev.getChannelData(ch);
    for (let i = 0, l = buf.length; i < l; i++) r[i] = d[l - 1 - i];
  }
  return rev;
};

export async function loadAndPrepareBuffers(ctx, base64Audio) {
  if (!ctx) return showError('AudioContext not available.'), false;
  try {
    decoded = await ctx.decodeAudioData(base64ToArrayBuffer(base64Audio));
    reversed = reverseBuffer(ctx, decoded);
    const freq = parseFloat(document.getElementById('audio-meta-frequency')?.textContent);
    origFreq = Number.isNaN(freq) || freq <= 0 ? A4_FREQ : freq;
    const typeText = (document.getElementById('audio-meta-sample-type') || document.getElementById('audio-meta-loop'))?.textContent?.trim().toLowerCase();
    sampleType = (typeText === 'loop' || typeText === 'yes') ? 'loop' : 'one-shot';
    noteRate.clear();
    for (let n = MIN_NOTE; n <= MAX_NOTE; n++) noteRate.set(n, (A4_FREQ * (SEMITONE ** (n - A4_NOTE))) / origFreq);
    return true;
  } catch (e) {
    showError(`Failed to decode/prepare audio: ${e.message}`); decoded = reversed = null; return false;
  }
}
export const selectCurrentBuffer = rev => (rev ? reversed : decoded) || showError(`Cannot play: ${rev ? 'Reversed' : 'Original'} buffer unavailable.`);
export const getDecodedBuffer = () => decoded;
export const getReversedBuffer = () => reversed;
export const getSampleType = () => sampleType;
export const getOriginalSampleFrequency = () => origFreq;
export const getBasePlaybackRateForMidiNote = n => noteRate.get(n);
export const clearBuffers = () => { decoded = reversed = null; noteRate.clear(); sampleType = 'one-shot'; origFreq = A4_FREQ; };
