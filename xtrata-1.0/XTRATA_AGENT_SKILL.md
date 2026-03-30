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
- Contract name: `xtrata-v3-0-0`
- Full ID: `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-0-0`

Legacy compatibility line:
- `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
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
1. There are two valid mint routes:
   - Core-native single-tx route: `mint-single-tx`, `mint-single-tx-recursive`, or `mint-single-tx-with-relationships`
   - Standard staged route: `begin-or-get` (or `begin-inscription`) -> one or more `add-chunk-batch` -> `seal-inscription` (or `seal-recursive` / `seal-inscription-batch`)
2. Chunking is fixed at 16,384 bytes. Maximum file size is 32 MiB (2,048 chunks).
3. Hashing is incremental SHA-256 chain hashing, not a single hash of full bytes.
4. On-chain dedupe is no longer enforced in `v3`. `get-id-by-hash` is advisory first-seen lookup only, so agents should preflight it to avoid accidental duplicates rather than assume the contract will reject them.
5. Default route selection for first-party-compatible agents:
   - Use core-native single-tx only when chunk count is `1..50` and there is no active staged upload to resume.
   - Use staged route for `>50` chunks or whenever a partial upload already exists.
6. Uploads on the staged route are resumable via `UploadState`; sessions expire after 4,320 blocks.
7. Single-tx retries restart the entire single call; staged-route retries can resume from the next missing chunk.
8. Always use `PostConditionMode.Deny` for fee-paying calls.
9. Transfers and reads still work while writes are paused.

## Contract and Network Reference

### Network Endpoints
- Mainnet primary: `https://stacks-node-api.mainnet.stacks.co`
- Mainnet fallback: `https://api.mainnet.hiro.so`
- Testnet primary: `https://stacks-node-api.testnet.stacks.co`
- Testnet fallback: `https://api.testnet.hiro.so`

### Contract IDs
- Mainnet (active): `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-0-0`
- Mainnet (legacy migration source): `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- Mainnet (legacy migration source): `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1`
- Testnet: deploy from `contracts/live/xtrata-v3.0.0.clar` (no canonical shared testnet deployment is pinned in this repository).

### Constants
| Name | Value | Meaning |
|---|---:|---|
| `MAX-BATCH-SIZE` | `u50` | Max chunks per `add-chunk-batch` |
| `MAX-SEAL-BATCH-SIZE` | `u50` | Max entries per `seal-inscription-batch` |
| `CHUNK-SIZE` | `u16384` | Fixed chunk size |
| `MAX-TOTAL-CHUNKS` | `u2048` | Max chunks per inscription |
| `MAX-TOTAL-SIZE` | `u33554432` | Max bytes (32 MiB) |
| `FEE-MIN` | `u1` | 0.000001 STX |
| `FEE-MAX` | `u1000000` | 1.0 STX |
| `MODE-STAGED` | `u1` | Quote mode for staged uploads |
| `MODE-SINGLE-TX` | `u2` | Quote mode for core-native single-tx mints |
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
| `u114` | `ERR-DUPLICATE` | Duplicate batch item or occupied destination id |
| `u115` | `ERR-ALREADY-SET` | One-time setter already used |
| `u116` | `ERR-PARENT-MISSING` | Parent relationship target missing |
| `u117` | `ERR-PARENT-NOT-OWNED` | Parent relationship target not owned by caller |
| `u118` | `ERR-INVALID-MODE` | Unsupported quote mode |
| `u119` | `ERR-INVALID-BPS` | Invalid fee basis points |

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

The hash is computed as a chain: start with 32 zero bytes, then for each chunk
concatenate the current running hash (32 bytes) with the raw chunk bytes and
SHA-256 the result. The output replaces the running hash. The final value after
all chunks is the `expected-hash` used in `begin-or-get` and `seal-inscription`.

This MUST match the contract's `process-chunk` logic:
`next-hash = sha256(concat(current-hash, data))`

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

Alternative using Node.js built-in crypto:
```javascript
const crypto = require('crypto');

function computeExpectedHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256')
      .update(Buffer.concat([running, chunk])).digest();
  }
  return running;
}
```

### Advisory Hash Lookup
- Read-only lookup: `get-id-by-hash(hash)` -> `(optional uint)`
- Atomic begin+dedupe path: `begin-or-get(...)`
  - `(ok (some id))` -> advisory first-seen id already exists
  - `(ok none)` -> new/resumed upload session

Agents should still do a hash preflight check and require explicit user intent
before minting content that matches an existing advisory id.

### UploadState Lifecycle
1. Create/resume: `begin-or-get` or `begin-inscription`
2. Upload chunks: `add-chunk-batch`
3. Seal: `seal-inscription` or `seal-recursive`
4. Expire after inactivity (`UPLOAD-EXPIRY-BLOCKS`)
5. **Last resort** early expire: `abandon-upload`
6. Purge expired chunks: `purge-expired-chunk-batch`

**Resume is the default recovery path.** If an inscription is interrupted:
- `begin-or-get` is resume-safe: calling it again returns the existing session.
- Check `get-upload-state` to see `current-index` (how many chunks uploaded).
- Resume uploading from the next chunk index.
- The contract validates hashes incrementally — re-uploading the same correct
  data produces the same running hash.
- Sessions persist for 4,320 blocks (~30 days).
- Only use `abandon-upload` when the upload is truly irrecoverable (e.g., wrong
  data was uploaded and the running hash cannot be corrected).

## Complete Contract API (xtrata-v3-0-0)

### Public Functions
| Function | Parameters (exact types) | Returns | Notes |
|---|---|---|---|
| `transfer` | `id: uint, sender: principal, recipient: principal` | `(response bool uint)` | SIP-009 transfer; works while paused |
| `set-fee-recipient` | `recipient: principal` | `(response bool uint)` | Admin only |
| `set-royalty-recipient` | `recipient: principal` | `(response bool uint)` | Compatibility alias for `set-fee-recipient` |
| `set-staged-begin-fee-unit` | `new-fee: uint` | `(response bool uint)` | Admin only |
| `set-staged-seal-fee-unit` | `new-fee: uint` | `(response bool uint)` | Admin only |
| `set-single-tx-fee-unit` | `new-fee: uint` | `(response bool uint)` | Admin only |
| `set-upload-byte-fee-unit` | `new-fee: uint` | `(response bool uint)` | Admin only |
| `set-extra-batch-fee-unit` | `new-fee: uint` | `(response bool uint)` | Admin only |
| `set-fee-unit` | `new-fee: uint` | `(response bool uint)` | Compatibility setter that updates the v3 fee profile |
| `set-wallet-fee-bps` | `wallet: principal, bps: uint` | `(response bool uint)` | Admin only |
| `clear-wallet-fee-bps` | `wallet: principal` | `(response bool uint)` | Admin only |
| `set-wallet-fee-bps-batch` | `entries: (list 200 { wallet: principal, bps: uint })` | `(response bool uint)` | Admin only |
| `set-caller-fee-bps` | `caller: principal, bps: uint` | `(response bool uint)` | Admin only |
| `clear-caller-fee-bps` | `caller: principal` | `(response bool uint)` | Admin only |
| `set-caller-fee-bps-batch` | `entries: (list 200 { caller: principal, bps: uint })` | `(response bool uint)` | Admin only |
| `set-next-id` | `value: uint` | `(response bool uint)` | Admin only; one-time |
| `set-allowed-caller` | `caller: principal, allowed: bool` | `(response bool uint)` | Admin only |
| `set-paused` | `value: bool` | `(response bool uint)` | Admin only |
| `transfer-contract-ownership` | `new-owner: principal` | `(response bool uint)` | Admin only |
| `migrate-from-v1` | `token-id: uint` | `(response uint uint)` | Migrates v1 token into v2 |
| `migrate-from-v2-1-0` | `token-id: uint` | `(response uint uint)` | Migrates v2.1.0 token into v3 |
| `migrate-from-v2-1-1` | `token-id: uint` | `(response uint uint)` | Migrates v2.1.1 token into v3 |
| `begin-or-get` | `expected-hash: (buff 32), mime: (string-ascii 64), total-size: uint, total-chunks: uint` | `(response (optional uint) uint)` | Recommended begin path |
| `begin-inscription` | `expected-hash: (buff 32), mime: (string-ascii 64), total-size: uint, total-chunks: uint` | `(response bool uint)` | Resume-safe; rejects duplicates |
| `abandon-upload` | `expected-hash: (buff 32)` | `(response bool uint)` | Marks session expired for purge |
| `purge-expired-chunk-batch` | `hash: (buff 32), owner: principal, indexes: (list 50 uint)` | `(response bool uint)` | Permissionless expired cleanup |
| `add-chunk-batch` | `hash: (buff 32), chunks: (list 50 (buff 16384))` | `(response bool uint)` | No protocol fee |
| `seal-inscription` | `expected-hash: (buff 32), token-uri-string: (string-ascii 256)` | `(response uint uint)` | Mints token |
| `seal-inscription-batch` | `items: (list 50 { hash: (buff 32), token-uri: (string-ascii 256) })` | `(response { start: uint, count: uint } uint)` | Batch seal |
| `seal-recursive` | `expected-hash: (buff 32), token-uri-string: (string-ascii 256), dependencies: (list 50 uint)` | `(response uint uint)` | Seal with dependencies |
| `seal-with-relationships` | `expected-hash: (buff 32), token-uri-string: (string-ascii 256), dependencies: (list 50 uint), parents: (list 50 uint)` | `(response uint uint)` | Seal with dependencies and parent links |
| `mint-single-tx` | `expected-hash: (buff 32), mime: (string-ascii 64), total-size: uint, chunks: (list 50 (buff 16384)), token-uri-string: (string-ascii 256)` | `(response uint uint)` | Core-native single-call mint |
| `mint-single-tx-recursive` | `expected-hash: (buff 32), mime: (string-ascii 64), total-size: uint, chunks: (list 50 (buff 16384)), token-uri-string: (string-ascii 256), dependencies: (list 50 uint)` | `(response uint uint)` | Single-call recursive mint |
| `mint-single-tx-with-relationships` | `expected-hash: (buff 32), mime: (string-ascii 64), total-size: uint, chunks: (list 50 (buff 16384)), token-uri-string: (string-ascii 256), dependencies: (list 50 uint), parents: (list 50 uint)` | `(response uint uint)` | Single-call mint with dependencies and parent links |

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
| `get-migration-source` | `id: uint` | `(optional { source-contract: principal, source-id: uint })` |
| `get-mint-origin` | `id: uint` | `(optional principal)` |
| `quote-inscription-fee` | `payer: principal, caller: (optional principal), total-size: uint, total-chunks: uint, mode: uint` | `(response { resolved-bps: uint, policy-source: uint, begin-fee: uint, seal-fee: uint, single-tx-fee: uint, size-fee: uint, extra-batches: uint, extra-batch-fee: uint, total-fee: uint } uint)` |
| `get-admin` | none | `(response principal uint)` |
| `is-allowed-caller` | `caller: principal` | `(response bool uint)` |
| `get-fee-recipient` | none | `(response principal uint)` |
| `get-royalty-recipient` | none | `(response principal uint)` |
| `get-fee-unit` | none | `(response uint uint)` |
| `get-begin-fee-unit` | none | `(response uint uint)` |
| `get-upload-chunk-fee-unit` | none | `(response uint uint)` |
| `get-upload-batch-fee-unit` | none | `(response uint uint)` |
| `get-seal-fee-unit` | none | `(response uint uint)` |
| `get-single-tx-fee-unit` | none | `(response uint uint)` |
| `get-upload-byte-fee-unit` | none | `(response uint uint)` |
| `get-extra-batch-fee-unit` | none | `(response uint uint)` |
| `get-wallet-fee-bps` | `wallet: principal` | `(optional uint)` |
| `get-caller-fee-bps` | `caller: principal` | `(optional uint)` |
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
const CONTRACT_NAME = 'xtrata-v3-0-0';
const TX_DELAY_MS = 5000;
```

