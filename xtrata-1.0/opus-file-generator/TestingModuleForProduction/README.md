Here is a fully updated, comprehensive, and well-structured `README.md` that accurately reflects the current state of your program based on the provided modules. It separates **User Instructions** and **Developer Reference** sections for clarity:

---

# Audional Art Player

## Overview

Audional Art Player is a web-based interactive audio-visual application that combines a static visual ("Audional Art") with dynamic, programmable audio playback. It features precise audio scheduling, tempo and pitch control, looping, reverse playback, and MIDI input support. The entire media (image and audio) can be embedded as Base64 strings for a self-contained experience.

The UI is dynamically constructed using JavaScript and provides extensive keyboard shortcuts and MIDI controls for real-time audio manipulation.

---

## User Instructions

### Getting Started

1. Open the application in a modern web browser that supports:

   * Web Audio API
   * ES6 Modules
   * Web MIDI API (for MIDI support)
2. If running locally, serve the files via a local web server (e.g., `http-server`, `python -m http.server`, or `npx serve -l 3000`) due to ES6 module and security requirements.

---

### Interface Components

* **Main Image:** Central visual element representing the artwork.

  * Click the image to toggle audio loop playback on/off.
  * Visual feedback animation briefly plays when audio triggers.

* **Controls Panel (Left Column):**

  * **Play Once:** Play the audio sample a single time.
  * **Play Loop:** Toggle looping playback.
  * **Reverse:** Toggle reverse playback direction.
  * **Sliders:**

    * **Volume:** Master output volume (0% to 150%).
    * **Tempo:** Playback tempo in BPM (1 to 400).
    * **Pitch:** Playback pitch (1% to 1000%).
    * **Multiplier:** Subdivides beat scheduling multiplier (1× to 8×) for faster repeated triggering of one-shot samples.
  * **MIDI In:** Dropdown to select MIDI input device.
  * **MIDI Status:** Displays current MIDI connection status.

* **Reference Panel (Right Column):**

  * Shows all keyboard shortcuts and usage tips.
  * Toggle visibility via ℹ️ button in the controls panel.

---

### Audio Interaction

* Clicking the image toggles loop playback.
* "Play Once" button triggers single playback.
* Looping re-triggers one-shot samples at the defined tempo and multiplier.
* Looping native audio loops if the sample is a loop type.
* Reverse toggles normal or reversed playback.

---

### Keyboard Shortcuts

