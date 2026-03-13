# 02 — Data Model

## Chunking

All data inscribed through Xtrata is split into fixed-size chunks before
upload. This is fundamental to the protocol — there is no way to upload
data as a single blob.

Route note: the helper contract still consumes the same chunk model and the
same incremental hash. It only changes orchestration by packaging a fresh
`<=30` chunk upload into one wallet transaction.

### Chunk Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Chunk size | 16,384 bytes | Fixed. Every chunk is exactly this size except the last one. |
| Max chunks per inscription | 2,048 | Hard limit in the contract |
| Max inscription size | 32 MiB | 2,048 * 16,384 = 33,554,432 bytes |
| Max chunks per batch upload | 50 | Per `add-chunk-batch` call |
| Max items per batch seal | 50 | Per `seal-inscription-batch` call |

### How to Chunk Data

Given a file as a `Uint8Array`:

```javascript
const CHUNK_SIZE = 16_384;

function chunkBytes(data) {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    chunks.push(data.slice(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}
```

The last chunk may be shorter than 16,384 bytes. This is expected and handled
correctly by the contract.

### How to Batch Chunks for Upload

Each `add-chunk-batch` call accepts up to 50 chunks. Group chunks into batches:

```javascript
const MAX_BATCH_SIZE = 50;

function batchChunks(chunks) {
  const batches = [];
  for (let offset = 0; offset < chunks.length; offset += MAX_BATCH_SIZE) {
    batches.push(chunks.slice(offset, offset + MAX_BATCH_SIZE));
  }
  return batches;
}
```

---

## Content Hashing

Xtrata uses an **incremental SHA-256 chain hash** for content addressing. This
is NOT a simple hash of the entire file — it is a sequential hash where each
step incorporates the previous hash and the next chunk.

### Hash Algorithm

```
hash[0] = 0x0000...0000  (32 zero bytes)
hash[1] = SHA-256(hash[0] || chunk[0])
hash[2] = SHA-256(hash[1] || chunk[1])
...
hash[N] = SHA-256(hash[N-1] || chunk[N-1])

expected-hash = hash[N]  (the final hash after all chunks)
```

Where `||` means byte concatenation.

### JavaScript Implementation

```javascript
import { sha256 } from '@noble/hashes/sha256';

const EMPTY_HASH = new Uint8Array(32); // 32 zero bytes

function computeExpectedHash(chunks) {
  let runningHash = EMPTY_HASH;
  for (const chunk of chunks) {
    // Concatenate running hash + chunk, then SHA-256
    const combined = new Uint8Array(runningHash.length + chunk.length);
    combined.set(runningHash, 0);
    combined.set(chunk, runningHash.length);
    runningHash = sha256(combined);
  }
  return runningHash; // This is the expected-hash for contract calls
}
```

### Why This Matters

1. **The contract verifies this hash incrementally** — each `add-chunk-batch`
   call updates a running hash on-chain. At seal time, the on-chain running
   hash must match the `expected-hash` parameter.

2. **Content addressing** — The hash serves as a canonical content identifier.
   The `HashToId` map prevents duplicate inscriptions of identical content.

3. **Deduplication** — Before uploading, call `get-id-by-hash(expected-hash)`
   to check if content already exists. If it does, you get the token ID back
   immediately without paying fees.

4. **begin-or-get handles this automatically** — If you call `begin-or-get`
   with a hash that's already sealed, it returns `(ok (some id))`.

---

## Content Addressing & Deduplication

Every sealed inscription has a unique content hash. The contract maintains a
`HashToId` map that maps `(buff 32) -> uint`, ensuring:

- No two inscriptions can have the same content hash
- Lookups by hash are O(1)
- `begin-or-get` returns existing IDs for already-sealed content

### Dedup Check Flow

```
Agent has file data
  → Chunk data
  → Compute expected-hash
  → Call get-id-by-hash(expected-hash)
  → If (some id): content already inscribed, use existing ID
  → If none: proceed with inscription flow
```

Or use `begin-or-get` which does this check atomically.

---

## Inscription Metadata (InscriptionMeta)

Every sealed inscription has immutable metadata stored on-chain:

```
{
  owner: principal,         // Current owner (mutable via transfer)
  creator: principal,       // Original inscriber (immutable provenance)
  mime-type: (string-ascii 64),  // MIME type of the content
  total-size: uint,         // Total bytes across all chunks
  total-chunks: uint,       // Number of 16,384-byte chunks
  sealed: bool,             // true once sealed (always true for queried tokens)
  final-hash: (buff 32)    // The content hash
}
```

