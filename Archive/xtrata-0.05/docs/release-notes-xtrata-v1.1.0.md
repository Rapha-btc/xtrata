# xtrata-v1.1.0 Release Notes

Date: January 27, 2026

## Summary
- Backward-compatible upgrade with new batch sealing and richer read-only helpers.
- No UI changes required for existing app flows.

## New Features
- Batch sealing: `seal-inscription-batch` mints a contiguous range of IDs within a single transaction (max 50 items).
- New read-only helpers for compatibility and diagnostics:
  - `inscription-exists`
  - `get-inscription-hash`
  - `get-inscription-creator`
  - `get-inscription-size`
  - `get-inscription-chunks`
  - `is-inscription-sealed`
  - `get-token-uri-raw`

## Safety / Correctness Updates
- Batch sealing re-validates each item at commit time (expiry, hash, chunks, URI, duplicates).
- Recursive sealing writes dependencies before minting to keep intent atomic.
- Documentation clarifies that open participation applies once unpaused.

## Compatibility
- All existing public functions remain unchanged.
- Existing clients remain compatible; batch sealing is opt-in.
