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

## xtrata-v2.1.1

Source: `contracts/live/xtrata-v2.1.1.clar`

## Purpose
- Fee-controls upgrade on top of v2.1.0 with split pricing knobs.
- Keeps the same begin/upload/seal flow and v2 migration/indexing capabilities.

## Fee Model (split knobs)
- Begin fee: `begin-fee-unit`.
- Seal fee:
  - `seal-fee-unit`
  - `+ upload-chunk-fee-unit * min(total-chunks, 50)`
  - `+ upload-batch-fee-unit * ceil(max(total-chunks - 50, 0) / 50)`
- Migration fee: `begin-fee-unit`.

## New Public Fee Setters
- `set-begin-fee-unit(new-fee)`
- `set-upload-chunk-fee-unit(new-fee)`
- `set-upload-batch-fee-unit(new-fee)`
- `set-seal-fee-unit(new-fee)`

## Compatibility Fee Setter
- `set-fee-unit(new-fee)`
  - Legacy convenience profile:
    - `begin = new-fee`
    - `upload-chunk = max(FEE-MIN, floor(new-fee / 50))`
    - `upload-batch = new-fee`
    - `seal = new-fee`

## New Read-Only Fee Getters
- `get-begin-fee-unit()`
- `get-upload-chunk-fee-unit()`
- `get-upload-batch-fee-unit()`
- `get-seal-fee-unit()`

## Compatibility Fee Getter
- `get-fee-unit()` (maps to `upload-batch-fee-unit`)

## xtrata-small-mint-v1.0

Source: `contracts/live/xtrata-small-mint-v1.0.clar`

## Purpose
- Optional small-file mint helper that composes core xtrata writes into one call.
- Targets `xtrata-v2.1.0` by default, with owner-configurable core contract.
- Enforces helper-side small upload cap (`<= 30` chunks).

## Core Behavior
- One-call path runs `begin-or-get -> add-chunk-batch -> seal` in a single tx.
- Duplicate hashes return the existing canonical token id (no new mint).
- Recursive sealing is supported through `mint-small-single-tx-recursive`.
- Core protocol fees and core pause/allowlist semantics still apply.

## Constants
- `CHUNK-SIZE` -> `u16384`
- `MAX-SMALL-CHUNKS` -> `u30`
- `DEFAULT-XTRATA-CONTRACT` -> default core principal

## Public Functions
- `mint-small-single-tx(xtrata-contract, expected-hash, mime, total-size, chunks, token-uri-string)`
- `mint-small-single-tx-recursive(xtrata-contract, expected-hash, mime, total-size, chunks, token-uri-string, dependencies)`
- `set-paused(value)`
- `set-core-contract(new-core)`
- `transfer-contract-ownership(new-owner)`

## Read-Only Functions
- `get-owner()`
- `is-paused()`
- `get-core-contract()`
- `get-max-small-chunks()`

## xtrata-arcade-scores-v1.0

Source: `contracts/live/xtrata-arcade-scores-v1.0.clar`

## Purpose
- Lightweight arcade leaderboard + score attestation contract for single-call writes.
- Maintains a ranked top-10 board per `{game-id, mode}`.
- Stores each caller's best verified score per `{game-id, mode}`.
- Mode semantics: `u0` score mode (higher is better), `u1` time mode (lower is better).

## Error Codes
- `ERR-INVALID-MODE` -> `(err u100)`
- `ERR-NOT-IMPROVEMENT` -> `(err u101)`
- `ERR-INVALID-NAME` -> `(err u102)`
- `ERR-INVALID-SCORE` -> `(err u103)`
- `ERR-NOT-AUTHORIZED` -> `(err u104)`
- `ERR-NOT-TOP10` -> `(err u105)`
- `ERR-INVALID-RANK` -> `(err u106)`

## Data Vars
- `contract-owner` (principal)

