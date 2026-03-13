---
name: xtrata-batch-mint
description: >
  Teach an AI agent to batch mint coordinated multi-file drops on Stacks via
  Xtrata. Covers the core staged upload plus seal-inscription-batch flow and
  the collection staged upload plus mint-seal-batch flow. Excludes recursive
  batch minting because the current contracts do not support it. Includes
  complete transaction construction code.
version: "2.0"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
standalone: true
---

# Xtrata Batch Mint Skill

## 1. Scope

Use this skill when the job is a coordinated drop of multiple files that should
mint in one final batch seal transaction.

Supported:
- Core path: staged uploads into Xtrata core, then `seal-inscription-batch`.
- Collection path: staged uploads into a collection mint contract, then `mint-seal-batch`.

Not supported:
- Recursive batch minting. `seal-inscription-batch` does not accept dependencies.
- Multi-file helper minting. `mint-small-single-tx` is still single-item only.

If any item needs dependencies, remove it from the batch and mint it separately
using `skill-inscribe`.

## 2. Contract Facts

| Key | Value |
|-----|-------|
| Core contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Batch seal function | `seal-inscription-batch` |
| Collection batch function | `mint-seal-batch` |
| Upload batch size | max `50` chunks per `add-chunk-batch` / `mint-add-chunk-batch` |
| Final batch size | max `50` items per `seal-inscription-batch` / `mint-seal-batch` |
| Small helper | `mint-small-single-tx` is single-item only |
| Recursive limit | batch flow is non-recursive only |
| CHUNK-SIZE | 16,384 bytes |
| MAX-TOTAL-CHUNKS | 2,048 per inscription |
| MAX-TOTAL-SIZE | 32 MiB per inscription |
| UPLOAD-EXPIRY | 4,320 blocks (~30 days) |
| MIME limit | string-ascii 64 |
| Token URI limit | string-ascii 256 |

## 3. Required Imports

```js
const {
  makeContractCall, broadcastTransaction, callReadOnlyFunction,
  bufferCV, uintCV, listCV, tupleCV, stringAsciiCV,
  principalCV, makeStandardSTXPostCondition,
  FungibleConditionCode, PostConditionMode, AnchorMode,
  cvToJSON, getNonce
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');
const crypto = require('crypto');

const network = new StacksMainnet();
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const CHUNK_SIZE = 16_384;
```

## 4. Core Utilities

```js
function chunkBytes(data) {
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE)
    chunks.push(data.slice(i, i + CHUNK_SIZE));
  return chunks;
}

function computeHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256')
      .update(Buffer.concat([running, chunk]))
      .digest();
  }
  return running;
}

async function readOnly(fn, args, sender) {
  const r = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
    functionName: fn, functionArgs: args, senderAddress: sender, network
  });
  return cvToJSON(r);
}

async function getFeeUnit(sender) {
  const r = await readOnly('get-fee-unit', [], sender);
  return BigInt(r.value.value);
}

async function getIdByHash(hash, sender) {
  const r = await readOnly('get-id-by-hash', [bufferCV(hash)], sender);
  return r.value ? BigInt(r.value.value) : null;
}

async function waitForTx(txid) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.tx_status === 'success') return data;
    if (data.tx_status === 'abort_by_response' ||
        data.tx_status === 'abort_by_post_condition')
      throw new Error(`TX failed: ${data.tx_status}`);
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error(`TX not confirmed in time: ${txid}`);
}
```

## 5. Ordered Manifest Discipline

Batch minting must start from a stable ordered manifest. The item order becomes
the canonical mapping from request order to minted token IDs.

```json
{
  "route": "core-batch-seal",
  "items": [
    { "path": "./assets/map-01.png", "mime": "image/png", "tokenUri": "ipfs://..." },
    { "path": "./assets/key-01.json", "mime": "application/json", "tokenUri": "ipfs://..." }
  ]
}
```

Rules:
- Keep request order stable.
- Deduplicate identical hashes before staging.
- Do not include recursive dependencies in a batch manifest.
- Do not exceed `50` items after dedupe.

## 6. Preflight and User Confirmation

Before any write:

1. Read every file.
2. Chunk each file into `16,384` byte slices.
3. Compute the incremental Xtrata hash for each file.
4. Run `get-id-by-hash` for each file and remove already-minted duplicates.
5. Fetch `get-fee-unit` from the core contract.
6. Build a deterministic execution plan.
7. Present the cost and route summary to the user.
8. Proceed only after explicit confirmation.

## 7. Fee Model

Each item pays the same core protocol economics as an individual mint:
- begin fee = `feeUnit` per item
- seal fee = `feeUnit * (1n + ((totalChunks + 49n) / 50n))` per item

```js
function estimateBatchFees(items, feeUnit) {
  let totalBegin = 0n;
  let totalSeal = 0n;
  for (const item of items) {
    const chunks = BigInt(item.totalChunks);
    totalBegin += feeUnit;
    totalSeal += feeUnit * (1n + ((chunks + 49n) / 50n));
  }
  return { totalBegin, totalSeal, grandTotal: totalBegin + totalSeal };
}
```

## 8. Core Batch Flow

For each item in manifest order:

