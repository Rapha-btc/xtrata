import { runPatch } from '../../../System/shared/patch_runtime.js';

function getQueryParam(key) {
    try {
        return new URLSearchParams(window.location.search).get(key);
    } catch (_) {
        return null;
    }
}

function setDataset(key, value) {
    const root = document.documentElement;
    if (!root || !root.dataset) return;
    if (value === undefined || value === null || value === '') delete root.dataset[key];
    else root.dataset[key] = String(value).replace(/\s+/g, ' ').trim().slice(0, 240);
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

function waitForMessage(type, predicate = () => true, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            window.removeEventListener('message', onMessage);
            reject(new Error(`Timed out waiting for ${type}`));
        }, timeoutMs);

        function onMessage(event) {
            if (!event || !event.data || event.data.type !== type) return;
            if (!predicate(event.data)) return;
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

window.addEventListener('message', (event) => {
    if (!event || !event.data) return;
    if (event.data.type === 'STATUS' && typeof event.data.msg === 'string' && event.data.msg.includes('Sample Loaded')) {
        setDataset('bvstSamplerEngineLoaded', '1');
    } else if (event.data.type === 'ERROR') {
        setDataset('bvstSamplerLabError', event.data.error || 'Unknown runtime error');
    }
});

export async function bootSamplerLab({ t = '' } = {}) {
    setDataset('bvstSamplerWave', 'experimental');
    setDataset('bvstSamplerLab', '1');
    setDataset('bvstSamplerEngineLoaded', '0');

    await runPatch({
        patchUrl: `./patch.json${t ? `?t=${encodeURIComponent(t)}` : ''}`,
        manifestUrl: `./manifest.json${t ? `?t=${encodeURIComponent(t)}` : ''}`,
        containerId: 'app-container'
    });

    const autoSmoke = (getQueryParam('autoSmoke') || '').trim().toLowerCase();
    if (autoSmoke !== '1' && autoSmoke !== 'true' && autoSmoke !== 'yes') {
        return;
    }

    await waitForMessage('BVST_READY');
    setDataset('bvstSamplerLabReady', '1');
    const input = await waitForElement('.bvst-url-input');
    const loadButton = await waitForElement('.bvst-load-btn');
    input.value = createSineWavDataUri();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    loadButton.click();
    await waitForMessage('STATUS', (data) => typeof data.msg === 'string' && data.msg.includes('Sample Loaded'));
}
