# SDK API Overview

This is the fastest way to choose the right API surface.

If you are brand new, start with `docs/sdk/quickstart-first-30-minutes.md`.

## Default path (recommended)

Use `simple` when you want minimal setup and clear read helpers.

- `createXtrataReadClient`
- `createCollectionReadClient`
- `createMarketReadClient`
- `createSimpleSdk`

These clients:
- bind sender once
- hide repetitive call plumbing
- expose convenience snapshots (`getTokenSnapshot`, `getSnapshot`)

For write transactions, use `workflows` to prebuild deny-mode call payloads:
- `buildCoreMintWorkflowPlan`
- `buildCollectionMintWorkflowPlan`
- `buildMarketListWorkflowPlan`
- `buildMarketBuyWorkflowPlan`
- `buildMarketCancelWorkflowPlan`

Workflow guardrails:
- malformed inputs now fail fast with `SdkValidationError`
- network-mismatched contracts are rejected before call payload generation
- deterministic spend-cap prerequisites are enforced (known mint price + fee unit)

Collection-mint note:
- Active SDK support target is `xtrata-collection-mint-v1.4`.
- Legacy collection-mint `v1.0` and `v1.1` are archived for new SDK work.

## Advanced path

Use low-level modules only when needed:

- `client` for explicit read/call builders
- `mint` for chunking, hashing, fee, and post-condition primitives
- `safe` for deterministic spend caps + guided mint flow statuses
- `safe` for deterministic spend caps + guided recovery helpers (`buildMintRecoveryGuide`)
- `workflows` for high-level write transaction plans
- `deploy` for template injection and contract naming
- `collections` and `market` for standalone helper logic

## Suggested progression

1. Start with `simple`.
2. Add `workflows` for write transaction plans.
3. Add `mint` helpers for custom fee/cap tuning.
4. Use `client` builders only for fully custom transaction orchestration.

## API stability notes (current)

- Public export availability is now enforced by package tests:
  - `packages/xtrata-sdk/src/__tests__/exports.test.ts`
  - `packages/xtrata-reconstruction/src/__tests__/exports.test.ts`
- Capability and error-code API contracts are now enforced by:
  - `packages/xtrata-sdk/src/__tests__/capabilities.test.ts`
  - `packages/xtrata-sdk/src/__tests__/errors.test.ts`
- Packaging smoke verifies package + subpath imports from packed artifacts:
  - `@xtrata/sdk`
  - `@xtrata/sdk/simple`
  - `@xtrata/sdk/workflows`
  - `@xtrata/reconstruction`