```js
async function stageItem(item, senderAddress, senderKey, feeUnit) {
  // Check duplicate
  const existing = await getIdByHash(item.expectedHash, senderAddress);
  if (existing !== null) return { tokenId: existing, existed: true };

  // Begin
  const beginTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
    functionName: 'begin-or-get',
    functionArgs: [
      bufferCV(item.expectedHash), stringAsciiCV(item.mime),
      uintCV(item.totalSize), uintCV(item.totalChunks)
    ],
    senderKey, network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress, FungibleConditionCode.LessEqual, feeUnit)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const beginR = await broadcastTransaction(beginTx, network);
  if (beginR.error) throw new Error(`${beginR.error}: ${beginR.reason}`);
  await waitForTx(beginR.txid || beginR);

  // Upload chunks in batches of 50
  for (let i = 0; i < item.chunks.length; i += 50) {
    const batch = item.chunks.slice(i, i + 50);
    const chunkTx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
      functionName: 'add-chunk-batch',
      functionArgs: [bufferCV(item.expectedHash),
                     listCV(batch.map(c => bufferCV(c)))],
      senderKey, network,
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
    const chunkR = await broadcastTransaction(chunkTx, network);
    if (chunkR.error) throw new Error(`${chunkR.error}: ${chunkR.reason}`);
    await waitForTx(chunkR.txid || chunkR);
  }

  return { staged: true };
}
```

After every item is fully staged, send one batch seal:

```js
async function batchSeal(items, senderAddress, senderKey, feeUnit) {
  let totalSealFee = 0n;
  for (const item of items) {
    totalSealFee += feeUnit * (1n + ((item.totalChunks + 49n) / 50n));
  }

  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
    functionName: 'seal-inscription-batch',
    functionArgs: [
      listCV(items.map(item => tupleCV({
        'hash': bufferCV(item.expectedHash),
        'token-uri': stringAsciiCV(item.tokenUri)
      })))
    ],
    senderKey, network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress, FungibleConditionCode.LessEqual, totalSealFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const sealR = await broadcastTransaction(sealTx, network);
  if (sealR.error) throw new Error(`${sealR.error}: ${sealR.reason}`);
  const data = await waitForTx(sealR.txid || sealR);
  return { txid: sealR.txid, data };
}
```

Map returned `{ start, count }` deterministically:
- first manifest item -> token ID `start`
- second manifest item -> token ID `start + 1`
- and so on for `count` items

## 9. Collection Batch Flow

Collection batch minting adds phase accounting and mint pricing.

For each item in manifest order:
1. Check duplicate state on the core contract.
2. Ensure the collection phase allows the item to reserve a mint session.
3. Call `mint-begin` for items without an active session.
4. Resume any existing session.
5. Upload chunks with `mint-add-chunk-batch` until complete.
6. Wait for every upload transaction to confirm.

Before the final seal:
7. Confirm `default-dependencies` is empty. `mint-seal-batch` rejects batch jobs when default dependencies are configured.
8. Sum all session `mint-price` values.
9. Call `mint-seal-batch` once with the ordered `{ hash, token-uri }` list.
10. Verify the returned `{ start, count }` token range.

## 10. Resume Rules

- Duplicate before staging: skip and keep canonical token ID.
- Active upload state: resume from `current-index`.
- Expired session: restart from `begin-or-get`.
- Duplicate race before final seal: rebuild batch against fresh chain state.
- Recursive requirement discovered mid-plan: abort batch, mint those items individually.

## 11. Error Codes

| Code | Name | Resolution |
|---:|---|---|
| `u100` | ERR-NOT-AUTHORIZED | Verify signer |
| `u101` | ERR-NOT-FOUND | Session missing — restart begin |
| `u102` | ERR-INVALID-BATCH | Batch > 50 items or chunks > 2048 |
| `u103` | ERR-HASH-MISMATCH | Recompute hash, restart item |
| `u107` | ERR-INVALID-URI | Non-empty URI <= 256 ASCII chars |
| `u109` | ERR-PAUSED | Retry later |
| `u112` | ERR-EXPIRED | Session expired — restart begin |
| `u114` | ERR-DUPLICATE | Use canonical token via `get-id-by-hash` |

## 12. AIBTC MCP Tool Note

**CRITICAL:** MCP `call_contract` may send empty buffers for `list(buff)`
arguments. Use the `@stacks/transactions` SDK directly for `add-chunk-batch`
and `mint-add-chunk-batch`.

Safe through MCP: `begin-or-get`, `seal-inscription-batch`, `mint-begin`,
`mint-seal-batch`, and all read-only calls.

## 13. Structured Result

```json
{
  "route": "core-batch-seal",
  "requestedCount": 12,
  "mintedCount": 10,
  "duplicateCount": 2,
  "tokenIds": [4001, 4002, 4003],
  "txids": ["0x..."],
  "totalSpend": "2.4 STX"
}
```

## 14. Operational Notes

- Keep batch size at `1..50` items.
- Do not mix recursive and non-recursive in one batch.
- Do not batch-seal until every item is fully uploaded.
- Preserve manifest ordering for deterministic token ID mapping.
- Use the SDK for chunk-buffer writes.
- Log all tx IDs and hash-to-token mappings.
