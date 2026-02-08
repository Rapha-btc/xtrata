# Changes From v1.1.1

This document highlights what stays the same and what changes in v2.1.0.

## Unchanged (carried over from v1.1.1)
- Same SIP-009 NFT interface and transfer behavior.
- Same chunking rules, upload state model, and hashing scheme.
- Same dedupe rules (`HashToId`) for content-addressed uniqueness.
- Same fee model and fee bounds (begin fee + seal fee multiplier).
- Same recursive dependency model (`seal-recursive`).
- Same expiry and purge mechanics for uploads.
- Same read-only helpers for meta, chunks, and SVG placeholders.

## New in v2.1.0
- Allowlisted contract callers can inscribe while paused.
- `set-next-id` allows a one-time offset so IDs continue from v1.1.1.
- `migrate-from-v1` allows optional migration of v1 tokens into v2.
- Minted index helpers: `get-minted-count` and `get-minted-id`.
- Additional maps: `AllowedCallers`, `MintedIndex`, `MigratedFromV1`.
- Additional data vars: `offset-set`, `minted-count`, `max-minted-id`.

## Behavioral changes
- `get-last-token-id` returns the highest minted ID, not `next-id - 1`.
  This supports non-contiguous IDs after migration or offsets.
- The paused gate checks `contract-caller` (not `tx-sender`).
  Direct user wallets are not implicitly allowlisted.

## Compatibility notes
- Existing mint flows (`begin`, `add-chunk-batch`, `seal`) continue to work.
- Indexers should not assume contiguous IDs in v2.
  Use `get-minted-count` + `get-minted-id` for enumeration.
- Migrated tokens use v1 chunk data. Clients should fall back to v1 for content.
