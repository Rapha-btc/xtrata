# xtrata-v2.1.0 Release Notes

Date: February 7, 2026

## Summary
- Backward-compatible upgrade on top of v1.1.1.
- Adds allowlisted contract callers, migration tooling, and minted indexing.
- Keeps core inscription flow and fee model unchanged.

## New Features
- Allowlisted contract callers can inscribe while paused.
- One-time ID offset with `set-next-id`.
- Optional v1 to v2 migration via `migrate-from-v1`.
- Minted enumeration helpers (`get-minted-count`, `get-minted-id`).

## Behavior Changes
- `get-last-token-id` now returns the highest minted ID.
- Paused check uses `contract-caller` (intended for helper contracts).

## Compatibility
- Existing mint flows remain valid.
- Indexers should not assume contiguous IDs in v2.
- Migrated tokens store metadata in v2 while content remains in v1.

## Known Limitations
- Migration does not copy chunk data into v2.
- There is no reverse migration path for escrowed v1 tokens.
