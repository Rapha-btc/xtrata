---
name: xtrata-inscription
description: >
  Skill for autonomously creating, minting, transferring, and querying
  inscriptions on the Stacks blockchain via the xtrata protocol (xtrata.xyz).
  Use this skill whenever an agent needs to inscribe data on-chain via Stacks,
  mint inscription-based tokens, transfer inscriptions, query inscription state,
  or interact with the xtrata data layer in any way. This includes agents from
  the aibtc platform that hold STX and want to create or trade inscriptions
  autonomously.
---

# Xtrata Inscription Skill

## Overview
Xtrata is a contract-native inscription protocol on Stacks (Bitcoin L2). Data is split into fixed 16,384-byte chunks, uploaded on-chain, then sealed into a SIP-009 NFT. Content is deduplicated by a canonical hash, uploads are resumable, and sealed data is immutable.

Current production contract:
- Address: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`
- Contract name: `xtrata-v2-1-0`
- Full ID: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`

Legacy (read compatibility for migrated chunk data):
- `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1`

## Prerequisites
- Funded Stacks wallet with STX for protocol fees + network fees.
- JavaScript runtime (Node.js 20+ recommended).
- Stacks transaction signing access:
  - Direct key path (server/headless): `@stacks/transactions`
  - Wallet/MCP path (aibtc): wallet tool signs and broadcasts
- Required packages (current repo versions):
  - `@stacks/transactions@^6.11.0`
  - `@stacks/network@^6.11.0`
  - `@noble/hashes@^1.4.0`
- Optional browser-wallet dependency: `@stacks/connect@^7.8.0`

Install:

```bash
npm install @stacks/transactions @stacks/network @noble/hashes
```

## Core Concepts
1. Upload flow is strictly ordered: `begin-or-get` (or `begin-inscription`) -> one or more `add-chunk-batch` -> `seal-inscription` (or `seal-recursive` / `seal-inscription-batch`).
2. Chunking is fixed at 16,384 bytes. Maximum file size is 32 MiB (2,048 chunks).
3. Hashing is incremental SHA-256 chain hashing, not a single hash of full bytes.
4. Dedupe is native: `HashToId` guarantees one canonical token per final hash.
5. Uploads are resumable via `UploadState`; sessions expire after 4,320 blocks.
6. Always use `PostConditionMode.Deny` for fee-paying calls.
7. Transfers and reads still work while writes are paused.

## Contract and Network Reference

### Network Endpoints
- Mainnet primary: `https://stacks-node-api.mainnet.stacks.co`
- Mainnet fallback: `https://api.mainnet.hiro.so`
- Testnet primary: `https://stacks-node-api.testnet.stacks.co`
- Testnet fallback: `https://api.testnet.hiro.so`

### Contract IDs
- Mainnet (active): `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- Mainnet (legacy): `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1`
- Testnet: deploy from `contracts/live/xtrata-v2.1.0.clar` (no canonical shared testnet deployment is pinned in this repository).

### Constants
| Name | Value | Meaning |
|---|---:|---|
| `MAX-BATCH-SIZE` | `u50` | Max chunks per `add-chunk-batch` |
| `MAX-SEAL-BATCH-SIZE` | `u50` | Max entries per `seal-inscription-batch` |
| `CHUNK-SIZE` | `u16384` | Fixed chunk size |
| `MAX-TOTAL-CHUNKS` | `u2048` | Max chunks per inscription |
| `MAX-TOTAL-SIZE` | `u33554432` | Max bytes (32 MiB) |
| `FEE-MIN` | `u1000` | 0.001 STX |
| `FEE-MAX` | `u1000000` | 1.0 STX |
| `UPLOAD-EXPIRY-BLOCKS` | `u4320` | ~30 days |

### Error Codes
| Code | Name | Meaning |
|---:|---|---|
| `u100` | `ERR-NOT-AUTHORIZED` | Caller is not authorized |
| `u101` | `ERR-NOT-FOUND` | Token/session/resource missing |
| `u102` | `ERR-INVALID-BATCH` | Invalid batch/chunk limits/sizes |
| `u103` | `ERR-HASH-MISMATCH` | Final hash mismatch at seal |
| `u107` | `ERR-INVALID-URI` | Token URI invalid/empty/too long |
| `u109` | `ERR-PAUSED` | Writes paused |
| `u110` | `ERR-INVALID-FEE` | Fee value outside allowed bounds |
| `u111` | `ERR-DEPENDENCY-MISSING` | Recursive dependency missing |
| `u112` | `ERR-EXPIRED` | Upload session expired |
| `u113` | `ERR-NOT-EXPIRED` | Purge attempted before expiry |
| `u114` | `ERR-DUPLICATE` | Hash already sealed |
| `u115` | `ERR-ALREADY-SET` | One-time setter already used |

## Data Model

### Chunking
```javascript
const CHUNK_SIZE = 16_384;

