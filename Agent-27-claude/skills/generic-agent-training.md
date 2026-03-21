---
name: xtrata-generic-training
description: >
  Complete training guide for non-AIBTC AI agents and frameworks that sign
  transactions directly via the Stacks SDK. Covers all supported mint paths,
  typing, fees, confirmation gating, nonce management, and verification.
  Designed to work with the standalone skill modules.
version: "2.0"
standalone: true
---

# Generic AI Agent Training Guide for Xtrata

Audience: Non-AIBTC AI agents and frameworks that can call Stacks APIs and sign
transactions (direct key management or wallet adapter flow).

## Goal

Train an agent to execute Xtrata contract calls with correct typing, fees,
ordering, confirmation gating, and verification across all supported paths:

- Single-item helper route: `mint-small-single-tx` / `mint-small-single-tx-recursive`
- Single-item staged route: `begin-or-get` -> `add-chunk-batch` -> `seal-inscription` / `seal-recursive`
- Multi-item batch route: core `seal-inscription-batch` or collection `mint-seal-batch`
- Transfer: `transfer`
- Query: read-only verification calls

Hard limit: recursive minting is supported per item, but recursive batch minting
is not supported by the current contracts.

## Required Stack

```bash
npm install @stacks/transactions @stacks/network @noble/hashes
```

## Capabilities Checklist

- Can construct Clarity values (`uintCV`, `bufferCV`, `listCV`, `tupleCV`, `stringAsciiCV`, `contractPrincipalCV`)
- Can sign and broadcast contract-call transactions
- Can poll tx status and parse `abort_by_response` / `abort_by_post_condition`
- Can perform read-only contract calls and parse CV responses
- Can maintain explicit ordered manifests for batch drops
- Can track nonce sequencing across multi-tx staged uploads

## Training Sequence

1. Load the focused skill modules:
   - `xtrata-release-plan` — dependency-aware preflight quote and execution order
   - `skill-inscribe` — single item minting with full code
   - `skill-batch-mint` — coordinated drops with full code
   - `skill-query` — read-only viewing with full code
   - `skill-transfer` — wallet-to-wallet transfers with full code

2. Train chunking: fixed at 16,384 bytes.

3. Train incremental hash: `sha256(running-hash || chunk)`, starting from 32 zero bytes.

4. Train fee estimation and spend-cap post-conditions:
   - begin fee = `fee-unit`
   - seal fee = `fee-unit * (1 + ceil(totalChunks / 50))`
   - Always `PostConditionMode.Deny`

5. Train route selection:
   - Helper: one item, 1..30 chunks, helper deployed, no staged upload
   - Staged: one item otherwise
   - Batch: 2..50 non-recursive items
   - Reject recursive batch plans

6. Train nonce sequencing for multi-transaction workflows:
```js
const { getNonce } = require('@stacks/transactions');
const baseNonce = await getNonce(senderAddress, network);
// tx 1: nonce = baseNonce
// tx 2: nonce = baseNonce + 1
// ...
```

7. Train confirmation gating: every tx must reach `success` before the next dependent tx.

8. Train read-after-write verification before reporting success.

9. Train deterministic token mapping for batch results using manifest order + returned `{ start, count }`.

## Contract Reference

| Key | Value |
|---|---|
| Core | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Helper | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0` |
| Legacy (read only) | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1` |

## Error Class Handling

| Error Class | Resolution |
|---|---|
| `u100` NOT-AUTHORIZED | Verify signer is owner/admin |
| `u101` NOT-FOUND | Token/session missing — restart |
| `u102` INVALID-BATCH | Batch > 50 or chunks > 2048 |
| `u103` HASH-MISMATCH | Recompute hash, restart |
| `u107` INVALID-URI | URI must be non-empty, <= 256 ASCII |
| `u109` PAUSED | Retry later |
| `u111` DEPENDENCY-MISSING | Validate deps before seal |
| `u112` EXPIRED | Session expired — restart begin |
| `u114` DUPLICATE | Use `get-id-by-hash` for canonical token |
| API/network errors | Bounded retry with backoff and jitter |
| Nonce conflicts | Refresh nonce and continue sequence |
| Post-condition abort | Refresh `fee-unit`, rebuild tx caps |
| Invalid batch plan | Fail fast on >50, recursive deps, duplicates |

## Safety and Production Posture

- Use `PostConditionMode.Deny` on fee-paying calls.
- Maintain conservative STX balance buffers before writes.
- Keep immutable logs: tx IDs, expected hash, resolved token ID, route used.
- Promote from testnet to mainnet only after deterministic replay success.
- Do not infer unsupported helper behavior. Multi-file helper minting does not exist.
- Never log private keys or seed phrases.
- Bound retries and use fallback endpoints under rate limits.
