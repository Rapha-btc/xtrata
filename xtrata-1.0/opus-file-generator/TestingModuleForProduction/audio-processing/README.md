This `README.md` file is tailored for the **audio-processing** folder. 
It provides:

* An overview of the architecture and code philosophy
* API/usage documentation for each module
* Best practices for contributing and extending functionality
* Guidance for integrating new modules or features
* Advice for troubleshooting and common gotchas

---

````markdown
# Audio Processing Modules

This folder contains a modern, modular, and fully decoupled audio processing suite for web-based audio apps. The architecture is designed for **clarity, maintainability, and efficiency**, with minimal dependencies and a functional API surface suitable for advanced time/pitch manipulation and robust playback/looping.

---

## 📦 Overview

**Modules included:**
- `main.js` - The main entrypoint and public API. Coordinates state, playback, pitch, tempo, and cross-module communication.
- `audioContextManager.js` - Safe management of the singleton `AudioContext` and main output gain node.
- `bufferManager.js` - Decoding, reversing, and note-rate mapping of audio buffers, including robust state management and error handling.
- `player.js` - Stateless utility for scheduling and playing audio buffer sources with event hooks and loop/crossfade support.
- `timingManager.js` - Metronome, tempo, and scheduler for precise loop timing and event scheduling, abstracted from audio logic.
- `constants.js` - Shared constants for time, frequency, and smoothing parameters.
- (External: `utils.js`, `uiUpdater.js`) - Utility and UI feedback helpers, referenced but not defined in this folder.

---

## 🗺️ Architecture & Philosophy

- **Modular**: Each concern is isolated to its own file, with zero circular dependencies.
- **Stateless where possible**: Modules like `player.js` expose only pure functions.
- **DRY & KISS**: Repeated patterns (buffer selection, gain ramping, event cleanup) are factored out and used everywhere.
- **Defensive**: Every public function guards against invalid state, null references, and browser quirks.
- **Future-friendly**: All state flows and helpers are composable, making integration with new UI, MIDI, or Web Audio modules straightforward.

---

## 🚀 Quick Start

### 1. **Initializing and Playing Audio**

```js
import * as Audio from './audio-processing/main.js';

// On load: provide base64-encoded audio, initial tempo, and pitch slider value (optional)
await Audio.init(base64AudioString, 120, 0);

// Play audio one-shot
await Audio.playOnce();

// Start looped playback (if supported by the sample)
await Audio.startLoop();

// Change playback parameters
Audio.setGlobalPitch(new_s_val);
Audio.setVolume(0.5);
Audio.setTempo(110);
Audio.setScheduleMultiplier(2);

// Stop playback
Audio.stopLoop();
````

### 2. **Accessing State**

```js
Audio.getLoopingState();        // true if loop is active
Audio.getCurrentTempo();        // current BPM
Audio.getCurrentPitch();        // current (absolute) pitch rate
Audio.getCurrentPitchPercent(); // signed pitch as percentage (+/-100%)
Audio.getReverseState();        // true if reversed
Audio.getAudioContextState();   // 'running', 'suspended', etc.
```

### 3. **Sample-Rate & MIDI Note Utilities**

```js
// Get correct playback rate for MIDI note (given current global pitch)
Audio.getPlaybackRateForNote(midiNoteNumber);
```

---

## 🛠️ Code Structure and Patterns

* **State is tracked only in `main.js`**, which mediates between modules.
* **All context/AudioBuffer resources are singletons**. Re-initializing will clear previous buffers and safely close contexts.
* **Helpers** (gain creation, animation scheduling, source cleanup) are standardized across modules for consistency.
* **Defensive guards** ensure no audio operation is attempted unless all dependencies (context, buffer, gain) are ready.

---

## 🧩 Integrating New Audio Modules

**To add new features or processing:**

1. **Create a new module** (e.g., `myEffect.js`) with a focused purpose.
2. **Expose a clean API**—prefer pure functions or a single exported object.
3. **Integrate via `main.js`**:

   * Import your module in `main.js` (or wherever needed).
   * Use existing state/context via the exported AudioContext or gain node.
   * If you need to extend state, keep it flat and avoid circular references.

**Example:**

```js
// myEffect.js
export function applyEffect(ctx, buffer, ...params) { /* ... */ }
```

```js
// main.js
import { applyEffect } from './myEffect.js';
...
const effectedBuffer = applyEffect(AudioManager.getAudioContext(), BufferManager.getDecodedBuffer(), param1, param2);
```

---

## 🧑‍💻 Contributing & Updating

* **Follow code patterns**: Prefer concise, modular, and expressive code.
* **Keep the DRY principle**: If you see repeated patterns, abstract them!
* **Write defensive code**: Always null-check context, nodes, and buffers.
* **Document non-obvious intent**: Use short JSDoc or inline comments when a pattern isn’t self-evident.
* **Lint and format**: Use Prettier/eslint with default modern config to keep formatting consistent.

---

## 💡 Common Gotchas

* **AudioContext must be resumed** on some browsers before playback (handled, but check UI triggers if you see silence).
* **Always check buffer state** before attempting playback, especially after rapid init/stop sequences.
* **Base64 input** must be raw audio (e.g., WAV/PCM) for decoding—compression may require adjustment.
* **Buffer reversal** is re-generated each time a new sample is loaded.

---

## 🧭 Extension Points

* **Effects**: Add your effect chain module, expose an `applyEffect` API, and patch it into the playback pipeline.
* **Advanced scheduling**: Replace or extend `timingManager` for polyrhythmic, pattern, or step-sequencer applications.
* **UI Integration**: All modules are UI-agnostic, expecting callbacks (`showError`, `triggerAnimation`) for feedback/animation only.

---

## 📑 File Index

* `main.js` — entrypoint & app-level API/state
* `audioContextManager.js` — context/gain management
* `bufferManager.js` — buffer prep, reversal, note-rate map
* `player.js` — stateless source playback
* `timingManager.js` — precise, abstracted loop/event scheduler
* `constants.js` — time/frequency parameters

---

## 🛡️ License