## Maps
- `PlayerBest` -> `{ game-id: (string-ascii 32), mode: uint, player: principal }` => `{ name: (string-ascii 12), score: uint, updated-at: uint }`
- `LeaderboardSlot` -> `{ game-id: (string-ascii 32), mode: uint, rank: uint }` => `{ player: principal, name: (string-ascii 12), score: uint, updated-at: uint }`

## Public Functions
- `submit-score(game-id, mode, score, player-name)`
- `transfer-contract-ownership(new-owner)`

## Read-Only Functions
- `get-player-best(game-id, mode, player)`
- `get-top10(game-id, mode)`
- `get-top10-entry(game-id, mode, rank)`
- `get-owner()`

## xtrata-arcade-scores-v1.1

Source: `contracts/live/xtrata-arcade-scores-v1.1.clar`

## Purpose
- Arcade leaderboard contract with attested score submissions, replay protection, and configurable write fees.
- Maintains a ranked top-10 board per `{game-id, mode}` and stores each caller's best verified score.
- Mode semantics: `u0` score mode (higher is better), `u1` time mode (lower is better).

## Error Codes
- `ERR-INVALID-MODE` -> `(err u100)`
- `ERR-NOT-IMPROVEMENT` -> `(err u101)`
- `ERR-INVALID-NAME` -> `(err u102)`
- `ERR-INVALID-SCORE` -> `(err u103)`
- `ERR-NOT-AUTHORIZED` -> `(err u104)`
- `ERR-NOT-TOP10` -> `(err u105)`
- `ERR-INVALID-RANK` -> `(err u106)`
- `ERR-INVALID-FEE` -> `(err u107)`
- `ERR-NONCE-ALREADY-USED` -> `(err u108)`
- `ERR-SIGNATURE-INVALID` -> `(err u109)`
- `ERR-ATTESTATION-EXPIRED` -> `(err u110)`
- `ERR-ATTESTER-NOT-CONFIGURED` -> `(err u111)`

## Fee Constants
- `FEE-MIN` -> `u100` (0.0001 STX)
- `FEE-MAX` -> `u1000000` (1 STX)
- `DEFAULT-FEE` -> `u30000` (0.03 STX)

## Data Vars
- `contract-owner` (principal)
- `fee-unit` (uint)
- `fee-recipient` (principal)
- `verifier-pubkey-hash` (`optional (buff 20)`)

## Attestation Notes
- Signatures are recovered with `secp256k1-recover?` and must be 65-byte RSV format.
- `verifier-pubkey-hash` should be `hash160` of the verifier's compressed secp256k1 pubkey bytes.
- Helper command: `npm run arcade:verifier-hash -- <private-key-hex>`

## Maps
- `PlayerBest` -> `{ game-id: (string-ascii 32), mode: uint, player: principal }` => `{ name: (string-ascii 12), score: uint, updated-at: uint }`
- `LeaderboardSlot` -> `{ game-id: (string-ascii 32), mode: uint, rank: uint }` => `{ player: principal, name: (string-ascii 12), score: uint, updated-at: uint }`
- `UsedNonce` -> `{ player: principal, nonce: uint }` => `bool`

## Public Functions
- `submit-score(game-id, mode, score, player-name, nonce, expires-at, signature)`
- `set-fee-unit(new-fee)`
- `set-fee-recipient(recipient)`
- `set-verifier-pubkey-hash(new-hash)`
- `transfer-contract-ownership(new-owner)`

## Read-Only Functions
- `get-player-best(game-id, mode, player)`
- `get-top10(game-id, mode)`
- `get-top10-entry(game-id, mode, rank)`
- `is-nonce-used(player, nonce)`
- `get-owner()`
- `get-fee-unit()`
- `get-fee-recipient()`
- `get-verifier-pubkey-hash()`

## xtrata-collection-mint-v1.4 (template, active)

Source: `contracts/clarinet/contracts/xtrata-collection-mint-v1.4.clar`

