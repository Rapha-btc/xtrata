// audio-processing/timingManager.js
const INTERVAL = 25, LOOKAHEAD = 0.1, DELAY = 0.05;
let ctx, tempo = 120, mult = 1, looping = false, schedId, schedCb, sessionStart = 0, subBeat = 0;

const subBeatDur = () => (tempo <= 0 || mult <= 0) ? Infinity : (60 / tempo) / mult;
const scheduler = () => {
  if (!looping || !ctx || !schedCb) return;
  const now = ctx.currentTime, until = now + LOOKAHEAD, d = subBeatDur();
  if (d === Infinity) return stop(true);
  while (1) {
    const t = sessionStart + subBeat * d;
    if (t < now - 0.001) { subBeat++; continue; }
    if (t < until) { schedCb(t); subBeat++; } else break;
  }
  schedId = setTimeout(scheduler, INTERVAL);
};
const start = cb => {
  if (looping || !ctx || typeof cb !== 'function') return false;
  schedCb = cb; looping = true;
  if (sessionStart === 0) { sessionStart = ctx.currentTime + DELAY; subBeat = 0; }
  else { const d = subBeatDur(), e = Math.max(0, ctx.currentTime - sessionStart); subBeat = (d > 0 && d !== Infinity) ? Math.ceil(e / d) : 0; }
  scheduler(); return true;
};
const stop = (reset = true) => { clearTimeout(schedId); schedId = null; looping = false; if (reset) sessionStart = subBeat = 0; };

export const timingManager = {
  init: (_ctx, t) => { if (!(_ctx instanceof AudioContext) && !(_ctx instanceof OfflineAudioContext)) throw Error('Invalid AudioContext'); ctx = _ctx; tempo = +t > 0 ? +t : 78; mult = 1; stop(true); },
  startLoop: start,
  stopLoop: () => { stop(true); schedCb = null; },
  setTempo: bpm => { bpm = +bpm; if (bpm > 0 && tempo !== bpm) { tempo = bpm; if (looping) { const cb = schedCb; stop(false); start(cb); } } },
  setScheduleMultiplier: m => { m = parseInt(m, 10); if (m >= 1 && mult !== m) { mult = m; if (looping) { const cb = schedCb; stop(false); start(cb); } } },
  getLoopingState: () => looping,
  getCurrentTempo: () => tempo,
  getCurrentScheduleMultiplier: () => mult,
  getSessionInitialStartTime: () => sessionStart,
};
