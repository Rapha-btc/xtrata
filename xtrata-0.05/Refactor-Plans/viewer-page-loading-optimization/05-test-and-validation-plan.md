# Test and Validation Plan

## Unit Tests

### A. Cache budget/eviction

File: `src/lib/viewer/__tests__/cache-budget.test.ts`

Cases:

1. Usage calculation includes all full-content entries.
2. Writes above budget trigger prune.
3. LRU ordering evicts oldest first.
4. Selected-token protection rule works.
5. No-op behavior when within budget.

### B. Preloader queue

File: `src/lib/viewer/__tests__/preloader.test.ts`

Cases:

1. Job dedupe by token id.
2. Respect concurrency limit.
3. Cancellation stops pending jobs.
4. Progress callback emits deterministic updates.
5. Byte budget prevents over-enqueue.
6. Per-token cap skips oversized assets.

### C. Content fetch behavior

File: `src/lib/viewer/__tests__/content-fetch.test.ts`

Cases:

1. Cache-first path returns without network calls when cached.
2. Batch-read fallback behavior remains unchanged.
3. Adaptive batch mode degrades on cost errors without failure.

## Integration/Component Tests

1. Viewer page change triggers preload enqueue for current page.
2. Recent pages enqueue only in `current-plus-recent` mode.
3. Preload disabled mode produces no additional content fetches.
4. Selected preview remains interactive while preload in progress.

## Manual Validation

1. Cold load page: verify progressive preload status and responsive UI.
2. Navigate away and back to recent page: verify near-instant content load from IDB.
3. Toggle mode off during preload: queue cancels promptly.
4. Simulate rate limiting/backoff: preloader respects backoff and recovers.
5. Multi-tab: only active tab performs preload work.

## Non-Regression Checks

1. Grid remains 4x4 and square.
2. Preview square frame behavior unchanged.
3. No horizontal layout shifts when controls update.
4. Mint, wallet, and market screens unaffected.

## Commands

1. `npm run test:app`
2. `npm run lint`
3. Optional: `npm test`