## Purpose
- Per-collection mint coordinator that charges a one-time mint fee split, supports allowlists and per-wallet caps, and proxies xtrata begin/chunk/seal calls.
- Adds direct single-tx small-file mint path (`<=30` chunks) while preserving collection reservation + accounting invariants.
- SDK support note: archived for new SDK work. Active collection-mint SDK target is `xtrata-collection-mint-v1.4`.

## Core Admin Functions
- `set-mint-price(amount)`
- `set-max-supply(amount)` (single-use)
- `finalize()`
- `set-allowlist-enabled(value)`
- `set-max-per-wallet(amount)`
- `set-allowlist(owner, allowance)`
- `clear-allowlist(owner)`
- `set-allowlist-batch(entries)`
- `set-recipient-editor-access(xtrata-contract, editor, can-marketplace, can-operator)` (core Xtrata admin signer)
- `set-artist-recipient(artist)` (collection owner signer)
- `set-marketplace-recipient(marketplace)` (recipient-editor signer)
- `set-operator-recipient(operator)` (recipient-editor signer)
- `set-recipients(artist, marketplace, operator)`
- `set-splits(artist, marketplace, operator)`
- `set-paused(value)`
- `transfer-contract-ownership(new-owner)`
- `release-reservation(owner, hash)`

## Core Mint Functions
- `mint-begin(xtrata-contract, expected-hash, mime, total-size, total-chunks)`
- `mint-add-chunk-batch(xtrata-contract, hash, chunks)`
- `mint-seal(xtrata-contract, expected-hash, token-uri-string)`
- `mint-seal-batch(xtrata-contract, items)`
- `mint-small-single-tx(xtrata-contract, expected-hash, mime, total-size, chunks, token-uri-string)`
- `mint-small-single-tx-recursive(xtrata-contract, expected-hash, mime, total-size, chunks, token-uri-string, dependencies)`

## Additional Read-Only Functions
- `get-allowlist-enabled()`
- `get-max-per-wallet()`
- `get-allowlist-entry(owner)`
- `get-wallet-stats(owner)`
- `get-finalized()`
- `get-recipient-editor-access(editor)`

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

## xtrata-commerce

Source: `contracts/live/xtrata-commerce.clar`

## Purpose
- Fixed-price USDCx entitlement listings for Xtrata assets.
- Sellers list asset ids they currently control in the core contract.
- Buyers pay USDCx and receive one-time entitlements keyed by `{buyer, asset-id}`.

## Core Functions
- `create-listing(asset-id, price)`
- `set-listing-active(listing-id, active)`
- `buy-with-usdc(listing-id)`

## Read-Only Functions
- `get-owner()`
- `get-core-contract()`
- `get-payment-token()`
- `get-next-listing-id()`
- `get-listing(listing-id)`
- `has-entitlement(asset-id, owner)`

## Notes
- No auctions, royalties, multi-splits, or x402 logic in this MVP.
- Purchase path re-checks seller control against the core Xtrata contract before transferring USDCx.

## xtrata-market-stx-v1.0

Source: `contracts/live/xtrata-market-stx-v1.0.clar`

## Purpose
- Fixed-price STX escrow marketplace for Xtrata `v2.1.0` inscriptions.
- Sellers escrow inscriptions into the market contract on listing.
- Buyers pay STX and receive immediate ownership transfer from escrow.

## Core Functions
- `set-fee-bps(new-fee)`
- `list-token(nft-contract, token-id, price)`
- `cancel(nft-contract, listing-id)`
- `buy(nft-contract, listing-id)`

## Read-Only Functions
- `get-owner()`
- `get-nft-contract()`
- `get-fee-bps()`
- `get-last-listing-id()`
- `get-listing(listing-id)`
- `get-listing-by-token(nft-contract, token-id)`
- `get-listing-id-by-token(nft-contract, token-id)`

