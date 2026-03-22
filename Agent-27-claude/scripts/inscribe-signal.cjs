/**
 * Agent 27 — Graph Signal Inscription
 *
 * Inscribes a JSON graph signal as a recursive child of multiple tokens.
 *
 * Usage: node scripts/inscribe-signal.cjs
 *
 * Env overrides:
 *   SIGNAL_FILE    — path to JSON file (default: inscriptions/graph-signal-001.json)
 *   DEPENDENCIES   — comma-separated token IDs (default: 107,197,198)
 *   TOKEN_URI      — token URI string (default: data:application/json,agent-27-graph-signal-1)
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');
const {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  contractPrincipalCV,
  principalCV,
  uintCV,
  stringAsciiCV,
  listCV,
  cvToJSON,
  hexToCV,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  getAddressFromPrivateKey,
  TransactionVersion,
  getNonce
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

// --- Config -----------------------------------------------------------------

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_CONTRACT_ADDRESS = process.env.XTRATA_HELPER_CONTRACT_ADDRESS || CONTRACT_ADDRESS;
const HELPER_CONTRACT_NAME = process.env.XTRATA_HELPER_CONTRACT_NAME || 'xtrata-small-mint-v1-0';
const MNEMONIC = 'capital process seat brief true sketch error desk arena salt maple three grape endless vessel science feel such electric turn angle cat right boring';
const REPO_ROOT = path.resolve(__dirname, '..');
const CHUNK_SIZE = 16_384;
const MAX_SMALL_MINT_CHUNKS = 30;
const POLL_INTERVAL = 10_000;
const MAX_POLLS = 60;
const STX_FEE = 250_000n;
const MIME_TYPE = 'application/json';

const SIGNAL_FILE = path.resolve(REPO_ROOT, process.env.SIGNAL_FILE || 'inscriptions/graph-signal-001.json');
const DEPENDENCIES = (process.env.DEPENDENCIES || '107,197,198').split(',').map(s => parseInt(s.trim(), 10));
const TOKEN_URI = process.env.TOKEN_URI || 'data:application/json,agent-27-graph-signal-1';

// --- Derive key --------------------------------------------------------------

const seed = mnemonicToSeedSync(MNEMONIC);
const master = HDKey.fromMasterSeed(seed);
const child = master.derive("m/44'/5757'/0'/0/0");
const senderKey = Buffer.from(child.privateKey).toString('hex') + '01';
const senderAddress = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);
const network = new StacksMainnet();

console.log('Sender:', senderAddress);
console.log('Signal file:', path.relative(REPO_ROOT, SIGNAL_FILE));
console.log('Token URI:', TOKEN_URI);
console.log('Dependencies:', DEPENDENCIES.join(', '));

// --- Helpers ----------------------------------------------------------------

function stepLog(step, status, detail) {
  console.log(JSON.stringify({ __xtrata_step: true, step, status, detail }));
}

function chunkBytes(data) {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    chunks.push(data.subarray(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}

function computeHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256').update(Buffer.concat([running, chunk])).digest();
  }
  return running;
}

async function readOnly(functionName, functionArgs) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress,
    network
  });
  return cvToJSON(result);
}

async function getIdByHash(expectedHash) {
  const json = await readOnly('get-id-by-hash', [bufferCV(expectedHash)]);
  return json.value ? BigInt(json.value.value) : null;
}

async function getFeeUnit() {
  const json = await readOnly('get-fee-unit', []);
  return BigInt(json.value.value);
}

function parseTxResultJson(txData) {
  const hex = txData?.tx_result?.hex || txData?.tx_result_hex;
  return hex ? cvToJSON(hexToCV(hex)) : null;
}

function parseHelperTokenId(resultJson) {
  const tokenField = resultJson?.success ? resultJson.value?.value?.['token-id'] : null;
  if (!tokenField) return null;
  if (tokenField.type === 'uint') return BigInt(tokenField.value);
  if (tokenField.value?.type === 'uint') return BigInt(tokenField.value.value);
  return null;
}

function parseHelperExisted(resultJson) {
  return resultJson?.success ? resultJson.value?.value?.existed?.value === true : false;
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
    stepLog(step, 'polling', `${data.tx_status} — waiting (${i + 1}/${MAX_POLLS})`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
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

// --- Main -------------------------------------------------------------------

async function main() {
  const fileData = fs.readFileSync(SIGNAL_FILE);
  stepLog('preflight', 'info', `File: ${fileData.length} bytes, mime: ${MIME_TYPE}`);

  // Validate JSON
  JSON.parse(fileData.toString());
  stepLog('preflight', 'info', 'JSON validated');

  const chunks = chunkBytes(fileData);
  const totalSize = BigInt(fileData.length);
  const totalChunks = BigInt(chunks.length);
  const expectedHash = computeHash(chunks);
  stepLog('preflight', 'info', `Hash: 0x${expectedHash.toString('hex').slice(0, 16)}...`);

  const existingId = await getIdByHash(expectedHash);
  if (existingId !== null) {
    stepLog('preflight', 'info', `Already inscribed as token #${existingId}. Done.`);
    return;
  }

  const feeUnit = await getFeeUnit();
  const depList = listCV(DEPENDENCIES.map(id => uintCV(id)));

  // Use helper route — single chunk, small file
  if (chunks.length <= MAX_SMALL_MINT_CHUNKS) {
    const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
    const spendCap = feeUnit + sealFee;
    const nonce = await getNonce(senderAddress, network);

    stepLog('mint', 'info', `Helper single-tx mint — fee-unit: ${feeUnit}, spend cap: ${spendCap} microSTX`);

    const tx = await makeContractCall({
      contractAddress: HELPER_CONTRACT_ADDRESS,
      contractName: HELPER_CONTRACT_NAME,
      functionName: 'mint-small-single-tx-recursive',
      functionArgs: [
        contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
        bufferCV(expectedHash),
        stringAsciiCV(MIME_TYPE),
        uintCV(totalSize),
        listCV(chunks.map(chunk => bufferCV(chunk))),
        stringAsciiCV(TOKEN_URI),
        depList
      ],
      senderKey,
      network,
      nonce,
      fee: STX_FEE,
      postConditions: [
        makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, spendCap)
      ],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });

    const txid = await broadcastTx(tx, 'mint');
    const result = await pollTx(txid, 'mint');
    const resultJson = parseTxResultJson(result);
    const tokenId = parseHelperTokenId(resultJson) ?? (await getIdByHash(expectedHash));
    const existed = parseHelperExisted(resultJson);

    stepLog('mint', 'confirmed',
      `${existed ? 'Existing token reused' : 'SEALED'} — Token #${tokenId} | txid: ${txid} | deps: [${DEPENDENCIES.join(',')}]`);

    console.log(`\n=== GRAPH SIGNAL SEALED ===`);
    console.log(`Token ID: ${tokenId}`);
    console.log(`txid: ${txid}`);
    console.log(`Hash: 0x${expectedHash.toString('hex')}`);
    console.log(`Size: ${fileData.length} bytes`);
    console.log(`Dependencies: [${DEPENDENCIES.join(', ')}]`);
    console.log(`URI: ${TOKEN_URI}`);
  } else {
    throw new Error(`File requires ${chunks.length} chunks — too large for helper. Use inscribe-entry.cjs flow.`);
  }
}

main().catch((err) => {
  stepLog('fatal', 'error', err.message);
  console.error('FAILED:', err.message);
  process.exit(1);
});
