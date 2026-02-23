# XST Token v1.1 (Comparison Notes)

Purpose
- Same emissions model as v1.0, plus a lineage bonus for children.
- Intended to incentivize parent/child relationships without heavy on-chain indexing.

Lineage bonus (new)
- Bonus is added to the child’s base owner weight at first registration.
- Primary parent = dependency with highest tier (highest `weight-for-id`), tie breaks to lowest parent id.
- Bonus formula:
  - `raw = parentWeight * 5%`
  - `linearMultiplier` scales from 100% (child #1) to 0% (child #100)
  - `bonus = min(raw * linearMultiplier, 100)`
- Parent child count increments when a child is registered in XST (not at mint time).

New read-onlys
- `get-parent-child-count(parent-id)`
- `get-inscription-parent(token-id)`
- `get-inscription-lineage-bonus(token-id)`

What to compare vs v1.0
- Owner weight increases for children with dependencies.
- Total owner weight grows slightly faster (bounded by diminishing bonus).
- Claim amounts for child inscriptions rise relative to v1.0.

Deployment note
- This contract calls `.xtrata-v2-1-0` directly. Deploy from the same principal as `xtrata-v2-1-0`, or change the contract call targets before mainnet deploy.
