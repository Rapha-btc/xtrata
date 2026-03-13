/**
 * Agent 27 — AIBTC Platform Registration (ESM)
 *
 * Signs "Bitcoin will be the currency of AIs" with both BTC (BIP-322)
 * and Stacks keys, then POSTs to https://aibtc.com/api/register.
 * Then triggers achievement verification for "Identified" (ERC-8004).
 */

const MCP = '/Users/melophonic/.npm/_npx/2232c00bb1f81919/node_modules';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// CJS-compatible from local node_modules
const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');
const { signMessageHashRsv, getAddressFromPrivateKey, TransactionVersion, createStacksPrivateKey } = require('@stacks/transactions');

// ESM-only from MCP server modules
const { hashMessage, hashSha256Sync } = await import(`${MCP}/@stacks/encryption/dist/index.js`).catch(() =>
  import(`${MCP}/@stacks/encryption`));
const { bytesToHex } = await import(`${MCP}/@stacks/common/dist/index.js`).catch(() =>
  import(`${MCP}/@stacks/common`));
const btc = await import(`${MCP}/@scure/btc-signer/index.js`);

// --- Config -----------------------------------------------------------------

const MNEMONIC = 'capital process seat brief true sketch error desk arena salt maple three grape endless vessel science feel such electric turn angle cat right boring';
const REGISTRATION_MSG = 'Bitcoin will be the currency of AIs';
const DESCRIPTION = 'Agent 27 — autonomous on-chain journal by jim.btc. Inscribing thought as permanent Bitcoin artifacts via Xtrata. Genesis #107. AIBTC Agent #27.';

// --- Key derivation ---------------------------------------------------------

const seed = mnemonicToSeedSync(MNEMONIC);
const master = HDKey.fromMasterSeed(seed);

// Stacks: m/44'/5757'/0'/0/0 + 01
const stacksChild = master.derive("m/44'/5757'/0'/0/0");
const stacksPrivKey = Buffer.from(stacksChild.privateKey).toString('hex') + '01';
const stacksAddress = getAddressFromPrivateKey(stacksPrivKey, TransactionVersion.Mainnet);

// BTC: m/84'/0'/0'/0/0 (BIP84 native SegWit P2WPKH)
const btcChild = master.derive("m/84'/0'/0'/0/0");
const btcPrivKey = btcChild.privateKey;
const btcPubKey = btcChild.publicKey;
const p2wpkhOut = btc.p2wpkh(btcPubKey, btc.NETWORK);
const btcAddress = p2wpkhOut.address;

console.log('Stacks address:', stacksAddress);
console.log('BTC address:   ', btcAddress);
console.log('Message:       ', REGISTRATION_MSG);
console.log('');

// --- BIP-322 implementation -------------------------------------------------

function concatBytes(...arrays) {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function doubleSha256(data) {
  return hashSha256Sync(hashSha256Sync(data));
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
  return doubleSha256(rawTx).reverse();
}

function bip322Sign(message, privateKey, scriptPubKey) {
  const toSpendTxid = bip322BuildToSpendTxId(message, scriptPubKey);
  const toSignTx = new btc.Transaction({ version: 0, lockTime: 0, allowUnknownOutputs: true });
  toSignTx.addInput({
    txid: toSpendTxid,
    index: 0,
    sequence: 0,
    witnessUtxo: { amount: 0n, script: scriptPubKey },
  });
  toSignTx.addOutput({ script: btc.Script.encode(['RETURN']), amount: 0n });
  toSignTx.signIdx(privateKey, 0);
  toSignTx.finalizeIdx(0);
  const input = toSignTx.getInput(0);
  if (!input.finalScriptWitness) throw new Error('BIP-322: no witness produced');
  return Buffer.from(btc.RawWitness.encode(input.finalScriptWitness)).toString('base64');
}

// --- Main -------------------------------------------------------------------

// BTC BIP-322 signature
console.log('Signing with BTC key (BIP-322)...');
const btcSig = bip322Sign(REGISTRATION_MSG, btcPrivKey, p2wpkhOut.script);
console.log('BTC sig:', btcSig.substring(0, 50) + '...');

// Stacks RSV signature
console.log('Signing with Stacks key...');
const msgHash = hashMessage(REGISTRATION_MSG);
const stacksPrivKeyObj = createStacksPrivateKey(stacksPrivKey);
const stacksSigResult = signMessageHashRsv({ privateKey: stacksPrivKeyObj, messageHash: bytesToHex(msgHash) });
const stacksSig = typeof stacksSigResult === 'string' ? stacksSigResult : stacksSigResult.data;
console.log('STX sig:', stacksSig.substring(0, 50) + '...');

// POST /api/register
console.log('\nRegistering with aibtc.com...');
const regRes = await fetch('https://aibtc.com/api/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    bitcoinSignature: btcSig,
    stacksSignature: stacksSig,
    btcAddress,
    description: DESCRIPTION,
  }),
});
const regData = await regRes.json();
console.log('Registration response:', JSON.stringify(regData, null, 2));

if (!regRes.ok && regRes.status !== 409) {
  console.error('Registration failed. Stopping.');
  process.exit(1);
}

// Trigger achievement verification
console.log('\nVerifying achievements...');
const achRes = await fetch('https://aibtc.com/api/achievements/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ btcAddress }),
});
const achData = await achRes.json();
console.log('Achievements:', JSON.stringify(achData, null, 2));

// Final status
console.log('\nFinal verify:');
const verifyRes = await fetch(`https://aibtc.com/api/verify/${btcAddress}`);
const verifyData = await verifyRes.json();
console.log(JSON.stringify(verifyData, null, 2));
