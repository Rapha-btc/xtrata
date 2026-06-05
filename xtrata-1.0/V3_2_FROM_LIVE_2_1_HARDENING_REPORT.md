# Xtrata v3.2 From Live v2.1 Hardening Report

Date: 2026-06-05

Candidate contract:

- `contracts/clarinet/contracts/xtrata-v3.2.0.clar`
- `contracts/live/xtrata-v3.2.0.clar`
- `contracts/other/xtrata-v3.2.0.clar`

Test file:

- `contracts/clarinet/tests/xtrata-v3.2.0.test.ts`

## Executive Summary

`xtrata-v3.2.0.clar` is a fixed-16-KiB v3.2 candidate built from the live v2.1.0 and v2.1.1 contracts, with the earlier v3.x drafts intentionally not used as the product direction. The candidate contracts scope relative to those drafts: it keeps SIP-009 ownership, ordered chunk reconstruction, rolling hash verification, upload lifecycle, resolver helpers, migration support, and minimal relationship data, while keeping rich metadata, marketplace behavior, thumbnails, previews, collection semantics, and application-specific logic out of the core contract.

The most important hardening changes are:

- Actual upload payloads are capped at 32 chunks, or 512 KiB per upload-style call.
- Chunk size and total-size consistency are strictly validated.
- Non-final chunks must be exactly 16 KiB, and the final chunk must match the declared remaining size.
- A native single-transaction small-file mint path was added for objects that fit within one upload batch.
- Single-transaction mint fees apply the fixed minimum once, not once per internal logical stage.
- Parent references are simple, ownership-gated, and duplicate-checked without adding graph database state.
- Migration from v2.1.0 and v2.1.1 is supported and records source lineage.

The candidate passed local Clarinet checks, contract variant verification, and the v3.2 test suite. The full local Clarinet test report also passed after the stale v3.1 draft suites were marked skipped because their contracts are intentionally absent from the current Clarinet manifest.

## Source Basis

The primary baseline contracts were:

- `contracts/clarinet/contracts/xtrata-v2.1.0.clar`
- `contracts/clarinet/contracts/xtrata-v2.1.1.clar`

The existing v3.0 and v3.1 drafts were not used as the preferred direction. They were treated as experimental context only. The v3.2 candidate follows the live v2.1 pattern and deliberately reduces permanent core surface area.

## What v2.1.0 Shows

v2.1.0 already contains the durable Xtrata shape:

- SIP-009 NFT ownership.
- Ordered fixed-size chunk storage.
- Upload state followed by seal/finalization.
- Rolling hash verification over ordered chunks.
- Resolver-oriented read-only helpers.
- Minted-token indexing.
- Token URI storage.
- Expiry and purge support for abandoned uploads.
- Basic dependency support.
- Migration continuity from an older live generation.

The main issues found for v3.2 hardening were:

- A single `MAX-BATCH-SIZE` value was used broadly, including upload payloads.
- Upload payloads could be larger than the new v3.2 target.
- Total-size and chunk-count validation could allow inconsistent declarations.
- The final chunk was allowed to be smaller, but non-final exact-size enforcement needed to be explicit.
- Dependency data existed, but parent ownership semantics were not separated clearly.
- Migration lineage did not fully expose source metadata for third-party indexers.

## What v2.1.1 Shows

v2.1.1 keeps the same core architecture but adds a split fee model:

- Begin fee.
- Upload chunk fee.
- Upload batch fee.
- Seal fee.

That split model is useful because it gives v3.2 a live-like basis for cost control without expanding into a broader fee framework. v3.2 preserves this model, adds a `single-tx-fee-unit`, and exposes quote helpers that match the actual payment paths.

The same hardening points apply to v2.1.1:

- Actual upload payload limits needed a separate cap.
- Chunk shape validation needed to be stricter.
- The small-file helper pattern needed a core-safe version if the route was going to exist in v3.2.
- Quote helpers needed to make staged and single-transaction fee behavior explicit.

## Why v3.2 Contracts Scope

The v3.2 core contract should only store facts needed for permanent reconstruction, verification, ownership, discovery, and interoperability. It should not become a marketplace, metadata engine, collection logic layer, or graph database.

The candidate therefore keeps core state focused on:

