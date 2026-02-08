# Detailed Implementation Plan

## Phase Tracking

Use `06-full-implementation-checklist.md` as the active execution tracker for this plan.

1. Start each phase only when its entry checklist is satisfied.
2. Complete all implementation tasks and tests for the phase.
3. Pass the phase exit gate before moving to the next phase.

## Phase 0: Baseline and Safety

1. Confirm no contract source changes are required.
2. Confirm `protocolVersion` remains `1.1.1` capability path.
3. Capture baseline test status before edits.

## Phase 1: Dependency Domain Layer

Goal: one canonical dependency representation and validation flow.

1. Add `src/lib/mint/dependencies.ts`.
2. Implement pure helpers:
   - `parseDependencyInput(raw: string): { ids: bigint[]; invalidTokens: string[] }`
   - `normalizeDependencyIds(ids: bigint[]): bigint[]`
   - `mergeDependencySources(...sources: bigint[][]): bigint[]`
   - `validateDependencyIds(ids: bigint[]): { ok: boolean; reason?: string }`
   - `toDependencyStrings(ids: bigint[]): string[]`
   - `fromDependencyStrings(ids: string[]): bigint[]`
3. Rules:
   - integers only, non-negative, unique, stable order, max 50.
   - no network I/O in this layer.

Acceptance:

1. Canonical functions are deterministic.
2. All parser and validator edge cases covered by unit tests.

## Phase 2: Persist Dependencies in Mint Attempt

Goal: resume safety for recursive mints.

1. Extend `MintAttempt` in `src/lib/mint/attempt-cache.ts`:
   - add optional `dependencyIds: string[]`.
2. Preserve backward compatibility for older stored records.
3. Ensure load/save/clear behavior is unchanged for non-recursive mints.

Acceptance:

1. Existing attempts load without failures.
2. Recursive attempt restores dependencies on reload.

## Phase 3: Mint UI and Seal Flow

Goal: explicit multi-parent designation and recursive sealing.

1. Update `src/screens/MintScreen.tsx`.
2. Add UI state:
   - `dependencyInput` (raw text)
   - `manualDependencyIds` (canonical list)
   - `dependencyUiError` (validation message)
3. Add UI controls:
   - input area accepting comma/space/newline ids
   - add/apply button
   - removable chips or compact list
   - clear all
4. Keep existing delegate flow, but merge with manual parents into one canonical list.
5. Replace all usages of `delegateTargetId ? [delegateTargetId] : []` with canonical `resolvedDependencyIds`.
6. Keep existing mint order unchanged.
7. In seal step:
   - if `resolvedDependencyIds.length > 0`, call `seal-recursive` with list.
   - else keep `seal-inscription` path.
8. Update logs/status text to mention parent count and ids.
9. Update SIP-016 metadata generation to include canonical dependency list.
10. Save `resolvedDependencyIds` into mint attempt cache.
11. On restore/load, hydrate dependency UI from saved attempt.

Acceptance:

1. User can add multiple parents and mint child linked on-chain.
2. Resume flow preserves dependencies exactly.
3. Non-recursive mint flow behaves unchanged.

## Phase 4: Viewer to Mint Parent Handoff

Goal: reduce manual entry and user error.

1. Add parent draft state in `src/App.tsx`.
2. Pass parent-draft callbacks/props to viewer and mint screens.
3. In `src/screens/ViewerScreen.tsx` token details, add action:
   - `Use as parent` for selected token id.
4. Mint screen consumes parent draft ids and merges into canonical dependency list.
5. Add clear action in mint to reset imported draft list.

Acceptance:

1. User can select token in viewer and add it as parent in mint with one click.
2. No layout shifts or preview/grid regressions.

## Phase 5: Viewer Relationship UX (Parents and Children)

Goal: fully functioning relationship viewing.

### 5A. Relationship data module

1. Add `src/lib/viewer/relationships.ts`.
2. Implement:
   - `fetchParents(client, tokenId, senderAddress)` using `getDependencies`.
   - `findChildrenFromKnownTokens(tokenSummaries, parentId)` for cache-first local derivation.
   - `scanChildren(client, parentId, lastTokenId, senderAddress, options)` for explicit full scan.
3. Scan behavior:
   - bounded concurrency.
   - progress callback.
   - cancellation support.
   - respects read-only backoff behavior.

### 5B. Viewer UI wiring

1. Update `src/screens/ViewerScreen.tsx` relationships area:
   - show parents list from read-only call.
   - show children list from quick local derivation.
   - add `Scan full collection` button for full children discovery.
   - show progress and cancel control.
2. Add query keys for relationships in `src/lib/viewer/queries.ts` if needed.

### 5C. Optional persistence for heavy scans

1. If scan cost is high, add cache records in `src/lib/viewer/cache.ts` for children results/checkpoints.
2. Keep cache writes explicit, bounded, and version-safe.

Acceptance:

1. Parents always display accurately for selected child.
2. Children are discoverable and navigable via user-triggered scan.
3. Scan is cancellable and does not auto-run in background.

## Phase 6: Collection Mint Scope Decision

1. Keep `CollectionMintScreen` non-recursive for initial delivery.
2. Explicitly show note in plan/docs that batch seal path does not currently link dependencies.
3. Optionally plan a future `recursive collection mint` flow as separate project.

Acceptance:

1. No regression in collection mint behavior.
2. Scope remains tractable and safe.

## Phase 7: Docs and Developer Guidance

1. Update `docs/recursive-inscriptions.md` with new mint and viewer UX.
2. Update `docs/app-reference.md` with new modules and touchpoints.
3. Add brief implementation notes to `Refactor-Plans/README.md` index if desired.

Acceptance:

1. New assistant can locate all relevant files from docs.

## Key File Touchpoints

Core UI:

- `src/screens/MintScreen.tsx`
- `src/screens/ViewerScreen.tsx`
- `src/App.tsx`

Core libraries:

- `src/lib/mint/dependencies.ts` (new)
- `src/lib/mint/attempt-cache.ts`
- `src/lib/viewer/relationships.ts` (new)
- `src/lib/viewer/queries.ts` (optional additions)
- `src/lib/viewer/cache.ts` (optional scan persistence)

Protocol/contract glue:

- `src/lib/contract/client.ts`
- `src/lib/protocol/parsers.ts`

Contract tests:

- `contracts/clarinet/tests/xtrata-v1.1.0.test.ts`

Docs:

- `docs/recursive-inscriptions.md`
- `docs/app-reference.md`
