# Test and Validation Plan

## Test levels

1. Unit tests for pure parsing/validation/state helpers.
2. Component integration tests for management workflows.
3. Contract-level tests for assumptions against `xtrata-collection-mint-v1.0`.
4. Manual end-to-end validation across artist and buyer roles.

## Unit tests (new)

Recommended files:

1. `src/lib/collection-manager/__tests__/access.test.ts`
- allowlist and owner-check rules.

2. `src/lib/collection-manager/__tests__/deploy-validation.test.ts`
- contract name and setup preflight validation.

3. `src/lib/collection-manager/__tests__/asset-manifest.test.ts`
- folder normalization, hash/chunk metadata integrity.

4. `src/lib/collection-manager/__tests__/reservation.test.ts`
- reservation lifecycle and idempotency behavior.

5. `src/lib/collection-manager/__tests__/publish-readiness.test.ts`
- publish guard rules.

## Integration tests (app)

1. Artist gate behavior
- allowlisted wallet allowed,
- non-allowlisted wallet blocked.

2. Collection setup flow
- deploy wizard validations,
- config action sequencing and blocked states.

3. Asset staging UX
- folder load and issue reporting,
- publish enablement after requirements met.

4. Buyer mint flow
- reservation creation,
- tx sequence invocation,
- post-mint state update.

## Contract verification tests

No contract rewrite required for MVP, but keep guard tests proving assumptions:

1. Existing clarinet tests for:
- pause/finalize behavior,
- max supply immutability,
- allowlist and per-wallet gating,
- fee splits and mint ownership.

2. Add integration assertion (app-level mocked flows):
- minted owner remains buyer when minting through collection contract.

## Manual acceptance checklist

1. Artist can access manager page only when allowlisted.
2. Artist can deploy a new collection-mint contract from wizard.
3. Artist can fully configure settings and verify status readbacks.
4. Artist can upload folder, edit per-asset metadata, and publish collection.
5. Buyer can mint an asset and see token in wallet/viewer.
6. Reservation recovery path works after failed mint attempt.
7. Finalize warning prevents accidental irreversible action.

## Performance and safety checks

1. Upload processing remains bounded (file size and count constraints).
2. No aggressive polling loops introduced.
3. Read-only calls remain bounded and active-tab aware.
4. UI layout invariants still hold on desktop and mobile.

## Required command suite before merge

1. `npm run build`
2. `npm run test:app`
3. `npm run test:clarinet`
4. Targeted tests under `src/lib/collection-manager/**/__tests__`
