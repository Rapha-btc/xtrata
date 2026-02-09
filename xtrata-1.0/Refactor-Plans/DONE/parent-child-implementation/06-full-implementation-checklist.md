# Full Implementation Checklist

Purpose: single operational checklist for delivering parent-child support end-to-end across minting, viewing, and tests.

Use this document as the implementation tracker across all phases in `02-implementation-plan.md`.

## How To Use This Checklist

1. Work phases in order from Phase 0 through Phase 7.
2. Do not begin a new phase until the previous phase exit gate is complete.
3. Keep notes inline for any deviations, tradeoffs, or follow-up work.
4. Reference `03-test-plan.md` for exact required test cases.
5. Reference `05-context-map.md` for code navigation.

## Global Guardrails (Must Hold In Every Phase)

- [ ] Do not modify contract sources for this project.
- [ ] Preserve mint order: `begin -> add-chunk-batch -> seal`.
- [ ] Keep fee defaults and fee behavior unchanged unless explicitly approved.
- [ ] Keep grid and preview square behavior unchanged.
- [ ] Avoid automatic background full-collection scans.
- [ ] Keep wallet session and network guard behavior unchanged.
- [ ] Keep read-only traffic bounded and cancellable for heavy operations.

## Phase 0: Baseline and Safety

References: `01-scope-and-contract-model.md`, `02-implementation-plan.md` (Phase 0), `04-execution-checklist.md` (Pre-Implementation).

Entry

- [ ] Confirm active target contract behavior is compatible with dependencies (`seal-recursive`, `get-dependencies`, error `u111`).
- [ ] Confirm no contract source edits are needed.
- [ ] Confirm scope excludes collection batch recursive mint for now.

Implementation

- [ ] Capture baseline test state.
- [ ] Capture baseline manual behavior for mint and viewer flows.

Verification

- [ ] `npm run test:app`
- [ ] `npm run test:clarinet`

Exit Gate

- [ ] Baseline is green and documented.

## Phase 1: Dependency Domain Layer

References: `02-implementation-plan.md` (Phase 1), `03-test-plan.md` (A), `05-context-map.md` (Minting Flow).

Entry

- [ ] Phase 0 exit gate complete.

Implementation

- [ ] Add `src/lib/mint/dependencies.ts`.
- [ ] Implement parser, normalizer, merger, validator, serializer helpers.
- [ ] Enforce: non-negative integer IDs, unique IDs, stable deterministic order, max 50 IDs.
- [ ] Keep module pure (no network or storage I/O).

Tests

- [ ] Add `src/lib/mint/__tests__/dependencies.test.ts`.
- [ ] Cover comma/space/newline parsing.
- [ ] Cover invalid tokens and negative values.
- [ ] Cover dedupe and deterministic output.
- [ ] Cover max dependency limit.
- [ ] Cover merge behavior and string roundtrip conversions.

Exit Gate

- [ ] Dependency helper tests pass.
- [ ] Helper output is deterministic and contract-safe.

## Phase 2: Mint Attempt Persistence

References: `02-implementation-plan.md` (Phase 2), `03-test-plan.md` (B).

Entry

- [ ] Phase 1 exit gate complete.

Implementation

- [ ] Extend `MintAttempt` in `src/lib/mint/attempt-cache.ts` with optional `dependencyIds: string[]`.
- [ ] Preserve backward compatibility with existing stored attempts.
- [ ] Keep non-recursive behavior unchanged.

Tests

- [ ] Add `src/lib/mint/__tests__/attempt-cache.test.ts`.
- [ ] Verify save/load roundtrip with dependencies.
- [ ] Verify legacy load without dependencies still works.
- [ ] Verify clear semantics and storage fallback path.

Exit Gate

- [ ] Legacy attempts still load safely.
- [ ] Recursive attempt state roundtrips with dependencies.

## Phase 3: Mint UI and Seal Flow

References: `02-implementation-plan.md` (Phase 3), `03-test-plan.md` (Integration Verification).

Entry

- [ ] Phase 2 exit gate complete.

Implementation

- [ ] Update `src/screens/MintScreen.tsx` to manage canonical dependency state.
- [ ] Add manual parent ID input UX (comma/space/newline), apply, remove, clear.
- [ ] Merge manual parents with delegate parent into one canonical list.
- [ ] Replace single-source dependency usage with `resolvedDependencyIds`.
- [ ] Use canonical list in:
  - seal path selection (`seal-inscription` vs `seal-recursive`)
  - contract call args
  - SIP-016 metadata
  - logs and status
  - attempt persistence + restore
- [ ] Keep all existing mint step and fee behavior unchanged.

Tests

- [ ] Update/add targeted tests for helper usage and state restoration logic as needed.
- [ ] Ensure lint/typecheck remain clean.

Manual Verification

