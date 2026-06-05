# Xtrata Core v3.0 -> v3.1 Comparison Report

Date: 2026-06-05

## Summary Recommendation

Deploying v3.1 is preferable to deploying v3.0 unchanged if the goal is a final core contract for permanent reconstruction and third-party ingestion. v3.1 makes chunk sizing explicit, records the selected profile permanently, exposes derived chunk sizes through read-only helpers, and adds profile-aware validation and indexer events.

Recommended default: Profile B / standard / 64 KB.

Recommended 128 KB posture: enabled in the comparison contract but treated as maximum/advanced until testnet wallet, RPC, Explorer and marketplace ingestion tests prove it is reliable outside Clarinet.

Deployment readiness: v3.1 is ready as a comparison implementation and passes local Clarinet tests, including true 128 KB chunks. It is not ready for final inscription/deployment until testnet validates 64 KB and 128 KB signing, submission, indexing, read-only retrieval, and marketplace/resolver handling.

## Files Added Or Changed

- `contracts/clarinet/contracts/xtrata-v3.1.0.clar`
- `contracts/live/xtrata-v3.1.0.clar`
- `contracts/other/xtrata-v3.1.0.clar`
- `contracts/clarinet/tests/xtrata-v3.1.0.test.ts`
- `contracts/clarinet/Clarinet.toml`
- `contracts/clarinet/deployments/default.simnet-plan.yaml`

v3.0 was not overwritten.

## What Changed

### New Constants

v3.1 adds explicit chunk profile constants:

```clarity
CHUNK-PROFILE-SMALL    = u1
CHUNK-PROFILE-STANDARD = u2
CHUNK-PROFILE-MAXIMUM  = u3

CHUNK-SIZE-SMALL       = u16384
CHUNK-SIZE-STANDARD    = u65536
CHUNK-SIZE-MAXIMUM     = u131072
```

The old `CHUNK-SIZE` constant remains as the small/legacy 16 KB size for fee scaling compatibility, but shape validation derives effective chunk size from the selected profile.

### Storage Record Changes

`InscriptionMeta` now records:

- `chunk-profile`
- `created-height`

The contract stores the profile, not the raw chunk size. The size is derived from constants. This keeps state compact while making reconstruction unambiguous.

`UploadState` now records:

- `chunk-profile`

This lets the append functions validate each chunk against the selected profile before finalization.

Legacy migrations from v1/v2 are marked as `CHUNK-PROFILE-SMALL` because those contracts used the 16 KB chunk model.

### Public Function Changes

`begin-inscription` and `begin-or-get` now take `chunk-profile`.

Staged append is split by profile:

- `add-chunk-batch` for 16 KB chunks, up to 32 chunks.
- `add-chunk-batch-standard` for 64 KB chunks, up to 8 chunks.
- `add-chunk-batch-maximum` for 128 KB chunks, up to 4 chunks.

Each profile-specific append function is capped at an intended 512 KB payload.

The split is necessary to keep every profile at a 512 KB append target. A single generic max-buffer append large enough to carry 32 small-profile chunks as `(list 32 (buff 131072))` would exceed Clarity's maximum static value-size analysis, while a generic `(list 4 (buff 131072))` would be analyzable but would force small-profile uploads into inefficient 64 KB payloads.

The generic single-tx mint functions now accept up to 4 max-sized chunks. Staged upload remains the safer primary path for larger files.

### Read-Only Function Changes

v3.1 adds:

- `get-chunk-profile`
- `get-chunk-size`
- `get-chunk-size-for-profile`
- `get-supported-chunk-profiles`
- `is-supported-chunk-profile`
- `get-inscription-summary`

`get-chunk-batch` now accepts up to 4 indexes so one generic read-only batch can safely return max-profile chunks within the same 512 KB target.

`get-inscription-summary` exposes:

- inscription ID
- owner
- creator
- total size
- chunk count
- chunk profile
- derived chunk size
- content hash
- content type
- token URI
- dependencies
- parents
- finalized status
- created block height

The contract does not add rich metadata, names, descriptions, tags, thumbnails, trait maps or marketplace display fields. Those still belong in manifests or sibling inscriptions.

