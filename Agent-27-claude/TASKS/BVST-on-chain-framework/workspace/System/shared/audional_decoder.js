// System/shared/audional_decoder.js
// Fetch + decode historical Audional/Ordinal audio inscriptions.
// Supports:
// - Direct audio bytes (audio/*, video/*, application/octet-stream)
// - JSON wrappers containing base64 audio (e.g. { audioData: "data:audio/wav;base64,..." })
// - HTML wrappers containing base64 audio in <source src="data:audio/...;base64,..."> (standard + OB1 + fallbacks)

export function canonicalizeOrdinalContentUrl(raw) {
    const input = String(raw || '').trim();
    if (!input) return '';
    const isId = (s) => /^[0-9a-f]{64}i\d+$/i.test(s);
    try {
        const u = new URL(input, window.location.href);
        const seg = u.pathname.split('/').filter(Boolean).pop() || '';
        if (isId(seg)) {
            u.pathname = `/content/${seg}`;
            u.search = '';
            u.hash = '';
            return u.toString();
        }
        return input;
    } catch (_) {
        const m = input.match(/([0-9a-f]{64}i\d+)$/i);
        if (m) return `/content/${m[1]}`;
        return input;
    }
}

function stripDataUriPrefix(s) {
    const str = String(s || '');
    const comma = str.indexOf(',');
    return comma >= 0 ? str.slice(comma + 1) : str;
}

function base64ToUint8Array(base64) {
    const clean = stripDataUriPrefix(base64).replace(/\s+/g, '');
    if (!clean) return new Uint8Array(0);

    // Estimate output length.
    const len = clean.length;
    const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    const outLen = Math.max(0, Math.floor((len * 3) / 4) - pad);
    const out = new Uint8Array(outLen);

    // Chunked atob to avoid enormous intermediate strings.
    let chunk = 1 << 20; // 1,048,576 chars
    chunk -= chunk % 4;
    let outOff = 0;

    for (let i = 0; i < len; i += chunk) {
        const part = clean.slice(i, Math.min(len, i + chunk));
        const bin = window.atob(part);
        for (let j = 0; j < bin.length; j++) {
            out[outOff++] = bin.charCodeAt(j) & 0xff;
        }
    }
    return outOff === out.length ? out : out.subarray(0, outOff);
}

function parseDataAudioUri(src) {
    const s = String(src || '').trim();
    if (!s) return null;
    const m = s.match(/^data:(audio\/[^;,]+)(?:;charset=[^;,]+)?;base64,/i);
    const mime = m ? m[1] : '';
    return { mime, bytes: base64ToUint8Array(s).buffer };
}

function looksLikeHtml(text) {
    const t = String(text || '').slice(0, 4096).toLowerCase();
    return t.includes('<html') || t.includes('<audio') || t.includes('<source') || t.includes('<body') || t.includes('<head');
}

