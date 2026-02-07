# Xtrata v2.1.0 API Reference

Contract: `xtrata-v2.1.0`

This reference summarizes public and read-only functions, storage, constants,
fees, and error codes.

## Error Codes
- ERR-NOT-AUTHORIZED -> (err u100)
- ERR-NOT-FOUND -> (err u101)
- ERR-INVALID-BATCH -> (err u102)
- ERR-HASH-MISMATCH -> (err u103)
- ERR-INVALID-URI -> (err u107)
- ERR-PAUSED -> (err u109)
- ERR-INVALID-FEE -> (err u110)
- ERR-DEPENDENCY-MISSING -> (err u111)
- ERR-EXPIRED -> (err u112)
- ERR-NOT-EXPIRED -> (err u113)
- ERR-DUPLICATE -> (err u114)
- ERR-ALREADY-SET -> (err u115)

## Constants
- MAX-BATCH-SIZE: u50
- MAX-SEAL-BATCH-SIZE: u50
- CHUNK-SIZE: u16384
- MAX-TOTAL-CHUNKS: u2048
- MAX-TOTAL-SIZE: MAX-TOTAL-CHUNKS * CHUNK-SIZE
- FEE-MIN: u1000
- FEE-MAX: u1000000
- UPLOAD-EXPIRY-BLOCKS: u4320
- SVG-STATIC, SVG-STATIC-B64, SVG-DATAURI-PREFIX (placeholder SVG helpers)

## Data Vars
- contract-owner: principal
- next-id: uint
- royalty-recipient: principal
- fee-unit: uint
- paused: bool
- offset-set: bool
- minted-count: uint
- max-minted-id: uint

## Maps
- TokenURIs: uint -> (string-ascii 256)
- HashToId: (buff 32) -> uint
- InscriptionMeta: uint -> { owner, creator, mime-type, total-size, total-chunks, sealed, final-hash }
- InscriptionDependencies: uint -> (list 50 uint)
- UploadState: { owner, hash } -> { mime-type, total-size, total-chunks, current-index, running-hash, last-touched, purge-index }
- Chunks: { context, creator, index } -> (buff 16384)
- AllowedCallers: principal -> bool
- MintedIndex: uint -> uint
- MigratedFromV1: uint -> bool

## Fee Model (one-knob)
- Begin fee: fee-unit (charged once per new upload session).
- Seal fee: fee-unit * (1 + ceil(total-chunks / 50)).
- Batch seal fee: sum of per-item seal fees.
- Migration fee: fee-unit.
- If tx-sender == royalty-recipient, no fee transfer is performed.

## Public Functions

### SIP-009 and Admin

- transfer(id, sender, recipient) -> (response bool uint)
  - Transfers NFT ownership (not paused).
  - Errors: ERR-NOT-AUTHORIZED, ERR-NOT-FOUND.

- set-royalty-recipient(recipient) -> (response bool uint)
  - Sets fee recipient.
  - Errors: ERR-NOT-AUTHORIZED.

- set-fee-unit(new-fee) -> (response bool uint)
  - Bounded update to fee-unit.
  - Errors: ERR-NOT-AUTHORIZED, ERR-INVALID-FEE.

- set-next-id(value) -> (response bool uint)
  - One-time offset for ID continuity.
  - Errors: ERR-NOT-AUTHORIZED, ERR-ALREADY-SET.

- set-allowed-caller(caller, allowed) -> (response bool uint)
  - Adds or removes an allowlisted contract-caller.
  - Errors: ERR-NOT-AUTHORIZED.

- set-paused(value) -> (response bool uint)
  - Pauses or unpauses inscription writes.
  - Errors: ERR-NOT-AUTHORIZED.

- transfer-contract-ownership(new-owner) -> (response bool uint)
  - Transfers contract admin role.
  - Errors: ERR-NOT-AUTHORIZED.

### Migration

- migrate-from-v1(token-id) -> (response uint uint)
  - Escrows v1 token and mints same ID in v2.
  - Errors: ERR-PAUSED, ERR-NOT-FOUND, ERR-DUPLICATE, ERR-NOT-AUTHORIZED.
  - Notes: chunk data remains in v1; v2 stores metadata and token-uri.

