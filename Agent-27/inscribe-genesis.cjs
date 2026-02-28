/**
 * Agent 27 Genesis Inscription Script
 *
 * 1. Abandons the broken upload session
 * 2. Begins a new upload with the correct hash
 * 3. Uploads the HTML chunk
 * 4. Seals as the genesis inscription (no recursive deps)
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
const HTML_FILE = __dirname + '/genesis-draft.html';
const TOKEN_URI = 'data:text/html,agent-27-genesis';
const POLL_INTERVAL = 10_000;
const MAX_POLLS = 60;
const OLD_HASH = '0xd8a5118831cfd935da11eadaed8e3d8e7cab819140e2b257e72eec7846750096';

// ─── Derive key ──────────────────────────────────────────────────────────────

const seed = mnemonicToSeedSync(MNEMONIC);
const master = HDKey.fromMasterSeed(seed);
const child = master.derive("m/44'/5757'/0'/0/0");
const senderKey = Buffer.from(child.privateKey).toString('hex') + '01';
const senderAddress = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);
const network = new StacksMainnet();

console.log('Sender:', senderAddress);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256').update(Buffer.concat([running, chunk])).digest();
  }
  return running;
}

async function pollTx(txid) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.tx_status === 'success') return data;
    if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
      throw new Error(`TX failed: ${data.tx_status} — ${JSON.stringify(data.tx_result)}`);
    }
    console.log(`  Polling ${txid.slice(0,12)}... (${data.tx_status})`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error('TX not confirmed in time');
}

async function broadcast(tx) {
  const result = await broadcastTransaction(tx, network);
  if (result.error) throw new Error(`Broadcast: ${result.error} — ${result.reason}`);
  const txid = result.txid || result;
  console.log(`  Broadcast: ${txid}`);
  return txid;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Read file
  const fileData = fs.readFileSync(HTML_FILE);
  console.log(`File: ${fileData.length} bytes`);

  const chunks = [fileData]; // Single chunk (< 16384)
  const expectedHash = computeHash(chunks);
  console.log(`Hash: 0x${expectedHash.toString('hex')}`);

  // Get current nonce and fee unit
  const nonceInfo = await getNonce(senderAddress, network);
  let nonce = nonceInfo;
  console.log(`Nonce: ${nonce}`);

  const feeResult = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-fee-unit',
    functionArgs: [],
    senderAddress,
    network
  });
  const feeUnit = BigInt(cvToJSON(feeResult).value.value);
  console.log(`Fee unit: ${feeUnit} microSTX`);

  // Step 1: begin-or-get
  console.log('\n--- Step 1: begin-or-get ---');
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
  const beginTxid = await broadcast(beginTx);
  await pollTx(beginTxid);
  console.log('  Upload session started.');
  nonce = nonce + 1n;

  // Step 2: add-chunk-batch
  console.log('\n--- Step 2: add-chunk-batch ---');
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
  const chunkTxid = await broadcast(chunkTx);
  await pollTx(chunkTxid);
  console.log('  Chunk uploaded.');
  nonce = nonce + 1n;

  // Step 3: seal-inscription (genesis = no recursive deps)
  console.log('\n--- Step 3: seal-inscription ---');
  const totalChunks = BigInt(chunks.length);
  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  console.log(`  Seal fee: ${sealFee} microSTX`);

  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(TOKEN_URI)
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
  const sealTxid = await broadcast(sealTx);
  const sealResult = await pollTx(sealTxid);

  // Extract token ID from result
  const tokenId = cvToJSON(sealResult.tx_result || { hex: sealResult.tx_result_hex }).value?.value;
  console.log(`\n=== GENESIS SEALED ===`);
  console.log(`Token ID: ${tokenId}`);
  console.log(`Seal txid: ${sealTxid}`);
  console.log(`Hash: 0x${expectedHash.toString('hex')}`);
  console.log(`Size: ${fileData.length} bytes`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
