---
name: xtrata-inscribe
description: >
  Teach any AI agent to inscribe data on Stacks (Bitcoin L2) via the Xtrata
  protocol. Covers the complete 3-step flow: begin, upload chunks, seal as
  SIP-009 NFT. Includes cost estimation and user confirmation gate.
version: "1.0"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
---

# Xtrata Inscription Skill

## 1. Protocol Overview

Xtrata is a contract-native inscription protocol on Stacks (Bitcoin L2). Data is
split into fixed 16,384-byte chunks, uploaded on-chain, then sealed into a
SIP-009 NFT. Content is deduplicated by hash — identical data always resolves to
one canonical token.

## 2. Contract Reference

| Key | Value |
|-----|-------|
| Contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| CHUNK-SIZE | 16,384 bytes |
| MAX-BATCH-SIZE | 50 chunks per `add-chunk-batch` |
| MAX-TOTAL-CHUNKS | 2,048 |
| MAX-TOTAL-SIZE | 32 MiB |
| FEE-MIN | 0.001 STX |
| FEE-MAX | 1.0 STX |
| UPLOAD-EXPIRY | 4,320 blocks (~30 days) |

Network endpoints:
- Mainnet: `https://stacks-node-api.mainnet.stacks.co`
- Fallback: `https://api.mainnet.hiro.so`

## 3. Incremental Hashing

Xtrata uses an incremental SHA-256 chain — NOT a single hash of the full file.
Start with 32 zero bytes. For each chunk, concatenate the running hash with the
raw chunk bytes and SHA-256 the result.

```js
const crypto = require('crypto');

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
you'll hit error `u103 HASH-MISMATCH`.

## 4. Fee Model

Protocol fees are denominated in microSTX. Fetch the current rate on-chain:

```js
const feeResult = await callReadOnlyFunction({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: 'get-fee-unit',
  functionArgs: [],
  senderAddress,
  network
});
const feeUnit = BigInt(cvToJSON(feeResult).value.value); // e.g. 100000 = 0.1 STX
```

Fee formulas:
- **Begin fee** = `feeUnit` microSTX
- **Seal fee** = `feeUnit * (1 + ceil(totalChunks / 50))` microSTX
- **Network fees** ≈ 0.01 STX per transaction (varies with mempool)

Total transactions = 1 (begin) + ceil(chunks / 50) batches + 1 (seal).

## 5. Pre-Inscription Planning & User Confirmation

**Before sending any transaction, agents MUST present costs and get explicit user
confirmation.** This is non-negotiable.

### Step-by-step

1. **Read the file** and compute size, chunk count, MIME type, and hash:

```js
const fileData = fs.readFileSync(filePath);
const totalSize = fileData.length;
const chunkSize = 16384;
const chunks = [];
for (let i = 0; i < totalSize; i += chunkSize) {
  chunks.push(fileData.subarray(i, i + chunkSize));
}
const hash = computeHash(chunks);
const mime = 'text/html'; // set appropriately
```

2. **Fetch live fee-unit** from the contract (see Section 4).

3. **Calculate costs**:

```js
const batches = Math.ceil(chunks.length / 50);
const totalTxs = 1 + batches + 1; // begin + upload batches + seal
const beginFee = Number(feeUnit) / 1e6;           // STX
const sealFee = Number(feeUnit * (1n + BigInt(batches))) / 1e6; // STX
const networkFees = totalTxs * 0.01;               // STX estimate
const totalCost = beginFee + sealFee + networkFees;
```

4. **Present the plan to the user**:

```
Inscription Plan
─────────────────
File: example.html (12,847 bytes)
Type: text/html
Chunks: 1 (1 batch)
Hash: 0xabcd...ef12

Cost Estimate
─────────────
Protocol: 0.10 (begin) + 0.20 (seal) = 0.30 STX
Network:  ~0.03 STX (3 transactions)
Total:    ~0.33 STX

