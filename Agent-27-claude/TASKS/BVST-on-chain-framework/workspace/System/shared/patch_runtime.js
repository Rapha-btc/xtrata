function normalizePatchDocument(doc) {
    if (!doc || typeof doc !== 'object') {
        throw new Error('Patch must be an object.');
    }
    if (doc.config && typeof doc.config === 'object') {
        return doc.config;
    }
    return doc;
}

function cacheBustParam() {
    try {
        const t = new URL(import.meta.url).searchParams.get('t');
        return t && t.trim() ? t.trim() : '';
    } catch (_) {
        return '';
    }
}

function getQueryParam(key) {
    try {
        return new URLSearchParams(window.location.search).get(key);
    } catch (_) {
        return null;
    }
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeConfig(base, override) {
    const left = isPlainObject(base) ? base : {};
    const right = isPlainObject(override) ? override : {};
    const out = { ...left };

    for (const [key, value] of Object.entries(right)) {
        if (Array.isArray(value)) {
            out[key] = value.slice();
        } else if (isPlainObject(value) && isPlainObject(out[key])) {
            out[key] = deepMergeConfig(out[key], value);
        } else if (isPlainObject(value)) {
            out[key] = deepMergeConfig({}, value);
        } else {
            out[key] = value;
        }
    }

    return out;
}

function inferRuntimeProfile(options = {}) {
    const explicit =
        (options && typeof options.profile === 'string' && options.profile.trim())
            ? options.profile.trim()
            : (getQueryParam('profile') || '').trim();
    if (explicit) return explicit;

    const standaloneParam = (getQueryParam('standalone') || '').toString().trim().toLowerCase();
    const standalone =
        (options && (options.standalone === true || options.standalone === 1)) ||
        standaloneParam === '1' ||
        standaloneParam === 'true' ||
        standaloneParam === 'yes' ||
        window.parent === window;
    return standalone ? 'standalone' : 'host';
}

function applyRuntimeProfile(config, options = {}) {
    const profileName = inferRuntimeProfile(options);
    const base = isPlainObject(config) ? { ...config } : {};
    const profiles = isPlainObject(base.profiles) ? base.profiles : null;
    delete base.profiles;

    let merged = base;
    if (profiles && isPlainObject(profiles[profileName])) {
        merged = deepMergeConfig(merged, profiles[profileName]);
    }

    if (
        profileName === 'standalone' &&
        typeof merged.defaultPreset !== 'string' &&
        typeof merged.standaloneDefaultPreset === 'string' &&
        merged.standaloneDefaultPreset.trim()
    ) {
        merged.defaultPreset = merged.standaloneDefaultPreset.trim();
    }

    merged.runtimeProfile = profileName;
    return merged;
}

let _bvstSingleton = null;
async function getBVST() {
    if (_bvstSingleton) return _bvstSingleton;
    const t = cacheBustParam();
    const mod = await import(`./plugin_core.js${t ? `?t=${encodeURIComponent(t)}` : ''}`);
    _bvstSingleton = mod.BVST;
    return _bvstSingleton;
}

export async function runPatch(options = {}) {
    const containerId = options.containerId || 'app-container';
    const patchUrl = options.patchUrl || './patch.json';
    const manifestUrl = options.manifestUrl || './manifest.json';
    const overrides = options.overrides && typeof options.overrides === 'object' ? options.overrides : {};

    let patchDoc;
    if (options.patch && typeof options.patch === 'object') {
        patchDoc = options.patch;
    } else {
        const res = await fetch(patchUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load patch: ${patchUrl} (${res.status})`);
        patchDoc = await res.json();
    }

    const config = applyRuntimeProfile(normalizePatchDocument(patchDoc), options);
    let manifest = null;
    if (options.manifest && typeof options.manifest === 'object') {
        manifest = options.manifest;
    } else {
        try {
            const manifestRes = await fetch(manifestUrl, { cache: 'no-store' });
            if (manifestRes.ok) manifest = await manifestRes.json();
        } catch (_) {}
    }

    const BVST = await getBVST();
    const finalConfig = deepMergeConfig(config, {
        ...overrides,
        containerId,
        manifest,
        manifestUrl
    });

    BVST.init(finalConfig);
}