- Token ownership.
- Creator.
- MIME/content type.
- Total size.
- Total chunk count.
- Fixed chunk size through a contract constant/read-only helper.
- Sealed/finalized status.
- Xtrata rolling final hash.
- Creation block height.
- Token URI.
- Dependencies.
- Simple parent references.
- Migration source, where applicable.

The candidate does not add rich names, descriptions, tags, traits, display metadata, lore, thumbnail state, marketplace listing state, or collection semantics.

## Upload Batch Cap

v3.2 separates upload payload limits from general list limits:

- Upload batch limit: `MAX-UPLOAD-BATCH-SIZE = u32`.
- Single-transaction mint chunk limit: `MAX-SINGLE-TX-CHUNKS = u32`.
- Fixed chunk size: `CHUNK-SIZE = u16384`.
- Max upload payload: `MAX-UPLOAD-PAYLOAD = 32 * 16384 = 524288` bytes.
- General list limit: `MAX-GENERAL-LIST-SIZE = u50`.
- Seal batch/read/purge style list limit: `MAX-SEAL-BATCH-SIZE = u50`.

The Clarity ABI still accepts `(list 50 (buff 16384))` for some upload-style calls so existing call construction remains straightforward, but runtime assertions reject actual upload payloads above 32 chunks. This keeps the public type shape broad enough for compatibility and tests while enforcing the v3.2 payload cap inside the contract.

The value 50 remains only where it does not create upload payload size risk:

- Dependencies.
- Parents.
- Seal item lists.
- Read chunk batches.
- Purge chunk index batches.

Actual chunk upload payloads cannot exceed 32 chunks.

## Fixed Chunk Validation

v3.2 uses fixed 16 KiB chunks only.

The candidate validates:

- `total-size` must be greater than zero.
- `total-chunks` must be greater than zero.
- `total-chunks` must not exceed the contract maximum.
- `total-size` must not exceed `total-chunks * 16384`.
- `total-size` must be greater than `(total-chunks - 1) * 16384`.
- Chunk indexes must be strictly within the declared chunk count.
- Each non-final chunk must be exactly 16384 bytes.
- The final chunk must equal `total-size - index * 16384`.
- No chunk can be appended after finalization.
- Seal cannot happen until all declared chunks are present.

Chunks larger than 16 KiB are also prevented by the Clarity type of the chunk buffer: `(buff 16384)`.

## Hash Model

v3.2 preserves the rolling Xtrata hash model used by the live contracts.

The stored `final-hash` is not a plain file digest. It is the final value in this rolling hash chain:

```text
h0 = 32 zero bytes
h1 = sha256(h0 || chunk0)
h2 = sha256(h1 || chunk1)
...
hn = sha256(h(n-1) || chunk(n-1))
final-hash = hn
```

The staged route and single-transaction route both use the same rolling hash semantics. A normal content hash can be placed in a manifest if a resolver, marketplace, or client needs that additional semantic.

## Upload Lifecycle

The staged lifecycle remains:

1. `begin-inscription` or `begin-inscription-recursive`.
2. One or more `add-chunk-batch` calls.
3. `seal-inscription`, `seal-recursive`, or `seal-with-relationships`.

The candidate keeps upload state keyed by owner and expected final hash. Upload state records the declared type, size, chunk count, URI, rolling hash, expiration height, and next chunk index.

Lifecycle hardening includes:

- Begin rejects invalid total-size/total-chunks shapes.
- Begin rejects a hash that is already minted.
- Add batch rejects missing or expired upload state.
- Add batch rejects payloads above 32 chunks.
- Add batch rejects non-contiguous chunk indexes by deriving indexes from `next-index`.
- Add batch validates each chunk length against its expected position.
- Seal verifies all chunks are present by requiring `next-index == total-chunks`.
- Seal verifies the rolling hash equals the expected final hash.
- Seal removes upload state after minting.
- Failed transactions roll back state under Clarity transaction semantics.

Abandoned upload behavior remains explicit:

- `get-upload-state` exposes pending upload state.
- `get-pending-chunk` can read uploaded chunks before seal.
- `purge-expired-chunk-batch` removes expired pending chunks.

## Single-Transaction Small-File Mint Route

The previous helper-contract pattern is useful because it gives small files a one-signature path. For v3.2, the route is safe enough to live in the core candidate because it does not add a new storage model or chunk profile. It is a direct atomic implementation of the same logical stages:

