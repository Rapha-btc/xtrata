# 01 — Contract Reference

## Deployed Contracts

### Current: xtrata-v2-1-0

- **Full contract ID (mainnet):** `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
- **Protocol version:** 2.1.0
- **Status:** Active, production

### Helper: xtrata-small-mint-v1-0

- **Full contract ID (mainnet):** `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0`
- **Purpose:** Optional single-transaction helper for fresh uploads up to 30 chunks
- **Status:** Active helper; core storage and dedupe still live in `xtrata-v2-1-0`

### Legacy: xtrata-v1-1-1

- **Full contract ID (mainnet):** `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1`
- **Protocol version:** 1.1.1
- **Status:** Legacy — used only for reading chunk data of migrated tokens

---

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `MAX-BATCH-SIZE` | `u50` | Maximum chunks per `add-chunk-batch` call |
| `MAX-SEAL-BATCH-SIZE` | `u50` | Maximum items per `seal-inscription-batch` |
| `CHUNK-SIZE` | `u16384` | Fixed chunk size: 16,384 bytes |
| `MAX-TOTAL-CHUNKS` | `u2048` | Maximum chunks per inscription |
| `MAX-TOTAL-SIZE` | `u33554432` | Maximum inscription size: 32 MiB (2048 * 16384) |
| `FEE-MIN` | `u1000` | Minimum fee-unit: 1,000 microSTX (0.001 STX) |
| `FEE-MAX` | `u1000000` | Maximum fee-unit: 1,000,000 microSTX (1.0 STX) |
| `UPLOAD-EXPIRY-BLOCKS` | `u4320` | Upload sessions expire after 4,320 blocks (~30 days) |

### Helper Constants

| Name | Value | Description |
|------|-------|-------------|
| `MAX-SMALL-CHUNKS` | `u30` | Maximum chunks accepted by the helper single-tx route |
| `CHUNK-SIZE` | `u16384` | Same core chunk size enforced by the helper |

---

## On-Chain Storage Maps

| Map Name | Key | Value | Description |
|----------|-----|-------|-------------|
| `TokenURIs` | `uint` | `(string-ascii 256)` | Optional token metadata URI |
| `HashToId` | `(buff 32)` | `uint` | Content-addressed deduplication lookup |
| `InscriptionMeta` | `uint` | `{ owner, creator, mime-type, total-size, total-chunks, sealed, final-hash }` | Core inscription metadata |
| `InscriptionDependencies` | `uint` | `(list 50 uint)` | Recursive dependency IDs |
| `UploadState` | `{ owner: principal, hash: (buff 32) }` | `{ mime-type, total-size, total-chunks, current-index, running-hash, last-touched, purge-index }` | Active upload session state |
| `Chunks` | `{ context: (buff 32), creator: principal, index: uint }` | `(buff 16384)` | Stored chunk data |
| `AllowedCallers` | `principal` | `bool` | Allowlisted contract callers (can inscribe while paused) |
| `MintedIndex` | `uint` | `uint` | Mint-order enumeration index |
| `MigratedFromV1` | `uint` | `bool` | Tracks which token IDs were migrated from v1 |

---

## Data Variables

| Variable | Type | Description |
|----------|------|-------------|
| `contract-owner` | `principal` | Admin address |
| `next-id` | `uint` | Next token ID to be minted |
| `royalty-recipient` | `principal` | Address receiving protocol fees |
| `fee-unit` | `uint` | Current fee unit in microSTX (default: 100,000 = 0.1 STX) |
| `paused` | `bool` | Whether inscription writes are paused |
| `offset-set` | `bool` | Whether the one-time ID offset has been applied |
| `minted-count` | `uint` | Total tokens minted in v2 |
| `max-minted-id` | `uint` | Highest token ID minted |

---

## Error Codes

| Code | Name | Meaning |
|------|------|---------|
| `u100` | `ERR-NOT-AUTHORIZED` | Caller is not the owner or authorized party |
| `u101` | `ERR-NOT-FOUND` | Token, upload session, or resource not found |
| `u102` | `ERR-INVALID-BATCH` | Batch size exceeds limit or is invalid (0 chunks, size > max) |
| `u103` | `ERR-HASH-MISMATCH` | Running hash does not match expected hash at seal time |
| `u107` | `ERR-INVALID-URI` | Token URI exceeds 256 characters |
| `u109` | `ERR-PAUSED` | Inscription writes are paused (transfers and reads still work) |
| `u110` | `ERR-INVALID-FEE` | Fee value outside allowed bounds (1,000–1,000,000 microSTX) |
| `u111` | `ERR-DEPENDENCY-MISSING` | A referenced dependency does not exist |
| `u112` | `ERR-EXPIRED` | Upload session has expired |
| `u113` | `ERR-NOT-EXPIRED` | Attempted to purge a session that has not yet expired |
| `u114` | `ERR-DUPLICATE` | Content hash already sealed (deduplication) |
| `u115` | `ERR-ALREADY-SET` | One-time setting (like next-id offset) already configured |

---

## Public Functions

### Inscription Lifecycle

#### Route Selection

- Use `xtrata-small-mint-v1-0` only when chunk count is `1..30` and there is no active upload state to resume.
- Use staged core calls for resumable uploads, files above 30 chunks, or helper-disabled environments.

#### `begin-or-get(expected-hash, mime, total-size, total-chunks)`

The **recommended** way to start an inscription. Smart deduplication: if the
hash is already sealed, returns the existing token ID immediately.

- **Parameters:**
  - `expected-hash` `(buff 32)` — SHA-256 chain hash of all chunks
  - `mime` `(string-ascii 64)` — MIME type (e.g., `"image/png"`, `"text/html"`)
  - `total-size` `uint` — Total byte count of the file
  - `total-chunks` `uint` — Number of 16,384-byte chunks
- **Returns:** `(response (optional uint) uint)`
  - `(ok (some <id>))` — Content already exists, returns canonical token ID
  - `(ok none)` — New upload session started (or existing resumed)
- **Fees:** `fee-unit` charged once on new session creation
- **Errors:** `ERR-PAUSED`, `ERR-INVALID-BATCH`, `ERR-DUPLICATE`, `ERR-EXPIRED`
- **Clarity:**
  ```clarity
  (contract-call? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
    begin-or-get
    0x<32-byte-hash>
    "image/png"
    u65536
    u4)
  ```

#### `begin-inscription(expected-hash, mime, total-size, total-chunks)`

Starts or resumes an upload session. Does **not** check for existing sealed
content (use `begin-or-get` instead for dedup).

- **Parameters:** Same as `begin-or-get`
- **Returns:** `(response bool uint)` — `(ok true)` on success
- **Fees:** `fee-unit` charged once on new session creation
- **Errors:** `ERR-PAUSED`, `ERR-INVALID-BATCH`, `ERR-DUPLICATE`, `ERR-EXPIRED`

#### `add-chunk-batch(expected-hash, chunks)`

Uploads up to 50 chunks to an active upload session. **No fee charged.**
Resumable — if upload was interrupted, calling again continues from where it
left off.

- **Parameters:**
  - `expected-hash` `(buff 32)` — Same hash used in `begin-or-get`
  - `chunks` `(list 50 (buff 16384))` — List of chunk buffers
- **Returns:** `(response bool uint)` — `(ok true)` on success
- **Fees:** None
- **Errors:** `ERR-PAUSED`, `ERR-NOT-FOUND`, `ERR-EXPIRED`, `ERR-INVALID-BATCH`
- **Clarity:**
  ```clarity
  (contract-call? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
    add-chunk-batch
    0x<32-byte-hash>
    (list 0x<chunk-1-bytes> 0x<chunk-2-bytes> ...))
  ```

#### `seal-inscription(expected-hash, token-uri)`

Seals a completed upload, verifies the hash, and mints an NFT.

- **Parameters:**
  - `expected-hash` `(buff 32)` — Same hash used throughout
  - `token-uri` `(string-ascii 256)` — Metadata URI (can be Arweave URL or any URI)
- **Returns:** `(response uint uint)` — `(ok <token-id>)` on success
- **Fees:** `fee-unit * (1 + ceil(total-chunks / 50))`
- **Errors:** `ERR-PAUSED`, `ERR-NOT-FOUND`, `ERR-HASH-MISMATCH`, `ERR-INVALID-URI`, `ERR-INVALID-BATCH`, `ERR-DUPLICATE`
- **Requirements:** All chunks must be uploaded (`current-index == total-chunks`) and running hash must match `expected-hash`

#### `seal-inscription-batch(items)`

Batch seals multiple inscriptions in one transaction.

- **Parameters:**
  - `items` `(list 50 { hash: (buff 32), token-uri: (string-ascii 256) })` — List of hash + URI pairs
- **Returns:** `(response { start: uint, count: uint } uint)` — Range of minted token IDs
- **Fees:** Sum of individual seal fees for each item
- **Errors:** `ERR-PAUSED`, `ERR-INVALID-BATCH`, `ERR-DUPLICATE`

#### `seal-recursive(expected-hash, token-uri, dependencies)`

Seals an inscription with explicit recursive dependencies. All dependencies
must already exist (be sealed) at call time.

- **Parameters:**
  - `expected-hash` `(buff 32)` — Content hash
  - `token-uri` `(string-ascii 256)` — Metadata URI
  - `dependencies` `(list 50 uint)` — Token IDs this inscription depends on
- **Returns:** `(response uint uint)` — `(ok <token-id>)`
- **Fees:** Same as `seal-inscription`
- **Errors:** `ERR-PAUSED`, `ERR-DEPENDENCY-MISSING`, plus all seal errors

### Optional Helper Lifecycle

#### `mint-small-single-tx(xtrata-contract, expected-hash, mime, total-size, chunks, token-uri-string)`

Combines `begin-or-get`, `add-chunk-batch`, and `seal-inscription` in one
wallet transaction. Only valid for fresh uploads up to 30 chunks.

- **Parameters:**
  - `xtrata-contract` `<xtrata-trait>` — Core contract principal, usually `xtrata-v2-1-0`
  - `expected-hash` `(buff 32)`
  - `mime` `(string-ascii 64)`
  - `total-size` `uint`
  - `chunks` `(list 50 (buff 16384))` — Must contain `1..30` chunks
  - `token-uri-string` `(string-ascii 256)`
- **Returns:** `(response { token-id: uint, existed: bool } uint)`
- **Fees:** One spend cap covering the begin fee plus the seal fee
- **Notes:** If the hash already exists, returns the canonical token ID with `existed = true`

#### `mint-small-single-tx-recursive(xtrata-contract, expected-hash, mime, total-size, chunks, token-uri-string, dependencies)`

Same helper route, but seals recursively.

- **Parameters:** Same as `mint-small-single-tx`, plus `dependencies` `(list 50 uint)`
- **Returns:** `(response { token-id: uint, existed: bool } uint)`
- **Notes:** Agent 27 should use this variant with dependencies exactly `[107]`

### Upload Lifecycle

#### `abandon-upload(expected-hash)`

Marks an upload session as expired so its chunks can be purged immediately.

- **Parameters:**
  - `expected-hash` `(buff 32)` — Hash identifying the upload session
- **Returns:** `(response bool uint)`
- **Errors:** `ERR-PAUSED`, `ERR-NOT-FOUND`

#### `purge-expired-chunk-batch(expected-hash, owner, indexes)`

Deletes expired chunks. Permissionless — anyone can call this to clean up.

- **Parameters:**
  - `expected-hash` `(buff 32)` — Hash identifying the session
  - `owner` `principal` — Session owner
  - `indexes` `(list 50 uint)` — Chunk indexes to purge
- **Returns:** `(response bool uint)`
- **Errors:** `ERR-NOT-FOUND`, `ERR-NOT-EXPIRED`, `ERR-INVALID-BATCH`

### SIP-009 NFT Standard

#### `transfer(id, sender, recipient)`

Transfers an inscription NFT. Works even when paused.

- **Parameters:**
  - `id` `uint` — Token ID
  - `sender` `principal` — Current owner (must be `tx-sender`)
  - `recipient` `principal` — New owner
- **Returns:** `(response bool uint)`
- **Errors:** `ERR-NOT-AUTHORIZED`, `ERR-NOT-FOUND`

### Admin Functions

| Function | Parameters | Description |
|----------|-----------|-------------|
| `set-fee-unit(new-fee)` | `uint` (1,000–1,000,000) | Update the protocol fee unit |
| `set-royalty-recipient(recipient)` | `principal` | Set who receives protocol fees |
| `set-paused(value)` | `bool` | Pause/unpause inscription writes |
| `set-allowed-caller(caller, allowed)` | `principal, bool` | Allowlist a contract caller |
| `set-next-id(value)` | `uint` | One-time ID offset for v1 continuity |
| `transfer-contract-ownership(new-owner)` | `principal` | Transfer admin role |

### Migration

#### `migrate-from-v1(token-id)`

Migrates a token from v1.1.1 to v2.1.0. Escrows the v1 token and mints the
same ID in v2.

- **Parameters:**
  - `token-id` `uint` — Token ID to migrate
- **Returns:** `(response uint uint)`
- **Fees:** `fee-unit`
- **Note:** Chunk data remains in v1. Clients must fall back to v1 for chunk reads on migrated tokens.

---

## Read-Only Functions

### Metadata & Ownership

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get-inscription-meta(id)` | `uint` | `(optional { owner, creator, mime-type, total-size, total-chunks, sealed, final-hash })` | Core inscription metadata |
| `get-owner(id)` | `uint` | `(response (optional principal) uint)` | Current owner |
| `get-token-uri(id)` | `uint` | `(response (optional (string-ascii 256)) uint)` | Token metadata URI |
| `get-token-uri-raw(id)` | `uint` | `(optional (string-ascii 256))` | Token URI without response wrapper |
| `inscription-exists(id)` | `uint` | `(response bool uint)` | Whether inscription exists |
| `get-inscription-hash(id)` | `uint` | `(optional (buff 32))` | Content hash |
| `get-inscription-creator(id)` | `uint` | `(optional principal)` | Original creator |
| `get-inscription-size(id)` | `uint` | `(optional uint)` | Total byte size |
| `get-inscription-chunks(id)` | `uint` | `(optional uint)` | Total chunk count |
| `is-inscription-sealed(id)` | `uint` | `(optional bool)` | Whether sealed |

