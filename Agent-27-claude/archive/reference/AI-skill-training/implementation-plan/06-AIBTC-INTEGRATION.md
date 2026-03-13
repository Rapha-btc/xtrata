# 06 — aibtc Agent Integration

This document explains how aibtc agents should bridge their wallet tooling with
the two supported Xtrata mint routes.

## Current Mental Model

aibtc agents already know how to hold STX, sign transactions, and query chain
state. What they must learn for Xtrata is:

- route selection between the helper contract and the staged core flow
- incremental chunk hashing
- deterministic spend caps
- resume-safe behavior for interrupted uploads

## MCP Tool Mapping

Use the current aibtc MCP tool names:

| Xtrata operation | MCP tool |
|------------------|----------|
| get wallet address | `get_wallet_info` |
| check STX balance | `get_stx_balance` |
| read-only contract call | `call_read_only_function` |
| sign/write transaction | `call_contract` |
| broadcast signed transaction | `broadcast_transaction` |
| poll transaction status | `get_transaction_status` |

## Route Selection

Before constructing any mint transaction:

1. Chunk the file into 16,384-byte segments.
2. Compute the incremental SHA-256 chain hash.
3. Call `get-id-by-hash(expected-hash)` on the core contract.
4. Call `get-upload-state(expected-hash, owner)` on the core contract.
5. Choose the route:
   - helper route if chunk count is `1..30` and upload state is `none`
   - staged route otherwise

## Helper Route

Contract:

```text
SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0
```

Functions:

- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

Spend cap:

```text
helper cap = begin fee + seal fee
```

Use this route only for fresh uploads. If an upload session already exists, do
not switch to the helper mid-attempt.

## Staged Route

Core contract:

```text
SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
```

Write sequence:

1. `begin-or-get`
2. `add-chunk-batch` one or more times
3. `seal-inscription` or `seal-recursive`

This remains the required path for:

- files above 30 chunks
- resumable uploads
- helper-disabled environments

## MCP vs SDK Split

There is an important caveat for chunk-buffer writes.

The MCP `call_contract` path may silently send empty buffers for nested
`list(buff)` arguments. Because of that:

- use the Stacks SDK directly for `add-chunk-batch`
- use the Stacks SDK directly for `mint-small-single-tx`
- use the Stacks SDK directly for `mint-small-single-tx-recursive`

MCP remains safe for:

- `get_wallet_info`
- `get_stx_balance`
- read-only queries
- simpler write calls that do not carry chunk buffers

## Recommended aibtc Run Loop

```text
1. Get wallet info and STX balance
2. Chunk file and compute expected hash
3. Dedup check by hash
4. Read upload state by {hash, owner}
5. If helper route is valid, execute one helper tx with begin+seal spend cap
6. Otherwise run staged begin
7. Upload remaining chunk batches on the staged path
8. Seal on the staged path
9. Poll until success or explicit abort
10. Return { tokenId, txids, hash, totalSize, route }
```

## Failure Handling

- duplicate hash -> return canonical token ID
- active upload state -> stay on staged route and resume from `current-index`
- helper `ERR-INVALID-BATCH` -> route to staged flow if chunk count > 30
- post-condition failure -> refetch `get-fee-unit` and rebuild the tx
- hash mismatch -> restart with clean local chunk state

## Agent 27 Specific Rule

Agent 27 always mints recursively with dependencies exactly `[107]`.

- helper route -> `mint-small-single-tx-recursive(..., [107])`
- staged route -> `seal-recursive(..., [107])`
