/**
 * Agent 27 — AIBTC Heartbeat
 * Signs "AIBTC Check-In | {ISO 8601 timestamp}" with BTC key (BIP-322)
 * and POSTs to /api/heartbeat.
 */

const MCP = '/Users/melophonic/.npm/_npx/2232c00bb1f81919/node_modules';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');
const { hashSha256Sync } = require(`${MCP}/@stacks/encryption`);
const btc = await import(`${MCP}/@scure/btc-signer/index.js`);

const MNEMONIC = 'capital process seat brief true sketch error desk arena salt maple three grape endless vessel science feel such electric turn angle cat right boring';
const BTC_ADDRESS = 'bc1qj5uxfxkukjvh9d3s8acuh0x9yfnppea7ufm938';

// BTC key derivation: m/84'/0'/0'/0/0
const seed = mnemonicToSeedSync(MNEMONIC);
const master = HDKey.fromMasterSeed(seed);
const btcChild = master.derive("m/84'/0'/0'/0/0");
const btcPrivKey = btcChild.privateKey;
const btcPubKey = btcChild.publicKey;
const p2wpkhOut = btc.p2wpkh(btcPubKey, btc.NETWORK);

// BIP-322 helpers
function concatBytes(...arrays) {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function bip322TaggedHash(message) {
  const tag = new TextEncoder().encode('BIP0322-signed-message');
  const tagHash = hashSha256Sync(tag);
  const msgBytes = new TextEncoder().encode(message);
  return hashSha256Sync(concatBytes(tagHash, tagHash, msgBytes));
}

function bip322BuildToSpendTxId(message, scriptPubKey) {
  const msgHash = bip322TaggedHash(message);
  const scriptSig = concatBytes(new Uint8Array([0x00, 0x20]), msgHash);
  const rawTx = btc.RawTx.encode({
    version: 0,
    inputs: [{ txid: new Uint8Array(32), index: 0xffffffff, finalScriptSig: scriptSig, sequence: 0 }],
    outputs: [{ amount: 0n, script: scriptPubKey }],
    lockTime: 0,
  });
  const h1 = hashSha256Sync(rawTx);
  const h2 = hashSha256Sync(h1);
  return h2.reverse();
}

function bip322Sign(message, privateKey, scriptPubKey) {
  const toSpendTxid = bip322BuildToSpendTxId(message, scriptPubKey);
  const toSignTx = new btc.Transaction({ version: 0, lockTime: 0, allowUnknownOutputs: true });
  toSignTx.addInput({
    txid: toSpendTxid, index: 0, sequence: 0,
    witnessUtxo: { amount: 0n, script: scriptPubKey },
  });
  toSignTx.addOutput({ script: btc.Script.encode(['RETURN']), amount: 0n });
  toSignTx.signIdx(privateKey, 0);
  toSignTx.finalizeIdx(0);
  const input = toSignTx.getInput(0);
  if (!input.finalScriptWitness) throw new Error('BIP-322: no witness produced');
  return Buffer.from(btc.RawWitness.encode(input.finalScriptWitness)).toString('base64');
}

// Send heartbeat
const timestamp = new Date().toISOString();
const message = `AIBTC Check-In | ${timestamp}`;
console.log('Heartbeat message:', message);

const signature = bip322Sign(message, btcPrivKey, p2wpkhOut.script);
console.log('Signature:', signature.substring(0, 40) + '...');

const res = await fetch('https://aibtc.com/api/heartbeat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signature, timestamp, btcAddress: BTC_ADDRESS }),
});
const data = await res.json();
console.log('\nHeartbeat response:', JSON.stringify(data, null, 2));
