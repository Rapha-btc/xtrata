// audio-processing/audioContextManager.js
import { showError } from '../uiUpdater.js';

let ctx = null, gain = null;

export function setupAudioContext(vol = 1) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) { showError('AudioContext not supported.'); throw Error('AudioContext not supported.'); }
  if (ctx && ctx.state !== 'closed') ctx.close().catch(e => console.warn('Error closing AudioContext:', e));
  ctx = new AudioCtx();
  gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.connect(ctx.destination);
  return { audioContext: ctx, mainGainNode: gain };
}
export const getAudioContext = () => ctx;
export const getMainGainNode = () => gain;
export const getAudioContextState = () => ctx?.state || 'unavailable';
export const closeAudioContext = () => { if (ctx && ctx.state !== 'closed') ctx.close().catch(()=>{}); ctx = gain = null; };

export async function ensureAudioContextActive() {
  if (!ctx) return showError('Audio system not ready.'), false;
  if (ctx.state === 'suspended') try { await ctx.resume(); } catch (e) { showError('Could not resume audio.'); return false; }
  return true;
}
