# Current State and Risks

## Current Strategy (As Implemented)

1. Viewer prefetches token summaries, not full bytes.
- `src/screens/ViewerScreen.tsx:1155`

2. Viewer warms thumbnail cache from current/recent pages.
- `src/screens/ViewerScreen.tsx:1192`
- `src/screens/ViewerScreen.tsx:1248`
- `src/screens/ViewerScreen.tsx:1263`

3. Recent-page history limit is already 5 pages (ids only).
- `src/screens/ViewerScreen.tsx:61`
- `src/screens/ViewerScreen.tsx:144`

4. Card media auto-fetches full on-chain content only for limited cases and size gate (`<= 2MB`).
- `src/components/TokenCardMedia.tsx:101`
- `src/components/TokenCardMedia.tsx:104`
- `src/components/TokenCardMedia.tsx:138`

5. Preview panel uses gated load/streaming behavior; large content is not always loaded immediately.
- `src/components/TokenContentPreview.tsx:192`
- `src/components/TokenContentPreview.tsx:199`
- `src/components/TokenContentPreview.tsx:1715`

6. Full-content cache writes are unbounded by byte budget today.
- `src/lib/viewer/cache.ts:350`
- `src/lib/viewer/cache.ts:385`
- only thumbnails are pruned: `src/lib/viewer/cache.ts:471`

7. Read-only calls are globally throttled and backoff-protected.
- `src/lib/contract/read-only.ts:4`
- `src/lib/contract/read-only.ts:11`
- `src/lib/contract/read-only.ts:120`

8. Chunk reconstruction currently uses small read batch size (`4`) and concurrency (`4`).
- `src/lib/viewer/content.ts:25`
- `src/lib/viewer/content.ts:26`

## Practical Call-Volume Math

Using current chunk size (`16KB`) and current batch-read behavior:

1. 4MB file -> 256 chunks -> ~65 read-only calls per file.
2. 16 files/page -> ~1,040 calls/page.
3. 5 pages -> ~5,200 calls.

This is technically possible but risky if unconstrained (rate limiting/backoff, slow UX, battery/network impact).

## Core Risks if We "Load Everything" Naively

1. Read-only flood and backoff loops.
2. Unbounded IDB growth from full-content blobs.
3. Excess memory pressure if all bytes are retained in query memory.
4. Degraded interactivity during paging/selection transitions.

## Constraint Alignment

From project guardrails:

1. Keep layout stable and grid/preview behavior unchanged.
2. Avoid unnecessary network calls.
3. Preserve cache-first behavior.
4. Maintain bounded network retries and polling.