export function chunkBytes(data) {
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}
```

### Upload Batching
```javascript
const MAX_BATCH_SIZE = 50;

export function batchChunks(chunks) {
  const batches = [];
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    batches.push(chunks.slice(i, i + MAX_BATCH_SIZE));
  }
  return batches;
}
```

### Incremental Hashing (Required)
```javascript
import { sha256 } from '@noble/hashes/sha256';

export function computeExpectedHash(chunks) {
  let runningHash = new Uint8Array(32); // 32 zero bytes
  for (const chunk of chunks) {
    const combined = new Uint8Array(runningHash.length + chunk.length);
    combined.set(runningHash, 0);
    combined.set(chunk, runningHash.length);
    runningHash = sha256(combined);
  }
  return runningHash;
}
```

### Deduplication
- Read-only lookup: `get-id-by-hash(hash)` -> `(optional uint)`
- Atomic begin+dedupe path: `begin-or-get(...)`
  - `(ok (some id))` -> content already sealed
  - `(ok none)` -> new/resumed upload session

### UploadState Lifecycle
1. Create/resume: `begin-or-get` or `begin-inscription`
2. Upload chunks: `add-chunk-batch`
3. Seal: `seal-inscription` or `seal-recursive`
4. Expire after inactivity (`UPLOAD-EXPIRY-BLOCKS`)
5. Optional early expire: `abandon-upload`
6. Purge expired chunks: `purge-expired-chunk-batch`

## Complete Contract API (xtrata-v2-1-0)

### Public Functions
| Function | Parameters (exact types) | Returns | Notes |
|---|---|---|---|
| `transfer` | `id: uint, sender: principal, recipient: principal` | `(response bool uint)` | SIP-009 transfer; works while paused |
| `set-royalty-recipient` | `recipient: principal` | `(response bool uint)` | Admin only |
| `set-fee-unit` | `new-fee: uint` | `(response bool uint)` | Admin only; bounded by min/max and relative change |
| `set-next-id` | `value: uint` | `(response bool uint)` | Admin only; one-time |
| `set-allowed-caller` | `caller: principal, allowed: bool` | `(response bool uint)` | Admin only |
| `set-paused` | `value: bool` | `(response bool uint)` | Admin only |
| `transfer-contract-ownership` | `new-owner: principal` | `(response bool uint)` | Admin only |
| `migrate-from-v1` | `token-id: uint` | `(response uint uint)` | Migrates v1 token into v2 |
| `begin-or-get` | `expected-hash: (buff 32), mime: (string-ascii 64), total-size: uint, total-chunks: uint` | `(response (optional uint) uint)` | Recommended begin path |
| `begin-inscription` | `expected-hash: (buff 32), mime: (string-ascii 64), total-size: uint, total-chunks: uint` | `(response bool uint)` | Resume-safe; rejects duplicates |
| `abandon-upload` | `expected-hash: (buff 32)` | `(response bool uint)` | Marks session expired for purge |
| `purge-expired-chunk-batch` | `hash: (buff 32), owner: principal, indexes: (list 50 uint)` | `(response bool uint)` | Permissionless expired cleanup |
| `add-chunk-batch` | `hash: (buff 32), chunks: (list 50 (buff 16384))` | `(response bool uint)` | No protocol fee |
| `seal-inscription` | `expected-hash: (buff 32), token-uri-string: (string-ascii 256)` | `(response uint uint)` | Mints token |
| `seal-inscription-batch` | `items: (list 50 { hash: (buff 32), token-uri: (string-ascii 256) })` | `(response { start: uint, count: uint } uint)` | Batch seal |
| `seal-recursive` | `expected-hash: (buff 32), token-uri-string: (string-ascii 256), dependencies: (list 50 uint)` | `(response uint uint)` | Seal with dependencies |

### Read-Only Functions
| Function | Parameters (exact types) | Returns |
|---|---|---|
| `get-last-token-id` | none | `(response uint uint)` |
| `get-next-token-id` | none | `(response uint uint)` |
| `get-minted-count` | none | `(response uint uint)` |
| `get-minted-id` | `index: uint` | `(optional uint)` |
| `get-token-uri` | `id: uint` | `(response (optional (string-ascii 256)) uint)` |
| `get-token-uri-raw` | `id: uint` | `(optional (string-ascii 256))` |
| `get-owner` | `id: uint` | `(response (optional principal) uint)` |
| `get-svg` | `id: uint` | `(response (optional (string-ascii 512)) uint)` |
| `get-svg-data-uri` | `id: uint` | `(response (optional (string-ascii 1024)) uint)` |
| `get-id-by-hash` | `hash: (buff 32)` | `(optional uint)` |
| `get-inscription-meta` | `id: uint` | `(optional { owner: principal, creator: principal, mime-type: (string-ascii 64), total-size: uint, total-chunks: uint, sealed: bool, final-hash: (buff 32) })` |
| `inscription-exists` | `id: uint` | `(response bool uint)` |
| `get-inscription-hash` | `id: uint` | `(optional (buff 32))` |
| `get-inscription-creator` | `id: uint` | `(optional principal)` |
| `get-inscription-size` | `id: uint` | `(optional uint)` |
| `get-inscription-chunks` | `id: uint` | `(optional uint)` |
| `is-inscription-sealed` | `id: uint` | `(optional bool)` |
| `get-chunk` | `id: uint, index: uint` | `(optional (buff 16384))` |
| `get-chunk-batch` | `id: uint, indexes: (list 50 uint)` | `(list 50 (optional (buff 16384)))` |
| `get-dependencies` | `id: uint` | `(list 50 uint)` |
| `get-upload-state` | `expected-hash: (buff 32), owner: principal` | `(optional { mime-type: (string-ascii 64), total-size: uint, total-chunks: uint, current-index: uint, running-hash: (buff 32), last-touched: uint, purge-index: uint })` |
| `get-pending-chunk` | `hash: (buff 32), creator: principal, index: uint` | `(optional (buff 16384))` |
| `get-admin` | none | `(response principal uint)` |
| `is-allowed-caller` | `caller: principal` | `(response bool uint)` |
| `get-royalty-recipient` | none | `(response principal uint)` |
| `get-fee-unit` | none | `(response uint uint)` |
| `is-paused` | none | `(response bool uint)` |

## Transaction Construction

### Imports
```javascript
import {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  uintCV,
  listCV,
  tupleCV,
  principalCV,
  stringAsciiCV,
  makeStandardSTXPostCondition,
  FungibleConditionCode,
  PostConditionMode,
  AnchorMode,
  cvToJSON,
  getNonce
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';
```

### Network Setup
```javascript
const network = new StacksMainnet();
// or:
// const network = new StacksTestnet();
// const network = new StacksMainnet({ url: 'https://stacks-node-api.mainnet.stacks.co' });

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const TX_DELAY_MS = 5000;
```

### Fee Model
- `begin_fee = fee-unit`
- `seal_fee = fee-unit * (1 + ceil(total_chunks / 50))`
- Default `fee-unit`: `100_000` microSTX (0.1 STX)

```javascript
export function estimateFees(totalChunks, feeUnitMicroStx = 100_000n) {
  const batches = (totalChunks + 49n) / 50n;
  const beginFee = feeUnitMicroStx;
  const sealFee = feeUnitMicroStx * (1n + batches);
  return { beginFee, sealFee, totalFee: beginFee + sealFee };
}
```

### Begin Transaction (fee-paying, post-condition required)
```javascript
export async function buildBeginOrGetTx({
  expectedHash,
  mime,
  totalSize,
  totalChunks,
  senderAddress,
  senderKey,
  feeUnitMicroStx,
  network
}) {
  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'begin-or-get',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(mime),
      uintCV(totalSize),
      uintCV(totalChunks)
    ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        feeUnitMicroStx
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
}
```

### Chunk Upload Transaction (no protocol fee)
```javascript
export async function buildAddChunkBatchTx({
  expectedHash,
  chunks,
  senderKey,
  network
}) {
  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'add-chunk-batch',
    functionArgs: [bufferCV(expectedHash), listCV(chunks.map((c) => bufferCV(c)))],
    senderKey,
    network,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
}
```

### Seal Transaction (fee-paying, post-condition required)
```javascript
export async function buildSealInscriptionTx({
  expectedHash,
  tokenUri,
  totalChunks,
  senderAddress,
  senderKey,
  feeUnitMicroStx,
  network
}) {
  const sealFee = feeUnitMicroStx * (1n + ((totalChunks + 49n) / 50n));

  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription',
    functionArgs: [bufferCV(expectedHash), stringAsciiCV(tokenUri)],
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
}
```

### Recursive Seal Transaction
```javascript
export async function buildSealRecursiveTx({
  expectedHash,
  tokenUri,
  dependencies,
  totalChunks,
  senderAddress,
  senderKey,
  feeUnitMicroStx,
  network
}) {
  const sealFee = feeUnitMicroStx * (1n + ((totalChunks + 49n) / 50n));

  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-recursive',
    functionArgs: [
      bufferCV(expectedHash),
      stringAsciiCV(tokenUri),
      listCV(dependencies.map((id) => uintCV(id)))
    ],
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
}
```

### Transfer Transaction
```javascript
export async function buildTransferTx({ tokenId, sender, recipient, senderKey, network }) {
  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'transfer',
    functionArgs: [uintCV(tokenId), principalCV(sender), principalCV(recipient)],
    senderKey,
    network,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
}
```

### Batch Seal Transaction
```javascript
export async function buildSealBatchTx({ items, senderAddress, senderKey, feeUnitMicroStx, network }) {
  let totalSealFee = 0n;
  for (const item of items) {
    totalSealFee += feeUnitMicroStx * (1n + ((item.totalChunks + 49n) / 50n));
  }

  return makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription-batch',
    functionArgs: [
      listCV(
        items.map((item) =>
          tupleCV({
            hash: bufferCV(item.expectedHash),
            'token-uri': stringAsciiCV(item.tokenUri)
          })
        )
      )
    ],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        totalSealFee
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
}
```

### Nonce Management
```javascript
const nonce = await getNonce(senderAddress, network);
// first tx uses nonce
// next txs use nonce + 1, nonce + 2, ...
```

When broadcasting multiple sequential writes, delay at least 5 seconds between tx broadcasts.

### Broadcast Helper
```javascript
export async function broadcastTx(transaction, network) {
  const result = await broadcastTransaction(transaction, network);
  if (result.error) {
    throw new Error(`Broadcast failed: ${result.error} - ${result.reason}`);
  }
  return result.txid || result;
}
```

## Workflows

### Workflow 1: Mint (begin -> upload -> seal)
```javascript
import { sha256 } from '@noble/hashes/sha256';
import {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  uintCV,
  stringAsciiCV,
  listCV,
  makeStandardSTXPostCondition,
  FungibleConditionCode,
  PostConditionMode,
  AnchorMode,
  cvToJSON
} from '@stacks/transactions';
import { StacksMainnet } from '@stacks/network';

const network = new StacksMainnet();
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const TX_DELAY_MS = 5000;

function chunkBytes(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 16384) out.push(data.slice(i, i + 16384));
  return out;
}

