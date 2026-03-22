import { runPatch } from '../shared/patch_runtime.js';

function setSmokeState(state, detail = '') {
  const root = document.documentElement;
  root.dataset.bvstSamplerSmoke = state;
  if (detail) root.dataset.bvstSamplerSmokeDetail = String(detail).replace(/\s+/g, ' ').trim().slice(0, 240);
}

function setSamplerDataset(key, value) {
  const root = document.documentElement;
  if (!root || !root.dataset) return;
  if (value === undefined || value === null || value === '') delete root.dataset[key];
  else root.dataset[key] = String(value);
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function encodeBase64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, Math.min(bytes.length, index + chunk));
    out += String.fromCharCode(...slice);
  }
  return btoa(out);
}

function createSineWavDataUri({
  sampleRate = 22050,
  durationSeconds = 0.35,
  frequency = 220,
  amplitude = 0.5
} = {}) {
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataBytes = frameCount * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < frameCount; index += 1) {
    const t = index / sampleRate;
    const sample = Math.sin(t * frequency * Math.PI * 2) * amplitude;
    view.setInt16(44 + (index * 2), Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  return `data:audio/wav;base64,${encodeBase64(bytes)}`;
}

function waitForMessage(type, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    function onMessage(event) {
      if (!event || !event.data || event.data.type !== type) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(event.data);
    }

    window.addEventListener('message', onMessage);
  });
}

function waitForElement(selector, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const match = document.querySelector(selector);
      if (!match) return;
      clearTimeout(timer);
      observer.disconnect();
      resolve(match);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

const patch = {
  schema: 'bvst.patch/v1',
  meta: {
    name: 'SamplerSmoke',
    description: 'Deterministic sampler harness used by browser smoke tests.'
  },
  config: {
    name: 'UniversalEngine',
    visualizer: 'off',
    keyboard: false,
    sampler: {
      enabled: true,
      sourcePolicy: 'standalone-dev',
      allowFileDrop: true,
      allowDataUrls: true,
      maxSampleBytes: 262144,
      maxSampleSeconds: 2,
      defaults: {
        playSpeed: 1,
        loopStart: 0.05,
        loopEnd: 0.95,
        loopEnabled: true,
        reverse: false,
        grainPos: 0.25,
        grainSize: 0.1
      }
    },
    modules: [
      {
        name: 'Sampler',
        cols: 2,
        controls: [
          { id: 'speed', param: 18, type: 'slider', min: 0.25, max: 2, val: 1, label: 'Speed' },
          { id: 'loop_start', param: 19, type: 'slider', min: 0, max: 1, val: 0.05, label: 'Loop Start' },
          { id: 'loop_end', param: 20, type: 'slider', min: 0, max: 1, val: 0.95, label: 'Loop End' },
          { id: 'loop_enable', param: 21, type: 'switch', min: 0, max: 1, val: 1, label: 'Loop' },
          { id: 'pos', param: 30, type: 'slider', min: 0, max: 1, val: 0.25, label: 'Position' },
          { id: 'spread', param: 31, type: 'slider', min: 0, max: 1, val: 0.1, label: 'Spread' },
          { id: 'reverse', param: 32, type: 'switch', min: 0, max: 1, val: 0, label: 'Reverse' },
          { id: 'master', param: 29, type: 'slider', min: 0, max: 1, val: 0.5, label: 'Master' }
        ]
      }
    ],
    presets: {
      Init: {
        speed: 1,
        loop_start: 0.05,
        loop_end: 0.95,
        loop_enable: 1,
        pos: 0.25,
        spread: 0.1,
        reverse: 0,
        master: 0.5
      }
    }
  }
};

const manifest = {
  name: 'UniversalEngine',
  version: '1.0.0',
  type: 'Instrument',
  description: 'Standalone sampler smoke harness routed to the shared UniversalSynth engine.',
  components: {
    audio_engine: '../shared/bvst_unified_bg.wasm',
    ui_html: 'sampler-smoke.html'
  },
  io: {
    inputs: 0,
    outputs: 2
  }
};

window.addEventListener('message', (event) => {
  if (!event || !event.data) return;
  if (event.data.type === 'ERROR') {
    setSmokeState('error', event.data.error || 'Unknown runtime error');
  } else if (event.data.type === 'STATUS') {
    setSmokeState('status', event.data.msg || '');
    if (typeof event.data.msg === 'string' && event.data.msg.includes('Sample Loaded')) {
      setSamplerDataset('bvstSamplerEngineLoaded', '1');
    }
  }
});

async function boot() {
  setSmokeState('booting');
  setSamplerDataset('bvstSamplerEngineLoaded', '0');
  await runPatch({
    containerId: 'app-container',
    patch,
    manifest,
    manifestUrl: './sampler-smoke.manifest.virtual.json',
    standalone: true
  });

  setSmokeState('patch-mounted');
  await waitForMessage('BVST_READY');
  setSmokeState('ready');

  const input = await waitForElement('.bvst-url-input');
  const loadButton = await waitForElement('.bvst-load-btn');
  input.value = createSineWavDataUri();
  input.dispatchEvent(new Event('change', { bubbles: true }));
  loadButton.click();
  setSmokeState('sample-requested');
}

boot().catch((err) => {
  console.error(err);
  setSmokeState('error', err && err.message ? err.message : String(err));
});
