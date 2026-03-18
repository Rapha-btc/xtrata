# Batch Mint Paths

## What Exists Today

### Core Xtrata batch seal

Contract:

```text
SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
```

Write path:

1. `begin-or-get(expected-hash, mime, total-size, total-chunks)` or `begin-inscription(...)`
2. `add-chunk-batch(hash, chunks)` one or more times
3. `seal-inscription-batch(items)` where `items` is `(list 50 { hash, token-uri })`

SDK builders available in `xtrata-1.0/packages/xtrata-sdk/src/client.ts`:

- `buildBeginInscriptionCall`
- `buildAddChunkBatchCall`
- `buildSealInscriptionBatchCall`

Notes:

- Batch seal mints a contiguous token ID range.
- The input list order is the mint order.
- Each item still pays its own seal fee; the batch call sums them.

### Collection-contract batch mint

Contract family:

```text
xtrata-collection-*
```

Template capabilities verified from `xtrata-collection-mint-v1.4`:

- `mint-begin`
- `mint-add-chunk-batch`
- `mint-seal`
- `mint-seal-batch`
- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

SDK builders:

- `buildCollectionMintBeginCall`
- `buildCollectionMintAddChunkBatchCall`
- `buildCollectionMintSealBatchCall`

Use this path when the drop is managed by a collection contract and you want
the collection's mint-price / allowlist / phase rules to apply.

### Small helper

Contract:

```text
SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0
```

Functions:

- `mint-small-single-tx`
- `mint-small-single-tx-recursive`

Limit:

- one item per call
- up to 30 chunks for that item

This helper is useful for a single small file. It is not a 50-item batch path.

## Hard Limits

- Max items in a batch seal: `50`
- Max chunks in `add-chunk-batch`: `50`
- Max chunks in small helper: `30`
- Max chunk size: `16,384` bytes

## Hard Constraints

### No batch recursive minting

Current Xtrata docs explicitly state that `seal-inscription-batch` does not
support dependencies. Do not attempt to batch mint recursive items.

Practical rule:

- non-recursive items -> batch path allowed
- recursive items -> mint separately with `seal-recursive` or per-item helper recursive call

### No multi-file small-helper batch

There is currently no helper that takes a list of files and mints all of them
in one contract call. "All files are small" does not change this.

Your options are:

1. per-item small helper calls
2. staged uploads per item + one final batch seal

## Recommended Agent Output

When using this skill, return a structured summary:

```json
{
  "route": "core-batch-seal or collection-batch-seal",
  "requestedCount": 12,
  "mintedCount": 10,
  "duplicateCount": 2,
  "skippedRecursiveCount": 0,
  "txids": ["0x..."],
  "tokenIds": [4001, 4002, 4003]
}
```

## Good Fits for Game Agents

- pre-minting clue items
- placing hidden collectibles
- preparing claimable inventory pools
- releasing themed sets in one deterministic batch

If game logic needs a parent object with dependencies, batch mint the plain
assets first and mint the parent later as a separate recursive inscription.

## Local Runner

This repo now includes a deterministic manifest-driven runner:

```text
skills/xtrata-batch-mint/scripts/xtrata-batch-mint.cjs
```

It enforces the same rules as this reference:

- max 50 requested items
- no recursive batch minting
- no multi-file small-helper path
- stable input ordering for token ID mapping

Useful companion assets:

- `skills/xtrata-batch-mint/assets/drop.core.example.json`
- `skills/xtrata-batch-mint/assets/drop.collection.example.json`

You can also print a fresh template directly:

```bash
node skills/xtrata-batch-mint/scripts/xtrata-batch-mint.cjs --print-template core
node skills/xtrata-batch-mint/scripts/xtrata-batch-mint.cjs --print-template collection
```
