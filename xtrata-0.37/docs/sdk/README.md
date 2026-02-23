# Xtrata SDK Program

Purpose: move Xtrata toward a protocol-team model where third parties build products on top while first-party surfaces remain stable references.

## Strategy

- Keep marketplace and app live.
- Remove growth pressure from first-party marketplace features.
- Prioritize reusable protocol tooling: SDK, reconstruction library, docs, examples.
- Treat first-party app modules as reference SDK consumers.

## Core outcomes

1. Third parties can mint, read, and reconstruct without copying app internals.
2. Integrators can launch their own marketplaces, games, and campaign products with low setup cost.
3. Xtrata protocol fees remain the shared base layer while ecosystem products differentiate on top.

## Implemented workspace packages

- `packages/xtrata-sdk` (`@xtrata/sdk`)
  - Contract config + network helpers
  - Typed read-only clients (`xtrata`, `collection mint`, `market`)
  - Simple Mode wrappers (bind sender once, minimal setup)
  - Safe transaction helpers (deterministic caps + guided flow states)
  - High-level workflow planners (core mint, collection mint, market list/buy/cancel)
  - Mint flow call builders + fee/post-condition helpers
  - Collection lifecycle + random-drop + reservation helpers
  - Deploy helper primitives (symbol/slug/contract naming + template injection)
- `packages/xtrata-reconstruction` (`@xtrata/reconstruction`)
  - Deterministic chunk assembly
  - Hash verification and diagnostics
  - Dependency graph resolution
  - End-to-end reconstruction helper

## Supporting artifacts

- `docs/sdk/roadmap.md`
- `docs/sdk/api-overview.md`
- `docs/sdk/js-package-plan.md`
- `docs/sdk/reconstruction-library-plan.md`
- `docs/sdk/example-repos-plan.md`
- `docs/sdk/quickstart-read-only.md`
- `docs/sdk/quickstart-mint.md`
- `docs/sdk/quickstart-collection-mint.md`
- `docs/sdk/quickstart-simple-mode.md`
- `docs/sdk/quickstart-safe-transactions.md`
- `docs/sdk/quickstart-workflows.md`

## Positioning rule

Use "Built using Xtrata Protocol" language in first-party and partner-facing surfaces where relevant.