### TypeScript Type

```typescript
type InscriptionMeta = {
  owner: string;           // Stacks principal address
  creator: string | null;  // Original creator address
  mimeType: string;        // MIME type string
  totalSize: bigint;       // Total byte count
  totalChunks: bigint;     // Chunk count
  sealed: boolean;         // Sealed status
  finalHash: Uint8Array;   // 32-byte content hash
};
```

### Key Properties

- `owner` is the only mutable field — it changes on `transfer`
- `creator` is immutable and records who originally inscribed the content
- `sealed` is always `true` for any inscription you can query by token ID
- `final-hash` can be used to verify content integrity after reconstruction

---

## Upload Sessions (UploadState)

Active uploads are tracked in the `UploadState` map, keyed by
`{ owner: principal, hash: (buff 32) }`.

```
{
  mime-type: (string-ascii 64),
  total-size: uint,
  total-chunks: uint,
  current-index: uint,      // How many chunks uploaded so far
  running-hash: (buff 32),  // Current hash state
  last-touched: uint,       // Last block height of activity
  purge-index: uint         // For cleanup tracking
}
```

### Session Lifecycle

1. **Created** by `begin-inscription` or `begin-or-get`
2. **Updated** by each `add-chunk-batch` call (increments `current-index`, updates `running-hash`)
3. **Sealed** by `seal-inscription` / `seal-recursive` (session consumed, NFT minted)
4. **Expired** after 4,320 blocks (~30 days) of inactivity
5. **Abandoned** explicitly via `abandon-upload` (marks for immediate purge)
6. **Purged** via `purge-expired-chunk-batch` (anyone can call on expired sessions)

### Resumability

Upload sessions are resumable. If an upload is interrupted:

- Call `begin-or-get` again with the same hash — it resumes the existing session
- Call `get-upload-state(hash, owner)` to check `current-index`
- Continue with `add-chunk-batch` from where you left off

---

## Content Reconstruction

To read an inscription's content after it's sealed:

### Step-by-Step

1. Call `get-inscription-meta(id)` to get `total-chunks` and `mime-type`
2. Build index list: `[0, 1, 2, ..., total-chunks - 1]`
3. Batch-read chunks using `get-chunk-batch(id, indexes)` in groups of 50
4. Concatenate all chunk bytes in sequential order
5. The result is the original file data, render based on `mime-type`

### JavaScript Example

```javascript
async function readInscription(client, id, senderAddress) {
  // Step 1: Get metadata
  const meta = await client.getInscriptionMeta(id, senderAddress);
  if (!meta) throw new Error('Inscription not found');

  // Step 2: Build index batches
  const totalChunks = Number(meta.totalChunks);
  const allChunks = [];

  for (let batchStart = 0; batchStart < totalChunks; batchStart += 50) {
    const batchEnd = Math.min(batchStart + 50, totalChunks);
    const indexes = [];
    for (let i = batchStart; i < batchEnd; i++) {
      indexes.push(BigInt(i));
    }

    // Step 3: Batch read
    const chunkBatch = await client.getChunkBatch(id, indexes, senderAddress);

    for (const chunk of chunkBatch) {
      if (chunk === null) throw new Error('Missing chunk data');
      allChunks.push(chunk);
    }
  }

  // Step 4: Concatenate
  const totalSize = allChunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of allChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return { data: result, mimeType: meta.mimeType };
}
```

### Migration-Aware Reads

For tokens migrated from v1 to v2:
- Metadata and ownership are in v2
- Chunk data may still be in v1
- If v2 chunk reads return empty/null, retry with the v1 contract

---

## Recursive Dependencies

Inscriptions can declare dependencies on other inscriptions using
`seal-recursive`. This enables modular on-chain applications.

### Rules

- Maximum 50 dependencies per inscription
- All dependencies must already be sealed at call time (no forward references)
- Dependencies are recorded immutably in `InscriptionDependencies` map
- Dependency resolution order is the client's responsibility

### Query Dependencies

```javascript
const deps = await client.getDependencies(tokenId, senderAddress);
// Returns: bigint[] — list of token IDs this inscription depends on
```

### Use Cases

- On-chain HTML pages referencing JavaScript libraries
- Game cartridges referencing shared runtime code
- Modular applications composed from reusable inscribed components