function extractFilenameFromHtml(htmlText) {
    const txt = String(htmlText || '');
    const sampleName = txt.match(/id\s*=\s*["']sampleName["'][^>]*>\s*([^<]{1,200})\s*</i);
    if (sampleName) return sampleName[1].trim();
    const title = txt.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    if (title) return title[1].trim();
    return '';
}

function extractBase64AudioDataUriFromHtml(htmlText) {
    const txt = String(htmlText || '');

    // Fast path: find a data:audio occurrence; prefer the last one (often avoids scanning huge image base64).
    const idx = txt.lastIndexOf('data:audio/');
    const scanFrom = idx >= 0 ? idx : txt.indexOf('data:audio/');
    if (scanFrom >= 0) {
        // Walk forward to the next quote/end delimiter.
        const tail = txt.slice(scanFrom);
        const endQuote = tail.search(/["'\s>]/);
        const candidate = endQuote > 0 ? tail.slice(0, endQuote) : tail;
        if (/^data:audio\//i.test(candidate)) return candidate;
    }

    // Quoted src attributes (most common).
    const quoted = txt.match(/<source[^>]*\bsrc\s*=\s*["'](data:audio\/[^"']+)["']/i)
        || txt.match(/<audio[^>]*\bsrc\s*=\s*["'](data:audio\/[^"']+)["']/i)
        || txt.match(/\bsrc\s*=\s*["'](data:audio\/[^"']+)["']/i);
    if (quoted) return quoted[1];

    // Unquoted src=data:audio/...
    const unquoted = txt.match(/\bsrc\s*=\s*(data:audio\/[^\s>]+)/i);
    if (unquoted) return unquoted[1];

    // OB1 sometimes wraps a <source> in a custom tag; still catches via generic data:audio scan above.
    return '';
}

function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch (_) {
        return null;
    }
}

function findAudioStringInJson(obj, depth = 0) {
    if (!obj || depth > 4) return '';
    if (typeof obj === 'string') {
        const s = obj.trim();
        if (s.startsWith('data:audio/')) return s;
        // Sometimes the value is just base64 without prefix (very large).
        if (/^[A-Za-z0-9+/\s]+={0,2}$/.test(s) && s.length > 1024) return s;
        return '';
    }
    if (Array.isArray(obj)) {
        for (const it of obj) {
            const found = findAudioStringInJson(it, depth + 1);
            if (found) return found;
        }
        return '';
    }
    if (typeof obj === 'object') {
        const preferredKeys = ['audioData', 'audio', 'data', 'content', 'base64', 'sample', 'payload'];
        for (const k of preferredKeys) {
            if (k in obj) {
                const found = findAudioStringInJson(obj[k], depth + 1);
                if (found) return found;
            }
        }
        for (const k of Object.keys(obj)) {
            const found = findAudioStringInJson(obj[k], depth + 1);
            if (found) return found;
        }
    }
    return '';
}

function guessResponseKind(contentType, text) {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('application/json')) return 'json';
    if (ct.includes('text/html')) return 'html';
    if (ct.includes('audio/') || ct.includes('video/') || ct.includes('application/octet-stream')) return 'binary';
    if (looksLikeHtml(text)) return 'html';
    const trimmed = String(text || '').trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    if (trimmed.startsWith('data:audio/')) return 'datauri';
    return 'unknown';
}

export async function fetchAudionalAudioBytes(url, options = {}) {
    const originalUrl = String(url || '');
    const canonicalUrl = canonicalizeOrdinalContentUrl(originalUrl);
    const fetchUrl = canonicalUrl || originalUrl;
    if (!fetchUrl) throw new Error('Missing URL');

    if (options.debug) console.log('[AudionalDecoder] fetch', { originalUrl, canonicalUrl: fetchUrl });
    const res = await fetch(fetchUrl, { cache: 'no-store', ...(options.fetchOptions || {}) });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    const ct = res.headers.get('content-type') || '';
    const ctLower = ct.toLowerCase();

    // Direct audio/video binaries.
    if (ctLower.includes('audio/') || ctLower.includes('video/') || ctLower.includes('application/octet-stream')) {
        const bytes = await res.arrayBuffer();
        const filename = (fetchUrl.split('/').pop() || 'audio').split('?')[0].split('#')[0];
        if (options.debug) console.log('[AudionalDecoder] direct', { ct, bytes: bytes.byteLength });
        return { audioBytes: bytes, filename, detectedType: 'direct', mime: ct, canonicalUrl: fetchUrl, originalUrl };
    }

    // Otherwise treat as text and attempt to extract base64 audio.
    const text = await res.text();
    const kind = guessResponseKind(ct, text);
    if (options.debug) console.log('[AudionalDecoder] wrapper', { ct, kind, chars: text.length });

    if (kind === 'json') {
        const json = tryParseJson(text);
        if (!json) throw new Error('Invalid JSON wrapper');
        const filename = String(json.filename || json.name || '').trim() || (fetchUrl.split('/').pop() || 'json-audio');
        const audioStr = (typeof json.audioData === 'string' && json.audioData.trim()) ? json.audioData : findAudioStringInJson(json);
        if (!audioStr) throw new Error('No audio data found in JSON');
        if (audioStr.trim().startsWith('data:audio/')) {
            const parsed = parseDataAudioUri(audioStr);
            if (options.debug) console.log('[AudionalDecoder] json_datauri', { mime: parsed.mime, bytes: parsed.bytes.byteLength });
            return { audioBytes: parsed.bytes, filename, detectedType: 'json_datauri', mime: parsed.mime || 'audio/*', canonicalUrl: fetchUrl, originalUrl };
        }
        const bytes = base64ToUint8Array(audioStr).buffer;
        if (options.debug) console.log('[AudionalDecoder] json_base64', { bytes: bytes.byteLength });
        return { audioBytes: bytes, filename, detectedType: 'json_base64', mime: 'audio/*', canonicalUrl: fetchUrl, originalUrl };
    }

    if (kind === 'html' || kind === 'unknown') {
        const filename = extractFilenameFromHtml(text) || (fetchUrl.split('/').pop() || 'html-audio');
        const dataUri = extractBase64AudioDataUriFromHtml(text);
        if (!dataUri) throw new Error('No audio data URI found in HTML');
        const parsed = parseDataAudioUri(dataUri);
        if (options.debug) console.log('[AudionalDecoder] html_datauri', { mime: parsed.mime, bytes: parsed.bytes.byteLength });
        return { audioBytes: parsed.bytes, filename, detectedType: ctLower.includes('text/html') ? 'html' : 'sniffed_html', mime: parsed.mime || 'audio/*', canonicalUrl: fetchUrl, originalUrl };
    }

    if (kind === 'datauri') {
        const parsed = parseDataAudioUri(text.trim());
        const filename = (fetchUrl.split('/').pop() || 'datauri-audio');
        return { audioBytes: parsed.bytes, filename, detectedType: 'datauri', mime: parsed.mime || 'audio/*', canonicalUrl: fetchUrl, originalUrl };
    }

    throw new Error(`Unsupported content type: ${ct || '(none)'}`);
}
