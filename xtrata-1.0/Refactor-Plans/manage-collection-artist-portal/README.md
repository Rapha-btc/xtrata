# Manage Collection Artist Portal Status

This folder tracks the artist portal effort from the first gating work through the Cloudflare-backed staging pipeline and the remaining steps to ship the full collection mint experience.

## Current implementation
- The `/manage` entry point already exists: `src/main.tsx` branches on `MANAGE_PATH`, `ArtistManagerGate` enforces the VITE-configured allowlist, and `CollectionManagerApp` renders the five-core panels with the existing layout tokens.
- Each panel is wired to live data: `CollectionListPanel` reads `/collections`, `DeployWizardPanel` scaffolds collection drafts + contract deploys against `xtrata-collection-mint-v1.1.clar`, `CollectionSettingsPanel` loads/patches a draft, `AssetStagingPanel` uploads files to `functions/collections/:id/upload-url` → R2 and records manifest rows, and `PublishOpsPanel` lists reservations + publishes via `/collections/:id/publish`.
- Cloudflare Pages Functions invoke the API surface: `functions/collections/index.ts`, `/[collectionId].ts`, `/[collectionId]/assets.ts`, `/[collectionId]/publish.ts`, `/[collectionId]/reserve.ts`, and `/[collectionId]/upload-url.ts`. D1 migrations create `collections`, `assets`, and `reservations` tables; asset uploads enforce the per-collection cap (default 500 MB) and expiry TTL (default 3 days).
- Safety guards are in place: the backend caps storage via `MAX_COLLECTION_STORAGE_BYTES`, applies TTLs to `assets`, and reservation records carry `expires_at`. Lookup helpers normalize slugs (`functions/lib/collections.ts`) and are covered by Vitest (`functions/lib/__tests__/collections.test.ts`).
- The new diagnostics panel hits `/collections/health` and runs a test upload/resync so you can confirm both D1 and R2 from the portal.
- A full spec outline and Cloudflare handoff instructions now live in `Refactor-Plans/manage-collection-artist-portal/09-full-implementation-spec/`.

## Remaining deliverables
- **Backend auth & ownership checks:** the Functions accept unauthenticated requests today; we still need signed allowlist proofs, wallet ownership validation against the target contract, and per-collection admin keys before relying on `/collections` APIs in production.
- **Metadata & manifest enrichment:** collection records lack the planned metadata (contract name/description/banner/logo, price, supply, splits) and the asset manifest lacks minted counters, token URIs, or edition tracking; we still need API routes to update token-specific metadata/edition caps.
- **Reservation lifecycle:** the portal creates reservations but never confirms them from the mint flow or surfaces release-expired/reserve actions tied to `xtrata-collection-mint-v1.1` contract calls; this also blocks marking assets as `sold-out` once minted.
- **Collection-specific viewer:** no dedicated viewer currently filters by `get-minted-id` index counts, so buyers still rely on the universal grid; the viewer also needs to resolve staged manifest assets when minted data is not yet present.
- **Publish workflow & ops tooling:** publish is currently a blind state flip; we need pre-flight checks (asset counts, contract readiness, fee configs), action logs, and release controls for expired/failed mints.
- **Frontend polish & tests:** the new panels lack unit/integration tests, and the viewer/mint workflows still need coverage; we should add targeted tests under `src/lib/collection-manager/__tests__` and surface a `CollectionMintViewer` story for manual validation.

## Cloudflare configuration reminders
- Pages Functions already have `DB` → D1 (`xtrata-manage`) and `ASSETS` → R2 (`xtrata-manage-assets`) bindings. Confirm the bindings exist in both Production and Preview environments and that the `wrangler.toml` under `functions/` matches the values.
- Set environment flags for the storage guards you want downstream: `COLLECTION_ASSET_TTL_MS` (default `259200000` for 3 days) and `MAX_COLLECTION_STORAGE_BYTES` (default `524288000` for 500 MB); lower them if you want tighter budgets per collection.
- Provide `VITE_ARTIST_ALLOWLIST` (CSV of uppercase addresses) to keep the artist gate current. Vault the allowlist anywhere secure and mirror it in the Pages `env` so the gate + API share the same resolution logic.
- Follow the step-by-step checklist in `09-full-implementation-spec/01-cloudflare-setup.md` if you need to re-verify migrations, bindings, or env vars before shipping.

## Next steps for implementation
1. Harden the Cloudflare API layer (wallet-proof validation, ownership checks, asset transition states) and add the confirm/release APIs that will let mint clients complete their workflow through `xtrata-collection-mint-v1.1`.
2. Flesh out the collection record/asset schema with the remaining metadata mentioned above, expose a metadata editing surface, and ensure the deploy wizard writes those drafts back to D1 before publishing.
3. Implement the collection-scoped viewer/grid, reservation dashboard (with countdowns based on `get-reservation-expiry-blocks`), and front-end tests to exercise the new flows.
4. Keep the docs and spec (this folder + `docs/app-reference.md`) updated as the codebase evolves so follow-on implementers can pick up the remaining phases faster.
