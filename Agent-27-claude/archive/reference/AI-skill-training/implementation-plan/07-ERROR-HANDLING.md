# 07 — Error Handling

Complete reference for every error an agent may encounter when interacting
with Xtrata, organized by source.

---

## Contract Error Codes

These are returned in `(err u<code>)` responses from the smart contract.

| Code | Name | Trigger | Agent Resolution |
|------|------|---------|-----------------|
| `u100` | `ERR-NOT-AUTHORIZED` | Caller is not the token owner (for transfer) or not the contract admin (for admin functions) | Verify `tx-sender` matches the expected principal. For transfers, confirm ownership with `get-owner(id)`. |
| `u101` | `ERR-NOT-FOUND` | Token ID or upload session does not exist | For tokens: verify the ID exists with `inscription-exists(id)`. For uploads: the session may have expired — restart with `begin-or-get`. |
| `u102` | `ERR-INVALID-BATCH` | Batch size exceeds 50, total chunks exceeds 2048, total size exceeds 32 MiB, or 0 chunks passed | Verify: chunks per batch <= 50, total chunks <= 2048, total size <= 33,554,432 bytes. |
| `u103` | `ERR-HASH-MISMATCH` | At seal time, the on-chain running hash does not match the expected hash | Chunk data was corrupted or uploaded out of order. Recompute hash locally, verify chunk order matches, and re-attempt. May need to restart from `begin-or-get` with correct data. |
| `u107` | `ERR-INVALID-URI` | Token URI exceeds 256 characters | Shorten the token URI to 256 characters max. Use a URL shortener or Arweave hash. |
| `u109` | `ERR-PAUSED` | Xtrata inscription writes are paused by admin | Wait and retry later. Check `is-paused()` before attempting writes. Transfers and reads still work while paused. |
| `u110` | `ERR-INVALID-FEE` | Fee value outside bounds (1,000–1,000,000 microSTX) | Admin-only error. Not encountered by regular agents. |
| `u111` | `ERR-DEPENDENCY-MISSING` | A token ID listed in `seal-recursive` dependencies does not exist | Verify all dependency IDs exist with `inscription-exists(id)` before calling `seal-recursive`. |
| `u112` | `ERR-EXPIRED` | Upload session has expired (inactive for >4,320 blocks / ~30 days) | Restart the inscription from `begin-or-get`. Previous chunk data is lost. |
| `u113` | `ERR-NOT-EXPIRED` | Attempted to purge chunks from a session that hasn't expired yet | Wait until the session expires, or have the session owner call `abandon-upload` first. |
| `u114` | `ERR-DUPLICATE` | Content hash is already sealed as another token | Content already exists on-chain. Call `get-id-by-hash(hash)` to get the existing token ID. No action needed — reuse the existing inscription. |
| `u115` | `ERR-ALREADY-SET` | One-time `set-next-id` has already been called | Admin-only error. Not encountered by regular agents. |

### Helper Contract Errors

When using `xtrata-small-mint-v1-0`, the helper can also return:

| Code | Name | Trigger | Agent Resolution |
|------|------|---------|-----------------|
| `u100` | `ERR-NOT-AUTHORIZED` | Helper admin-only function called by non-owner | Not relevant to normal minting; avoid helper admin calls in agent flows. |
| `u101` | `ERR-PAUSED` | Helper contract is paused | Retry later or switch to the staged core path if the helper is intentionally disabled. |
| `u102` | `ERR-INVALID-BATCH` | Zero chunks, more than 30 chunks, or `total-size` exceeds helper shape limits | Route to staged flow for files above 30 chunks; verify chunk count and total size before helper calls. |
| `u103` | `ERR-INVALID-CORE-CONTRACT` | Helper pointed at the wrong core contract principal | Use `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` as the core target. |

---

## Transaction-Level Errors

### Post-Condition Failure

```
tx_status: "abort_by_post_condition"
```

**Cause:** The transaction tried to spend more STX than the post-condition
allows.

**Resolution:**
- Recalculate the fee using the current `get-fee-unit()` value
- The fee-unit may have changed since the transaction was built
- Rebuild the transaction with updated post-conditions
- On the helper route, remember the cap must cover `begin + seal` together

### Nonce Error

```
error: "ConflictingNonceInMempool"
reason: "Conflicting nonce"
```

**Cause:** A transaction with the same nonce is already pending in the mempool.

**Resolution:**
- Wait for the pending transaction to confirm
- Or use the next available nonce: `getNonce(address, network) + 1`
- For sequential operations, track nonces manually

### Insufficient Balance

