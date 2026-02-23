# `@xtrata/reconstruction` Plan

Goal: provide deterministic reconstruction and verification utilities as a standalone library.

## Why this library is separate

- Reconstruction logic should be reusable across web apps, indexers, and backend workers.
- Integrators should not import viewer UI code to rebuild content.
- Hash verification must be a first-class API, not an app-side detail.

## Core API targets

1. `assembleChunks(chunks)` -> bytes
2. `computeExpectedHash(chunks)` -> hash
3. `verifyPayload(bytes, expectedHash)` -> pass/fail + diagnostics
4. `resolveDependencies(tokenId, readers)` -> dependency graph
5. `reconstructInscription(tokenId, readers)` -> content + metadata + verification report

## Input model

- Supports chunk-batch first retrieval with per-chunk fallback.
- Supports migrated-token paths where metadata and chunk sources may differ.
- Supports recursive dependency trees with bounded traversal.

## Output model

- Deterministic content bytes
- Integrity proof data (hashes, chunk counts, mismatch reasons)
- Structured diagnostics for retry/fallback behavior

## Hard requirements

- No hidden network side effects.
- Deterministic outputs for identical inputs.
- Explicit error types for malformed data, missing chunks, and hash mismatches.

## Test plan

- Golden fixtures for:
  - single-item content
  - large chunked content
  - recursive content
  - hash mismatch cases
  - missing chunk fallback behavior
