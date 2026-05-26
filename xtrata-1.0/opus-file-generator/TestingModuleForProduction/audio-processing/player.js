// audio-processing/player.js
import { showError, triggerAnimation } from '../uiUpdater.js';

export function playBufferSource(ctx, dest, buf, time, rate, loop = false, onEnded = null, offset = 0) {
  if (!ctx || !dest || !buf || rate <= 0) return rate <= 0 && showError('Playback rate must be positive.'), null;
  try {
    const src = ctx.createBufferSource();
    Object.assign(src, { buffer: buf, loop });
    src.playbackRate.value = rate;
    src.connect(dest);
    src.start(time, offset);
    if (onEnded) src.onended = onEnded;
    triggerAnimation();
    return src;
  } catch (e) { showError('Failed to play audio source.'); return null; }
}
