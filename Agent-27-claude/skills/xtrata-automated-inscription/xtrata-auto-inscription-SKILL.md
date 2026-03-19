---
name: xtrata-automated-inscription
description: >
  Use this skill when an AIBTC agent needs to inscribe one arbitrary file,
  text blob, HTML page, JSON document, image, SVG, audio asset, or other byte
  payload to the Stacks blockchain through Xtrata. Covers chunking, rolling
  SHA-256 content hashes, deduplication, helper-vs-staged route selection,
  recursive dependencies, resume-safe uploads, fee checks, and the AIBTC
  MCP-vs-SDK split for buffer-heavy write calls.
---

# Xtrata Automated Inscription Skill

Use this skill when the job is "inscribe one thing on Xtrata" rather than
"mint a coordinated drop of many items." If the task is a 2-50 item batch,
use `xtrata-batch-mint` instead.

## What This Skill Handles

- arbitrary content types: `text/plain`, `text/html`, `application/json`,
  `image/png`, `image/svg+xml`, audio, binary assets, and other byte payloads
- non-recursive inscriptions
- recursive inscriptions with explicit dependency token IDs
- helper single-tx mints for small fresh uploads
- staged begin/upload/seal flows for large or resumable uploads

## Mainnet Contracts

- Core Xtrata contract:
  `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- Small-file helper contract:
  `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0`

## Hard Limits

- chunk size: `16,384` bytes
- max chunks per inscription: `2,048`
- max inscription size: `32 MiB`
- max chunks per `add-chunk-batch`: `50`
- helper route only for `1..30` chunks
- max dependencies per recursive seal: `50`
- MIME type must fit `string-ascii 64`
- token URI must fit `string-ascii 256`

The token URI is metadata only. The actual content lives in the Xtrata chunk
storage and is what the content hash commits to.

## Decision Rules

1. Convert the payload into bytes.
2. Chunk into `16,384` byte segments.
3. Compute the rolling SHA-256 chain hash.
4. Read `get-id-by-hash(expected-hash)` on the core contract.
5. If the hash already exists, stop and reuse that token ID.
6. Read `get-upload-state(expected-hash, owner)` on the core contract.
7. Use the helper route only when:
- chunk count is `1..30`
- upload state is `none`
- the environment can safely build a helper transaction
8. Use the staged route when:
- chunk count is above `30`
- an upload session already exists
- helper is disabled or unreliable
9. If dependencies are present:
- helper route -> `mint-small-single-tx-recursive`
- staged route -> `seal-recursive`
10. Do not hardcode Agent 27 rules such as `[107]` unless the caller explicitly
asked for that exact recursive lineage.

## Rolling Hash Rule

Do not hash the whole file as one blob. Xtrata expects an incremental chain:

```text
running-hash = 32 zero bytes
for each chunk:
  running-hash = SHA-256(running-hash || chunk)
expected-hash = running-hash
```

That final `expected-hash` is reused across `begin-or-get`,
`add-chunk-batch`, helper calls, and the final seal.

## Write Paths

### Helper Path

Use only for fresh uploads of `1..30` chunks.

- non-recursive: `mint-small-single-tx`
- recursive: `mint-small-single-tx-recursive`

This helper collapses begin, upload, and seal into one wallet transaction, but
the protocol economics are still the same as begin + seal.

### Staged Path

Use for large files, resumable uploads, or helper-disabled environments.

1. `begin-or-get`
2. `add-chunk-batch` one or more times
3. `seal-inscription` or `seal-recursive`

If `get-upload-state` returns an active session, stay on this path and resume.
Do not switch to the helper mid-attempt.

## Read-Only Calls You Usually Need

- `get-id-by-hash(hash)` -> canonical token ID for duplicate content
- `get-upload-state(hash, owner)` -> resume information
- `get-fee-unit()` -> current protocol fee unit in microSTX
- `get-last-token-id()` -> optional, for reporting or expected mint range
- `get-dependencies(id)` -> optional, for validating recursive parents

## Fee Rules

Always query `get-fee-unit()` immediately before building write transactions.

- begin fee = `fee-unit`
- seal fee = `fee-unit * (1 + ceil(total_chunks / 50))`
- helper spend cap = `begin fee + seal fee`
- `add-chunk-batch` has no protocol fee transfer

Always use deny-mode spend caps on fee-paying transactions.

## AIBTC Tooling Split

Safe through AIBTC MCP:

- get wallet info
- get STX balance
- read-only contract calls
- transaction status polling

Prefer the Stacks SDK directly for buffer-heavy write calls:

- `add-chunk-batch`
- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

Reason: `list(buff)` payloads can be mangled by generic contract-call tooling.
If the agent runtime cannot prove that raw chunk buffers survive intact, use the
SDK for those writes.

## Recommended Run Loop

1. Gather inputs:
- byte payload
- MIME type
- token URI
- optional dependency token IDs
2. Validate limits:
- size <= `32 MiB`
- chunk count <= `2,048`
- MIME <= `64` ASCII chars
- token URI <= `256` ASCII chars
3. Chunk the payload and compute `expected-hash`.
4. Query:
- wallet address
- STX balance
- `get-fee-unit`
- `get-id-by-hash`
- `get-upload-state`
5. If duplicate content exists, return the canonical token ID without minting.
6. Select helper or staged route.
7. Execute the route:
- helper -> one helper tx
- staged -> begin, upload remaining chunk batches, then seal
8. Poll until the transaction succeeds or aborts explicitly.
9. Return a structured result.

## Structured Result Format

Return something shaped like:

```json
{
  "route": "helper-recursive",
  "tokenId": 1234,
  "existed": false,
  "expectedHash": "0x...",
  "mimeType": "text/html",
  "totalSize": 9876,
  "totalChunks": 1,
  "dependencies": [42],
  "txids": ["0x..."]
}
```

## Failure Handling

- duplicate hash -> reuse the canonical token ID from `get-id-by-hash`
- active upload state -> stay on staged route and resume from `current-index`
- helper invalid batch -> route to staged flow
- dependency missing -> verify parents exist before recursive seal
- hash mismatch -> recompute chunks and restart from clean local data
- post-condition failure -> refetch `get-fee-unit` and rebuild
- paused contract -> wait and retry later
- expired upload session -> restart from `begin-or-get`

## Safety Rules

- preserve chunk order exactly from the original payload
- never seal until all chunks are uploaded
- never fabricate dependency IDs
- never assume the current fee unit; query it
- never switch routes mid-upload
- never treat token URI as the canonical content location

## Scope Boundary

This skill is for a single inscription flow. If the user wants:

- a 2-50 item drop -> use `xtrata-batch-mint`
- Agent 27-specific recursive minting -> add the exact dependency rule the task specifies
- transfers, batch seals, or collection-contract drops -> use a more specific Xtrata skill
