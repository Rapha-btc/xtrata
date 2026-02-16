# `@xtrata/sdk` Plan (Simple JS Package)

Goal: ship a simple, typed JS/TS package that covers the most common integrator workflows.

## Scope

1. Contract targeting
   - Contract id parsing and validation
   - Network inference and config helpers
2. Read-only client
   - Typed wrappers for frequently used read-only calls
   - Shared error and retry behavior
3. Mint helpers
   - Begin/add-chunk/seal orchestration utilities
   - Fee-cap and post-condition helpers
   - Resume-friendly progress primitives
   - High-level workflow plans for mint + collection mint
4. Collection-mint helpers
   - Contract status snapshot helpers
   - Published/live eligibility helpers
5. Market helpers
   - List/buy/cancel workflow plans with deny-mode post-conditions

## Proposed module layout

- `packages/xtrata-sdk/src/config.ts`
- `packages/xtrata-sdk/src/network.ts`
- `packages/xtrata-sdk/src/client.ts`
- `packages/xtrata-sdk/src/simple.ts`
- `packages/xtrata-sdk/src/safe.ts`
- `packages/xtrata-sdk/src/workflows.ts`
- `packages/xtrata-sdk/src/mint.ts`
- `packages/xtrata-sdk/src/collections.ts`
- `packages/xtrata-sdk/src/market.ts`
- `packages/xtrata-sdk/src/deploy.ts`
- `packages/xtrata-sdk/src/errors.ts`
- `packages/xtrata-sdk/src/types.ts`

## Stability model

- Public exports only from package root and documented subpaths.
- No direct dependency on React components.
- Keep transport pluggable where possible (wallet adapter and read-only transport).

## Testing requirements

- Unit tests for all exported helpers.
- Fixture-based tests for mint fee and post-condition calculations.
- Contract-version compatibility tests where behavior differs.

## Documentation requirements

- One quickstart for read-only integration.
- One quickstart for mint flow integration.
- One quickstart for collection-mint status and lifecycle checks.
