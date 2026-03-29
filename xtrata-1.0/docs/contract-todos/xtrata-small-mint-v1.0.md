# xtrata-small-mint-v1.0 TODO

## Status
- Helper contract, not the canonical ownership ledger.
- Easier to retarget than most first-party contracts because the core contract is configurable.

## What it does today
- Wraps `begin-or-get -> add-chunk-batch -> seal`.
- Supports recursive sealing through the current core contract.
- Can update its core target via admin control.

## Shortcomings
- It only mirrors whatever semantics the target core exposes.
- It does not help distinguish dependency-only references from parent/child provenance.
- It does not provide a dedicated helper path for future parent-aware seal operations.

## TODO
- Keep the helper configurable for the active core line.
- If the next core adds a parent-aware seal entrypoint, add a matching helper wrapper here.
- Preserve the distinction:
  - recursive dependency helper path
  - parent-aware helper path
- Keep duplicate short-circuit behavior aligned with the active core contract.
