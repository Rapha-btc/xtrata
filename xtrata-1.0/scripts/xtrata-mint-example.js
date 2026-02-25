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

// ─── Configuration ──────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const CHUNK_SIZE = 16_384;
const MAX_BATCH_SIZE = 50;
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

// ─── Data Preparation ───────────────────────────────────────────────────────

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

// ─── Contract Helpers ───────────────────────────────────────────────────────

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

// ─── Transaction Broadcasting ───────────────────────────────────────────────

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
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`TX ${txid} did not confirm in time`);
}

// ─── Main Flow ──────────────────────────────────────────────────────────────

async function mint(filePath, mimeType, tokenUri) {
  const senderKey = process.env.SENDER_KEY;
  if (!senderKey) throw new Error('Set SENDER_KEY env var to your hex private key');

  const senderAddress = getAddressFromPrivateKey(
    senderKey,
    resolveTransactionVersion(networkName)
  );
  const resolvedTokenUri = tokenUri || DEFAULT_TOKEN_URI;
  console.log(`Sender: ${senderAddress}`);
  console.log(`Network: ${networkName}`);
  console.log(`API: ${network.coreApiUrl}`);

  // 1. Read and prepare file
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

  // 2. Dedup check
  const existingId = await getIdByHash(expectedHash, senderAddress);
  if (existingId !== null) {
    console.log(`Already inscribed as token #${existingId}`);
    return;
  }

  // 3. Get fee unit
  const feeUnit = await getFeeUnit(senderAddress);
  const sealBatches = (totalChunks + 49n) / 50n;
  const sealFee = feeUnit * (1n + sealBatches);
  const totalFee = feeUnit + sealFee;
  console.log(`Fees: begin=${Number(feeUnit) / 1e6} STX, seal=${Number(sealFee) / 1e6} STX, total=${Number(totalFee) / 1e6} STX`);

  // 4. Begin
  console.log('\n--- Begin inscription ---');
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
  console.log(`Begin TX: ${beginTxid}`);
  await waitForConfirmation(beginTxid);
  console.log('Begin confirmed.');

  // 5. Upload chunks
  console.log('\n--- Upload chunks ---');
  for (let i = 0; i < batches.length; i++) {
    console.log(`Batch ${i + 1}/${batches.length} (${batches[i].length} chunks)`);
    const chunkTx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'add-chunk-batch',
      functionArgs: [
        bufferCV(expectedHash),
        listCV(batches[i].map(c => bufferCV(c)))
      ],
      senderKey,
      network,
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
    const chunkTxid = await broadcast(chunkTx);
    console.log(`  TX: ${chunkTxid}`);
    await waitForConfirmation(chunkTxid);
    console.log('  Confirmed.');
    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, TX_DELAY_MS));
    }
  }

  // 6. Seal
  console.log('\n--- Seal inscription ---');
  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(resolvedTokenUri)
    ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, sealFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const sealTxid = await broadcast(sealTx);
  console.log(`Seal TX: ${sealTxid}`);
  const sealResult = await waitForConfirmation(sealTxid);
  console.log('Seal confirmed!');

  // 7. Get token ID
  const tokenId = await getIdByHash(expectedHash, senderAddress);
  console.log(`\nInscription complete! Token ID: ${tokenId}`);
  console.log(`Seal TX: ${sealTxid}`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const [,, filePath, mimeType = 'application/octet-stream', tokenUri] = process.argv;
if (!filePath) {
  console.error('Usage: XTRATA_NETWORK=mainnet SENDER_KEY=<key> node xtrata-mint-example.js <file> [mime-type] [token-uri]');
  process.exit(1);
}

mint(filePath, mimeType, tokenUri).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