### Fee Model
- `v3` should be quoted with `quote-inscription-fee`, not derived from `get-fee-unit()` heuristics.
- staged route total = `begin-fee + seal-fee`
- single-tx route total = `single-tx-fee`
- returned quote already includes size fee, extra batch fee, and fee-policy overrides

```javascript
export async function quoteFees({ payer, caller = null, totalSize, totalChunks, mode, senderAddress, network }) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'quote-inscription-fee',
    functionArgs: [
      principalCV(payer),
      caller ? someCV(principalCV(caller)) : noneCV(),
      uintCV(totalSize),
      uintCV(totalChunks),
      uintCV(mode === 'single-tx' ? 2n : 1n)
    ],
    senderAddress,
    network
  });

  return cvToJSON(result);
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

Legacy note:
- Some helper-contract examples below are retained for older `v2` compatibility
  and MCP troubleshooting history.
- For active `v3` automation, prefer `quote-inscription-fee` plus the core-native
  `mint-single-tx*` functions over `xtrata-small-mint-v1-0`.

### Workflow 1: Route Selection
- Use the core-native single-tx route when all of the following are true:
  - `chunks.length` is between `1` and `50`
  - there is no existing staged upload to resume for `{ expected-hash, owner }`
- Use the staged route for everything else.
- If an agent is driving the first-party app or wallet flow instead of raw
  contract calls, expect one wallet approval on the single-tx route and multiple
  approvals (`begin`, upload batch txs, `seal`) on the staged route.

### Workflow 1A: Core-Native Single-Tx Mint
```javascript
import { sha256 } from '@noble/hashes/sha256';
import {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  bufferCV,
  noneCV,
  principalCV,
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
const CONTRACT_NAME = 'xtrata-v3-0-0';
const MAX_SINGLE_TX_CHUNKS = 50;
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

async function quoteInscriptionFee(senderAddress, totalSize, totalChunks, mode) {
  const r = await callReadOnly(
    'quote-inscription-fee',
    [
      principalCV(senderAddress),
      noneCV(),
      uintCV(totalSize),
      uintCV(totalChunks),
      uintCV(mode === 'single-tx' ? 2n : 1n)
    ],
    senderAddress
  );
  const quote = cvToJSON(r).value.value;
  return {
    beginFee: BigInt(quote['begin-fee'].value),
    sealFee: BigInt(quote['seal-fee'].value),
    singleTxFee: BigInt(quote['single-tx-fee'].value),
    totalFee: BigInt(quote['total-fee'].value)
  };
}

async function getIdByHash(expectedHash, senderAddress) {
  const r = await callReadOnly('get-id-by-hash', [bufferCV(expectedHash)], senderAddress);
  const json = cvToJSON(r);
  return json.value ? BigInt(json.value.value) : null;
}

async function getUploadState(expectedHash, owner, senderAddress) {
  const r = await callReadOnly(
    'get-upload-state',
    [bufferCV(expectedHash), principalCV(owner)],
    senderAddress
  );
  return cvToJSON(r);
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

export async function inscribeFile({ fileData, mimeType, tokenUri, dependencies = [], senderAddress, senderKey }) {
  const chunks = chunkBytes(fileData);
  const expectedHash = computeExpectedHash(chunks);
  const totalChunks = BigInt(chunks.length);
  const totalSize = BigInt(fileData.length);

  const existing = await getIdByHash(expectedHash, senderAddress);
  if (existing !== null) return { tokenId: existing, alreadyExisted: true };

  const uploadState = await getUploadState(expectedHash, senderAddress, senderAddress);
  const canUseSingleTx =
    chunks.length > 0 &&
    chunks.length <= MAX_SINGLE_TX_CHUNKS &&
    !uploadState.value;
  const feeQuote = await quoteInscriptionFee(
    senderAddress,
    totalSize,
    totalChunks,
    canUseSingleTx ? 'single-tx' : 'staged'
  );

  if (!canUseSingleTx) {
    return inscribeFileStaged({
      chunks,
      expectedHash,
      fileData,
      mimeType,
      tokenUri,
      dependencies,
      senderAddress,
      senderKey,
      feeQuote
    });
  }

  const mintTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName:
      dependencies.length > 0
        ? 'mint-single-tx-recursive'
        : 'mint-single-tx',
    functionArgs:
      dependencies.length > 0
        ? [
            bufferCV(expectedHash),
            stringAsciiCV(mimeType),
            uintCV(totalSize),
            listCV(chunks.map((chunk) => bufferCV(chunk))),
            stringAsciiCV(tokenUri),
            listCV(dependencies.map((id) => uintCV(id)))
          ]
        : [
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
        feeQuote.totalFee
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const mintResult = await broadcastTransaction(mintTx, network);
  if (mintResult.error) throw new Error(`${mintResult.error}: ${mintResult.reason}`);
  await waitForConfirmation(mintResult.txid || mintResult);

  const tokenId = await getIdByHash(expectedHash, senderAddress);
  return { tokenId, alreadyExisted: false, txid: mintResult.txid, route: 'single-tx' };
}
```

### Workflow 1B: Standard Staged Mint (begin -> upload -> seal)
```javascript
export async function inscribeFileStaged({
  chunks,
  expectedHash,
  fileData,
  mimeType,
  tokenUri,
  dependencies = [],
  senderAddress,
  senderKey,
  feeQuote
}) {
  const batches = batchChunks(chunks);
  const totalChunks = BigInt(chunks.length);
  const totalSize = BigInt(fileData.length);

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
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, feeQuote.beginFee)
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
    await waitForConfirmation(chunkResult.txid || chunkResult);
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, TX_DELAY_MS));
    }
  }

  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: dependencies.length > 0 ? 'seal-recursive' : 'seal-inscription',
    functionArgs:
      dependencies.length > 0
        ? [
            bufferCV(expectedHash),
            stringAsciiCV(tokenUri),
            listCV(dependencies.map((id) => uintCV(id)))
          ]
        : [bufferCV(expectedHash), stringAsciiCV(tokenUri)],
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(senderAddress, FungibleConditionCode.LessEqual, feeQuote.sealFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const sealResult = await broadcastTransaction(sealTx, network);
  if (sealResult.error) throw new Error(`${sealResult.error}: ${sealResult.reason}`);
  await waitForConfirmation(sealResult.txid || sealResult);

  const tokenId = await getIdByHash(expectedHash, senderAddress);
  return {
    tokenId,
    alreadyExisted: false,
    beginTxid: beginResult.txid,
    sealTxid: sealResult.txid,
    route: 'staged'
  };
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
- Single-tx route: `mint-single-tx-recursive(...)` when `chunks <= 50` and
  no staged upload exists yet.
- Staged route: execute the same begin + upload steps as standard mint, then
  call `seal-recursive(expected-hash, token-uri, dependencies)`.
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

Resume applies to the staged route only. If `get-upload-state` returns an active
session, do not switch that mint attempt onto the single-tx route.

## aibtc Integration

### MCP Tool Mapping (aibtc)
| Xtrata need | aibtc MCP tool |
|---|---|
| Get wallet address | `get_wallet_info` |
| Check STX balance | `get_stx_balance` |
| Read-only calls | `call_read_only_function` |
| Write contract call | `call_contract` |
| Broadcast signed tx | `broadcast_transaction` |
| Poll tx status | `get_transaction_status` |

### aibtc Routing Notes
- If the first-party app auto-selects the single-tx route, expect a single wallet
  approval and a single submitted tx, not separate begin/upload/seal prompts.
- If the first-party app does not select the single-tx route, expect the staged
  sequence and wait for each tx to confirm before watching for the next prompt.
- Direct MCP `call_contract` remains unsafe for any call that carries chunk data
  in `list(buff)` arguments. That includes:
  - `add-chunk-batch`
  - `mint-single-tx`
  - `mint-single-tx-recursive`
  - `mint-single-tx-with-relationships`
- For aibtc agents, use MCP for read-only checks and balance/status polling, but
  use a direct `@stacks/transactions` signing path for chunk-bearing writes.

### Autonomous 10-Step Loop
1. Receive instruction to inscribe content.
2. Query wallet balance and enforce minimum requirement.
3. Convert content to bytes, detect MIME, chunk to 16,384-byte pieces.
4. Compute incremental expected hash.
5. Dedupe check with `get-id-by-hash`, then query `get-upload-state(expected-hash, owner)`.
6. If chunk count is `1..50` and no upload state exists, send one core-native single-tx mint with the quoted spend cap.
7. Otherwise send staged begin tx and wait for confirmation.
8. On staged flow, upload chunk batches (<=50 per tx), wait for each batch to confirm before proceeding, then seal with the strict spend cap.
9. Verify `get-inscription-meta` and final canonical ID.
10. Return `{ tokenId, txids, hash, mimeType, totalSize, route }` or structured error.

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
| `u114 ERR-DUPLICATE` | Duplicate batch item or occupied migration target | Rebuild the batch or re-check destination id assumptions |
| `u115 ERR-ALREADY-SET` | One-time admin setter used | Admin-only path |
| `u116 ERR-PARENT-MISSING` | Parent relationship target absent | Validate parent IDs before sealing |
| `u117 ERR-PARENT-NOT-OWNED` | Parent relationship target not owned by caller | Restrict parent links to caller-owned tokens |
| `u118 ERR-INVALID-MODE` | Unsupported quote mode | Use `u1` for staged or `u2` for single-tx |
| `u119 ERR-INVALID-BPS` | Invalid fee basis points | Admin-only path |

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
- [`scripts/xtrata-mint-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-mint-example.js)
- [`scripts/xtrata-transfer-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-transfer-example.js)
- [`scripts/xtrata-query-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-query-example.js)

These scripts require minimal config (key, network, inputs) and implement this skill file's flow directly.
