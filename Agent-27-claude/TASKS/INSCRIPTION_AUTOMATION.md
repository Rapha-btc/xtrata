# Inscription Automation

This document is for an agent that can call Xtrata inscription functions and maintain local release state while publishing the staged BVST bundle in [`on-chain-modules/`](./README.md).

Use it together with:

- `on-chain-modules/batches/*.batch.json`
- `on-chain-modules/configs/token-map.template.json`
- `on-chain-modules/configs/xtrata-network.template.json`
- `on-chain-modules/verification/module-index.json`
- `on-chain-planning/04-xtrata-inscription-workflow.md`

## Goal

Publish leaf modules first, record the returned on-chain IDs, then render dependent catalogs with exact token references before inscribing them.

Do not inscribe unresolved catalog templates with `null` token IDs.

## Required Local State

Before the first transaction, create working copies:

- `on-chain-modules/configs/token-map.runtime.json`
- `on-chain-modules/verification/inscription-log.json`
- `on-chain-modules/rendered/`

Initialize `token-map.runtime.json` from `token-map.template.json`.

## Batch Order

Process these files in order:

1. `batches/10-foundation.batch.json`
2. `batches/20-universalsynth-family.batch.json`
3. `batches/30-standalone-synths.batch.json`
4. `batches/40-root-catalogs.batch.json`

`99-master-release.batch.json` is a full reference view, not the preferred execution order.

## Core Rules

1. Rebuild and verify before inscription.
   - `node on-chain-modules/scripts/build-bundle.mjs`
   - `node on-chain-modules/scripts/verify-bundle.mjs`
2. Never mint an artifact until every `depends_on` name in its batch row has a resolved `token_id`.
3. Use the artifact `route` from the batch file.
   - `helper` -> `mint-small-single-tx-recursive`
   - `staged` -> `begin-or-get`, `add-chunk-batch`, `seal-recursive`
4. After every successful mint, update `token-map.runtime.json` immediately.
5. Verify reconstructed chain bytes against local bytes before advancing to dependents.
6. If an exact `sha256` is already known on-chain, record the existing token and skip re-upload.

## Per-Artifact Loop

For each batch artifact, run this sequence:

1. Load the artifact row from the batch JSON.
2. Resolve `dependency_token_ids` by reading `token-map.runtime.json` for every name in `depends_on`.
3. If any dependency is missing, stop and defer the artifact.
4. Decide the source bytes:
   - Leaf modules: use `artifact.path` directly.
   - Catalogs under `on-chain-modules/catalogs/`: render a resolved copy first.
5. Mint the artifact with the resolved dependency IDs.
6. Record:
   - `name`
   - `sha256`
   - `token_id`
   - `txid`
   - `block_height`
   - `route`
   - `dependency_token_ids`
   - `local_source_path`
   - `rendered_path` if used
7. Reconstruct bytes from chain or indexer output and compare to the local source bytes.
8. Only then continue to the next artifact.

## Catalog Rendering Rules

Before minting a catalog JSON, write a rendered copy under `on-chain-modules/rendered/`.

Apply these rules:

1. Replace every embedded object with `token_id: null` using values from `token-map.runtime.json`.
2. For string catalog references like `foundation_catalog`, `runtime_major_catalog`, `engine_major_catalog`, `schema_major_catalog`, and `first_wave_catalog`, keep the original name string and add companion fields:
   - `<field>_token_id`
   - `<field>_txid`
   - `<field>_block_height`
3. Add:
   - `dependency_token_ids`
   - `resolved_at`
   - `resolved_from` set to `configs/token-map.runtime.json`
4. Mint the rendered copy, not the unresolved source file.

## Resume Behavior

The agent must be restart-safe:

- If `token-map.runtime.json` already contains a `token_id` for the same `name` and `sha256`, skip reminting.
- If the name exists but the hash differs, stop. That means the local bundle changed and the release must be rebuilt.
- If a staged upload session exists, resume it instead of starting a new one.

## Failure Rules

Stop the batch if any of these occur:

- dependency token missing
- local hash mismatch
- reconstructed byte mismatch
- returned token mapped to the wrong artifact name
- catalog rendered with unresolved `null` token IDs

Do not continue “best effort” after a broken dependency edge.

## Recommended Agent Pseudocode

```text
build bundle
verify bundle
copy token-map.template.json -> token-map.runtime.json

for batch in ordered_batches:
  for artifact in batch.artifacts by order:
    if already_recorded_with_same_hash(artifact): continue
    dependency_ids = resolve_dep_ids(artifact.depends_on)
    source = render_catalog_if_needed(artifact, dependency_ids, token_map)
    result = inscribe(source, artifact.route, dependency_ids)
    verify_chain_bytes(result, source)
    update_token_map(artifact.name, result)
    append_inscription_log(artifact.name, result, dependency_ids, source)
```

## Completion

The release is complete only when:

- all four execution batches are finished
- `token-map.runtime.json` has no remaining `null` entries for published modules
- rendered catalogs were the versions actually inscribed
- verification passed for every minted artifact
- final token IDs are committed back into repo release records