- [ ] No-parent mint still uses `seal-inscription`.
- [ ] Single-parent mint uses `seal-recursive`.
- [ ] Multi-parent mint uses `seal-recursive` with exact parent set.
- [ ] Reload and resume preserves parent list.

Exit Gate

- [ ] Multi-parent recursive mint works without regressions in non-recursive flow.

## Phase 4: Viewer -> Mint Parent Handoff

References: `02-implementation-plan.md` (Phase 4), `05-context-map.md` (App Wiring, Viewer Flow).

Entry

- [ ] Phase 3 exit gate complete.

Implementation

- [ ] Add parent draft state in `src/App.tsx`.
- [ ] Add viewer action to push selected token ID as parent candidate.
- [ ] Add mint wiring to consume and merge parent draft IDs.
- [ ] Add clear/reset control in mint for imported draft IDs.
- [ ] Ensure wiring remains compatible with wallet mode and collection mode behavior.

Manual Verification

- [ ] Selecting a token in viewer and clicking `Use as parent` prepopulates mint.
- [ ] Imported IDs merge cleanly with manually entered IDs.
- [ ] No horizontal layout shifts introduced.

Exit Gate

- [ ] One-click viewer-to-mint parent flow works end-to-end.

## Phase 5: Viewer Relationship UX

References: `02-implementation-plan.md` (Phase 5), `03-test-plan.md` (C), `05-context-map.md` (Viewer Flow).

Entry

- [ ] Phase 4 exit gate complete.

Implementation A: Relationship data layer

- [ ] Add `src/lib/viewer/relationships.ts`.
- [ ] Add `fetchParents` using `getDependencies`.
- [ ] Add `findChildrenFromKnownTokens` for cache/page-local derivation.
- [ ] Add `scanChildren` for explicit full scan with cancellation and progress callbacks.
- [ ] Bound scan concurrency and respect read-only backoff behavior.

Implementation B: Viewer UI wiring

- [ ] Show parent IDs in token details from authoritative read-only dependencies.
- [ ] Show locally-derived children when available.
- [ ] Add user-triggered `Scan full collection` control.
- [ ] Add scan progress display and cancel control.
- [ ] Do not auto-run full scans in background.

Implementation C: Optional persistence

- [ ] Decide whether scan result persistence is needed.
- [ ] If needed, add bounded cache/checkpoint support with version-safe keys.

Tests

- [ ] Add `src/lib/viewer/__tests__/relationships.test.ts`.
- [ ] Cover parent fetch behavior.
- [ ] Cover known-token child derivation.
- [ ] Cover full-scan discovery, dedupe, cancellation, and concurrency.

Exit Gate

- [ ] Parent and child relationship flows are functional and bounded.

## Phase 6: Collection Mint Scope Decision

References: `02-implementation-plan.md` (Phase 6), `01-scope-and-contract-model.md`.

Entry

- [ ] Phase 5 exit gate complete.

Implementation

- [ ] Confirm `CollectionMintScreen` remains non-recursive for this delivery.
- [ ] Add explicit scope note in docs if needed.

Exit Gate

- [ ] No regression in collection mint behavior.
- [ ] Out-of-scope recursive batch mint is clearly documented.

## Phase 7: Docs, Clarinet Coverage, and Final Hardening

References: `02-implementation-plan.md` (Phase 7), `03-test-plan.md` (D + Clarinet).

Entry

- [ ] Phase 6 exit gate complete.

Implementation

- [ ] Update `contracts/clarinet/tests/xtrata-v1.1.0.test.ts` with dependency edge cases:
  - missing dependency fails with `u111`
  - multi-dependency list is stored and returned
  - non-recursive seal returns empty dependencies
- [ ] Update parser coverage in `src/lib/protocol/__tests__/parsers.test.ts`.
- [ ] Update `docs/recursive-inscriptions.md`.
- [ ] Update `docs/app-reference.md` for new parent-child touchpoints.

Final Validation Commands

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test:app`
- [ ] `npm run test:clarinet`

Final Manual Validation

- [ ] Mint no parent / one parent / multi parent.
- [ ] Resume flow with dependency persistence.
- [ ] Viewer parent readout for child token.
- [ ] Viewer child discovery with progress and cancel.
- [ ] Wallet/network mismatch handling remains correct.
- [ ] No new layout instability in viewer and mint modules.

Exit Gate

- [ ] All required tests pass.
- [ ] All manual checks pass.
- [ ] Documentation is updated and sufficient for a new assistant.

## Final Deliverables Checklist

- [ ] Code changes grouped by phase with clear commit messages.
- [ ] New unit tests and clarinet tests included.
- [ ] Updated docs in `docs/` and `Refactor-Plans/parent-child-implementation/`.
- [ ] Final implementation summary includes changed files, behavior notes, and residual risks.
