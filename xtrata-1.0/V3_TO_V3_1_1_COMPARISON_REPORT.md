# Xtrata Core v3.0 -> v3.1.1 Hardening Report

## Summary

v3.1.1 is a safer comparison target than v3.1.0 because it removes the
ambiguous generic single-transaction mint path, makes the rolling hash semantics
visible in contract comments/events/summaries, validates single-tx quotes
against profile-specific caps, and expands Clarinet coverage across all three
chunk profiles.

Recommendation: deploy v3.1.1 to testnet for wallet, RPC, Explorer, Hiro API,
marketplace, and resolver testing. Do not treat it as mainnet deployment-ready
until the remaining blockers at the end of this report are cleared.

Patched artifacts:

- `contracts/clarinet/contracts/xtrata-v3.1.1.clar`
- `contracts/other/xtrata-v3.1.1.clar`
- `contracts/live/xtrata-v3.1.1.clar`
- `contracts/clarinet/tests/xtrata-v3.1.1.test.ts`
- `V3_TO_V3_1_1_COMPARISON_REPORT.md`
- `docs/reconstruction-spec.md`
- `docs/sdk/quickstart-reconstruction.md`
- `scripts/contract-variants.mjs`

## Single-Tx Mint

Safer path selected: profile-specific public functions.

The v3.1.0 generic `mint-single-tx` accepted `(list 4 (buff 131072))`, which
made "512 KiB single-tx" true only for the maximum profile. v3.1.1 replaces
that ambiguity with typed profile-specific entry points:

| Function | Argument shape | Max payload |
|---|---:|---:|
| `mint-single-tx-small` | `(list 32 (buff 16384))` | 512 KiB |
| `mint-single-tx-standard` | `(list 8 (buff 65536))` | 512 KiB |
| `mint-single-tx-maximum` | `(list 4 (buff 131072))` | 512 KiB |

Recursive and relationship variants were also added:

- `mint-single-tx-small-recursive`
- `mint-single-tx-standard-recursive`
- `mint-single-tx-maximum-recursive`
- `mint-single-tx-small-with-relationships`
- `mint-single-tx-standard-with-relationships`
- `mint-single-tx-maximum-with-relationships`

`quote-inscription-fee(..., mode = u2)` now rejects single-tx quotes that exceed
the selected profile's single-tx chunk cap.

## Hash Semantics

v3.1.1 keeps only the Xtrata rolling chunk hash in core state.

Algorithm:

```text
h0 = 32 zero bytes
h1 = sha256(h0 || chunk0)
h2 = sha256(h1 || chunk1)
...
final = hn
```

This is not necessarily `sha256(full reconstructed file)`.

Contract changes:

- Top-level comments define the rolling hash.
- `HashToId` is documented as keyed by rolling chunk hash.
- `InscriptionMeta.final-hash` is retained for compatibility, but comments
  define it as the Xtrata rolling chunk hash.
- Events now print `rolling-chunk-hash` instead of `content-hash`.
- `get-inscription-summary` now returns `rolling-chunk-hash` and
  `hash-algorithm: "xtrata-rolling-sha256"`.
- `get-rolling-chunk-hash(id)` was added as a clear read-only alias.

Decision on storing normal file hash: do not store it in v3.1.1 core. The
contract cannot verify a normal full-file SHA-256 for staged uploads without
holding the whole reconstructed file in one Clarity value. Storing an unverified
normal hash in permanent core would create false assurance. Manifests or
preservation proofs should carry optional normal file hashes.

## Delegated Uploader UX

v3.1.1 remains a direct-minter contract. It does not add recipient/uploader
state or delegated append/seal functions.

Reason: adding principals alone is not enough. A safe delegated flow needs a
complete signed-intent model covering:

- who pays begin and seal protocol fees;
- whether the uploader may seal or abandon;
- replay protection and expiry;
- parent ownership checks against the recipient, not the uploader;
- how wallet consent is represented and audited.

