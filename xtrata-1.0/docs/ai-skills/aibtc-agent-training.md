# AIBTC Agent Training Guide

Audience: aibtc agents that execute on Stacks via MCP wallet tooling.

## Goal

Train an aibtc agent to autonomously run the Xtrata inscription lifecycle in
either of the supported mint routes:

1. small helper route: `mint-small-single-tx` / `mint-small-single-tx-recursive`
2. staged route: `begin-or-get` -> `add-chunk-batch` (one or more calls) -> `seal-inscription` (or `seal-recursive`)

with deterministic fee caps, confirmations, and error recovery.

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

## Training sequence

1. Load and parse [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md).
2. Train on fixed constants:
   - chunk size `16,384`
   - max batch size `50`
   - max chunks `2,048`
3. Train hash derivation:
   - incremental SHA-256 chain hash: `sha256(running-hash || chunk)`.
   - Running hash starts as 32 zero bytes (0x00...00).
   - For each chunk: concatenate the current 32-byte running hash with the raw
     chunk bytes, then SHA-256 the result. The output becomes the new running hash.
   - The final running hash after all chunks is the `expected-hash` used in
     `begin-or-get` and `seal-inscription`.
   - Reference implementation (Node.js):
     ```javascript
     const crypto = require('crypto');
     function computeExpectedHash(chunks) {
       let running = Buffer.alloc(32, 0);
       for (const chunk of chunks) {
         running = crypto.createHash('sha256')
           .update(Buffer.concat([running, chunk])).digest();
       }
       return running;
     }
     ```
4. Train fee model:
   - begin fee = `fee-unit`
   - seal fee = `fee-unit * (1 + ceil(totalChunks / 50))`
   - helper spend cap = `begin fee + seal fee` in one deny-mode post-condition
5. Train route selection:
   - use helper only when chunk count is `1..30`, helper deployment exists, and
     there is no staged upload state to resume
   - otherwise use staged flow
6. Train post-condition policy:
   - `PostConditionMode.Deny` for fee-paying writes.
7. Train confirmation policy:
   - poll status until success or explicit abort.
8. Train recovery policy:
   - duplicate -> resolve canonical ID by hash
   - active upload state -> stay on staged route and resume
   - expired/not-found -> restart begin path
   - hash mismatch -> restart with clean chunk state

## MCP mapping reference

| Xtrata operation | aibtc MCP tool |
|---|---|
| balance check | `get_stx_balance` |
| caller address | `get_wallet_info` |
| read-only checks | `call_read_only_function` |
| write calls | `call_contract` |
| broadcast signed tx | `broadcast_transaction` |
| tx status | `get_transaction_status` |

## Recommended run loop

1. Get address and STX balance.
2. Chunk data and compute expected hash.
3. Dedup check with `get-id-by-hash`, then query `get-upload-state(expected-hash, owner)`.
4. If helper is available, chunk count is `1..30`, and no upload state exists, execute one helper tx with the combined begin+seal spend cap.
5. Otherwise execute staged begin tx with spend cap.
6. On staged flow, upload chunk batches and wait for each batch tx to confirm before proceeding.
7. On staged flow, seal with computed cap after all chunks are confirmed on-chain.
8. Verify metadata and canonical hash->id mapping.
9. Return structured output (`tokenId`, `txids`, `hash`, `mimeType`, `totalSize`, `route`).

## Known MCP tool limitations

**CRITICAL:** Some MCP tool implementations may silently send empty buffers when
large hex-encoded data is passed in nested list+buffer arguments (e.g., the chunk
data inside `add-chunk-batch`). If the contract's running hash after upload equals
`sha256(32 zero bytes)` = `66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925`,
the MCP tool sent an empty buffer instead of your chunk data.

**Workaround:** Use the `@stacks/transactions` SDK directly for any write call
that includes chunk buffers in `list(buff)` arguments:
- `add-chunk-batch`
- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

The smaller `begin-or-get` and `seal-inscription`/`seal-recursive` calls still
work correctly via MCP `call_contract`. If your agent is driving the first-party
UI rather than building raw transactions, expect the helper route to collapse the
whole mint into one wallet approval for `<=30` chunks. See
`scripts/xtrata-mint-example.js` for a complete SDK-based reference.

## Resume path

Xtrata has a robust resume capability. If an inscription process is interrupted
(crash, timeout, network error), do NOT abandon the upload. Instead:

1. Call `get-upload-state(expected-hash, owner)` to check the session status.
2. Check `current-index` to see how many chunks have been uploaded.
3. Resume uploading from the next chunk index.
4. The contract validates hashes incrementally — if the same correct data is
   re-uploaded, it will produce the same running hash.
5. `begin-or-get` is resume-safe: calling it again with the same hash will
   return the existing session, not create a duplicate.
6. Sessions persist for 4,320 blocks (~30 days).
7. Resume is for the staged route only. Do not switch an active upload onto the
   helper route mid-attempt.

Only use `abandon-upload` as a last resort when the upload is truly broken
(e.g., wrong data was uploaded and the running hash is irrecoverable).

## Operational safeguards

- Start on testnet first for new workflows.
- Keep write retries bounded.
- Back off on rate limits (15s, 30s, 60s, 120s).
- Avoid exposing raw secret material in prompts, logs, or traces.

## Companion references

- [`XTRATA_AGENT_SKILL.md`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md)
- [`scripts/xtrata-mint-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-mint-example.js)
- [`scripts/xtrata-transfer-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-transfer-example.js)
- [`scripts/xtrata-query-example.js`](https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-query-example.js)
