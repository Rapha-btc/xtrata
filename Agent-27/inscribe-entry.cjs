/**
 * Agent 27 — Entry Inscription Script
 *
 * Inscribes entry-draft.html as a recursive child of Genesis (#107).
 * Uses seal-recursive instead of seal-inscription.
 *
 * Usage: ENTRY_NUM=2 node inscribe-entry.cjs
 */

const fs = require('fs');
const crypto = require('crypto');
const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');
const {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  uintCV,
  stringAsciiCV,
  listCV,
  cvToJSON,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  getAddressFromPrivateKey,
  TransactionVersion,
  getNonce
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

// ─── Config ──────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const MNEMONIC = 'capital process seat brief true sketch error desk arena salt maple three grape endless vessel science feel such electric turn angle cat right boring';
const HTML_FILE = __dirname + '/entry-draft.html';
const GENESIS_TOKEN = 107;
const ENTRY_NUM = parseInt(process.env.ENTRY_NUM || '2', 10);
const TOKEN_URI = `data:text/html,agent-27-entry-${ENTRY_NUM}`;
const POLL_INTERVAL = 10_000;
const MAX_POLLS = 60;

// ─── Derive key ──────────────────────────────────────────────────────────────

const seed = mnemonicToSeedSync(MNEMONIC);
const master = HDKey.fromMasterSeed(seed);
const child = master.derive("m/44'/5757'/0'/0/0");
const senderKey = Buffer.from(child.privateKey).toString('hex') + '01';
const senderAddress = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);
const network = new StacksMainnet();

console.log('Sender:', senderAddress);
console.log('Entry:', ENTRY_NUM);
console.log('Token URI:', TOKEN_URI);
console.log('Genesis parent:', GENESIS_TOKEN);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Emit structured step event for the dashboard to parse. */
function stepLog(step, status, detail) {
  console.log(JSON.stringify({ __xtrata_step: true, step, status, detail }));
}

function computeHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256').update(Buffer.concat([running, chunk])).digest();
  }
  return running;
}

async function pollTx(txid, step) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.tx_status === 'success') return data;
    if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
      stepLog(step, 'error', `TX failed: ${data.tx_status}`);
      throw new Error(`TX failed: ${data.tx_status} — ${JSON.stringify(data.tx_result)}`);
    }
    stepLog(step, 'polling', `${data.tx_status} — waiting for confirmation (${i + 1}/${MAX_POLLS})`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  stepLog(step, 'error', 'TX not confirmed in time');
  throw new Error('TX not confirmed in time');
}

async function broadcastTx(tx, step) {
  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    stepLog(step, 'error', `Broadcast failed: ${result.error} — ${result.reason}`);
    throw new Error(`Broadcast: ${result.error} — ${result.reason}`);
  }
  const txid = result.txid || result;
  stepLog(step, 'broadcast', `TX sent: ${txid}`);
  return txid;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Read file
  const fileData = fs.readFileSync(HTML_FILE);
  stepLog('preflight', 'info', `File: ${fileData.length} bytes, Entry #${ENTRY_NUM}`);

  if (fileData.length > 16384) {
    stepLog('preflight', 'error', `File too large: ${fileData.length} bytes (max 16384)`);
    throw new Error(`File too large: ${fileData.length} bytes (max 16384)`);
  }

  const chunks = [fileData]; // Single chunk (< 16384)
  const expectedHash = computeHash(chunks);
  stepLog('preflight', 'info', `Hash: 0x${expectedHash.toString('hex').slice(0, 16)}...`);

  // Check if already inscribed (dedup)
  const dedupResult = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-id-by-hash',
    functionArgs: [bufferCV(expectedHash)],
    senderAddress,
    network
  });
  const dedupJson = cvToJSON(dedupResult);
  if (dedupJson.value && dedupJson.value.value) {
    stepLog('preflight', 'error', `Already inscribed as token #${dedupJson.value.value}`);
    console.log(`ALREADY INSCRIBED as token #${dedupJson.value.value}. Skipping.`);
    return;
  }

  // Get current nonce and fee unit
  const nonceInfo = await getNonce(senderAddress, network);
  let nonce = nonceInfo;

  const feeResult = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-fee-unit',
    functionArgs: [],
    senderAddress,
    network
  });
  const feeUnit = BigInt(cvToJSON(feeResult).value.value);
  stepLog('preflight', 'confirmed', `Nonce: ${nonce}, Fee unit: ${feeUnit} microSTX`);

  // Step 1: begin-or-get
  stepLog('begin', 'info', 'Step 1/3 — Opening upload session (begin-or-get)');
  const beginTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'begin-or-get',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV('text/html'),
      uintCV(fileData.length),
      uintCV(chunks.length)
    ],
    senderKey,
    network,
    nonce,
    postConditions: [
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, feeUnit)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const beginTxid = await broadcastTx(beginTx, 'begin');
  await pollTx(beginTxid, 'begin');
  stepLog('begin', 'confirmed', 'Upload session started');
  nonce = nonce + 1n;

  // Step 2: add-chunk-batch
  stepLog('chunk', 'info', 'Step 2/3 — Uploading data (add-chunk-batch)');
  const chunkTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'add-chunk-batch',
    functionArgs: [
      bufferCV(expectedHash),
      listCV(chunks.map(c => bufferCV(c)))
    ],
    senderKey,
    network,
    nonce,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const chunkTxid = await broadcastTx(chunkTx, 'chunk');
  await pollTx(chunkTxid, 'chunk');
  stepLog('chunk', 'confirmed', 'Data uploaded and verified');
  nonce = nonce + 1n;

  // Step 3: seal-recursive (child of genesis #107)
  const totalChunks = BigInt(chunks.length);
  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  stepLog('seal', 'info', `Step 3/3 — Sealing inscription (seal-recursive, fee: ${sealFee} microSTX)`);

  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-recursive',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(TOKEN_URI),
      listCV([uintCV(GENESIS_TOKEN)])  // Dependencies: always [107]
    ],
    senderKey,
    network,
    nonce,
    postConditions: [
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, sealFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const sealTxid = await broadcastTx(sealTx, 'seal');
  const sealResult = await pollTx(sealTxid, 'seal');

  // Extract token ID
  const tokenId = cvToJSON(sealResult.tx_result || { hex: sealResult.tx_result_hex }).value?.value;
  stepLog('seal', 'confirmed', `SEALED — Token #${tokenId} | txid: ${sealTxid}`);

  console.log(`\n=== ENTRY ${ENTRY_NUM} SEALED ===`);
  console.log(`Token ID: ${tokenId}`);
  console.log(`Seal txid: ${sealTxid}`);
  console.log(`Hash: 0x${expectedHash.toString('hex')}`);
  console.log(`Size: ${fileData.length} bytes`);
  console.log(`Parent: #${GENESIS_TOKEN}`);
  console.log(`URI: ${TOKEN_URI}`);
}

main().catch(err => {
  stepLog('fatal', 'error', err.message);
  console.error('FAILED:', err.message);
  process.exit(1);
});