Future migration path:

1. Add a v3.2 or wrapper flow with a signed intent:
   `recipient`, `uploader`, `expected-rolling-chunk-hash`, `mime`,
   `total-size`, `total-chunks`, `chunk-profile`, expiry, nonce, and allowed
   relationship data.
2. Key upload state by `{ recipient, uploader, hash }`.
3. Let the uploader append chunks and seal only while the signed intent is
   valid.
4. Mint the NFT to `recipient`.
5. Record `recipient`, `uploader`, and creator/artist semantics explicitly.
6. Decide whether the recipient prepays the full protocol fee at begin or the
   uploader pays seal and is reimbursed off-chain.

This should not be rushed into v3.1.1 without the signed-intent standard.

## Manifest, Thumbnail, Collection, Preview

v3.1.1 intentionally does not add `manifest-id`, `thumbnail-id`,
`collection-id`, or `preview-id` to core state.

Marketplace discovery rules:

- Primary metadata manifest: read `get-token-uri(id)`. If it points to a
  manifest JSON or manifest inscription, parse it as the primary metadata
  document.
- Sibling or auxiliary manifests: discover through `dependencies` and parse
  referenced inscriptions according to the Xtrata manifest standards.
- Thumbnails/previews: link from the manifest, or inscribe thumbnails/previews
  as dependencies. The core contract does not decide which dependency is a
  thumbnail.
- Collection membership: represent in a collection manifest that maps
  collection item IDs to Xtrata token IDs. Core `parents` can express ownership
  gated parent/child provenance, but it is not a complete collection membership
  system.
- Dependencies: assets required for rendering, reconstruction, manifests,
  previews, or app modules. They are not ownership-gated.
- Parents: provenance/remix/collection-parent style links. They are
  ownership-gated at seal time.

Keeping these references out of core prevents permanent fields from freezing a
manifest standard before the marketplace and preservation specs are fully
validated.

## Fee/Admin Complexity

v3.1.1 keeps the v3 fee model in permanent core:

- staged begin fee;
- staged seal fee;
- single-tx fee;
- byte-proportional upload fee;
- extra batch fee after the first 50 logical chunks;
- wallet basis-point override;
- caller basis-point override.

Why this belongs in core for this comparison contract:

- Open participation can bypass wrappers. If protocol fees are only in a
  front-end or wrapper, direct core calls avoid the intended policy.
- `quote-inscription-fee` gives wallets, SDKs, and marketplaces deterministic
  read-only fee data before building post-conditions.
- Wallet and caller overrides are queryable and auditable on-chain.
- A wrapper can still add marketplace pricing, but the protocol fee floor and
  discounts remain consistent for direct users.

Risk: this is more admin surface in a permanent contract. The test suite now
covers bounds, update limits, invalid BPS, wallet override precedence, caller
override behavior, caller-equals-payer fallback, and zero-fee wallet discounts.

## Profile Limits

| Profile | Chunk size | Max chunks | Max inscription size | Upload batch cap | Single-tx cap |
|---|---:|---:|---:|---:|---:|
| small `u1` | 16 KiB | 2048 | 32 MiB | 32 chunks / 512 KiB | 32 chunks / 512 KiB |
| standard `u2` | 64 KiB | 2048 | 128 MiB | 8 chunks / 512 KiB | 8 chunks / 512 KiB |
| maximum `u3` | 128 KiB | 2048 | 256 MiB | 4 chunks / 512 KiB | 4 chunks / 512 KiB |

`get-supported-chunk-profiles` now exposes max size, upload batch limit, and
single-tx limit fields. `quote-inscription-fee` validates profile-specific max
size through the selected chunk size and `MAX-TOTAL-CHUNKS`.

## Type Checking

Clarinet confirms that the shared `process-chunk` helper typed as
`(buff 131072)` compiles when folded over:

- `(list 32 (buff 16384))`
- `(list 8 (buff 65536))`
- `(list 4 (buff 131072))`

