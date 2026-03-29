# xtrata-commerce TODO

## Status
- Active entitlement commerce line.
- Separate from ownership transfer and market escrow.

## What it does today
- References Xtrata asset ids for entitlement sales.
- Uses the core contract as the ownership authority for asset control checks.

## Shortcomings
- Hard-pinned to one core contract principal.
- Cannot serve a new core line without a new deployment.
- No multi-core entitlement model exists.

## TODO
- Deploy a new commerce contract variant when the canonical core changes.
- Decide whether entitlements should be per asset id only or per `{ core contract, asset id }`.
- Keep parent/child semantics out of this layer unless entitlement products explicitly need them.

