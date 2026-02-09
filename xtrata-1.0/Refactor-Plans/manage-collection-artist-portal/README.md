# Manage Collection Artist Portal Plan Pack

Purpose: implementation-ready plan for an allowlisted artist collection-management
page where artists can:

1. deploy their own `xtrata-collection-mint-v1.0` contract,
2. configure collection settings (price, splits, caps, allowlist mode),
3. define collection identity (display name + metadata),
4. upload a folder of assets that buyers can mint from.

This pack is written so a new assistant can implement without rediscovery.

## Scope

In scope:

1. Contract v1.0-aware product design.
2. Artist access gating and collection ownership checks.
3. Guided deploy/setup flow.
4. Off-chain asset staging + manifest workflow for buyer mints.
5. Testing, rollout, and operational safeguards.

Out of scope for MVP:

1. Immediate replacement of `xtrata-collection-mint-v1.0`.
2. New market contract design.
3. Full on-chain manifest claim registry (covered as post-MVP option).

## Documents

1. `01-contract-v1-0-capabilities-and-gaps.md`
Contract truth model and product implications.

2. `02-product-options-and-design-decisions.md`
Option matrix with recommended decisions and tradeoffs.

3. `03-target-architecture-and-access-model.md`
Target page architecture, access model, and service boundaries.

4. `04-implementation-plan.md`
Phased implementation plan with file-level touchpoints.

5. `05-data-model-api-and-workflows.md`
Data contracts, APIs, and workflow specs.

6. `06-test-and-validation-plan.md`
Unit/integration/manual validation plan.

7. `07-rollout-checklist.md`
Execution checklist for safe launch.

8. `08-context-map.md`
Code navigation map of current and planned files.

## Quick Start

1. Read `docs/app-reference.md` first.
2. Read `01-contract-v1-0-capabilities-and-gaps.md`.
3. Lock decisions in `02-product-options-and-design-decisions.md`.
4. Implement phases in `04-implementation-plan.md`.
5. Validate against `06-test-and-validation-plan.md`.
