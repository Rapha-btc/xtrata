# xtrata-collection-mint-v1.4 TODO

## Status
- Current collection-mint template line in the repo.
- Production-facing for new collection deploys through the manage flow.

## What it does today
- Locks each deployed collection contract to one baked-in core contract principal.
- Routes collection mint sessions into the core `xtrata` contract.
- Supports default dependencies, but those inherit the current core dependency semantics.

## Shortcomings
- Existing deployed collection contracts cannot be repointed to a new core line.
- The template can target a different core at deploy time, but already-deployed contracts stay locked.
- Default dependencies are not separate from future parent/child provenance because the core line does not separate them yet.

## TODO
- Keep this template as the latest collection line unless a new core requires a breaking collection upgrade.
- If a new core line is adopted, deploy a matching collection template revision or formally approve continued use of `v1.4` with a new baked core target.
- Do not overload collection-level default dependencies as default parents.
- If parent/child becomes a separate protocol feature, keep collection defaults dependency-only unless there is an explicit product need for collection-level parent rules.
- Add a clear migration note for already-deployed collections:
  - old deployments stay on their original core
  - new deployments can target the new core
  - no silent "repoint" expectation

