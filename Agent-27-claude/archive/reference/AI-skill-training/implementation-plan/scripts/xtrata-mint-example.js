/**
 * Xtrata Mint Example — Complete, runnable inscription script
 *
 * Usage:
 *   XTRATA_NETWORK=mainnet SENDER_KEY=<hex-private-key> node xtrata-mint-example.js <file-path> [mime-type] [token-uri]
 *
 * Example:
 *   XTRATA_NETWORK=testnet SENDER_KEY=abc123... node xtrata-mint-example.js ./my-image.png image/png
 *
 * Environment:
 *   XTRATA_NETWORK=mainnet|testnet  (default: mainnet)
 *   XTRATA_API_URL=<custom-api-url> (optional, overrides network default endpoint)
 *   XTRATA_USE_SMALL_MINT_HELPER=true|false (default: true)
 *   XTRATA_HELPER_CONTRACT_ADDRESS=<address> (optional; defaults to mainnet helper)
 *   XTRATA_HELPER_CONTRACT_NAME=<name> (optional; defaults to xtrata-small-mint-v1-0 on mainnet)
 *   XTRATA_DEPENDENCY_IDS=1,2,3 (optional recursive dependency ids)
 *
 * Requirements:
 *   npm install @stacks/transactions @stacks/network @noble/hashes
 */

import { readFileSync } from 'fs';
import { sha256 } from '@noble/hashes/sha256';
import {
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
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  getAddressFromPrivateKey,
  TransactionVersion
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';

// --- Configuration ----------------------------------------------------------

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_CONTRACT_NAME = 'xtrata-small-mint-v1-0';
const CHUNK_SIZE = 16_384;
const MAX_BATCH_SIZE = 50;
const MAX_SMALL_MINT_CHUNKS = 30;
const TX_DELAY_MS = 5_000;
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 60;
const DEFAULT_TOKEN_URI =
  'https://xvgh3sbdkivby4blejmripeiyjuvji3d4tycym6hgaxalescegjq.arweave.net/vUx9yCNSKhxwKyJZFDyIwmlUo2Pk8CwzxzAuBZJCIZM';

function resolveNetwork() {
  const name = (process.env.XTRATA_NETWORK || 'mainnet').toLowerCase();
  const url = process.env.XTRATA_API_URL;

  if (name === 'mainnet') {
    return url ? new StacksMainnet({ url }) : new StacksMainnet();
  }
  if (name === 'testnet') {
    return url ? new StacksTestnet({ url }) : new StacksTestnet();
  }

  throw new Error(`Unsupported XTRATA_NETWORK: ${name}. Use mainnet or testnet.`);
}

function resolveTransactionVersion(networkName) {
  return networkName === 'testnet'
    ? TransactionVersion.Testnet
    : TransactionVersion.Mainnet;
}

const networkName = (process.env.XTRATA_NETWORK || 'mainnet').toLowerCase();
const network = resolveNetwork();

function envFlag(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function resolveHelperContract() {
  if (!envFlag('XTRATA_USE_SMALL_MINT_HELPER', true)) {
    return null;
  }

  const configuredAddress = process.env.XTRATA_HELPER_CONTRACT_ADDRESS?.trim() || null;
  const configuredName = process.env.XTRATA_HELPER_CONTRACT_NAME?.trim() || null;

  if ((configuredAddress && !configuredName) || (!configuredAddress && configuredName)) {
    throw new Error(
      'Set both XTRATA_HELPER_CONTRACT_ADDRESS and XTRATA_HELPER_CONTRACT_NAME, or neither.'
    );
  }

  if (configuredAddress && configuredName) {
    return { address: configuredAddress, contractName: configuredName };
  }

  if (networkName === 'mainnet') {
    return { address: CONTRACT_ADDRESS, contractName: HELPER_CONTRACT_NAME };
  }

  return null;
}

function parseDependencyIds() {
  const raw = process.env.XTRATA_DEPENDENCY_IDS?.trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (!/^\d+$/.test(value)) {
        throw new Error(`Invalid dependency id: ${value}`);
      }
      return BigInt(value);
    });
}

// --- Data Preparation -------------------------------------------------------