### Content Access

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get-chunk(id, index)` | `uint, uint` | `(optional (buff 16384))` | Single chunk |
| `get-chunk-batch(id, indexes)` | `uint, (list 50 uint)` | `(list 50 (optional (buff 16384)))` | Batch chunk read (preferred) |
| `get-pending-chunk(hash, creator, index)` | `(buff 32), principal, uint` | `(optional (buff 16384))` | Chunk from active upload |

### Deduplication & Lookup

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get-id-by-hash(hash)` | `(buff 32)` | `(optional uint)` | Lookup canonical ID by content hash |

### Dependencies

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get-dependencies(id)` | `uint` | `(list 50 uint)` | Recursive dependency IDs |

### Enumeration

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get-last-token-id()` | none | `(response uint uint)` | Highest minted ID (NOT count) |
| `get-next-token-id()` | none | `(response uint uint)` | Next ID to be minted |
| `get-minted-count()` | none | `(response uint uint)` | Total tokens minted in v2 |
| `get-minted-id(index)` | `uint` | `(optional uint)` | Token ID at mint-order index |

### Upload State

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get-upload-state(hash, owner)` | `(buff 32), principal` | `(optional UploadState)` | Active upload session info |

### Admin Queries

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get-admin()` | none | `(response principal uint)` | Current admin |
| `get-royalty-recipient()` | none | `(response principal uint)` | Current fee recipient |
| `get-fee-unit()` | none | `(response uint uint)` | Current fee unit in microSTX |
| `is-paused()` | none | `(response bool uint)` | Pause status |
| `is-allowed-caller(caller)` | `principal` | `(response bool uint)` | Allowlist check |
