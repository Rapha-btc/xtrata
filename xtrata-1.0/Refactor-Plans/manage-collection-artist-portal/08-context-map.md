# Context Map

## Current contract and tests

1. `contracts/live/xtrata-collection-mint-v1.0.clar`
Core collection mint contract behavior.

2. `contracts/clarinet/tests/xtrata-collection-mint-v1.0.test.ts`
Behavioral test coverage for caps, allowlist, split payouts, batch seal, finalize.

3. `docs/contract-inventory.md`
Current contract inventory and function references.

## Existing app surfaces to reuse

1. `src/screens/CollectionMintAdminScreen.tsx`
Current admin configuration actions and read-only status loading.

2. `src/screens/CollectionMintScreen.tsx`
Current file preprocessing and collection mint tx sequencing.

3. `src/App.tsx`
Deploy module, admin modules, and section shell patterns.

4. `src/admin/AdminGate.tsx`
Wallet-gated allowlist access pattern to reuse for manager gate.

5. `src/lib/admin/access.ts`
Current allowlist parsing utility (candidate reuse).

6. `src/main.tsx`
Path-based app entry branching for public/admin.

## Proposed new frontend modules

1. `src/manage/CollectionManagerApp.tsx`
New artist manager shell.

2. `src/admin/ArtistManagerGate.tsx`
Gate for allowlisted artists.

3. `src/manage/components/CollectionDeployWizard.tsx`
Guided deploy flow.

4. `src/manage/components/CollectionSettingsPanel.tsx`
Contract setup controls and status.

5. `src/manage/components/AssetStagingPanel.tsx`
Folder upload and manifest editor.

6. `src/screens/PublicCollectionScreen.tsx`
Buyer-facing collection mint page.

## Proposed new frontend libs

1. `src/lib/collection-manager/types.ts`
Shared types for collections/assets/reservations.

2. `src/lib/collection-manager/api.ts`
Client API wrappers.

3. `src/lib/collection-manager/contract-actions.ts`
Reusable collection tx action wrappers.

4. `src/lib/collection-manager/contract-status.ts`
Read-only status loaders and owner checks.

5. `src/lib/collection-manager/mint-from-staged.ts`
Buyer mint orchestration using staged assets.

## Proposed backend endpoints

1. `functions/collections/index.ts`
Collection list/create.

2. `functions/collections/[collectionId].ts`
Collection detail/update.

3. `functions/collections/[collectionId]/assets.ts`
Asset upload/list/update.

4. `functions/collections/[collectionId]/publish.ts`
Publish/unpublish controls.

5. `functions/collections/[collectionId]/reserve.ts`
Mint reservation lifecycle.

## Documentation touchpoints after implementation

1. `docs/app-reference.md`
Add new manager page and backend map.

2. `docs/contract-inventory.md`
Add workflow note tying collection manager to v1.0 functions.

3. `Refactor-Plans/REFRACTOR-PLANS-SUMMARY.md`
Add entry for this plan pack when implementation starts.
