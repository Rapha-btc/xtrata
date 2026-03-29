# xtrata-market-usdc-v1.0 TODO

## Status
- Current first-party USDCx market line for the active v2 core posture.

## What it does today
- Escrows core assets and settles trades in USDCx.
- Assumes the core NFT contract is the active `xtrata-v2.1.0` line.

## Shortcomings
- Hard-pinned to one core contract principal.
- No built-in path to support a new core without a new deployment.
- No lineage-aware listing migration exists.

## TODO
- Deploy a new USDCx market variant when the canonical core changes.
- Keep payment-token logic separate from core migration logic.
- Update registries and UI defaults only when the new market/core pair is ready.

