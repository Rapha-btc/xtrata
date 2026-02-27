// dashboard/state.js
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'cycle-state.json');

const DEFAULT_STATE = {
  runningPhase: null,      // e.g., 'pulse-1', 'inscribe'
  completedPhases: {},     // { '2026-02-27:pulse-1': '2026-02-27T08:05:12Z' }
  missedPhases: {},        // { '2026-02-27:pulse-1': true }
  lastInscription: null,   // { date, tokenId, txid, stxCost }
  chainData: {},
  errors: [],
  lastStartedAt: new Date().toISOString()
};

let state;

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    console.log('Loaded state from cycle-state.json');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No state file found, creating with default state.');
      state = { ...DEFAULT_STATE };
    } else {
      console.error('Error reading state file, using default state:', err);
      state = { ...DEFAULT_STATE };
    }
    saveState();
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('FATAL: Could not write to state file:', err);
  }
}

function getState() { 
  return { ...state }; 
}

function updateState(patch) {
  Object.assign(state, patch);
  saveState();
  return { ...state };
}

function addError(err) {
  state.errors.unshift({ timestamp: new Date().toISOString(), message: err.message || String(err) });
  if (state.errors.length > 20) {
    state.errors.pop();
  }
  saveState();
}

// Initial load
loadState();

module.exports = {
  getState,
  updateState,
  addError
};