```
error: "NotEnoughFunds"
```

**Cause:** Wallet doesn't have enough STX for the transaction + fees.

**Resolution:**
- Check balance: `GET /v2/accounts/{address}`
- Calculate total required: protocol fees + network fees + buffer
- Acquire more STX before retrying

### Network / API Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `Failed to fetch` | Network connectivity issue | Retry with exponential backoff |
| `NetworkError` | CORS or proxy issue | Try alternate API endpoint |
| HTTP 429 | Rate limited by Stacks API | Wait and retry with backoff (start 15s, max 120s) |
| HTTP 500/502/503 | API server error | Retry with backoff, try fallback endpoint |

---

## Retry Strategy

For transient errors (network, rate limits), use exponential backoff:

```javascript
async function withRetry(fn, maxRetries = 4, baseDelayMs = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        // Add jitter: +/- 25%
        const jitter = delay * 0.25 * (Math.random() * 2 - 1);
        await new Promise(r => setTimeout(r, delay + jitter));
      }
    }
  }
  throw lastError;
}

// Usage
const meta = await withRetry(() =>
  callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-inscription-meta',
    functionArgs: [uintCV(tokenId)],
    senderAddress,
    network
  })
);
```

### Rate Limit Backoff Schedule

The Xtrata app uses this escalating backoff for API rate limits:

| Consecutive failures | Backoff duration |
|---------------------|-----------------|
| 1 | 15 seconds |
| 2 | 30 seconds |
| 3 | 60 seconds |
| 4+ | 120 seconds |

---

## Error Code Parsing

To extract error codes from Clarity responses:

```javascript
import { cvToJSON } from '@stacks/transactions';

function parseContractError(clarityValue) {
  const json = cvToJSON(clarityValue);

  // Check if response is an error
  if (json.type === 'err') {
    const code = json.value.value; // e.g. "100"
    const errorNames = {
      '100': 'ERR_NOT_AUTHORIZED',
      '101': 'ERR_NOT_FOUND',
      '102': 'ERR_INVALID_BATCH',
      '103': 'ERR_HASH_MISMATCH',
      '107': 'ERR_INVALID_URI',
      '109': 'ERR_PAUSED',
      '110': 'ERR_INVALID_FEE',
      '111': 'ERR_DEPENDENCY_MISSING',
      '112': 'ERR_EXPIRED',
      '113': 'ERR_NOT_EXPIRED',
      '114': 'ERR_DUPLICATE',
      '115': 'ERR_ALREADY_SET'
    };

    return {
      isError: true,
      code: parseInt(code),
      name: errorNames[code] || 'UNKNOWN_ERROR'
    };
  }

  return { isError: false, value: json };
}
```

---

## Pre-Flight Checks

Before attempting any write operation, agents should run these checks:

### Before begin-or-get

```javascript
async function preflightBegin(expectedHash, senderAddress) {
  const errors = [];

  // 1. Check if paused
  const paused = await isPaused(senderAddress);
  if (paused) errors.push('ERR_PAUSED: Inscription writes are paused');

  // 2. Check for existing inscription
  const existingId = await getIdByHash(expectedHash, senderAddress);
  if (existingId !== null) {
    return { skip: true, existingId, errors: [] };
  }

  // 3. Check balance
  const balance = await getBalance(senderAddress);
  const feeUnit = await getFeeUnit(senderAddress);
  if (balance < feeUnit + 50_000n) {
    errors.push(`Insufficient balance: have ${balance}, need at least ${feeUnit + 50_000n}`);
  }

  return { skip: false, existingId: null, errors };
}
```

### Before seal-inscription

```javascript
async function preflightSeal(expectedHash, senderAddress, totalChunks) {
  const errors = [];

  // 1. Check upload state
  const state = await getUploadState(expectedHash, senderAddress);
  if (!state) {
    errors.push('ERR_NOT_FOUND: No upload session — call begin-or-get first');
    return errors;
  }

  // 2. Check all chunks uploaded
  if (state.currentIndex < state.totalChunks) {
    errors.push(`Incomplete upload: ${state.currentIndex}/${state.totalChunks} chunks`);
  }

  // 3. Check balance for seal fee
  const feeUnit = await getFeeUnit(senderAddress);
  const sealFee = feeUnit * (1n + ((totalChunks + 49n) / 50n));
  const balance = await getBalance(senderAddress);
  if (balance < sealFee + 50_000n) {
    errors.push(`Insufficient balance for seal: have ${balance}, need ${sealFee + 50_000n}`);
  }

  return errors;
}
```
