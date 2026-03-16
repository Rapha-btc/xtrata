// dashboard/state.js — Simplified persistent state
// Only keeps data that should survive restarts: lastInscription, chainData, errors.
const fs = require('fs');
const path = require('path');
const { CYCLE_STATE_FILE, LEGACY_CYCLE_STATE_FILE } = require('./config');

const DEFAULT_STATE = {
  lastInscription: null,   // { date, tokenId, txid, stxCost }
  chainData: {},
  errors: [],
  pulsesSinceLastInscription: 0,
  phaseHistory: [],        // last 10 runs: { phaseId, startedAt, completedAt, success, cost, error, duration }
  lastStartedAt: new Date().toISOString()
};

let state;

function ensureStateDir() {
  fs.mkdirSync(path.dirname(CYCLE_STATE_FILE), { recursive: true });
}

function readStateFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function loadState() {
  ensureStateDir();
  try {
    let loaded;
    let source = CYCLE_STATE_FILE;

    try {
      loaded = readStateFile(CYCLE_STATE_FILE);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      loaded = readStateFile(LEGACY_CYCLE_STATE_FILE);
      source = LEGACY_CYCLE_STATE_FILE;
    }

    // Only keep the fields we care about — drop legacy scheduler fields
    state = {
      lastInscription: loaded.lastInscription || null,
      chainData: loaded.chainData || {},
      errors: Array.isArray(loaded.errors) ? loaded.errors : [],
      pulsesSinceLastInscription: loaded.pulsesSinceLastInscription || 0,
      phaseHistory: Array.isArray(loaded.phaseHistory) ? loaded.phaseHistory : [],
      lastStartedAt: new Date().toISOString()
    };
    console.log(`Loaded state from ${path.relative(process.cwd(), source)}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No cycle state file found, creating with default state.');
    } else {
      console.error('Error reading state file, using default state:', err);
    }
    state = { ...DEFAULT_STATE };
  }
  saveState();
}

function saveState() {
  try {
    ensureStateDir();
    fs.writeFileSync(CYCLE_STATE_FILE, JSON.stringify(state, null, 2));
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
