# Execution Checklist

This file is the compact runbook.
For full implementation tracking across all phases, use `06-full-implementation-checklist.md` as the source of truth.

## Pre-Implementation

1. Read `docs/app-reference.md`.
2. Read `docs/assumptions.md`.
3. Read all files in `Refactor-Plans/parent-child-implementation`.
4. Run baseline `npm run test:app`.

## Implementation Order

1. Implement `src/lib/mint/dependencies.ts` and tests.
2. Extend `src/lib/mint/attempt-cache.ts` and tests.
3. Update `src/screens/MintScreen.tsx` UI and seal logic.
4. Add viewer-to-mint handoff in `src/App.tsx` and `src/screens/ViewerScreen.tsx`.
5. Add `src/lib/viewer/relationships.ts` and tests.
6. Wire relationship UI in `src/screens/ViewerScreen.tsx`.
7. Add/update clarinet tests.
8. Update docs.

## Implementation Guardrails

1. Do not change contract sources for this project.
2. Do not change mint sequence order.
3. Do not add automatic background full-collection scans.
4. Keep grid and preview square behavior unchanged.
5. Keep network guard and wallet session behavior unchanged.

## Done Criteria

1. Multi-parent recursive mint works end-to-end.
2. Resume preserves dependencies.
3. Parents and children view flows are working.
4. Required tests pass.
5. Docs updated with file references and workflow.

## Post-Implementation Validation

1. Verify no regressions in `MintScreen`, `ViewerScreen`, `CollectionMintScreen`.
2. Verify no unexpected increase in read-only call volume while idle.
3. Capture final implementation summary with changed files and rationale.
