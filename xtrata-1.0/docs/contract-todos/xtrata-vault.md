# xtrata-vault TODO

## Status
- Active reserve and premium-state contract line.
- Separate from trading and separate from minting.

## What it does today
- Uses the core contract as the ownership source of truth for vault access.
- Tracks reserve state against core asset ids.

## Shortcomings
- Hard-pinned to one core contract principal.
- Cannot support a new core line without a new deployment.
- No multi-core vault identity model exists.

## TODO
- Deploy a new vault contract variant when the canonical core changes.
- Decide whether vault identity should remain simple `asset-id` or move to `{ core contract, asset id }`.
- Keep vault state concerns separate from dependency or parent/child graph concerns.

