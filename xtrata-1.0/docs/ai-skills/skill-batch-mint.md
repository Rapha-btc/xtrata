---
name: xtrata-batch-mint
description: >
  Teach an AI agent to batch mint coordinated multi-file drops on Stacks via
  Xtrata. Covers the core staged upload plus `seal-inscription-batch` flow and
  the collection staged upload plus `mint-seal-batch` flow. Excludes recursive
  batch minting because the current contracts do not support it.
version: "1.0"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
---

# Xtrata Batch Mint Skill

## 1. Scope

Use this skill when the job is a coordinated drop of multiple files that should
mint in one final batch seal transaction.

Supported:
- Core path: staged uploads into Xtrata core, then `seal-inscription-batch`.
- Collection path: staged uploads into a collection mint contract, then `mint-seal-batch`.

Not supported:
- Recursive batch minting. `seal-inscription-batch` does not accept dependencies.
- Multi-file helper minting. `mint-small-single-tx` is still single-item only.

## 2. Contract Facts

| Key | Value |
|-----|-------|
| Core contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Batch seal function | `seal-inscription-batch` |
| Collection batch function | `mint-seal-batch` |
| Upload batch size | max `50` chunks per `add-chunk-batch` / `mint-add-chunk-batch` |
| Final batch size | max `50` items per `seal-inscription-batch` / `mint-seal-batch` |
| Small helper | `mint-small-single-tx` / `mint-small-single-tx-recursive` are single-item only |
| Recursive limit | batch flow is non-recursive only |

A batch job may contain small files, large files, or a mix. The critical rule is
that the final seal list is limited to `50` items and every item must be fully
uploaded before the final seal transaction is sent.

## 3. Ordered Manifest Discipline

Batch minting must start from a stable ordered manifest. The item order is not
cosmetic. It becomes the canonical mapping from request order to minted token IDs.

Recommended manifest shape:

```json
{
  "route": "core-batch-seal",
  "items": [
    { "path": "./assets/map-01.png", "mime": "image/png", "tokenUri": "ipfs://placeholder-map-01" },
    { "path": "./assets/key-01.json", "mime": "application/json", "tokenUri": "ipfs://placeholder-key-01" }
  ]
}
```

Rules:
- Keep request order stable.
- Deduplicate identical hashes before staging.
- Do not include recursive dependencies in a batch manifest.
- Do not exceed `50` items after dedupe.

## 4. Preflight and User Confirmation

Before any write:

1. Read every file.
2. Chunk each file into `16,384` byte slices.
3. Compute the incremental Xtrata hash for each file.
4. Run `get-id-by-hash` for each file and remove already-minted duplicates.
5. Fetch `get-fee-unit` from the core contract.
6. Build a deterministic execution plan.
7. Present the cost and route summary to the user.
8. Proceed only after explicit confirmation.

Example planning output:

```text
Batch Mint Plan
---------------
Route: core batch seal
Requested items: 12
New unique items: 10
Skipped duplicates: 2
Final seal tx count: 1
Upload tx count: 18

Protocol fees
-------------
Begin: per item, fee-unit each
Seal: per item, fee-unit * (1 + ceil(chunks/50))
Collection mint price: n/a
Network fees: estimated per staged tx plus one final batch seal tx
```

## 5. Route Selection

Use the core path when the batch is minting directly into Xtrata core.

Use the collection path when the batch must mint through a collection contract
that exposes:
- `mint-begin`
- `mint-add-chunk-batch`
- `mint-seal-batch`

Do not use a helper route for multi-file jobs. Even if every file is tiny, the
current helper contracts only compress one item into one transaction.

## 6. Core Batch Flow

For each item in manifest order:

1. Check duplicate state with `get-id-by-hash`.
2. Check resumable upload state with `get-upload-state(hash, owner)`.
3. If no active upload exists, call `begin-or-get` with a spend cap equal to `fee-unit`.
4. Upload all missing chunk batches with `add-chunk-batch`.
5. Wait for each upload transaction to confirm before sending the next one.

After every remaining item is fully staged:

6. Build the ordered list of `{ hash, token-uri }` items.
7. Call `seal-inscription-batch` once.
8. Verify the returned `{ start, count }` and map token IDs deterministically:
   - first manifest item -> token ID `start`
   - second manifest item -> token ID `start + 1`
   - and so on for `count` items

## 7. Collection Batch Flow

Collection batch minting adds phase accounting and mint pricing.

For each item in manifest order:

1. Check duplicate state on the core contract.
2. Ensure the collection phase allows the item to reserve a mint session.
3. Call `mint-begin` for items that do not already have an active session.
4. Resume any existing session rather than creating a parallel path.
5. Upload chunks with `mint-add-chunk-batch` until the item is complete.
6. Wait for every upload transaction to confirm.

Before the final seal:

7. Confirm `default-dependencies` is empty. `mint-seal-batch` rejects batch jobs when default dependencies are configured.
8. Sum all session `mint-price` values and include them in the economic plan.
9. Call `mint-seal-batch` once with the ordered `{ hash, token-uri }` list.
10. Verify the returned `{ start, count }` token range.

Operational warning:
- If a duplicate race is detected after collection reservations exist, stop before
  `mint-seal-batch`. Session cleanup is collection-admin controlled in many deployments,
  so silent retries can strand reservations.

## 8. Fee Model

Each item still pays the same core protocol economics as an individual mint:
- begin fee = `fee-unit`
- seal fee = `fee-unit * (1 + ceil(totalChunks / 50))`

Batching reduces the number of final seal transactions, but it does not erase the
per-item protocol fee math.

Additional collection path cost:
- total collection mint price = sum of all staged session `mint-price` values

Always separate:
- protocol fees
- collection mint price, if any
- estimated network fees

## 9. Verification and Recovery

Verification checklist:
- every staged transaction confirmed successfully
- every staged item has complete upload state before final seal
- final seal returned the expected `count`
- `get-id-by-hash` resolves each new hash to the expected token ID

Recovery rules:
- Duplicate before staging: skip the item and keep its canonical existing token ID.
- Active upload state: resume from the next missing chunk index.
- Expired or broken upload state: restart the item from `begin-or-get`.
- Duplicate race detected just before final seal: rebuild the remaining batch against fresh chain state.
- Recursive requirement discovered mid-plan: abort the batch and switch those items to individual recursive mints.

## 10. Game and Drop Patterns

This skill is useful for agents that need to place many artifacts on-chain in one
coordinated release, for example:
- hidden loot for map exploration games
- preloaded claimable NFTs
- staged item packs for puzzle unlocks
- world state assets that should mint together

The discipline is simple: ordered manifest, deterministic hashes, staged uploads,
one final batch seal, and no recursive assumptions.
