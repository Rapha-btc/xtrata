# Xtrata v2.1.0 Integration Guide

This guide is for UI clients, indexers, and partner contracts.

## Minting Flow (standard)
1) Compute final hash from chunks.
2) Call `begin-or-get(expected-hash, mime, total-size, total-chunks)`.
   - If it returns (some id), the content already exists.
3) Call `add-chunk-batch(hash, chunks)` until all chunks are uploaded.
4) Call `seal-inscription(expected-hash, token-uri-string)`.

Notes:
- Begin charges fee-unit once.
- Add-chunk-batch does not charge.
- Seal charges fee-unit * (1 + ceil(total-chunks / 50)).

## Batch Sealing
- Use `seal-inscription-batch` to mint multiple items in one transaction.
- Each item pays its own seal fee; total is summed in the batch call.

## Recursive Sealing
- Use `seal-recursive` when dependencies must be recorded.
- All dependency IDs must already exist at seal time.

## Partner Contracts (collection mint)
- If a helper contract should mint while paused, allowlist it:
  `set-allowed-caller(contract, true)`.
- Allowlist checks `contract-caller`, not `tx-sender`.
- Ensure the helper contract calls xtrata methods with the correct
  contract principal argument when required.

## Indexing and Enumeration
- Do not assume contiguous IDs in v2.1.0.
- Use:
  - `get-minted-count()` for total minted in v2.
  - `get-minted-id(index)` to enumerate minted IDs.
- `get-last-token-id()` returns the highest minted ID.

## Reading Content
Recommended read-only calls:
- `get-inscription-meta(id)` for core metadata.
- `get-owner(id)` for ownership.
- `get-token-uri(id)` or `get-token-uri-raw(id)` for token URI.
- `get-chunk-batch(id, indexes)` for content reconstruction.
- `get-dependencies(id)` for recursive references.

## Migration-aware Content Reads
- Migrated tokens store metadata in v2 but chunk data remains in v1.
- If v2 chunk reads return empty, fall back to v1 for chunk data.
- Ownership after migration is on v2; v1 token is escrowed by v2.

## Dedupe and Canonical IDs
- Use `get-id-by-hash(hash)` to detect existing content.
- Prefer `begin-or-get` to avoid redundant uploads.
