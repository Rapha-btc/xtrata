# xtrata-market-stx-v1.0 TODO

## Status
- Current first-party STX market line for the active v2 core posture.

## What it does today
- Escrows core assets and settles trades in STX.
- Assumes the core NFT contract is the active `xtrata-v2.1.0` line.

## Shortcomings
- Hard-pinned to one core contract principal.
- Needs a redeploy or new market line if the core moves to a new contract.
- No migration-aware listing bridge exists across core versions.

## TODO
- If the core changes, deploy a matching STX market variant for that core.
- Keep listing state isolated per core line unless a deliberate cross-line migration tool is built.
- Update app market defaults only after the new market and core are both live.

