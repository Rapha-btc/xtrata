# Generic AI Agent Training Guide

Audience: non-aibtc AI agents and frameworks that can call Stacks APIs and sign
transactions (direct key management or wallet adapter flow).

## Goal

Train an agent to execute Xtrata contract calls with correct typing, fees,
ordering, confirmation gating, and verification across all supported mint paths:

- single-item helper route:
  - `mint-small-single-tx`
  - `mint-small-single-tx-recursive`
- single-item staged route:
  - `begin-or-get`
  - `add-chunk-batch`
  - `seal-inscription` / `seal-recursive`
- multi-item staged batch route:
  - core `seal-inscription-batch`
  - collection `mint-begin` + `mint-add-chunk-batch` + `mint-seal-batch`
- `transfer`
- core read-only verification calls

Hard limit: recursive minting is supported per item, but recursive batch minting
is not supported by the current contracts.

## Required stack

- `@stacks/transactions`
- `@stacks/network`
- `@noble/hashes`
- Optional wallet integration layer if signing is external.

## Capabilities checklist

- Can construct Clarity values (`uintCV`, `bufferCV`, `listCV`, `tupleCV`).
- Can sign and broadcast contract-call transactions.
- Can poll tx status and parse `abort_by_response` / `abort_by_post_condition`.
- Can perform read-only contract calls and parse CV responses.
- Can maintain explicit ordered manifests for batch drops.
- Can track nonce sequencing across multi-tx staged uploads.

## Training sequence

1. Load [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md).
2. Load the focused skill docs:
   - [`skill-inscribe.md`](skill-inscribe.md)
   - [`skill-batch-mint.md`](skill-batch-mint.md)
3. Train chunking and incremental hash routines exactly.
4. Train fee estimation and spend-cap post-conditions.
5. Train route selection:
   - helper only when there is one item, chunk count is `1..30`, helper deployment exists, and no staged upload state is active
   - staged single-item flow otherwise
   - batch route for `2..50` non-recursive items
   - reject recursive batch plans and split them into individual recursive mints
6. Train nonce sequencing for multi-transaction mint workflows.
7. Train confirmation gating: every tx (helper, begin, each chunk batch, seal, batch seal) must reach `success` before the next dependent tx is broadcast.
8. Train read-after-write verification before reporting success.
9. Train deterministic token mapping for batch mint results using manifest order plus returned `{ start, count }`.

## Generic orchestration patterns

### Single-item

1. Preflight:
   - network/contract check
   - `get-fee-unit`
   - optional dedupe lookup
   - helper availability check
   - upload-state check
2. Mint execution:
   - helper single-tx path when eligible
   - otherwise begin -> staged uploads -> seal
3. Verification:
   - tx success checks
   - `get-inscription-meta`
   - `get-id-by-hash`
4. Recovery:
   - classify contract vs network vs nonce vs post-condition failures
   - retry only transient classes

### Batch mint

1. Preflight:
   - validate ordered manifest
   - read files, chunk, hash, and classify MIME types
   - dedupe within request
   - dedupe against chain via `get-id-by-hash`
   - reject recursive dependencies
   - choose core or collection batch route
2. Staging:
   - core: `begin-or-get` + `add-chunk-batch`
   - collection: `mint-begin` + `mint-add-chunk-batch`
   - confirm every staged tx before advancing
3. Finalization:
   - core: `seal-inscription-batch`
   - collection: `mint-seal-batch`
4. Verification:
   - assert returned `count` equals the final item count
   - map token IDs sequentially from `start`
   - confirm each `hash -> tokenId` resolution on-chain
5. Recovery:
   - resume incomplete items from upload state
   - rebuild the batch against fresh chain state if duplicates appear just before final seal

## Error class handling

- Contract errors (`u100`..`u115` and collection-specific errors): deterministic remediation per code.
- API/network errors: bounded retry with backoff and jitter.
- Nonce conflicts: refresh nonce and continue sequence.
- Post-condition abort: refresh `fee-unit`, rebuild tx caps.
- Invalid batch plan: fail fast on `>50` items, recursive dependencies, duplicate manifest entries, or collection default dependencies.

## Safety and production posture

- Use `PostConditionMode.Deny` on fee-paying calls.
- Maintain conservative STX balance buffers before writes.
- Keep immutable logs: tx IDs, expected hash, resolved token ID, and route used.
- Promote from testnet to mainnet only after deterministic replay success.
- Do not infer unsupported helper behavior. Multi-file helper minting does not exist today.

## Companion references

- [`docs/ai-skills/README.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/ai-skills/README.md)
- [`skill-inscribe.md`](skill-inscribe.md)
- [`skill-batch-mint.md`](skill-batch-mint.md)
- [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md)
- [`scripts/xtrata-mint-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-mint-example.js)
- [`scripts/xtrata-transfer-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-transfer-example.js)
- [`scripts/xtrata-query-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-query-example.js)
