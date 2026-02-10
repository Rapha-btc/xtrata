# Collection Manager Full Implementation Spec

## Current status
- `src/main.tsx` routes `/manage` through `ArtistManagerGate` → `CollectionManagerApp`, and `src/config/manage.ts` keeps the allowlist centralized.
- `CollectionManagerApp` composes the collection list, deploy, settings, asset staging, and publish panels; each component already binds to the `/collections` and `/collections/:id/*` functions.
- Cloudflare Pages Functions implement the API surface (`collections/index.ts`, `[collectionId].ts`, `/assets`, `/publish`, `/reserve`, `/upload-url`) backed by D1 (`collections`, `assets`, `reservations`) and R2 (`ASSETS`).
- Storage guards enforce `MAX_COLLECTION_STORAGE_BYTES`, TTL (`COLLECTION_ASSET_TTL_MS`), and slug normalization (`functions/lib/collections.ts`), with helper tests under `functions/lib/__tests__`.

## Cloudflare backend wiring
- Pages bindings: `DB` → `xtrata-manage` (D1) and `ASSETS` → `xtrata-manage-assets` (R2). Migrations run via `wrangler d1 migrations apply xtrata-manage --config functions/wrangler.toml` to create the three tables.
- API endpoints return JSON structures the panels expect: `/collections` for drafts, `/collections/:id` for detail, `/assets` for manifest entries, `/reserve` for reservations, `/publish` for state changes, `/upload-url` for temporary PUT tokens.
- Guard configuration: the functions currently accept unauthenticated requests, so the first priority is adding wallet-signed allowlist proofs and owner validation before trusting any `POST`/`PATCH` request.

## UI/UX state
- Deploy wizard creates drafts and triggers `showContractDeploy` for `xtrata-collection-mint-v1.1`, then patches the contract info on success.
- Settings panel can load a draft and edit the display name/contract address, though it still needs the richer metadata form and finalization guard.
- Asset staging uploads files via `/upload-url`, writes metadata to D1, and shows TTL/status for each manifest entry.
- Publish/ops panel flips state, shows pending reservations, and wires the publish request; the ops tooling lacks release/countdown actions and explicit publish validation.

## Outstanding work (next implementation phases)
1. **Secure the backend** — integrate wallet-signed allowlist checks and ownership proofs for `/collections`, `/assets`, `/publish`, and `/reserve`, and expose deterministic error responses for failures (e.g., `COLLECTION_NOT_READY`).
2. **Enrich metadata** — extend `CollectionRecord`/`AssetRecord` with the missing fields (contract name/description/price/splits, minted counters, token URIs) and add dedicated API endpoints or metadata forms so the UI can edit them without falling back to the raw `metadata` JSON column.
3. **Reservation + mint confirmation flow** — add asset-level confirm/release endpoints, have the mint client reserve assets before minting, and mark assets as `sold-out`/`minted` once the transaction is sealed. Show the `get-reservation-expiry-blocks`-derived countdown in the UI and surface admin release actions.
4. **Collection-scoped viewer** — build `CollectionMintViewer` that reads `get-minted-index-count`/`get-minted-id`, resolves staged manifest assets for missing sealed data, and renders tokens in 4x4 grid cells (reuse `TokenCardMedia` + `TokenContentPreview`).
5. **Ops/logging** — store sequential publish/asset/reservation actions for auditing, add `release-expired-reservation` buttons, and clearly show when a collection has been finalized so artists do not edit after the fact.
6. **Tests & verification** — add targeted tests under `src/lib/collection-manager/__tests__` (API helpers, viewer filtering, reservation countdowns) and expand Vitest coverage for the new Cloudflare helpers.

## Supporting docs
- Continue iterating on `Refactor-Plans/manage-collection-artist-portal/README.md`, `04-implementation-plan.md`, and `05-data-model-api-and-workflows.md` as features land.
- Follow the Cloudflare setup checklist in `09-full-implementation-spec/01-cloudflare-setup.md` before deploying branches to preview or production.
