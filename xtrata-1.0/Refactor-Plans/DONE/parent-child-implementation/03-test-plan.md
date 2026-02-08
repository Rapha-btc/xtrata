# Test Plan

Use this together with `06-full-implementation-checklist.md`.
The checklist is the phase gate tracker; this file defines required test coverage and commands.

## App Unit Tests (Vitest)

### A. Mint dependency helpers

File: `src/lib/mint/__tests__/dependencies.test.ts`

Required cases:

1. Parses ids from comma/space/newline input.
2. Rejects invalid tokens and negatives.
3. Dedupes repeated ids.
4. Preserves deterministic output order.
5. Enforces max 50 dependencies.
6. Merges manual and delegate sources correctly.
7. Serializes/deserializes string form safely.

### B. Mint attempt persistence

File: `src/lib/mint/__tests__/attempt-cache.test.ts`

Required cases:

1. Saves and loads attempt with dependency ids.
2. Loads legacy attempt without dependency ids.
3. Clears dependency ids on clear.
4. LocalStorage fallback path roundtrip.

### C. Viewer relationships

File: `src/lib/viewer/__tests__/relationships.test.ts`

Required cases:

1. Parent fetch returns exact `getDependencies` ids.
2. Child discovery from known token summaries works.
3. Full scan discovers all children for parent id.
4. Full scan supports cancellation.
5. Full scan respects concurrency limit.
6. Duplicate children are removed.

### D. Existing parser coverage updates

File: `src/lib/protocol/__tests__/parsers.test.ts`

Add cases for:

1. Empty dependency list parse.
2. Large valid dependency ids.
3. Invalid dependency list entries fail.

## Contract Tests (Clarinet)

File: `contracts/clarinet/tests/xtrata-v1.1.0.test.ts`

Required additions:

1. `seal-recursive` fails with missing dependency (`err u111`).
2. `seal-recursive` with multiple dependencies stores expected list.
3. `get-dependencies` returns empty list for non-recursive seal.
4. Ordering behavior is documented and asserted as currently implemented.

## Integration Verification (Manual)

1. Mint child with no parents -> uses `seal-inscription`.
2. Mint child with one parent -> uses `seal-recursive`.
3. Mint child with multiple parents -> on-chain readback matches UI list.
4. Reload mid-flow and resume -> dependency list remains intact.
5. In viewer, open child token -> parents displayed correctly.
6. In viewer, open parent token -> children discoverable via scan.
7. Network mismatch and paused contract paths remain unchanged.

## Commands

1. `npm run test:app`
2. `npm run test:clarinet`
3. `npm run lint`

Optional full suite:

1. `npm test`
