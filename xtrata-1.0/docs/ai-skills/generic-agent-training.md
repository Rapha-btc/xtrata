# Generic AI Agent Training Guide

Audience: non-aibtc AI agents and frameworks that can call Stacks APIs and sign
transactions (direct key management or wallet adapter flow).

## Goal

Train an agent to execute Xtrata contract calls with correct typing, fees,
ordering, and verification:

- `begin-or-get`
- `add-chunk-batch`
- `seal-inscription` / `seal-recursive`
- `transfer`
- core read-only verification calls

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

## Training sequence

1. Load [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md).
2. Train chunking and hash routines exactly.
3. Train fee estimation and spend-cap post-conditions.
4. Train nonce sequencing for multi-transaction mint workflows (explicit nonce
   management: increment nonce after each confirmed tx to avoid mempool conflicts).
5. Train confirmation gating: every tx (begin, each chunk batch, seal) must reach
   `success` status before the next tx is broadcast.
6. Train read-after-write verification before reporting success.

## Generic orchestration pattern

1. Preflight:
   - network/contract check
   - fee-unit lookup
   - optional dedupe lookup
2. Mint execution:
   - begin (wait for confirmation)
   - upload batches (wait for each batch to confirm before next)
   - seal (all chunks must be confirmed on-chain first)
3. Verification:
   - tx success checks
   - `get-inscription-meta`
   - `get-id-by-hash`
4. Recovery:
   - classify contract vs network vs nonce vs post-condition failures
   - retry only transient classes

## Error class handling

- Contract errors (`u100`..`u115`): deterministic remediation per code.
- API/network errors: bounded retry with backoff and jitter.
- Nonce conflicts: refresh nonce and continue sequence.
- Post-condition abort: refresh fee-unit, rebuild tx caps.

## Safety and production posture

- Use `PostConditionMode.Deny` on fee-paying calls.
- Maintain conservative STX balance buffers before writes.
- Keep immutable logs: tx IDs, expected hash, resolved token ID.
- Promote from testnet to mainnet only after deterministic replay success.

## Companion references

- [`docs/ai-skills/README.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/ai-skills/README.md)
- [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md)
- [`scripts/xtrata-mint-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-mint-example.js)
- [`scripts/xtrata-transfer-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-transfer-example.js)
- [`scripts/xtrata-query-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-query-example.js)