Proceed with inscription? (confirm/cancel)
```

5. **Only proceed after explicit user confirmation.** If the user cancels, stop
   immediately. No transactions should be sent without approval.

## 6. Deduplication Check

Before beginning, check if the content already exists on-chain:

```js
const result = await callReadOnlyFunction({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: 'get-id-by-hash',
  functionArgs: [bufferCV(hash)],
  senderAddress, network
});
const existing = cvToJSON(result);
if (existing.value && existing.value.value) {
  // Already inscribed as token #<id> — skip
}
```

This is a free read-only call. Always do it before spending fees.

## 7. Three-Step Inscription Flow

Required imports:

```js
const {
  makeContractCall, broadcastTransaction, callReadOnlyFunction,
  bufferCV, uintCV, stringAsciiCV, listCV, cvToJSON,
  AnchorMode, PostConditionMode, FungibleConditionCode,
  makeStandardSTXPostCondition, getNonce
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');
```

### Nonce Management

Fetch the current nonce once, then increment locally after each confirmed tx:

```js
let nonce = await getNonce(senderAddress, network);
// After each confirmed tx: nonce = nonce + 1n;
```

### Transaction Polling

Wait for confirmation before proceeding to the next step:

```js
async function pollTx(txid, network, maxPolls = 60, interval = 10000) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < maxPolls; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.tx_status === 'success') return data;
    if (data.tx_status?.startsWith('abort'))
      throw new Error(`TX failed: ${data.tx_status}`);
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('TX not confirmed in time');
}
```

### Step 1: begin-or-get

Opens an upload session. Pays `feeUnit` as the begin fee.

```js
const beginTx = await makeContractCall({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: 'begin-or-get',
  functionArgs: [
    bufferCV(hash),
    stringAsciiCV(mime),
    uintCV(totalSize),
    uintCV(chunks.length)
  ],
  senderKey, network, nonce,
  postConditions: [
    makeStandardSTXPostCondition(
      senderAddress, FungibleConditionCode.LessEqual, feeUnit
    )
  ],
  postConditionMode: PostConditionMode.Deny,
  anchorMode: AnchorMode.Any
});
const beginTxid = (await broadcastTransaction(beginTx, network)).txid;
await pollTx(beginTxid, network);
nonce = nonce + 1n;
```

### Step 2: add-chunk-batch

Uploads chunk data. No protocol fee. Send chunks in batches of up to 50.

```js
for (let b = 0; b < batches; b++) {
  const batch = chunks.slice(b * 50, (b + 1) * 50);
  const chunkTx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'add-chunk-batch',
    functionArgs: [
      bufferCV(hash),
      listCV(batch.map(c => bufferCV(c)))
    ],
    senderKey, network, nonce,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
  const chunkTxid = (await broadcastTransaction(chunkTx, network)).txid;
  await pollTx(chunkTxid, network);
  nonce = nonce + 1n;
}
```

### Step 3: Seal

Use `seal-inscription` for standalone tokens or `seal-recursive` for tokens that
reference parent inscriptions (e.g. building a collection tree).

```js
const sealFeeAmount = feeUnit * (1n + BigInt(batches));

const sealTx = await makeContractCall({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: 'seal-inscription', // or 'seal-recursive'
  functionArgs: [
    bufferCV(hash),
    stringAsciiCV(tokenUri),
    // For seal-recursive, add: listCV([uintCV(parentTokenId)])
  ],
  senderKey, network, nonce,
  postConditions: [
    makeStandardSTXPostCondition(
      senderAddress, FungibleConditionCode.LessEqual, sealFeeAmount
    )
  ],
  postConditionMode: PostConditionMode.Deny,
  anchorMode: AnchorMode.Any
});
const sealTxid = (await broadcastTransaction(sealTx, network)).txid;
const sealResult = await pollTx(sealTxid, network);
// Token ID is in sealResult.tx_result
```

`seal-recursive` signature: `seal-recursive(hash, uri, dependencies)` where
`dependencies` is a `(list 200 uint)` of parent token IDs. All referenced tokens
must already exist on-chain.

## 8. MCP Integration (aibtc)

If your agent uses aibtc MCP tools instead of direct SDK signing:

| Xtrata need | aibtc MCP tool |
|---|---|
| Wallet address | `get_wallet_info` |
| STX balance | `get_stx_balance` |
| Read-only calls | `call_read_only_function` |
| Write calls | `call_contract` |
| Broadcast | `broadcast_transaction` |
| Poll tx status | `get_transaction_status` |

**Critical bug**: The aibtc `call_contract` tool sends EMPTY buffers when large
hex data is passed in nested `list(buff)` arguments. Do NOT use MCP tools for
`add-chunk-batch`. Use the Stacks SDK directly for chunk uploads. MCP tools work
fine for `begin-or-get` and `seal-inscription`/`seal-recursive`.

## 9. Resume Path

If a session is interrupted, call `get-upload-state` to check progress:

```js
const state = await callReadOnlyFunction({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: 'get-upload-state',
  functionArgs: [bufferCV(hash)],
  senderAddress, network
});
```

If `status` is `"uploading"`, resume from the next unchunked batch. If expired
(>4,320 blocks), restart from `begin-or-get`. If already sealed, retrieve the
token ID via `get-id-by-hash`.

## 10. Error Reference

| Code | Name | When |
|-----:|------|------|
| u100 | NOT-AUTHORIZED | Caller is not the upload owner |
| u101 | NOT-FOUND | No upload session for this hash |
| u102 | INVALID-BATCH | Empty batch or exceeds 50 chunks |
| u103 | HASH-MISMATCH | Final hash doesn't match expected |
| u107 | INVALID-URI | Empty or malformed token URI |
| u109 | PAUSED | Contract writes are paused |
| u110 | INVALID-FEE | Fee-unit out of allowed range |
| u111 | DEPENDENCY-MISSING | Referenced parent token doesn't exist |
| u112 | EXPIRED | Upload session expired (>4,320 blocks) |
| u114 | DUPLICATE | Content already sealed (use get-id-by-hash) |

Recovery: On `u112`/`u101`, restart from begin. On `u103`, recompute hash and
restart. On `u114`, retrieve the existing token. On post-condition abort, refresh
`get-fee-unit` and rebuild spend caps.