| Action                     | Shortcut                               |
| -------------------------- | -------------------------------------- |
| Play sample once           | Spacebar                               |
| Toggle reverse playback    | R                                      |
| Toggle controls/info panel | I                                      |
| Increase volume            | Arrow Up                               |
| Decrease volume            | Arrow Down                             |
| Toggle mute/unmute         | M                                      |
| Increase tempo (+1 BPM)    | Shift + = / +                          |
| Decrease tempo (-1 BPM)    | Shift + - / \_                         |
| Increase tempo (+10 BPM)   | Ctrl/Cmd + Shift + = / +               |
| Decrease tempo (-10 BPM)   | Ctrl/Cmd + Shift + - / \_              |
| Increase pitch slightly    | Shift + ] / }                          |
| Decrease pitch slightly    | Shift + \[ / {                         |
| Increase pitch semitone    | Ctrl/Cmd + Shift + ] / }               |
| Decrease pitch semitone    | Ctrl/Cmd + Shift + \[ / {              |
| Double pitch (×2)          | =                                      |
| Halve pitch (×0.5)         | -                                      |
| Reset pitch (×1.0)         | 0                                      |
| Set schedule multiplier    | Number keys 1 to 8 (varies multiplier) |

*Shortcuts are disabled if an input, textarea, or select is focused.*

---

### MIDI Usage

* Connect a MIDI controller.
* The app auto-connects to the first available MIDI device or select manually.
* Playing notes triggers the audio sample with pitch adjusted per MIDI note.
* MIDI status and device selection are shown in the controls panel.

---

### Responsive Design

* The layout adapts fluidly to various screen sizes.
* Controls and reference panels can be toggled for a streamlined view.

---

## Developer Reference

### Project Structure

* `abbreviatedIndex.html`: Main HTML, embeds base64 media and loads modules.
* `style.css`: Styling including layout, responsiveness, and animations.
* `main.js`: Application bootstrap, UI element references, event listeners, app initialization, and orchestration.
* `layout.js`: Builds the dynamic UI layout and reference panel, creates control sliders and buttons.
* `audioProcessor.js`:

  * Decodes Base64 audio.
  * Manages playback (single, loop, reverse).
  * Handles tempo, pitch, volume, and scheduling via an internal `timingManager`.
  * Supports "one-shot" and native "loop" sample types.
* `uiUpdater.js`: Updates UI state including buttons, sliders, error messages, and image source.
* `keyboardShortcuts.js`: Implements comprehensive keyboard controls for all audio and playback features.
* `midiHandler.js`: Manages MIDI access, device selection, message handling, and auto-connection.
* `utils.js`: Utility functions including Base64 decoding, clamping, DOM element creation, event listener helpers, and input focus checks.
* `imageAnimation.js`: Adds a CSS animation to the main image on audio playback trigger.

---

### Audio Processing Details

* Uses Web Audio API with `AudioContext` and `GainNode`.
* Maintains original and reversed audio buffers for toggling playback direction.
* Scheduling for looping one-shot samples uses precise timing via `timingManager` with adjustable tempo and schedule multiplier.
* Playback pitch adjusted via playbackRate on buffer sources.
* Looping native audio uses `AudioBufferSourceNode.loop` property.

---

### UI and Event Flow

* On load, `main.js` builds the layout via `layout.js` and initializes UI via `uiUpdater.js`.
* Base64 audio and image data are loaded and decoded.
* Event listeners bind to UI controls and keyboard shortcuts.
* MIDI input initializes and listens for note messages to trigger playback.
* Error handling shows user feedback in the UI error panel.
* Controls enable/disable according to media loading and errors.

---

### Notes for Developers

* The image animation is triggered on every audio play event.
* Keyboard shortcuts respect input focus to avoid interfering with form controls.
* Audio sample type detection relies on a DOM element (`#audio-meta-sample-type`), falling back to "one-shot" if missing.
* The multiplier slider affects how frequently one-shot samples retrigger within a tempo beat.
* To modify embedded media, replace base64 strings in HTML or configure appropriate JS globals before initialization.
* MIDI device management supports auto-connect but allows manual selection and status feedback.

---

### Development Tips

* Use modern ES6+ features for modularity and clarity.
* Separate UI rendering (`layout.js`) from state management (`uiUpdater.js`) and logic (`audioProcessor.js`).
* Testing audio timing accuracy and latency is critical for a smooth looped experience.
* Ensure proper error handling to inform users of media load or playback issues.
* To extend, consider adding support for additional audio formats or visual effects.

---

### Example Initialization Snippet (from `main.js`)

```js
import * as audio from './audioProcessor.js';
import * as ui from './uiUpdater.js';
import * as midiHandler from './midiHandler.js';
import * as keyboardShortcuts from './keyboardShortcuts.js';
import { buildLayout, initReferencePanel } from './layout.js';
import { clamp, addListener } from './utils.js';

async function initializeApp() {
  buildLayout(document.getElementById('app'));
  ui.init();

  // Load embedded base64 media and initialize audio
  const audioBase64 = window.audionalBase64_Opus || null;
  if (!audioBase64 || !(await audio.init(audioBase64, 78, 1))) {
    ui.showError('Audio initialization failed.');
    ui.disableControls();
    return;
  }

  // Setup UI controls and event listeners
  // ...
  midiHandler.init(noteOnHandler, noteOffHandler, midiStateChangeHandler);
  keyboardShortcuts.init({ tempoSlider, pitchSlider, volumeSlider, multiplierSlider });
  
  // Final UI updates
  ui.updateTempoDisplay(78);
  ui.updatePitchDisplay(1);
  ui.updateVolumeDisplay(1);
  ui.enableControls();
}
```

---


