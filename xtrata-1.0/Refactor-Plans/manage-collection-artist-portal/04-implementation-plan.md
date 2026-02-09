# Detailed Implementation Plan

## Phase 0: Baseline and invariants

1. Confirm immutable constraints from `xtrata-collection-mint-v1.0`.
2. Reuse current begin/chunk/seal orchestration and fee defaults.
3. Preserve layout invariants:
- 4x4 square grids,
- square preview behavior,
- no horizontal layout shift when modules expand/collapse.

Acceptance:

1. No contract behavior assumptions conflict with v1.0 source/tests.
2. Existing mint/viewer behavior remains unchanged before new pages are enabled.

## Phase 1: New artist-manager entry point and gate

1. Add manager path config (for example `MANAGE_PATH = '/manage'`).
2. Extend `src/main.tsx` render branching to include manager app entry.
3. Add `ArtistManagerGate` with:
- wallet connect flow,
- manager allowlist check,
- restricted-access fallback UI.
4. Add dedicated env config for manager allowlist.

Proposed touchpoints:

1. `src/main.tsx`
2. `src/config/admin.ts` (or new `src/config/manage.ts`)
3. `src/lib/admin/access.ts` (or new `src/lib/manage/access.ts`)
4. `src/admin/ArtistManagerGate.tsx` (new)

Acceptance:

1. Only allowlisted artists can access manager page.
2. Non-allowlisted users see clear access-denied UI.

## Phase 2: Collection manager shell and routing structure

1. Add `CollectionManagerApp` with sections:
- collections index,
- create/deploy wizard,
- settings panel,
- assets panel,
- publish panel.
2. Keep compact module style aligned with existing app UI tokens.
3. Add route state for selected collection ID/slug.

Proposed touchpoints:

1. `src/manage/CollectionManagerApp.tsx` (new)
2. `src/styles/app.css` (new scoped classes)
3. `docs/app-reference.md` (update map)

Acceptance:

1. Artist can navigate between collection records without full-page reload.
2. Shell is mobile-safe and desktop readable.

## Phase 3: Guided deploy and contract bootstrap flow

1. Add deploy wizard using existing wallet deploy call logic.
2. Auto-load template source from local contract file snapshot.
3. Validate contract name pattern before wallet prompt.
4. On deploy tx submission, create draft collection record in registry.
5. Add guided post-deploy checklist:
- set max supply,
- set recipients/splits,
- set mint price,
- set allowlist/max-per-wallet,
- unpause when ready.

Proposed touchpoints:

1. `src/manage/components/CollectionDeployWizard.tsx` (new)
2. `src/lib/contract/templates.ts` (new, exposes collection-mint source text)
3. `src/manage/services/collection-registry.ts` (new)
4. `src/screens/CollectionMintAdminScreen.tsx` (extract reusable helpers as needed)

Acceptance:

1. Artist can deploy new collection-mint contract without raw copy/paste.
2. Contract setup actions are ordered and validated.

## Phase 4: Settings management integration

1. Reuse and factor existing admin handlers from `CollectionMintAdminScreen`.
2. Build reusable hooks for:
- loading status,
- running contract actions,
- checking ownership.
3. Prevent unsafe calls when finalized or when connected wallet is not owner.
4. Add dedicated "finalize" warning flow with typed confirmation.

Proposed touchpoints:

1. `src/lib/collection-manager/contract-status.ts` (new)
2. `src/lib/collection-manager/contract-actions.ts` (new)
3. `src/manage/components/CollectionSettingsPanel.tsx` (new)

Acceptance:

1. All critical settings are manageable from new page.
2. Ownership and finalization guards are consistently enforced.

## Phase 5: Asset staging backend and artist upload UX

1. Implement collection registry + asset APIs in `functions/collections/*`.
2. Add folder upload UI with preprocessing:
- mime,
- bytes,
- chunk count,
- expected hash.
3. Persist asset manifest rows + storage locations.
4. Support draft/published states and per-asset edition settings.

Proposed touchpoints:

1. `functions/collections/index.ts` (new)
2. `functions/collections/[collectionId].ts` (new)
3. `functions/collections/[collectionId]/assets.ts` (new)
4. `src/manage/components/AssetStagingPanel.tsx` (new)
5. `src/lib/collection-manager/api.ts` (new)

Acceptance:

1. Artist can upload folder and see staged asset table with computed hashes.
2. Staged assets persist and reload across sessions.

## Phase 6: Buyer mint from staged assets

1. Add buyer-facing collection page or module.
2. Load published asset manifest and display mintable items.
3. Execute existing collection mint tx order using staged asset bytes.
4. Update off-chain edition counters only after tx accepted.

Proposed touchpoints:

1. `src/screens/PublicCollectionScreen.tsx` (new)
2. `src/PublicApp.tsx` (route or section integration)
3. `src/lib/collection-manager/mint-from-staged.ts` (new)
4. Reuse `src/screens/CollectionMintScreen.tsx` helper logic by extraction.

Acceptance:

1. Buyer can mint from artist-published staged assets.
2. Minted ownership and viewer behavior match current contract behavior.

## Phase 7: Ops tools, observability, and recovery

1. Add per-collection activity log panel (deploy/config/upload/mint failures).
2. Add reservation recovery action wrappers for owner (`release-reservation`).
3. Add audit-friendly status indicators (published, paused, finalized, supply left).

Proposed touchpoints:

1. `src/manage/components/CollectionOpsPanel.tsx` (new)
2. `src/lib/collection-manager/recovery.ts` (new)
3. `src/lib/utils/logger.ts` integration for structured logs.

Acceptance:

1. Operator can detect and resolve stuck states.
2. Logs are actionable for support/debug handoff.

## Phase 8: Documentation and cleanup

1. Update `docs/app-reference.md` with new manage modules and APIs.
2. Add implementation notes to `docs/contract-inventory.md` for collection manager workflow.
3. Keep `Refactor-Plans` docs linked from top-level summary if needed.

Acceptance:

1. New assistant can navigate code and implement follow-on work without rediscovery.
