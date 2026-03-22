# BVST On-Chain Framework Bundle

This directory is the frozen BVST first-wave release bundle staged for Xtrata inscription. It already contains the exact workspace files, catalog templates, batch plans, and verification records the mint operator should use.

Use it together with:

- [`./on-chain-planning/README.md`](./on-chain-planning/README.md)
- [`./on-chain-planning/04-xtrata-inscription-workflow.md`](./on-chain-planning/04-xtrata-inscription-workflow.md)
- [`./INSCRIPTION_AUTOMATION.md`](./INSCRIPTION_AUTOMATION.md)
- [`./verification/preflight.quote.json`](./verification/preflight.quote.json)

## Current Freeze Status

Preflight was refreshed against this copied bundle on `2026-03-21`.

- `53` artifacts total
- `38` static leaves and `15` dependent catalogs
- `362,165` total bytes staged
- `0` hash, byte, chunk, or route mismatches
- `0` duplicate on-chain artifacts found during preflight
- live `get-fee-unit = 1000` microSTX (`0.001 STX`)
- exact Xtrata protocol-fee subtotal for this release: `0.159 STX`
- rough mining-fee fallback at `$1/MB`: about `$0.362165`
- predicted token planning range at quote time: `202-254`

The predicted token range is planning-only. Actual token IDs must be captured during mint execution because unrelated Xtrata mints can land between your transactions.

## What Is Included

- `workspace/`: exact staged files for runtime leaves and plugin leaves
- `catalogs/`: unresolved catalog templates that become rendered mint sources later
- `batches/`: dependency-safe execution batches
- `configs/`: token-map and network templates
- `verification/`: module index, dependency graph, readiness summaries, preflight quote, and runtime state files
- `scripts/`: verification, quote, runtime-state, rendering, and operator helper scripts

## Experimental Sampler Wave

An experimental sampler track now exists beside the frozen first-wave release:

- `workspace/Plugins/Instruments/SamplerLab/`: experimental sampler shell
- `configs/sampler-wave-selection.json`: dedicated sampler-wave scope and readiness gates
- `sampler-wave/proposed-release-plan.json`: proposed batch/catalog plan for future sampler releases
- `scripts/sampler-wave-smoke.mjs`: dedicated sampler-wave smoke runner

These files are for future sampler-wave preparation only. They are not part of the frozen `53`-artifact first-wave inscription bundle.

## Operator Commands

From the repo root:

```bash
node TASKS/BVST-on-chain-framework/scripts/verify-bundle.mjs
node TASKS/BVST-on-chain-framework/scripts/preflight-quote.mjs --out TASKS/BVST-on-chain-framework/verification/preflight.quote.json
node TASKS/BVST-on-chain-framework/scripts/init-inscription-state.mjs
node TASKS/BVST-on-chain-framework/scripts/inscription-status.mjs --out TASKS/BVST-on-chain-framework/verification/inscription-status.json
node TASKS/BVST-on-chain-framework/scripts/serve-workspace.mjs --port 8123
```

After each successful mint, record the on-chain result and refresh downstream rendered catalogs:

```bash
node TASKS/BVST-on-chain-framework/scripts/apply-inscription-result.mjs \
  --name bvst.schema.patch.v1 \
  --token-id 202 \
  --txid 0x... \
  --block-height 123456
```

## Source Rebuilds

This copied task bundle is already frozen and ready for inscription prep. It does not infer the upstream BVST source tree automatically.

If you need to regenerate the staged bundle from the original BVST repo, mount that repo separately and run:

```bash
BVST_SOURCE_ROOT=/absolute/path/to/BVST-source \
node TASKS/BVST-on-chain-framework/scripts/build-bundle.mjs
```

Without `BVST_SOURCE_ROOT`, `build-bundle.mjs` stops immediately with guidance instead of guessing the wrong paths.

## Deployment Notes

- Every artifact in the current release remains on the `helper` route, including all `15` rendered catalogs.
- Do not mint unresolved catalog templates from `catalogs/`; mint the resolved files under `rendered/` once `verification/rendered-index.json` marks them `ready`.
- `configs/token-map.runtime.json`, `verification/inscription-log.json`, and `verification/rendered-index.json` are the canonical local execution-state files for the live release.
- `verification/inscription-status.json` can be regenerated at any time to answer "what is mintable right now?" from the live token map and rendered index.
- `verification/preflight.quote.json` now carries both the rough size-based mining-fee estimate and a live network-fee estimate when the fee endpoints are reachable.
