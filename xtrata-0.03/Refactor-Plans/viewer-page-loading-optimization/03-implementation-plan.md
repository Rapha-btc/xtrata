# Detailed Implementation Plan

## Phase 0: Baseline

1. Capture current behavior and timings for page switch and first-preview load.
2. Run baseline tests and lint.

## Phase 1: Preload Config + Types

1. Add preload config module:
- `src/lib/viewer/preload-config.ts` (new)
2. Define:
- preload modes,
- byte budgets,
- size caps,
- concurrency defaults.
3. Add tests for config parsing/validation.

## Phase 2: Full-Content Cache Budget and Eviction

1. Extend `src/lib/viewer/cache.ts` with full-content cache index metadata.
2. Add helper APIs:
- `touchInscriptionCacheEntry(contractId, id, bytes, timestamp)`
- `pruneInscriptionCacheByBudget(contractId, maxBytes)`
- `getInscriptionCacheUsage(contractId)`
3. Introduce DB migration (version bump) safely preserving existing stores.
4. Keep thumbnail pruning logic intact.

Acceptance:

1. Cache size can be measured and bounded.
2. Eviction removes oldest entries first (LRU-style).

## Phase 3: Preloader Queue Service

1. Add `src/lib/viewer/preloader.ts` (new).
2. Implement queue with:
- enqueue page token IDs,
- dedupe jobs,
- bounded concurrency,
- cancellation tokens,
- progress callbacks.
3. Fetch path should use existing `fetchOnChainContent` with cache-first semantics.
4. Enforce per-token and global byte budgets while queueing.

Acceptance:

1. Queue is deterministic and cancel-safe.
2. No uncontrolled parallel burst.

## Phase 4: Viewer Integration

1. Update `src/screens/ViewerScreen.tsx`:
- wire preloader lifecycle to active page + recent pages,
- respect `isActiveTab`,
- stop queue when tab inactive, mode off, or scope changes.
2. Add preload controls/status in viewer control bar.
3. Continue existing summary/thumbnail warm behavior.

Acceptance:

1. Page switches remain responsive.
2. Preload runs opportunistically and cancels correctly.

## Phase 5: Query-Memory Guardrails

1. Prevent excessive query-memory retention of off-page full content.
2. Add helper logic to remove non-critical content queries when leaving page (while preserving IDB cache).
3. Keep selected token content query behavior unchanged.

Acceptance:

1. Memory footprint remains stable across paging.
2. Returning to recent pages is still fast due to IDB cache.

## Phase 6: Optional Adaptive Batch Optimization

1. Add optional adaptive read batch parameter in `fetchOnChainContent` preloader path.
2. Keep default card/preview behavior unchanged.
3. Ensure fallback to current behavior on any error.

Acceptance:

1. Lower call count on healthy nodes.
2. No regression under `CostBalanceExceeded`.

## Phase 7: Docs + Instrumentation

1. Add lightweight metrics logs for:
- preload queue time,
- bytes loaded,
- cache hit ratio.
2. Update docs/app reference with new modules and behavior.

## File Touchpoints

New files:

1. `src/lib/viewer/preload-config.ts`
2. `src/lib/viewer/preloader.ts`
3. `src/lib/viewer/__tests__/preloader.test.ts`
4. `src/lib/viewer/__tests__/cache-budget.test.ts`

Modified files:

1. `src/screens/ViewerScreen.tsx`
2. `src/lib/viewer/cache.ts`
3. `src/lib/viewer/content.ts` (optional adaptive mode)
4. `src/lib/viewer/queries.ts` (if key helpers needed)
5. `docs/app-reference.md`
