# XST oracle inscription

## Goal
Create one permanent inscription that renders live XST stats for the entire emission period.

This inscription is not a smart-contract oracle. It is a static on-chain HTML/JS viewer that reads live data from the chain and indexers.

## Content format
- HTML + minimal JS embedded in the inscription payload.
- Must be fully self-contained (no external build pipeline required after mint).
- All configuration is embedded as constants (contract IDs, network).

## Data sources
- Stacks node call-read endpoints:
  - XST contract read-onlys (emissions + totals)
  - Xtrata contract read-onlys (last token id, ownership)
- Indexer endpoints for holder distribution snapshots:
  - Token holders list (if indexer supports SIP-010)
  - Optionally cache a top-holders list and totals

## Viewer sections
- Emission status
  - start block
  - blocks elapsed
  - year index
  - per-block rate
  - total emitted / remaining
- Distribution
  - owner pool totals
  - participant pool totals
  - top holder distribution (if available)
- Claim estimation
  - input: inscription ID
  - output: estimated claimable XST

## Implementation approach
- Use fetch() to the Stacks API call-read endpoints.
- Cache results locally in memory and refresh on a timer.
- Degrade gracefully if any endpoint fails.

## Durability considerations
- The inscription is immutable, but still live because it reads current chain state.
- Use multiple API base URLs if possible (primary + fallback).
- Avoid heavy, continuous polling; prefer a 30-60s refresh interval.

## Security notes
- The viewer is informational only. It must never prompt transactions.
- Do not embed private keys or signing logic.
