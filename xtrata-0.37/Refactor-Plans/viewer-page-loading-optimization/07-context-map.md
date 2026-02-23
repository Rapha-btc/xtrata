# Context Map

## Viewer Pagination and Prefetch

1. Page constants and recent-page tracking:
- `src/screens/ViewerScreen.tsx:56`
- `src/screens/ViewerScreen.tsx:61`
- `src/screens/ViewerScreen.tsx:144`

2. Summary prefetch:
- `src/screens/ViewerScreen.tsx:1155`

3. Thumbnail warm for recent/current pages:
- `src/screens/ViewerScreen.tsx:1192`
- `src/screens/ViewerScreen.tsx:1248`
- `src/screens/ViewerScreen.tsx:1263`

## Card and Preview Loading Gates

1. Card content auto-load gate:
- `src/components/TokenCardMedia.tsx:101`
- `src/components/TokenCardMedia.tsx:104`
- `src/components/TokenCardMedia.tsx:138`

2. Preview auto-load/stream gate:
- `src/components/TokenContentPreview.tsx:192`
- `src/components/TokenContentPreview.tsx:199`
- `src/components/TokenContentPreview.tsx:205`
- `src/components/TokenContentPreview.tsx:287`
- `src/components/TokenContentPreview.tsx:1715`

## Content Fetch and Read Behavior

1. Fetch caps and read parameters:
- `src/lib/viewer/content.ts:22`
- `src/lib/viewer/content.ts:24`
- `src/lib/viewer/content.ts:25`
- `src/lib/viewer/content.ts:26`

2. Batch fallback logic:
- `src/lib/viewer/content.ts:575`
- `src/lib/viewer/content.ts:633`
- `src/lib/viewer/content.ts:645`

3. Core reconstruction path:
- `src/lib/viewer/content.ts:698`
- `src/lib/viewer/content.ts:713`
- `src/lib/viewer/content.ts:760`
- `src/lib/viewer/content.ts:846`

## Cache Layer

1. DB and stores:
- `src/lib/viewer/cache.ts:3`
- `src/lib/viewer/cache.ts:5`
- `src/lib/viewer/cache.ts:8`

2. Full cache write paths:
- `src/lib/viewer/cache.ts:350`
- `src/lib/viewer/cache.ts:385`

3. Existing thumbnail pruning:
- `src/lib/viewer/cache.ts:471`

## Global Read-Only Safety

1. Concurrency and backoff:
- `src/lib/contract/read-only.ts:4`
- `src/lib/contract/read-only.ts:11`
- `src/lib/contract/read-only.ts:120`

2. Active-tab guard:
- `src/lib/utils/tab-guard.ts:78`

## App Query Defaults

1. Query retry/backoff defaults:
- `src/main.tsx:10`
