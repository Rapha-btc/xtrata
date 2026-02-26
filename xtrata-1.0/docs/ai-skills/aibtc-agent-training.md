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

## Known MCP tool limitations

**CRITICAL:** Some MCP tool implementations may silently send empty buffers when
large hex-encoded data is passed in nested list+buffer arguments (e.g., the chunk
data inside `add-chunk-batch`). If the contract's running hash after upload equals
`sha256(32 zero bytes)` = `66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925`,
the MCP tool sent an empty buffer instead of your chunk data.

**Workaround:** Use the `@stacks/transactions` SDK directly for `add-chunk-batch`
calls. The `begin-or-get` and `seal-inscription` calls (which use small buffer
arguments) work correctly via MCP tools. See `inscribe-genesis.cjs` in the AIBTC
directory for a working SDK-based reference.

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
