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

## Planned package surfaces

- `@xtrata/sdk` (planned)
  - Contract client helpers
  - Typed read-only wrappers
  - Mint flow orchestration helpers (begin -> batch -> seal)
  - Fee and post-condition helpers
- `@xtrata/reconstruction` (planned)
  - Deterministic chunk assembly
  - Hash verification and content integrity checks
  - Recursive dependency resolution helpers

## Supporting artifacts

- `docs/sdk/roadmap.md`
- `docs/sdk/js-package-plan.md`
- `docs/sdk/reconstruction-library-plan.md`
- `docs/sdk/example-repos-plan.md`

## Positioning rule

Use "Built using Xtrata Protocol" language in first-party and partner-facing surfaces where relevant.


