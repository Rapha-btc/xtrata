# Data Model, API, and Workflow Specification

## Current D1 schema
The migration `functions/migrations/001_create_collections.sql` creates three tables:

### `collections`
- `id TEXT PRIMARY KEY`
- `slug TEXT UNIQUE`
- `artist_address TEXT`
- `contract_address TEXT`
- `display_name TEXT`
- `metadata JSON`
- `state TEXT DEFAULT 'draft'`
- `created_at INTEGER`
- `updated_at INTEGER`

### `assets`
- `asset_id TEXT PRIMARY KEY`
- `collection_id TEXT`
- `path TEXT`
- `filename TEXT`
- `mime_type TEXT`
- `total_bytes INTEGER`
- `total_chunks INTEGER`
- `expected_hash TEXT`
- `storage_key TEXT`
- `edition_cap INTEGER`
- `state TEXT DEFAULT 'draft'`
- `expires_at INTEGER`
- `created_at INTEGER`
- `updated_at INTEGER`

### `reservations`
- `reservation_id TEXT PRIMARY KEY`
- `collection_id TEXT`
- `asset_id TEXT`
- `buyer_address TEXT`
- `hash_hex TEXT`
- `status TEXT`
- `tx_id TEXT`
- `expires_at INTEGER`
- `created_at INTEGER`
- `updated_at INTEGER`

## Planned schema enrichments
- `CollectionRecord` still needs the richer metadata from the original spec (network, contract name, pricing/supply, banner/logo URLs, splits, reserved/minted counters, finalized/paused flags). Most of these fields can live in the JSON `metadata` column for now, but we should add explicit columns once the UI starts editing them directly.
- `AssetRecord` needs fields for `token_uri`, `minted_count`, `storage_state` (sold-out/published), and reservation counters so the viewer can surface the remaining edition count.
- `ReservationRecord` should track a TTL derived from `get-reservation-expiry-blocks` (the backend stores `expires_at` in ms, but we need to keep it aligned with the on-chain block height) and add `collection_contract` for correlation when multiple collections exist.

## API surface (what exists today)
- `GET /collections` — lists all collections (ordered by `created_at`). Used by `CollectionListPanel`.
- `POST /collections` — inserts a draft collection record after slug normalization and slug validation (`functions/lib/collections.ts`).
- `GET /collections/:collectionId` — loads a single collection record.
- `PATCH /collections/:collectionId` — updates display name, contract address, metadata, or state.
- `POST /collections/:collectionId/publish` — toggles between `draft` and `published` states.
- `GET /collections/:collectionId/assets` — lists manifest entries; stale drafts with expired TTLs are marked `expired` during the read path.
- `POST /collections/:collectionId/assets` — writes asset metadata after uploading to R2; enforces TTL and per-collection storage cap via `MAX_COLLECTION_STORAGE_BYTES`.
- `GET /collections/:collectionId/reserve` / `POST /collections/:collectionId/reserve` / `PATCH /collections/:collectionId/reserve` — manage reservation lifecycle (create, confirm, release) with simple status updates.
- `GET /collections/:collectionId/upload-url` — generates a 5‑minute R2 PUT URL for uploads.

## API surface still needed
- Wallet-signed auth + allowlist proof verification on every mutating endpoint.
- Ownership validation that binds a collection to a deployed `xtrata-collection-mint` contract before allowing updates.
- Asset-level PATCH/confirm endpoints to set `token_uri`, update `edition_cap`, mark assets as `sold-out`, and reconcile minted counters.
- Reservation confirm + release flows tightly coupled to contract transactions (e.g., after `mint-seal` completes).
- `GET /collections/:collectionId/manifest` that joins `assets` + `reservations` with minted token IDs to serve the new viewer.

## Workflows in play
- **Artist workflow today:** Connect to `/manage`, create a draft collection via the deploy wizard, load/edit the draft, upload/stage assets, and flip `state` to `published`. Most panels work end-to-end, but there is no finalization guard or metadata form that writes back to D1 besides the patch in `CollectionSettingsPanel`.
- **Buyer/mint workflow:** Not implemented yet; the reservation APIs exist, but there is no front-end or on-chain coordination. The minted viewer and mint client must pull staged manifest data, reserve an asset, execute `mint-begin/add-chunk-batch/seal`, then confirm the reservation.
- **Error management:** Storage enforcement (TTL + cap) already throws `400`/`badRequest` for overages; future phases should add explicit `RESERVATION_LIMIT_REACHED`/`COLLECTION_NOT_READY` errors for better UX.
