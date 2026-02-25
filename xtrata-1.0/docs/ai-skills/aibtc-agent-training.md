# AIBTC Agent Training Guide

Audience: aibtc agents that execute on Stacks via MCP wallet tooling.

## Goal

Train an aibtc agent to autonomously run the Xtrata inscription lifecycle:

1. `begin-or-get`
2. `add-chunk-batch` (one or more calls)
3. `seal-inscription` (or `seal-recursive`)

with deterministic fee caps, confirmations, and error recovery.

## Required capabilities

- MCP wallet tools:
  - `wallet_get_address`
  - `wallet_get_balance`
  - `stacks_call_read_only`
  - `stacks_call_contract`
  - `stacks_get_transaction`
- Access to Stacks mainnet/testnet API endpoints.
- STX balance for protocol + network fees.

## Training sequence

1. Load and parse `XTRATA_AGENT_SKILL.md`.
2. Train on fixed constants:
   - chunk size `16,384`
   - max batch size `50`
   - max chunks `2,048`
3. Train hash derivation:
   - incremental SHA-256 chain hash (`running-hash || chunk`).
4. Train fee model:
   - begin fee = `fee-unit`
   - seal fee = `fee-unit * (1 + ceil(totalChunks / 50))`
5. Train post-condition policy:
   - `PostConditionMode.Deny` for fee-paying writes.
6. Train confirmation policy:
   - poll status until success or explicit abort.
7. Train recovery policy:
   - duplicate -> resolve canonical ID by hash
   - expired/not-found -> restart begin path
   - hash mismatch -> restart with clean chunk state

## MCP mapping reference

| Xtrata operation | aibtc/MCP tool |
|---|---|
| balance check | `wallet_get_balance` |
| caller address | `wallet_get_address` |
| read-only checks | `stacks_call_read_only` |
| write calls | `stacks_call_contract` |
| tx status | `stacks_get_transaction` |

## Recommended run loop

1. Get address and STX balance.
2. Chunk data and compute expected hash.
3. Dedup check (`get-id-by-hash`) or call `begin-or-get`.
4. Execute begin tx with spend cap.
5. Upload chunk batches with 5s delay between writes.
6. Seal with computed cap.
7. Verify metadata and canonical hash->id mapping.
8. Return structured output (`tokenId`, `txids`, `hash`, `mimeType`, `totalSize`).

## Operational safeguards

- Start on testnet first for new workflows.
- Keep write retries bounded.
- Back off on rate limits (15s, 30s, 60s, 120s).
- Avoid exposing raw secret material in prompts, logs, or traces.

## Companion references

- `XTRATA_AGENT_SKILL.md`
- `scripts/xtrata-mint-example.js`
- `scripts/xtrata-transfer-example.js`
- `scripts/xtrata-query-example.js`
