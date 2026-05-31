# Xtrata Independent Reconstruction Spec

Purpose: define the public rules required to rebuild a Xtrata inscription
without using `xtrata.xyz` as a trust anchor.

## Canonical Public Contract

Current public mainnet target:

`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1`

Fallback source chain for historical and migrated content:

1. `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`
2. `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1`

`xtrata-v3.0.0` exists in contract sources and SDK capability detection, but it
is not the public default until the contract registry and public docs explicitly
promote it.

## Required Public Inputs

A reconstructor needs:

- network: `mainnet` or `testnet`
- contract ID: `{address}.{contractName}`
- token ID
- Stacks read-only access through a public API, RPC, or self-hosted node
- optional fallback contract IDs for migrated tokens

No privileged Xtrata API is required.

## Required Read-Only Calls

For the active contract:

- `get-inscription-meta(id)`
- `get-token-uri(id)`
- `get-dependencies(id)`
- `get-chunk-batch(id, indexes)` when available
- `get-chunk(id, index)` as fallback

`get-inscription-meta` returns the authoritative reconstruction metadata:

- `mime-type`
- `total-size`
- `total-chunks`
- `sealed`
- `final-hash`
- `creator`

## Chunk Ordering

Chunks are ordered by zero-based index.

Reconstruction order is:

1. Build indexes `0..total-chunks-1`.
2. Read each chunk by index.
3. Concatenate chunks in ascending index order.
4. Trim the result to `total-size` bytes.

Missing chunks are fatal in strict reconstruction.

## Hash Verification

Xtrata uses an incremental SHA-256 chain hash, not a plain SHA-256 hash of the
full file.

Algorithm:

1. Start with 32 zero bytes.
2. For each ordered raw chunk, compute `sha256(previousHash || chunkBytes)`.
3. The final running hash must equal `final-hash`.

Strict reconstruction must fail when the computed hash differs from
`final-hash`.

## Migration Fallback

For migrated tokens, ownership and metadata can live in a newer contract while
chunk bytes still live in an older source contract.

Recommended fallback behavior:

1. Read metadata from the requested contract.
2. Try chunk `0` on the requested contract.
3. If chunk `0` is missing, try fallback contracts in order.
4. Once a source contract is selected, read all chunks from that source.
5. Verify the rebuilt bytes against the metadata `final-hash`.

If primary metadata is missing, repeat metadata lookup through fallback
contracts.

## Recursive Dependencies

Recursive inscriptions declare direct dependencies on-chain through
`get-dependencies(id)`.

Clients should:

- resolve dependency IDs from the same contract context unless explicit content
  rules say otherwise;
- bound traversal to avoid untrusted graph expansion;
- treat the dependency list as an authoritative index, not a complete rendering
  script for arbitrary HTML apps.

## Strict Result Contract

A strict reconstructor should return bytes only after all of these pass:

- metadata exists;
- `sealed` is true when the contract exposes that flag;
- every declared chunk exists;
- reconstructed byte length is at least `total-size`;
- computed hash equals `final-hash`.

The `@xtrata/reconstruction` package exposes `verifyPayload`,
`assertVerified`, `reconstructInscription(..., { strict: true })`, and
`reconstructXtrataInscription({ sources, strict: true })` for this boundary.
When a source exposes `getChunkBatch`, the package reads batches first, falls
back to per-chunk reads for failed or missing batch entries, and records read
diagnostics in the reconstruction result. Production callers can provide
`isTerminalReadError` when platform quota errors must stop reconstruction
without per-chunk fallback amplification.

The first-party `/runtime/content` route now consumes the same public
reconstruction engine. Runtime responses expose reconstruction proof/debug
headers such as `X-Xtrata-Runtime-Reconstruction-Read-Mode`,
`X-Xtrata-Runtime-Reconstruction-Batch-Reads`, and
`X-Xtrata-Runtime-Reconstruction-Errors`. The runtime also exposes
`X-Xtrata-Runtime-Upstream-Requests`, which counts actual outbound Stacks API
attempts including retries and alternate API-base attempts. Set
`RUNTIME_CONTENT_DEBUG=1` in the runtime environment to emit opt-in
reconstruction logs during testing.

The Cloudflare Pages runtime sets `[limits] cpu_ms = 30000` and
`subrequests = 2_000` in `wrangler.toml`. The deployed contract read ABI can
accept up to 50 indexes, but the first-party cold-cache runtime clamps
`get-chunk-batch` reads to 30 chunks for production stability. The
`@xtrata/reconstruction` package applies the same 30-chunk clamp when callers
provide a larger `batchSize`. If a batch still triggers `CostBalanceExceeded`,
the runtime splits that read; Cloudflare subrequest quota exhaustion is terminal
and must not fan out into individual chunk reads.

Production readiness checks after a runtime deployment should include:

- purge the target token from runtime cache using the protected
  `/runtime/cache-purge` route;
- request `/runtime/content` and confirm `X-Xtrata-Runtime-Cache: MISS`;
- confirm `X-Xtrata-Runtime-Read-Batch-Size: 30`;
- confirm batch fallback and single-read counts stay low;
- request the same URL again and confirm `X-Xtrata-Runtime-Cache: HIT`;
- verify `/inscription/:id`, `/i/:id`, and `Range: bytes=0-1023` responses.

The optional `RUNTIME_CONTENT_READ_BATCH_SIZE` environment variable may reduce
the read batch size below 30 for diagnostics, but values above 30 are clamped.

## Chunk Size Compatibility

Existing Xtrata core contracts use fixed 16,384-byte chunks. This is a contract
format rule, not only an SDK default:

- contract storage maps store `(buff 16384)` values;
- upload calls accept `(buff 16384)` chunk values;
- `get-chunk-batch` returns `(list 50 (optional (buff 16384)))`;
- current metadata stores `total-size` and `total-chunks`, but not a per-token
  chunk-size field.

The reconstruction package therefore keeps `CHUNK_SIZE = 16_384` for existing
contracts and for the legacy `total-chunks: 0` derivation path.

A future contract version could support larger fixed chunks while preserving
existing inscriptions by routing reconstruction according to contract
capabilities. Variable per-token chunk sizes would require an explicit
`chunk-size` metadata field, updated storage/read interfaces with a larger
compile-time buffer bound, SDK capability detection, and compatibility tests.
Existing v1, v2.1, and v3 contract sources must continue reconstructing with
16,384-byte chunks.

## Public Proof Standard

A third-party proof should record:

- network;
- requested contract ID;
- chunk source contract ID;
- token ID;
- token URI;
- MIME type;
- total size;
- total chunks;
- final hash;
- actual reconstructed hash;
- dependency IDs;
- whether fallback was used.
- read mode (`batch`, `single`, or `mixed`) and any read fallback errors.

This is enough for another client to repeat the reconstruction independently.
