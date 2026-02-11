# Detailed Implementation Plan

## Phase 0: Baseline and invariants (complete)
- Contract behavior is still pinned to `xtrata-collection-mint-v1.x`; nothing in the portal changes the core begin/add-chunk/seal order or fee defaults.
- Layout invariants are preserved via the shared `app`/`panel` styles imported from `src/styles/app.css`.

## Phase 1: Artist-manager entry point and gate (complete)
- `MANAGE_PATH` is defined in `src/config/manage.ts`, and `src/main.tsx` routes `/manage` through `ArtistManagerGate` → `CollectionManagerApp`.
- `ArtistManagerGate` checks `VITE_ARTIST_ALLOWLIST`, exposes connection controls, and blocks non-allowlisted wallets.

## Phase 2: Collection manager shell and panels (complete)
- `CollectionManagerApp` already renders the list, deploy wizard, settings, asset staging, and publish panels with per-panel collapse state.
- Each panel is backed by a dedicated component that talks to the new Functions and keeps the layout compact.

## Phase 3: Guided deploy and post-deploy checklist (partial)
- Deploy wizard creates collection drafts (`POST /collections`) and offers `showContractDeploy` for `xtrata-collection-mint-v1.1` with a normalized `contractName` and `walletSession.address`.
- TODO: add validation for the contract name pattern before the wallet prompt, fill in the metadata/price/splits form once the collection is created, and persist those details to D1 before publishing.
- TODO: add a post-deploy checklist that runs the on-chain setup steps (`set-max-supply`, `set-splits`, `set-mint-price`, unpause/finalize) or at least surface warnings when those values remain default.

## Phase 4: Settings and ownership guards (partial)
- `CollectionSettingsPanel` can load a draft and patch `display_name`/`contract_address`, but it is not yet wired to contract read-only helpers from `CollectionMintAdminScreen` and lacks ownership/finalization guards.
- TODO: reuse the admin helpers for mixer price/splits/allowlist data, block edits if the connected wallet is not the contract owner, and surface a typed confirmation before marking a collection ready.

## Phase 5: Cloudflare asset staging (mostly complete)
- Functions expose the CRUD surface for collections (`index.ts` & `[collectionId].ts`), asset manifests (`[collectionId]/assets.ts`), publish actions, reservations, and upload URLs tied to the R2 binding.
- Asset uploads currently enforce the TTL (`COLLECTION_ASSET_TTL_MS`) and per-collection storage cap (`MAX_COLLECTION_STORAGE_BYTES`).
- TODO: add metadata updates per asset (token URI, edition cap, status transitions such as `sold-out`) and integrate minted counters so manifests track how many editions were consumed.

## Phase 6: Buyer mint from staged assets (not started)
- API surface for `reserve/confirm/release` exists but no frontend or mint flow consumes it; reservations never transition to `confirmed` and the portal never marks assets as sold.
- TODO: build the collection-scoped viewer so buyers only see the collection mint contract’s IDs, resolve staged assets when the on-chain data is missing, and drive the mint flow through the reservation → confirm cycle.

## Phase 7: Ops tooling, reservation recovery, and logging (not started)
- Publish is a state toggle; there is no action log, no release/cleanup buttons, and no visibility into `reservation-expiry-blocks` or how to recover stuck mints.
- TODO: add the ops panel buttons that hit `release-expired-reservation`/`release-reservation`, surface the TTL derived from the contract, and persist sequential operations for auditing.

## Phase 8: Documentation, rollout, and tagging (in progress)
- Docs are being refreshed in this folder, `docs/app-reference.md`, and new spec files so the next engineer can understand the Cloudflare backend.
- TODO: keep linking each new class of API/component in the reference map and add new manual/integration tests in `src/lib/collection-manager/__tests__` as the UX fleshes out.
