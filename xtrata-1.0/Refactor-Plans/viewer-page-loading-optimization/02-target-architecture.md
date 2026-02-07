# Target Architecture

## Objective

Improve perceived page-load UX by preloading full token content for:

1. current page (primary), and
2. up to 5 recent pages (secondary),

while preserving responsiveness and avoiding unbounded resource usage.

## Design Principles

1. Budgeted preloading, not unconditional loading.
2. Cache-first reads before network.
3. Explicit queue + cancellation; no uncontrolled fan-out.
4. IDB persistence with strict eviction budgets.
5. Keep existing media rendering logic and layout unchanged.

## Preload Modes

1. `off`
- Existing behavior.

2. `current-page`
- Full-content preload for visible page token IDs under byte budget.

3. `current-plus-recent`
- Current page + recent page IDs (max 5 page history) under global byte budget.

Default recommendation: `current-page`.

## Budget Model (Initial)

1. Per-token preload size cap: `4MB`.
2. Current-page preload budget: `64MB`.
3. Recent-pages preload budget: `320MB` (inclusive total budget, not additive beyond cap).
4. Worker concurrency: `1` (optionally `2` on healthy networks).
5. Cancel pending jobs on page/mode change.

## Storage Strategy

1. Persist preloaded bytes in IndexedDB inscriptions store.
2. Add full-content LRU metadata/index for byte-aware pruning.
3. Retain thumbnail cache strategy unchanged.
4. Keep preview/temp cache behavior intact.

## Query-Memory Strategy

1. Do not keep off-page full bytes permanently in React Query memory.
2. Keep on-demand selected token query behavior as-is.
3. Use IDB as durable store; hydrate memory selectively when needed.

## Adaptive Read Behavior

1. Keep existing fallback logic on read errors/cost errors.
2. Introduce optional adaptive initial batch size for preloader path:
- start >4 for small assets,
- reduce automatically on cost errors,
- never bypass global read-only throttling/backoff.

## UX Behavior

1. Maintain current 4x4 grid and square preview.
2. Add compact preload status in viewer controls:
- mode,
- queued/completed count,
- bytes loaded,
- pause/stop action.
3. Never block token selection on preload progress.