## Notes
- This is the default first-party STX market entry in the app market selector.
- It is pinned to `xtrata-v2.1.0`, unlike the older legacy STX market family.
- It mirrors the dedicated USDCx and sBTC market shape while keeping STX settlement.

## xtrata-market-usdc-v1.0

Source: `contracts/live/xtrata-market-usdc-v1.0.clar`

## Purpose
- Fixed-price USDCx escrow marketplace for Xtrata `v2.1.0` inscriptions.
- Sellers escrow inscriptions into the market contract on listing.
- Buyers pay USDCx and receive immediate ownership transfer from escrow.

## Core Functions
- `set-fee-bps(new-fee)`
- `list-token(nft-contract, token-id, price)`
- `cancel(nft-contract, listing-id)`
- `buy(nft-contract, listing-id)`

## Read-Only Functions
- `get-owner()`
- `get-nft-contract()`
- `get-payment-token()`
- `get-fee-bps()`
- `get-last-listing-id()`
- `get-listing(listing-id)`
- `get-listing-by-token(nft-contract, token-id)`
- `get-listing-id-by-token(nft-contract, token-id)`

## Notes
- Mirrors the dedicated STX `xtrata-market-stx-v1.0` escrow shape closely so later UI work can stay aligned across settlement assets.
- Settlement is in USDCx base units rather than STX micro-units.
- This contract is registered in the current app market selector.
- The first-party market UI now reads `get-payment-token()` and uses settlement-aware formatting and post-conditions for STX, USDCx, and sBTC market flows.

## xtrata-market-sbtc-v1.0

Source: `contracts/live/xtrata-market-sbtc-v1.0.clar`

## Purpose
- Fixed-price sBTC escrow marketplace for Xtrata `v2.1.0` inscriptions.
- Sellers escrow inscriptions into the market contract on listing.
- Buyers pay sBTC and receive immediate ownership transfer from escrow.

## Core Functions
- `set-fee-bps(new-fee)`
- `list-token(nft-contract, token-id, price)`
- `cancel(nft-contract, listing-id)`
- `buy(nft-contract, listing-id)`

## Read-Only Functions
- `get-owner()`
- `get-nft-contract()`
- `get-payment-token()`
- `get-fee-bps()`
- `get-last-listing-id()`
- `get-listing(listing-id)`
- `get-listing-by-token(nft-contract, token-id)`
- `get-listing-id-by-token(nft-contract, token-id)`

## Notes
- Mirrors the dedicated STX `xtrata-market-stx-v1.0` escrow shape closely so later UI work can stay aligned across settlement assets.
- Settlement is in sBTC base units rather than STX micro-units.
- This contract is registered in the current app market selector.
- The first-party market UI now reads `get-payment-token()` and uses settlement-aware formatting and post-conditions for STX, USDCx, and sBTC market flows.

## xtrata-vault

Source: `contracts/live/xtrata-vault.clar`

## Purpose
- sBTC reserve vaults tied to Xtrata asset ids.
- Asset owners open one vault per asset, deposit additional sBTC, and track a reserve marker.
- Premium access is derived from deterministic deposit thresholds.

## Core Functions
- `open-vault(asset-id, initial-amount)`
- `deposit-sbtc(vault-id, amount)`
- `mark-reserved(vault-id, reserved)`

## Read-Only Functions
- `get-owner()`
- `get-core-contract()`
- `get-reserve-token()`
- `get-next-vault-id()`
- `get-vault(vault-id)`
- `get-tier-for-amount(amount)`
- `has-premium-access(asset-id, user)`

## Tier Thresholds
- `u0` below `TIER-1-MIN`
- `u1` at or above `TIER-1-MIN`
- `u2` at or above `TIER-2-MIN`
- `u3` at or above `TIER-3-MIN`

## Notes
- No withdrawals or vault ownership migration in this MVP.
- Vault actions re-check core asset ownership before allowing top-ups or reserve-state changes.
