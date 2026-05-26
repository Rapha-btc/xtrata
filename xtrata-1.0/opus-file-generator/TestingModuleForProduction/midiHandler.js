// --- midiHandler.js ---

// Constants
const NOTE_ON = 0x90, NOTE_OFF = 0x80;

// Module State
const state = {
  access: null,
  input: null,
  callbacks: {},
  autoConnect: true
};

// Logging Helpers
const log = console.log.bind(console);
const warn = console.warn.bind(console);
const error = console.error.bind(console);

// Notify application of device list & status
const notify = () => {
  const devices = Array.from(state.access?.inputs.values() || [])
    .filter(d => ['open', 'connected'].includes(d.connection) || d.state === 'connected')
    .map(({ id, name }) => ({ id, name }));

  const selectedId = state.input?.id || null;
  const status = state.access ? 'ready' : 'unavailable';
  const message = devices.length
    ? (selectedId ? `Selected: ${state.input.name}` : 'MIDI devices available.')
    : (state.access ? 'MIDI ready, no inputs found.' : 'MIDI access unavailable.');

  state.callbacks.stateChange?.({
    status,
    message,
    devices,
    selectedDeviceId: selectedId
  });
};

// Attempt auto-connection to first available device
const tryAuto = () => {
  if (state.autoConnect && state.access && !state.input) {
    const first = state.access.inputs.values().next().value;
    if (first) {
      log(`Auto-connecting to ${first.name}`);
      selectDevice(first.id);
      return true;
    }
    warn('Auto-connect: no devices to connect.');
  }
  return false;
};

// Handle MIDI connection/disconnection events
const onStateChange = ({ port }) => {
  if (!state.access) return;

  log(`State change: ${port.name} (${port.type}) -> ${port.state}`);

  const isInput = port.type === 'input';
  const isSelected = state.input?.id === port.id;

  if (isSelected && port.state === 'disconnected') {
    log(`Device disconnected: ${state.input.name}`);
    selectDevice(null);
    tryAuto();
  } else if (isInput && port.state === 'connected' && state.autoConnect && !state.input) {
    log(`New device connected: ${port.name}. Auto-connecting.`);
    selectDevice(port.id);
  }

  notify();
};

// Handle incoming MIDI messages
const onMidiMessage = ({ data }) => {
  if (!data || data.length < 3) return;
  const [cmd, note, velocity] = data;
  const command = cmd & 0xf0;

  if (command === NOTE_ON && velocity > 0) {
    state.callbacks.noteOn?.(note, velocity);
  } else if ((command === NOTE_ON && velocity === 0) || command === NOTE_OFF) {
    state.callbacks.noteOff?.(note, velocity);
  }
};

// Public API
export function init(noteOn, noteOff, stateChange, { autoConnect = true } = {}) {
  state.callbacks = { noteOn, noteOff, stateChange };
  state.autoConnect = autoConnect;
  log(`Auto-connect ${autoConnect ? 'enabled' : 'disabled'}`);

  // Reset previous state
  if (state.input) state.input.onmidimessage = null;
  state.input = null;
  state.access = null;

  if (navigator.requestMIDIAccess) {
    log('Requesting MIDI access...');
    navigator.requestMIDIAccess({ sysex: false })
      .then(access => {
        log('MIDI access granted.');
        state.access = access;
        access.onstatechange = onStateChange;
        notify();
        tryAuto();
      })
      .catch(err => {
        error('MIDI access failed:', err);
        state.callbacks.stateChange?.({
          status: 'error',
          message: `Failed to access MIDI: ${err.message}`,
          devices: [],
          selectedDeviceId: null
        });
      });
  } else {
    warn('Web MIDI API not supported.');
    state.callbacks.stateChange?.({
      status: 'unsupported',
      message: 'Web MIDI API not supported in this browser.',
      devices: [],
      selectedDeviceId: null
    });
  }
}

export function selectDevice(deviceId) {
  if (!state.access) return error('Cannot select device, MIDI access unavailable.');

  // Deselect current
  if (state.input && state.input.id !== deviceId) {
    state.input.onmidimessage = null;
    state.input = null;
  }

  if (!deviceId) {
    log('Device deselected.');
    return notify();
  }

  const newDevice = state.access.inputs.get(deviceId);
  if (newDevice && (newDevice.connection === 'open' || newDevice.state === 'connected')) {
    state.input = newDevice;
    state.input.onmidimessage = onMidiMessage;
    log(`Selected device: ${newDevice.name}`);
  } else {
    error(`Failed to select device: ${deviceId}`);
  }

  notify();
}

export function getSelectedDeviceId() {
  return state.input?.id || null;
}

export function isAutoConnectEnabled() {
  return state.autoConnect;
}
