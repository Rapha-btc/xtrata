# Inscription Automation

This runbook is for the agent or operator that will mint the staged BVST release in [`./README.md`](./README.md).

The copied bundle is already frozen. The operator should work from the staged bytes in this directory, not from an external source tree.

## Goal

Mint the `38` static leaves first, record the returned token IDs immediately, render dependent catalogs against the live token map, then mint the `15` rendered catalogs in dependency-safe order.

Never inscribe unresolved catalog templates with `null` token IDs.

## Current Release Facts

From [`verification/preflight.quote.json`](./verification/preflight.quote.json) on `2026-03-21`:

- total artifacts: `53`
- leaves: `38`
- catalogs requiring render: `15`
- total bytes: `362,165`
- live fee-unit at quote time: `0.001 STX`
- exact Xtrata protocol-fee subtotal: `0.159 STX`
- rough mining-fee fallback at `$1/MB`: about `$0.362165`
- all current artifacts remain on the `helper` route after render

The protocol fee is exact for that fee-unit snapshot. Network mining fees still depend on live mempool conditions and are only estimated until the wallet builds transactions. `verification/preflight.quote.json` now records both the rough `$1/MB` fallback and a live network-fee estimate when the fee endpoints are reachable.

## Required Files

Static release inputs:

- `batches/*.batch.json`
- `verification/module-index.json`
- `verification/preflight.quote.json`
- `configs/token-map.template.json`
- `configs/xtrata-network.template.json`

Runtime execution state:

- `configs/token-map.runtime.json`
- `verification/inscription-log.json`
- `verification/rendered-index.json`
- `verification/inscription-status.json`
- `rendered/`

## Bootstrap

Run these commands from the repo root before the first mint:

```bash
node TASKS/BVST-on-chain-framework/scripts/verify-bundle.mjs
node TASKS/BVST-on-chain-framework/scripts/preflight-quote.mjs --out TASKS/BVST-on-chain-framework/verification/preflight.quote.json
node TASKS/BVST-on-chain-framework/scripts/init-inscription-state.mjs
node TASKS/BVST-on-chain-framework/scripts/inscription-status.mjs --out TASKS/BVST-on-chain-framework/verification/inscription-status.json
```

`init-inscription-state.mjs` creates the runtime token map, inscription log, rendered index, and `rendered/` directory if they do not already exist.

## Execution Order

Process the execution batches in this order:

1. `batches/10-foundation.batch.json`
2. `batches/20-universalsynth-family.batch.json`
3. `batches/30-standalone-synths.batch.json`
4. `batches/40-root-catalogs.batch.json`

`99-master-release.batch.json` is a reference rollup only.

## Route Rules

For the current frozen release:

- every static artifact is planned on `helper`
- every rendered catalog also stays on `helper`

If `verification/rendered-index.json` ever reports `route-mismatch`, stop. That means the rendered bytes crossed a route boundary and the release plan must be re-approved before spending STX.

## Per-Artifact Loop

For each artifact in batch order:

1. Load the batch row and confirm every direct dependency is already resolved in `configs/token-map.runtime.json`.
   The generated shortcut is `verification/inscription-status.json`, refreshed by `inscription-status.mjs`.
2. Choose the mint source:
   - leaf artifact: use the batch `path`
   - catalog artifact: use the `rendered_path` from `verification/rendered-index.json`
3. Mint using the batch `route`.
4. Immediately record the live result:

```bash
node TASKS/BVST-on-chain-framework/scripts/apply-inscription-result.mjs \
  --name <artifact-name> \
  --token-id <token-id> \
  --txid <txid> \
  --block-height <block-height>
```

5. Let `apply-inscription-result.mjs` update:
   - `configs/token-map.runtime.json`
   - `verification/inscription-log.json`
   - `verification/rendered-index.json`
6. Only continue once the runtime state update succeeds.

## Rendering Rules

`scripts/render-catalogs.mjs` is the deterministic renderer behind the runtime flow.

For every ready catalog it:

1. fills embedded `{ name, token_id, txid, block_height }` objects from `configs/token-map.runtime.json`
2. preserves string references like `foundation_catalog` and adds companion fields:
   - `<field>_token_id`
   - `<field>_txid`
   - `<field>_block_height`
3. adds top-level execution metadata:
   - `dependency_token_ids`
   - `resolved_dependency_names`
   - `resolved_at`
   - `resolved_from`
4. writes the resolved mint source under `rendered/`
5. records the rendered hash, bytes, chunks, route, and dependency signature in `verification/rendered-index.json`

Rendered catalog files are keyed to a dependency-resolution signature. If nothing relevant changed, rerunning the renderer preserves the same bytes instead of rewriting `resolved_at`.

## Resume Rules

The release state is restart-safe:

- if a token-map entry already has the same `token_id`, `txid`, and `block_height`, recording it again is idempotent
- if a token-map entry already has different on-chain data, stop
- if an inscribed catalog’s dependency signature changes, stop
- if a catalog is still `pending` in `verification/rendered-index.json`, do not mint it

## Hard Stops

Stop the release immediately if any of these occur:

- unresolved dependency token in `configs/token-map.runtime.json`
- `route-mismatch` in `verification/rendered-index.json`
- unresolved rendered companion fields or `null` token IDs
- local hash drift caught by `verify-bundle.mjs`
- attempt to overwrite an existing token-map entry with a different on-chain record
- inscribed catalog dependency drift

Do not continue best-effort after a broken dependency edge.

## Completion

The release is complete only when:

- all `53` artifacts are recorded in `verification/inscription-log.json`
- `configs/token-map.runtime.json` has no remaining `null` entries
- `verification/rendered-index.json` shows all `15` catalogs as rendered and recorded
- final token IDs are committed back into the release records
