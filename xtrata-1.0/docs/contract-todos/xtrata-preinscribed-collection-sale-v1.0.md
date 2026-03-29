# xtrata-preinscribed-collection-sale-v1.0 TODO

## Status
- Active pre-inscribed collection sale template.
- Designed for escrowing already-minted tokens and selling fixed inventory.

## What it does today
- Locks to one baked core contract principal.
- Escrows specific token ids from that core line.
- Handles sale windows, allowlists, wallet limits, and payout splits.

## Shortcomings
- Hard-pinned to the current core line at deployment.
- Cannot bridge inventory across multiple core contracts.
- Has no special awareness of future parent/child provenance semantics.

## TODO
- If the core line changes, deploy a new sale contract variant for the new core.
- Keep this contract inventory-oriented rather than recursion-oriented.
- Decide whether migrated legacy tokens sold through this contract must already exist in the active core first.
- Document clearly that parent/child and dependency rules belong to the core protocol, not this sale layer.

