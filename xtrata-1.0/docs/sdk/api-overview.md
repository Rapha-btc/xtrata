# SDK API Overview

This is the fastest way to choose the right API surface.

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

## Advanced path

Use low-level modules only when needed:

- `client` for explicit read/call builders
- `mint` for chunking, hashing, fee, and post-condition primitives
- `safe` for deterministic spend caps + guided mint flow statuses
- `workflows` for high-level write transaction plans
- `deploy` for template injection and contract naming
- `collections` and `market` for standalone helper logic

## Suggested progression

1. Start with `simple`.
2. Add `workflows` for write transaction plans.
3. Add `mint` helpers for custom fee/cap tuning.
4. Use `client` builders only for fully custom transaction orchestration.
