# AIBTC Agent Training Guide

Audience: aibtc agents that execute on Stacks via MCP wallet tooling.

## Goal

Train an aibtc agent to autonomously run the Xtrata inscription lifecycle across
all currently supported mint routes:

1. single-item helper route:
   - `mint-small-single-tx`
   - `mint-small-single-tx-recursive`
2. single-item staged route:
   - `begin-or-get`
   - `add-chunk-batch` (one or more calls)
   - `seal-inscription` or `seal-recursive`
3. multi-item staged batch route:
   - core path: stage each item, then `seal-inscription-batch`
   - collection path: `mint-begin`, `mint-add-chunk-batch`, then `mint-seal-batch`

Hard limit: batch seal is non-recursive only. If dependencies are required, mint
those items individually.

## Required capabilities

- MCP wallet tools (aibtc tool names):
  - `get_wallet_info`
  - `get_stx_balance`
  - `call_read_only_function`
  - `call_contract`
  - `broadcast_transaction`
  - `get_transaction_status`
- Access to Stacks mainnet/testnet API endpoints.
- STX balance for protocol + network fees.
- Direct SDK fallback for chunk-buffer transactions.

## Training sequence

1. Load and parse [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md).
2. Load the focused skill docs:
   - [`skill-inscribe.md`](skill-inscribe.md)
   - [`skill-batch-mint.md`](skill-batch-mint.md)
3. Train on fixed constants:
   - chunk size `16,384`
   - upload batch size `50`
   - final batch item size `50`
   - helper chunk ceiling `30`
   - max chunks `2,048`
4. Train hash derivation:
   - incremental SHA-256 chain hash: `sha256(running-hash || chunk)`
   - running hash starts as 32 zero bytes
   - final running hash is the `expected-hash`
5. Train fee model:
   - begin fee = `fee-unit`
   - seal fee = `fee-unit * (1 + ceil(totalChunks / 50))`
   - helper spend cap = `begin fee + seal fee` in one deny-mode post-condition
   - collection batch cost adds the sum of reservation `mint-price` values
6. Train route selection:
   - one item, `1..30` chunks, helper deployed, no resumable staged upload -> helper route
   - one item otherwise -> staged route
   - `2..50` non-recursive items -> batch route
   - recursive dependency requirements -> individual mints only
   - never assume a multi-file helper path exists
7. Train post-condition policy:
   - `PostConditionMode.Deny` for fee-paying writes
8. Train confirmation policy:
   - every write tx must confirm before the next dependent tx is sent
9. Train recovery policy:
   - duplicate -> resolve canonical ID by hash
   - active upload state -> stay on staged route and resume
   - expired/not-found -> restart begin path
   - hash mismatch -> restart with clean chunk state
   - collection duplicate race after reservation -> stop and surface the conflict

## MCP mapping reference

| Xtrata operation | aibtc MCP tool |
|---|---|
| balance check | `get_stx_balance` |
| caller address | `get_wallet_info` |
| read-only checks | `call_read_only_function` |
| write calls | `call_contract` |
| broadcast signed tx | `broadcast_transaction` |
| tx status | `get_transaction_status` |

## Recommended run loops

### Single-item mint

1. Get address and STX balance.
2. Chunk data and compute expected hash.
3. Dedup with `get-id-by-hash`, then query `get-upload-state(expected-hash, owner)`.
4. If helper is available, chunk count is `1..30`, and no upload state exists, execute one helper tx with the combined begin+seal spend cap.
5. Otherwise execute staged begin tx with spend cap.
6. Upload chunk batches and wait for each tx to confirm.
7. Seal with computed cap after all chunks are confirmed on-chain.
8. Verify metadata and canonical hash->id mapping.
9. Return structured output (`tokenId`, `txids`, `hash`, `mimeType`, `totalSize`, `route`).

### Batch mint

1. Normalize the ordered manifest.
2. Read every file, chunk it, and compute expected hashes.
3. Deduplicate within the request and against chain state.
4. Reject the batch if any item requires recursive dependencies.
5. Choose route:
   - direct core batch seal
   - collection batch seal
6. Stage each remaining item fully:
   - core: `begin-or-get` + `add-chunk-batch`
   - collection: `mint-begin` + `mint-add-chunk-batch`
7. Wait for every staged tx to confirm before moving forward.
8. Build the final ordered `{ hash, token-uri }` list.
9. Send one final batch seal tx:
   - core: `seal-inscription-batch`
   - collection: `mint-seal-batch`
10. Verify returned `{ start, count }`, then map token IDs back to manifest order.
11. Return structured output with `created`, `skipped`, `existing`, `txids`, and ordered hash->token mappings.

## Known MCP tool limitations

**CRITICAL:** Some MCP tool implementations may silently send empty buffers when
large hex-encoded data is passed in nested list+buffer arguments. If the
contract's running hash after upload equals
`66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925`, the MCP tool
sent an empty buffer instead of your chunk data.

Use the `@stacks/transactions` SDK directly for write calls that include chunk
buffers in `list(buff)` arguments:
- `add-chunk-batch`
- `mint-add-chunk-batch`
- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

The smaller control-plane writes typically remain safe through MCP when typed
correctly:
- `begin-or-get`
- `seal-inscription`
- `seal-recursive`
- `seal-inscription-batch`
- `mint-begin`
- `mint-seal-batch`

If the agent is driving a first-party UI rather than building raw transactions,
expect the helper route to collapse a qualifying one-item mint into one wallet
approval. Do not project that behavior onto multi-file drops.

## Resume path

Xtrata has a robust resume capability for staged uploads. If a mint process is
interrupted, do not abandon the upload.

Single-item staged resume:
1. Call `get-upload-state(expected-hash, owner)`.
2. Check `current-index`.
3. Resume uploading from the next chunk index.
4. Only seal after all chunks are confirmed on-chain.

Batch resume:
1. Treat each item as its own staged upload state.
2. Resume incomplete items individually.
3. Do not send the final batch seal until every item in the batch is complete.
4. Do not switch an active staged upload onto the helper route mid-attempt.

Collection-specific constraint:
- `mint-seal-batch` requires empty `default-dependencies`. If defaults are set,
  do not attempt batch seal.

## Operational safeguards

- Start on testnet first for new workflows.
- Keep write retries bounded.
- Back off on rate limits (`15s`, `30s`, `60s`, `120s`).
- Avoid exposing raw secret material in prompts, logs, or traces.
- Keep immutable logs of tx IDs, expected hashes, resolved token IDs, and route choice.
- Surface unsupported plans early: recursive batch, `>50` items, or assumed multi-file helper mints.

## Companion references

- [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md)
- [`skill-inscribe.md`](skill-inscribe.md)
- [`skill-batch-mint.md`](skill-batch-mint.md)
- [`scripts/xtrata-mint-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-mint-example.js)
- [`scripts/xtrata-transfer-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-transfer-example.js)
- [`scripts/xtrata-query-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-query-example.js)