### Event Changes

v3.0 did not emit inscription lifecycle `print` events.

v3.1 adds:

- `inscription-created`
- `inscription-finalized`

Events include:

- protocol/version
- owner/creator
- inscription ID on finalization
- total size
- chunk count
- chunk profile
- derived chunk size
- content hash
- content type
- token URI on finalization
- finalized status
- created block height

### Tests Added

The v3.1 test suite covers:

- supported profile helpers
- 16 KB, 64 KB and 128 KB exact-boundary chunks
- multi-chunk inscriptions with partial final chunks
- unsupported profile rejection
- chunk too large for selected profile
- non-final chunk too small
- out-of-range chunk writes
- duplicate sequential writes
- finalize before all chunks are present
- append after finalization
- reconstruction through `get-chunk`
- resolver-friendly summary
- profile-aware fee quote

## Why Chunk Profiles Are Needed

v3.0 permanently stores `total-size`, `total-chunks` and chunks, but the effective chunk size is implicit in the contract implementation. That is workable for first-party tools but weaker for independent reconstruction.

v3.1 makes the reconstruction profile explicit so third parties can answer:

- Which chunk size was intended?
- How large must each non-final chunk be?
- How small may the final chunk be?
- How many read calls should a resolver plan?
- Which upload UI label should be shown?
- Which marketplace/indexer path should ingest the inscription?

This matters because third parties should not need xtrata.xyz, app source code, or tribal knowledge to reconstruct data.

## Design Questions

### 1. Should Chunk Profile Be Stored Directly?

Yes. The profile is a permanent reconstruction fact. It should be stored in `InscriptionMeta`, not inferred from chunk count or total size.

Inference would be ambiguous. A 64 KB file could be one standard chunk, four small chunks, or one maximum-profile final chunk. The contract should not force resolvers to guess.

### 2. Should Chunk Size Be Stored Directly Or Derived?

v3.1 stores only `chunk-profile` and derives size from constants.

Reasoning:

- It keeps metadata compact.
- It prevents invalid states such as profile `u2` with size `128 KB`.
- It makes the supported modes enumerable.
- It keeps marketplace labels stable.

Storing exact chunk size would help future arbitrary sizes, but that is not the v3.1 goal. For finality and simplicity, explicit bounded profiles are safer.

### 3. One Generic Append Or Separate Append Functions?

The first attempted design used one generic max buffer type large enough to preserve the small-profile batch count:

```clarity
(buff 131072)
(list 32 (buff 131072))
```

Clarinet rejected batch/read accumulator types above Clarity's static value-size maximum. Therefore the comparison implementation uses separate append functions with profile-specific batch limits.

Comparison:

| Pattern | Result |
|---|---|
| One generic append with max buffer | Simplest API, but a 512 KB small-profile payload would require `(list 32 (buff 131072))`, which exceeds Clarity static value-size analysis. A generic 4-entry max-buffer function is analyzable but inefficient for 16 KB and 64 KB profiles. |
| Separate append functions | More API surface, but safest and most analyzable. Lets each profile use a 512 KB append payload cap: 32 small chunks, 8 standard chunks, or 4 maximum chunks. |
| Separate maps per profile | Type-safe but complicates generic retrieval and resolver logic. Not chosen. |
| One chunk per transaction | Simplest type-wise, but too many transactions for large files. Not chosen. |

Impact:

- Code simplicity: generic is simpler, but cannot preserve the 512 KB target for all profiles without oversized static types.
- Contract size: separate append functions add code.
- Analysis cost: separate functions pass local analysis.
- Transaction size: larger chunks reduce chunk count but each transaction is heavier.
- Wallet compatibility: 16 KB safest; 64 KB likely practical; 128 KB must be tested.
- API/RPC compatibility: 128 KB requires testnet validation.
- Read-only retrieval: generic `get-chunk` remains simple; `get-chunk-batch` is capped at 4 maximum chunks.
- Testing complexity: higher, but explicit.
- Marketplace/indexer behavior: better, because profile and chunk size are readable.

### 4. Should 128 KB Be Normal Or Advanced?

