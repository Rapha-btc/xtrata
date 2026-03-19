---
name: xtrata-inscribe
description: >
  Teach any AI agent to inscribe one item on Stacks (Bitcoin L2) via the Xtrata
  protocol. Covers both the small helper single-tx route and the staged
  begin/upload/seal flow. Includes cost estimation, user confirmation gate,
  and complete transaction construction code. Multi-item batch jobs are
  handled by `skill-batch-mint`.
version: "2.0"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
standalone: true
---

# Xtrata Inscription Skill

## 1. Scope

This skill is for one-item minting.

Use it when the request is a single file that should become one inscription.
If the request is a coordinated drop of multiple files, hand off to
`skill-batch-mint`.

## 2. Protocol Overview

Xtrata is a contract-native inscription protocol on Stacks (Bitcoin L2). Data is
split into fixed 16,384-byte chunks, uploaded on-chain, then sealed into a
SIP-009 NFT. Content is deduplicated by hash — identical data always resolves to
one canonical token.

## 3. Contract Reference

| Key | Value |
|-----|-------|
| Contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Small helper | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0` |
| CHUNK-SIZE | 16,384 bytes |
| MAX-BATCH-SIZE | 50 chunks per `add-chunk-batch` |
| MAX-SMALL-MINT-CHUNKS | 30 chunks per helper call |
| MAX-TOTAL-CHUNKS | 2,048 |
| MAX-TOTAL-SIZE | 32 MiB |
| FEE-MIN | 0.001 STX |
| FEE-MAX | 1.0 STX |
| UPLOAD-EXPIRY | 4,320 blocks (~30 days) |
| MIME limit | string-ascii 64 |
| Token URI limit | string-ascii 256 |

Network endpoints:
- Mainnet: `https://stacks-node-api.mainnet.stacks.co`
- Fallback: `https://api.mainnet.hiro.so`

## 4. Required Imports

```js
const {
  makeContractCall, broadcastTransaction, callReadOnlyFunction,
  bufferCV, uintCV, listCV, stringAsciiCV, contractPrincipalCV,
  principalCV, makeStandardSTXPostCondition,
  FungibleConditionCode, PostConditionMode, AnchorMode,
  cvToJSON, getNonce
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');
const crypto = require('crypto');

const network = new StacksMainnet();
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_NAME = 'xtrata-small-mint-v1-0';
const CHUNK_SIZE = 16_384;
const MAX_HELPER_CHUNKS = 30;
```

## 5. Chunking

```js
function chunkBytes(data) {
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE)
    chunks.push(data.slice(i, i + CHUNK_SIZE));
  return chunks;
}
```

## 6. Incremental Hashing

Xtrata uses an incremental SHA-256 chain — not a single hash of the full file.
Start with 32 zero bytes. For each chunk, concatenate the running hash with the
raw chunk bytes and SHA-256 the result.

```js
function computeHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256')
      .update(Buffer.concat([running, chunk]))
      .digest();
  }
  return running;
}
```

This must match what the contract computes in `process-chunk`. Get it wrong and
you will hit error `u103 HASH-MISMATCH`.

## 7. Read-Only Helpers

```js
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

async function getUploadState(hash, owner, sender) {
  return readOnly('get-upload-state',
    [bufferCV(hash), principalCV(owner)], sender);
}
```

## 8. Fee Model

Protocol fees are denominated in microSTX. Always fetch the current rate:

- begin fee = `feeUnit` microSTX
- seal fee = `feeUnit * (1n + ((totalChunks + 49n) / 50n))` microSTX
- helper spend cap = `begin fee + seal fee` in one deny-mode post-condition
- network fees are separate and vary with mempool conditions

```js
function estimateFees(totalChunks, feeUnit) {
  const batches = (totalChunks + 49n) / 50n;
  const beginFee = feeUnit;
  const sealFee = feeUnit * (1n + batches);
  return { beginFee, sealFee, totalFee: beginFee + sealFee };
}
```

## 9. Transaction Confirmation

