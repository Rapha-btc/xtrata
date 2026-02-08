# XST Token v1.0 (Comparison Notes)

Purpose
- Baseline XST emissions contract with owner + participant pools.
- No lineage (parent/child) bonus logic.

Key behavior
- Emissions start after inscription #1000 exists (lazy start on first call).
- 70% owner pool, 30% participant pool.
- Owner weight is fixed by token id tier.
- Participant weight is sqrt-style (banded) by number of inscriptions owned.

Notable state and readers
- `get-inscription-weight` returns base weight only.
- No parent or lineage maps.
- No child count tracking.

Use this file to compare
- Any change in total-owner-weight growth vs v1.1.
- Claim amounts for children with dependencies (should be identical to a normal mint).

Deployment note
- This contract calls `.xtrata-v2-1-0` directly. Deploy from the same principal as `xtrata-v2-1-0`, or change the contract call targets before mainnet deploy.
