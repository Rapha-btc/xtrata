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
diagnostics in the reconstruction result.

The first-party `/runtime/content` route now consumes the same public
reconstruction engine. Runtime responses expose reconstruction proof/debug
headers such as `X-Xtrata-Runtime-Reconstruction-Read-Mode`,
`X-Xtrata-Runtime-Reconstruction-Batch-Reads`, and
`X-Xtrata-Runtime-Reconstruction-Errors`. Set `RUNTIME_CONTENT_DEBUG=1` in the
runtime environment to emit opt-in reconstruction logs during testing.

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