1. Initialize.
2. Upload one batch.
3. Seal.

The public functions are:

- `mint-single-tx`
- `mint-single-tx-recursive`
- `mint-single-tx-with-relationships`

The route is restricted to one upload batch:

- Max chunks: 32.
- Max payload: 512 KiB.
- Same fixed 16 KiB chunk validation as staged upload.
- Same rolling hash model as staged upload.
- Same token URI validation as staged upload.
- Same dependency validation as staged seal.
- Same parent validation as relationship seal.

The single-transaction implementation does not leave partial upload chunks or partial metadata on failure. Tests cover hash mismatch rollback by checking that no pending chunk exists and minted count remains unchanged.

The previous helper-contract small-mint pattern is no longer required for v3.2 direct mints. It can still be useful as an external wrapper for older contracts, UI convenience, or application-specific fee policy, but v3.2 does not need a helper to provide the core one-transaction behavior.

## Single-Transaction Fee Handling

The staged route charges begin and seal as separate transactions:

```text
staged fee = begin-fee-unit + seal-fee-for-chunks(total-chunks)
seal fee = seal-fee-unit
         + upload-chunk-fee-unit * min(total-chunks, 32)
         + upload-batch-fee-unit * ceil(max(total-chunks - 32, 0) / 32)
```

The single-transaction route charges one combined route fee:

```text
single-tx fee = single-tx-fee-unit + upload-chunk-fee-unit * total-chunks
```

The minimum/fixed route fee is therefore applied once through `single-tx-fee-unit`. It is not multiplied just because the function internally replaces begin, upload, and seal.

With the default fee units in the candidate:

- `begin-fee-unit = 100000` uSTX.
- `seal-fee-unit = 100000` uSTX.
- `single-tx-fee-unit = 100000` uSTX.
- `upload-chunk-fee-unit = 2000` uSTX.
- `upload-batch-fee-unit = 100000` uSTX.

For a one-chunk object:

- Staged quote: `100000 + 100000 + 2000 = 202000` uSTX.
- Single-transaction quote: `100000 + 2000 = 102000` uSTX.

The test suite verifies that the quote helpers match the actual balance change for the single-transaction route.

## SIP-009 Compatibility and Enumeration

The candidate preserves:

- `get-last-token-id`
- `get-token-uri`
- `get-owner`
- `transfer`
- NFT minting
- Owner updates through `nft-transfer?`

Enumeration helpers are present for marketplace/indexer compatibility:

- `get-minted-count`
- `get-minted-id`
- `get-next-token-id`
- `is-minted`

Migration can mint non-sequential IDs from older contracts. `get-last-token-id` follows the highest minted ID, while `get-minted-count` and `get-minted-id` provide contiguous enumeration over actually minted IDs.

## Metadata and Resolver Helpers

The candidate exposes minimal resolver/indexer read-only helpers:

- `get-contract-info`
- `get-chunk-size`
- `get-inscription-summary`
- `get-inscription-meta`
- `get-inscription-size`
- `get-chunk`
- `get-chunk-batch`
- `get-dependencies`
- `get-parents`
- `is-inscription-sealed`
- `get-migration-source`

A third-party resolver can answer:

- Whether a token exists.
- Who owns it.
- Whether it is sealed.
- Its token URI.
- Its content type.
- Its total size.
- Its chunk count.
- The fixed chunk size.
- The rolling hash to verify.
- How to fetch chunk N.
- How to enumerate minted IDs.
- Dependencies and parents.
- Migration source, if present.

Rich metadata belongs in manifest inscriptions, sibling inscriptions, wrapper contracts, resolvers, indexers, or marketplace tooling.

## Events and Indexing

The candidate prints lifecycle events for:

- Upload started.
- Inscription sealed.
- Inscription migrated.

Transfer observability remains available through the SIP-009 transfer call and chain transaction data. Relationship data is included in seal events and exposed through read-only maps. The contract does not emit per-chunk upload events because that would be noisy and expensive relative to the value for indexers.

## Parent and Dependency Model

Dependencies and parents are intentionally simple:

