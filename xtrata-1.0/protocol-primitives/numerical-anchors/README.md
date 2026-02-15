# Numerical Anchors: First 256 Roadmap

This folder defines a practical roadmap for turning early inscription numbers
into long-lived Xtrata protocol primitives.

Goal: make inscriptions `1..256` a stable, composable Layer-0 registry
that future builders can recursively depend on.

## Scope

- Establish a clear slot strategy for inscriptions `1..256`.
- Reserve high-signal anchor numbers for foundational primitives.
- Define how each primitive is specified, reviewed, and locked.
- Provide an execution plan for inscribing and maintaining the set.

## Structure

- `docs/01-vision-and-principles.md`
- `docs/02-taxonomy-and-numbering.md`
- `docs/03-first-256-roadmap.md`
- `docs/04-primitive-spec-template.md`
- `docs/05-anchor-seed-registry-v1.md`
- `plans/01-delivery-phases.md`
- `plans/02-inscription-runbook.md`
- `plans/03-governance-and-change-control.md`

## Current Intent

The first lock candidates remain:

- `64` binary rules
- `88` audio root
- `100` genesis manifest
- `101` builder starter
- `128` chunk boundary
- `256` hash verification
- `404` failure handler (outside first 256, but keep reserved in future ranges)
