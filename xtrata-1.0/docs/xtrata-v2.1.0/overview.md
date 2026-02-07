# Xtrata v2.1.0 Overview

Xtrata v2.1.0 is a superset of v1.1.1. It preserves the same inscription pipeline,
content addressing rules, and SIP-009 compatibility while adding migration and
administrative tooling for continuity across versions.

## Scope
- Contract: `xtrata-v2.1.0`.
- Legacy baseline: `xtrata-v1.1.1`.
- Primary goals: keep collection continuity, enable partner minting, and allow
  optional migration of legacy IDs without breaking the existing collection.

## Carried over from v1.1.1
- SIP-009 compliance and standard NFT transfer semantics.
- Chunked uploads with resumable `begin -> add-chunk-batch -> seal` flow.
- Content-addressed uniqueness (hash dedupe via `HashToId`).
- Immutable content once sealed.
- Optional recursive dependencies recorded at seal time.
- Upload session expiry, abandonment, and purge mechanics.
- One-knob fee model (fee unit + seal batch multiplier).
- Read-only helpers for metadata, ownership, hashes, chunks, and SVG placeholder.
- Pause semantics: pauses inscription writes only, never transfers or reads.

## New in v2.1.0
- Allowlisted contract callers can inscribe while paused (uses `contract-caller`).
- One-time `next-id` offset to continue IDs from v1.1.1.
- Optional `migrate-from-v1` flow: escrow v1 token and mint same ID in v2.
- Minted index helpers for enumeration (`get-minted-count`, `get-minted-id`).
- Track highest minted ID (`get-last-token-id` now returns max minted id).

## Core invariants and limits
- Chunk size is fixed at 16,384 bytes.
- Max chunks per inscription is 2,048.
- Max total size is 32 MiB (2,048 * 16,384).
- Batch size for chunk upload and batch sealing is capped at 50.
- Uploads expire after `UPLOAD-EXPIRY-BLOCKS` if inactive.

## Design notes and limitations
- `get-last-token-id` reports the highest minted ID, not the count of mints.
  IDs may be non-contiguous after migration or an offset.
- Migration copies metadata and token URI into v2, but chunk data remains in v1.
  Clients should read chunk data from v1 for migrated tokens.
- The allowlist checks `contract-caller` (not `tx-sender`), so it is intended
  for approved helper contracts, not direct user wallets.
