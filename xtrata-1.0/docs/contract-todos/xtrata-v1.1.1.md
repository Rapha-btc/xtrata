# xtrata-v1.1.1 TODO

## Status
- Legacy core line.
- Still matters because legacy ownership, legacy content, and legacy market compatibility remain in the repo.

## What it does today
- Stores recursive references as one on-chain dependency list.
- Treats dependencies as same-contract `uint` token ids.
- Does not expose minted-index helpers for robust non-contiguous enumeration.

## Shortcomings
- Dependency and parent/child provenance are conflated.
- No ownership-gated parent concept exists.
- No cross-contract reference model exists.
- Not a good place for new feature expansion because the migration path already moved forward into v2.

## TODO
- Keep this line stable for legacy continuity only.
- Do not add new parent/child semantics here unless there is a hard requirement to support them directly on v1.
- Preserve read paths so migrated content can still fall back to v1 chunk data.
- Keep a clear retirement plan for legacy market usage pinned to v1.

## Parent/child note
- If legacy v1 items must become normal parents in a future core line, migrate them into that new line rather than extending v1 in place.

