# xtrata-v2.1.0 TODO

## Status
- Current first-party production core assumption in this repo.
- App defaults, public config, and several surrounding contracts still assume this contract line.

## What it does today
- Stores one dependency list per inscription.
- Validates dependencies by same-contract existence at seal time.
- Supports migration from `xtrata-v1.1.1` with same-id minting into v2.
- Keeps recursive references and intended parent-style references in the same field.

## Current dependency logic
- `dependency` is currently just `uint token-id`.
- Dependencies must already exist in the same core contract.
- The contract checks existence, not ownership, when accepting dependencies.
- This means recursion works, but parent/child provenance is not modeled separately.

## Shortcomings
- Dependency and parent/child provenance are conflated.
- The contract cannot express:
  - dependency only
  - parent only
  - both dependency and parent
- A caller does not need to own a dependency for it to be recorded.
- References are same-contract only. There is no `{ contract, token-id }` model.
- Migration records do not expose a general source-contract lineage map for clients.

## TODO
- Keep `InscriptionDependencies` as content-resolution only.
- Add a separate parent model:
  - `InscriptionParents` or similar child-to-parent map
  - `get-parents(id)` read-only
  - deterministic child lookup strategy, either indexed or contract-assisted
- Add a parent-aware seal path:
  - verify `tx-sender` owns each declared parent at seal time
  - decide whether multiple parents are allowed
  - decide whether parent order should be canonicalized
- Leave pure dependencies ownership-free so any existing file can be reused in recursion.
- Add explicit lineage metadata for migrated items:
  - source contract
  - source token id if same-id continuity is ever broken

## Upgrade direction
- If a new v3 core is created, do not restart ids at `u0` if legacy items are expected to migrate and become normal v3 parents.
- Continue the same id line with `set-next-id(...)`.
- Add migration from v1 and v2 into the next core line if old items need to participate in regular parent/child relationships there.

## Parent/child target model
- `dependency` = content reference for recursion or composition.
- `parent` = ownership-gated provenance relationship.
- The same inscription may be both, but the chain data should store those roles separately.

