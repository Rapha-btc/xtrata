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

## xtrata-v2.1.0

Source: `contracts/live/xtrata-v2.1.0.clar`

## Trait
- Implements SIP-009: `nft-trait` (local/testnet/mainnet variants managed by `scripts/contract-variants.mjs`).

## New Capabilities
- Allowlisted contract callers can inscribe while paused.
- Admin can set a one-time `next-id` offset.
- Optional migration from v1: escrow v1 token and mint the same id in v2.
- Mint index helpers for enumerating minted ids.

## Additional Data Vars
- `offset-set` (bool)
- `minted-count` (uint)
- `max-minted-id` (uint)

## Additional Maps
- `AllowedCallers` -> `principal` => `bool`
- `MintedIndex` -> `uint` => `uint`
- `MigratedFromV1` -> `uint` => `bool`

## Additional Public Functions
- `set-next-id(value)`
- `set-allowed-caller(caller, allowed)`
- `migrate-from-v1(token-id)`

## Additional Read-Only Functions
- `get-minted-count()`
- `get-minted-id(index)`
- `is-allowed-caller(caller)`

## xtrata-collection-mint-v1.0 (template)

Source: `contracts/clarinet/contracts/xtrata-collection-mint-v1.0.clar`

## Purpose
- Per-collection mint coordinator that charges a one-time mint fee split, supports allowlists and per-wallet caps, and proxies xtrata begin/chunk/seal calls.

## Core Admin Functions
- `set-mint-price(amount)`
- `set-max-supply(amount)` (single-use)
- `finalize()`
- `set-allowlist-enabled(value)`
- `set-max-per-wallet(amount)`
- `set-allowlist(owner, allowance)`
- `clear-allowlist(owner)`
- `set-allowlist-batch(entries)`
- `set-recipients(artist, marketplace, operator)`
- `set-splits(artist, marketplace, operator)`
- `set-paused(value)`
- `transfer-contract-ownership(new-owner)`
- `release-reservation(owner, hash)`

## Core Mint Functions
- `mint-begin(expected-hash, mime, total-size, total-chunks)`
- `mint-add-chunk-batch(hash, chunks)`
- `mint-seal(expected-hash, token-uri-string)`
- `mint-seal-batch(items)`

## Additional Read-Only Functions
- `get-allowlist-enabled()`
- `get-max-per-wallet()`
- `get-allowlist-entry(owner)`
- `get-wallet-stats(owner)`
- `get-finalized()`

## Private Functions (internal)
- Internal helpers cover fee math, upload expiry checks, and hashing logic. See contract source for details.

## xtrata-preinscribed-collection-sale-v1.0 (template)

Source: `contracts/clarinet/contracts/xtrata-preinscribed-collection-sale-v1.0.clar`

## Purpose
- Escrow sale coordinator for tokens that are already inscribed in xtrata-v2.1.0.
- Supports inventory deposit/withdraw, direct buy, payout splits, allowlists, per-wallet caps, and sale windows.

## Core Admin Functions
- `set-price(amount)`
- `set-recipients(artist, marketplace, operator)`
- `set-splits(artist, marketplace, operator)`
- `set-paused(value)`
- `set-sale-window(start, end)`
- `set-allowlist-enabled(value)`
- `set-max-per-wallet(value)`
- `set-allowlist(owner, allowance)`
- `clear-allowlist(owner)`
- `set-allowlist-batch(entries)`
- `transfer-contract-ownership(new-owner)`
- `deposit-token(token-id)`
- `deposit-batch(token-ids)`
- `withdraw-token(token-id, recipient)`
- `withdraw-batch(token-ids, recipient)`

## Core Buyer Function
- `buy(token-id)`

## Additional Read-Only Functions
- `get-owner()`
- `get-paused()`
- `get-price()`
- `get-allowlist-enabled()`
- `get-max-per-wallet()`
- `get-sale-window()`
- `get-counts()`
- `get-recipients()`
- `get-splits()`
- `get-allowlist-entry(owner)`
- `get-wallet-stats(owner)`
- `get-inventory(token-id)`
- `is-token-available(token-id)`
- `get-allowed-xtrata-contract()`