No profile-specific process helpers were required.

## Begin Naming

v3.1.1 adds `begin-or-resume` and keeps `begin-or-get` as a compatibility alias.
Both now return the current upload state instead of always returning
`(ok none)`.

## Read-Only Chunk Batching

v3.1.1 keeps `get-chunk-batch(id, indexes)` capped at `(list 4 uint)`.

Reason: chunks are stored in a `(buff 131072)` map. Larger optional-list read
responses would have an impractical static Clarity response shape even when a
small-profile token contains 16 KiB chunks. Resolvers should use repeated
4-index batch reads and fall back to `get-chunk`.

`get-chunk-read-batch-limit` returns `u4` so clients do not have to hard-code
the conservative read cap.

## Protocol Fee Report

Defaults used:

- staged begin fee: `100000` microSTX
- staged seal fee base: `100000` microSTX
- single-tx fee base: `100000` microSTX
- upload byte fee unit: `2000` microSTX per 16 KiB fee bucket
- extra batch fee: `100000` microSTX per logical extra batch after 50 chunks

Protocol fees below do not include mining fees.

| Payload | Chunks by profile | Staged protocol fee | Single-tx protocol fee |
|---|---:|---:|---:|
| 16 KiB | 1 / 1 / 1 | 202000 microSTX / 0.202 STX | 102000 microSTX / 0.102 STX |
| 64 KiB | 4 / 1 / 1 | 208000 microSTX / 0.208 STX | 108000 microSTX / 0.108 STX |
| 128 KiB | 8 / 2 / 1 | 216000 microSTX / 0.216 STX | 116000 microSTX / 0.116 STX |
| 512 KiB | 32 / 8 / 4 | 264000 microSTX / 0.264 STX | 164000 microSTX / 0.164 STX |

Staged examples:

| Payload | Profile | Chunks | Upload txs at 512 KiB cap | Total txs | Extra batch fee | Staged protocol fee |
|---|---|---:|---:|---:|---:|---:|
| 1 MiB | small | 64 | 2 | 4 | 100000 | 428000 microSTX / 0.428 STX |
| 1 MiB | standard | 16 | 2 | 4 | 0 | 328000 microSTX / 0.328 STX |
| 1 MiB | maximum | 8 | 2 | 4 | 0 | 328000 microSTX / 0.328 STX |
| 5 MiB | small | 320 | 10 | 12 | 600000 | 1440000 microSTX / 1.440 STX |
| 5 MiB | standard | 80 | 10 | 12 | 100000 | 940000 microSTX / 0.940 STX |
| 5 MiB | maximum | 40 | 10 | 12 | 0 | 840000 microSTX / 0.840 STX |
| 10 MiB | small | 640 | 20 | 22 | 1200000 | 2680000 microSTX / 2.680 STX |
| 10 MiB | standard | 160 | 20 | 22 | 300000 | 1780000 microSTX / 1.780 STX |
| 10 MiB | maximum | 80 | 20 | 22 | 100000 | 1580000 microSTX / 1.580 STX |

Single-tx path is capped at 512 KiB for all profiles, so 1 MiB, 5 MiB, and
10 MiB payloads are staged-only.

Mining fee practicality, using the project fee reference:

- Mining fees are separate from protocol fees.
- Recent average reference is about 0.5 STX per 440 KiB upload-sized batch.
- Approximate upload mining exposure is about 1.2 STX for 1 MiB, about 5.8 STX
  for 5 MiB, and about 11.6 STX for 10 MiB before normal transaction variance
  and begin/seal transaction mining fees.
- Do not extrapolate per-MB pricing from a 16 KiB sample; fixed begin/seal
  costs dominate tiny files.

## Clarinet Cost Report

`npm run test:report -- xtrata-v3.1.1.test.ts` ran the full Clarinet suite in
this repo setup and passed 190 tests. The generated `costs-reports.json`
contains v3.1.1 records. Highest observed v3.1.1 call costs in the hardening
tests:

