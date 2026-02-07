# Cache Budget and Eviction Spec

## Goals

1. Keep fast reload for recently viewed pages.
2. Prevent unbounded IndexedDB growth.
3. Keep behavior predictable across browsers.

## Budget Definitions

Per contract scope:

1. `MAX_FULL_CACHE_BYTES = 320MB` (initial)
2. `MAX_PRELOAD_PER_TOKEN_BYTES = 4MB` (initial)
3. `MAX_CURRENT_PAGE_PRELOAD_BYTES = 64MB` (initial)

Notes:

1. Values are defaults and should be feature-flag/configurable.
2. If a token exceeds per-token cap, skip preloading but allow on-demand preview load.

## Eviction Policy

1. Maintain entry metadata `{key, bytes, lastAccessedAt}`.
2. On write and periodic checkpoints, if usage > max:
- evict oldest by `lastAccessedAt` until usage <= max.
3. Update `lastAccessedAt` on cache read hit.
4. Eviction order must be deterministic.

## Safety Rules

1. Never evict the selected token’s currently displayed content.
2. Never evict within same transaction that still needs the bytes in memory.
3. Thumbnail and preview stores keep current behavior.

## Suggested DB Shape

1. Keep existing stores.
2. Add `inscription-index` object store with metadata only.
3. Index by `contractId` and `lastAccessedAt` for efficient pruning.

## Migration Strategy

1. Increment `DB_VERSION` in `src/lib/viewer/cache.ts`.
2. Create new store only if missing.
3. Keep backward compatibility for existing caches.

## Failure Handling

1. If index write fails, do not fail content cache write.
2. If prune fails, log warning and continue.
3. If IDB unavailable, fallback to existing runtime behavior.
