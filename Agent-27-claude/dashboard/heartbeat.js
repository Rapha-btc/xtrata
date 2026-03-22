// dashboard/heartbeat.js — AIBTC heartbeat poller
// Signs "AIBTC Check-In | {timestamp}" with BTC key (BIP-322) every 5 minutes
// and POSTs to https://aibtc.com/api/heartbeat

const crypto = require('crypto');

const BTC_ADDRESS = 'bc1qj5uxfxkukjvh9d3s8acuh0x9yfnppea7ufm938';
const MNEMONIC = 'capital process seat brief true sketch error desk arena salt maple three grape endless vessel science feel such electric turn angle cat right boring';
const HEARTBEAT_URL = 'https://aibtc.com/api/heartbeat';
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

let poller = null;
let broadcastFn = null;
let addLogFn = null;
let btcSigner = null; // lazy-loaded ESM module
let btcPrivKey = null;
let scriptPubKey = null;

const heartbeatState = {
  lastHeartbeat: null,
  lastStatus: null,     // 'ok' | 'error'
  lastError: null,
  consecutiveSuccesses: 0,
  consecutiveFailures: 0,
  totalBeats: 0
};

// --- Crypto helpers (use Node crypto instead of @stacks/encryption) ---

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest();
}

function concatBytes(...arrays) {
  return Buffer.concat(arrays.map(a => Buffer.from(a)));
}

function bip322TaggedHash(message) {
  const tag = Buffer.from('BIP0322-signed-message', 'utf8');
  const tagHash = sha256(tag);
  const msgBytes = Buffer.from(message, 'utf8');
  return sha256(concatBytes(tagHash, tagHash, msgBytes));
}

// --- Lazy init: load ESM crypto libs on first use ---

async function ensureKeys() {
  if (btcPrivKey && scriptPubKey && btcSigner) return;

  // These packages are available via the MCP npx cache or root node_modules
  const MCP = '/Users/melophonic/.npm/_npx/2232c00bb1f81919/node_modules';
  const { mnemonicToSeedSync } = require('@scure/bip39');
  const { HDKey } = require('@scure/bip32');
  btcSigner = await import(`${MCP}/@scure/btc-signer/index.js`);

  const seed = mnemonicToSeedSync(MNEMONIC);
  const master = HDKey.fromMasterSeed(seed);
  const btcChild = master.derive("m/84'/0'/0'/0/0");
  btcPrivKey = btcChild.privateKey;
  const btcPubKey = btcChild.publicKey;
  const p2wpkhOut = btcSigner.p2wpkh(btcPubKey, btcSigner.NETWORK);
  scriptPubKey = p2wpkhOut.script;
}

function bip322BuildToSpendTxId(message) {
  const msgHash = bip322TaggedHash(message);
  const scriptSigBytes = concatBytes(new Uint8Array([0x00, 0x20]), msgHash);
  const rawTx = btcSigner.RawTx.encode({
    version: 0,
    inputs: [{ txid: new Uint8Array(32), index: 0xffffffff, finalScriptSig: scriptSigBytes, sequence: 0 }],
    outputs: [{ amount: 0n, script: scriptPubKey }],
    lockTime: 0,
  });
  const h1 = sha256(rawTx);
  const h2 = sha256(h1);
  return Buffer.from(h2).reverse();
}

function bip322Sign(message) {
  const toSpendTxid = bip322BuildToSpendTxId(message);
  const toSignTx = new btcSigner.Transaction({ version: 0, lockTime: 0, allowUnknownOutputs: true });
  toSignTx.addInput({
    txid: toSpendTxid, index: 0, sequence: 0,
    witnessUtxo: { amount: 0n, script: scriptPubKey },
  });
  toSignTx.addOutput({ script: btcSigner.Script.encode(['RETURN']), amount: 0n });
  toSignTx.signIdx(btcPrivKey, 0);
  toSignTx.finalizeIdx(0);
  const input = toSignTx.getInput(0);
  if (!input.finalScriptWitness) throw new Error('BIP-322: no witness produced');
  return Buffer.from(btcSigner.RawWitness.encode(input.finalScriptWitness)).toString('base64');
}

// --- Heartbeat execution ---

async function sendHeartbeat() {
  await ensureKeys();

  const timestamp = new Date().toISOString();
  const message = `AIBTC Check-In | ${timestamp}`;
  const signature = bip322Sign(message);

  const res = await fetch(HEARTBEAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, timestamp, btcAddress: BTC_ADDRESS }),
  });

  const data = await res.json();
  if (res.status === 429) {
    // 429 means we already checked in recently — this is success, not failure
    return { timestamp, data, rateLimited: true };
  }
  if (!res.ok) {
    throw new Error(`Heartbeat API ${res.status}: ${JSON.stringify(data)}`);
  }
  return { timestamp, data };
}

async function heartbeatTick() {
  try {
    const result = await sendHeartbeat();
    heartbeatState.lastHeartbeat = result.timestamp;
    heartbeatState.lastStatus = 'ok';
    heartbeatState.lastError = null;
    heartbeatState.consecutiveFailures = 0;

    if (result.rateLimited) {
      // Already checked in — count as success but don't increment totalBeats
      heartbeatState.consecutiveSuccesses++;
    } else {
      heartbeatState.consecutiveSuccesses++;
      heartbeatState.totalBeats++;
      // Only log occasionally to avoid noise (every 12 beats = 1 hour, or on first success)
      if (heartbeatState.totalBeats === 1 || heartbeatState.totalBeats % 12 === 0) {
        if (addLogFn) addLogFn('start', `Heartbeat OK (beat #${heartbeatState.totalBeats})`);
      }
    }
  } catch (err) {
    heartbeatState.lastStatus = 'error';
    heartbeatState.lastError = err.message;
    heartbeatState.consecutiveSuccesses = 0;
    heartbeatState.consecutiveFailures++;
    heartbeatState.lastHeartbeat = new Date().toISOString();

    if (addLogFn) addLogFn('error', `Heartbeat failed: ${err.message}`);
    console.error('[heartbeat] Error:', err.message);
  }

  if (broadcastFn) {
    broadcastFn({ event: 'heartbeat', data: getHeartbeatStatus() });
  }
}

// --- Public API ---

function getHeartbeatStatus() {
  const now = Date.now();
  const lastMs = heartbeatState.lastHeartbeat ? new Date(heartbeatState.lastHeartbeat).getTime() : 0;
  const ageSec = lastMs ? Math.round((now - lastMs) / 1000) : null;

  return {
    ...heartbeatState,
    online: heartbeatState.lastStatus === 'ok' && ageSec !== null && ageSec < 600,
    ageSeconds: ageSec
  };
}

function startHeartbeatPoller(broadcast, addLog) {
  broadcastFn = broadcast;
  addLogFn = addLog;

  // Fire immediately, then every 5 minutes
  heartbeatTick();
  poller = setInterval(heartbeatTick, POLL_INTERVAL);
  console.log('Heartbeat poller started (5-min interval)');
}

function stopHeartbeatPoller() {
  if (poller) {
    clearInterval(poller);
    poller = null;
    console.log('Heartbeat poller stopped');
  }
}

/** Trigger an immediate heartbeat (e.g. from POST /api/heartbeat/trigger) */
async function triggerHeartbeat() {
  await heartbeatTick();
  return getHeartbeatStatus();
}

module.exports = {
  startHeartbeatPoller,
  stopHeartbeatPoller,
  getHeartbeatStatus,
  triggerHeartbeat
};