| Method | Runtime | Write length | Write count | Read count |
|---|---:|---:|---:|---:|
| `mint-single-tx-small` | 33059332 | 528271 | 40 | 56 |
| `mint-single-tx-standard` | 32004096 | 525631 | 16 | 32 |
| `mint-single-tx-maximum` | 31828289 | 525191 | 12 | 28 |
| `add-chunk-batch` | 1226117 | 16947 | 3 | 10 |
| `add-chunk-batch-standard` | 4273541 | 66099 | 3 | 10 |
| `add-chunk-batch-maximum` | 8336773 | 131635 | 3 | 10 |
| `seal-inscription` | 214705 | 540 | 9 | 27 |
| `quote-inscription-fee` | 125207 | 0 | 0 | 10 |

Clarinet cost success does not prove mainnet wallet, RPC, indexer, or Explorer
practicality for 512 KiB transactions.

## Practicality Concerns

- Wallet signing: 512 KiB transaction payloads may stress browser wallet memory,
  signing UX, timeouts, and post-condition display. Test Leather/Xverse and any
  target wallet on testnet with 16/64/128 KiB chunks.
- RPC payload size: large transaction broadcasts can hit gateway body-size,
  timeout, or mempool policy limits even when Clarinet accepts them.
- Explorer display: Explorer pages may truncate large buffers, fail to decode
  events, or become slow for 512 KiB calls.
- Hiro API/indexer behavior: API ingestion can lag or omit large transaction
  event details. Confirm read-only chunk retrieval and transaction detail
  retrieval after testnet confirmation.
- Read-only response size: `get-chunk-batch` stays at 4 indexes because
  returning larger lists of optional 128 KiB buffers is not practical. Resolver
  code must not assume larger read batches for small/standard profiles.
- Clarinet limits: Clarinet accepted the typed calls and cost reports, but local
  limits are not a mainnet guarantee.
- 128 KiB chunks: maximum profile reduces chunk count but creates larger
  transaction payloads. Treat as advanced until testnet proves wallet and RPC
  reliability.

## Test Results

Commands run:

```sh
npx clarinet check
npm test -- xtrata-v3.1.1.test.ts
npm run test:report -- xtrata-v3.1.1.test.ts
npm run contracts:sync
```

Results:

- `npx clarinet check`: 32 contracts checked, warnings only.
- Focused v3.1.1 tests: 19/19 passed.
- Report run: 23 files, 190/190 tests passed.
- `contracts:sync`: v3.1.1 testnet/mainnet variants updated and in sync.

## Deployment Readiness

v3.1.1 is ready for testnet deployment and external integration testing.

Mainnet deployment should remain blocked until:

- 512 KiB single-tx mints are proven with real wallets on testnet for all three
  profile functions;
- staged 128 KiB chunk uploads are proven through wallet, RPC, mempool, Hiro API,
  Explorer, and resolver retrieval;
- the first-party app, SDK, and marketplace/resolver code are updated for
  `chunk-profile`, `chunk-size`, and `rolling-chunk-hash`;
- public docs and marketplace guidance consistently distinguish Xtrata rolling
  hash from normal file SHA-256;
- fee governance and override administration are reviewed by the deployment
  owner;
- delegated uploader UX is either explicitly deferred or implemented through a
  signed-intent/wrapper flow before it is promised to users.

Remaining risks that should block inscription/deployment:

- No live testnet proof yet for 512 KiB wallet signing and broadcast.
- No live testnet proof yet for 128 KiB chunk indexing and read-only retrieval.
- Existing production SDK/app flows still assume older 16 KiB contract behavior
  unless separately updated.
- The delegated uploader UX is not implemented in v3.1.1.
- Normal file SHA-256 is not stored in core; marketplaces that require it must
  compute it from reconstructed bytes or read it from a manifest.
