# Xtrata Inscription Workflow

This is the concrete execution workflow for the frozen BVST bundle in [`../README.md`](../README.md).

## Release Snapshot

Live preflight for this copied bundle was run on `2026-03-21`.

- artifacts: `53`
- static leaves: `38`
- rendered catalogs: `15`
- total bytes: `362,165`
- live `get-fee-unit`: `1000` microSTX (`0.001 STX`)
- exact Xtrata protocol-fee subtotal: `0.159 STX`
- rough mining-fee fallback at `$1/MB`: about `$0.362165`
- predicted token planning range at quote time: `202-254`

The predicted token range is only a planning aid. Actual IDs must come from the live mint results recorded during execution.

## Batch Structure

| Batch | Total | Leaves | Catalogs | Notes |
| --- | --- | --- | --- | --- |
| `10-foundation.batch.json` | 21 | 17 | 4 | shared runtime, engine, schema, then foundation catalogs |
| `20-universalsynth-family.batch.json` | 13 | 9 | 4 | three UniversalSynth-family plugin leaves, then family catalogs |
| `30-standalone-synths.batch.json` | 17 | 12 | 5 | four standalone synth leaves, then family catalogs |
| `40-root-catalogs.batch.json` | 2 | 0 | 2 | release rollup and root catalog |

Total: `53` artifacts = `38` leaves + `15` catalogs.

## Operator Commands

Run from the repo root:

```bash
node TASKS/BVST-on-chain-framework/scripts/verify-bundle.mjs
node TASKS/BVST-on-chain-framework/scripts/preflight-quote.mjs --out TASKS/BVST-on-chain-framework/verification/preflight.quote.json
node TASKS/BVST-on-chain-framework/scripts/init-inscription-state.mjs
node TASKS/BVST-on-chain-framework/scripts/inscription-status.mjs --out TASKS/BVST-on-chain-framework/verification/inscription-status.json
```

Optional local smoke server:

```bash
node TASKS/BVST-on-chain-framework/scripts/serve-workspace.mjs --port 8123
```

If the upstream BVST source repo is mounted separately and you need to regenerate this bundle before execution:

```bash
BVST_SOURCE_ROOT=/absolute/path/to/BVST-source \
node TASKS/BVST-on-chain-framework/scripts/build-bundle.mjs
```

## Route Selection

For this frozen release:

- every artifact is planned on the `helper` route
- rendered catalogs were preflighted and still remain on `helper`

That means the live route decision is simple: use the batch row route unless `verification/rendered-index.json` reports `route-mismatch`. If it does, stop and re-approve the plan.

## Actual Execution Loop

### 1. Verify the staged bytes

- run `verify-bundle.mjs`
- do not sign anything if it reports a hash, byte, chunk, MIME, or dependency mismatch

### 2. Refresh the quote

- run `preflight-quote.mjs`
- treat the fee-unit and token-range output as a fresh planning snapshot, not a commitment

### 3. Initialize runtime state

- run `init-inscription-state.mjs`
- this creates:
  - `configs/token-map.runtime.json`
  - `verification/inscription-log.json`
  - `verification/rendered-index.json`
  - `rendered/`

### 4. Mint all leaves first

Mint the static leaf artifacts in batch order. These are the only sources that can be inscribed directly from the staged `workspace/` files.

Use `inscription-status.mjs` before every wallet action. It resolves the current next-ready artifact, the exact source path, the dependency token IDs to pass recursively, and the post-mint `apply-inscription-result.mjs` command template.

After every successful mint, record the result immediately:

```bash
node TASKS/BVST-on-chain-framework/scripts/apply-inscription-result.mjs \
  --name <artifact-name> \
  --token-id <token-id> \
  --txid <txid> \
  --block-height <block-height>
```

That command updates the runtime token map, appends the inscription log, and refreshes rendered catalog readiness.

### 5. Mint rendered catalogs only when ready

Use `verification/rendered-index.json` as the catalog control plane.

For a catalog to be mintable it must have:

- `status = "ready"`
- a non-null `rendered_path`
- `route_matches_expected = true`
- no `unresolved_paths`

Mint the resolved file at `rendered_path`, not the template under `catalogs/`.

### 6. Repeat until all batches are complete

Progression should look like this:

1. foundation leaves recorded
2. runtime, engine, and schema major catalogs become ready
3. foundation catalog becomes ready
4. plugin leaves recorded
5. plugin release catalogs become ready
6. family catalogs become ready
7. first-wave release catalog becomes ready
8. root catalog becomes ready

## Runtime Files That Matter

- `configs/token-map.runtime.json`: canonical live token ID state
- `verification/inscription-log.json`: append-only release evidence
- `verification/rendered-index.json`: readiness, rendered hashes, and direct dependency token IDs for catalogs
- `verification/inscription-status.json`: current ready queue, next artifact, and hard-stop diagnostics
- `rendered/`: actual catalog mint sources

## Hard Stops

Stop immediately if any of these happen:

- `verify-bundle.mjs` reports drift
- a dependency token is missing from `configs/token-map.runtime.json`
- a catalog remains `pending`
- a rendered catalog reports `route-mismatch`
- a rendered catalog contains unresolved token fields
- an existing token-map entry would be overwritten with different on-chain data
- an inscribed catalog’s dependency signature changes

## Release Completion

The release is complete only when:

- all `53` artifacts appear in `verification/inscription-log.json`
- all `15` catalogs were minted from `rendered/`
- `configs/token-map.runtime.json` contains the final live token IDs for every artifact
- the final release records are committed back into this repo