v3.1 exposes 128 KB as supported but marks it `advanced: true` in `get-supported-chunk-profiles`.

Clarinet tests passed true 128 KB chunks locally. That proves contract type/logic viability in simnet. It does not prove mainnet transaction submission, wallet signing, API acceptance, Explorer display, or indexer ingestion.

Recommendation: enable 128 KB only as maximum/advanced until testnet proves it.

### 5. Can The Contract Enforce Correct Chunk Sizes?

Yes, within sequential upload semantics.

v3.1 enforces:

- supported profile at begin/single-tx/quote time
- `total-size > 0`
- `total-chunks > 0`
- `total-size <= total-chunks * selected chunk size`
- `total-size > (total-chunks - 1) * selected chunk size`
- non-final chunks exactly equal selected chunk size
- final chunk exactly equals the remaining byte count
- batch cannot exceed declared chunk count
- finalization requires `current-index == total-chunks`
- finalization requires running hash match
- upload state is deleted after finalization

Because staged writes are sequential, duplicate explicit indexes cannot be submitted. Replaying a chunk after it has already advanced the upload either exceeds the declared range or fails after finalization because upload state no longer exists.

### 6. Does Profile Selection Reduce Or Increase Risk?

Both.

It reduces reconstruction risk because chunk size is explicit and permanent.

It can increase transaction fragility because larger chunks mean larger transaction payloads. Larger chunks reduce total chunk count and read/write calls, but if a 128 KB transaction fails because of wallet, API, mempool, Explorer, fee or signing limits, the user loses reliability. This is why 64 KB is the recommended default and 128 KB should be advanced.

## v3.1 Lifecycle

1. Uploader computes content chunks according to selected profile.
2. Uploader computes the running Xtrata hash over ordered chunks.
3. Uploader calls `begin-inscription` with expected hash, MIME type, total size, chunk count and profile.
4. Contract validates profile and total-size/chunk-count consistency.
5. Contract emits `inscription-created`.
6. Uploader calls the profile-specific append function.
7. Contract validates exact non-final and final chunk sizes.
8. Contract stores chunks by content hash, creator and sequential index.
9. Uploader calls `seal-inscription` or relationship/dependency seal functions.
10. Contract requires all chunks, verifies final hash, mints SIP-009 NFT, stores metadata and emits `inscription-finalized`.
11. Resolver reads `get-inscription-summary`, then `get-chunk` or `get-chunk-batch`, concatenates ordered chunks and verifies `content-hash`.

## Compatibility With v3.0

SIP-009 compatibility remains intact:

- `get-owner`
- `get-token-uri`
- `get-last-token-id`
- `transfer`

Core assumptions that still work:

- NFT represents ownership/discovery.
- Chunks are ordered.
- Hash verifies reconstruction.
- Dependencies and parents remain separate.
- Rich metadata remains outside core state.

Resolver changes required:

- Read `get-chunk-profile` or `get-inscription-summary`.
- Read `get-chunk-size` instead of assuming 16 KB.
- Use `get-chunk-batch` in batches of up to 4 maximum chunks, or call `get-chunk` per index.
- Expect chunk values typed up to 128 KB.

Marketplace/indexer changes required:

- Ingest `chunk-profile`, `chunk-size`, `content-type`, `content-hash`, `total-size`, `chunk-count`.
- Treat 128 KB as advanced/high-payload.
- Continue relying on SIP-009 ownership.

Migration path:

- Existing v3.0 inscriptions would not migrate automatically.
- v1/v2 migrations into v3.1 are marked as small/16 KB.
- A true v3.0-to-v3.1 migration path would need a source transfer/metadata import routine if v3.0 is deployed first.

Important compatibility warning:

Existing helper and collection-mint contracts that call the old v3 shape are not automatically compatible with v3.1 because `begin-inscription`, `quote-inscription-fee`, and single-tx mint signatures now include `chunk-profile`, and append functions are profile-specific.

## Cost And Practicality Notes

Local Clarinet cost-report mode did not emit per-call cost rows in this repo setup. The table below uses v3.1 contract fee quote math, not network mining fees.

Defaults used:

