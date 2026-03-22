/**
 * Agent 27 — Entry Inscription Script
 *
 * Inscribes the latest draft in inscriptions/ as a recursive child of Genesis (#107).
 * Uses the small-mint helper when possible and falls back to the staged core
 * flow when resuming an upload or when the helper is disabled.
 *
 * Usage: ENTRY_NUM=2 node scripts/inscribe-entry.cjs
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  contractPrincipalCV,
  hexToCV,
  principalCV,
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
const { deriveAgent27SenderKey, getAgent27SignerSource } = require('./agent27-signer.cjs');

// --- Config -----------------------------------------------------------------

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_CONTRACT_ADDRESS = process.env.XTRATA_HELPER_CONTRACT_ADDRESS || CONTRACT_ADDRESS;
const HELPER_CONTRACT_NAME = process.env.XTRATA_HELPER_CONTRACT_NAME || 'xtrata-small-mint-v1-0';
const REPO_ROOT = path.resolve(__dirname, '..');
const GENESIS_TOKEN = 107;
const ENTRY_NUM = parseInt(process.env.ENTRY_NUM || '2', 10);
const TOKEN_URI = `data:text/html,agent-27-entry-${ENTRY_NUM}`;
const MIME_TYPE = 'text/html';
const CHUNK_SIZE = 16_384;
const MAX_BATCH_SIZE = 50;
const MAX_SMALL_MINT_CHUNKS = 30;
const POLL_INTERVAL = 10_000;
const MAX_POLLS = 60;
const USE_SMALL_MINT_HELPER = envFlag('XTRATA_USE_SMALL_MINT_HELPER', true);
const STX_FEE = 250_000n; // 0.25 STX safety cap

function resolveHtmlFile() {
  if (process.env.HTML_FILE) {
    return path.resolve(REPO_ROOT, process.env.HTML_FILE);
  }

  const inscriptionsDir = path.join(REPO_ROOT, 'inscriptions');
  const datedDrafts = fs.existsSync(inscriptionsDir)
    ? fs.readdirSync(inscriptionsDir)
      .filter((file) => /^entry-\d{8}\.html$/.test(file))
      .sort()
      .reverse()
    : [];

  if (datedDrafts.length > 0) {
    return path.join(inscriptionsDir, datedDrafts[0]);
  }

  return path.join(inscriptionsDir, 'entry-draft.html');
}

const HTML_FILE = resolveHtmlFile();

// --- Derive key --------------------------------------------------------------

const signerSource = getAgent27SignerSource();
const senderKey = deriveAgent27SenderKey();
const senderAddress = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);
const network = new StacksMainnet();

console.log('Sender:', senderAddress);
console.log('Signer source:', signerSource.type);
console.log('Entry:', ENTRY_NUM);
console.log('Token URI:', TOKEN_URI);
console.log('Genesis parent:', GENESIS_TOKEN);
console.log('HTML file:', path.relative(REPO_ROOT, HTML_FILE));

// --- Helpers ----------------------------------------------------------------

/** Emit structured step event for the dashboard to parse. */
function stepLog(step, status, detail) {
  console.log(JSON.stringify({ __xtrata_step: true, step, status, detail }));
}