function batchChunks(chunks) {
  const out = [];
  for (let i = 0; i < chunks.length; i += 50) out.push(chunks.slice(i, i + 50));
  return out;
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

async function callReadOnly(functionName, functionArgs, senderAddress) {
  return callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress,
    network
  });
}

async function getFeeUnit(senderAddress) {
  const r = await callReadOnly('get-fee-unit', [], senderAddress);
  return BigInt(cvToJSON(r).value.value);
}

async function getIdByHash(expectedHash, senderAddress) {
  const r = await callReadOnly('get-id-by-hash', [bufferCV(expectedHash)], senderAddress);
  const json = cvToJSON(r);
  return json.value ? BigInt(json.value.value) : null;
}

async function waitForConfirmation(txid) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.tx_status === 'success') return data;
    if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
      throw new Error(`TX failed: ${data.tx_status}`);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`TX not confirmed in time: ${txid}`);
}

export async function inscribeFile({ fileData, mimeType, tokenUri, senderAddress, senderKey }) {
  const chunks = chunkBytes(fileData);
  const batches = batchChunks(chunks);
  const expectedHash = computeExpectedHash(chunks);
  const totalChunks = BigInt(chunks.length);
  const totalSize = BigInt(fileData.length);

  const existing = await getIdByHash(expectedHash, senderAddress);
  if (existing !== null) return { tokenId: existing, alreadyExisted: true };

  const feeUnit = await getFeeUnit(senderAddress);

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

  const beginResult = await broadcastTransaction(beginTx, network);
  if (beginResult.error) throw new Error(`${beginResult.error}: ${beginResult.reason}`);
  await waitForConfirmation(beginResult.txid || beginResult);

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
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });

    const chunkResult = await broadcastTransaction(chunkTx, network);
    if (chunkResult.error) throw new Error(`${chunkResult.error}: ${chunkResult.reason}`);
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, TX_DELAY_MS));
    }
  }

  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'seal-inscription',
    functionArgs: [bufferCV(expectedHash), stringAsciiCV(tokenUri)],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, sealFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const sealResult = await broadcastTransaction(sealTx, network);
  if (sealResult.error) throw new Error(`${sealResult.error}: ${sealResult.reason}`);
  await waitForConfirmation(sealResult.txid || sealResult);

  const tokenId = await getIdByHash(expectedHash, senderAddress);
  return { tokenId, alreadyExisted: false, beginTxid: beginResult.txid, sealTxid: sealResult.txid };
}
```

### Workflow 2: Transfer
```javascript
export async function transferInscription({ tokenId, sender, recipient, senderKey, network }) {
  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'transfer',
    functionArgs: [uintCV(tokenId), principalCV(sender), principalCV(recipient)],
    senderKey,
    network,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  return broadcastTx(tx, network);
}
```

### Workflow 3: Query Metadata + Content
```javascript
export async function getInscriptionMeta(tokenId, senderAddress, network) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-inscription-meta',
    functionArgs: [uintCV(tokenId)],
    senderAddress,
    network
  });
  return cvToJSON(result);
}

