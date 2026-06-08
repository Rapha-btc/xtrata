Xtrata v3 Migration Reference

Purpose

This document defines the expected migration paths from legacy Xtrata cores into
`v3`, so there is a durable reference for how old inscriptions become usable in
the v3 line.

It is written as an operational and implementation reference.

What migration is for

Migration is needed when a legacy inscription should:
- be represented in the v3 NFT line
- use the v3 fee / admin / single-tx model
- become eligible to participate in v3 parent-child relationships
- keep continuity of token ID and provenance

The intended rule is:
- migrated inscriptions keep the same token ID
- the legacy token is escrowed into the new core contract
- the v3 token becomes the active canonical representation for future v3 use

Current repo state

The currently checked-in legacy contracts show:
- `xtrata-v2.1.0` has `migrate-from-v1`, and it migrates from `xtrata-v1.1.1`
- `xtrata-v2.1.1` has `migrate-from-v1`, and it migrates from `xtrata-v1.1.1`
- the legacy contracts expose the data needed for same-ID migration:
  - `get-inscription-meta`
  - `get-token-uri-raw`
  - `get-dependencies`
  - `transfer`

Relevant source references:
- `contracts/live/xtrata-v1.1.1.clar`
- `contracts/live/xtrata-v2.1.0.clar`
- `contracts/live/xtrata-v2.1.1.clar`

Migration matrix

Required supported routes for v3:

| Source contract | Direct route into v3 | Required? | Notes |
|---|---|---|---|
| `xtrata-v1.1.1` | `migrate-from-v1` or `migrate-from-v1-1-1` | Yes | This is the proven legacy source already used by v2. |
| `xtrata-v2.1.0` | `migrate-from-v2-1-0` | Yes | Needed for the current main v2 line. |
| `xtrata-v2.1.1` | `migrate-from-v2-1-1` | Yes | Needed if `v2.1.1` is used as an upgrade line before v3. |
| `xtrata-v1.1.0` | `migrate-from-v1-1-0` or explicitly unsupported | Conditional | Add direct support if any real user inscriptions still exist in that line. Otherwise document that it is non-live / not in scope. |

Important rule:
- Do not assume `v1` means all `v1.x` contracts are automatically covered.
- If `v1.1.0` matters in production, it needs its own explicit route or an
  explicitly documented intermediate path.

Recommended v3 migration contract behavior

Every migration function should follow the same shape:

1. Read legacy state from the source contract.
2. Require the caller to currently own the legacy token.
3. Charge the configured migration fee policy, if any.
4. Transfer the legacy token into the v3 contract.
5. Mint the v3 token to the caller with the same token ID.
6. Copy the compatible legacy metadata into v3 storage.
7. Record migration provenance on-chain.
8. Advance `next-id` if the migrated ID is at or above the current mint cursor.

Data that must be copied

Minimum copied fields:
- `creator`
- `mime-type`
- `total-size`
- `total-chunks`
- `sealed`
- `final-hash`
- `token-uri` when present
- `dependencies`

Data that should also be recorded in v3:
- `source-contract`
- `source-id`

Data that cannot be migrated 1:1 from v1 / v2

v3 is expected to separate:
- dependencies
- parent-child relationships

Legacy contracts only have dependency-style composition. They do not have a
separate parent registry compatible with the proposed v3 model.

So the correct posture is:
- copy legacy dependencies as dependencies
- do not invent parent relationships during migration
- after migration, the migrated inscription may be used as a v3 parent for new
  children created in v3

That means migrated legacy items become parent-eligible in v3, but they do not
retroactively gain child edges unless new v3 children are created against them.

Same-ID continuity rules

To avoid collisions:
- migration must mint the new token using the legacy token ID
- the v3 contract must update `next-id` when a migrated token ID is greater
  than or equal to the current mint cursor
- fresh v3 mints must continue from the highest occupied ID + 1

Without this rule, a migrated token can collide with the next newly minted v3
token.

Same-ID migration cannot preserve two different legacy tokens with the same
numeric ID from different source contracts in one destination NFT space. For
example, if `xtrata-v2.1.0` token `u5` and `xtrata-v2.1.1` token `u5` are both
real, only one can become v3 token `u5`; the second migration must fail with
the destination duplicate guard and leave the legacy token with its current
owner. This is expected safe-fail behavior, not partial migration. Support and
holder-facing materials must describe any overlapping legacy ID ranges before
promising same-ID migration for all sources.

Escrow rule

Legacy tokens should be escrowed in the destination contract, not burned.

Why:
- preserves provenance
- proves the migration happened
- prevents two active freely tradable representations of the same token in
  separate cores

Canonical user flow

For a holder migrating a single inscription:

1. User connects the wallet that owns the legacy inscription.
2. App detects the inscription's source contract.
3. App selects the correct migration entrypoint for that contract.
4. User approves one migration transaction.
5. v3 contract pulls the legacy token into escrow and mints the v3 token back to
   the user.
6. App confirms:
- legacy token owner is now the v3 contract
- v3 token owner is the user
- migration source record exists

Recommended app-side route resolution

App logic should resolve migration source by contract ID:
- `xtrata-v1.1.1` -> `migrate-from-v1`
- `xtrata-v2.1.0` -> `migrate-from-v2-1-0`
- `xtrata-v2.1.1` -> `migrate-from-v2-1-1`
- `xtrata-v1.1.0` -> only if explicit support exists

If no route exists:
- show a hard stop
- do not silently attempt the wrong migrator

Operational checklist before v3 launch

Before announcing migration:
- confirm which legacy contracts are actually live
- inventory occupied ID ranges across every migratable legacy contract and
  identify any numeric overlaps that cannot all preserve same-ID continuity
- decide whether `v1.1.0` needs support
- set the initial v3 mint cursor / offset before any fresh mint
- verify every supported source has a dedicated migrator
- test same-ID migration for each source line
- test post-migration minting to confirm no ID collision
- test that migrated items can be used as parents in v3

Test checklist

Every supported source line should have tests for:
- successful migration by the current owner
- rejection when the caller does not own the source token
- rejection when the source token does not exist
- rejection when the destination ID is already occupied
- copying of metadata and token URI
- copying of dependencies
- recording of migration provenance
- `next-id` advancing correctly after migration
- subsequent fresh mint using the next free ID

Decision on `v1.1.0`

This is the one legacy ambiguity that must be resolved explicitly.

If `xtrata-v1.1.0` was ever used for real user inscriptions, add a direct v3
migrator for it.

If it was only a development or superseded line, document it as unsupported and
do not claim "all v1 inscriptions can migrate" without that qualifier.

Recommended policy statement

The clean policy for v3 is:
- All live user-facing `v1.1.1`, `v2.1.0`, and `v2.1.1` inscriptions must have
  a direct same-ID migration path into v3.
- `v1.1.0` must either:
  - gain a direct migrator, or
  - be explicitly declared non-live / unsupported in migration materials.

That is the minimum needed to honestly say every relevant inscription has a
migration route if necessary.
