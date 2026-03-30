---
name: xtrata-inscribe
description: >
  Teach any AI agent to inscribe one item on Stacks (Bitcoin L2) via the Xtrata
  protocol. Covers both the core-native single-tx route and the staged
  begin/upload/seal flow. Includes cost estimation and user confirmation gate.
  Multi-item batch jobs are handled by `skill-batch-mint.md`.
version: "1.2"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-0-0
---

# Xtrata Inscription Skill

## 1. Scope

This skill is for one-item minting.

Use it when the request is a single file that should become one inscription.
If the request is a coordinated drop of multiple files, hand off to
[`skill-batch-mint.md`](skill-batch-mint.md).

## 2. Protocol Overview

Xtrata is a contract-native inscription protocol on Stacks (Bitcoin L2). Data is
split into fixed 16,384-byte chunks, uploaded on-chain, then sealed into a
SIP-009 NFT. In `v3`, hash lookups are advisory only, so the agent should check
for existing content before minting rather than assume the contract enforces
global deduplication.

## 3. Contract Reference

| Key | Value |
|-----|-------|
| Contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-0-0` |
| CHUNK-SIZE | 16,384 bytes |
| MAX-BATCH-SIZE | 50 chunks per `add-chunk-batch` |
| MAX-SINGLE-TX-CHUNKS | 50 chunks per core-native single-tx call |
| MAX-TOTAL-CHUNKS | 2,048 |
| MAX-TOTAL-SIZE | 32 MiB |
| FEE-MIN | 0.000001 STX |
| FEE-MAX | 1.0 STX |
| UPLOAD-EXPIRY | 4,320 blocks (~30 days) |

Network endpoints:
- Mainnet: `https://stacks-node-api.mainnet.stacks.co`
- Fallback: `https://api.mainnet.hiro.so`

## 4. Incremental Hashing

Xtrata uses an incremental SHA-256 chain — not a single hash of the full file.
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
you will hit error `u103 HASH-MISMATCH`.

## 5. Fee Model

Protocol fees are denominated in microSTX. In `v3`, quote the real cost from the
contract instead of inferring it from `get-fee-unit`:

```js
const feeResult = await callReadOnlyFunction({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: 'quote-inscription-fee',
  functionArgs: [
    principalCV(senderAddress),
    noneCV(),
    uintCV(BigInt(totalSize)),
    uintCV(BigInt(totalChunks)),
    uintCV(mode === 'single-tx' ? 2n : 1n)
  ],
  senderAddress,
  network
});
const feeQuote = cvToJSON(feeResult).value.value;
```

Fee rules:
- staged total = `begin-fee + seal-fee`
- single-tx total = `single-tx-fee`
- quote output already includes size fee, extra-batch fee, and fee-policy overrides
- network fees are separate and vary with mempool conditions

## 6. Pre-Inscription Planning and User Confirmation

Before sending any transaction, the agent must present the plan and get explicit
user confirmation.

1. Read the file.
2. Compute size, chunk count, MIME type, and incremental hash.
3. Fetch a live fee quote.
4. Decide route:
   - core-native single-tx when one item, `1..50` chunks, and there is no resumable staged upload
   - staged flow otherwise
5. Present route, cost estimate, and hash to the user.
6. Proceed only after explicit confirmation.

If the user cancels, stop immediately.

## 7. Deduplication Check

Before beginning, check whether the content already exists on-chain:

```js
const result = await callReadOnlyFunction({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  functionName: 'get-id-by-hash',
  functionArgs: [bufferCV(hash)],
  senderAddress,
  network
});
```

If the hash already resolves to a token ID, stop and require explicit user
confirmation before minting a duplicate.

## 8. Mint Route Selection

Use the single-tx route only when all of the following are true:
- there is exactly one item to mint
- chunk count is `1..50`
- there is no active upload state to resume for `{hash, owner}`

Otherwise use the staged route.

If the user asks to mint multiple files together, do not improvise a loop here.
Hand the request to [`skill-batch-mint.md`](skill-batch-mint.md).

## 9. Single-Tx Route

The core-native single-tx route compresses begin, upload, and seal into one
transaction for a single qualifying item.

Execution rules:
- fetch upload state first
- do not use single-tx if a staged upload already exists
- set one deny-mode STX post-condition with the quoted `total-fee`
- build principal arguments explicitly when a flow needs the caller identity, for example `principalCV(senderAddress)`
- wait for confirmation before reporting success

Recursive variant:
- use `mint-single-tx-recursive` only for one-item recursive mints
- do not project recursive support onto batch jobs

## 10. Staged Route

The staged route remains the default for larger one-item uploads and for any
single-item job that must be resumed.

Execution order:
1. `begin-or-get`
2. one or more `add-chunk-batch` calls
3. `seal-inscription` or `seal-recursive`

Rules:
- confirm every tx before the next dependent tx
- resume from `get-upload-state` when possible
- use `seal-recursive` only when explicit dependencies are required

## 11. Resume Rules

Xtrata staged uploads are resume-safe.

1. Call `get-upload-state(expected-hash, owner)`.
2. Read `current-index`.
3. Restart upload from the next missing chunk.
4. Seal only after all chunks are confirmed on-chain.
5. Do not switch an active staged upload onto the single-tx route mid-attempt.

## 12. Operational Notes

- Use `PostConditionMode.Deny` on fee-paying writes.
- Keep retries bounded and back off on `429` / `5xx` responses.
- Log tx IDs, expected hash, token ID, route, and total fees.
- If the task becomes multi-item, switch skills rather than stretching this one.
