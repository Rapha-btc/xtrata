# Optimisation Triage Plan

Status: draft active plan
Date: February 17, 2026

## Prioritisation model

- Impact: user-perceived performance + maintainability gain.
- Effort: engineering time and coordination overhead.
- Risk: likelihood of behavior regression.

Priority labels:

- `P0` quick wins: high impact, low-medium effort, low risk.
- `P1` structural: high impact, medium-high effort, medium risk.
- `P2` deeper enhancements: medium impact or high complexity.

---

## Phase 0: Setup and guardrails (start here)

Goal: create safe execution envelope before larger refactors.

Tasks:

1. `OPT-000` Confirm baseline snapshots and capture current build output.
2. `OPT-001` Define per-workstream acceptance checks and commands.
3. `OPT-002` Create progress log section in this file for each completed task.

Exit criteria:

- Baseline is documented and reproducible.
- Each phase below has concrete acceptance criteria.

---

## Phase 1 (`P0`): Immediate streamlining wins

Goal: reduce bundle pressure and duplicate logic with minimal behavior change.

Tasks:

1. `OPT-101` Add lazy loading for heavy secondary screens/modules.
   - Files: `src/App.tsx`, `src/PublicApp.tsx`, `src/screens/*`.
   - Acceptance:
     - Build passes.
     - Entry chunk reduced vs baseline.
2. `OPT-102` Extract shared manage collection model + parser helpers.
   - Files: `src/manage/lib/*`, manage panel components.
   - Acceptance:
     - Duplicate collection type declarations removed.
     - Manage behavior unchanged.
3. `OPT-103` Extract shared manage collection-fetch hook.
   - Files: `src/manage/lib/*`, `src/manage/components/*`.
   - Acceptance:
     - Reused by at least 3 panels.
     - Error handling remains equivalent.
4. `OPT-104` Remove dead/commented legacy blocks where no longer needed.
   - Files: `src/PublicApp.tsx`, nearby docs config blocks.
   - Acceptance:
     - No dead topic references remain.

Phase 1 exit gate:

- `npm run build` passes.
- No UX regression in public docs + manage portal basic flows.

---

## Phase 2 (`P1`): Structural decomposition

Goal: make large modules easier to reason about and cheaper to evolve.

Tasks:

1. `OPT-201` Break `ViewerScreen` into feature hooks + subcomponents.
2. `OPT-202` Break `MintScreen` flow orchestration into smaller hooks.
3. `OPT-203` Break `CollectionMintScreen` into staged modules.
4. `OPT-204` Refactor `CollectionSettingsPanel` and `OwnerOversightPanel` into layered sections.

Acceptance:

- Net line count reduction in monolithic files.
- Equivalent UX behavior in major flows.
- New extracted units include focused tests where logic moved.

Phase 2 exit gate:

- Build + relevant tests pass.
- Largest-file list shows measurable reduction.

---

## Phase 3 (`P1`): CSS and layout streamlining

Goal: reduce style coupling and improve maintainability without visual drift.

Tasks:

1. `OPT-301` Split `src/styles/app.css` into scoped files:
   - `styles/base.css`
   - `styles/public.css`
   - `styles/manage.css`
   - `styles/viewer.css`
   - `styles/admin.css`
2. `OPT-302` Move shared tokens/utilities to one source of truth.
3. `OPT-303` Remove duplicate selectors and stale style blocks.

Acceptance:

- No visual regressions in key pages.
- Main CSS file size reduced; scoped files easier to navigate.

---

## Phase 4 (`P1`): Data path and cache efficiency

Goal: reduce unnecessary work in viewer/content and network-bound flows.

Tasks:

1. `OPT-401` Consolidate viewer content resolution stages.
2. `OPT-402` Tighten cache keying and preview/grid reuse path.
3. `OPT-403` Improve bounded retries and polling strategy reuse.

Acceptance:

- Fewer redundant content fetches in typical viewer flow.
- No loss of correctness in rendered media.

---

## Phase 5 (`P2`): SDK and app convergence

Goal: reduce duplicate protocol logic and improve shared correctness.

Tasks:

1. `OPT-501` Map overlap between app contract helpers and SDK modules.
2. `OPT-502` Move selected reusable logic behind shared SDK-friendly interfaces.
3. `OPT-503` Update app integration points to consume shared wrappers where safe.

Acceptance:

- Less duplicated logic between app and SDK paths.
- SDK docs/tests updated when behavior contracts change.

---

## Phase 6 (`P2`): Hardening and follow-through

Goal: lock in gains and prevent regressions.

Tasks:

1. `OPT-601` Add optimisation regression checklist to release flow.
2. `OPT-602` Update baseline snapshot after each completed phase.
3. `OPT-603` Archive completed tasks and open next-cycle candidates.

Acceptance:

- Optimisation status is always current.
- Future refactors have clear starting context.

---

## Initial execution order (recommended)

1. `OPT-101`
2. `OPT-102`
3. `OPT-103`
4. `OPT-104`
5. `OPT-201`

This sequence should deliver the fastest visible gains with low disruption.

---

## Progress log

- Pending first execution cycle.