- Dependencies must reference existing minted inscriptions.
- Dependencies are not ownership-gated.
- Parents must reference existing minted inscriptions.
- Parents must be owned by `tx-sender` at seal or single-transaction mint time.
- Duplicate parent IDs are rejected.
- Duplicate dependency IDs are rejected.
- The contract stores child-to-parent lists, not a full parent-to-child graph.

This preserves simple relationship proof without turning the core into graph infrastructure.

## Migration

The candidate supports migration from:

- v1.1.1 through the existing live continuity path.
- v2.1.0.
- v2.1.1.

For v2.1.0 and v2.1.1 migration:

- The caller must own the old token.
- The old token is transferred into the v3.2 contract.
- The same token ID is minted in v3.2.
- Token URI is preserved.
- Content type, size, chunk count, final hash, and dependencies are copied from the source contract summary/meta helpers.
- Source lineage is recorded in `MigrationSource`.
- Minted enumeration is updated.
- `next-id`, minted count, and max minted ID are advanced consistently.
- `get-chunk` and `get-chunk-batch` fall back to the source contract for migrated entries.

Migration belongs in the candidate because v3.2 is meant to preserve continuity from the current live contracts. A final mainnet deployment should still receive human review of migration behavior, especially the escrow model and resolver fallback behavior.

## Compile and Test Results

Local verification completed:

```text
clarinet check contracts/xtrata-v3.2.0.clar
Result: pass
Notes: existing check-checker warnings about unchecked public inputs.

clarinet check
Result: pass
Scope: 31 contracts checked.
Notes: 484 warnings, matching the repo's existing warning style.

npm run contracts:sync
Result: pass

npm run contracts:verify
Result: pass

npm test -- xtrata-v3.2.0.test.ts
Result: pass
Tests: 10 passed.

npm run test:report -- xtrata-v3.2.0.test.ts
Result: pass
Suites: 22 passed, 2 skipped.
Tests: 165 passed, 35 skipped.
```

The two skipped suites are stale v3.1 draft suites whose contracts are intentionally absent from the current Clarinet manifest. They were marked skipped instead of restoring draft contracts because this task explicitly treats those drafts as outside the v3.2 direction.

## Test Coverage Added

The v3.2 tests cover:

- Contract info constants.
- SIP-009 ownership, transfer, token URI, last token ID, minted count, and minted ID enumeration.
- Staged minting.
- Single-transaction minting.
- One-byte file.
- One full 16 KiB chunk.
- Small multi-chunk file.
- Exact 512 KiB single-transaction file.
- Rejection of single-transaction files above one upload batch.
- Exact 32-chunk staged upload batch.
- Rejection of upload batches above 32 chunks.
- Partial final chunk.
- Invalid chunk count.
- Too-small non-final chunk.
- Seal before all chunks uploaded.
- Hash mismatch.
- Append after seal.
- Dependency validation.
- Parent ownership gating.
- Duplicate parent rejection.
- Fee quote versus actual fee charged.
- Single-transaction fee charged once.
- Upload expiry.
- Purge of expired upload chunks.
- Migration from v2.1.0.
- Migration from v2.1.1.
- Summary/meta correctness.
- Chunk reconstruction read correctness.

Oversized chunk payloads above 16 KiB are rejected by Clarity type checking because chunks are typed as `(buff 16384)`.

## Measured Cost Rows

`costs-reports.json` includes 77 v3.2 rows after the local test report. Selected max measured rows:

| Method | Max runtime | Max write length | Max write count | Max read length | Max read count |
|---|---:|---:|---:|---:|---:|
| `begin-inscription` | 88286 | 306 | 2 | 53373 | 12 |
| `add-chunk-batch` | 30490329 | 528113 | 33 | 53501 | 40 |
| `seal-inscription` | 171079 | 481 | 9 | 53731 | 25 |
| `mint-single-tx` | 32635642 | 528227 | 41 | 53482 | 55 |
| `get-chunk-batch` | 22415015 | 0 | 0 | 70037 | 7 |
| `migrate-from-v2-1-0` | 268302 | 734 | 11 | 184625 | 40 |
| `migrate-from-v2-1-1` | 282469 | 752 | 12 | 198001 | 41 |

These are local Clarinet cost reports, not live network fee receipts.

## Practical Cost Notes

Protocol fee defaults in the candidate:

