// --- START OF FILE uiUpdater.js ---

let controlsContainer = null,
  errorMessageDiv = null,
  playOnceBtn = null,
  loopToggleBtn = null,
  reverseToggleBtn = null,
  // Sliders
  tempoSlider = null, pitchSlider = null, volumeSlider = null, multiplierSlider = null,
  // Text Spans for values
  tempoValueSpan = null, pitchValueSpan = null, volumeValueSpan = null, multiplierValueSpan = null,
  // Number Inputs for manual entry
  tempoInput = null, pitchInput = null, volumeInput = null, multiplierInput = null, // These are declared
  mainImage = null,
  controlElementsList = []; // Initialize as empty

const $ = id => document.getElementById(id);

export function init() {
  console.log("UI Updater: Initializing element references...");
  controlsContainer = $('controls-container');
  errorMessageDiv = $('error-message');
  playOnceBtn = $('play-once-btn');
  loopToggleBtn = $('loop-toggle-btn');
  reverseToggleBtn = $('reverse-toggle-btn');

  tempoSlider = $('tempo-slider');
  tempoValueSpan = $('tempo-value');
  tempoInput = $('tempo-input'); // Assign before use

  pitchSlider = $('pitch-slider');
  pitchValueSpan = $('pitch-value');
  pitchInput = $('pitch-input'); // Assign before use

  volumeSlider = $('volume-slider');
  volumeValueSpan = $('volume-value');
  volumeInput = $('volume-input'); // Assign before use

  multiplierSlider = $('multiplier-slider');
  multiplierValueSpan = $('multiplier-value');
  multiplierInput = $('multiplier-input'); // Assign before use

  mainImage = $('main-image');

  if (!mainImage) {
    console.error("UI Updater CRITICAL: mainImage element not found in init(). Shake animation will fail.");
  }

  // Now that all individual elements are assigned (or null if not found),
  // we can safely populate controlElementsList.
  controlElementsList = [
    playOnceBtn, loopToggleBtn, reverseToggleBtn,
    tempoSlider, pitchSlider, volumeSlider, multiplierSlider,
    tempoInput, pitchInput, volumeInput, multiplierInput
  ].filter(Boolean); // filter(Boolean) will correctly remove any null/undefined elements

  // Warning checks after assignment
  if (!controlsContainer) console.warn("UI Updater: controlsContainer not found.");
  // Check individual components as before, but now they are definitely assigned (even if to null)
  if (!tempoValueSpan) console.warn("UI Updater: tempoValueSpan not found.");
  if (!tempoInput) console.warn("UI Updater: tempoInput not found."); // This check is now safe
  if (!pitchValueSpan) console.warn("UI Updater: pitchValueSpan not found.");
  if (!pitchInput) console.warn("UI Updater: pitchInput not found.");
  if (!volumeValueSpan) console.warn("UI Updater: volumeValueSpan not found.");
  if (!volumeInput) console.warn("UI Updater: volumeInput not found.");
  if (!multiplierValueSpan) console.warn("UI Updater: multiplierValueSpan not found.");
  if (!multiplierInput) console.warn("UI Updater: multiplierInput not found.");

  console.log(`UI Updater: Found ${controlElementsList.length} control elements. Main image for animation:`, mainImage);
}

export const setControlsContainer = el => {
  if (el instanceof HTMLElement) {
    controlsContainer = el;
    console.log("UI Updater: Controls container set via setControlsContainer.");
  } else {
    console.error("UI Updater: Invalid element passed to setControlsContainer.");
  }
};

// Revised updateValueDisplay to handle text span and number input
const updateValueDisplay = (textDisplaySpan, associatedNumberInput, valueToDisplay, formatForTextSpan = v => String(v), controlName = 'Value') => {
  if (textDisplaySpan) {
    textDisplaySpan.textContent = formatForTextSpan(valueToDisplay);
  } else {
    console.warn(`UI Updater: Missing text display span for ${controlName}.`);
  }
  if (associatedNumberInput) {
    associatedNumberInput.value = String(valueToDisplay);
  } else {
    // Don't warn here if it's intentionally missing for some controls in the future
    // console.warn(`UI Updater: Missing number input for ${controlName}.`);
  }
};

const updateToggleButton = (btn, isActive, label) => {
  if (!btn) return console.warn(`UI Updater: Missing button for "${label}"`);
  btn.textContent = `${label}: ${isActive ? 'On' : 'Off'}`;
  btn.classList.toggle('active', !!isActive);
};

const setControlsDisabledState = disabled => {
  (controlsContainer || $('controls-container'))?.classList.toggle('disabled', disabled);
  controlElementsList.forEach(el => { // controlElementsList is now safely populated
      if (el) el.disabled = disabled;
  });
};

export const updateTempoDisplay = bpm =>
  updateValueDisplay(tempoValueSpan, tempoInput, bpm, String, 'Tempo');

export const updatePitchDisplay = P =>
  updateValueDisplay(pitchValueSpan, pitchInput, P, String, 'Pitch');

export const updateVolumeDisplay = level => {
  const displayValue = Math.round(level * 100);
  updateValueDisplay(volumeValueSpan, volumeInput, displayValue, String, 'Volume');
};

export const updateScheduleMultiplierDisplay = m => {
  updateValueDisplay(multiplierValueSpan, multiplierInput, m, val => `x${val}`, 'Multiplier');
};

export const updateLoopButton = isLooping => updateToggleButton(loopToggleBtn, isLooping, 'Play Loop');
export const updateReverseButton = isReversed => updateToggleButton(reverseToggleBtn, isReversed, 'Reverse');

export const enableControls = () => setControlsDisabledState(false);
export const disableControls = () => setControlsDisabledState(true);

export const showError = msg => {
  const div = errorMessageDiv || $('error-message');
  if (div) {
    div.textContent = msg;
    div.style.display = msg ? 'block' : 'none';
  } else {
    console.error("UI Error (message div missing):", msg);
  }
};

export const clearError = () => {
  const div = errorMessageDiv || $('error-message');
  if (div) {
    div.textContent = '';
    div.style.display = 'none';
  }
};

export const setImageSource = src => {
  const img = mainImage || $('main-image'); // Fallback in case init hasn't run or mainImage was not found
  if (img) {
    img.src = src;
    img.style.visibility = src ? 'visible' : 'hidden'; // Hide if src is null/empty
  } else {
    console.error("UI Updater: mainImage not found (setImageSource).");
  }
};

const ANIMATION_CLASS = 'shake-all-directions-animation';
const ANIMATION_DURATION_MS = 150;

export function triggerAnimation() {
  const elToAnimate = mainImage || $('main-image'); // Fallback
  if (!elToAnimate) return;
  if (elToAnimate.classList.contains(ANIMATION_CLASS)) return;

  elToAnimate.classList.add(ANIMATION_CLASS);
  setTimeout(() => {
    if (elToAnimate && elToAnimate.isConnected) {
      elToAnimate.classList.remove(ANIMATION_CLASS);
    }
  }, ANIMATION_DURATION_MS);
}
// --- END OF FILE uiUpdater.js ---