```js
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

## 10. Pre-Inscription Planning and User Confirmation

Before sending any transaction, the agent must present the plan and get explicit
user confirmation.

1. Read the file.
2. Compute size, chunk count, MIME type, and incremental hash.
3. Fetch live `fee-unit`.
4. Decide route:
   - helper single-tx when one item, `1..30` chunks, helper exists, and there is no resumable staged upload
   - staged flow otherwise
5. Present route, cost estimate, and hash to the user.
6. Proceed only after explicit confirmation.

If the user cancels, stop immediately.

## 11. Deduplication Check

Before beginning, check whether the content already exists on-chain:

```js
const existing = await getIdByHash(expectedHash, senderAddress);
if (existing !== null) {
  console.log(`Content already exists as token ${existing}`);
  return { tokenId: existing, existed: true };
}
```

## 12. Mint Route Selection

Use the helper route only when all of the following are true:
- helper deployment is available
- there is exactly one item to mint
- chunk count is `1..30`
- there is no active upload state to resume for `{hash, owner}`

Otherwise use the staged route.

## 13. Helper Route

The helper compresses begin, upload, and seal into one transaction.

```js
async function helperMint({
  chunks, expectedHash, mime, totalSize, tokenUri,
  dependencies, senderAddress, senderKey, feeUnit
}) {
  const totalChunks = BigInt(chunks.length);
  const { totalFee } = estimateFees(totalChunks, feeUnit);
  const isRecursive = dependencies && dependencies.length > 0;

  const functionArgs = [
    contractPrincipalCV(CONTRACT_ADDRESS, CONTRACT_NAME),
    bufferCV(expectedHash),
    stringAsciiCV(mime),
    uintCV(totalSize),
    listCV(chunks.map(c => bufferCV(c))),
    stringAsciiCV(tokenUri),
    ...(isRecursive ? [listCV(dependencies.map(id => uintCV(id)))] : [])
  ];

  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: HELPER_NAME,
    functionName: isRecursive
      ? 'mint-small-single-tx-recursive'
      : 'mint-small-single-tx',
    functionArgs,
    senderKey,
    network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress, FungibleConditionCode.LessEqual, totalFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (result.error) throw new Error(`${result.error}: ${result.reason}`);
  await waitForTx(result.txid || result);
  const tokenId = await getIdByHash(expectedHash, senderAddress);
  return { tokenId, existed: false, route: 'helper', txid: result.txid };
}
```

Recursive variant:
- use `mint-small-single-tx-recursive` only for one-item recursive mints
- do not project recursive support onto batch jobs

## 14. Staged Route

The staged route remains the default for larger one-item uploads and for any
single-item job that must be resumed.

```js
async function stagedMint({
  chunks, expectedHash, mime, totalSize, tokenUri,
  dependencies, senderAddress, senderKey, feeUnit
}) {
  const totalChunks = BigInt(chunks.length);
  const { beginFee, sealFee } = estimateFees(totalChunks, feeUnit);

  // Step 1: begin-or-get
  const beginTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'begin-or-get',
    functionArgs: [
      bufferCV(expectedHash), stringAsciiCV(mime),
      uintCV(totalSize), uintCV(totalChunks)
    ],
    senderKey, network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress, FungibleConditionCode.LessEqual, beginFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const beginResult = await broadcastTransaction(beginTx, network);
  if (beginResult.error) throw new Error(`${beginResult.error}: ${beginResult.reason}`);
  await waitForTx(beginResult.txid || beginResult);

  // Step 2: upload chunks in batches of 50
  for (let i = 0; i < chunks.length; i += 50) {
    const batch = chunks.slice(i, i + 50);
    const chunkTx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'add-chunk-batch',
      functionArgs: [bufferCV(expectedHash), listCV(batch.map(c => bufferCV(c)))],
      senderKey, network,
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
    const chunkResult = await broadcastTransaction(chunkTx, network);
    if (chunkResult.error) throw new Error(`${chunkResult.error}: ${chunkResult.reason}`);
    await waitForTx(chunkResult.txid || chunkResult);
  }

  // Step 3: seal
  const isRecursive = dependencies && dependencies.length > 0;
  const sealTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: isRecursive ? 'seal-recursive' : 'seal-inscription',
    functionArgs: isRecursive
      ? [bufferCV(expectedHash), stringAsciiCV(tokenUri),
         listCV(dependencies.map(id => uintCV(id)))]
      : [bufferCV(expectedHash), stringAsciiCV(tokenUri)],
    senderKey, network,
    postConditions: [
      makeStandardSTXPostCondition(
        senderAddress, FungibleConditionCode.LessEqual, sealFee)
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const sealResult = await broadcastTransaction(sealTx, network);
  if (sealResult.error) throw new Error(`${sealResult.error}: ${sealResult.reason}`);
  await waitForTx(sealResult.txid || sealResult);

  const tokenId = await getIdByHash(expectedHash, senderAddress);
  return { tokenId, existed: false, route: 'staged',
           beginTxid: beginResult.txid, sealTxid: sealResult.txid };
}
```

## 15. Resume Rules

Xtrata staged uploads are resume-safe.

1. Call `get-upload-state(expected-hash, owner)`.
2. Read `current-index`.
3. Restart upload from the next missing chunk.
4. Seal only after all chunks are confirmed on-chain.
5. Do not switch an active staged upload onto the helper route mid-attempt.

```js
async function resumeUpload(expectedHash, allChunks, senderAddress, senderKey) {
  const state = await getUploadState(expectedHash, senderAddress, senderAddress);
  if (!state.value) return { resumed: false };
  const uploaded = Number(state.value.value['current-index'].value);
  const remaining = allChunks.slice(uploaded);
  for (let i = 0; i < remaining.length; i += 50) {
    const batch = remaining.slice(i, i + 50);
    const tx = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
      functionName: 'add-chunk-batch',
      functionArgs: [bufferCV(expectedHash), listCV(batch.map(c => bufferCV(c)))],
      senderKey, network,
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
    const r = await broadcastTransaction(tx, network);
    if (r.error) throw new Error(`${r.error}: ${r.reason}`);
    await waitForTx(r.txid || r);
  }
  return { resumed: true, uploadedBefore: uploaded };
}
```

## 16. Error Codes

| Code | Name | Resolution |
|---:|---|---|
| `u100` | ERR-NOT-AUTHORIZED | Verify signer is the upload owner |
| `u101` | ERR-NOT-FOUND | Token/session missing — restart begin |
| `u102` | ERR-INVALID-BATCH | Enforce batch <= 50, chunks <= 2048 |
| `u103` | ERR-HASH-MISMATCH | Recompute hash and restart |
| `u107` | ERR-INVALID-URI | Non-empty URI <= 256 ASCII chars |
| `u109` | ERR-PAUSED | Retry later |
| `u111` | ERR-DEPENDENCY-MISSING | Validate dependency IDs first |
| `u112` | ERR-EXPIRED | Session expired — restart begin |
| `u114` | ERR-DUPLICATE | Use `get-id-by-hash` to reuse existing token |

Transaction-level failures:
- `abort_by_post_condition`: refresh fee-unit and rebuild spend caps
- `ConflictingNonceInMempool`: fetch latest nonce, sequence strictly
- `NotEnoughFunds`: top up STX
- HTTP `429`: back off 15s -> 30s -> 60s -> 120s

## 17. AIBTC MCP Tool Note

AIBTC agents can use MCP tools (`call_read_only_function`, `get_stx_balance`,
`get_transaction_status`) for reads and status checks.

**CRITICAL:** MCP `call_contract` may send empty buffers for `list(buff)`
arguments. Use the `@stacks/transactions` SDK directly for:
- `add-chunk-batch`
- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

The empty-buffer hash fingerprint is:
`66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925`

If your running hash matches that value, the tool sent empty data.

## 18. Structured Result

Return something shaped like:

```json
{
  "route": "helper | staged",
  "tokenId": 1234,
  "existed": false,
  "expectedHash": "0x...",
  "mimeType": "text/html",
  "totalSize": 9876,
  "totalChunks": 1,
  "dependencies": [],
  "txids": ["0x..."]
}
```

## 19. Operational Notes

- Use `PostConditionMode.Deny` on fee-paying writes.
- Keep retries bounded and back off on `429` / `5xx` responses.
- Log tx IDs, expected hash, token ID, route, and total fees.
- If the task becomes multi-item, switch to `skill-batch-mint`.