- Begin inscription: 100000 uSTX.
- Seal base: 100000 uSTX.
- Single-transaction base: 100000 uSTX.
- Per uploaded chunk: 2000 uSTX.
- Extra staged upload batch fee after the first 32 chunks: 100000 uSTX per batch.

Examples using those protocol fee defaults:

| Object size | Chunks | Upload txs | Staged total txs | Staged protocol fee | Single-tx protocol fee |
|---|---:|---:|---:|---:|---:|
| 1 byte | 1 | 1 | 3 | 202000 uSTX | 102000 uSTX |
| 512 KiB | 32 | 1 | 3 | 264000 uSTX | 164000 uSTX |
| 1 MiB | 64 | 2 | 4 | 364000 uSTX | Not supported |
| 5 MiB | 320 | 10 | 12 | 1164000 uSTX | Not supported |
| 10 MiB | 640 | 20 | 22 | 2164000 uSTX | Not supported |

Estimated mining-fee scale, using the repo's current reference rate of about 0.5 STX per 440 KiB batch:

| Object size | Chunks | Payload batches | Estimated upload mining fees |
|---|---:|---:|---:|
| 512 KiB | 32 | 1 | about 0.58 STX |
| 1 MiB | 64 | 2 | about 1.16 STX |
| 5 MiB | 320 | 10 | about 5.82 STX |
| 10 MiB | 640 | 20 | about 11.64 STX |

These estimates do not replace live fee quotes or recent transaction receipts. They are included to show practical fixed-16-KiB scaling based on the repo's current cost reference.

## Fixed-16-KiB Scaling Strategy

The contract stays simple by treating the chain as the source of truth and moving repeated retrieval work to resolver/indexer infrastructure.

Recommended scaling pattern:

- Reconstruct finalized inscriptions once at the resolver/indexer layer.
- Verify the rolling hash before caching.
- Cache immutable finalized outputs in Cloudflare/R2 or equivalent infrastructure.
- Avoid repeated chain/API reads for finalized objects.
- Batch read chunks when warming resolver caches.
- Pre-warm known collections after mint or migration.
- Use sibling inscriptions for thumbnails and previews.
- Use manifest inscriptions for rich marketplace metadata.
- Let marketplaces ingest manifests and resolver summaries instead of requiring rich contract state.

This keeps the permanent contract boring and verifiable while still allowing the user-facing system to scale.

## What Was Intentionally Not Changed

The candidate does not:

- Add rich metadata fields.
- Add marketplace listing, buy, cancel, or royalty marketplace logic.
- Add collection lore or trait storage.
- Add thumbnail/preview storage.
- Add parent-to-child graph indexes.
- Add application-specific permissions beyond the live-style pause/allowlist/admin model.
- Change the core reconstruction model away from ordered fixed 16 KiB chunks.

## Helper Contract Boundary

Good helper/wrapper candidates:

- Application-specific mint UX.
- Marketplace listing and sale logic.
- Collection-specific rules.
- Manifest publishing helpers.
- Thumbnail/preview mint helpers.
- Bulk indexing or resolver cache warmers.
- Alternate fee sponsorship or payment routing.

These should orbit the core contract rather than become permanent core state.

## Unresolved Risks

Items needing human review before mainnet:

- Full Clarity audit of the v3.2 source and migration paths.
- Confirmation that v2.1.0 and v2.1.1 migration escrow behavior is the intended ownership model.
- Wallet-level testing of staged, single-transaction, transfer, pause, and migration transactions.
- Resolver testing for direct v3.2 chunks and migrated chunk fallback.
- Review of print event payload size and indexing usefulness.
- Review of fee defaults against recent live transaction receipts.
- Frontend/SDK integration for quote helpers, single-transaction mint, relationship seal, and migration source.
- Testnet soak with real wallet signatures and realistic payloads.

I could not verify live wallet behavior, real mainnet mining fees, or production resolver/cache behavior locally.

## Readiness Recommendation

Testnet readiness: yes, after human source review. The contract compiles locally, targeted tests pass, full local test report passes, and the core fixed-16-KiB behavior is covered.

Mainnet readiness: not yet. The candidate is suitable for testnet validation and external audit, but mainnet deployment should wait for human contract review, real wallet testing, migration rehearsal, resolver validation, and fee review against current live receipts.