function envFlag(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function chunkBytes(data) {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    chunks.push(data.subarray(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}

function batchChunks(chunks) {
  const batches = [];
  for (let offset = 0; offset < chunks.length; offset += MAX_BATCH_SIZE) {
    batches.push(chunks.slice(offset, offset + MAX_BATCH_SIZE));
  }
  return batches;
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

async function getUploadState(expectedHash) {
  const json = await readOnly(
    'get-upload-state',
    [bufferCV(expectedHash), principalCV(senderAddress)]
  );
  return json.value ?? null;
}

function parseTxResultJson(txData) {
  const hex = txData?.tx_result?.hex || txData?.tx_result_hex;
  return hex ? cvToJSON(hexToCV(hex)) : null;
}

function parseOptionalUint(resultJson) {
  const optionalValue = resultJson?.success ? resultJson.value : null;
  const uintValue = optionalValue?.value;
  return uintValue?.type === 'uint' ? BigInt(uintValue.value) : null;
}

function parseUintResponse(resultJson) {
  const uintValue = resultJson?.success ? resultJson.value : null;
  return uintValue?.type === 'uint' ? BigInt(uintValue.value) : null;
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

function validateUploadState(uploadState, totalSize, totalChunks, chunksLength) {
  if (uploadState === null) {
    return 0;
  }

  const state = uploadState.value;
  const uploadMimeType = state['mime-type'].value;
  const uploadTotalSize = BigInt(state['total-size'].value);
  const uploadTotalChunks = BigInt(state['total-chunks'].value);
  const resumeFromIndex = Number(state['current-index'].value);

  if (uploadMimeType !== MIME_TYPE) {
    throw new Error(`Existing upload mime type ${uploadMimeType} does not match ${MIME_TYPE}.`);
  }
  if (uploadTotalSize !== totalSize) {
    throw new Error(
      `Existing upload size ${uploadTotalSize.toString()} does not match local size ${totalSize.toString()}.`
    );
  }
  if (uploadTotalChunks !== totalChunks) {
    throw new Error(
      `Existing upload chunk count ${uploadTotalChunks.toString()} does not match local chunk count ${totalChunks.toString()}.`
    );
  }
  if (!Number.isSafeInteger(resumeFromIndex) || resumeFromIndex < 0 || resumeFromIndex > chunksLength) {
    throw new Error(`Existing upload current-index is invalid: ${state['current-index'].value}`);
  }

  return resumeFromIndex;
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
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
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

async function mintWithHelper({ chunks, expectedHash, totalSize, totalChunks, feeUnit, fee }) {
  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  const spendCap = feeUnit + sealFee;
  const nonce = await getNonce(senderAddress, network);

  stepLog('begin', 'info', 'Helper route selected — begin/upload/seal collapse into one transaction');
  stepLog('chunk', 'info', `Prepared ${chunks.length} chunk(s) for helper payload`);
  stepLog(
    'seal',
    'info',
    `Step 3/3 — Broadcasting helper recursive mint (${HELPER_CONTRACT_NAME}, fee: ${fee} microSTX, spend cap: ${spendCap} microSTX)`
  );

  const helperTx = await makeContractCall({
    contractAddress: HELPER_CONTRACT_ADDRESS,
    contractName: HELPER_CONTRACT_NAME,
    functionName: 'mint-small-single-tx-recursive',
    functionArgs: [
      contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
      bufferCV(expectedHash),
      stringAsciiCV(MIME_TYPE),
      uintCV(totalSize),
      listCV(chunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(TOKEN_URI),
      listCV([uintCV(GENESIS_TOKEN)])
    ],
    senderKey,
    network,
    nonce,
    fee,
    postConditions: [
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, spendCap)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const helperTxid = await broadcastTx(helperTx, 'seal');
  const helperResult = await pollTx(helperTxid, 'seal');
  const helperJson = parseTxResultJson(helperResult);
  const tokenId = parseHelperTokenId(helperJson) ?? (await getIdByHash(expectedHash));
  const existed = parseHelperExisted(helperJson);

  stepLog('begin', 'confirmed', 'Upload session handled inside helper');
  stepLog(
    'chunk',
    'confirmed',
    `Chunk upload handled inside helper (${chunks.length} chunk${chunks.length === 1 ? '' : 's'})`
  );
  stepLog(
    'seal',
    'confirmed',
    `${existed ? 'Existing token reused via helper' : 'SEALED via helper'} — Token #${tokenId} | txid: ${helperTxid}`
  );

  return { tokenId, txid: helperTxid, route: 'helper' };
}

async function mintStaged({ chunks, expectedHash, totalSize, totalChunks, feeUnit, uploadState, resumeFromIndex, fee }) {
  const batches = batchChunks(chunks.slice(resumeFromIndex));
  let nonce = await getNonce(senderAddress, network);

  if (uploadState === null) {
    stepLog('begin', 'info', 'Step 1/3 — Opening upload session (begin-or-get)');
    const beginTx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'begin-or-get',
      functionArgs: [
        bufferCV(expectedHash),
        stringAsciiCV(MIME_TYPE),
        uintCV(totalSize),
        uintCV(totalChunks)
      ],
      senderKey,
      network,
      nonce,
      fee,
      postConditions: [
        makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, feeUnit)
      ],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
    const beginTxid = await broadcastTx(beginTx, 'begin');
    const beginResult = await pollTx(beginTxid, 'begin');
    const existingId = parseOptionalUint(parseTxResultJson(beginResult));
    if (existingId !== null) {
      stepLog('begin', 'confirmed', `Existing token resolved during begin: #${existingId}`);
      stepLog('chunk', 'confirmed', 'Chunk upload skipped — canonical content already existed');
      stepLog('seal', 'confirmed', `Existing token reused — Token #${existingId} | txid: ${beginTxid}`);
      return { tokenId: existingId, txid: beginTxid, route: 'staged' };
    }
    stepLog('begin', 'confirmed', 'Upload session started');
    nonce += 1n;
  } else {
    stepLog('begin', 'confirmed', `Resuming existing upload session at chunk ${resumeFromIndex}/${chunks.length}`);
  }

  if (resumeFromIndex >= chunks.length) {
    stepLog('chunk', 'confirmed', 'All chunks already uploaded — proceeding directly to seal');
  } else {
    stepLog(
      'chunk',
      'info',
      `Step 2/3 — Uploading ${chunks.length - resumeFromIndex} remaining chunk(s) across ${batches.length} batch(es)`
    );
    for (let i = 0; i < batches.length; i++) {
      const chunkTx = await makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'add-chunk-batch',
        functionArgs: [
          bufferCV(expectedHash),
          listCV(batches[i].map((chunk) => bufferCV(chunk)))
        ],
        senderKey,
        network,
        nonce,
        fee,
        postConditions: [],
        postConditionMode: PostConditionMode.Deny,
        anchorMode: AnchorMode.Any
      });
      const chunkTxid = await broadcastTx(chunkTx, 'chunk');
      await pollTx(chunkTxid, 'chunk');
      nonce += 1n;
    }
    stepLog('chunk', 'confirmed', 'Data uploaded and verified');
  }

  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  stepLog('seal', 'info', `Step 3/3 — Sealing inscription (seal-recursive, fee: ${sealFee} microSTX, tx-fee: ${fee} microSTX)`);

  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-recursive',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(TOKEN_URI),
      listCV([uintCV(GENESIS_TOKEN)])
    ],
    senderKey,
    network,
    nonce,
    fee,
    postConditions: [
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, sealFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const sealTxid = await broadcastTx(sealTx, 'seal');
  const sealResult = await pollTx(sealTxid, 'seal');
  const tokenId = parseUintResponse(parseTxResultJson(sealResult)) ?? (await getIdByHash(expectedHash));
  stepLog('seal', 'confirmed', `SEALED — Token #${tokenId} | txid: ${sealTxid}`);

  return { tokenId, txid: sealTxid, route: 'staged' };
}

// --- Main -------------------------------------------------------------------

async function main() {
  const fileData = fs.readFileSync(HTML_FILE);
  stepLog('preflight', 'info', `File: ${fileData.length} bytes, Entry #${ENTRY_NUM}`);

  if (fileData.length > CHUNK_SIZE) {
    stepLog('preflight', 'error', `File too large: ${fileData.length} bytes (max ${CHUNK_SIZE})`);
    throw new Error(`File too large: ${fileData.length} bytes (max ${CHUNK_SIZE})`);
  }

  const chunks = chunkBytes(fileData);
  const totalSize = BigInt(fileData.length);
  const totalChunks = BigInt(chunks.length);
  const expectedHash = computeHash(chunks);
  stepLog('preflight', 'info', `Hash: 0x${expectedHash.toString('hex').slice(0, 16)}...`);

  const existingId = await getIdByHash(expectedHash);
  if (existingId !== null) {
    stepLog('preflight', 'error', `Already inscribed as token #${existingId}`);
    console.log(`ALREADY INSCRIBED as token #${existingId}. Skipping.`);
    return;
  }

  const feeUnit = await getFeeUnit();
  const uploadState = await getUploadState(expectedHash);
  const resumeFromIndex = validateUploadState(uploadState, totalSize, totalChunks, chunks.length);
  const canUseHelper =
    USE_SMALL_MINT_HELPER &&
    uploadState === null &&
    chunks.length > 0 &&
    chunks.length <= MAX_SMALL_MINT_CHUNKS;

  stepLog(
    'preflight',
    'confirmed',
    `Fee unit: ${feeUnit} microSTX | route: ${canUseHelper ? 'small helper single-tx' : 'staged begin/upload/seal'}`
  );
  if (uploadState !== null) {
    stepLog(
      'preflight',
      'info',
      `Active upload session detected at chunk ${resumeFromIndex}/${chunks.length}; helper route disabled for resume`
    );
  }

  const result = canUseHelper
    ? await mintWithHelper({ chunks, expectedHash, totalSize, totalChunks, feeUnit, fee: STX_FEE })
    : await mintStaged({ chunks, expectedHash, totalSize, totalChunks, feeUnit, uploadState, resumeFromIndex, fee: STX_FEE });

  console.log(`\n=== ENTRY ${ENTRY_NUM} SEALED ===`);
  console.log(`Token ID: ${result.tokenId}`);
  console.log(`Final txid: ${result.txid}`);
  console.log(`Route: ${result.route}`);
  console.log(`Hash: 0x${expectedHash.toString('hex')}`);
  console.log(`Size: ${fileData.length} bytes`);
  console.log(`Parent: #${GENESIS_TOKEN}`);
  console.log(`URI: ${TOKEN_URI}`);
}

main().catch((err) => {
  stepLog('fatal', 'error', err.message);
  console.error('FAILED:', err.message);
  process.exit(1);
});
