# xtrata-market-sbtc-v1.0 TODO

## Status
- Current first-party sBTC market line for the active v2 core posture.

## What it does today
- Escrows core assets and settles trades in sBTC.
- Assumes the core NFT contract is the active `xtrata-v2.1.0` line.

## Shortcomings
- Hard-pinned to one core contract principal.
- No built-in path to support a new core without a new deployment.
- No migration-aware listing continuity exists across core lines.

## TODO
- Deploy a new sBTC market variant when the core contract changes.
- Keep vault logic and market logic separate even if both need a new core target.
- Update first-party defaults only after the new market/core pair is verified.