- begin fee: `100000` microSTX
- seal fee base: `100000` microSTX
- single tx fee base: `100000` microSTX
- upload byte fee unit: `2000` microSTX per 16 KB fee bucket
- extra batch fee: `100000` microSTX per logical extra batch after 32 chunks

Contract-fee estimates:

| File | Profile | Chunks | Append txs | Staged txs | Contract fee |
|---:|---|---:|---:|---:|---:|
| 1 MB | 16 KB | 64 | 2 | 4 | ~0.428 STX |
| 1 MB | 64 KB | 16 | 2 | 4 | ~0.328 STX |
| 1 MB | 128 KB | 8 | 2 | 4 | ~0.328 STX |
| 5 MB | 16 KB | 320 | 10 | 12 | ~1.740 STX |
| 5 MB | 64 KB | 80 | 10 | 12 | ~1.040 STX |
| 5 MB | 128 KB | 40 | 10 | 12 | ~0.940 STX |
| 10 MB | 16 KB | 640 | 20 | 22 | ~3.180 STX |
| 10 MB | 64 KB | 160 | 20 | 22 | ~1.780 STX |
| 10 MB | 128 KB | 80 | 20 | 22 | ~1.680 STX |

Why append transaction counts now align across profiles:

- The profile-specific batch limits are constrained by Clarity value-size analysis.
- 16 KB batches allow 32 chunks, exactly 512 KB payload.
- 64 KB batches allow 8 chunks, exactly 512 KB payload.
- 128 KB batches allow 4 chunks, exactly 512 KB payload.

Network mining fees are separate and likely scale with transaction byte size. Larger chunks reduce API/read count and logical chunk count, but individual transactions are heavier and more fragile.

Practical implications:

- 16 KB: safest wallet/RPC profile, highest chunk count.
- 64 KB: best default balance; fewer chunks and explicit profile without pushing maximum payload size.
- 128 KB: lowest chunk count, but largest per-transaction payload and highest signing/submission risk.

## Test Results

Commands run:

```bash
npx clarinet check contracts/xtrata-v3.1.0.clar
npx clarinet check --use-computed-deployment-plan
npm test -- xtrata-v3.1.0.test.ts
npm run test:report -- xtrata-v3.1.0.test.ts
```

Results:

- Single-file Clarinet syntax/type check passed.
- Full Clarinet check passed with existing unchecked-data warnings.
- Focused v3.1 tests passed: 16/16.
- Full Clarinet test run passed: 171/171 across 22 files.
- True 16 KB, 64 KB and 128 KB chunks were tested locally.

## Risks And Trade-Offs

64 KB should be the default standard profile.

It substantially reduces chunk count compared to 16 KB while avoiding the highest per-transaction payload profile. It is easier to justify as default for wallets, upload UX and resolver performance.

128 KB should be maximum/advanced.

It passed Clarinet but still needs testnet and real wallet/API validation. The upside is lower chunk count. The downside is payload fragility.

One maximum buffer type creates risk.

It looked attractive for a simple API, but Clarity static value-size limits rejected large list/accumulator shapes. Separate append functions are safer and more honest.

Read-only retrieval remains simple enough.

`get-chunk` is generic. `get-chunk-batch` is capped at 4 to support maximum chunks within the 512 KB target. Resolvers can still reconstruct deterministically without xtrata.xyz.

## Final Recommendation

Do not deploy v3.0 unchanged if v3.1 can be validated on testnet first. v3.1 solves an important permanent reconstruction ambiguity before deployment.

Deploy v3.1 instead only after:

- testnet 64 KB and 128 KB staged uploads succeed from the real app/wallet path;
- wallet signing works for max-profile payloads;
- Hiro/API/RPC submission accepts max-profile transactions;
- Explorer/indexers retain event and read-only visibility;
- marketplace/resolver code reads `chunk-profile` and `chunk-size`;
- collection-mint/helper contracts are updated or intentionally excluded for v3.1.

Set 64 KB as the standard/default.

Keep 128 KB enabled only as maximum/advanced until real network testing proves it reliable.

The comparison contract is directionally sound and locally tested, but final inscription/deployment should wait for testnet proof of transaction practicality.