export async function readInscriptionContent(tokenId, senderAddress, network) {
  const meta = cvToJSON(await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-inscription-meta',
    functionArgs: [uintCV(tokenId)],
    senderAddress,
    network
  }));

  if (!meta.value) throw new Error('Not found');
  const totalChunks = Number(meta.value.value['total-chunks'].value);
  const chunks = [];

  for (let start = 0; start < totalChunks; start += 50) {
    const indexes = [];
    for (let i = start; i < Math.min(start + 50, totalChunks); i++) {
      indexes.push(uintCV(BigInt(i)));
    }
    const batch = cvToJSON(await callReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'get-chunk-batch',
      functionArgs: [uintCV(tokenId), listCV(indexes)],
      senderAddress,
      network
    }));

    for (const entry of batch.value) {
      if (entry.value) {
        const hex = entry.value.value.startsWith('0x') ? entry.value.value.slice(2) : entry.value.value;
        chunks.push(Buffer.from(hex, 'hex'));
      }
    }
  }

  return Buffer.concat(chunks);
}
```

### Workflow 4: Recursive Seal
- Execute the same begin + upload steps as standard mint.
- Seal call is `seal-recursive(expected-hash, token-uri, dependencies)`.
- Validate dependencies first with `inscription-exists(id)`.

### Workflow 5: Resume Interrupted Upload
```javascript
export async function getUploadState(expectedHash, owner, senderAddress, network) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-upload-state',
    functionArgs: [bufferCV(expectedHash), principalCV(owner)],
    senderAddress,
    network
  });
  return cvToJSON(result);
}

