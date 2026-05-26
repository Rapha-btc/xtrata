// --- START OF FILE utils.js ---

/**
 * Converts a Base64 string (potentially with data URI prefix) to an ArrayBuffer.
 * @param {string} base64 The Base64 string.
 * @returns {ArrayBuffer} The corresponding ArrayBuffer.
 * @throws {Error} If the Base64 string is invalid.
 */
export function base64ToArrayBuffer(base64) {
    try {
        const base64Clean = base64.split(',')[1] ?? base64;
        const binaryString = window.atob(base64Clean);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (e) {
        console.error("Error decoding Base64 string:", e);
        throw new Error("Failed to decode Base64 data.");
    }
}

/**
 * Clamps a value between a minimum and maximum.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum allowed value.
 * @param {number} max The maximum allowed value.
 * @returns {number} The clamped value.
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

/**
 * Checks if the event target is an input element where shortcuts should be ignored.
 * @param {EventTarget} target - The event target element.
 * @returns {boolean} True if the target is an input type, false otherwise.
 */
export function _isInputFocused(target) {
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}

/**
 * Creates a DOM element with specified tag, options, and children.
 * @param {string} tag - The HTML tag name.
 * @param {object} [options={}] - Attributes and properties (id, className, textContent, etc.).
 * @param {(HTMLElement|string)[]} [children=[]] - Child elements or text nodes to append.
 * @returns {HTMLElement} The created element.
 */
export function createElement(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    Object.keys(options).forEach(key => {
        if (key === 'className') {
            element.className = options[key];
        } else if (key === 'textContent') {
            element.textContent = options[key];
        } else if (key === 'disabled' && options[key]) {
            element.disabled = true;
        } else if (key === 'attributes') {
             Object.entries(options[key]).forEach(([attrName, attrValue]) => {
                element.setAttribute(attrName, attrValue);
             });
        } else if (typeof options[key] === 'boolean') {
             if (options[key]) {
                 element.setAttribute(key, '');
             }
        } else {
            element.setAttribute(key, options[key]);
        }
    });
    children.forEach(child => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof HTMLElement) {
            element.appendChild(child);
        }
    });
    return element;
}

export function addListener(element, eventName, handler, elementNameForWarn) {
    if (element) {
        element.addEventListener(eventName, handler);
    } else {
        const optionalElements = ['infoToggleBtn', 'referencePanel'];
        if (elementNameForWarn && !optionalElements.includes(elementNameForWarn)) { // Check elementNameForWarn exists
            console.warn(`[setupEventListeners] Element "${elementNameForWarn}" not found. Listener not attached.`);
        }
    }
}

// --- Pitch Slider Mapping Logic ---
export const PITCH_SLIDER_CONFIG = {
    // s_val for P = -1000% (coarse range: P [-1000, -260])
    MIN_S: -425,
    // s_val for P = -250% (end of negative fine range: P [-250, -1])
    NEG_FINE_END_S: -350,
    // s_val for P = -1% (start of negative fine range, near zero)
    NEG_FINE_START_S: -101, // (STOP_S - 1)

    // s_val for P = 0%
    STOP_S: -100,

    // s_val for P = 1% (start of positive fine range P [1,99] relative to STOP_S/NEUTRAL_S)
    // This is effectively NEUTRAL_S - 99 if P=100% is NEUTRAL_S=0.
    // This range is P [1,99] -> s_val [-99, -1]

    // s_val for P = 100% (Neutral point)
    NEUTRAL_S: 0,

    // s_val for P = 250% (end of positive fine range: P [100, 250])
    POS_FINE_END_S: 150, // (NEUTRAL_S + 150)

    // s_val for P = 1000% (coarse range: P [260, 1000])
    MAX_S: 225, // (POS_FINE_END_S + 75)

    STEP: 1,       // s_val step is always 1 for the slider hardware
};

/**
 * Converts slider value (s_val) to playback percentage (P).
 * @param {number} s_val - The raw value from the pitch slider.
 * @returns {number} Playback percentage P (-1000 to 1000).
 */
