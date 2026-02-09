# Data Model, API, and Workflow Specification

## Data model (proposed)

## `CollectionRecord`

1. `id: string`
2. `slug: string`
3. `network: 'mainnet' | 'testnet'`
4. `artistAddress: string`
5. `contractAddress: string`
6. `contractName: string`
7. `coreContractId: string`
8. `displayName: string`
9. `description: string`
10. `bannerUrl?: string`
11. `logoUrl?: string`
12. `mintPriceMicroStx?: string`
13. `maxSupply?: string`
14. `mintedCount?: string`
15. `reservedCount?: string`
16. `paused?: boolean`
17. `finalized?: boolean`
18. `state: 'draft' | 'published' | 'archived'`
19. `createdAt: string`
20. `updatedAt: string`

## `AssetRecord`

1. `assetId: string`
2. `collectionId: string`
3. `path: string`
4. `filename: string`
5. `mimeType: string`
6. `totalBytes: number`
7. `totalChunks: number`
8. `expectedHashHex: string`
9. `tokenUri: string`
10. `editionCap: number | null` (`null` = open edition)
11. `mintedCount: number`
12. `state: 'draft' | 'published' | 'disabled' | 'sold-out'`
13. `storageKey: string`
14. `chunkManifestKey?: string`
15. `createdAt: string`
16. `updatedAt: string`

## `MintReservationRecord` (MVP off-chain safety)

1. `reservationId: string`
2. `collectionId: string`
3. `assetId: string`
4. `buyerAddress: string`
5. `status: 'created' | 'tx-submitted' | 'confirmed' | 'released' | 'expired'`
6. `txId?: string`
7. `expiresAt: string`

## API surface (proposed)

All mutating endpoints require wallet-auth proof + allowlist + ownership checks.

## Collection endpoints

1. `POST /api/collections`
- Create draft collection record after deploy intent.

2. `GET /api/collections?artist=<address>`
- List artist-owned collections.

3. `GET /api/collections/:collectionId`
- Load collection detail.

4. `PATCH /api/collections/:collectionId`
- Update off-chain metadata and state fields.

5. `POST /api/collections/:collectionId/publish`
- Publish collection and validate required setup.

## Asset endpoints

1. `POST /api/collections/:collectionId/assets/upload`
- Upload folder items (multipart or chunked upload protocol).

2. `GET /api/collections/:collectionId/assets`
- List asset manifest entries.

3. `PATCH /api/collections/:collectionId/assets/:assetId`
- Update token URI, edition cap, state.

4. `POST /api/collections/:collectionId/assets/:assetId/reserve`
- Reserve mint slot for buyer.

5. `POST /api/collections/:collectionId/assets/:assetId/confirm`
- Confirm tx and increment minted counters.

6. `POST /api/collections/:collectionId/assets/:assetId/release`
- Release failed/expired reservation.

## Example workflow specs

## Artist flow: create and configure

1. Connect wallet and pass manager gate.
2. Deploy `xtrata-collection-mint-v1.0` contract with guided wizard.
3. Create `CollectionRecord` draft.
4. Run setup actions on contract:
- `set-max-supply`,
- `set-recipients`,
- `set-splits`,
- `set-mint-price`,
- optional `set-allowlist-enabled` and `set-max-per-wallet`,
- `set-paused(false)` when ready.
5. Upload folder and configure asset-level metadata.
6. Publish collection.

## Buyer flow: mint from staged asset

1. Open published collection page.
2. Pick available asset.
3. Create reservation record.
4. Execute mint tx order:
- `mint-begin`,
- `mint-add-chunk-batch` (one or more),
- `mint-seal` or `mint-seal-batch`.
5. Confirm tx and finalize reservation.
6. Refresh viewer/wallet state.

## Error and idempotency rules

1. Reservation API must be idempotent by `(collectionId, assetId, buyerAddress)` window.
2. Confirm endpoint accepts retries with same tx id.
3. Publish endpoint fails with explicit reasons:
- contract paused,
- missing supply config,
- no published assets,
- ownership mismatch.