function chunkBytes(data) {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    chunks.push(data.slice(offset, offset + CHUNK_SIZE));
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

function computeExpectedHash(chunks) {
  let runningHash = new Uint8Array(32);
  for (const chunk of chunks) {
    const combined = new Uint8Array(runningHash.length + chunk.length);
    combined.set(runningHash, 0);
    combined.set(chunk, runningHash.length);
    runningHash = sha256(combined);
  }
  return runningHash;
}

// --- Contract Helpers -------------------------------------------------------

async function readOnly(functionName, functionArgs, senderAddress) {
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

async function getFeeUnit(senderAddress) {
  const json = await readOnly('get-fee-unit', [], senderAddress);
  return BigInt(json.value.value);
}

async function getIdByHash(hash, senderAddress) {
  const json = await readOnly('get-id-by-hash', [bufferCV(hash)], senderAddress);
  return json.value ? BigInt(json.value.value) : null;
}

async function getUploadState(hash, owner, senderAddress) {
  const json = await readOnly(
    'get-upload-state',
    [bufferCV(hash), principalCV(owner)],
    senderAddress
  );
  return json.value ?? null;
}

// --- Transaction Broadcasting ----------------------------------------------

async function broadcast(tx) {
  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    throw new Error(`Broadcast failed: ${result.error} — ${result.reason}`);
  }
  return result.txid || result;
}

async function waitForConfirmation(txid) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.tx_status === 'success') return data;
      if (data.tx_status?.startsWith('abort')) {
        throw new Error(`TX aborted: ${data.tx_status}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('TX aborted')) throw e;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`TX ${txid} did not confirm in time`);
}

async function mintWithHelper({
  helperContract,
  chunks,
  expectedHash,
  mimeType,
  totalSize,
  totalChunks,
  tokenUri,
  dependencies,
  senderAddress,
  senderKey,
  feeUnit
}) {
  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  const spendCap = feeUnit + sealFee;
  const functionName =
    dependencies.length > 0
      ? 'mint-small-single-tx-recursive'
      : 'mint-small-single-tx';

  console.log('\n--- Small helper route ---');
  console.log(
    `Helper: ${helperContract.address}.${helperContract.contractName} (${chunks.length} chunks)`
  );

  const helperTx = await makeContractCall({
    contractAddress: helperContract.address,
    contractName: helperContract.contractName,
    functionName,
    functionArgs:
      dependencies.length > 0
        ? [
            contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
            bufferCV(expectedHash),
            stringAsciiCV(mimeType),
            uintCV(totalSize),
            listCV(chunks.map((chunk) => bufferCV(chunk))),
            stringAsciiCV(tokenUri),
            listCV(dependencies.map((id) => uintCV(id)))
          ]
        : [
            contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
            bufferCV(expectedHash),
            stringAsciiCV(mimeType),
            uintCV(totalSize),
            listCV(chunks.map((chunk) => bufferCV(chunk))),
            stringAsciiCV(tokenUri)
          ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        spendCap
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const helperTxid = await broadcast(helperTx);
  console.log(`Helper TX: ${helperTxid}`);
  await waitForConfirmation(helperTxid);
  console.log('Helper mint confirmed.');

  const tokenId = await getIdByHash(expectedHash, senderAddress);
  return { tokenId, txids: [helperTxid], route: 'helper' };
}

async function mintStaged({
  chunks,
  expectedHash,
  mimeType,
  totalSize,
  totalChunks,
  tokenUri,
  dependencies,
  resumeFromIndex = 0,
  senderAddress,
  senderKey,
  feeUnit
}) {
  const txids = [];
  if (resumeFromIndex <= 0) {
    console.log('\n--- Staged route: begin inscription ---');
    const beginTx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'begin-or-get',
      functionArgs: [
        bufferCV(expectedHash),
        stringAsciiCV(mimeType),
        uintCV(totalSize),
        uintCV(totalChunks)
      ],
      senderKey,
      network,
      postConditions: [
        makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, feeUnit)
      ],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
    const beginTxid = await broadcast(beginTx);
    txids.push(beginTxid);
    console.log(`Begin TX: ${beginTxid}`);
    await waitForConfirmation(beginTxid);
    console.log('Begin confirmed.');
  } else {
    console.log(`\n--- Staged route: resume from chunk ${resumeFromIndex}/${chunks.length} ---`);
  }

  console.log('\n--- Staged route: upload chunks ---');
  const remainingBatches = batchChunks(chunks.slice(resumeFromIndex));
  for (let i = 0; i < remainingBatches.length; i++) {
    console.log(
      `Batch ${i + 1}/${remainingBatches.length} (${remainingBatches[i].length} chunks)`
    );
    const chunkTx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'add-chunk-batch',
      functionArgs: [
        bufferCV(expectedHash),
        listCV(remainingBatches[i].map((chunk) => bufferCV(chunk)))
      ],
      senderKey,
      network,
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
    const chunkTxid = await broadcast(chunkTx);
    txids.push(chunkTxid);
    console.log(`  TX: ${chunkTxid}`);
    await waitForConfirmation(chunkTxid);
    console.log('  Confirmed.');
    if (i < remainingBatches.length - 1) {
      await new Promise((r) => setTimeout(r, TX_DELAY_MS));
    }
  }

  console.log('\n--- Staged route: seal inscription ---');
  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  const functionName = dependencies.length > 0 ? 'seal-recursive' : 'seal-inscription';
  const functionArgs =
    dependencies.length > 0
      ? [
          bufferCV(expectedHash),
          stringAsciiCV(tokenUri),
          listCV(dependencies.map((id) => uintCV(id)))
        ]
      : [
          bufferCV(expectedHash),
          stringAsciiCV(tokenUri)
        ];
  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        sealFee
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const sealTxid = await broadcast(sealTx);
  txids.push(sealTxid);
  console.log(`Seal TX: ${sealTxid}`);
  await waitForConfirmation(sealTxid);
  console.log('Seal confirmed.');

  const tokenId = await getIdByHash(expectedHash, senderAddress);
  return { tokenId, txids, route: 'staged' };
}

// --- Main Flow --------------------------------------------------------------

async function mint(filePath, mimeType, tokenUri) {
  const senderKey = process.env.SENDER_KEY;
  if (!senderKey) throw new Error('Set SENDER_KEY env var to your hex private key');

  const senderAddress = getAddressFromPrivateKey(
    senderKey,
    resolveTransactionVersion(networkName)
  );
  const helperContract = resolveHelperContract();
  const dependencies = parseDependencyIds();
  const resolvedTokenUri = tokenUri || DEFAULT_TOKEN_URI;

  console.log(`Sender: ${senderAddress}`);

  const fileData = new Uint8Array(readFileSync(filePath));
  const chunks = chunkBytes(fileData);
  const expectedHash = computeExpectedHash(chunks);
  const batches = batchChunks(chunks);
  const totalChunks = BigInt(chunks.length);
  const totalSize = BigInt(fileData.length);

  console.log(`File: ${filePath}`);
  console.log(`MIME: ${mimeType}`);
  console.log(`Token URI: ${resolvedTokenUri}`);
  console.log(`Size: ${fileData.length} bytes, ${chunks.length} chunks, ${batches.length} batches`);
  console.log(`Hash: 0x${Buffer.from(expectedHash).toString('hex')}`);
  console.log(
    `Dependencies: ${dependencies.length > 0 ? dependencies.map(String).join(', ') : 'none'}`
  );

  const existingId = await getIdByHash(expectedHash, senderAddress);
  if (existingId !== null) {
    console.log(`Already inscribed as token #${existingId}`);
    return;
  }

  const feeUnit = await getFeeUnit(senderAddress);
  const sealBatches = (totalChunks + 49n) / 50n;
  const sealFee = feeUnit * (1n + sealBatches);
  const totalFee = feeUnit + sealFee;
  console.log(`Fees: begin=${Number(feeUnit) / 1e6} STX, seal=${Number(sealFee) / 1e6} STX, total=${Number(totalFee) / 1e6} STX`);
  const uploadState = await getUploadState(expectedHash, senderAddress, senderAddress);
  let resumeFromIndex = 0;
  if (uploadState !== null) {
    const state = uploadState.value;
    const uploadMimeType = state['mime-type'].value;
    const uploadTotalSize = BigInt(state['total-size'].value);
    const uploadTotalChunks = BigInt(state['total-chunks'].value);
    resumeFromIndex = Number(state['current-index'].value);

    if (uploadMimeType !== mimeType) {
      throw new Error(
        `Existing upload mime type ${uploadMimeType} does not match local mime type ${mimeType}.`
      );
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
    if (!Number.isSafeInteger(resumeFromIndex) || resumeFromIndex < 0 || resumeFromIndex > chunks.length) {
      throw new Error(`Existing upload current-index is invalid: ${state['current-index'].value}`);
    }
  }
  const canUseHelper =
    helperContract !== null &&
    chunks.length > 0 &&
    chunks.length <= MAX_SMALL_MINT_CHUNKS &&
    uploadState === null;

  console.log(
    `Route: ${
      canUseHelper ? 'helper single-tx' : 'staged begin/upload/seal'
    }`
  );
  if (uploadState !== null) {
    console.log(
      `Active upload session detected at chunk ${resumeFromIndex}/${chunks.length}; helper route disabled for this attempt.`
    );
  }

  const result = canUseHelper
    ? await mintWithHelper({
        helperContract,
        chunks,
        expectedHash,
        mimeType,
        totalSize,
        totalChunks,
        tokenUri: resolvedTokenUri,
        dependencies,
        senderAddress,
        senderKey,
        feeUnit
      })
    : await mintStaged({
        chunks,
        expectedHash,
        mimeType,
        totalSize,
        totalChunks,
        tokenUri: resolvedTokenUri,
        dependencies,
        resumeFromIndex,
        senderAddress,
        senderKey,
        feeUnit
      });

  console.log(`\nInscription complete. Token ID: ${result.tokenId}`);
  console.log(`Route used: ${result.route}`);
  console.log(`TX IDs: ${result.txids.join(', ')}`);
}

// --- CLI --------------------------------------------------------------------

const [, , filePath, mimeType = 'application/octet-stream', tokenUri] = process.argv;
if (!filePath) {
  console.error('Usage: XTRATA_NETWORK=mainnet SENDER_KEY=<key> node xtrata-mint-example.js <file> [mime-type] [token-uri]');
  process.exit(1);
}

mint(filePath, mimeType, tokenUri).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