export function sValToP(s_val) {
    const {
        MIN_S, NEG_FINE_END_S, NEG_FINE_START_S,
        STOP_S,
        NEUTRAL_S, POS_FINE_END_S, MAX_S
    } = PITCH_SLIDER_CONFIG;

    let P;
    // Clamp s_val to ensure it's within the defined range for calculations
    const clamped_s_val = clamp(s_val, MIN_S, MAX_S);

    // --- Positive P values (and P=100%) ---
    if (clamped_s_val >= NEUTRAL_S) { // s_val in [0, 225]
        if (clamped_s_val <= POS_FINE_END_S) { // s_val in [0, 150] -> P in [100, 250] (1% steps)
            // P = 100% at s_val = 0 (NEUTRAL_S)
            // P = 250% at s_val = 150 (POS_FINE_END_S)
            P = 100 + (clamped_s_val - NEUTRAL_S);
        } else { // s_val in (150, 225] -> P in (250, 1000] (10% steps)
            // P starts at 260% for s_val = 151
            // P = 1000% at s_val = 225 (MAX_S)
            P = 250 + (clamped_s_val - POS_FINE_END_S) * 10;
        }
    }
    // --- Negative P values (and P=0, P=[1,99]) ---
    else { // s_val in [-425, -1]
        if (clamped_s_val >= (NEUTRAL_S - 99)) { // s_val in [-99, -1] -> P in [1, 99] (1% steps)
            // P = 1% at s_val = -99
            // P = 99% at s_val = -1
            P = 100 + clamped_s_val; // e.g. s_val = -99 -> P = 1; s_val = -1 -> P = 99
        } else if (clamped_s_val === STOP_S) { // s_val = -100
            P = 0;
        } else if (clamped_s_val >= NEG_FINE_END_S) { // s_val in [-350, -101] -> P in [-250, -1] (1% steps)
            // P = -1% at s_val = -101 (NEG_FINE_START_S)
            // P = -250% at s_val = -350 (NEG_FINE_END_S)
            P = clamped_s_val - STOP_S; // e.g. s_val = -101 -> P = -1; s_val = -350 -> P = -250
        } else { // s_val in [-425, -351] (MIN_S to just before NEG_FINE_END_S) -> P in [-1000, -260] (10% steps)
            // P starts at -260% for s_val = -351
            // P = -1000% at s_val = -425 (MIN_S)
            P = -250 + (clamped_s_val - NEG_FINE_END_S) * 10;
        }
    }
    return Math.round(P); // Ensure P is an integer percentage
}

/**
 * Converts playback percentage (P) to slider value (s_val).
 * @param {number} P - Playback percentage P (-1000 to 1000).
 * @returns {number} The raw value for the pitch slider (s_val).
 */
export function pToSVal(P) {
    const {
        MIN_S, NEG_FINE_END_S, NEG_FINE_START_S,
        STOP_S,
        NEUTRAL_S, POS_FINE_END_S, MAX_S
    } = PITCH_SLIDER_CONFIG;

    let s_val;
    // Clamp and round P to ensure it's an integer percentage within bounds
    const clamped_P = clamp(Math.round(P), -1000, 1000);

    if (clamped_P >= 100) { // P in [100, 1000]
        if (clamped_P <= 250) { // P in [100, 250] -> s_val in [0, 150] (NEUTRAL_S to POS_FINE_END_S)
            s_val = NEUTRAL_S + (clamped_P - 100);
        } else { // P in (250, 1000], effectively [251, 1000] -> s_val in (150, 225]
            // Snap P to the nearest 10% step for s_val calculation in coarse range
            s_val = POS_FINE_END_S + Math.round((clamped_P - 250) / 10.0);
        }
    } else if (clamped_P > 0) { // P in (0, 100), i.e. [1, 99] -> s_val in [-99, -1]
        s_val = (NEUTRAL_S - 100) + clamped_P; // e.g. P=1 -> s_val = -99; P=99 -> s_val = -1
    } else if (clamped_P === 0) { // P = 0
        s_val = STOP_S; // -100
    } else { // P < 0, i.e. [-1000, -1]
        if (clamped_P >= -250) { // P in [-250, -1] -> s_val in [-350, -101] (NEG_FINE_END_S to NEG_FINE_START_S)
            s_val = STOP_S + clamped_P; // e.g. P=-1 -> s_val = -101; P=-250 -> s_val = -350
        } else { // P in [-1000, -251) -> s_val in [-425, -351)
            // Snap P to the nearest 10% step for s_val calculation in coarse range
            s_val = NEG_FINE_END_S + Math.round((clamped_P - (-250)) / 10.0);
        }
    }
    // Clamp to actual slider hardware limits just in case, then round s_val (already integer due to logic).
    return clamp(Math.round(s_val), MIN_S, MAX_S);
}

// --- END OF FILE utils.js ---