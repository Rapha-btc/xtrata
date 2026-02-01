# Contract Inventory

## xtrata-v1.1.0

Source: `contracts/live/xtrata-v1.1.0.clar`

## Trait
- Implements SIP-009: `nft-trait` (local/testnet/mainnet variants managed by `scripts/contract-variants.mjs`).

## NFT
- `xtrata-inscription` (non-fungible token, `uint` ids)

## Error Codes
- `ERR-NOT-AUTHORIZED` -> `(err u100)`
- `ERR-NOT-FOUND` -> `(err u101)`
- `ERR-INVALID-BATCH` -> `(err u102)`
- `ERR-HASH-MISMATCH` -> `(err u103)`
- `ERR-INVALID-URI` -> `(err u107)`
- `ERR-PAUSED` -> `(err u109)`
- `ERR-INVALID-FEE` -> `(err u110)`
- `ERR-DEPENDENCY-MISSING` -> `(err u111)`
- `ERR-EXPIRED` -> `(err u112)`
- `ERR-NOT-EXPIRED` -> `(err u113)`
- `ERR-DUPLICATE` -> `(err u114)`

## Constants
- `MAX-BATCH-SIZE` -> `u50`
- `MAX-SEAL-BATCH-SIZE` -> `u50`
- `CHUNK-SIZE` -> `u16384`
- `MAX-TOTAL-CHUNKS` -> `u2048`
- `MAX-TOTAL-SIZE` -> `(* MAX-TOTAL-CHUNKS CHUNK-SIZE)`
- `FEE-MIN` -> `u1000`
- `FEE-MAX` -> `u1000000`
- `UPLOAD-EXPIRY-BLOCKS` -> `u4320`
- `SVG-STATIC` -> static SVG string
- `SVG-STATIC-B64` -> base64 encoded SVG
- `SVG-DATAURI-PREFIX` -> `data:image/svg+xml;base64,`

## Data Vars
- `contract-owner` (principal)
- `next-id` (uint)
- `royalty-recipient` (principal)
- `fee-unit` (uint)
- `paused` (bool, default `true`)

## Maps
- `TokenURIs` -> `uint` => `(string-ascii 256)`
- `HashToId` -> `(buff 32)` => `uint`
- `InscriptionMeta` -> `uint` => `{ owner: principal, creator: principal, mime-type: (string-ascii 64), total-size: uint, total-chunks: uint, sealed: bool, final-hash: (buff 32) }`
- `InscriptionDependencies` -> `uint` => `(list 50 uint)`
- `UploadState` -> `{ owner: principal, hash: (buff 32) }` => `{ mime-type: (string-ascii 64), total-size: uint, total-chunks: uint, current-index: uint, running-hash: (buff 32), last-touched: uint, purge-index: uint }`
- `Chunks` -> `{ context: (buff 32), creator: principal, index: uint }` => `(buff 16384)`

## Public Functions
- `transfer(id, sender, recipient)`
- `set-royalty-recipient(recipient)`
- `set-fee-unit(new-fee)`
- `set-paused(value)`
- `transfer-contract-ownership(new-owner)`
- `begin-or-get(expected-hash, mime, total-size, total-chunks)`
- `begin-inscription(expected-hash, mime, total-size, total-chunks)`
- `add-chunk-batch(hash, chunks)`
- `seal-inscription(expected-hash, token-uri-string)`
- `seal-inscription-batch(items)`
- `seal-recursive(expected-hash, token-uri-string, dependencies)`
- `abandon-upload(expected-hash)`
- `purge-expired-chunk-batch(hash, owner, indexes)`

## Read-Only Functions
- `get-last-token-id()`
- `get-next-token-id()`
- `get-token-uri(id)`
- `get-token-uri-raw(id)`
- `get-owner(id)`
- `get-svg(id)`
- `get-svg-data-uri(id)`
- `get-id-by-hash(hash)`
- `get-inscription-meta(id)`
- `inscription-exists(id)`
- `get-inscription-hash(id)`
- `get-inscription-creator(id)`
- `get-inscription-size(id)`
- `get-inscription-chunks(id)`
- `is-inscription-sealed(id)`
- `get-chunk(id, index)`
- `get-chunk-batch(id, indexes)`
- `get-dependencies(id)`
- `get-upload-state(expected-hash, owner)`
- `get-pending-chunk(hash, creator, index)`
- `get-admin()`
- `get-royalty-recipient()`
- `get-fee-unit()`
- `is-paused()`

## Private Functions (internal)
- Internal helpers cover fee math, upload expiry checks, and hashing logic. See contract source for details.
