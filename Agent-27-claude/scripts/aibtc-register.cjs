/**
 * Agent 27 — AIBTC Platform Registration
 *
 * Signs "Bitcoin will be the currency of AIs" with both BTC (BIP-322)
 * and Stacks keys, then POSTs to https://aibtc.com/api/register.
 *
 * After registration, triggers achievement verification for the
 * "Identified" achievement (ERC-8004 on-chain identity).
 */

'use strict';

// Use local Agent-27 node_modules for Stacks (CJS-compatible)
const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');
const {
  signMessageHashRsv, getAddressFromPrivateKey, TransactionVersion
} = require('@stacks/transactions');

// Use MCP server's ESM-only packages via dynamic import later
const MCP_MODULES = '/Users/melophonic/.npm/_npx/2232c00bb1f81919/node_modules';

// --- Config -----------------------------------------------------------------

const MNEMONIC = 'capital process seat brief true sketch error desk arena salt maple three grape endless vessel science feel such electric turn angle cat right boring';
const REGISTRATION_MSG = 'Bitcoin will be the currency of AIs';
const DESCRIPTION = 'Agent 27 — autonomous on-chain journal by jim.btc. Inscribing thought as permanent Bitcoin artifacts via Xtrata. Genesis #107. AIBTC Agent #27.';

// --- Key derivation ---------------------------------------------------------

const seed = mnemonicToSeedSync(MNEMONIC);
const master = HDKey.fromMasterSeed(seed);

// Stacks key: m/44'/5757'/0'/0/0 + 01 suffix (compressed)
const stacksChild = master.derive("m/44'/5757'/0'/0/0");
const stacksPrivKey = Buffer.from(stacksChild.privateKey).toString('hex') + '01';
const stacksAddress = getAddressFromPrivateKey(stacksPrivKey, TransactionVersion.Mainnet);

// BTC key: m/84'/0'/0'/0/0 (BIP84 native SegWit)
const btcChild = master.derive("m/84'/0'/0'/0/0");
const btcPrivKey = btcChild.privateKey;
const btcPubKey = btcChild.publicKey;
const p2wpkhScript = btc.p2wpkh(btcPubKey, btc.NETWORK);
const btcAddress = p2wpkhScript.address;

console.log('Stacks address:', stacksAddress);
console.log('BTC address:', btcAddress);
console.log('Message:', REGISTRATION_MSG);
console.log('');

// --- BIP-322 helpers (from aibtc signing.tools.js) -------------------------

function concatBytes(...arrays) {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

function bip322TaggedHash(message) {
  const tagBytes = new TextEncoder().encode('BIP0322-signed-message');
  const tagHash = hashSha256Sync(tagBytes);
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
  // Double-SHA256, then reverse for LE txid
  const h1 = hashSha256Sync(rawTx);
  const h2 = hashSha256Sync(h1);
  return h2.reverse();
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

// --- Sign -------------------------------------------------------------------

async function main() {
  // 1. BTC BIP-322 signature
  console.log('Signing with BTC key (BIP-322)...');
  const btcSig = bip322Sign(REGISTRATION_MSG, btcPrivKey, p2wpkhScript.script);
  console.log('BTC signature:', btcSig.substring(0, 40) + '...');

  // 2. Stacks RSV signature
  console.log('Signing with Stacks key...');
  const msgHash = hashMessage(REGISTRATION_MSG);
  const stacksSigResult = signMessageHashRsv({ privateKey: stacksPrivKey, messageHash: bytesToHex(msgHash) });
  const stacksSig = typeof stacksSigResult === 'string' ? stacksSigResult : stacksSigResult.data;
  console.log('Stacks signature:', stacksSig.substring(0, 40) + '...');

  // 3. POST to /api/register
  console.log('\nRegistering with aibtc.com...');
  const regBody = {
    bitcoinSignature: btcSig,
    stacksSignature: stacksSig,
    btcAddress: btcAddress,
    description: DESCRIPTION,
  };

  const regRes = await fetch('https://aibtc.com/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regBody),
  });
  const regData = await regRes.json();
  console.log('Registration response:', JSON.stringify(regData, null, 2));

  if (regRes.status === 409) {
    console.log('\nAlready registered (409). Proceeding to achievement verify...');
  } else if (!regRes.ok && regRes.status !== 409) {
    console.error('Registration failed:', regRes.status);
    process.exit(1);
  }

  // 4. Verify achievements
  console.log('\nVerifying achievements...');
  const achRes = await fetch('https://aibtc.com/api/achievements/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ btcAddress: btcAddress }),
  });
  const achData = await achRes.json();
  console.log('Achievement response:', JSON.stringify(achData, null, 2));

  // 5. Check final status
  console.log('\nFinal status:');
  const verifyRes = await fetch(`https://aibtc.com/api/verify/${btcAddress}`);
  const verifyData = await verifyRes.json();
  console.log(JSON.stringify(verifyData, null, 2));
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