export async function resumeUpload({ expectedHash, allChunks, senderAddress, senderKey, network }) {
  const state = await getUploadState(expectedHash, senderAddress, senderAddress, network);
  if (!state.value) return { resumed: false };

  const uploaded = Number(state.value.value['current-index'].value);
  const remaining = allChunks.slice(uploaded);
  const batches = batchChunks(remaining);

  for (let i = 0; i < batches.length; i++) {
    const tx = await buildAddChunkBatchTx({ expectedHash, chunks: batches[i], senderKey, network });
    await broadcastTx(tx, network);
    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 5000));
  }

  return { resumed: true, uploadedBeforeResume: uploaded };
}
```

## aibtc Integration

### MCP Tool Mapping
| Xtrata need | MCP tool |
|---|---|
| Get wallet address | `wallet_get_address` |
| Check STX balance | `wallet_get_balance` |
| Read-only calls | `stacks_call_read_only` |
| Write contract call | `stacks_call_contract` |
| Broadcast signed tx | `stacks_broadcast_transaction` |
| Poll tx status | `stacks_get_transaction` |

### Autonomous 10-Step Loop
1. Receive instruction to inscribe content.
2. Query wallet balance and enforce minimum requirement.
3. Convert content to bytes, detect MIME, chunk to 16,384-byte pieces.
4. Compute incremental expected hash.
5. Dedupe check (`get-id-by-hash`) or call `begin-or-get` directly.
6. Broadcast begin tx and wait for confirmation.
7. Upload chunk batches (<=50 per tx), delay 5s between txs.
8. Broadcast seal tx with strict post-condition cap.
9. Verify `get-inscription-meta` and final canonical ID.
10. Return `{ tokenId, txids, hash, mimeType, totalSize }` or structured error.

## Error Handling

### Contract Errors and Resolutions
| Error | Cause | Resolution |
|---|---|---|
| `u100 ERR-NOT-AUTHORIZED` | Wrong sender/admin/owner | Verify owner/admin and signer |
| `u101 ERR-NOT-FOUND` | Missing token or upload | Re-check IDs; restart begin if session missing |
| `u102 ERR-INVALID-BATCH` | Invalid chunk counts/sizes | Enforce batch <= 50, chunks <= 2048, size <= 32 MiB |
| `u103 ERR-HASH-MISMATCH` | Local hash differs from on-chain running hash | Recompute and reupload from clean begin |
| `u107 ERR-INVALID-URI` | Token URI invalid | Use non-empty URI <= 256 chars |
| `u109 ERR-PAUSED` | Writes paused | Retry later or use allowlisted caller |
| `u110 ERR-INVALID-FEE` | Admin fee set invalid | Admin-only path |
| `u111 ERR-DEPENDENCY-MISSING` | Recursive dependency absent | Validate dependency IDs before sealing |
| `u112 ERR-EXPIRED` | Session expired | Restart begin and reupload |
| `u113 ERR-NOT-EXPIRED` | Purge too early | Wait until expiry or use abandon flow |
| `u114 ERR-DUPLICATE` | Content already sealed | Query `get-id-by-hash` and reuse canonical token |
| `u115 ERR-ALREADY-SET` | One-time admin setter used | Admin-only path |

### Transaction-Level Failures
- `abort_by_post_condition`: refresh fee-unit and rebuild post-condition caps.
- `ConflictingNonceInMempool`: fetch latest nonce, sequence txs strictly.
- `NotEnoughFunds`: top up STX or reduce operation size.
- HTTP `429`: back off with 15s -> 30s -> 60s -> 120s.

### Exponential Retry Helper
```javascript
export async function withRetry(fn, { maxRetries = 4, baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastErr = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * 2 ** attempt;
        const jitter = Math.floor(delay * (Math.random() * 0.5 - 0.25));
        await new Promise((r) => setTimeout(r, delay + jitter));
      }
    }
  }
  throw lastErr;
}
```

## API Endpoints

### Account
- `GET /v2/accounts/{address}`
- Returns balance + nonce

### Read-only call
- `POST /v2/contracts/call-read/{contract_address}/{contract_name}/{function_name}`
- Body:
```json
{
  "sender": "SP1...",
  "arguments": ["0x..."]
}
```

### Broadcast
- `POST /v2/transactions`
- Body: serialized tx bytes (`application/octet-stream`)

### Transaction status
- `GET /extended/v1/tx/{txid}`

### Clarity Value Constructors
- `uint` -> `uintCV(...)`
- `principal` -> `principalCV(...)`
- `buff` -> `bufferCV(...)`
- `string-ascii` -> `stringAsciiCV(...)`
- `list` -> `listCV(...)`
- `tuple` -> `tupleCV(...)`
- parse responses with `cvToJSON(...)`

## Security Notes
- Never log private keys or seed phrases.
- Always use `PostConditionMode.Deny` on writes.
- Always set STX spend caps on fee-paying operations.
- Run testnet rehearsals before mainnet for new agent logic.
- Log txids and major state transitions for auditability.
- Bound retries and use fallback endpoints under rate limits.

## Companion Scripts
This repository includes runnable references:
- `scripts/xtrata-mint-example.js`
- `scripts/xtrata-transfer-example.js`
- `scripts/xtrata-query-example.js`

These scripts require minimal config (key, network, inputs) and implement this skill file's flow directly.
