---
name: xtrata-batch-mint
description: >
  Use this skill when an agent needs to mint 2-50 Xtrata items in one
  coordinated drop, especially for game assets, hidden loot, claimable NFTs,
  or preloaded inventory. Covers the supported batch-seal workflows on Xtrata,
  the collection-mint contract variant, and the current hard limits: batch
  recursive minting is not supported, and small-file single-tx minting only
  exists per item, not for a whole 50-item batch.
---

# Xtrata Batch Mint

Use this skill when the job is "mint many files as one drop" rather than
"mint one file."

## Supported Paths

1. Core Xtrata batch seal
- Stage each file on `xtrata-v2-1-0`.
- Upload all chunks for each file.
- Finish with one `seal-inscription-batch` call for up to 50 ready items.

2. Collection-contract batch mint
- Use a deployed `xtrata-collection-*` contract.
- Stage each file with `mint-begin` and `mint-add-chunk-batch`.
- Finish with one `mint-seal-batch` call for up to 50 ready items.

## Unsupported Assumptions

- There is no multi-file "small helper batch" today.
- `mint-small-single-tx` and `mint-small-single-tx-recursive` are single-item only.
- Batch recursive minting is not supported.
- If a file needs dependencies, remove it from the batch and mint it separately.

## Decision Rules

1. If any item needs dependencies, do not put it in a batch seal.
2. If the goal is up to 50 non-recursive items, use batch seal.
3. If a collection contract exists and the drop belongs to that collection, use the collection path.
4. If there is no collection contract, use core Xtrata staged uploads plus `seal-inscription-batch`.
5. If a file is tiny, that only changes per-item convenience; it does not create a 50-file single-tx path.

## Workflow

1. Read up to 50 files and build a stable ordered item list.
2. For each file:
- chunk to 16,384 bytes
- compute expected hash
- record MIME type and token URI
- run dedupe check by hash
3. Split into:
- duplicates to skip or reuse
- new items to upload
4. For each new item, stage the upload:
- core path: `begin-or-get` or `begin-inscription`, then `add-chunk-batch`
- collection path: `mint-begin`, then `mint-add-chunk-batch`
5. Wait until every new item is fully uploaded.
6. Build the batch seal list in the exact mint order:
- `{ hash, token-uri }[]`
7. Seal once:
- core path: `seal-inscription-batch`
- collection path: `mint-seal-batch`
8. Map the returned `{ start, count }` range back onto the ordered input list.
9. Report:
- minted token IDs
- duplicates reused
- skipped recursive items
- txids and total spend

## Safety Rules

- Keep batch size at `1..50` items.
- Do not mix recursive and non-recursive expectations in one batch.
- Do not batch-seal until every item in the batch has a valid upload session with all chunks present.
- Preserve item ordering from the batch input list so token ID mapping is deterministic.
- Use the SDK for chunk-buffer writes.

## Game-Making Guidance

This skill is suitable for:

- hidden loot drops
- claimable artifact sets
- pre-minted room rewards
- seasonal batch releases

If a game needs one recursive "world parent" plus many child artifacts, mint the
child artifacts in a non-recursive batch first, then mint the recursive parent
separately once the child token IDs exist.

## References

Read [references/batch-mint-paths.md](references/batch-mint-paths.md) when you need:

- exact contract functions
- SDK builder names
- current protocol limits
- route-selection constraints

Use [scripts/xtrata-batch-mint.cjs](scripts/xtrata-batch-mint.cjs) when you want
the deterministic manifest-driven runner rather than ad hoc transaction
construction.

Use these starter manifests when you want a concrete shape immediately:

- [assets/drop.core.example.json](assets/drop.core.example.json)
- [assets/drop.collection.example.json](assets/drop.collection.example.json)