### Inscription Flow

- begin-or-get(expected-hash, mime, total-size, total-chunks) -> (response (optional uint) uint)
  - If hash already sealed, returns (ok (some id)). Otherwise begins upload.
  - Errors: ERR-PAUSED, ERR-INVALID-BATCH, ERR-DUPLICATE, ERR-EXPIRED.

- begin-inscription(expected-hash, mime, total-size, total-chunks) -> (response bool uint)
  - Starts or resumes an upload session.
  - Errors: ERR-PAUSED, ERR-INVALID-BATCH, ERR-DUPLICATE, ERR-EXPIRED.

- add-chunk-batch(hash, chunks) -> (response bool uint)
  - Appends up to 50 chunks to the upload session.
  - Errors: ERR-PAUSED, ERR-NOT-FOUND, ERR-EXPIRED, ERR-INVALID-BATCH.

- seal-inscription(expected-hash, token-uri-string) -> (response uint uint)
  - Seals a single inscription.
  - Errors: ERR-PAUSED, ERR-NOT-FOUND, ERR-HASH-MISMATCH, ERR-INVALID-URI,
    ERR-INVALID-BATCH, ERR-DUPLICATE.

- seal-inscription-batch(items) -> (response { start: uint, count: uint } uint)
  - Batch sealing for up to 50 items.
  - Errors: ERR-PAUSED, ERR-INVALID-BATCH, ERR-DUPLICATE.

- seal-recursive(expected-hash, token-uri-string, dependencies) -> (response uint uint)
  - Seals and records dependencies.
  - Errors: ERR-PAUSED, ERR-DEPENDENCY-MISSING, plus seal errors.

### Upload Lifecycle

- abandon-upload(expected-hash) -> (response bool uint)
  - Marks upload as expired so it can be purged immediately.
  - Errors: ERR-PAUSED, ERR-NOT-FOUND.

- purge-expired-chunk-batch(hash, owner, indexes) -> (response bool uint)
  - Deletes expired chunks in batch; can be called by anyone.
  - Errors: ERR-NOT-FOUND, ERR-NOT-EXPIRED, ERR-INVALID-BATCH.

## Read-Only Functions

- get-last-token-id() -> (response uint uint)
  - Highest minted ID (not necessarily contiguous).

- get-next-token-id() -> (response uint uint)
  - Next ID to be minted.

- get-minted-count() -> (response uint uint)
- get-minted-id(index) -> (optional uint)
  - Enumerate minted IDs in mint order.

- get-token-uri(id) -> (response (optional (string-ascii 256)) uint)
- get-token-uri-raw(id) -> (optional (string-ascii 256))
- get-owner(id) -> (response (optional principal) uint)

- get-svg(id) -> (response (optional (string-ascii ...)) uint)
- get-svg-data-uri(id) -> (response (optional (string-ascii ...)) uint)

- get-id-by-hash(hash) -> (optional uint)

- get-inscription-meta(id) -> (optional { owner, creator, mime-type, total-size, total-chunks, sealed, final-hash })
- inscription-exists(id) -> (response bool uint)
- get-inscription-hash(id) -> (optional (buff 32))
- get-inscription-creator(id) -> (optional principal)
- get-inscription-size(id) -> (optional uint)
- get-inscription-chunks(id) -> (optional uint)
- is-inscription-sealed(id) -> (optional bool)

- get-chunk(id, index) -> (optional (buff 16384))
- get-chunk-batch(id, indexes) -> (list 50 (optional (buff 16384)))

- get-dependencies(id) -> (list 50 uint)
- get-upload-state(expected-hash, owner) -> (optional UploadState)
- get-pending-chunk(hash, creator, index) -> (optional (buff 16384))

- get-admin() -> (response principal uint)
- is-allowed-caller(caller) -> (response bool uint)
- get-royalty-recipient() -> (response principal uint)
- get-fee-unit() -> (response uint uint)
- is-paused() -> (response bool uint)
